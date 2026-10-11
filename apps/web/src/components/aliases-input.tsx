import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/** Chip input for alternative names; Enter or comma adds, Backspace removes the last. */
export function AliasesInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const alias = draft.trim();
    if (alias && !value.includes(alias)) onChange([...value, alias]);
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">Also known as</span>
      {value.map((alias) => (
        <span
          key={alias}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"
        >
          {alias}
          {!disabled ? (
            <button
              type="button"
              aria-label={`Remove ${alias}`}
              onClick={() => onChange(value.filter((a) => a !== alias))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          maxLength={200}
          placeholder={value.length ? 'Add another…' : 'Add an alias…'}
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      ) : null}
    </div>
  );
}
