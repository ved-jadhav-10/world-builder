import type { FieldDefinition } from '@atlas/shared';

interface BuiltinEntityType {
  key: string;
  name: string;
  icon: string;
  color: string;
  fieldSchema: FieldDefinition[];
}

/** Copied into every new world, where users can edit them like their own types. */
export const BUILTIN_ENTITY_TYPES: BuiltinEntityType[] = [
  {
    key: 'character',
    name: 'Character',
    icon: 'user',
    color: '#e11d48',
    fieldSchema: [
      { key: 'age', label: 'Age', type: 'text' },
      {
        key: 'life_status',
        label: 'Life status',
        type: 'select',
        options: ['Alive', 'Dead', 'Missing', 'Unknown'],
      },
      { key: 'appearance', label: 'Appearance', type: 'long_text' },
      { key: 'personality', label: 'Personality', type: 'long_text' },
      { key: 'goals', label: 'Goals', type: 'long_text' },
      { key: 'fears', label: 'Fears', type: 'long_text' },
      { key: 'voice', label: 'Voice notes', type: 'long_text' },
    ],
  },
  {
    key: 'location',
    name: 'Location',
    icon: 'map-pin',
    color: '#059669',
    fieldSchema: [
      {
        key: 'location_type',
        label: 'Kind',
        type: 'select',
        options: ['World', 'Continent', 'Region', 'City', 'Settlement', 'Building', 'Room', 'Landmark', 'Other'],
      },
      { key: 'population', label: 'Population', type: 'text' },
      { key: 'climate', label: 'Climate', type: 'text' },
      { key: 'notable_features', label: 'Notable features', type: 'long_text' },
    ],
  },
  {
    key: 'faction',
    name: 'Faction',
    icon: 'shield',
    color: '#7c3aed',
    fieldSchema: [
      {
        key: 'faction_type',
        label: 'Kind',
        type: 'select',
        options: ['Kingdom', 'Guild', 'Order', 'Cult', 'Company', 'Clan', 'Other'],
      },
      { key: 'motto', label: 'Motto', type: 'text' },
      { key: 'goals', label: 'Goals', type: 'long_text' },
      { key: 'resources', label: 'Resources', type: 'long_text' },
    ],
  },
  {
    key: 'item',
    name: 'Item',
    icon: 'gem',
    color: '#d97706',
    fieldSchema: [
      {
        key: 'item_type',
        label: 'Kind',
        type: 'select',
        options: ['Weapon', 'Armour', 'Artifact', 'Tool', 'Treasure', 'Document', 'Other'],
      },
      {
        key: 'rarity',
        label: 'Rarity',
        type: 'select',
        options: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Unique'],
      },
      { key: 'properties', label: 'Properties', type: 'long_text' },
    ],
  },
  {
    key: 'species',
    name: 'Species',
    icon: 'dna',
    color: '#0891b2',
    fieldSchema: [
      { key: 'lifespan', label: 'Lifespan', type: 'text' },
      { key: 'traits', label: 'Traits', type: 'long_text' },
      { key: 'habitat', label: 'Habitat', type: 'long_text' },
    ],
  },
  {
    key: 'culture',
    name: 'Culture',
    icon: 'landmark',
    color: '#ca8a04',
    fieldSchema: [
      { key: 'languages', label: 'Languages', type: 'text' },
      { key: 'values', label: 'Values', type: 'long_text' },
      { key: 'customs', label: 'Customs', type: 'long_text' },
    ],
  },
  {
    key: 'event',
    name: 'Event',
    icon: 'calendar',
    color: '#2563eb',
    fieldSchema: [
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'end_date', label: 'End date', type: 'date' },
      { key: 'outcome', label: 'Outcome', type: 'long_text' },
    ],
  },
  {
    key: 'lore_article',
    name: 'Lore Article',
    icon: 'book-open',
    color: '#475569',
    fieldSchema: [
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        options: ['History', 'Myth', 'Religion', 'Magic', 'Technology', 'Geography', 'Other'],
      },
    ],
  },
];

export const BUILTIN_RELATIONSHIP_TYPES = [
  { key: 'member_of', label: 'member of', inverseLabel: 'has member' },
  { key: 'located_in', label: 'located in', inverseLabel: 'contains' },
  { key: 'owns', label: 'owns', inverseLabel: 'owned by' },
  { key: 'ally_of', label: 'ally of', inverseLabel: 'ally of' },
  { key: 'enemy_of', label: 'enemy of', inverseLabel: 'enemy of' },
  { key: 'parent_of', label: 'parent of', inverseLabel: 'child of' },
  { key: 'sibling_of', label: 'sibling of', inverseLabel: 'sibling of' },
  { key: 'spouse_of', label: 'spouse of', inverseLabel: 'spouse of' },
  { key: 'of_species', label: 'of species', inverseLabel: 'species of' },
  { key: 'of_culture', label: 'of culture', inverseLabel: 'culture of' },
] as const;
