import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import {
  ChevronDown,
  CircleAlert,
  Cloud,
  CloudCheck,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRight,
  X,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  buildMentionMatcher,
  countWords,
  type NodeUpdateInput,
  type RichTextDoc,
  type Scene,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useMentionIndex,
  useSaveSceneBody,
  useScene,
  useUpdateNode,
} from '@/api/manuscript-queries';
import { CodexPanel } from '@/components/codex-panel';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { MentionHoverLayer } from '@/components/mention-hover-layer';
import { Toolbar } from '@/components/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { ancestorTitles, useManuscriptTree } from '@/lib/manuscript-tree';
import { MentionHighlight, mentionHighlightKey } from '@/lib/mention-highlight';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const AUTOSAVE_DELAY_MS = 1000;
type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export function ScenePage() {
  const { sceneId = '' } = useParams();
  const { world } = useWorld();
  const query = useScene(world.id, sceneId);

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return <EmptyState title="Scene not found">It may have been deleted.</EmptyState>;
  }
  return <SceneWorkspace key={query.data.id} scene={query.data} />;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const states: Record<SaveStatus, [ReactNode, string]> = {
    saved: [<CloudCheck key="i" />, 'Saved'],
    pending: [<Cloud key="i" />, 'Unsaved'],
    saving: [<LoaderCircle key="i" className="animate-spin" />, 'Saving…'],
    error: [<CircleAlert key="i" className="text-destructive" />, 'Not saved'],
  };
  const [icon, label] = states[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5"
      aria-live="polite"
    >
      {icon}
      {label}
    </span>
  );
}

