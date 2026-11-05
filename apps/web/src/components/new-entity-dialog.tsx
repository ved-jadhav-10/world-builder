import { Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCreateEntity } from '@/api/queries';
import { useDeleteTemplate, useTemplates } from '@/api/template-queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/**
 * Asks for a name (and type, and optionally a template to start from), creates the entity, then
 * opens its page for the details.
 */
export function NewEntityDialog({ trigger, typeId }: { trigger: ReactNode; typeId?: string }) {
  const { world, types, typeById, base, audience, canEdit } = useWorld();
  const [open, setOpen] = useState(false);
  const [chosenType, setChosenType] = useState(types[0]?.id ?? '');
  const [templateId, setTemplateId] = useState('');
  const createEntity = useCreateEntity(world.id);
  const removeTemplate = useDeleteTemplate(world.id);
  const navigate = useNavigate();
  const fixedType = typeId ? typeById.get(typeId) : undefined;
  const activeType = typeId ?? chosenType;
  // Templates are copies of GM-side entries, so only the GM and editors are offered them.
  const { data: templates = [] } = useTemplates(
    world.id,
    activeType,
    open && canEdit && audience === 'gm',
  );
  const template = templates.find((t) => t.id === templateId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const entity = await createEntity.mutateAsync({
        typeId: activeType,
        name: String(form.get('name')),
        ...(template
          ? {
              summary: template.summary,
              fields: template.fields,
              body: template.body,
              visibility: template.visibility,
            }
          : {}),
      });
      setOpen(false);
      void navigate(`${base}/e/${entity.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function onDeleteTemplate() {
    if (!template) return;
    removeTemplate.mutate(template.id, {
      onSuccess: () => {
        setTemplateId('');
        toast.success('Template deleted');
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTemplateId('');
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={fixedType ? `New ${fixedType.name.toLowerCase()}` : 'New entry'}>
        <form onSubmit={onSubmit} className="space-y-4">
          {!fixedType ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-entity-type">Type</Label>
              <NativeSelect
                id="new-entity-type"
                name="typeId"
                required
                value={chosenType}
                onChange={(event) => {
                  setChosenType(event.target.value);
                  setTemplateId('');
                }}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="new-entity-name">Name</Label>
            <Input id="new-entity-name" name="name" required maxLength={200} autoFocus />
          </div>
          {templates.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-entity-template">Start from a template</Label>
              <div className="flex gap-2">
                <NativeSelect
                  id="new-entity-template"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">Blank</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
                {template ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={onDeleteTemplate}
                    disabled={removeTemplate.isPending}
                  >
                    <Trash2 />
                    <span className="sr-only">Delete template {template.name}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={createEntity.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
