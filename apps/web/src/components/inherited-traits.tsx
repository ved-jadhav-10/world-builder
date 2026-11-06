import { Dna } from 'lucide-react';
import { Link } from 'react-router';
import { describeFieldValue, type Entity } from '@atlas/shared';
import { useEntity, useEntityRelationships, useRelationshipTypes } from '@/api/queries';
import { AbilitiesField } from '@/components/field-lists';
import { useWorld } from '@/lib/world-context';

/** Link kinds whose other end passes things on: a species (and a culture) gives traits. */
const INHERITING_KEYS = new Set(['of_species', 'of_culture']);

function Source({ id }: { id: string }) {
  const { world, base, typeById } = useWorld();
  const { data: source } = useEntity(world.id, id);
  if (!source) return null;
  const type = typeById.get(source.typeId);
  const rows = (type?.fieldSchema ?? [])
    .filter((def) => def.type !== 'abilities' && describeFieldValue(source.fields[def.key]))
    .map((def) => ({ def, text: describeFieldValue(source.fields[def.key]) }));
  const abilityFields = (type?.fieldSchema ?? []).filter(
    (def) => def.type === 'abilities' && Array.isArray(source.fields[def.key]),
  );

  if (rows.length === 0 && abilityFields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to={`${base}/e/${source.id}`} className="font-medium hover:underline">
          {source.name}
        </Link>{' '}
        has nothing filled in yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <Link to={`${base}/e/${source.id}`} className="hover:underline">
          {source.name}
        </Link>
      </p>
      {rows.map(({ def, text }) => (
        <div key={def.key}>
          <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
          <p className="whitespace-pre-wrap text-sm">{text}</p>
        </div>
      ))}
      {abilityFields.map((def) => (
        <div key={def.key} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
          <AbilitiesField
            id={`inherited-${source.id}-${def.key}`}
            value={source.fields[def.key]}
            onChange={() => {}}
            disabled
          />
        </div>
      ))}
    </div>
  );
}

/**
 * What an entry takes from its species and culture: their traits and abilities, shown beneath
 * the entry's own so a character does not repeat what every elf already is. Changing the
 * species changes it here.
 */
export function InheritedTraits({ entity }: { entity: Entity }) {
  const { world } = useWorld();
  const { data: links } = useEntityRelationships(world.id, entity.id);
  const { data: kinds } = useRelationshipTypes(world.id);
  const inheritingTypes = new Set(
    (kinds ?? []).filter((k) => INHERITING_KEYS.has(k.key)).map((k) => k.id),
  );
  const sources = (links ?? []).filter(
    (l) => l.direction === 'outgoing' && inheritingTypes.has(l.typeId),
  );
  if (sources.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Dna className="size-4 text-muted-foreground" /> From their species and culture
      </h2>
      {sources.map((link) => (
        <Source key={link.id} id={link.other.id} />
      ))}
    </section>
  );
}
