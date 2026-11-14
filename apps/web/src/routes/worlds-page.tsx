import { Globe, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useCreateWorld, useWorlds } from '@/api/queries';
import { AmbienceControl } from '@/components/ambience-control';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/inputs';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { UserMenu } from '@/components/user-menu';
import { WorldCover } from '@/components/world-cover';
import { timeAgo } from '@/lib/utils';

function NewWorldDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createWorld = useCreateWorld();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const world = await createWorld.mutateAsync({
        name: String(form.get('name')),
        description: String(form.get('description') ?? ''),
      });
      setOpen(false);
      void navigate(`/w/${world.slug}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="New world"
        description="You can rename it or change the description later."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="world-name">Name</Label>
            <Input
              id="world-name"
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Aerth"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="world-description">Description</Label>
            <Textarea
              id="world-description"
              name="description"
              maxLength={2000}
              placeholder="Optional"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createWorld.isPending}>
              Create world
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorldsPage() {
  const { data: worlds, isPending } = useWorlds();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Brand />
        <div className="flex items-center gap-2">
          <AmbienceControl variant="icon" />
          <div className="w-52">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-5xl font-medium">Your worlds</h1>
            <p className="mt-2 text-muted-foreground">
              Every place, person and story beat, linked.
            </p>
          </div>
          {worlds?.length ? (
            <NewWorldDialog
              trigger={
                <Button>
                  <Plus /> New world
                </Button>
              }
            />
          ) : null}
        </div>

        <div className="mt-8">
          {isPending ? (
            <PageSpinner />
          ) : worlds?.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {worlds.map((world) => (
                <li key={world.id}>
                  <Link
                    to={`/w/${world.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <WorldCover
                      seed={world.id}
                      className="h-28 border-b transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-serif text-2xl font-medium">{world.name}</h2>
                        {world.role !== 'owner' ? <Badge>{ROLE_LABELS[world.role]}</Badge> : null}
                      </div>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                        {world.description || 'No description yet.'}
                      </p>
                      <p className="mt-4 text-xs text-muted-foreground">
                        Updated {timeAgo(world.updatedAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Globe />} title="Start your first world">
              <p>A world holds your characters, places, factions and lore, all linked together.</p>
              <NewWorldDialog
                trigger={
                  <Button className="mt-4">
                    <Plus /> New world
                  </Button>
                }
              />
            </EmptyState>
          )}
        </div>
      </main>
    </div>
  );
}
