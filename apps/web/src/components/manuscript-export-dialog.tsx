import { Download } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { downloadManuscriptDocx } from '@/api/queries';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { useSession } from '@/lib/auth-client';
import { useManuscriptTree } from '@/lib/manuscript-tree';
import { useWorld } from '@/lib/world-context';

/** Download the manuscript as a Word document: which book, the layout, the paper and the name. */
export function ManuscriptExportDialog({ trigger }: { trigger: ReactNode }) {
  const { world } = useWorld();
  const { tree } = useManuscriptTree();
  const { data: session } = useSession();
  const books = tree.childrenOf(null).filter((n) => n.kind === 'book');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookId, setBookId] = useState('');
  const [format, setFormat] = useState<'manuscript' | 'clean'>('manuscript');
  const [paper, setPaper] = useState<'letter' | 'a4'>('letter');
  const [author, setAuthor] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await downloadManuscriptDocx(world, {
        bookId: bookId || undefined,
        format,
        paper,
        author: author.trim() || undefined,
      });
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Export the manuscript"
        description="A Word document of your scenes in reading order. It includes every scene, so it is for you to share, not for players."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {books.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="export-book">Which book</Label>
              <NativeSelect
                id="export-book"
                value={bookId}
                onChange={(event) => setBookId(event.target.value)}
              >
                <option value="">All books</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="export-format">Layout</Label>
            <NativeSelect
              id="export-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as 'manuscript' | 'clean')}
            >
              <option value="manuscript">
                Standard manuscript (12 pt serif, double spaced, for submissions)
              </option>
              <option value="clean">Clean reading layout (single spaced)</option>
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="export-paper">Paper</Label>
              <NativeSelect
                id="export-paper"
                value={paper}
                onChange={(event) => setPaper(event.target.value as 'letter' | 'a4')}
              >
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-author">Author name</Label>
              <Input
                id="export-author"
                value={author}
                maxLength={100}
                placeholder={session?.user.name ?? 'Your name'}
                onChange={(event) => setAuthor(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-0">
            <Button type="submit" disabled={busy}>
              <Download /> {busy ? 'Preparing…' : 'Download .docx'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
