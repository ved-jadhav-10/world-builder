/*
 * The composer: turns a scene's musical recipe into notes, one bar at a time. It is pure (no
 * audio), so it can be tested, and the same code feeds the live player and the offline renderer.
 *
 * The music is modal and slow. Harmony moves through a short chord loop; a plucked accompaniment
 * spells each chord; a melody walks a five-note subset of the mode in short phrases that repeat
 * with small changes, landing on a chord tone at the start of each bar and resting between
 * phrases. Those few rules are what keep it from sounding like random notes.
 */

export type Voice = 'harp' | 'lute' | 'flute' | 'bell' | 'pad' | 'bass';

export interface NoteEvent {
  /** Seconds from the start of the bar. */
  time: number;
  /** MIDI note number. */
  midi: number;
  /** Seconds the note is held (plucked voices ring on by themselves). */
  dur: number;
  /** Loudness, 0 to 1. */
  vel: number;
  voice: Voice;
}

/** Semitone steps of the seven-note modes used here. */
export const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
} as const;
export type ModeName = keyof typeof MODES;

export interface MusicSpec {
  bpm: number;
  beatsPerBar: number;
  /** MIDI note of the mode's first degree, around the middle of the keyboard. */
  root: number;
  mode: ModeName;
  /** Chord roots as scale degrees (0 is the home chord, -1 the one below it), one per step. */
  progression: number[];
  barsPerChord: number;
  /** A broken-chord accompaniment. `every` is the note length in beats. */
  arp?: { voice: 'harp' | 'lute'; every: number; vel: number; density: number; octave: number };
  /** A tune over the top. `rest` is how many phrases of silence follow each sung phrase. */
  melody?: { voice: 'flute' | 'harp' | 'lute' | 'bell'; vel: number; octave: number; rest: number };
  /** Held chords underneath. */
  pad?: { vel: number; octave: number };
  /** The chord's root, low, at the start of each bar. */
  bass?: { vel: number };
}

/** A repeatable random source (mulberry32). */
export function randomSource(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The MIDI note of a scale degree; degrees run past 6 into the next octave and below 0. */
export function degreeToMidi(root: number, mode: ModeName, degree: number): number {
  const steps = MODES[mode];
  const octave = Math.floor(degree / 7);
  const index = ((degree % 7) + 7) % 7;
  return root + octave * 12 + steps[index]!;
}

/** The triad on a degree, as degrees. */
function triad(chordRoot: number): number[] {
  return [chordRoot, chordRoot + 2, chordRoot + 4];
}

/**
 * The five degrees (within one octave) a melody may rest on between chord tones. Leaving out the
 * two notes a semitone from their neighbours removes most accidental clashes.
 */
function melodySet(mode: ModeName): number[] {
  const minorThird = MODES[mode][2] === 3;
  if (mode === 'phrygian') return [0, 2, 3, 4, 6];
  return minorThird ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5];
}

/** Nearest degree to `from` among those whose degree-within-octave is in `allowed`. */
function nearest(from: number, allowed: number[], direction = 0): number {
  for (let distance = 0; distance < 8; distance++) {
    const tries =
      direction >= 0 ? [from + distance, from - distance] : [from - distance, from + distance];
    for (const candidate of tries) {
      if (allowed.includes(((candidate % 7) + 7) % 7)) return candidate;
    }
  }
  return from;
}

/** Rhythms for one bar of melody, in beats; a negative number is a rest of that length. */
const RHYTHMS: Record<number, number[][]> = {
  3: [[2, 1], [1, 1, 1], [1.5, 0.5, 1], [1, 2], [3], [1, 0.5, 0.5, 1]],
  4: [
    [2, 2],
    [1, 1, 2],
    [2, 1, 1],
    [1.5, 0.5, 2],
    [1, 1, 1, 1],
    [3, 1],
    [1, 0.5, 0.5, 2],
    [2, -1, 1],
  ],
};

interface Motif {
  rhythm: number[];
  steps: number[];
}

/** What the composer remembers between bars. */
export interface ComposerState {
  bar: number;
  /** The melody's current degree, relative to the melody octave. */
  degree: number;
  motif: Motif | null;
}

export function newComposerState(): ComposerState {
  return { bar: 0, degree: 4, motif: null };
}

