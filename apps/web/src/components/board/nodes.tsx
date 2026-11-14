import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Pipette,
  Play,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  NOTE_COLORS,
  TEXT_SIZES,
  canSee,
  type BoardItem,
  type NoteColor,
  type TextSize,
} from '@atlas/shared';
import { imageUrl } from '@/api/gm-queries';
import { EntityIcon } from '@/components/entity-icon';
import { mediaEmbedFor } from '@/lib/media-embed';
import { cn } from '@/lib/utils';
import { useBoardContext, type BoardNode } from './context';

type ItemOf<T extends BoardItem['type']> = Extract<BoardItem, { type: T }>;

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const;

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[13px] text-foreground hover:bg-muted [&_svg]:size-4',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />;

/**
 * What every item shares: its outline, connection points on four sides, resize grips, the mark for
 * "GM only", and the small toolbar shown above it while it alone is selected.
 */
function Shell({
  id,
  item,
  selected,
  className,
  minWidth = 80,
  minHeight = 40,
  keepAspectRatio = false,
  hiddenFromPlayers = false,
  tools,
  children,
}: {
  id: string;
  item: BoardItem;
  selected: boolean;
  className?: string;
  minWidth?: number;
  minHeight?: number;
  keepAspectRatio?: boolean;
  /** The entry or picture itself is one players may not see. */
  hiddenFromPlayers?: boolean;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const { editable, shared, update, remove, duplicate } = useBoardContext();
  const kept = item.gmOnly || hiddenFromPlayers;
  return (
    <>
      {editable ? (
        <>
          <NodeResizer
            isVisible={selected}
            minWidth={minWidth}
            minHeight={minHeight}
            keepAspectRatio={keepAspectRatio}
            lineStyle={{ borderColor: 'transparent' }}
            handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
          />
          <NodeToolbar className="flex items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-md">
            {tools}
            {tools ? <Divider /> : null}
            <ToolButton
              label={item.gmOnly ? 'Kept from players. Show it to them' : 'Keep from players'}
              active={item.gmOnly}
              onClick={() => update(id, { gmOnly: !item.gmOnly })}
            >
              {item.gmOnly ? <EyeOff /> : <Eye />}
            </ToolButton>
            <ToolButton label="Duplicate" onClick={() => duplicate(id)}>
              <Copy />
            </ToolButton>
            <ToolButton label="Remove from the board" onClick={() => remove(id)}>
              <Trash2 />
            </ToolButton>
          </NodeToolbar>
        </>
      ) : null}
      <div className={cn('board-item relative size-full', className)}>
        {children}
        {editable && kept && (shared || item.gmOnly) ? (
          <span
            className="absolute -right-2 -top-2 z-10 inline-flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"
            title={
              item.gmOnly
                ? 'Kept from players'
                : 'Players cannot see this: it is not shared with them'
            }
          >
            <EyeOff className="size-3" />
          </span>
        ) : null}
      </div>
      {SIDES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} isConnectable={editable} />
      ))}
    </>
  );
}

