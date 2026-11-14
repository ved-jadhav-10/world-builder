import {
  barSeconds,
  composeBar,
  midiToHz,
  newComposerState,
  randomSource,
  type MusicSpec,
  type NoteEvent,
} from './compose';
import {
  noiseBed,
  noiseBuffer,
  playBell,
  playBuffer,
  playFlute,
  playPad,
  pluckBuffer,
  roomImpulse,
  wobble,
  type Ctx,
} from './synth';

/** The weather and room sounds a scene can have under its music. */
type Weather = 'rain' | 'fire' | 'surf' | 'wind' | 'crickets' | 'drips' | 'thunder' | 'hush';

export interface SceneDef {
  id: string;
  name: string;
  /** One line for the picker: where you are. */
  blurb: string;
  music: MusicSpec;
  weather: Weather[];
  /** How wet the room is, 0 (dry) to 1. */
  reverb: number;
  /** Level trim, so every scene sits at about the same loudness (measured by rendering each). */
  trim: number;
}

export const SCENES: readonly SceneDef[] = [
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    blurb: 'A harp in a quiet library',
    reverb: 0.5,
    trim: 2,
    weather: ['hush'],
    music: {
      bpm: 63,
      beatsPerBar: 4,
      root: 62,
      mode: 'dorian',
      progression: [0, -1, 3, 0],
      barsPerChord: 2,
      arp: { voice: 'harp', every: 0.5, vel: 0.5, density: 0.62, octave: 4 },
      melody: { voice: 'harp', vel: 0.7, octave: 5, rest: 1 },
      pad: { vel: 0.3, octave: 3 },
      bass: { vel: 0.5 },
    },
  },
  {
    id: 'hearth',
    name: 'Tavern hearth',
    blurb: 'A lute by the fire',
    reverb: 0.28,
    trim: 1.5,
    weather: ['fire'],
    music: {
      bpm: 104,
      beatsPerBar: 3,
      root: 55,
      mode: 'mixolydian',
      progression: [0, -1, 3, 0],
      barsPerChord: 2,
      arp: { voice: 'lute', every: 0.5, vel: 0.62, density: 0.75, octave: 4 },
      melody: { voice: 'lute', vel: 0.9, octave: 5, rest: 1 },
      bass: { vel: 0.7 },
    },
  },
  {
    id: 'rain',
    name: 'Rain on the shutters',
    blurb: 'Slow chords and steady rain',
    reverb: 0.55,
    trim: 1.15,
    weather: ['rain', 'thunder'],
    music: {
      bpm: 52,
      beatsPerBar: 4,
      root: 57,
      mode: 'aeolian',
      progression: [0, -2, 2, -1],
      barsPerChord: 2,
      arp: { voice: 'harp', every: 1, vel: 0.42, density: 0.5, octave: 4 },
      melody: { voice: 'bell', vel: 0.3, octave: 5, rest: 2 },
      pad: { vel: 0.42, octave: 3 },
    },
  },
  {
    id: 'sea',
    name: 'Open sea',
    blurb: 'A whistle over the swell',
    reverb: 0.45,
    trim: 0.95,
    weather: ['surf', 'wind'],
    music: {
      bpm: 76,
      beatsPerBar: 3,
      root: 53,
      mode: 'lydian',
      progression: [0, 1, 0, -2],
      barsPerChord: 2,
      arp: { voice: 'harp', every: 1, vel: 0.36, density: 0.55, octave: 4 },
      melody: { voice: 'flute', vel: 0.5, octave: 5, rest: 1 },
      pad: { vel: 0.36, octave: 3 },
      bass: { vel: 0.4 },
    },
  },
  {
    id: 'wildwood',
    name: 'Wildwood at night',
    blurb: 'A pipe, crickets and wind',
    reverb: 0.5,
    trim: 1.4,
    weather: ['crickets', 'wind'],
    music: {
      bpm: 58,
      beatsPerBar: 4,
      root: 52,
      mode: 'aeolian',
      progression: [0, 3, -2, -3],
      barsPerChord: 2,
      arp: { voice: 'harp', every: 1, vel: 0.36, density: 0.45, octave: 4 },
      melody: { voice: 'flute', vel: 0.48, octave: 5, rest: 1 },
      pad: { vel: 0.3, octave: 3 },
    },
  },
  {
    id: 'deep',
    name: 'Deep places',
    blurb: 'A low drone, far bells, dripping water',
    reverb: 0.8,
    trim: 1.8,
    weather: ['drips', 'hush'],
    music: {
      bpm: 44,
      beatsPerBar: 4,
      root: 52,
      mode: 'phrygian',
      progression: [0, 1, 0, -1],
      barsPerChord: 2,
      melody: { voice: 'bell', vel: 0.34, octave: 5, rest: 1 },
      pad: { vel: 0.5, octave: 3 },
    },
  },
];

