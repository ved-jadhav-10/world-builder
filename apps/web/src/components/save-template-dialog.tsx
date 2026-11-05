import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCreateTemplate } from '@/api/template-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** Keeps a copy of an entry's saved summary, fields and text as a template for new entries. */
export function SaveTemplateDialog({
  entityId,
  defaultName,
  trigger,
}: {
  entityId: string;
  defaultName: string;
  trigger: ReactNode;
}) {
  const { world } = useWorld();
  const create = useCreateTemplate(world.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { entityId, name },
      {
        onSuccess: () => {
          toast.success('Template saved');
          setOpen(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(defaultName);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Save as template"
        description="New entries of this type can start from this one’s saved summary, fields and text. Unsaved edits are not included."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={80}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter className="mt-0">
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