/** A line of text that turns into a field on a double click. */
function InlineText({
  value,
  placeholder,
  maxLength,
  className,
  onChange,
}: {
  value: string;
  placeholder: string;
  maxLength: number;
  className?: string;
  onChange: (value: string) => void;
}) {
  const { editable } = useBoardContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onChange(draft.trim());
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setEditing(false);
          event.stopPropagation();
        }}
        className={cn('nodrag w-full bg-transparent outline-none', className)}
      />
    );
  }
  if (!value && !editable) return null;
  return (
    <p
      className={cn('truncate', !value && 'opacity-50', className)}
      title={editable ? 'Double-click to change' : undefined}
      onDoubleClick={() => {
        if (!editable) return;
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </p>
  );
}

function EntryNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'entry'>;
  const { worldId, base, entries, typeById, editable } = useBoardContext();
  const entry = entries[item.entityId];
  if (!entry) {
    return (
      <Shell id={id} item={item} selected={selected} minWidth={160} minHeight={60}>
        <div className="flex size-full items-center gap-2 rounded-lg border border-dashed bg-card/60 p-3 text-[13px] text-muted-foreground">
          <TriangleAlert className="size-4 shrink-0" />
          This entry is in the trash or was deleted.
        </div>
      </Shell>
    );
  }
  const type = typeById.get(entry.typeId);
  const href = `${base}/e/${entry.id}`;
  return (
    <Shell
      id={id}
      item={item}
      selected={selected}
      minWidth={160}
      minHeight={60}
      hiddenFromPlayers={!canSee('player', entry.visibility)}
      tools={
        <Link
          to={href}
          title="Open the entry"
          className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[13px] hover:bg-muted"
        >
          <ExternalLink className="size-4" /> Open
        </Link>
      }
    >
      <div
        className="flex size-full gap-3 overflow-hidden rounded-lg border bg-card p-3 shadow-sm"
        style={type?.color ? { borderTopColor: type.color, borderTopWidth: 3 } : undefined}
      >
        {entry.portraitId ? (
          <img
            src={imageUrl(worldId, entry.portraitId, 'thumbnail')}
            alt=""
            draggable={false}
            className="h-full max-h-28 w-16 shrink-0 rounded object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="size-3.5" />
            <span className="truncate">{type?.name ?? 'Entry'}</span>
          </p>
          {editable ? (
            <p className="truncate font-serif text-xl font-semibold leading-tight">{entry.name}</p>
          ) : (
            <Link
              to={href}
              className="nodrag block truncate font-serif text-xl font-semibold leading-tight hover:underline"
            >
              {entry.name}
            </Link>
          )}
          {entry.summary ? (
            <p className="mt-1 line-clamp-4 text-[13px] leading-snug text-muted-foreground">
              {entry.summary}
            </p>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

const NOTE_LABELS: Record<NoteColor, string> = {
  plain: 'No paper',
  vellum: 'Vellum',
  rose: 'Rose',
  sage: 'Sage',
  sky: 'Sky',
  slate: 'Slate',
};
const SIZE_CLASS: Record<TextSize, string> = {
  sm: 'text-[15px] leading-snug',
  md: 'font-serif text-2xl leading-tight',
  lg: 'font-serif text-4xl font-medium leading-none',
};
const SIZE_LABELS: Record<TextSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

function NoteNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'note'>;
  const { editable, update } = useBoardContext();
  // A note that was just made is empty: start writing in it straight away.
  const [wantsEdit, setEditing] = useState(() => editable && selected && item.text === '');
  // Selecting something else ends the writing.
  const editing = wantsEdit && selected;
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const el = area.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const stop = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setEditing(false);
    event.stopPropagation();
  };

  return (
    <Shell
      id={id}
      item={item}
      selected={selected}
      tools={
        <>
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={NOTE_LABELS[color]}
              aria-label={NOTE_LABELS[color]}
              aria-pressed={item.color === color}
              onClick={() => update(id, { color })}
              className={cn(
                'mx-0.5 size-5 rounded-full border',
                color === 'plain' && 'border-dashed',
                item.color === color && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
              )}
              style={color === 'plain' ? undefined : { background: `var(--note-${color})` }}
            />
          ))}
          <Divider />
          {TEXT_SIZES.map((size) => (
            <ToolButton
              key={size}
              label={`${SIZE_LABELS[size]} writing`}
              active={item.size === size}
              onClick={() => update(id, { size })}
            >
              <span
                className={cn('font-serif', size === 'sm' && 'text-xs', size === 'lg' && 'text-lg')}
              >
                A
              </span>
            </ToolButton>
          ))}
        </>
      }
    >
      <div
        data-color={item.color}
        className={cn(
          'board-note size-full overflow-hidden rounded-sm',
          item.color === 'plain' ? 'p-1' : 'p-3',
          SIZE_CLASS[item.size],
        )}
        onDoubleClick={() => editable && setEditing(true)}
      >
        {editing ? (
          <textarea
            ref={area}
            value={item.text}
            maxLength={4000}
            onChange={(event) => update(id, { text: event.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={stop}
            className="nodrag nowheel nopan size-full resize-none bg-transparent outline-none"
          />
        ) : (
          <p
            className={cn('size-full whitespace-pre-wrap break-words', !item.text && 'opacity-50')}
          >
            {item.text || (editable ? 'Double-click to write' : '')}
          </p>
        )}
      </div>
    </Shell>
  );
}

function ImageNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'image'>;
  const { worldId, images, update, pullColours } = useBoardContext();
  const image = images[item.imageId];
  if (!image) {
    return (
      <Shell id={id} item={item} selected={selected}>
        <div className="flex size-full items-center justify-center gap-2 rounded border border-dashed bg-card/60 p-3 text-[13px] text-muted-foreground">
          <TriangleAlert className="size-4 shrink-0" /> This picture was deleted.
        </div>
      </Shell>
    );
  }
  return (
    <Shell
      id={id}
      item={item}
      selected={selected}
      keepAspectRatio
      minWidth={60}
      minHeight={40}
      hiddenFromPlayers={!canSee('player', image.visibility)}
      tools={
        <ToolButton label="Take this picture's colours as swatches" onClick={() => pullColours(id)}>
          <Pipette /> <span className="ml-1">Colours</span>
        </ToolButton>
      }
    >
      <img
        src={imageUrl(worldId, image.id, item.w > 480 ? 'file' : 'thumbnail')}
        alt={item.caption || image.caption}
        draggable={false}
        className="size-full rounded-sm object-cover shadow-md"
      />
      <div className="absolute inset-x-0 top-full pt-1 text-center">
        <InlineText
          value={item.caption}
          placeholder={selected ? 'Add a caption' : ''}
          maxLength={200}
          className="font-serif text-[15px] italic text-muted-foreground"
          onChange={(caption) => update(id, { caption })}
        />
      </div>
    </Shell>
  );
}

function FrameNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'frame'>;
  const { update } = useBoardContext();
  return (
    <Shell id={id} item={item} selected={selected} minWidth={160} minHeight={120}>
      <div className="size-full rounded-lg border border-dashed border-foreground/30 bg-foreground/[0.025]">
        <div className="absolute inset-x-3 -top-7">
          <InlineText
            value={item.title}
            placeholder="Name this frame"
            maxLength={120}
            className="font-serif text-lg font-semibold"
            onChange={(title) => update(id, { title })}
          />
        </div>
      </div>
    </Shell>
  );
}

function SwatchNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'swatch'>;
  const { update } = useBoardContext();
  return (
    <Shell
      id={id}
      item={item}
      selected={selected}
      minWidth={60}
      minHeight={60}
      tools={
        <label className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[13px]">
          Colour
          <input
            type="color"
            value={item.color}
            onChange={(event) => update(id, { color: event.target.value })}
            className="nodrag size-5 cursor-pointer rounded border bg-transparent p-0"
          />
        </label>
      }
    >
      <div className="flex size-full flex-col overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="min-h-0 flex-1" style={{ background: item.color }} />
        <div className="px-2 py-1">
          <InlineText
            value={item.label}
            placeholder="Name"
            maxLength={60}
            className="text-[13px]"
            onChange={(label) => update(id, { label })}
          />
          <p className="font-mono text-[11px] uppercase text-muted-foreground">{item.color}</p>
        </div>
      </div>
    </Shell>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function EmbedNode({ id, data, selected }: NodeProps<BoardNode>) {
  const item = data.item as ItemOf<'embed'>;
  const { update } = useBoardContext();
  const [playing, setPlaying] = useState(false);
  const embed = mediaEmbedFor(item.url);
  return (
    <Shell id={id} item={item} selected={selected} minWidth={200} minHeight={70}>
      <div className="flex size-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 p-2.5">
          {embed ? (
            <button
              type="button"
              onClick={() => {
                // Make room for the player the first time it opens.
                if (!playing && item.h < embed.height + 64) update(id, { h: embed.height + 64 });
                setPlaying((on) => !on);
              }}
              className="nodrag inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-ink-foreground"
              title={playing ? 'Stop' : `Play here (loads ${embed.service})`}
              aria-label={playing ? 'Stop' : `Play from ${embed.service}`}
            >
              {playing ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
          ) : (
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <InlineText
              value={item.title}
              placeholder={embed ? `${embed.service} link` : 'Name this link'}
              maxLength={120}
              className="font-medium"
              onChange={(title) => update(id, { title })}
            />
            <p className="truncate text-xs text-muted-foreground">{hostOf(item.url)}</p>
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="nodrag rounded p-1 text-muted-foreground hover:text-foreground"
            title="Open in a new tab"
            aria-label="Open the link in a new tab"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
        {embed && playing ? (
          <iframe
            src={embed.src}
            title={item.title || embed.service}
            allow="autoplay; encrypted-media"
            className="nodrag min-h-0 w-full flex-1 border-t"
          />
        ) : null}
      </div>
    </Shell>
  );
}

export { EmbedNode, EntryNode, FrameNode, ImageNode, NoteNode, SwatchNode };
