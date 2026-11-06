import { ExternalLink, Minus, Plus, Trash2, Zap } from 'lucide-react';
import {
  CHARACTER_INTERVIEW_QUESTIONS,
  MAX_PALETTE_COLORS,
  type Ability,
  type LabelledLink,
  type ShopItem,
  type QaPair,
} from '@atlas/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/inputs';

interface ListProps<T> {
  id: string;
  value: unknown;
  onChange: (value: T[]) => void;
  disabled?: boolean;
}

const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** A row of colour swatches: the colours a character wears, or a place is painted in. */
export function PaletteField({ id, value, onChange, disabled }: ListProps<string>) {
  const colors = asList<string>(value);
  return (
    <div id={id} className="flex flex-wrap items-center gap-2">
      {colors.map((color, index) => (
        <span key={index} className="inline-flex items-center gap-1 rounded-md border bg-card p-1">
          <input
            type="color"
            aria-label={`Colour ${index + 1}`}
            disabled={disabled}
            value={color}
            onChange={(event) =>
              onChange(colors.map((c, i) => (i === index ? event.target.value : c)))
            }
            className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="font-mono text-xs text-muted-foreground">{color}</span>
          {disabled ? null : (
            <button
              type="button"
              aria-label={`Remove colour ${index + 1}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(colors.filter((_, i) => i !== index))}
            >
              <Minus className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && colors.length < MAX_PALETTE_COLORS ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...colors, colors.at(-1) ?? '#b45309'])}
        >
          <Plus /> Add a colour
        </Button>
      ) : colors.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : null}
    </div>
  );
}

const newAbility = (): Ability => ({ name: '', description: '', charges: null });

/** Things someone can do, each with an optional number of uses that come back on a rest. */
export function AbilitiesField({ id, value, onChange, disabled }: ListProps<Ability>) {
  const abilities = asList<Ability>(value);
  const patch = (index: number, next: Partial<Ability>) =>
    onChange(abilities.map((a, i) => (i === index ? { ...a, ...next } : a)));

  return (
    <div id={id} className="space-y-2">
      {abilities.map((ability, index) => {
        const charges = ability.charges;
        return (
          <div key={index} className="space-y-1.5 rounded-lg border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Ability ${index + 1} name`}
                placeholder="Second wind"
                maxLength={80}
                disabled={disabled}
                value={ability.name}
                onChange={(event) => patch(index, { name: event.target.value })}
              />
              {disabled ? null : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onChange(abilities.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                  <span className="sr-only">Remove ability {index + 1}</span>
                </Button>
              )}
            </div>
            {ability.description || !disabled ? (
              <Textarea
                aria-label={`Ability ${index + 1} description`}
                rows={1}
                className="min-h-9"
                maxLength={1000}
                disabled={disabled}
                placeholder="What it does."
                value={ability.description}
                onChange={(event) => patch(index, { description: event.target.value })}
              />
            ) : null}
            {charges ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Zap className="size-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  max={charges.max}
                  className="w-16"
                  aria-label={`Ability ${index + 1} charges left`}
                  disabled={disabled}
                  value={charges.current}
                  onChange={(event) =>
                    patch(index, {
                      charges: {
                        ...charges,
                        current: Math.min(charges.max, Math.max(0, Number(event.target.value))),
                      },
                    })
                  }
                />
                <span className="text-muted-foreground">of</span>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  className="w-16"
                  aria-label={`Ability ${index + 1} maximum charges`}
                  disabled={disabled}
                  value={charges.max}
                  onChange={(event) => {
                    const max = Math.min(99, Math.max(1, Number(event.target.value)));
                    patch(index, {
                      charges: { ...charges, max, current: Math.min(charges.current, max) },
                    });
                  }}
                />
                <Input
                  className="min-w-28 flex-1"
                  aria-label={`Ability ${index + 1} recharge`}
                  placeholder="comes back on a long rest"
                  maxLength={40}
                  disabled={disabled}
                  value={charges.recharge}
                  onChange={(event) =>
                    patch(index, { charges: { ...charges, recharge: event.target.value } })
                  }
                />
                {disabled ? null : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={charges.current === 0}
                      onClick={() =>
                        patch(index, { charges: { ...charges, current: charges.current - 1 } })
                      }
                    >
                      Use one
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={charges.current === charges.max}
                      onClick={() =>
                        patch(index, { charges: { ...charges, current: charges.max } })
                      }
                    >
                      Recharge
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => patch(index, { charges: null })}
                    >
                      No limit
                    </button>
                  </>
                )}
              </div>
            ) : disabled ? null : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => patch(index, { charges: { max: 1, current: 1, recharge: '' } })}
              >
                Limit the uses
              </button>
            )}
          </div>
        );
      })}
      {disabled ? (
        abilities.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...abilities, newAbility()])}
        >
          <Plus /> Add an ability
        </Button>
      )}
    </div>
  );
}

