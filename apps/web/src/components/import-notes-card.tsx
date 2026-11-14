import { useQueryClient } from '@tanstack/react-query';
import { FolderInput, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_IMPORT_NOTES,
  parseMarkdownNote,
  type DocxSplit,
  type MarkdownImportResult,
} from '@atlas/shared';
import { api, errorMessage } from '@/api/client';
import { readImportFiles, type ImportNote } from '@/lib/import-files';
import { Button } from '@/components/ui/button';
import { Label, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** A request stays well under the server's size limit. */
const BATCH_BYTES = 1_200_000;
function batches(notes: ImportNote[]): ImportNote[][] {
  const out: ImportNote[][] = [];
  let current: ImportNote[] = [];
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
  const [split, setSplit] = useState<'auto' | '1' | '2' | 'none'>('auto');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<
    (MarkdownImportResult & { linked: number; sources: string; ignored: string[] }) | null
  >(null);

  async function run(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setReport(null);
    try {
      setBusy('Reading the files…');
      const read = await readImportFiles(
        files,
        split === 'auto' || split === 'none' ? split : (Number(split) as DocxSplit),
      );
      const { notes } = read;
      if (!notes.length) {
        toast.error(
          read.ignored.length
            ? `Nothing to bring in: ${read.ignored[0]}`
            : 'No notes among those files (Markdown, Word, or a zip of either)',
        );
        return;
      }
      const sources = [
        read.from.notion ? `${read.from.notion} from Notion` : '',
        read.from.word ? `${read.from.word} from Word documents` : '',
        read.from.markdown ? `${read.from.markdown} from Markdown notes` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const total: MarkdownImportResult & {
        linked: number;
        sources: string;
        ignored: string[];
      } = { created: 0, skipped: [], byType: {}, linked: 0, sources, ignored: read.ignored };
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
      <h2 className="font-semibold">Import notes and documents</h2>
      <p className="text-sm text-muted-foreground">
        Bring in work from another tool. Each note becomes an entry, GM-only, and a name that is
        already taken is left alone, so importing twice is safe.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          <strong className="font-medium text-foreground">Markdown or Obsidian:</strong> choose the
          folder, or a zip of it. A note’s <code>type</code> in its front-matter, or the folder it
          sits in (Characters, Places…), decides its type; <code>[[links]]</code> become links.
        </li>
        <li>
          <strong className="font-medium text-foreground">Notion:</strong> in Notion, Export ›
          Markdown &amp; CSV, then choose the zip as it is. Properties such as Type and Tags are
          read, and links between pages are kept.
        </li>
        <li>
          <strong className="font-medium text-foreground">Word and Google Docs:</strong> download a
          Google Doc as Word (.docx), then choose it. Headings, lists, bold, italic and links come
          across.
        </li>
      </ul>
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
        <div className="space-y-1.5">
          <Label htmlFor="import-split">Cut Word documents into entries</Label>
          <NativeSelect
            id="import-split"
            className="w-auto min-w-48"
            value={split}
            onChange={(event) => setSplit(event.target.value as typeof split)}
          >
            <option value="auto">At the headings, automatically</option>
            <option value="1">At every Heading 1</option>
            <option value="2">At every Heading 2</option>
            <option value="none">Keep each document as one entry</option>
          </NativeSelect>
        </div>
        <Button variant="outline" disabled={!!busy} onClick={() => folderInput.current?.click()}>
          <FolderInput /> Choose a folder
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={() => filesInput.current?.click()}>
          <Upload /> Choose files or a zip
        </Button>
        <input
          ref={folderInput}
          type="file"
          className="hidden"
          aria-label="Folder of notes or documents to import"
          // Not in React's types, but every current browser supports picking a folder this way.
          {...({ webkitdirectory: '' } as object)}
          multiple
          onChange={(event) => run(event.target.files)}
        />
        <input
          ref={filesInput}
          type="file"
          className="hidden"
          aria-label="Files to import"
          accept=".md,.markdown,.txt,.docx,.zip"
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
          and made {report.linked} {report.linked === 1 ? 'link' : 'links'}
          {report.sources ? ` (${report.sources})` : ''}.
          {report.ignored.length ? ` Not read: ${report.ignored.slice(0, 4).join('; ')}.` : ''}
          {report.skipped.length
            ? ` Left alone, because the name is already taken: ${report.skipped.slice(0, 8).join(', ')}${report.skipped.length > 8 ? ` and ${report.skipped.length - 8} more` : ''}.`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
