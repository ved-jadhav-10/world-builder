import L from 'leaflet';
import {
  clusterPins,
  FEATURE_POINT_LIMITS,
  type EntityType,
  type MapFeature,
  type MapPoint,
} from '@atlas/shared';
import { LINE_WEIGHT, pinElement, resolveStyle, textLabelElement } from '@/lib/map-style';

/*
 * Leaflet's "simple" coordinate system puts the map's top-left corner at (0, 0) with y growing
 * upward, and one unit is one pixel of the full-size image at zoom 0. Features are stored as
 * fractions of the map's size, so these two functions are the only place the two meet.
 */

export interface MapSize {
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const project = ([x, y]: MapPoint, size: MapSize) =>
  L.latLng(-y * size.height, x * size.width);

export const unproject = (latlng: L.LatLng, size: MapSize): MapPoint => [
  clamp01(latlng.lng / size.width),
  clamp01(-latlng.lat / size.height),
];

export const isInsideMap = (latlng: L.LatLng, size: MapSize) =>
  latlng.lng >= 0 && latlng.lng <= size.width && latlng.lat <= 0 && latlng.lat >= -size.height;

export interface FeatureHandlers {
  select: (id: string) => void;
  open: (mapId: string) => void;
  move: (id: string, points: MapPoint[]) => void;
}

/** Lines (paths) and areas (regions) share the calls used to draw and reshape them. */
type Shape = L.Polyline | L.Polygon;

export interface FeatureEntry {
  feature: MapFeature;
  layer: L.Layer;
  /** The drawn lines or areas, for live reshaping while a handle is dragged. */
  shapes: Shape[];
}

export interface MapView {
  map: L.Map;
  size: MapSize;
  /** The zoom at which the whole map fits the screen; "show from" levels count up from here. */
  fitZoom: number;
  featureLayer: L.LayerGroup;
  handleLayer: L.LayerGroup;
  draftLayer: L.LayerGroup;
  /** The round "5 places" markers that stand in for pins too close together. */
  clusterLayer: L.LayerGroup;
  entries: FeatureEntry[];
  /** Layers switched off; what is on them is not drawn. */
  hiddenLayers: Set<string>;
  /** Whether clusters take clicks (off while a drawing tool is active). */
  interactive: boolean;
  /** The line from the last point drawn to the cursor. */
  rubber: L.Polyline | null;
}

interface BuildOptions {
  view: MapView;
  typeById: Map<string, EntityType>;
  selected: boolean;
  /** Whether the item takes clicks (off while a drawing tool is active). */
  interactive: boolean;
  /** Whether the selected item can be dragged and reshaped. */
  editable: boolean;
  handlers: FeatureHandlers;
}

function dashFor(lineStyle: MapFeature['lineStyle'], weight: number): string | undefined {
  if (lineStyle === 'dashed') return `${weight * 2.5} ${weight * 2}`;
  if (lineStyle === 'dotted') return `1 ${weight * 2}`;
  return undefined;
}

/** The index to insert a new point at, given a double-click near the line. */
function insertionIndex(map: L.Map, latlngs: L.LatLng[], closed: boolean, at: L.LatLng): number {
  const click = map.latLngToLayerPoint(at);
  const count = closed ? latlngs.length : latlngs.length - 1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < count; i++) {
    const a = map.latLngToLayerPoint(latlngs[i]!);
    const b = map.latLngToLayerPoint(latlngs[(i + 1) % latlngs.length]!);
    const distance = L.LineUtil.pointToSegmentDistance(click, a, b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best + 1;
}

/** Builds the Leaflet layer for one feature. */
export function buildFeature(feature: MapFeature, opts: BuildOptions): FeatureEntry {
  const { view, typeById, selected, interactive, editable, handlers } = opts;
  const style = resolveStyle(feature, typeById);
  const latlngs = feature.points.map((p) => project(p, view.size));

  if (feature.kind === 'pin' || feature.kind === 'label') {
    const options = { interactive, draggable: editable && selected, bubblingMouseEvents: false };
    let marker: L.Marker;
    if (feature.kind === 'pin') {
      const { element, px } = pinElement({
        name: style.name,
        color: style.color,
        icon: style.icon,
        size: feature.size,
        selected,
      });
      marker = L.marker(latlngs[0]!, {
        ...options,
        keyboard: false,
        icon: L.divIcon({
          className: 'atlas-pin-wrap',
          html: element,
          iconSize: [px, px],
          iconAnchor: [px / 2, px / 2],
        }),
      });
    } else {
      marker = L.marker(latlngs[0]!, {
        ...options,
        keyboard: false,
        icon: L.divIcon({
          className: 'atlas-text-wrap',
          html: textLabelElement({
            text: style.name,
            color: style.color,
            size: feature.size,
            selected,
          }),
          iconSize: [0, 0],
        }),
      });
    }
    marker.on('click', () => handlers.select(feature.id));
    marker.on('dblclick', () => {
      if (feature.linkMapId) handlers.open(feature.linkMapId);
    });
    marker.on('dragend', () =>
      handlers.move(feature.id, [unproject(marker.getLatLng(), view.size)]),
    );
    return { feature, layer: marker, shapes: [] };
  }

  const closed = feature.kind === 'region';
  const weight = closed ? Math.max(2, LINE_WEIGHT[feature.size] - 1) : LINE_WEIGHT[feature.size];
  const shapeOptions: L.PolylineOptions = {
    color: style.color,
    weight: selected ? weight + 1 : weight,
    dashArray: dashFor(feature.lineStyle, weight),
    lineCap: 'round',
    lineJoin: 'round',
    interactive,
    bubblingMouseEvents: false,
  };
  const shape = closed
    ? L.polygon(latlngs, {
        ...shapeOptions,
        fillColor: style.color,
        fillOpacity: selected ? 0.32 : 0.18,
      })
    : L.polyline(latlngs, shapeOptions);
  if (style.name) {
    shape.bindTooltip(style.name, {
      permanent: true,
      direction: 'center',
      className: 'atlas-tooltip',
    });
  }

  const parts: L.Layer[] = [];
  const shapes: Shape[] = [shape];
  // A pale outline marks the selection; a fat invisible line makes thin roads easy to hit.
  if (selected) {
    const haloOptions: L.PolylineOptions = {
      color: '#fff',
      weight: weight + 6,
      opacity: 0.9,
      fill: false,
      interactive: false,
    };
    const halo = closed ? L.polygon(latlngs, haloOptions) : L.polyline(latlngs, haloOptions);
    parts.push(halo);
    shapes.push(halo);
  }
  parts.push(shape);
  const hitTargets: Shape[] = [shape];
  if (!closed) {
    const hit = L.polyline(latlngs, {
      weight: 18,
      opacity: 0,
      interactive,
      bubblingMouseEvents: false,
    });
    parts.push(hit);
    shapes.push(hit);
    hitTargets.push(hit);
  }
  for (const target of hitTargets) {
    target.on('click', () => handlers.select(feature.id));
    target.on('dblclick', (event: L.LeafletMouseEvent) => {
      L.DomEvent.stop(event.originalEvent);
      if (editable && selected) {
        const index = insertionIndex(view.map, latlngs, closed, event.latlng);
        const next = feature.points.slice();
        next.splice(index, 0, unproject(event.latlng, view.size));
        if (next.length <= FEATURE_POINT_LIMITS[feature.kind].max) handlers.move(feature.id, next);
      } else if (feature.linkMapId) {
        handlers.open(feature.linkMapId);
      }
    });
  }
  return { feature, layer: L.featureGroup(parts), shapes };
}

/** Square handles at each corner of the selected path or region. */
export function buildHandles(
  entry: FeatureEntry,
  view: MapView,
  handlers: FeatureHandlers,
): L.Marker[] {
  const { feature, shapes } = entry;
  const min = FEATURE_POINT_LIMITS[feature.kind].min;
  const latlngs = feature.points.map((p) => project(p, view.size));
  return latlngs.map((start, index) => {
    const marker = L.marker(start, {
      draggable: true,
      keyboard: false,
      bubblingMouseEvents: false,
      zIndexOffset: 1000,
      icon: L.divIcon({ className: 'atlas-handle', iconSize: [12, 12] }),
    });
    marker.on('drag', () => {
      latlngs[index] = marker.getLatLng();
      for (const shape of shapes) shape.setLatLngs(latlngs);
    });
    marker.on('dragend', () =>
      handlers.move(
        feature.id,
        latlngs.map((p) => unproject(p, view.size)),
      ),
    );
    // Right-click (or long-press) removes a corner, down to the fewest the shape needs.
    marker.on('contextmenu', (event: L.LeafletMouseEvent) => {
      L.DomEvent.preventDefault(event.originalEvent);
      if (feature.points.length > min) {
        handlers.move(
          feature.id,
          feature.points.filter((_, i) => i !== index),
        );
      }
    });
    return marker;
  });
}

/** Pins closer than this many screen pixels are shown as one numbered marker. */
const CLUSTER_RADIUS_PX = 34;

const clusterName = (feature: MapFeature) => feature.label || feature.entity?.name || 'Unnamed pin';

function clusterMarker(view: MapView, members: FeatureEntry[], point: MapPoint): L.Marker {
  const count = members.length;
  const marker = L.marker(project(point, view.size), {
    interactive: view.interactive,
    keyboard: false,
    bubblingMouseEvents: false,
    zIndexOffset: 500,
    icon: L.divIcon({
      className: 'atlas-cluster-wrap',
      html: `<div class="atlas-cluster" role="img" aria-label="${count} places close together">${count}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    }),
  });
  const names = members.map((m) => clusterName(m.feature));
  const shown = names.slice(0, 6).map((n) => n.replace(/[<>&]/g, ''));
  const more = names.length > shown.length ? `, and ${names.length - shown.length} more` : '';
  marker.bindTooltip(shown.join(', ') + more, { direction: 'top', offset: [0, -14] });
  marker.on('click', () => {
    const bounds = L.latLngBounds(members.map((m) => (m.layer as L.Marker).getLatLng()));
    // Pins on nearly the same spot only part at the deepest zoom, where nothing clusters.
    view.map.fitBounds(bounds, { padding: [90, 90], maxZoom: view.map.getMaxZoom() });
  });
  return marker;
}

/**
 * Decides what is drawn: each feature only once the map is zoomed in far enough, and not when
 * its layer is off; the selected one always shows. Pins that would overlap become one cluster.
 */
export function syncVisibility(view: MapView, selectedId: string | null) {
  const zoom = view.map.getZoom();
  const wanted = new Set<L.Layer>();
  const pins: FeatureEntry[] = [];
  for (const entry of view.entries) {
    const { feature } = entry;
    const layerOff = feature.layerId !== null && view.hiddenLayers.has(feature.layerId);
    const show =
      feature.id === selectedId || (!layerOff && zoom >= view.fitZoom + feature.minZoom - 0.01);
    if (!show) continue;
    if (feature.kind === 'pin') pins.push(entry);
    else wanted.add(entry.layer);
  }

  view.clusterLayer.clearLayers();
  // At the deepest zoom nothing separates further, so every pin is shown as itself.
  const canCluster = zoom < view.map.getMaxZoom() - 0.01;
  const scale = 2 ** zoom;
  const clusters = canCluster
    ? clusterPins(
        pins.map((entry) => ({ id: entry.feature.id, point: entry.feature.points[0]! })),
        { width: view.size.width * scale, height: view.size.height * scale },
        CLUSTER_RADIUS_PX,
        new Set(selectedId ? [selectedId] : []),
      )
    : pins.map((entry) => ({ ids: [entry.feature.id], point: entry.feature.points[0]! }));
  const byId = new Map(pins.map((entry) => [entry.feature.id, entry]));
  for (const cluster of clusters) {
    const members = cluster.ids.map((id) => byId.get(id)!);
    if (members.length === 1) wanted.add(members[0]!.layer);
    else view.clusterLayer.addLayer(clusterMarker(view, members, cluster.point));
  }

  for (const { layer } of view.entries) {
    const shown = view.featureLayer.hasLayer(layer);
    const want = wanted.has(layer);
    if (want && !shown) view.featureLayer.addLayer(layer);
    else if (!want && shown) view.featureLayer.removeLayer(layer);
  }
}
