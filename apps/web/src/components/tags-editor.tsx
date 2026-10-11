import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Entity } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useCreateTag, useSetEntityTag, useTags } from '@/api/queries';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorld } from '@/lib/world-context';

const TAG_COLORS = [
  '#e11d48',
  '#d97706',
  '#65a30d',
  '#059669',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
];

/** Stable colour per tag name, so new tags don't all look alike. */
function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]!;
}

export function TagsEditor({ entity }: { entity: Entity }) {
  const { world, canEdit } = useWorld();
  const { data: allTags = [] } = useTags(world.id);
  const setTag = useSetEntityTag(world.id, entity.id);
  const createTag = useCreateTag(world.id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const attachedIds = new Set(entity.tags.map((t) => t.id));
  const available = allTags.filter((t) => !attachedIds.has(t.id));
  const trimmed = query.trim();
  const exists = allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());

  async function attach(tagId: string) {
    try {
      await setTag.mutateAsync({ tagId, attached: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
    setOpen(false);
    setQuery('');
  }

  async function createAndAttach() {
    try {
      const tag = await createTag.mutateAsync({ name: trimmed, color: colorFor(trimmed) });
      await attach(tag.id);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TagIcon className="size-4 text-muted-foreground" /> Tags
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        {entity.tags.map((tag) => (
          <Badge key={tag.id} color={tag.color}>
            {tag.name}
            {canEdit ? (
              <button
                type="button"
                aria-label={`Remove tag ${tag.name}`}
                onClick={() => setTag.mutate({ tagId: tag.id, attached: false })}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </Badge>
        ))}
        {canEdit ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
                <Plus className="size-3!" /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60">
              <Command>
                <CommandInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Find or create a tag…"
                />
                <CommandList>
                  <CommandGroup>
                    {available.map((tag) => (
                      <CommandItem key={tag.id} value={tag.name} onSelect={() => attach(tag.id)}>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </CommandItem>
                    ))}
                    {trimmed && !exists ? (
                      <CommandItem value={`create:${trimmed}`} onSelect={createAndAttach}>
                        <Plus className="size-3.5" /> Create “{trimmed}”
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                  {!available.length && !trimmed ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Type to create a tag.
                    </p>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : null}
        {!canEdit && entity.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags.</p>
        ) : null}
      </div>
    </section>
  );
}
