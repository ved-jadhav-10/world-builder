import { useQueryClient } from '@tanstack/react-query';
import { FolderInput, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_IMPORT_NOTES, parseMarkdownNote, type MarkdownImportResult } from '@atlas/shared';
import { api, errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Label, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** A request stays well under the server's size limit. */
const BATCH_BYTES = 1_200_000;
const NOTE = /\.(md|markdown|txt)$/i;

interface Note {
  path: string;
  content: string;
}

/** Reads the chosen files as notes. A picked folder's own name is dropped from each path. */
async function readNotes(files: File[]): Promise<Note[]> {
  const notes: Note[] = [];
  for (const file of files) {
    // Obsidian keeps its settings in a dot-folder; those are not notes.
    const relative = file.webkitRelativePath || file.name;
    if (!NOTE.test(file.name) || relative.split('/').some((part) => part.startsWith('.'))) continue;
    const parts = relative.split('/');
    const path = parts.length > 1 ? parts.slice(1).join('/') : relative;
    notes.push({ path, content: (await file.text()).slice(0, 200_000) });
  }
  return notes;
}

function batches(notes: Note[]): Note[][] {
  const out: Note[][] = [];
  let current: Note[] = [];
  let size = 0;
  for (const note of notes) {
    const bytes = note.content.length * 2 + note.path.length + 40;
    if (current.length && (size + bytes > BATCH_BYTES || current.length >= MAX_IMPORT_NOTES)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(note);
    size += bytes;
  }
  if (current.length) out.push(current);
  return out;
}

/** World settings › Import: bring a folder of Markdown notes (an Obsidian vault, say) in as entries. */
export function ImportNotesCard() {
  const { world, types } = useWorld();
  const qc = useQueryClient();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [fallback, setFallback] = useState(
    types.some((type) => type.key === 'lore_article') ? 'lore_article' : (types[0]?.key ?? ''),
  );
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<(MarkdownImportResult & { linked: number }) | null>(null);

  async function run(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setReport(null);
    try {
      setBusy('Reading the notes…');
      const notes = await readNotes(files);
      if (!notes.length) {
        toast.error('No Markdown notes (.md) among those files');
        return;
      }
      const total: MarkdownImportResult & { linked: number } = {
        created: 0,
        skipped: [],
        byType: {},
        linked: 0,
      };
      const groups = batches(notes);
      for (const [index, group] of groups.entries()) {
        setBusy(`Making entries… (${index + 1} of ${groups.length})`);
        const part = await api<MarkdownImportResult>(
          'POST',
          `/worlds/${world.id}/import/markdown`,
          { notes: group, defaultTypeKey: fallback },
        );
        total.created += part.created;
        total.skipped.push(...part.skipped);
        for (const [name, count] of Object.entries(part.byType)) {
          total.byType[name] = (total.byType[name] ?? 0) + count;
        }
      }
      // Links go last, once every note exists, so a link to a note in a later batch still lands.
      setBusy('Linking the notes…');
      const links = notes.flatMap((note) => {
        const parsed = parseMarkdownNote(note.path, note.content);
        return parsed.links.map((to) => ({ from: parsed.name, to }));
      });
      for (let i = 0; i < links.length; i += 4000) {
        const { linked } = await api<{ linked: number }>(
          'POST',
          `/worlds/${world.id}/import/markdown/links`,
          { links: links.slice(i, i + 4000) },
        );
        total.linked += linked;
      }
      setReport(total);
      toast.success(`${total.created} ${total.created === 1 ? 'entry' : 'entries'} brought in`);
      void qc.invalidateQueries();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy('');
      if (filesInput.current) filesInput.current.value = '';
      if (folderInput.current) folderInput.current.value = '';
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Import notes</h2>
      <p className="text-sm text-muted-foreground">
        Bring in a folder of Markdown notes: an Obsidian vault, an export from another tool, or a
        Markdown export from here. Each note becomes an entry. A note’s <code>type</code> in its
        front-matter, or the folder it sits in (Characters, Places…), decides its type;{' '}
        <code>[[links]]</code> between notes become links between entries. Everything arrives
        GM-only, and a note whose name already exists is left alone, so importing twice is safe.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="import-fallback">Notes that do not say what they are become</Label>
          <NativeSelect
            id="import-fallback"
            className="w-auto min-w-48"
            value={fallback}
            onChange={(event) => setFallback(event.target.value)}
          >
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" disabled={!!busy} onClick={() => folderInput.current?.click()}>
          <FolderInput /> Choose a folder
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={() => filesInput.current?.click()}>
          <Upload /> Choose files
        </Button>
        <input
          ref={folderInput}
          type="file"
          className="hidden"
          aria-label="Folder of notes to import"
          // Not in React's types, but every current browser supports picking a folder this way.
          {...({ webkitdirectory: '' } as object)}
          multiple
          onChange={(event) => run(event.target.files)}
        />
        <input
          ref={filesInput}
          type="file"
          className="hidden"
          aria-label="Notes to import"
          accept=".md,.markdown,.txt"
          multiple
          onChange={(event) => run(event.target.files)}
        />
      </div>
      {busy ? <p className="text-sm text-muted-foreground">{busy}</p> : null}
      {report ? (
        <p className="text-sm" role="status">
          Brought in {report.created} {report.created === 1 ? 'entry' : 'entries'}
          {Object.keys(report.byType).length
            ? ` (${Object.entries(report.byType)
                .map(([name, count]) => `${count} ${name}`)
                .join(', ')})`
            : ''}{' '}
          and made {report.linked} {report.linked === 1 ? 'link' : 'links'}.
          {report.skipped.length
            ? ` Left alone, because the name is already taken: ${report.skipped.slice(0, 8).join(', ')}${report.skipped.length > 8 ? ` and ${report.skipped.length - 8} more` : ''}.`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
