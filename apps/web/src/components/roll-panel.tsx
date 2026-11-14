import { Dices, Eye, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  formatRange,
  parseDice,
  type DiceResult,
  type InlineRoll,
  type RollLogEntry,
  type TableRollResult,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useClearRolls, useRollDice, useRolls } from '@/api/table-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { cn, timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const QUICK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

/** The dice of one rolled term: dropped dice (from keep highest/lowest) are struck through. */
function DiceFaces({ dice }: { dice: DiceResult }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {dice.terms.map((term, index) => (
        <span key={index} className="inline-flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">
            {term.sign === -1 ? '−' : index > 0 ? '+' : ''}
          </span>
          {term.kind === 'constant' ? (
            <span className="tabular-nums">{term.label}</span>
          ) : (
            term.dice.map((die, i) => (
              <span
                key={i}
                title={die.kept ? undefined : 'Dropped'}
                className={cn(
                  'inline-flex min-w-6 items-center justify-center rounded border bg-card px-1 text-[13px] tabular-nums',
                  !die.kept && 'text-muted-foreground line-through opacity-60',
                )}
              >
                {die.value}
              </span>
            ))
          )}
        </span>
      ))}
    </span>
  );
}

function InlineRolls({ inline }: { inline: InlineRoll[] }) {
  if (inline.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1 border-l-2 pl-2 text-xs text-muted-foreground">
      {inline.map((roll, index) => (
        <li key={index}>
          {roll.kind === 'dice' ? (
            <>
              {roll.source} → <DiceFaces dice={roll.dice} /> = {roll.dice.total}
            </>
          ) : roll.kind === 'table' ? (
            <>
              {roll.result.tableName} (rolled {roll.result.roll}): {roll.result.result}
            </>
          ) : (
            <span className="text-destructive">
              {roll.source}: {roll.reason}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A roll as the table sees it: what was rolled, the dice, and the answer. */
export function RollResult({ entry, big = false }: { entry: RollLogEntry; big?: boolean }) {
  if (entry.kind === 'dice') {
    const dice = entry.detail as DiceResult;
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-muted-foreground">{entry.label}</p>
          <DiceFaces dice={dice} />
        </div>
        <p
          className={cn('font-serif font-semibold tabular-nums', big ? 'text-4xl' : 'text-2xl')}
          aria-label={`Total ${dice.total}`}
        >
          {dice.total}
        </p>
      </div>
    );
  }
  const table = entry.detail as TableRollResult;
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {table.tableName} · rolled {table.roll} of {table.total} (row {formatRange(table.range)})
      </p>
      <p className={cn('mt-0.5 leading-snug', big ? 'text-lg font-medium' : 'font-medium')}>
        {table.result}
      </p>
      <InlineRolls inline={table.inline} />
    </div>
  );
}

/**
 * Rolls dice, and lists the latest rolls. The GM rolls (and can show a roll to the players);
 * everyone else sees only the rolls the GM shared.
 */
export function RollPanel({
  className,
  compact = false,
}: {
  className?: string;
  /** For a small widget: no heading, and only the latest few rolls. */
  compact?: boolean;
}) {
  const { world, canEdit, audience } = useWorld();
  const isGm = canEdit && audience === 'gm';
  const { data: rolls, isPending } = useRolls(world.id, compact ? 6 : 30);
  const roll = useRollDice(world.id);
  const clear = useClearRolls(world.id);
  const [expression, setExpression] = useState('');
  const [share, setShare] = useState(false);

  const throwDice = (text: string) => {
    const parsed = parseDice(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    roll.mutate(
      { expression: text, visibility: share ? 'player' : 'gm' },
      { onError: (error) => toast.error(errorMessage(error)) },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    throwDice(expression);
  };

  return (
    // In a widget the frame already names it, so it is not a second landmark.
    <section
      aria-label={compact ? undefined : 'Dice and roll log'}
      className={cn('space-y-4', className)}
    >
      {compact ? null : (
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
          <Dices className="size-5" /> Dice
        </h2>
      )}

      {isGm ? (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <form onSubmit={submit} className="flex gap-2">
            <Input
              aria-label="Dice expression"
              placeholder="2d6+3, 4d6kh3, d20…"
              value={expression}
              onChange={(event) => setExpression(event.target.value)}
              maxLength={200}
              spellCheck={false}
            />
            <Button type="submit" disabled={roll.isPending || !expression.trim()}>
              Roll
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_DICE.map((die) => (
              <Button
                key={die}
                variant="outline"
                size="sm"
                disabled={roll.isPending}
                onClick={() => throwDice(die)}
              >
                {die}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => setShare(event.target.checked)}
              className="size-4 accent-primary"
            />
            Show my rolls to the players
          </label>
          <p className="text-xs text-muted-foreground">
            <code>4d6kh3</code> keeps the highest 3, <code>2d20kl1</code> the lowest 1,{' '}
            <code>3d6!</code> explodes on a 6.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Roll log</h3>
          {isGm && rolls?.length ? (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Trash2 /> Clear
                </Button>
              }
              title="Clear the roll log?"
              description="This removes every roll from the log, for you and for the players."
              confirmLabel="Clear log"
              onConfirm={() =>
                clear.mutateAsync().catch((error) => toast.error(errorMessage(error)))
              }
            />
          ) : null}
        </div>
        {isPending ? (
          <Spinner />
        ) : rolls?.length ? (
          <ul className="space-y-2">
            {rolls.map((entry, index) => (
              <li
                key={entry.id}
                className={cn(
                  'rounded-lg border bg-card p-3 text-sm',
                  index === 0 && 'border-primary/40',
                )}
              >
                <RollResult entry={entry} big={index === 0} />
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {entry.rolledBy?.name ?? 'Someone'} · {timeAgo(entry.createdAt)}
                  {isGm && entry.visibility === 'player' ? (
                    <span className="inline-flex items-center gap-1" title="Shown to the players">
                      <Eye className="size-3" /> shared
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isGm ? 'Nothing rolled yet.' : 'The GM has not shared any rolls yet.'}
          </p>
        )}
      </div>
    </section>
  );
}
