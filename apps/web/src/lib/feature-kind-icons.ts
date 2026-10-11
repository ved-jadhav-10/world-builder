import { MapPin, Pentagon, Route, Type, type LucideIcon } from 'lucide-react';
import type { FeatureKind } from '@atlas/shared';

/** Kept apart from map-style so the search palette can use them without loading the map code. */
export const FEATURE_KIND_ICONS: Record<FeatureKind, LucideIcon> = {
  pin: MapPin,
  label: Type,
  path: Route,
  region: Pentagon,
};
