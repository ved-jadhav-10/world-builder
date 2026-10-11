import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import {
  mapMaxZoom,
  TILE_SIZE,
  type AtlasMap,
  type EntityType,
  type FeatureKind,
  type MapFeature,
  type MapPoint,
} from '@atlas/shared';
import { tileUrlTemplate } from '@/api/atlas-queries';
import {
  buildFeature,
  buildHandles,
  isInsideMap,
  project,
  syncVisibility,
  unproject,
  type FeatureHandlers,
  type MapView,
} from '@/lib/map-layers';
import { DEFAULT_COLORS } from '@/lib/map-style';
import { cn } from '@/lib/utils';

export type MapTool = 'select' | FeatureKind;

/** Asks the map to pan to a feature. A new nonce asks again, even for the same feature. */
export interface FocusRequest {
  id: string;
  nonce: number;
}

export interface MapCanvasProps {
  worldId: string;
  map: AtlasMap;
  features: MapFeature[];
  typeById: Map<string, EntityType>;
  tool: MapTool;
  canEdit: boolean;
  selectedId: string | null;
  focus: FocusRequest | null;
  /** Corners of the path or region being drawn. */
  draft: MapPoint[];
  /** Bump to return to the whole-map view. */
  fitRequest: number;
  onSelect: (id: string | null) => void;
  onPlace: (kind: 'pin' | 'label', point: MapPoint) => void;
  onDraftAdd: (point: MapPoint) => void;
  onDraftFinish: () => void;
  onMovePoints: (id: string, points: MapPoint[]) => void;
  onOpenMap: (mapId: string) => void;
}

/** Keeps the newest props in a ref, so long-lived Leaflet handlers never see stale ones. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const isDrawingTool = (tool: MapTool) => tool === 'path' || tool === 'region';

/**
 * The zoomable map. Leaflet owns the DOM inside; React tells it what to show. Positions are
 * fractions of the map's size, so the same features fit whatever size the image was uploaded at.
 */
