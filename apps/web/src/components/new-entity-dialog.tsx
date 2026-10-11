import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCreateEntity } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** Asks for a name (and type), creates the entity, then opens its page for the details. */
export function NewEntityDialog({ trigger, typeId }: { trigger: ReactNode; typeId?: string }) {
  const { world, types, typeById, base } = useWorld();
  const [open, setOpen] = useState(false);
  const createEntity = useCreateEntity(world.id);
  const navigate = useNavigate();
  const fixedType = typeId ? typeById.get(typeId) : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const entity = await createEntity.mutateAsync({
        typeId: typeId ?? String(form.get('typeId')),
        name: String(form.get('name')),
      });
      setOpen(false);
      void navigate(`${base}/e/${entity.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={fixedType ? `New ${fixedType.name.toLowerCase()}` : 'New entry'}>
        <form onSubmit={onSubmit} className="space-y-4">
          {!fixedType ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-entity-type">Type</Label>
              <NativeSelect id="new-entity-type" name="typeId" required defaultValue={types[0]?.id}>
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
