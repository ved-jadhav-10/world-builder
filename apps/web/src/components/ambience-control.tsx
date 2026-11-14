import { Check, Music2, Pause, Play, Volume2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ambience, useAmbience } from '@/lib/ambience/player';
import { sceneById, SCENES } from '@/lib/ambience/scenes';
import { cn } from '@/lib/utils';

/** A tiny meter that moves while sound is playing (and holds still when motion is unwelcome). */
function Bars({ on }: { on: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] origin-bottom rounded-full bg-primary',
            on ? 'motion-safe:animate-[ambience-bar_1.1s_ease-in-out_infinite]' : 'h-1',
          )}
          style={on ? { height: '100%', animationDelay: `${i * 0.18}s` } : undefined}
        />
      ))}
    </span>
  );
}

function Panel() {
  const state = useAmbience();
  return (
    <div className="p-2 text-sm">
      <p className="px-2 pb-1 pt-1.5 text-[13px] text-muted-foreground">
        Music and weather for the desk or the table, made in your browser.
      </p>
      <ul>
        {SCENES.map((scene) => {
          const chosen = scene.id === state.sceneId;
          return (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => ambience.play(scene.id)}
                aria-pressed={chosen && state.playing}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted',
                  chosen && 'bg-muted',
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {chosen && state.playing ? (
                    <Bars on />
                  ) : chosen ? (
                    <Check className="size-4 text-primary" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{scene.name}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {scene.blurb}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 space-y-3 border-t px-2 pb-2 pt-3">
        <label className="flex items-center gap-2.5">
          <Volume2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            onChange={(event) => ambience.setVolume(Number(event.target.value))}
            className="h-5 w-full accent-primary"
          />
        </label>
        <label className="block">
          <span className="flex justify-between text-[13px] text-muted-foreground">
            <span>Weather</span>
            <span>Music</span>
          </span>
          <span className="sr-only">Balance between weather and music</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.blend}
            onChange={(event) => ambience.setBlend(Number(event.target.value))}
            className="h-5 w-full accent-primary"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * The ambience player's control. In the sidebar it is a row (play or pause, and the scene's name
 * opens the picker); as an icon it is one small button for tight headers.
 */
export function AmbienceControl({ variant = 'row' }: { variant?: 'row' | 'icon' }) {
  const state = useAmbience();
  const scene = sceneById(state.sceneId);

  if (variant === 'icon') {
    return (
      <Popover>
        <PopoverTrigger
          className="relative flex size-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
          aria-label="Ambience: music and weather"
        >
          <Music2 className="size-4" />
          {state.playing ? (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-serif text-lg font-medium">Ambience</span>
            <button
              type="button"
              onClick={() => ambience.toggle()}
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
              aria-label={state.playing ? 'Pause the ambience' : 'Play the ambience'}
            >
              {state.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
          </div>
          <Panel />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-md">
      <button
        type="button"
        onClick={() => ambience.toggle()}
        className="flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={state.playing ? 'Pause the ambience' : 'Play the ambience'}
        title={state.playing ? 'Pause' : 'Play music and weather'}
      >
        {state.playing ? <Pause /> : <Play />}
      </button>
      <Popover>
        <PopoverTrigger
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
          aria-label={`Ambience: ${scene?.name ?? 'choose a scene'}`}
        >
          <span className="min-w-0 flex-1 truncate">{scene?.name ?? 'Ambience'}</span>
          <Bars on={state.playing} />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72">
          <Panel />
        </PopoverContent>
      </Popover>
    </div>
  );
}
