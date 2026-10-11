import { CalendarDays, Download } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { downloadExport, useDeleteWorld, useUpdateWorld } from '@/api/queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

export function WorldSettingsPage() {
  const { world, base } = useWorld();
  const isOwner = world.role === 'owner';
  const updateWorld = useUpdateWorld(world);
  const deleteWorld = useDeleteWorld(world.id);
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await updateWorld.mutateAsync({
        name: String(form.get('name')),
        description: String(form.get('description')),
      });
      toast.success('World updated');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadExport(world);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-10">
      <h1 className="font-serif text-2xl font-semibold">World settings</h1>

      <form onSubmit={onSubmit} className="space-y-4" key={world.updatedAt}>
        <div className="space-y-1.5">
          <Label htmlFor="world-name">Name</Label>
          <Input
            id="world-name"
            name="name"
            defaultValue={world.name}
            required
            maxLength={120}
            disabled={!isOwner}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="world-description">Description</Label>
          <Textarea
            id="world-description"
            name="description"
            defaultValue={world.description}
            maxLength={2000}
            disabled={!isOwner}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The address stays <code>/w/{world.slug}</code> even if you rename the world.
        </p>
        {isOwner ? (
          <Button type="submit" disabled={updateWorld.isPending}>
            Save
          </Button>
        ) : null}
      </form>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Months, weekdays, leap years, eras and moons: how dates work in {world.name}.
        </p>
        <Button asChild variant="outline">
          <Link to={`${base}/settings/calendar`}>
            <CalendarDays /> Edit the calendar
          </Link>
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Export</h2>
        <p className="text-sm text-muted-foreground">
          Download everything in this world (entries, types, relationships, tags, the manuscript,
          maps, calendar and timeline) as one JSON file. Your work is always yours to take with you.
        </p>
        <Button variant="outline" onClick={onExport} disabled={exporting}>
          <Download /> Download JSON
        </Button>
      </section>

      {isOwner ? (
        <section className="space-y-3 rounded-xl border border-destructive/40 p-5">
          <h2 className="font-semibold text-destructive">Delete world</h2>
          <p className="text-sm text-muted-foreground">
            Removes {world.name} and everything in it from your worlds. Export it first if you might
            want it back.
          </p>
          <ConfirmDialog
            title={`Delete ${world.name}?`}
            description="The world and all of its entries will no longer be accessible."
            confirmLabel="Delete world"
            onConfirm={async () => {
              try {
                await deleteWorld.mutateAsync();
                toast.success(`${world.name} deleted`);
                void navigate('/');
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
            trigger={<Button variant="destructive">Delete world</Button>}
          />
        </section>
      ) : null}
    </div>
  );
}
