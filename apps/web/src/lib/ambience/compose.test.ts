import { describe, expect, it } from 'vitest';
import {
  barSeconds,
  composeBar,
  degreeToMidi,
  midiToHz,
  MODES,
  newComposerState,
  randomSource,
  type MusicSpec,
} from './compose';
import { balanceFor } from './player';
import { SCENES } from './scenes';

const spec: MusicSpec = {
  bpm: 60,
  beatsPerBar: 4,
  root: 62,
  mode: 'dorian',
  progression: [0, -1, 3, 0],
  barsPerChord: 2,
  arp: { voice: 'harp', every: 0.5, vel: 0.5, density: 0.6, octave: 4 },
  melody: { voice: 'flute', vel: 0.5, octave: 5, rest: 1 },
  pad: { vel: 0.3, octave: 3 },
  bass: { vel: 0.5 },
};

function bars(music: MusicSpec, count: number, seed = 1) {
  const state = newComposerState();
  const random = randomSource(seed);
  return Array.from({ length: count }, () => composeBar(music, state, random));
}

describe('the ambience composer', () => {
  it('maps scale degrees onto the mode, across octaves and below the root', () => {
    expect(degreeToMidi(62, 'dorian', 0)).toBe(62);
    expect(degreeToMidi(62, 'dorian', 2)).toBe(65);
    expect(degreeToMidi(62, 'dorian', 7)).toBe(74);
    expect(degreeToMidi(62, 'dorian', -1)).toBe(60);
    expect(midiToHz(69)).toBe(440);
  });

  it('writes the same music for the same seed', () => {
    expect(bars(spec, 8, 5)).toEqual(bars(spec, 8, 5));
    expect(bars(spec, 8, 5)).not.toEqual(bars(spec, 8, 6));
  });

  it('keeps every note inside its bar, in the mode and in a playable range', () => {
    for (const scene of SCENES) {
      const music = scene.music;
      const length = barSeconds(music);
      const pitchClasses = new Set(MODES[music.mode].map((step) => (music.root + step) % 12));
      for (const bar of bars(music, 48, 11)) {
        for (const note of bar) {
          expect(note.time).toBeGreaterThanOrEqual(0);
          expect(note.time).toBeLessThan(length);
          expect(pitchClasses.has(note.midi % 12)).toBe(true);
          expect(note.midi).toBeGreaterThanOrEqual(33);
          expect(note.midi).toBeLessThanOrEqual(96);
          expect(note.vel).toBeGreaterThan(0);
          expect(note.vel).toBeLessThanOrEqual(1);
          expect(note.dur).toBeGreaterThan(0);
        }
      }
    }
  });

  it('starts each bar of the tune on a note of the chord', () => {
    const tune: MusicSpec = { ...spec, arp: undefined, pad: undefined, bass: undefined };
    const state = newComposerState();
    const random = randomSource(9);
    for (let bar = 0; bar < 32; bar++) {
      const chordRoot = tune.progression[Math.floor(bar / tune.barsPerChord) % 4]!;
      const chord = [chordRoot, chordRoot + 2, chordRoot + 4].map(
        (degree) => degreeToMidi(tune.root, tune.mode, degree) % 12,
      );
      const notes = composeBar(tune, state, random);
      // The tune rests every other phrase, so some bars are empty.
      if (notes.length) expect(chord).toContain(notes[0]!.midi % 12);
    }
  });

  it('lets the tune rest between phrases and holds a chord under it', () => {
    const all = bars(spec, 8, 2);
    const sung = all.map((bar) => bar.some((note) => note.voice === 'flute'));
    expect(sung.slice(0, 4)).toEqual([true, true, true, true]);
    expect(sung.slice(4)).toEqual([false, false, false, false]);
    // A new chord every two bars, three voices each.
    expect(all.map((bar) => bar.filter((note) => note.voice === 'pad').length)).toEqual([
      3, 0, 3, 0, 3, 0, 3, 0,
    ]);
  });

  it('gives every scene a name, weather and its own id', () => {
    expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(SCENES.length);
    for (const scene of SCENES) {
      expect(scene.name).not.toBe('');
      expect(scene.weather.length).toBeGreaterThan(0);
      expect(scene.trim).toBeGreaterThan(0);
    }
  });

  it('keeps both music and weather full in the middle of the balance', () => {
    expect(balanceFor(0.5)).toEqual({ music: 1, weather: 1 });
    expect(balanceFor(0)).toEqual({ music: 0, weather: 1 });
    expect(balanceFor(1)).toEqual({ music: 1, weather: 0 });
  });
});
