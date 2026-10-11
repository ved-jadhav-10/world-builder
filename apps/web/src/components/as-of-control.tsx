import { Clock } from 'lucide-react';
import { useState } from 'react';
import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useScenes, type AsOf } from '@/lib/as-of';
import { useDates } from '@/lib/use-dates';

type Mode = 'latest' | 'scene' | 'day';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'latest', label: 'Latest' },
  { mode: 'scene', label: 'At a scene' },
  { mode: 'day', label: 'On a date' },
];

/** Chooses the point in the story to view an entry at: the latest, a scene, or an in-world date. */
export function AsOfControl({
  value,
  onChange,
}: {
  value: AsOf | null;
  onChange: (value: AsOf | null) => void;
}) {
  const { options } = useScenes();
  const dates = useDates();
  const [mode, setMode] = useState<Mode>(value?.kind ?? 'latest');

  const summary = !value
    ? 'Latest'
    : value.kind === 'scene'
      ? (options.find((o) => o.id === value.sceneId)?.label ?? 'A deleted scene')
      : dates.date(value.day);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value ? 'default' : 'outline'}
          size="sm"
          className="max-w-72"
        >
          <Clock />
          <span className="shrink-0">As of</span>
          <span className="truncate font-normal">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] space-y-3 p-3">
        <p className="text-sm text-muted-foreground">
          See this entry as it stands at a point in the story, with each change up to then applied.
        </p>
        <div role="radiogroup" aria-label="View as of" className="flex gap-1">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={mode === option.mode}
              onClick={() => {
                setMode(option.mode);
                if (option.mode === 'latest') onChange(null);
              }}
              className={
                mode === option.mode
                  ? 'rounded-md bg-accent px-2.5 py-1 text-[13px] font-medium text-accent-foreground'
                  : 'rounded-md px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-muted'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        {mode === 'scene' ? (
          options.length > 0 ? (
            <NativeSelect
              aria-label="Scene"
              value={value?.kind === 'scene' ? value.sceneId : ''}
              onChange={(event) =>
                event.target.value && onChange({ kind: 'scene', sceneId: event.target.value })
              }
            >
              <option value="">Choose a scene…</option>
              {options.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.label}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <p className="text-sm text-muted-foreground">
              There are no scenes in the manuscript yet.
            </p>
          )
        ) : null}
        {mode === 'day' ? (
          <DateField
            label="As of date"
            value={value?.kind === 'day' ? value.day : null}
            onChange={(day) => day !== null && onChange({ kind: 'day', day })}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
