import { ChevronRight, Heart, Plus, Shuffle, X } from 'lucide-react';
import { useState } from 'react';
import {
  MAX_COMBATANTS,
  MAX_CONDITIONS,
  applyDamage,
  insertCombatant,
  isDown,
  nextTurn,
  removeCombatant,
  startCombat,
  type Combatant,
  type GmWidget,
  type InitiativeState,
} from '@atlas/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';

type Widget = Extract<GmWidget, { type: 'initiative' }>;

const COMMON_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Frightened',
  'Grappled',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

const toInt = (value: string): number | null => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

function CombatantRow({
  combatant,
  active,
  onChange,
  onRemove,
}: {
  combatant: Combatant;
  active: boolean;
  onChange: (next: Combatant) => void;
  onRemove: () => void;
}) {
  const [delta, setDelta] = useState('');
  const down = isDown(combatant);
  const amount = toInt(delta);
  const usable = amount !== null && amount > 0;
  return (
    <li
      aria-current={active ? 'step' : undefined}
      className={cn(
        'space-y-1.5 rounded-md border bg-card p-2 text-sm',
        active && 'border-primary ring-1 ring-primary',
        down && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label={`Initiative of ${combatant.name}`}
          value={combatant.initiative ?? ''}
          placeholder="Init"
          onChange={(event) => onChange({ ...combatant, initiative: toInt(event.target.value) })}
          className="h-8 w-16 px-2 text-center tabular-nums"
        />
        <span className={cn('min-w-0 flex-1 truncate font-medium', down && 'line-through')}>
          {combatant.name}
        </span>
        {combatant.hp !== null ? (
          <span className="tabular-nums" aria-label={`${combatant.hp} hit points`}>
            <Heart className="mr-1 inline size-3.5 text-destructive" />
            {combatant.hp}
            {combatant.maxHp !== null ? ` / ${combatant.maxHp}` : ''}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${combatant.name}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {combatant.hp !== null ? (
          <>
            <Input
              type="number"
              aria-label={`Amount for ${combatant.name}`}
              value={delta}
              placeholder="Amount"
              onChange={(event) => setDelta(event.target.value)}
              className="h-8 w-24 px-2 tabular-nums"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!usable}
              onClick={() => {
                onChange(applyDamage(combatant, amount ?? 0));
                setDelta('');
              }}
            >
              Damage
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!usable}
              onClick={() => {
                onChange(applyDamage(combatant, -(amount ?? 0)));
                setDelta('');
              }}
            >
              Heal
            </Button>
          </>
        ) : null}
        <select
          aria-label={`Add a condition to ${combatant.name}`}
          value=""
          disabled={combatant.conditions.length >= MAX_CONDITIONS}
          onChange={(event) => {
            const condition = event.target.value;
            if (condition && !combatant.conditions.includes(condition)) {
              onChange({ ...combatant, conditions: [...combatant.conditions, condition] });
            }
          }}
          className="h-8 rounded-md border bg-card px-2 text-[13px]"
        >
          <option value="">+ Condition</option>
          {COMMON_CONDITIONS.filter((c) => !combatant.conditions.includes(c)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {combatant.conditions.map((condition) => (
          <button
            key={condition}
            type="button"
            aria-label={`Clear ${condition} from ${combatant.name}`}
            onClick={() =>
              onChange({
                ...combatant,
                conditions: combatant.conditions.filter((c) => c !== condition),
              })
            }
            className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-muted/60"
          >
            {condition} <X className="size-3" />
          </button>
        ))}
      </div>
    </li>
  );
}

export function InitiativeWidget({
  widget,
  onChange,
}: {
  widget: Widget;
  onChange: (patch: Partial<Widget>) => void;
}) {
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState('');
  const [hp, setHp] = useState('');
  const state: InitiativeState = widget;
  const set = (next: InitiativeState) =>
    onChange({ combatants: next.combatants, round: next.round, turn: next.turn });

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || widget.combatants.length >= MAX_COMBATANTS) return;
    const maxHp = toInt(hp);
    const tracked = maxHp !== null && maxHp > 0 ? maxHp : null;
    set(
      insertCombatant(state, {
        id: crypto.randomUUID().slice(0, 8),
        name: trimmed,
        initiative: toInt(initiative),
        hp: tracked,
        maxHp: tracked,
        conditions: [],
        entityId: null,
      }),
    );
    setName('');
    setInitiative('');
    setHp('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium tabular-nums">Round {widget.round}</span>
        <Button
          size="sm"
          disabled={widget.combatants.length === 0}
          onClick={() => set(nextTurn(state))}
        >
          Next turn <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={widget.combatants.length === 0}
          onClick={() => set(startCombat(state))}
        >
          <Shuffle /> Sort and restart
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={widget.combatants.length === 0}
          onClick={() => set({ combatants: [], round: 1, turn: 0 })}
        >
          Clear
        </Button>
      </div>

      {widget.combatants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add the people in the fight. They sort by initiative, and turns skip anyone at 0 HP.
        </p>
      ) : (
        <ol className="space-y-1.5" aria-label="Turn order">
          {widget.combatants.map((combatant, index) => (
            <CombatantRow
              key={combatant.id}
              combatant={combatant}
              active={index === widget.turn}
              onChange={(next) =>
                set({
                  ...state,
                  combatants: widget.combatants.map((c) => (c.id === next.id ? next : c)),
                })
              }
              onRemove={() => set(removeCombatant(state, combatant.id))}
            />
          ))}
        </ol>
      )}

      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="Combatant name"
          value={name}
          maxLength={80}
          placeholder="Name"
          onChange={(event) => setName(event.target.value)}
          className="h-8 min-w-28 flex-1"
        />
        <Input
          type="number"
          aria-label="New combatant initiative"
          value={initiative}
          placeholder="Init"
          onChange={(event) => setInitiative(event.target.value)}
          className="h-8 w-16 px-2"
        />
        <Input
          type="number"
          aria-label="New combatant hit points"
          value={hp}
          placeholder="HP"
          onChange={(event) => setHp(event.target.value)}
          className="h-8 w-16 px-2"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}
