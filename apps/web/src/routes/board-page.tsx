import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type FinalConnectionState,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  Check,
  CloudOff,
  Frame,
  ImagePlus,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Palette,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Users,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  MAX_BOARD_ITEMS,
  MAX_BOARD_LINKS,
  MAX_IMAGE_BYTES,
  boardBounds,
  canSee,
  itemsInFrame,
  masonryLayout,
  paletteFromPixels,
  type Board,
  type BoardDoc,
  type BoardEntry,
  type BoardImage,
  type BoardItem,
  type BoardLink,
} from '@atlas/shared';
import { ApiError, errorMessage } from '@/api/client';
import { saveBoard, useBoard, useDeleteBoard, useRefreshBoardList } from '@/api/board-queries';
import { imageUrl, useImages, useUpdateImage, useUploadImage } from '@/api/gm-queries';
import '@/components/board/board.css';
import { BoardContext, type BoardContextValue, type BoardNode } from '@/components/board/context';
import { boardNodeTypes } from '@/components/board/node-types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/inputs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

// ---- Between the saved document and what React Flow draws ---------------------------------------

const newId = () => crypto.randomUUID();

function toNode(item: BoardItem, selected = false): BoardNode {
  return {
    id: item.id,
    type: item.type,
    position: { x: item.x, y: item.y },
    width: item.w,
    height: item.h,
    // Frames lie under everything else, so what is inside them can be reached.
    zIndex: item.type === 'frame' ? -1 : 0,
    selected,
    data: { item },
  };
}

function toEdge(link: BoardLink): Edge {
  return {
    id: link.id,
    source: link.from,
    target: link.to,
    label: link.label || undefined,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 3,
  };
}

function toItem(node: BoardNode): BoardItem {
  return {
    ...node.data.item,
    id: node.id,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    w: Math.round(node.width ?? node.measured?.width ?? node.data.item.w),
    h: Math.round(node.height ?? node.measured?.height ?? node.data.item.h),
  };
}

function toDoc(nodes: BoardNode[], edges: Edge[]): BoardDoc {
  const ids = new Set(nodes.map((node) => node.id));
  return {
    // Frames first, so they are drawn first wherever the document is read.
    items: [...nodes]
      .sort((a, b) => Number(b.type === 'frame') - Number(a.type === 'frame'))
      .map(toItem),
    links: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        label: typeof edge.label === 'string' ? edge.label : '',
      })),
  };
}

/** Which sides of two items an arrow should join: the pair facing each other. */
function facingSides(a: BoardNode, b: BoardNode): [string, string] {
  const centre = (node: BoardNode) => ({
    x: node.position.x + (node.width ?? 0) / 2,
    y: node.position.y + (node.height ?? 0) / 2,
  });
  const from = centre(a);
  const to = centre(b);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

/** The theme on <html>, kept current, so the canvas follows a switch of theme. */
function useTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// ---- Small pieces of the toolbar -----------------------------------------------------------------

function AddButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="h-8 gap-1.5 px-2">
      {children}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Button>
  );
}

