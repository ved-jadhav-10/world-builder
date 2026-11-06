import { Dialog, DialogContent } from '@/components/ui/dialog';
import { availableGo, OTHER_SHORTCUTS, type ShortcutContext } from '@/lib/shortcuts';

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-1">
      {keys.map((key, index) => (
        <kbd
          key={index}
          className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** The list of keyboard shortcuts, opened with "?". */
export function ShortcutsDialog({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: Pick<ShortcutContext, 'isGm' | 'canEdit'>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Press g, then a letter, to go to a page. Shortcuts stay quiet while you type."
        className="max-w-lg"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Go to</h3>
            <ul className="space-y-1.5 text-sm">
              {availableGo(ctx).map((shortcut) => (
                <li key={shortcut.key} className="flex items-center justify-between gap-3">
                  <span>{shortcut.label}</span>
                  <Keys keys={['g', shortcut.key]} />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Anywhere</h3>
            <ul className="space-y-1.5 text-sm">
              {OTHER_SHORTCUTS.map((shortcut) => (
                <li
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-3"
                >
                  <span>{shortcut.label}</span>
                  <Keys keys={shortcut.keys} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
