import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useWorlds } from '@/api/queries';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/inputs';
import { UserMenu } from '@/components/user-menu';
import { authClient, useSession } from '@/lib/auth-client';

function ProfileSection() {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    if (!name) return;
    setBusy(true);
    const { error } = await authClient.updateUser({ name });
    setBusy(false);
    if (error) toast.error(error.message ?? 'Could not save your name');
    else toast.success('Name saved');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-semibold">Profile</h2>
      <form onSubmit={onSubmit} className="max-w-sm space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="account-name">Name</Label>
          <Input
            id="account-name"
            name="name"
            defaultValue={session?.user.name}
            // The name shows to people you share a world with.
            maxLength={100}
            required
            key={session?.user.name}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-email">Email</Label>
          <Input id="account-email" value={session?.user.email ?? ''} readOnly disabled />
        </div>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>
    </section>
  );
}

function PasswordSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get('new'));
    if (newPassword !== String(data.get('confirm'))) return setError('The two passwords differ.');
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get('current')),
      newPassword,
      // Anyone else signed in as you, on another device, is signed out.
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not change the password');
    form.reset();
    toast.success('Password changed');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-semibold">Password</h2>
      <form onSubmit={onSubmit} className="max-w-sm space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="new"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Type it again</Label>
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" disabled={busy}>
          Change password
        </Button>
        <p className="text-xs text-muted-foreground">Changing it signs you out everywhere else.</p>
      </form>
    </section>
  );
}

function DeleteAccountDialog({ ownedWorlds }: { ownedWorlds: string[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.deleteUser({
      password: String(new FormData(event.currentTarget).get('password')),
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not delete your account');
    queryClient.clear();
    toast.success('Your account was deleted');
    void navigate('/sign-in', { replace: true });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Delete my account</Button>
      </DialogTrigger>
      <DialogContent
        title="Delete your account?"
        description="This cannot be undone. Download anything you want to keep first."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {ownedWorlds.length ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">
                These worlds will be deleted for good, for everyone in them:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {ownedWorlds.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">
              You do not own any worlds. You will just be signed out of them.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="delete-password">Type your password to confirm</Label>
            <Input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          <FieldError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              Delete everything
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DangerSection() {
  const { data: worlds } = useWorlds();
  const owned = (worlds ?? []).filter((world) => world.role === 'owner').map((world) => world.name);
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-lg font-semibold">Delete account</h2>
      <div className="max-w-xl space-y-3 rounded-xl border border-destructive/40 bg-card p-5 text-sm">
        <p>
          Deleting your account removes you, and every world you own, with its entries, maps,
          pictures and manuscript. People you invited lose access to those worlds. Worlds you only
          joined are left as they are.
        </p>
        <p className="text-muted-foreground">
          Download a copy first: open a world, go to World settings and choose an export.
        </p>
        <DeleteAccountDialog ownedWorlds={owned} />
      </div>
    </section>
  );
}

export function AccountPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Brand />
          <div className="w-48">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> Your worlds
          </Link>
          <h1 className="mt-1 font-serif text-3xl font-semibold">Your account</h1>
        </div>
        <ProfileSection />
        <PasswordSection />
        <DangerSection />
      </main>
    </div>
  );
}

export { AccountPage as Component };