const PHRASE_BARS = 4;

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/** The notes of the next bar. Advances `state`. */
export function composeBar(
  spec: MusicSpec,
  state: ComposerState,
  random: () => number,
): NoteEvent[] {
  const beat = 60 / spec.bpm;
  const bar = state.bar;
  const chordIndex = Math.floor(bar / spec.barsPerChord) % spec.progression.length;
  const chordRoot = spec.progression[chordIndex]!;
  const chord = triad(chordRoot);
  const chordClasses = chord.map((d) => ((d % 7) + 7) % 7);
  const firstBarOfChord = bar % spec.barsPerChord === 0;
  const events: NoteEvent[] = [];
  // A touch of looseness, as hands have: a few milliseconds and a little loudness either way.
  const loose = () => (random() - 0.5) * 0.016;
  const touch = (vel: number) => Math.max(0.05, Math.min(1, vel * (0.85 + random() * 0.3)));

  if (spec.pad && firstBarOfChord) {
    const hold = spec.barsPerChord * spec.beatsPerBar * beat;
    const base = spec.root + (spec.pad.octave - 4) * 12;
    for (const degree of [chordRoot, chordRoot + 4, chordRoot + 9]) {
      events.push({
        time: 0,
        midi: degreeToMidi(base, spec.mode, degree),
        dur: hold + beat * 0.5,
        vel: spec.pad.vel,
        voice: 'pad',
      });
    }
  }

  if (spec.bass) {
    events.push({
      time: Math.max(0, loose()),
      midi: degreeToMidi(spec.root - 12, spec.mode, chordRoot + (chordRoot < -3 ? 7 : 0)),
      dur: beat * 2,
      vel: touch(spec.bass.vel),
      voice: 'bass',
    });
  }

  if (spec.arp) {
    const { every, vel, density, voice, octave } = spec.arp;
    const base = spec.root + (octave - 4) * 12;
    // The chord spread over an octave and a half, then walked up and back.
    const ladder = [chord[0]!, chord[1]!, chord[2]!, chord[0]! + 7, chord[1]! + 7];
    const shapes = [
      [0, 1, 2, 3, 2, 1],
      [0, 2, 1, 3, 2, 4],
      [0, 1, 2, 1, 3, 2],
      [0, 2, 3, 2, 4, 3],
    ];
    const shape = shapes[(Math.floor(bar / 2) + chordIndex) % shapes.length]!;
    const slots = Math.round(spec.beatsPerBar / every);
    for (let slot = 0; slot < slots; slot++) {
      const onBeat = Number.isInteger(slot * every);
      // The first note of the bar always sounds; the rest thin out by `density`.
      if (slot > 0 && random() > (onBeat ? density + 0.15 : density)) continue;
      const rung = ladder[shape[slot % shape.length]!]!;
      events.push({
        time: Math.max(0, slot * every * beat + loose()),
        midi: degreeToMidi(base, spec.mode, rung),
        dur: every * beat * 2,
        vel: touch(vel * (slot === 0 ? 1.15 : onBeat ? 1 : 0.8)),
        voice,
      });
    }
  }

  if (spec.melody) {
    const { voice, vel, octave, rest } = spec.melody;
    const phrase = Math.floor(bar / PHRASE_BARS);
    const barInPhrase = bar % PHRASE_BARS;
    const singing = phrase % (rest + 1) === 0;
    if (singing) {
      const base = spec.root + (octave - 4) * 12;
      const allowed = melodySet(spec.mode);
      const rhythms = RHYTHMS[spec.beatsPerBar] ?? RHYTHMS[4]!;
      let motif: Motif;
      if (barInPhrase === PHRASE_BARS - 1) {
        // The phrase closes on one long chord tone.
        motif = { rhythm: [spec.beatsPerBar], steps: [0] };
      } else if (barInPhrase === 1 && state.motif && random() < 0.7) {
        // The second bar answers the first: same rhythm, the shape nudged.
        motif = {
          rhythm: state.motif.rhythm,
          steps: state.motif.steps.map((step, i) =>
            i === 0 ? step : step + (random() < 0.3 ? 1 : 0),
          ),
        };
      } else {
        const rhythm = pick(random, rhythms);
        motif = {
          rhythm,
          steps: rhythm.map(() => pick(random, [-2, -1, -1, 0, 1, 1, 2])),
        };
        if (barInPhrase === 0) state.motif = motif;
      }

      let at = 0;
      motif.rhythm.forEach((length, i) => {
        const beats = Math.abs(length);
        if (length > 0) {
          let degree = state.degree + (i === 0 ? 0 : motif.steps[i]!);
          // Stay in a singable span of about an octave and a half.
          if (degree > 9) degree -= 3;
          if (degree < -2) degree += 3;
          degree =
            i === 0
              ? nearest(degree, chordClasses, motif.steps[0]!)
              : nearest(degree, allowed, motif.steps[i]!);
          state.degree = degree;
          const last = barInPhrase === PHRASE_BARS - 1;
          events.push({
            time: Math.max(0, at * beat + loose()),
            midi: degreeToMidi(base, spec.mode, degree),
            dur: beats * beat * (last ? 0.8 : 0.92),
            vel: touch(vel * (i === 0 ? 1 : 0.85)),
            voice,
          });
        }
        at += beats;
      });
    }
  }

  state.bar = bar + 1;
  return events;
}

/** Seconds in one bar. */
export function barSeconds(spec: MusicSpec): number {
  return (60 / spec.bpm) * spec.beatsPerBar;
}

/** MIDI note number to frequency in hertz. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
