import { QUEST_STATUSES, type FieldDefinition } from '@atlas/shared';

interface BuiltinEntityType {
  key: string;
  name: string;
  icon: string;
  color: string;
  fieldSchema: FieldDefinition[];
  /** What the entry's two dates are called for this type. */
  startLabel: string;
  endLabel: string;
}

/** Copied into every new world, where users can edit them like their own types. */
export const BUILTIN_ENTITY_TYPES: BuiltinEntityType[] = [
  {
    key: 'character',
    startLabel: 'Born',
    endLabel: 'Died',
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
    startLabel: 'Founded',
    endLabel: 'Abandoned',
    name: 'Location',
    icon: 'map-pin',
    color: '#059669',
    fieldSchema: [
      {
        key: 'location_type',
        label: 'Kind',
        type: 'select',
        options: [
          'World',
          'Continent',
          'Region',
          'City',
          'Settlement',
          'Building',
          'Room',
          'Landmark',
          'Other',
        ],
      },
      { key: 'population', label: 'Population', type: 'text' },
      { key: 'climate', label: 'Climate', type: 'text' },
      { key: 'notable_features', label: 'Notable features', type: 'long_text' },
    ],
  },
  {
    key: 'faction',
    startLabel: 'Founded',
    endLabel: 'Dissolved',
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
    startLabel: 'Created',
    endLabel: 'Destroyed',
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
    startLabel: 'Appeared',
    endLabel: 'Died out',
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
    startLabel: 'Emerged',
    endLabel: 'Faded',
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
    startLabel: 'Begins',
    endLabel: 'Ends',
    name: 'Event',
    icon: 'calendar',
    color: '#2563eb',
    fieldSchema: [{ key: 'outcome', label: 'Outcome', type: 'long_text' }],
  },
  {
    key: 'quest',
    startLabel: 'Offered',
    endLabel: 'Resolved',
    name: 'Quest',
    icon: 'scroll-text',
    color: '#d97706',
    fieldSchema: [
      { key: 'status', label: 'Status', type: 'select', options: [...QUEST_STATUSES] },
      { key: 'objectives', label: 'Objectives', type: 'long_text' },
      { key: 'reward', label: 'Reward', type: 'text' },
    ],
  },
  {
    key: 'lore_article',
    startLabel: 'Starts',
    endLabel: 'Ends',
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
  { key: 'took_part_in', label: 'took part in', inverseLabel: 'had participant' },
  { key: 'given_by', label: 'given by', inverseLabel: 'gave quest' },
] as const;