export function sceneById(id: string | null | undefined): SceneDef | undefined {
  return SCENES.find((scene) => scene.id === id);
}

/** How much of the mix is music and how much is weather, each 0 to 1. */
export interface Balance {
  music: number;
  weather: number;
}

export interface RunningScene {
  /** Queues every note and sound that starts before `time` (in the context's clock). */
  scheduleUntil(time: number): void;
  setBalance(balance: Balance, at?: number): void;
  /** The scene's own output level, for fading in and out. */
  output: GainNode;
  stop(at: number): void;
}

/**
 * Builds a scene's instruments on a context and returns a handle that schedules it. `startAt` is
 * when the first bar begins. Everything is derived from `seed`, so a render can be repeated.
 */
export function startScene(
  ctx: Ctx,
  scene: SceneDef,
  destination: AudioNode,
  options: { startAt?: number; seed?: number; balance?: Balance } = {},
): RunningScene {
  const startAt = options.startAt ?? ctx.currentTime;
  const random = randomSource(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const balance = options.balance ?? { music: 1, weather: 1 };
  const spec = scene.music;

  const output = ctx.createGain();
  output.connect(destination);
  const mix = ctx.createGain();
  mix.gain.value = scene.trim;
  mix.connect(output);
  const musicBus = ctx.createGain();
  musicBus.gain.value = balance.music;
  const weatherBus = ctx.createGain();
  weatherBus.gain.value = balance.weather;
  musicBus.connect(mix);
  weatherBus.connect(mix);

  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, 3.4, random);
  const wet = ctx.createGain();
  wet.gain.value = scene.reverb;
  room.connect(wet).connect(mix);
  const musicSend = ctx.createGain();
  musicSend.gain.value = 0.9;
  musicBus.connect(musicSend).connect(room);

  const started: AudioScheduledSourceNode[] = [];
  const breath = noiseBuffer(ctx, 1.6, 'pink', random);

  // Plucked notes are rendered once per pitch and reused.
  const plucked = new Map<string, AudioBuffer>();
  const pluck = (voice: 'harp' | 'lute' | 'bass', midi: number) => {
    const key = `${voice}:${midi}`;
    let buffer = plucked.get(key);
    if (!buffer) {
      const [seconds, brightness] =
        voice === 'harp' ? [4.2, 0.42] : voice === 'lute' ? [2.4, 0.62] : [3.2, 0.3];
      buffer = pluckBuffer(ctx, midiToHz(midi), seconds, brightness, random);
      plucked.set(key, buffer);
    }
    return buffer;
  };

  const play = (event: NoteEvent, barStart: number) => {
    const time = barStart + event.time;
    const hz = midiToHz(event.midi);
    // Higher notes sit a little to the right, as on a harp seen from the audience.
    const pan = Math.max(-0.5, Math.min(0.5, (event.midi - 64) / 36));
    switch (event.voice) {
      case 'harp':
      case 'lute':
        playBuffer(ctx, pluck(event.voice, event.midi), time, event.vel * 0.34, musicBus, pan);
        break;
      case 'bass':
        playBuffer(ctx, pluck('bass', event.midi), time, event.vel * 0.42, musicBus, 0);
        break;
      case 'flute':
        playFlute(ctx, hz, time, event.dur, event.vel * 0.2, musicBus, breath);
        break;
      case 'bell':
        playBell(ctx, hz, time, event.vel * 0.22, musicBus);
        break;
      case 'pad':
        playPad(ctx, hz, time, event.dur, event.vel * 0.05, musicBus);
        break;
    }
  };

  // Weather beds that simply run.
  const pink = noiseBuffer(ctx, 6, 'pink', random);
  const brown = noiseBuffer(ctx, 6, 'brown', random);
  const has = (kind: Weather) => scene.weather.includes(kind);
  if (has('hush')) {
    started.push(
      noiseBed(ctx, brown, weatherBus, { type: 'lowpass', frequency: 320, gain: 0.08 }).source,
    );
  }
  if (has('rain')) {
    started.push(
      noiseBed(ctx, pink, weatherBus, { type: 'highpass', frequency: 1400, gain: 0.26 }).source,
      noiseBed(ctx, pink, weatherBus, {
        type: 'bandpass',
        frequency: 520,
        q: 0.5,
        gain: 0.2,
        offset: 2.1,
      }).source,
    );
  }
  if (has('fire')) {
    const bed = noiseBed(ctx, brown, weatherBus, { type: 'lowpass', frequency: 520, gain: 0.19 });
    started.push(bed.source, wobble(ctx, bed.level.gain, 0.23, 0.05));
  }
  if (has('surf')) {
    const bed = noiseBed(ctx, pink, weatherBus, { type: 'lowpass', frequency: 700, gain: 0.26 });
    started.push(
      bed.source,
      wobble(ctx, bed.level.gain, 0.105, 0.2),
      wobble(ctx, bed.filter.frequency, 0.105, 420),
    );
  }
  if (has('wind')) {
    const bed = noiseBed(ctx, pink, weatherBus, {
      type: 'bandpass',
      frequency: 480,
      q: 1.6,
      gain: 0.24,
      offset: 3.3,
    });
    started.push(
      bed.source,
      wobble(ctx, bed.filter.frequency, 0.071, 210),
      wobble(ctx, bed.level.gain, 0.043, 0.09),
    );
  }

  // Weather that happens in moments: each kind keeps its own clock.
  const drySend = ctx.createGain();
  drySend.gain.value = 0.7;
  weatherBus.connect(drySend).connect(room);
  const next: Partial<Record<Weather, number>> = {};
  const burst = noiseBuffer(ctx, 0.5, 'white', random);

  const crackle = (time: number) => {
    const source = ctx.createBufferSource();
    source.buffer = burst;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200 + random() * 3200;
    band.Q.value = 2 + random() * 4;
    const level = ctx.createGain();
    const loud = 0.07 + random() * 0.22;
    level.gain.setValueAtTime(loud, time);
    level.gain.exponentialRampToValueAtTime(0.0001, time + 0.012 + random() * 0.05);
    source.connect(band).connect(level).connect(weatherBus);
    source.start(time, random() * 0.4);
    source.stop(time + 0.09);
  };
  const drip = (time: number) => {
    const osc = ctx.createOscillator();
    const top = 900 + random() * 1500;
    osc.frequency.setValueAtTime(top, time);
    osc.frequency.exponentialRampToValueAtTime(top * 0.55, time + 0.09);
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, time);
    level.gain.linearRampToValueAtTime(0.15 + random() * 0.12, time + 0.004);
    level.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    const panner = ctx.createStereoPanner();
    panner.pan.value = random() * 1.4 - 0.7;
    osc.connect(level).connect(panner).connect(weatherBus);
    osc.start(time);
    osc.stop(time + 0.2);
  };
  const chirp = (time: number) => {
    // A cricket: three or four quick pulses of a high, thin tone.
    const hz = 3900 + random() * 700;
    const pulses = 3 + Math.floor(random() * 2);
    const panner = ctx.createStereoPanner();
    panner.pan.value = random() * 1.6 - 0.8;
    panner.connect(weatherBus);
    const loud = 0.02 + random() * 0.022;
    for (let i = 0; i < pulses; i++) {
      const at = time + i * 0.052;
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const level = ctx.createGain();
      level.gain.setValueAtTime(0, at);
      level.gain.linearRampToValueAtTime(loud, at + 0.008);
      level.gain.linearRampToValueAtTime(0, at + 0.034);
      osc.connect(level).connect(panner);
      osc.start(at);
      osc.stop(at + 0.04);
    }
  };
  const thunder = (time: number) => {
    const source = ctx.createBufferSource();
    source.buffer = brown;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(260, time);
    low.frequency.exponentialRampToValueAtTime(70, time + 5);
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, time);
    level.gain.linearRampToValueAtTime(0.5 + random() * 0.25, time + 0.25 + random() * 0.5);
    level.gain.exponentialRampToValueAtTime(0.001, time + 5.5);
    source.connect(low).connect(level).connect(weatherBus);
    source.start(time, random() * 0.5);
    source.stop(time + 5.6);
  };

  const moments: [Weather, (time: number) => void, () => number][] = [
    ['fire', crackle, () => 0.03 + random() ** 2 * 0.5],
    ['drips', drip, () => 0.7 + random() * 3.4],
    ['crickets', chirp, () => 0.18 + random() * 0.7],
    ['thunder', thunder, () => 22 + random() * 38],
  ];
  for (const [kind, , gap] of moments) {
    if (has(kind)) next[kind] = startAt + (kind === 'thunder' ? 9 + random() * 12 : gap());
  }

  const composer = newComposerState();
  const bar = barSeconds(spec);
  let nextBar = startAt + 0.15;

  return {
    output,
    scheduleUntil(time) {
      while (nextBar < time) {
        for (const event of composeBar(spec, composer, random)) play(event, nextBar);
        nextBar += bar;
      }
      for (const [kind, make, gap] of moments) {
        let at = next[kind];
        if (at === undefined) continue;
        while (at < time) {
          make(at);
          at += gap();
        }
        next[kind] = at;
      }
    },
    setBalance(value, at = ctx.currentTime) {
      musicBus.gain.setTargetAtTime(value.music, at, 0.15);
      weatherBus.gain.setTargetAtTime(value.weather, at, 0.15);
    },
    stop(at) {
      for (const node of started) {
        try {
          node.stop(at);
        } catch {
          // Already stopped.
        }
      }
      // Leave nothing scheduled past the stop.
      for (const kind of Object.keys(next) as Weather[]) next[kind] = undefined;
      nextBar = Number.POSITIVE_INFINITY;
    },
  };
}
