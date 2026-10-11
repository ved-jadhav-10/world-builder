import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useEffectEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSearch } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Spinner } from '@/components/ui/misc';
import { useDebounced } from '@/lib/use-debounced';
import { useWorld } from '@/lib/world-context';

/** Ctrl/Cmd+K: search every entity in the world by name, alias or text. */
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
            Find characters, places and lore by name, alias or text.
          </DialogPrimitive.Description>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={`Search ${world.name}…`}
            />
            <CommandList>
              {debounced && !isFetching && results.length === 0 ? (
                <CommandEmpty>No matches.</CommandEmpty>
              ) : null}
              {!debounced ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type a name, alias or phrase.
                </p>
              ) : null}
              {debounced && isFetching && results.length === 0 ? (
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
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