function LinkPopover({ onAdd }: { onAdd: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    } catch {
      toast.error('That does not look like a link.');
      return;
    }
    onAdd(parsed.toString());
    setUrl('');
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
          <Link2 />
          <span className="hidden sm:inline">Link</span>
          <span className="sr-only sm:hidden">Link</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor="board-link">Link to a page, a song or a video</Label>
          <Input
            id="board-link"
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
          <p className="text-xs text-muted-foreground">
            YouTube, Spotify and SoundCloud links can be played on the board.
          </p>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!url.trim()}>
              Add link
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function PictureDialog({
  open,
  onOpenChange,
  onUpload,
  onPick,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: File[]) => void;
  onPick: (image: BoardImage) => void;
  busy: boolean;
}) {
  const { world } = useWorld();
  const gallery = useImages(world.id);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add pictures"
        description="Upload new ones, or pick from this world's gallery. You can also drop or paste pictures straight onto the board."
        className="max-w-2xl"
      >
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="sr-only"
          aria-label="Upload pictures"
          onChange={(event) => {
            onUpload(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus /> {busy ? 'Uploading…' : 'Upload pictures'}
        </Button>
        {gallery.data?.length ? (
          <ul className="mt-4 grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {gallery.data.map((image) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => onPick(image)}
                  title={image.caption || image.entityName || 'Add to the board'}
                  className="block aspect-square w-full overflow-hidden rounded border hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <img
                    src={imageUrl(world.id, image.id, 'thumbnail')}
                    alt={image.caption || image.entityName || ''}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">The gallery is empty so far.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

function SaveMark({ status }: { status: SaveStatus }) {
  const view: Record<SaveStatus, { icon: ReactNode; text: string }> = {
    saved: { icon: <Check />, text: 'Saved' },
    dirty: { icon: <LoaderCircle />, text: 'Saving…' },
    saving: { icon: <LoaderCircle className="animate-spin" />, text: 'Saving…' },
    error: { icon: <CloudOff />, text: 'Not saved. Trying again…' },
    conflict: { icon: <CloudOff />, text: 'Changed elsewhere' },
  };
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted-foreground [&_svg]:size-3.5',
        (status === 'error' || status === 'conflict') && 'text-destructive',
      )}
    >
      {view[status].icon} {view[status].text}
    </span>
  );
}

// ---- The editor ----------------------------------------------------------------------------------

function Editor({ initial, onReload }: { initial: Board; onReload: () => void }) {
  const { world, base, canEdit: editable, typeById } = useWorld();
  const navigate = useNavigate();
  const flow = useReactFlow<BoardNode, Edge>();
  const theme = useTheme();
  const wrapper = useRef<HTMLDivElement>(null);
  const upload = useUploadImage(world.id);
  const updateImage = useUpdateImage(world.id);
  const deleteBoard = useDeleteBoard(world.id);
  const refreshList = useRefreshBoardList(world.id);

  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>(
    initial.doc.items.map((item) => toNode(item)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.doc.links.map(toEdge));
  const [entries, setEntries] = useState<Record<string, BoardEntry>>(initial.entries);
  const [images, setImages] = useState<Record<string, BoardImage>>(initial.images);
  const [name, setName] = useState(initial.name);
  const [shared, setShared] = useState(initial.shared);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [pictures, setPictures] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [labelling, setLabelling] = useState<{ id: string; label: string } | null>(null);
  const [connecting, setConnecting] = useState(false);

  const doc = useMemo(() => toDoc(nodes, edges), [nodes, edges]);
  const json = useMemo(() => JSON.stringify(doc), [doc]);

  // ---- Saving: a moment after the last change, one save at a time ----
  const save = useRef({
    version: initial.version,
    saved: json,
    latest: json,
    busy: false,
    stopped: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  const flushLater = useRef<() => void>(() => {});
  const flush = useCallback(async () => {
    const state = save.current;
    if (state.busy || state.stopped || state.latest === state.saved) return;
    const sending = state.latest;
    state.busy = true;
    setStatus('saving');
    let retry = false;
    try {
      const result = await saveBoard(world.id, initial.id, {
        doc: JSON.parse(sending) as BoardDoc,
        baseVersion: state.version,
      });
      state.version = result.version;
      state.saved = sending;
      // The reply carries what each new card points to: an entry's summary, a picture's size.
      setEntries((known) => ({ ...known, ...result.entries }));
      setImages((known) => ({ ...known, ...result.images }));
      setStatus(state.latest === state.saved ? 'saved' : 'dirty');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        state.stopped = true;
        setStatus('conflict');
      } else {
        setStatus('error');
        retry = true;
        if (error instanceof ApiError && error.status < 500) toast.error(errorMessage(error));
      }
    } finally {
      state.busy = false;
    }
    if (!state.stopped && state.latest !== state.saved) {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => flushLater.current(), retry ? 5000 : 300);
    }
  }, [world.id, initial.id]);

  useEffect(() => {
    flushLater.current = () => void flush();
  }, [flush]);

  useEffect(() => {
    const state = save.current;
    state.latest = json;
    if (!editable || state.stopped) return;
    if (json === state.saved) {
      if (!state.busy) setStatus('saved');
      return;
    }
    setStatus((now) => (now === 'saving' ? now : 'dirty'));
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void flush(), 800);
  }, [json, editable, flush]);

  // Leaving the board: send what is unsaved, and let the list of boards catch up.
  useEffect(() => {
    const state = save.current;
    const warn = (event: BeforeUnloadEvent) => {
      if (state.latest !== state.saved && !state.stopped) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(state.timer);
      void flush().finally(() => void refreshList());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchBoard = async (input: { name?: string; shared?: boolean }) => {
    try {
      await saveBoard(world.id, initial.id, input);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  // ---- Undo and redo: snapshots of the document ----
  const history = useRef({ stack: [json], index: 0, applying: false });
  useEffect(() => {
    const timer = setTimeout(() => {
      const h = history.current;
      if (h.applying) {
        h.applying = false;
        return;
      }
      if (json === h.stack[h.index]) return;
      h.stack = [...h.stack.slice(Math.max(0, h.index - 98), h.index + 1), json];
      h.index = h.stack.length - 1;
    }, 350);
    return () => clearTimeout(timer);
  }, [json]);

  const step = useCallback(
    (by: 1 | -1) => {
      const h = history.current;
      // A change made a moment ago may not be in the stack yet.
      if (!h.applying && save.current.latest !== h.stack[h.index]) {
        h.stack = [...h.stack.slice(0, h.index + 1), save.current.latest];
        h.index = h.stack.length - 1;
      }
      const next = h.index + by;
      if (next < 0 || next >= h.stack.length) return;
      h.index = next;
      h.applying = true;
      const snapshot = JSON.parse(h.stack[next]!) as BoardDoc;
      setNodes(snapshot.items.map((item) => toNode(item)));
      setEdges(snapshot.links.map(toEdge));
    },
    [setNodes, setEdges],
  );

  // ---- Changing items ----
  const update = useCallback(
    (id: string, patch: Partial<BoardItem>) =>
      setNodes((all) =>
        all.map((node) => {
          if (node.id !== id) return node;
          const item = { ...node.data.item, ...patch } as BoardItem;
          return {
            ...node,
            ...(patch.w !== undefined ? { width: patch.w } : {}),
            ...(patch.h !== undefined ? { height: patch.h } : {}),
            data: { item },
          };
        }),
      ),
    [setNodes],
  );

  const remove = useCallback(
    (id: string) => {
      setNodes((all) => all.filter((node) => node.id !== id));
      setEdges((all) => all.filter((edge) => edge.source !== id && edge.target !== id));
    },
    [setNodes, setEdges],
  );

  /** Adds items and selects them. Returns false when the board is full. */
  const addItems = useCallback(
    (items: BoardItem[]) => {
      if (nodes.length + items.length > MAX_BOARD_ITEMS) {
        toast.error(`A board holds up to ${MAX_BOARD_ITEMS} items.`);
        return false;
      }
      setNodes((all) => [
        ...all.map((node) => (node.selected ? { ...node, selected: false } : node)),
        ...items.map((item) => toNode(item, true)),
      ]);
      return true;
    },
    [nodes.length, setNodes],
  );

  /**
   * Where a new item of this size goes: the middle of what is on screen, or the nearest free spot
   * to it when something is already there, so new items never land on top of old ones.
   */
  const centre = useCallback(
    (w: number, h: number, kind: 'item' | 'frame' = 'item') => {
      const rect = wrapper.current?.getBoundingClientRect();
      const point = flow.screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
      });
      const origin = { x: Math.round(point.x - w / 2), y: Math.round(point.y - h / 2) };
      // A new item may go inside a frame; a new frame goes where nothing is yet.
      const taken = nodes.filter((node) => kind === 'frame' || node.type !== 'frame').map(toItem);
      const gap = 24;
      const free = (x: number, y: number) =>
        !taken.some(
          (item) =>
            x < item.x + item.w + gap &&
            x + w + gap > item.x &&
            y < item.y + item.h + gap &&
            y + h + gap > item.y,
        );
      const steps: [number, number][] = [];
      for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) steps.push([i, j]);
      // Nearest first; of equally near spots, to the right and below before left and above.
      steps.sort(
        (p, q) =>
          Math.abs(p[0]) + Math.abs(p[1]) - (Math.abs(q[0]) + Math.abs(q[1])) ||
          q[0] + q[1] - (p[0] + p[1]),
      );
      for (const [i, j] of steps) {
        const x = origin.x + i * (w + gap);
        const y = origin.y + j * (h + gap);
        if (free(x, y)) return { x, y };
      }
      const nudge = (nodes.length % 6) * 22;
      return { x: origin.x + nudge, y: origin.y + nudge };
    },
    [flow, nodes],
  );

  const duplicate = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const item = toItem(node);
      addItems([{ ...item, id: newId(), x: item.x + 28, y: item.y + 28 }]);
    },
    [nodes, addItems],
  );

  const addPicture = useCallback(
    (image: BoardImage, at?: { x: number; y: number }) => {
      const w = 280;
      const h = Math.max(40, Math.round((w * image.height) / Math.max(1, image.width)));
      setImages((known) => ({ ...known, [image.id]: image }));
      return addItems([
        {
          id: newId(),
          type: 'image',
          imageId: image.id,
          caption: '',
          gmOnly: false,
          w,
          h,
          ...(at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) } : centre(w, h)),
        },
      ]);
    },
    [addItems, centre],
  );

  const uploadPictures = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
      const pictures = files.filter((file) => file.type.startsWith('image/'));
      if (pictures.length === 0) return;
      setUploading(true);
      let offset = 0;
      for (const file of pictures) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name} is too large.`);
          continue;
        }
        try {
          // On a board shown to players, a picture added to it is meant for them too.
          const image = await upload.mutateAsync({
            image: file,
            entityId: null,
            visibility: shared ? 'player' : 'gm',
          });
          if (!addPicture(image, at ? { x: at.x + offset, y: at.y + offset } : undefined)) break;
          offset += 32;
        } catch (error) {
          toast.error(`${file.name}: ${errorMessage(error)}`);
        }
      }
      setUploading(false);
    },
    [upload, shared, addPicture],
  );

  const addLink = useCallback(
    (url: string, at?: { x: number; y: number }) => {
      const w = 300;
      const h = 72;
      addItems([
        {
          id: newId(),
          type: 'embed',
          url,
          title: '',
          gmOnly: false,
          w,
          h,
          ...(at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) } : centre(w, h)),
        },
      ]);
    },
    [addItems, centre],
  );

  const pullColours = useCallback(
    async (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.data.item.type !== 'image') return;
      const item = toItem(node);
      try {
        const picture = new Image();
        picture.src = imageUrl(world.id, node.data.item.imageId, 'thumbnail');
        await picture.decode();
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 96 / Math.max(picture.naturalWidth, picture.naturalHeight));
        canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(picture, 0, 0, canvas.width, canvas.height);
        const colours = paletteFromPixels(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          5,
        );
        const size = 72;
        const gap = 10;
        addItems(
          colours.map((color, index) => ({
            id: newId(),
            type: 'swatch' as const,
            color,
            label: '',
            gmOnly: false,
            x: item.x + index * (size + gap),
            y: item.y + item.h + 40,
            w: size,
            h: 92,
          })),
        );
      } catch {
        toast.error('Could not read that picture.');
      }
    },
    [nodes, world.id, addItems],
  );

  const tidyPictures = useCallback(() => {
    const all = nodes.filter((node) => node.type === 'image');
    const chosen = all.filter((node) => node.selected);
    const group = (chosen.length >= 2 ? chosen : all).map(toItem);
    const bounds = boardBounds(group);
    if (!bounds || group.length < 2) return;
    const placed = new Map(
      masonryLayout(group, {
        columns: Math.min(5, Math.max(2, Math.ceil(Math.sqrt(group.length)))),
        columnWidth: 260,
        gap: 16,
        x: bounds.x,
        y: bounds.y,
      }).map((box) => [box.id, box]),
    );
    setNodes((current) =>
      current.map((node) => {
        const box = placed.get(node.id);
        return box
          ? { ...node, position: { x: box.x, y: box.y }, width: box.w, height: box.h }
          : node;
      }),
    );
  }, [nodes, setNodes]);

  // ---- Arrows ----
  const join = useCallback(
    (connection: { source: string; target: string }) => {
      if (connection.source === connection.target) return;
      if (edges.length >= MAX_BOARD_LINKS) {
        toast.error(`A board holds up to ${MAX_BOARD_LINKS} arrows.`);
        return;
      }
      if (edges.some((e) => e.source === connection.source && e.target === connection.target)) {
        return;
      }
      setEdges((all) => [
        ...all,
        toEdge({ id: newId(), from: connection.source, to: connection.target, label: '' }),
      ]);
    },
    [edges, setEdges],
  );
  const onConnect = useCallback((connection: Connection) => join(connection), [join]);

  /** An arrow let go over an item, not exactly on one of its connection points, still joins it. */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      setConnecting(false);
      if (state.isValid || !state.fromNode) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;
      const target = document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest<HTMLElement>('.react-flow__node');
      const id = target?.dataset.id;
      if (id) join({ source: state.fromNode.id, target: id });
    },
    [join],
  );

  // Each arrow joins the two sides that face each other, wherever its ends are moved.
  const drawnEdges = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return edges.flatMap((edge) => {
      const from = byId.get(edge.source);
      const to = byId.get(edge.target);
      if (!from || !to) return [];
      const [sourceHandle, targetHandle] = facingSides(from, to);
      return [{ ...edge, sourceHandle, targetHandle }];
    });
  }, [nodes, edges]);

  // ---- A frame carries what is inside it ----
  const carried = useRef<{
    id: string;
    start: { x: number; y: number };
    inside: Map<string, { x: number; y: number }>;
  } | null>(null);

  const onNodeDragStart = useCallback(
    (_: unknown, node: BoardNode) => {
      carried.current = null;
      if (node.type !== 'frame') return;
      const items = nodes.map(toItem);
      const frame = items.find((item) => item.id === node.id);
      if (!frame) return;
      const moving = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
      const inside = new Map<string, { x: number; y: number }>();
      for (const id of itemsInFrame(frame, items)) {
        // Selected items are moved by the drag itself.
        if (moving.has(id)) continue;
        const item = items.find((i) => i.id === id)!;
        inside.set(id, { x: item.x, y: item.y });
      }
      carried.current = { id: node.id, start: { ...node.position }, inside };
    },
    [nodes],
  );

  const onNodeDrag = useCallback(
    (_: unknown, node: BoardNode) => {
      const carry = carried.current;
      if (!carry || carry.id !== node.id || carry.inside.size === 0) return;
      const dx = node.position.x - carry.start.x;
      const dy = node.position.y - carry.start.y;
      setNodes((all) =>
        all.map((n) => {
          const from = carry.inside.get(n.id);
          return from ? { ...n, position: { x: from.x + dx, y: from.y + dy } } : n;
        }),
      );
    },
    [setNodes],
  );

  // ---- Dropping and pasting ----
  const onDrop = (event: DragEvent) => {
    if (!editable) return;
    const files = Array.from(event.dataTransfer.files);
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (files.length > 0) {
      event.preventDefault();
      void uploadPictures(files, at);
      return;
    }
    const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text');
    if (/^https?:\/\/\S+$/i.test(url.trim())) {
      event.preventDefault();
      addLink(url.trim(), at);
    }
  };

  useEffect(() => {
    if (!editable) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.some((file) => file.type.startsWith('image/'))) {
        event.preventDefault();
        void uploadPictures(files);
        return;
      }
      const text = event.clipboardData?.getData('text').trim() ?? '';
      if (/^https?:\/\/\S+$/i.test(text)) {
        event.preventDefault();
        addLink(text);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        step(event.shiftKey ? 1 : -1);
      } else if (key === 'y') {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, [editable, uploadPictures, addLink, step]);

  const context: BoardContextValue = useMemo(
    () => ({
      worldId: world.id,
      base,
      editable,
      shared,
      entries,
      images,
      typeById,
      update,
      remove,
      duplicate,
      pullColours: (id) => void pullColours(id),
    }),
    [
      world.id,
      base,
      editable,
      shared,
      entries,
      images,
      typeById,
      update,
      remove,
      duplicate,
      pullColours,
    ],
  );

  const pictureCount = nodes.filter((node) => node.type === 'image').length;
  // Pictures on the board that players may not see, though the item is not marked as kept back.
  const heldPictures = [
    ...new Set(
      nodes.flatMap((node) => {
        const item = node.data.item;
        if (item.type !== 'image' || item.gmOnly) return [];
        const image = images[item.imageId];
        return image && !canSee('player', image.visibility) ? [image.id] : [];
      }),
    ),
  ];
  const sharePictures = async () => {
    try {
      for (const id of heldPictures) await updateImage.mutateAsync({ id, visibility: 'player' });
      setImages((known) => {
        const next = { ...known };
        for (const id of heldPictures) next[id] = { ...next[id]!, visibility: 'player' };
        return next;
      });
      toast.success(
        heldPictures.length === 1 ? 'Picture shared with players' : 'Pictures shared with players',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const empty = nodes.length === 0;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-card/60 px-3 py-2">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to={`${base}/boards`} title="All boards">
            <ArrowLeft />
            <span className="sr-only">All boards</span>
          </Link>
        </Button>
        {editable ? (
          <input
            value={name}
            maxLength={120}
            aria-label="Board name"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const next = name.trim();
              if (!next) setName(initial.name);
              else if (next !== initial.name) void patchBoard({ name: next });
            }}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            className="min-w-0 flex-1 truncate rounded bg-transparent px-1 font-serif text-2xl font-semibold outline-none focus-visible:bg-muted sm:max-w-md"
          />
        ) : (
          <h1 className="min-w-0 flex-1 truncate font-serif text-2xl font-semibold">{name}</h1>
        )}
        {editable ? (
          <div className="ml-auto flex items-center gap-1">
            <SaveMark status={status} />
            {status === 'conflict' ? (
              <Button size="sm" variant="outline" onClick={onReload}>
                Reload
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} title="Undo (Ctrl+Z)">
              <Undo2 />
              <span className="sr-only">Undo</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => step(1)}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 />
              <span className="sr-only">Redo</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-8 gap-1.5', shared && 'bg-accent text-accent-foreground')}
                >
                  <Users /> {shared ? 'Shown to players' : 'Only you'}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3 p-4 text-sm">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(event) => {
                      setShared(event.target.checked);
                      void patchBoard({ shared: event.target.checked });
                    }}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">Show this board to players</span>
                    <span className="block text-muted-foreground">
                      They can look, not change it.
                    </span>
                  </span>
                </label>
                <p className="text-muted-foreground">
                  Players never see an entry or picture that is not shared with them, or anything
                  you mark as kept from players. Those items carry a crossed-out eye.
                </p>
                {shared && heldPictures.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p>
                      {heldPictures.length === 1
                        ? 'One picture on this board is for the GM only, so players will not see it.'
                        : `${heldPictures.length} pictures on this board are for the GM only, so players will not see them.`}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateImage.isPending}
                      onClick={() => void sharePictures()}
                    >
                      Share {heldPictures.length === 1 ? 'it' : 'them'} with players
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" title="Delete this board">
                  <Trash2 />
                  <span className="sr-only">Delete this board</span>
                </Button>
              }
              title={`Delete “${name}”?`}
              description="The board and its arrangement are deleted for good. Entries and pictures on it are not touched."
              onConfirm={async () => {
                save.current.stopped = true;
                await deleteBoard.mutateAsync(initial.id);
                navigate(`${base}/boards`);
              }}
            />
          </div>
        ) : null}
      </header>

      <div
        ref={wrapper}
        className="relative min-h-0 flex-1"
        onDragOver={(event) => editable && event.preventDefault()}
        onDrop={onDrop}
      >
        <BoardContext.Provider value={context}>
          <ReactFlow
            className={cn('board-flow', connecting && 'connecting')}
            data-editable={editable}
            colorMode={theme}
            nodes={nodes}
            edges={drawnEdges}
            nodeTypes={boardNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={() => setConnecting(true)}
            onConnectEnd={onConnectEnd}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={() => (carried.current = null)}
            onEdgeDoubleClick={(_, edge) =>
              editable &&
              setLabelling({ id: edge.id, label: typeof edge.label === 'string' ? edge.label : '' })
            }
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={editable}
            nodesConnectable={editable}
            elementsSelectable={editable}
            edgesFocusable={editable}
            deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            minZoom={0.1}
            maxZoom={3}
            snapToGrid={false}
            fitView={!empty}
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
            <Controls showInteractive={false} position="bottom-left" />
            {nodes.length > 12 ? (
              <MiniMap pannable zoomable position="bottom-right" className="hidden md:block" />
            ) : null}
            {editable ? (
              <Panel position="top-left">
                <div className="flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-0.5 rounded-lg border bg-card p-1 shadow-md">
                  <EntityPicker
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
                        <Plus />
                        <span className="hidden sm:inline">Entry</span>
                        <span className="sr-only sm:hidden">Entry</span>
                      </Button>
                    }
                    onSelect={(entity) => {
                      setEntries((known) =>
                        known[entity.id]
                          ? known
                          : {
                              ...known,
                              [entity.id]: {
                                ...entity,
                                summary: '',
                                portraitId: null,
                                visibility: 'player',
                              },
                            },
                      );
                      addItems([
                        {
                          id: newId(),
                          type: 'entry',
                          entityId: entity.id,
                          gmOnly: false,
                          w: 280,
                          h: 116,
                          ...centre(280, 116),
                        },
                      ]);
                    }}
                  />
                  <AddButton
                    label="Note"
                    onClick={() =>
                      addItems([
                        {
                          id: newId(),
                          type: 'note',
                          text: '',
                          color: 'vellum',
                          size: 'sm',
                          gmOnly: false,
                          w: 200,
                          h: 160,
                          ...centre(200, 160),
                        },
                      ])
                    }
                  >
                    <StickyNote />
                  </AddButton>
                  <AddButton
                    label="Heading"
                    onClick={() =>
                      addItems([
                        {
                          id: newId(),
                          type: 'note',
                          text: '',
                          color: 'plain',
                          size: 'lg',
                          gmOnly: false,
                          w: 360,
                          h: 56,
                          ...centre(360, 56),
                        },
                      ])
                    }
                  >
                    <Type />
                  </AddButton>
                  <AddButton label="Picture" onClick={() => setPictures(true)}>
                    <ImagePlus />
                  </AddButton>
                  <AddButton
                    label="Frame"
                    onClick={() =>
                      addItems([
                        {
                          id: newId(),
                          type: 'frame',
                          title: '',
                          gmOnly: false,
                          w: 560,
                          h: 380,
                          ...centre(560, 380, 'frame'),
                        },
                      ])
                    }
                  >
                    <Frame />
                  </AddButton>
                  <AddButton
                    label="Colour"
                    onClick={() =>
                      addItems([
                        {
                          id: newId(),
                          type: 'swatch',
                          color: '#3f6f6a',
                          label: '',
                          gmOnly: false,
                          w: 96,
                          h: 116,
                          ...centre(96, 116),
                        },
                      ])
                    }
                  >
                    <Palette />
                  </AddButton>
                  <LinkPopover onAdd={(url) => addLink(url)} />
                  {pictureCount >= 2 ? (
                    <>
                      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2"
                        onClick={tidyPictures}
                        title="Arrange the pictures (or the selected ones) as a neat wall"
                      >
                        <LayoutGrid />
                        <span className="hidden sm:inline">Tidy pictures</span>
                        <span className="sr-only sm:hidden">Tidy pictures</span>
                      </Button>
                    </>
                  ) : null}
                </div>
              </Panel>
            ) : null}
          </ReactFlow>
        </BoardContext.Provider>

        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <p className="font-serif text-3xl font-medium">
                {editable ? 'An empty table' : 'Nothing here yet'}
              </p>
              {editable ? (
                <p className="mt-2 text-muted-foreground">
                  {initial.kind === 'mood'
                    ? 'Drop or paste pictures here, add colours, and link the music that fits. Select a picture to take its colours as swatches.'
                    : 'Add entries from the Codex as cards, write notes beside them, and drag from the edge of one item to another to draw an arrow.'}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <PictureDialog
        open={pictures}
        onOpenChange={setPictures}
        busy={uploading}
        onUpload={(files) => void uploadPictures(files).then(() => setPictures(false))}
        onPick={(image) => {
          addPicture(image);
          setPictures(false);
        }}
      />

      <Dialog open={labelling !== null} onOpenChange={(open) => !open && setLabelling(null)}>
        <DialogContent title="Label this arrow" description="A word or two on what joins the two.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!labelling) return;
              const label = labelling.label.trim();
              setEdges((all) =>
                all.map((edge) =>
                  edge.id === labelling.id ? { ...edge, label: label || undefined } : edge,
                ),
              );
              setLabelling(null);
            }}
          >
            <Input
              autoFocus
              aria-label="Arrow label"
              value={labelling?.label ?? ''}
              maxLength={80}
              placeholder="owes money to"
              onChange={(event) =>
                setLabelling((now) => (now ? { ...now, label: event.target.value } : now))
              }
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setLabelling(null)}>
                Cancel
              </Button>
              <Button type="submit">Save label</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Component() {
  const { boardId = '' } = useParams();
  const { world, base } = useWorld();
  const board = useBoard(world.id, boardId);
  if (board.isPending) return <PageSpinner />;
  if (board.isError || !board.data) {
    return (
      <div className="px-4 py-10">
        <EmptyState icon={<StickyNote />} title="This board is not here">
          <p>It may have been deleted, or it is not shown to you.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`${base}/boards`}>All boards</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  return (
    <ReactFlowProvider key={`${board.data.id}:${board.dataUpdatedAt}`}>
      <Editor initial={board.data} onReload={() => void board.refetch()} />
    </ReactFlowProvider>
  );
}
