import { useSyncExternalStore } from 'react';
import { sceneById, SCENES, startScene, type RunningScene } from './scenes';

/*
 * The one ambience player for the whole app. It lives outside React so the sound carries on
 * while you move between pages. Sound only ever starts from a click (browsers require that, and
 * it is the polite thing anyway); the last scene and levels are remembered on this device.
 */

export interface AmbienceState {
  /** The scene chosen, whether or not it is sounding. */
  sceneId: string;
  playing: boolean;
  /** Overall loudness, 0 to 1. */
  volume: number;
  /** 0 is weather only, 1 is music only, 0.5 is both in full. */
  blend: number;
}

const KEY = 'atlas-ambience';
const LOOKAHEAD = 3;
const TICK_MS = 250;

function load(): AmbienceState {
  const fallback: AmbienceState = {
    sceneId: SCENES[0]!.id,
    playing: false,
    volume: 0.7,
    blend: 0.5,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AmbienceState> | null;
    if (!saved) return fallback;
    return {
      sceneId: sceneById(saved.sceneId)?.id ?? fallback.sceneId,
      playing: false,
      volume: clamp(Number(saved.volume ?? fallback.volume)),
      blend: clamp(Number(saved.blend ?? fallback.blend)),
    };
  } catch {
    return fallback;
  }
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

/** Music and weather levels for a blend position; both are full in the middle. */
export function balanceFor(blend: number) {
  return {
    music: Math.min(1, blend * 2),
    weather: Math.min(1, (1 - blend) * 2),
  };
}

let state = load();
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let running: RunningScene | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function set(patch: Partial<AmbienceState>) {
  state = { ...state, ...patch };
  try {
    const { sceneId, volume, blend } = state;
    localStorage.setItem(KEY, JSON.stringify({ sceneId, volume, blend }));
  } catch {
    // Not remembered in a private window.
  }
  listeners.forEach((listener) => listener());
}

/** The loudness curve: quiet settings stay usable instead of bunching at the bottom. */
function gainFor(volume: number): number {
  return volume ** 1.6 * 0.9;
}

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' });
    master = ctx.createGain();
    master.gain.value = gainFor(state.volume);
    // A gentle limiter, so a thunderclap over a full chord never clips.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.3;
    master.connect(limiter).connect(ctx.destination);
  }
  return ctx;
}

function begin(sceneId: string) {
  const scene = sceneById(sceneId);
  if (!scene) return;
  const audio = ensureContext();
  void audio.resume();
  const now = audio.currentTime;
  // Cross-fade: the old scene leaves as the new one arrives.
  if (running) {
    const leaving = running;
    leaving.output.gain.cancelScheduledValues(now);
    leaving.output.gain.setTargetAtTime(0, now, 0.5);
    leaving.stop(now + 3);
    setTimeout(() => leaving.output.disconnect(), 3500);
  }
  running = startScene(audio, scene, master!, {
    startAt: now + 0.1,
    balance: balanceFor(state.blend),
  });
  running.output.gain.setValueAtTime(0, now);
  running.output.gain.linearRampToValueAtTime(1, now + 1.8);
  running.scheduleUntil(now + LOOKAHEAD);
  if (!timer) {
    timer = setInterval(() => {
      if (ctx && running) running.scheduleUntil(ctx.currentTime + LOOKAHEAD);
    }, TICK_MS);
  }
}

export const ambience = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Start the chosen scene, or another one. Must be called from a click or key press. */
  play(sceneId: string = state.sceneId) {
    if (!sceneById(sceneId)) return;
    begin(sceneId);
    set({ sceneId, playing: true });
  },
  pause() {
    if (ctx && running) {
      const now = ctx.currentTime;
      const leaving = running;
      leaving.output.gain.cancelScheduledValues(now);
      leaving.output.gain.setTargetAtTime(0, now, 0.25);
      leaving.stop(now + 1.5);
      running = null;
      const audio = ctx;
      setTimeout(() => {
        leaving.output.disconnect();
        // Give the device its audio hardware back while nothing is sounding.
        if (!running) void audio.suspend();
      }, 1600);
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    set({ playing: false });
  },
  toggle() {
    if (state.playing) ambience.pause();
    else ambience.play();
  },
  /** Choose a scene; it starts sounding only if something is already playing. */
  choose(sceneId: string) {
    if (!sceneById(sceneId)) return;
    if (state.playing) ambience.play(sceneId);
    else set({ sceneId });
  },
  setVolume(volume: number) {
    const value = clamp(volume);
    if (ctx && master) master.gain.setTargetAtTime(gainFor(value), ctx.currentTime, 0.05);
    set({ volume: value });
  },
  setBlend(blend: number) {
    const value = clamp(blend);
    running?.setBalance(balanceFor(value));
    set({ blend: value });
  },
};

export function useAmbience(): AmbienceState {
  return useSyncExternalStore(ambience.subscribe, ambience.getState, ambience.getState);
}
