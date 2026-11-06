import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  CalendarRange,
  Heading2,
  Heading3,
  Italic,
  List,
  Lock,
  Map as MapIcon,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { RichTextDoc } from '@atlas/shared';
import { useMaps } from '@/api/atlas-queries';
import { MapEmbed, SecretBlock, TimelineEmbed } from '@/components/rich-text-extensions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';
import { cn } from '@/lib/utils';

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Extra blocks for lore articles: parts only the GM sees, and maps or timelines shown inline. */
export interface LoreFeatures {
  secret?: boolean;
  embeds?: boolean;
}

function EmbedMenu({ editor }: { editor: Editor }) {
  const { world, types } = useWorld();
  const { data: maps = [] } = useMaps(world.id);
  const [open, setOpen] = useState(false);
  const insert = (content: { type: string; attrs: Record<string, string> }) => {
    editor.chain().focus().insertContent(content).run();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Embed a map or timeline"
          aria-label="Embed a map or timeline"
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MapIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <MapIcon className="size-4" /> A map
          </p>
          <NativeSelect
            aria-label="Map to embed"
            value=""
            onChange={(event) => {
              if (event.target.value)
                insert({ type: 'mapEmbed', attrs: { mapId: event.target.value } });
            }}
          >
            <option value="">{maps.length ? 'Choose a map…' : 'No maps yet'}</option>
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarRange className="size-4" /> A timeline
          </p>
          <NativeSelect
            aria-label="Timeline to embed"
            value=""
            onChange={(event) => {
              if (event.target.value !== '') {
                insert({
                  type: 'timelineEmbed',
                  attrs: { typeId: event.target.value === 'all' ? '' : event.target.value },
                });
              }
            }}
          >
            <option value="">Choose what to list…</option>
            <option value="all">Everything dated</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                Only {type.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Toolbar({ editor, features }: { editor: Editor; features?: LoreFeatures }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      secret: e.isActive('secretBlock'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <ToolbarButton
        icon={Bold}
        label="Bold"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      />
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton
        icon={Heading2}
        label="Heading"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Heading3}
        label="Subheading"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        icon={List}
        label="Bulleted list"
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Numbered list"
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="Quote"
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      />
      {features?.secret ? (
        <ToolbarButton
          icon={Lock}
          label="Secret: only the GM sees this part"
          active={state.secret}
          onClick={() => chain().toggleWrap('secretBlock').run()}
        />
      ) : null}
      {features?.embeds ? <EmbedMenu editor={editor} /> : null}
      <span className="ml-auto" />
      <ToolbarButton
        icon={Undo2}
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolbarButton
        icon={Redo2}
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      />
    </div>
  );
}

/** TipTap editor whose value is ProseMirror JSON (null when empty). */
export function RichTextEditor({
  value,
  onChange,
  editable = true,
  placeholder = 'Write freely…',
  features,
}: {
  value: RichTextDoc | null;
  onChange: (value: RichTextDoc | null) => void;
  editable?: boolean;
  placeholder?: string;
  features?: LoreFeatures;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder }),
      // The nodes are always known so articles that hold them still open; the buttons that add
      // them only appear where the page asks for them.
      SecretBlock,
      MapEmbed,
      TimelineEmbed,
    ],
    content: (value ?? undefined) as JSONContent | undefined,
    editable,
    editorProps: { attributes: { class: 'prose-ink min-h-48 px-4 py-3' } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : (e.getJSON() as RichTextDoc)),
  });

  return (
    <div className="rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring">
      {editable ? <Toolbar editor={editor} features={features} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