export function MapCanvas(props: MapCanvasProps) {
  const { worldId, map: atlasMap, features, typeById, tool, canEdit, selectedId, draft } = props;
  const { focus, fitRequest } = props;
  const { id: mapId, width, height } = atlasMap;
  const sceneKey = `${mapId}:${width}x${height}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const latest = useLatest(props);
  const handledFit = useRef(fitRequest);
  const handledFocus = useRef<FocusRequest | null>(null);

  // Create the map once per image, and tear it down when the image changes or the page closes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const size = { width, height };
    const nativeDepth = mapMaxZoom(width, height);
    const bounds = L.latLngBounds([-height, 0], [0, width]);
    // Zoom 0 shows the image at its real pixel size; each step out halves it, down to the
    // single-tile overview. A little extra zoom past the real size helps read small details.
    const deepest = 3;
    const shallowest = -nativeDepth - 3;

    const map = L.map(container, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      minZoom: shallowest,
      maxZoom: deepest,
    });
    L.tileLayer(tileUrlTemplate(worldId, mapId), {
      tileSize: TILE_SIZE,
      // The server numbers tile levels from 0 (whole map) to nativeDepth (full size).
      zoomOffset: nativeDepth,
      minNativeZoom: -nativeDepth,
      maxNativeZoom: 0,
      minZoom: shallowest,
      maxZoom: deepest,
      noWrap: true,
      bounds,
      keepBuffer: 3,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const fitZoom = () => Math.min(map.getBoundsZoom(bounds), 1);
    map.setView(bounds.getCenter(), fitZoom(), { animate: false });
    map.setMinZoom(fitZoom() - 1);
    map.setMaxBounds(bounds.pad(0.4));

    const view: MapView = {
      map,
      size,
      fitZoom: fitZoom(),
      featureLayer: L.layerGroup().addTo(map),
      handleLayer: L.layerGroup().addTo(map),
      draftLayer: L.layerGroup().addTo(map),
      entries: [],
      rubber: null,
    };
    viewRef.current = view;

    map.on('zoomend', () => syncVisibility(view, latest.current.selectedId));
    map.on('click', (event: L.LeafletMouseEvent) => {
      const { tool: activeTool, onSelect, onPlace, onDraftAdd } = latest.current;
      if (activeTool === 'select') {
        onSelect(null);
      } else if (isInsideMap(event.latlng, size)) {
        const point = unproject(event.latlng, size);
        if (activeTool === 'pin' || activeTool === 'label') onPlace(activeTool, point);
        else onDraftAdd(point);
      }
    });
    map.on('dblclick', () => {
      if (isDrawingTool(latest.current.tool)) latest.current.onDraftFinish();
    });
    map.on('mousemove', (event: L.LeafletMouseEvent) => {
      const { tool: activeTool, draft: points } = latest.current;
      if (view.rubber && isDrawingTool(activeTool) && points.length > 0) {
        view.rubber.setLatLngs([...points.map((p) => project(p, size)), event.latlng]);
      }
    });

    // Leaflet only notices window resizes; the container also changes when panels open.
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      view.fitZoom = fitZoom();
      map.setMinZoom(view.fitZoom - 1);
      syncVisibility(view, latest.current.selectedId);
    });
    observer.observe(container);

    handledFocus.current = null;
    return () => {
      observer.disconnect();
      map.remove();
      viewRef.current = null;
    };
  }, [sceneKey, worldId, mapId, width, height, latest]);

  // Drawing a path or region uses double-click to finish, so it can't also zoom.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isDrawingTool(tool)) view.map.doubleClickZoom.disable();
    else view.map.doubleClickZoom.enable();
  }, [tool, sceneKey]);

  // Draw every feature. Rebuilding is cheap at the size of a world map's feature list.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handlers: FeatureHandlers = {
      select: (id) => latest.current.onSelect(id),
      open: (id) => latest.current.onOpenMap(id),
      move: (id, points) => latest.current.onMovePoints(id, points),
    };
    view.featureLayer.clearLayers();
    view.handleLayer.clearLayers();
    view.entries = features.map((feature) =>
      buildFeature(feature, {
        view,
        typeById,
        selected: feature.id === selectedId,
        interactive: tool === 'select',
        editable: canEdit && tool === 'select',
        handlers,
      }),
    );
    syncVisibility(view, selectedId);

    const selected = view.entries.find((e) => e.feature.id === selectedId);
    if (selected && canEdit && tool === 'select' && selected.shapes.length > 0) {
      for (const handle of buildHandles(selected, view, handlers))
        view.handleLayer.addLayer(handle);
    }
  }, [sceneKey, features, typeById, selectedId, tool, canEdit, latest]);

  // The path or region being drawn, plus the line that follows the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.draftLayer.clearLayers();
    view.rubber = null;
    if (!isDrawingTool(tool) || draft.length === 0) return;
    const color = DEFAULT_COLORS[tool as 'path' | 'region'];
    const corners = draft.map((p) => project(p, view.size));
    if (tool === 'region' && corners.length >= 3) {
      view.draftLayer.addLayer(
        L.polygon(corners, {
          color,
          weight: 0,
          fillColor: color,
          fillOpacity: 0.15,
          interactive: false,
        }),
      );
    }
    view.draftLayer.addLayer(
      L.polyline(corners, { color, weight: 3, dashArray: '6 6', interactive: false }),
    );
    for (const corner of corners) {
      view.draftLayer.addLayer(
        L.circleMarker(corner, {
          radius: 5,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          interactive: false,
        }),
      );
    }
    view.rubber = L.polyline([corners[corners.length - 1]!], {
      color,
      weight: 2,
      dashArray: '2 6',
      opacity: 0.8,
      interactive: false,
    }).addTo(view.draftLayer);
  }, [sceneKey, draft, tool]);

  // "Fit" returns to the whole-map view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || handledFit.current === fitRequest) return;
    handledFit.current = fitRequest;
    view.map.setView(L.latLngBounds([-height, 0], [0, width]).getCenter(), view.fitZoom);
  }, [fitRequest, sceneKey, width, height]);

  // Jump to a feature chosen from search, an entry page or the list.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !focus || handledFocus.current === focus) return;
    const target = features.find((f) => f.id === focus.id);
    if (!target) return; // Not loaded yet; this runs again when the features arrive.
    handledFocus.current = focus;
    const bounds = L.latLngBounds(target.points.map((p) => project(p, view.size)));
    const reveal = view.fitZoom + target.minZoom;
    if (target.points.length === 1) {
      view.map.setView(bounds.getCenter(), Math.max(view.map.getZoom(), reveal));
    } else {
      view.map.fitBounds(bounds.pad(0.3), { maxZoom: Math.max(view.map.getZoom(), reveal) });
    }
  }, [focus, features, sceneKey]);

  return (
    <div
      className={cn(
        'relative isolate h-full w-full overflow-hidden',
        // The map element's own classes are managed by Leaflet, so the cursor is set from here.
        isDrawingTool(tool) || tool === 'pin' || tool === 'label' ? 'atlas-drawing' : '',
      )}
    >
      <div ref={containerRef} className="atlas-map absolute inset-0" />
    </div>
  );
}