/** Picks an entity for a scene's POV or location, showing the current choice as a chip. */
function EntityField({
  label,
  value,
  onChange,
  disabled,
  names,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
  names: Map<string, { name: string; typeId: string }>;
}) {
  const { typeById } = useWorld();
  const current = value ? names.get(value) : undefined;
  const type = current ? typeById.get(current.typeId) : undefined;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <EntityPicker
          onSelect={(entity) => onChange(entity.id)}
          trigger={
            <button
              type="button"
              disabled={disabled}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              {current ? (
                <>
                  <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                  <span className="truncate">{current.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Choose…</span>
              )}
            </button>
          }
        />
        {value && !disabled ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(null)}
            title={`Clear ${label.toLowerCase()}`}
          >
            <X />
            <span className="sr-only">Clear {label.toLowerCase()}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SceneWorkspace({ scene }: { scene: Scene }) {
  const { world, canEdit, base } = useWorld();
  const { tree } = useManuscriptTree();
  const { data: index = [] } = useMentionIndex(world.id);
  const saveBody = useSaveSceneBody(world.id, scene.id);
  const updateNode = useUpdateNode(world.id);

  const [status, setStatus] = useState<SaveStatus>('saved');
  const [words, setWords] = useState(scene.wordCount);
  const [focusMode, setFocusMode] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexEntityId, setCodexEntityId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [title, setTitle] = useState(scene.title);

  // ---- Mention highlighting -------------------------------------------------
  const indexById = useMemo(() => new Map(index.map((e) => [e.id, e])), [index]);
  const matcher = useMemo(() => buildMentionMatcher(index), [index]);

  // ---- Autosave ---------------------------------------------------------------
  // Saves run one at a time, in order; the latest document always wins.
  const latestDoc = useRef<RichTextDoc | null>(scene.body);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const flush = useEffectEvent(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return queue.current;
    dirty.current = false;
    const doc = latestDoc.current;
    setStatus('saving');
    queue.current = queue.current.then(async () => {
      try {
        await saveBody.mutateAsync(doc);
        setStatus(dirty.current ? 'pending' : 'saved');
      } catch (error) {
        dirty.current = true;
        setStatus('error');
        toast.error(`Scene not saved: ${errorMessage(error)}`);
      }
    });
    return queue.current;
  });

  const onDocChange = useEffectEvent((editor: Editor) => {
    latestDoc.current = editor.isEmpty ? null : (editor.getJSON() as RichTextDoc);
    setWords(countWords(editor.getText({ blockSeparator: '\n' })));
    dirty.current = true;
    setStatus('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder: 'Begin the scene…' }),
      MentionHighlight,
    ],
    content: (scene.body ?? undefined) as JSONContent | undefined,
    editable: canEdit,
    editorProps: {
      attributes: { class: 'prose-ink prose-manuscript min-h-[55vh] px-6 py-8 sm:px-12' },
    },
  });

  useEffect(() => {
    const onUpdate = ({ editor: e }: { editor: Editor }) => onDocChange(e);
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor]);

  // Highlight with the current names; re-runs when entities are added or renamed.
  useEffect(() => {
    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(mentionHighlightKey, matcher));
    }
  }, [editor, matcher]);

  // Save on leave, Ctrl/Cmd+S, and warn before closing the tab with unsaved text.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void flush();
    }
    if (event.key === 'Escape' && focusMode) setFocusMode(false);
  });
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => onKeyDown(e);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('beforeunload', beforeUnload);
      void flush();
    };
  }, []);

  // ---- Metadata ---------------------------------------------------------------
  const saveMeta = (input: NodeUpdateInput) =>
    updateNode.mutate({ id: scene.id, ...input }, { onError: (e) => toast.error(errorMessage(e)) });

  const commitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) return setTitle(scene.title);
    if (trimmed !== scene.title) saveMeta({ title: trimmed });
  };

  const node = tree.byId.get(scene.id);
  const breadcrumb = node ? ancestorTitles(tree, node) : [];
  const names = useMemo(
    () => new Map(index.map((e) => [e.id, { name: e.name, typeId: e.typeId }])),
    [index],
  );
  const openInCodex = (entityId: string) => {
    setCodexEntityId(entityId);
    setCodexOpen(true);
  };

  return (
    <div
      className={cn('grid gap-6', codexOpen && !focusMode && 'xl:grid-cols-[minmax(0,1fr)_340px]')}
    >
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            to={`${base}/manuscript`}
            className="text-xs text-muted-foreground hover:text-foreground lg:hidden"
          >
            ← Contents
          </Link>
          <p className="min-w-0 truncate text-xs text-muted-foreground">{breadcrumb.join(' › ')}</p>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 text-xs tabular-nums text-muted-foreground">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </span>
            {canEdit ? <SaveIndicator status={status} /> : null}
            <Button
              variant={codexOpen ? 'outline' : 'ghost'}
              size="icon-sm"
              className="ml-2"
              title="Codex panel"
              aria-pressed={codexOpen}
              onClick={() => setCodexOpen((open) => !open)}
            >
              <PanelRight />
              <span className="sr-only">Toggle Codex panel</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Focus mode"
              onClick={() => setFocusMode(true)}
            >
              <Maximize2 />
              <span className="sr-only">Focus mode</span>
            </Button>
          </div>
        </div>

        <input
          aria-label="Scene title"
          value={title}
          disabled={!canEdit}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-full bg-transparent font-serif text-3xl font-semibold tracking-tight outline-none"
        />

        <section className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
          >
            <span className="font-medium">Scene details</span>
            <span className="truncate text-muted-foreground">
              {[
                scene.povId && names.get(scene.povId)
                  ? `POV: ${names.get(scene.povId)!.name}`
                  : null,
                scene.locationId && names.get(scene.locationId)
                  ? names.get(scene.locationId)!.name
                  : null,
                scene.inWorldDate || null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <ChevronDown
              className={cn(
                'ml-auto size-4 shrink-0 transition-transform',
                detailsOpen && 'rotate-180',
              )}
            />
          </button>
          {detailsOpen ? (
            <div className="grid gap-4 border-t p-4 sm:grid-cols-3">
              <EntityField
                label="Point of view"
                value={scene.povId}
                names={names}
                disabled={!canEdit}
                onChange={(povId) => saveMeta({ povId })}
              />
              <EntityField
                label="Location"
                value={scene.locationId}
                names={names}
                disabled={!canEdit}
                onChange={(locationId) => saveMeta({ locationId })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="scene-date">In-world date</Label>
                <Input
                  id="scene-date"
                  defaultValue={scene.inWorldDate}
                  disabled={!canEdit}
                  maxLength={100}
                  placeholder="e.g. 3rd of Frostfall"
                  onBlur={(e) =>
                    e.target.value !== scene.inWorldDate &&
                    saveMeta({ inWorldDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="scene-summary">Summary</Label>
                <Textarea
                  id="scene-summary"
                  defaultValue={scene.summary}
                  disabled={!canEdit}
                  rows={2}
                  maxLength={2000}
                  placeholder="What happens here, in a line or two."
                  onBlur={(e) =>
                    e.target.value !== scene.summary && saveMeta({ summary: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}
        </section>

        {/* Same element in and out of focus mode, so the editor never remounts. */}
        <div
          className={cn(
            focusMode
              ? 'fixed inset-0 z-40 overflow-y-auto bg-background'
              : 'rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring',
          )}
        >
          {focusMode ? (
            <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-4 py-2 backdrop-blur">
              <span className="truncate text-sm text-muted-foreground">{title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {words.toLocaleString()} words
              </span>
              {canEdit ? <SaveIndicator status={status} /> : null}
              <Button variant="ghost" size="sm" onClick={() => setFocusMode(false)}>
                <Minimize2 /> Exit <kbd className="text-[11px] opacity-60">Esc</kbd>
              </Button>
            </div>
          ) : canEdit ? (
            <Toolbar editor={editor} />
          ) : null}
          <div className={cn(focusMode && 'mx-auto max-w-3xl pb-32')}>
            <MentionHoverLayer index={indexById} onOpen={openInCodex}>
              <EditorContent editor={editor} />
            </MentionHoverLayer>
          </div>
        </div>
        {!focusMode ? (
          <p className="text-xs text-muted-foreground">
            Names from your Codex are underlined as you write. Hover one to preview it;
            Ctrl/Cmd+click opens it beside the scene.
          </p>
        ) : null}
      </div>

      {codexOpen && !focusMode ? (
        <div className="xl:sticky xl:top-6 xl:self-start">
          <CodexPanel
            entityId={codexEntityId}
            onSelect={setCodexEntityId}
            onClose={() => setCodexOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export { ScenePage as Component };
