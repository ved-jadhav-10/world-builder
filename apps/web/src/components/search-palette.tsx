import { Dialog as DialogPrimitive } from 'radix-ui';
import { Map as MapIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtlasSearch } from '@/api/atlas-queries';
import { useSearch } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Spinner } from '@/components/ui/misc';
import { useDebounced } from '@/lib/use-debounced';
import { FEATURE_KIND_ICONS } from '@/lib/feature-kind-icons';
import { useWorld } from '@/lib/world-context';

/** Ctrl/Cmd+K: search every entity in the world by name, alias or text, plus maps and map labels. */
export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { world, typeById, base } = useWorld();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 150);
  const { data: results = [], isFetching } = useSearch(world.id, debounced);
  const { data: mapResults = [], isFetching: isFetchingMaps } = useAtlasSearch(world.id, debounced);
  const searching = isFetching || isFetchingMaps;
  const nothing = results.length === 0 && mapResults.length === 0;

  const setOpen = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  const toggle = useEffectEvent(() => setOpen(!open));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-2xl">
          <DialogPrimitive.Title className="sr-only">Search {world.name}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Find characters, places, lore and maps by name, alias or text.
          </DialogPrimitive.Description>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={`Search ${world.name}…`}
            />
            <CommandList>
              {debounced && !searching && nothing ? <CommandEmpty>No matches.</CommandEmpty> : null}
              {!debounced ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type a name, alias or phrase.
                </p>
              ) : null}
              {debounced && searching && nothing ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : null}
              {debounced
                ? results.map((result) => {
                    const type = typeById.get(result.typeId);
                    return (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => {
                          setOpen(false);
                          void navigate(`${base}/e/${result.id}`);
                        }}
                      >
                        <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                        <span className="truncate font-medium">{result.name}</span>
                        {result.aliases.length ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.aliases.join(', ')}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {type?.name}
                        </span>
                      </CommandItem>
                    );
                  })
                : null}
              {debounced && mapResults.length > 0 ? (
                <CommandGroup heading="Maps">
                  {mapResults.map((result) => {
                    const Icon = result.kind === 'map' ? MapIcon : FEATURE_KIND_ICONS[result.kind];
                    return (
                      <CommandItem
                        key={`${result.kind}-${result.id}`}
                        value={`${result.kind}-${result.id}`}
                        onSelect={() => {
                          setOpen(false);
                          void navigate(
                            `${base}/atlas/${result.mapId}${
                              result.featureId ? `?feature=${result.featureId}` : ''
                            }`,
                          );
                        }}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{result.label}</span>
                        {result.kind !== 'map' ? (
                          <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                            on {result.mapName}
                          </span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
