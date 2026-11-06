import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import {
  MAX_LOOT_ITEMS,
  MAX_PARTY_MEMBERS,
  awardDowntime,
  awardXp,
  groupByHolder,
  type GmWidget,
  type LootItem,
} from '@atlas/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';

type LootWidget = Extract<GmWidget, { type: 'loot' }>;
type PartyWidget = Extract<GmWidget, { type: 'party' }>;

const toInt = (value: string): number | null => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const newId = () => crypto.randomUUID().slice(0, 8);

/** What the party found and who is carrying it. */
export function LootWidget({
  widget,
  onChange,
}: {
  widget: LootWidget;
  onChange: (patch: Partial<LootWidget>) => void;
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [holder, setHolder] = useState('');
  const patch = (id: string, next: Partial<LootItem>) =>
    onChange({ items: widget.items.map((item) => (item.id === id ? { ...item, ...next } : item)) });
  const groups = groupByHolder(widget.items);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || widget.items.length >= MAX_LOOT_ITEMS) return;
    onChange({
      items: [
        ...widget.items,
        { id: newId(), name: trimmed, qty: 1, value: value.trim(), holder: holder.trim() },
      ],
    });
    setName('');
    setValue('');
    setHolder('');
  };

  return (
    <div className="space-y-3">
      {widget.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add what the party finds, what it is worth and who carries it.
        </p>
      ) : (
        [...groups.entries()].map(([who, items]) => (
          <section key={who} aria-label={`Carried by ${who}`} className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {who}
            </h3>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card p-1.5 text-sm"
                >
                  <Input
                    type="number"
                    min={1}
                    aria-label={`Quantity of ${item.name}`}
                    value={item.qty}
                    onChange={(event) =>
                      patch(item.id, { qty: Math.max(1, toInt(event.target.value) ?? 1) })
                    }
                    className="h-8 w-16 px-2 text-center tabular-nums"
                  />
                  <span className="min-w-24 flex-1 truncate font-medium">{item.name}</span>
                  <Input
                    aria-label={`Value of ${item.name}`}
                    value={item.value}
                    maxLength={40}
                    placeholder="Value"
                    onChange={(event) => patch(item.id, { value: event.target.value })}
                    className="h-8 w-24 px-2"
                  />
                  <Input
                    aria-label={`Carried by, for ${item.name}`}
                    value={item.holder}
                    maxLength={80}
                    placeholder="Party"
                    onChange={(event) => patch(item.id, { holder: event.target.value })}
                    className="h-8 w-24 px-2"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      onChange({ items: widget.items.filter((i) => i.id !== item.id) })
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="New loot name"
          value={name}
          maxLength={80}
          placeholder="Item"
          onChange={(event) => setName(event.target.value)}
          className="h-8 min-w-28 flex-1"
        />
        <Input
          aria-label="New loot value"
          value={value}
          maxLength={40}
          placeholder="Value"
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-24 px-2"
        />
        <Input
          aria-label="New loot carried by"
          value={holder}
          maxLength={80}
          placeholder="Party"
          onChange={(event) => setHolder(event.target.value)}
          className="h-8 w-24 px-2"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}

/** Each character's XP and downtime days, with awards for everyone at once. */
export function PartyWidget({
  widget,
  onChange,
}: {
  widget: PartyWidget;
  onChange: (patch: Partial<PartyWidget>) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const amountValue = toInt(amount);
  const daysValue = toInt(days);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || widget.members.length >= MAX_PARTY_MEMBERS) return;
    onChange({ members: [...widget.members, { id: newId(), name: trimmed, xp: 0, downtime: 0 }] });
    setName('');
  };

  return (
    <div className="space-y-3">
      {widget.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add the party's characters to track their XP.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {widget.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card p-1.5 text-sm"
              >
                <span className="min-w-24 flex-1 truncate font-medium">{member.name}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  XP
                  <Input
                    type="number"
                    min={0}
                    aria-label={`XP of ${member.name}`}
                    value={member.xp}
                    onChange={(event) =>
                      onChange({
                        members: widget.members.map((m) =>
                          m.id === member.id
                            ? { ...m, xp: Math.max(0, toInt(event.target.value) ?? 0) }
                            : m,
                        ),
                      })
                    }
                    className="h-8 w-24 px-2 tabular-nums"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Days
                  <Input
                    type="number"
                    min={0}
                    aria-label={`Downtime days of ${member.name}`}
                    value={member.downtime}
                    onChange={(event) =>
                      onChange({
                        members: widget.members.map((m) =>
                          m.id === member.id
                            ? { ...m, downtime: Math.max(0, toInt(event.target.value) ?? 0) }
                            : m,
                        ),
                      })
                    }
                    className="h-8 w-16 px-2 tabular-nums"
                  />
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.name}`}
                  onClick={() =>
                    onChange({ members: widget.members.filter((m) => m.id !== member.id) })
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="number"
              aria-label="XP to award"
              value={amount}
              placeholder="XP"
              onChange={(event) => setAmount(event.target.value)}
              className="h-8 w-24 px-2"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!amountValue}
              onClick={() => {
                onChange({ members: awardXp(widget.members, amountValue ?? 0, 'each') });
                setAmount('');
              }}
            >
              To each
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!amountValue}
              onClick={() => {
                onChange({ members: awardXp(widget.members, amountValue ?? 0, 'split') });
                setAmount('');
              }}
            >
              Split
            </Button>
            <Input
              type="number"
              aria-label="Downtime days to award"
              value={days}
              placeholder="Days"
              onChange={(event) => setDays(event.target.value)}
              className="ml-2 h-8 w-20 px-2"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!daysValue}
              onClick={() => {
                onChange({ members: awardDowntime(widget.members, daysValue ?? 0) });
                setDays('');
              }}
            >
              Give days
            </Button>
          </div>
        </>
      )}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="New party member name"
          value={name}
          maxLength={80}
          placeholder="Character"
          onChange={(event) => setName(event.target.value)}
          className="h-8 flex-1"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}
