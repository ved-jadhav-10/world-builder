import { useState, type ReactNode } from 'react';
import { useEntityList, useSearch } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounced } from '@/lib/use-debounced';
import { useWorld } from '@/lib/world-context';

export interface PickedEntity {
  id: string;
  name: string;
  typeId: string;
}

/** Popover that searches the world's entities; shows recent ones before you type. */
export function EntityPicker({
  trigger,
  excludeId,
  onSelect,
}: {
  trigger: ReactNode;
  excludeId?: string;
  onSelect: (entity: PickedEntity) => void;
}) {
  const { world, typeById } = useWorld();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 150);
  const search = useSearch(world.id, debounced);
  const recent = useEntityList(world.id, { sort: 'updated', limit: 8 });

  const candidates: PickedEntity[] = (
    debounced ? (search.data ?? []) : (recent.data?.pages[0]?.items ?? [])
  ).filter((e) => e.id !== excludeId);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Find an entry…" />
          <CommandList>
            {candidates.length === 0 ? <CommandEmpty>No matches.</CommandEmpty> : null}
            <CommandGroup heading={debounced ? 'Results' : 'Recent'}>
              {candidates.map((entity) => {
                const type = typeById.get(entity.typeId);
                return (
                  <CommandItem
                    key={entity.id}
                    value={entity.id}
                    onSelect={() => {
                      onSelect({ id: entity.id, name: entity.name, typeId: entity.typeId });
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                    <span className="truncate">{entity.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{type?.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