/** Questions with answers, such as a character interview. */
export function QaField({ id, value, onChange, disabled }: ListProps<QaPair>) {
  const pairs = asList<QaPair>(value);
  const patch = (index: number, next: Partial<QaPair>) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, ...next } : p)));
  const missing = CHARACTER_INTERVIEW_QUESTIONS.filter((q) => !pairs.some((p) => p.question === q));

  return (
    <div id={id} className="space-y-2">
      {pairs.map((pair, index) => (
        <div key={index} className="space-y-1 rounded-lg border bg-card p-2.5">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Question ${index + 1}`}
              maxLength={200}
              disabled={disabled}
              value={pair.question}
              onChange={(event) => patch(index, { question: event.target.value })}
            />
            {disabled ? null : (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onChange(pairs.filter((_, i) => i !== index))}
              >
                <Trash2 />
                <span className="sr-only">Remove question {index + 1}</span>
              </Button>
            )}
          </div>
          <Textarea
            aria-label={`Answer ${index + 1}`}
            rows={2}
            className="min-h-14"
            maxLength={2000}
            disabled={disabled}
            value={pair.answer}
            onChange={(event) => patch(index, { answer: event.target.value })}
          />
        </div>
      ))}
      {disabled ? (
        pairs.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...pairs, { question: '', answer: '' }])}
          >
            <Plus /> Add a question
          </Button>
          {missing.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange([...pairs, ...missing.map((question) => ({ question, answer: '' }))])
              }
            >
              Add the classic interview questions
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

const newShopItem = (): ShopItem => ({ name: '', price: '', stock: null, description: '' });

/** What a shop or merchant sells: a price, how many are left (or no limit) and a note. */
export function InventoryField({ id, value, onChange, disabled }: ListProps<ShopItem>) {
  const items = asList<ShopItem>(value);
  const patch = (index: number, next: Partial<ShopItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div id={id} className="space-y-2">
      {items.map((item, index) => {
        const label = item.name || `item ${index + 1}`;
        return (
          <div key={index} className="space-y-1.5 rounded-lg border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Name of ${label}`}
                placeholder="Item"
                maxLength={80}
                disabled={disabled}
                value={item.name}
                onChange={(event) => patch(index, { name: event.target.value })}
              />
              <Input
                aria-label={`Price of ${label}`}
                placeholder="Price, e.g. 5 gp"
                maxLength={40}
                className="w-36 shrink-0"
                disabled={disabled}
                value={item.price}
                onChange={(event) => patch(index, { price: event.target.value })}
              />
              {disabled ? null : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                  <span className="sr-only">Remove {label}</span>
                </Button>
              )}
            </div>
            <Input
              aria-label={`Note on ${label}`}
              placeholder="Note (optional)"
              maxLength={500}
              disabled={disabled}
              value={item.description}
              onChange={(event) => patch(index, { description: event.target.value })}
            />
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {item.stock === null ? (
                <>
                  <span>No limit</span>
                  {disabled ? null : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => patch(index, { stock: 1 })}
                    >
                      Limit the stock
                    </button>
                  )}
                </>
              ) : (
                <>
                  {disabled ? null : (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={item.stock <= 0}
                      onClick={() => patch(index, { stock: Math.max(0, (item.stock ?? 0) - 1) })}
                    >
                      <Minus />
                      <span className="sr-only">Sell one {label}</span>
                    </Button>
                  )}
                  <span className="tabular-nums">
                    {item.stock === 0 ? 'Sold out' : `${item.stock} in stock`}
                  </span>
                  {disabled ? null : (
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        onClick={() => patch(index, { stock: (item.stock ?? 0) + 1 })}
                      >
                        <Plus />
                        <span className="sr-only">Restock {label}</span>
                      </Button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => patch(index, { stock: null })}
                      >
                        No limit
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {disabled ? (
        items.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...items, newShopItem()])}
        >
          <Plus /> Add an item
        </Button>
      )}
    </div>
  );
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** Named links, such as a location's soundtrack. Read-only, they are plain links that open anew. */
export function LinksField({ id, value, onChange, disabled }: ListProps<LabelledLink>) {
  const links = asList<LabelledLink>(value);
  const patch = (index: number, next: Partial<LabelledLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...next } : link)));

  return (
    <div id={id} className="space-y-2">
      {links.map((link, index) =>
        disabled ? (
          isHttpUrl(link.url) ? (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm underline"
            >
              <ExternalLink className="size-3.5" /> {link.label || link.url}
            </a>
          ) : null
        ) : (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Name of link ${index + 1}`}
              placeholder="Name"
              maxLength={80}
              className="w-40 shrink-0"
              value={link.label}
              onChange={(event) => patch(index, { label: event.target.value })}
            />
            <Input
              aria-label={`Address of link ${index + 1}`}
              type="url"
              placeholder="https://"
              maxLength={2000}
              value={link.url}
              onChange={(event) => patch(index, { url: event.target.value })}
            />
            {isHttpUrl(link.url) ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open link"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onChange(links.filter((_, i) => i !== index))}
            >
              <Trash2 />
              <span className="sr-only">Remove link {index + 1}</span>
            </Button>
          </div>
        ),
      )}
      {disabled ? (
        links.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...links, { label: '', url: '' }])}
        >
          <Plus /> Add a link
        </Button>
      )}
    </div>
  );
}
