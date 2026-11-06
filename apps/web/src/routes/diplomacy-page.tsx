import { Handshake, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  diplomacyLabel,
  MAX_DIPLOMACY_SCORE,
  MIN_DIPLOMACY_SCORE,
  type DiplomacyScore,
  type Visibility,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useDeleteDiplomacy, useDiplomacy, useSetDiplomacy } from '@/api/diplomacy-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityPicker, type PickedEntity } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { VisibilityBadge, VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

/** Red for enemies through grey to green for allies. */
function standingColor(score: number): string {
  const strength = Math.min(1, Math.abs(score) / 100);
  const hue = score < 0 ? 5 : 140;
  return `hsl(${hue} ${Math.round(15 + strength * 55)}% ${Math.round(60 - strength * 12)}%)`;
}

/** The entries with a standing, on a ring, joined by lines coloured by how they stand. */
function Web({ scores }: { scores: DiplomacyScore[] }) {
  const { base } = useWorld();
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of scores) {
      seen.set(s.a.id, s.a.name);
      seen.set(s.b.id, s.b.name);
    }
    return [...seen.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  }, [scores]);

  const size = 560;
  const center = size / 2;
  const radius = 190;
  const at = (index: number) => {
    const angle = (index / people.length) * Math.PI * 2 - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle), angle };
  };
  const position = new Map(people.map(([id], i) => [id, at(i)]));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Web of standings between entries"
      className="mx-auto w-full max-w-xl"
    >
      {scores.map((s) => {
        const from = position.get(s.a.id)!;
        const to = position.get(s.b.id)!;
        return (
          <line
            key={s.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={standingColor(s.score)}
            strokeWidth={1.5 + Math.abs(s.score) / 25}
            strokeLinecap="round"
          >
            <title>{`${s.a.name} and ${s.b.name}: ${diplomacyLabel(s.score)} (${s.score})`}</title>
          </line>
        );
      })}
      {people.map(([id, name], i) => {
        const p = at(i);
        const right = Math.cos(p.angle) >= 0;
        const label = name.length > 22 ? `${name.slice(0, 21)}…` : name;
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={7} className="fill-primary" />
            <Link to={`${base}/e/${id}`}>
              <text
                x={p.x + (right ? 12 : -12)}
                y={p.y + 4}
                textAnchor={right ? 'start' : 'end'}
                className="fill-foreground text-[12px]"
              >
                {label}
              </text>
            </Link>
          </g>
        );
      })}
    </svg>
  );
}

function PairPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PickedEntity | null;
  onChange: (entity: PickedEntity) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <EntityPicker
        onSelect={onChange}
        trigger={
          <Button type="button" variant="outline" className="w-full justify-start">
            {value ? value.name : 'Choose an entry'}
          </Button>
        }
      />
    </div>
  );
}

function StandingForm({ initial, onDone }: { initial: DiplomacyScore | null; onDone: () => void }) {
  const { world } = useWorld();
  const set = useSetDiplomacy(world.id);
  const [a, setA] = useState<PickedEntity | null>(initial?.a ?? null);
  const [b, setB] = useState<PickedEntity | null>(initial?.b ?? null);
  const [score, setScore] = useState(initial?.score ?? 0);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'gm');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!a || !b) return;
    try {
      await set.mutateAsync({ aId: a.id, bId: b.id, score, notes, visibility });
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <PairPicker label="One side" value={a} onChange={setA} />
        <PairPicker label="The other side" value={b} onChange={setB} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dip-score">
          Standing: <strong>{diplomacyLabel(score)}</strong> ({score > 0 ? `+${score}` : score})
        </Label>
        <input
          id="dip-score"
          type="range"
          min={MIN_DIPLOMACY_SCORE}
          max={MAX_DIPLOMACY_SCORE}
          step={5}
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>At war</span>
          <span>Neutral</span>
          <span>Allied</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dip-notes">Why</Label>
          <Input
            id="dip-notes"
            maxLength={1000}
            placeholder="A border war over the salt road."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dip-visibility">Who can see this</Label>
          <VisibilitySelect id="dip-visibility" value={visibility} onChange={setVisibility} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!a || !b || a.id === b.id || set.isPending}>
          Save standing
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DiplomacyPage() {
  const { world, canEdit, base } = useWorld();
  const { data: scores, isPending } = useDiplomacy(world.id);
  const remove = useDeleteDiplomacy(world.id);
  const [editing, setEditing] = useState<DiplomacyScore | 'new' | null>(null);

  if (isPending) return <PageSpinner />;
  const sorted = [...(scores ?? [])].sort((x, y) => x.score - y.score);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Politics</p>
          <h1 className="font-serif text-3xl font-semibold">Diplomacy</h1>
          <p className="mt-1 text-muted-foreground">
            How factions and other entries stand with each other, from −100 (open war) to +100
            (sworn allies).
          </p>
        </div>
        {canEdit && !editing ? (
          <Button type="button" onClick={() => setEditing('new')}>
            <Handshake /> Set a standing
          </Button>
        ) : null}
      </div>

      {editing ? (
        <StandingForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState icon={<Handshake />} title="No standings yet">
          Set how two factions feel about each other and the web fills in.
        </EmptyState>
      ) : (
        <>
          <Web scores={sorted} />
          <ul className="divide-y rounded-xl border bg-card">
            {sorted.map((s) => (
              <li key={s.id} className="group flex items-start gap-3 p-3 text-sm">
                <span
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: standingColor(s.score) }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <Link to={`${base}/e/${s.a.id}`} className="hover:underline">
                      {s.a.name}
                    </Link>{' '}
                    and{' '}
                    <Link to={`${base}/e/${s.b.id}`} className="hover:underline">
                      {s.b.name}
                    </Link>
                  </p>
                  <p className="text-muted-foreground">
                    {diplomacyLabel(s.score)} ({s.score > 0 ? `+${s.score}` : s.score})
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                {canEdit ? <VisibilityBadge visibility={s.visibility} /> : null}
                {canEdit ? (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditing(s)}
                    >
                      <Pencil />
                      <span className="sr-only">
                        Edit {s.a.name} and {s.b.name}
                      </span>
                    </Button>
                    <ConfirmDialog
                      title="Remove this standing?"
                      description={`${s.a.name} and ${s.b.name} go back to having no recorded standing.`}
                      onConfirm={() =>
                        remove
                          .mutateAsync(s.id)
                          .catch((error: unknown) => toast.error(errorMessage(error)))
                      }
                      trigger={
                        <Button type="button" variant="ghost" size="icon-sm">
                          <Trash2 />
                          <span className="sr-only">
                            Remove {s.a.name} and {s.b.name}
                          </span>
                        </Button>
                      }
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export { DiplomacyPage as Component };
