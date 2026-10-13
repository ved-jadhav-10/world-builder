import { ChevronLeft, Copy, Link2, Plus, Trash2, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  INVITE_ROLE_INFO,
  INVITE_ROLES,
  ROLE_LABELS,
  type CreatedInvite,
  type Invite,
  type InviteRole,
  type Member,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  inviteUrl,
  useCreateInvite,
  useDeleteInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useUpdateMember,
} from '@/api/member-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { useSession } from '@/lib/auth-client';
import { useWorld } from '@/lib/world-context';

const EXPIRY_OPTIONS = [
  { value: '1', label: 'In 1 day' },
  { value: '7', label: 'In 7 days' },
  { value: '30', label: 'In 30 days' },
  { value: 'never', label: 'Never' },
];
const USE_OPTIONS = [
  { value: '1', label: 'One person' },
  { value: '5', label: 'Up to 5 people' },
  { value: '10', label: 'Up to 10 people' },
  { value: 'any', label: 'Anyone with the link' },
];

function MemberRow({ member, isYou }: { member: Member; isYou: boolean }) {
  const { world } = useWorld();
  const update = useUpdateMember(world.id);
  const remove = useRemoveMember(world.id);
  const isOwner = member.role === 'owner';

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {member.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name} {isYou ? <span className="text-muted-foreground">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      {isOwner ? (
        <Badge>Owner</Badge>
      ) : (
        <>
          <NativeSelect
            aria-label={`Role of ${member.name}`}
            className="h-8 w-32 text-[13px]"
            // Keep showing the choice while it is being saved, rather than flicking back.
            value={update.isPending && update.variables ? update.variables.role : member.role}
            disabled={update.isPending}
            onChange={async (event) => {
              const role = event.target.value as InviteRole;
              try {
                await update.mutateAsync({ userId: member.userId, role });
                toast.success(`${member.name} is now ${ROLE_LABELS[role]}`);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {INVITE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
            {!(INVITE_ROLES as readonly string[]).includes(member.role) ? (
              <option value={member.role}>{ROLE_LABELS[member.role]}</option>
            ) : null}
          </NativeSelect>
          <ConfirmDialog
            title={`Remove ${member.name}?`}
            description={`${member.name} will lose access to ${world.name}. They can come back with a new invite link.`}
            confirmLabel="Remove"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(member.userId);
                toast.success(`${member.name} was removed`);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
            trigger={
              <Button variant="ghost" size="icon-sm" title={`Remove ${member.name}`}>
                <UserMinus />
                <span className="sr-only">Remove {member.name}</span>
              </Button>
            }
          />
        </>
      )}
    </li>
  );
}

/** Shown once, straight after a link is made: the secret can't be read again. */
function CreatedLink({ invite, onDone }: { invite: CreatedInvite; onDone: () => void }) {
  const url = inviteUrl(invite.token);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Send this link to your {ROLE_LABELS[invite.role].toLowerCase()}s. Anyone who opens it can
        join
        {invite.maxUses === 1 ? ' (it works once)' : ''}.
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button onClick={copy}>
          <Copy /> Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        This is the only time the link is shown. If you lose it, cancel it and make a new one.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

function NewInviteDialog() {
  const { world } = useWorld();
  const create = useCreateInvite(world.id);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteRole>('player');
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreated(null);
      setRole('player');
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expires = String(form.get('expires'));
    const uses = String(form.get('uses'));
    try {
      setCreated(
        await create.mutateAsync({
          role,
          label: String(form.get('label') ?? ''),
          expiresInDays: expires === 'never' ? null : Number(expires),
          maxUses: uses === 'any' ? null : Number(uses),
        }),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New invite link
        </Button>
      </DialogTrigger>
      <DialogContent
        title={created ? 'Your invite link' : 'New invite link'}
        description={
          created
            ? undefined
            : `Anyone with the link can join ${world.name} with the role you pick.`
        }
      >
        {created ? (
          <CreatedLink invite={created} onDone={() => onOpenChange(false)} />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as InviteRole)}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {INVITE_ROLE_INFO[r].label}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{INVITE_ROLE_INFO[role].description}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-label">Note to yourself (optional)</Label>
              <Input
                id="invite-label"
                name="label"
                maxLength={80}
                placeholder="e.g. Tuesday group"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-expires">Expires</Label>
                <NativeSelect id="invite-expires" name="expires" defaultValue="7">
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-uses">Can be used by</Label>
                <NativeSelect id="invite-uses" name="uses" defaultValue="any">
                  {USE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                <Link2 /> Create link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function describeInvite(invite: Invite): string {
  const uses =
    invite.maxUses === null ? `${invite.uses} joined` : `${invite.uses} of ${invite.maxUses} used`;
  if (invite.status === 'expired') return `${uses} · expired`;
  if (invite.status === 'used_up') return `${uses} · used up`;
  const expiry = invite.expiresAt
    ? `expires ${new Date(invite.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
    : 'never expires';
  return `${uses} · ${expiry}`;
}

function InviteRow({ invite }: { invite: Invite }) {
  const { world } = useWorld();
  const remove = useDeleteInvite(world.id);
  const dead = invite.status !== 'active';
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {ROLE_LABELS[invite.role]} link{invite.label ? `: ${invite.label}` : ''}
        </p>
        <p className="truncate text-xs text-muted-foreground">{describeInvite(invite)}</p>
      </div>
      {dead ? <Badge className="text-muted-foreground">Not working</Badge> : null}
      <ConfirmDialog
        title="Cancel this link?"
        description="It stops working at once. People who already joined with it stay in the world."
        confirmLabel="Cancel link"
        onConfirm={async () => {
          try {
            await remove.mutateAsync(invite.id);
            toast.success('Link cancelled');
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
        trigger={
          <Button variant="ghost" size="icon-sm" title="Cancel link">
            <Trash2 />
            <span className="sr-only">Cancel this link</span>
          </Button>
        }
      />
    </li>
  );
}

export function PeoplePage() {
  const { world, base } = useWorld();
  const { data: session } = useSession();
  const isOwner = world.role === 'owner';
  const members = useMembers(world.id);
  const invites = useInvites(world.id);

  if (!isOwner) {
    return (
      <EmptyState title="Only the owner manages people">
        <p>Ask the owner of {world.name} if you need to change who is in it.</p>
      </EmptyState>
    );
  }

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <Link
          to={`${base}/settings`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3" /> World settings
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-semibold">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite players to see the world you share with them, readers to see the lore you share
          with readers, and co-GMs to help you build it. Use <strong>View as</strong> in the sidebar
          to check what each of them will see.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Members</h2>
        {members.isPending ? (
          <PageSpinner />
        ) : members.isError ? (
          <p className="text-sm text-destructive">{errorMessage(members.error)}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {members.data.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                isYou={member.userId === session?.user.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold">Invite links</h2>
          <NewInviteDialog />
        </div>
        {invites.isPending ? (
          <PageSpinner />
        ) : invites.isError ? (
          <p className="text-sm text-destructive">{errorMessage(invites.error)}</p>
        ) : invites.data.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {invites.data.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Link2 />} title="No invite links yet">
            <p>Make a link and send it to your group. They sign up or sign in, and they are in.</p>
          </EmptyState>
        )}
        <p className="text-xs text-muted-foreground">
          A link works for whoever holds it, so share it only with the people you mean. You can
          cancel it at any time. Everyone you invite sees nothing until you share it with their
          role: new entries, maps and pictures start out GM-only.
        </p>
      </section>
    </div>
  );
}

export { PeoplePage as Component };
