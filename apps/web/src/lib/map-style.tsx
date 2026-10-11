import { FileText } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EntityType, FeatureKind, FeatureSize, MapFeature } from '@atlas/shared';
import { ENTITY_ICONS } from '@/lib/entity-icons';

export const DEFAULT_COLORS: Record<FeatureKind, string> = {
  pin: '#4f46e5',
  label: '#1f2937',
  path: '#b45309',
  region: '#2563eb',
};

export const COLOR_PRESETS = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#475569',
  '#111827',
];

export const SIZE_LABELS: Record<FeatureSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

/** "Show from" choices: how far in from the whole-map view a feature appears. */
export const ZOOM_CHOICES = [
  'Always',
  'After zooming in a little',
  'After zooming in some',
  'After zooming in a fair bit',
  'When zoomed in close',
  'When zoomed in very close',
  'Only at the deepest zoom',
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (color: string | null | undefined, fallback: string) =>
  color && HEX.test(color) ? color : fallback;

/** What a feature looks like on the map: its own settings, else its linked entry's, else a default. */
export function resolveStyle(feature: MapFeature, typeById: Map<string, EntityType>) {
  const type = feature.entity ? typeById.get(feature.entity.typeId) : undefined;
  return {
    color: safeColor(feature.color ?? type?.color, DEFAULT_COLORS[feature.kind]),
    icon: feature.icon ?? type?.icon ?? 'map-pin',
    name: feature.label || feature.entity?.name || '',
  };
}

const glyphCache = new Map<string, string>();

/** Markup for an icon's SVG, drawn once per icon. */
function glyph(icon: string): string {
  let markup = glyphCache.get(icon);
  if (!markup) {
    const Icon = ENTITY_ICONS[icon] ?? FileText;
    markup = renderToStaticMarkup(<Icon strokeWidth={2.25} />);
    glyphCache.set(icon, markup);
  }
  return markup;
}

const PIN_PX: Record<FeatureSize, number> = { sm: 24, md: 32, lg: 44 };
const LABEL_PX: Record<FeatureSize, number> = { sm: 13, md: 17, lg: 24 };
export const LINE_WEIGHT: Record<FeatureSize, number> = { sm: 2, md: 4, lg: 7 };

/** A round badge with the icon inside and the name underneath. Text goes in as text, not HTML. */
export function pinElement(opts: {
  name: string;
  color: string;
  icon: string;
  size: FeatureSize;
  selected: boolean;
}): { element: HTMLElement; px: number } {
  const px = PIN_PX[opts.size];
  const root = document.createElement('div');
  root.className = `atlas-pin${opts.selected ? ' is-selected' : ''}`;
  root.style.setProperty('--c', opts.color);
  root.style.width = `${px}px`;
  root.style.height = `${px}px`;
  root.innerHTML = glyph(opts.icon); // Static SVG from our own icon set.
  if (opts.name) {
    const label = document.createElement('span');
    label.className = 'atlas-pin-label';
    label.textContent = opts.name;
    root.append(label);
  }
  return { element: root, px };
}

export function textLabelElement(opts: {
  text: string;
  color: string;
  size: FeatureSize;
  selected: boolean;
}): HTMLElement {
  const el = document.createElement('div');
  el.className = `atlas-label${opts.selected ? ' is-selected' : ''}`;
  el.style.color = opts.color;
  el.style.fontSize = `${LABEL_PX[opts.size]}px`;
  el.textContent = opts.text;
  return el;
}
