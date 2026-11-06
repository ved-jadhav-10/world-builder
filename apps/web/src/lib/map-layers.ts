import L from 'leaflet';
import {
  clusterPins,
  FEATURE_POINT_LIMITS,
  journeyProgress,
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
  /** The in-world day the map is being read at; journeys show how far along they are. */
  asOf: number | null;
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

/** A triangle at the head of an arrow, turned to point along it. */
function arrowHead(latlngs: L.LatLng[], color: string, weight: number): L.Marker {
  const [from, to] = [latlngs[0]!, latlngs[1]!];
  // The map's y axis grows upward, the screen's downward.
  const angle = (-Math.atan2(to.lat - from.lat, to.lng - from.lng) * 180) / Math.PI;
  const size = 10 + weight * 2;
  return L.marker(to, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: 'atlas-arrow-wrap',
      html: `<svg width="${size}" height="${size}" viewBox="0 0 10 10" style="transform:rotate(${angle}deg);display:block"><path d="M0 1 L10 5 L0 9 Z" fill="${color}"/></svg>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }),
  });
}

/** A small dot at a stop of a journey; filled when the stop has a date. */
function stopDot(at: L.LatLng, color: string, index: number, dated: boolean): L.CircleMarker {
  return L.circleMarker(at, {
    radius: index === 0 ? 6 : 4,
    color,
    weight: 2,
    fillColor: dated ? color : '#fff',
    fillOpacity: 1,
    interactive: false,
  });
}

/** A journey read at a day: the part travelled solid, the rest faint, a marker where they are. */
function buildJourneyAsOf(
  feature: MapFeature,
  latlngs: L.LatLng[],
  color: string,
  opts: BuildOptions,
): FeatureEntry {
  const { view, selected, interactive, handlers } = opts;
  const progress = journeyProgress(feature.points, feature.pointDays, view.asOf!);
  const toLatLngs = (points: MapPoint[]) => points.map((p) => project(p, view.size));
  const parts: L.Layer[] = [];
  const ahead = L.polyline(toLatLngs(progress.ahead), {
    color,
    weight: 3,
    opacity: 0.3,
    dashArray: '6 6',
    interactive: false,
  });
  parts.push(ahead);
  if (progress.travelled.length > 1) {
    parts.push(
      L.polyline(toLatLngs(progress.travelled), {
        color,
        weight: selected ? 5 : 4,
        interactive: false,
      }),
    );
  }
  if (progress.position) {
    parts.push(
      L.circleMarker(project(progress.position, view.size), {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
        interactive,
      }),
    );
  }
  const hit = L.polyline(latlngs, {
    weight: 18,
    opacity: 0,
    interactive,
    bubblingMouseEvents: false,
  });
  hit.on('click', () => handlers.select(feature.id));
  parts.push(hit);
  return { feature, layer: L.featureGroup(parts), shapes: [hit] };
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

  if (feature.kind === 'journey' && view.asOf !== null && feature.pointDays) {
    return buildJourneyAsOf(feature, latlngs, style.color, opts);
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
  const shape =
    feature.kind === 'circle'
      ? L.circle(latlngs[0]!, {
          ...shapeOptions,
          radius: Math.hypot(latlngs[1]!.lat - latlngs[0]!.lat, latlngs[1]!.lng - latlngs[0]!.lng),
          fillColor: style.color,
          fillOpacity: selected ? 0.25 : 0.12,
        })
      : closed
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
  // A circle has no corners to reshape live; its handles move the radius line below instead.
  const shapes: Shape[] = shape instanceof L.Circle ? [] : [shape];
  // A pale outline marks the selection; a fat invisible line makes thin roads easy to hit.
  if (selected && feature.kind !== 'circle') {
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
  const hitTargets: L.Path[] = [shape];
  // A circle is dragged by two handles (centre and edge), which reshape this line between them.
  if (feature.kind === 'circle') {
    const radius = L.polyline(latlngs, {
      weight: 1,
      opacity: selected ? 0.8 : 0,
      color: style.color,
      dashArray: '4 4',
      interactive: false,
    });
    parts.push(radius);
    shapes.push(radius);
  }
  if (feature.kind === 'arrow') parts.push(arrowHead(latlngs, style.color, weight));
  if (feature.kind === 'journey') {
    for (const [index, stop] of latlngs.entries()) {
      parts.push(stopDot(stop, style.color, index, feature.pointDays?.[index] != null));
    }
  }
  if (!closed && feature.kind !== 'circle') {
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
