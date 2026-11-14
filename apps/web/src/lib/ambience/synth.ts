/*
 * The instruments and weather of the ambience player, built from the Web Audio API alone: no
 * recordings, so nothing to license, host or download. Works on a live AudioContext and on an
 * OfflineAudioContext (which the checks use to render a scene and measure it).
 */

export type Ctx = BaseAudioContext;
type Random = () => number;

/** White, pink or brown noise, long enough to loop without an audible seam. */
export function noiseBuffer(
  ctx: Ctx,
  seconds: number,
  kind: 'white' | 'pink' | 'brown',
  random: Random,
): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = random() * 2 - 1;
      if (kind === 'white') {
        data[i] = white * 0.5;
      } else if (kind === 'pink') {
        // Paul Kellet's economical pink filter.
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
    }
    // Fold the tail into the head so the loop point is smooth.
    const fade = Math.min(length >> 2, Math.floor(ctx.sampleRate * 0.5));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = data[i]! * t + data[length - fade + i]! * (1 - t);
    }
  }
  return buffer;
}

/** A room: decaying noise for the convolution reverb. */
export function roomImpulse(ctx: Ctx, seconds: number, random: Random): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // High frequencies die first, as they do in stone and timber rooms.
      const white = random() * 2 - 1;
      const cutoff = 0.55 - 0.45 * t;
      low += cutoff * (white - low);
      data[i] = low * (1 - t) ** 2.6;
    }
  }
  return buffer;
}

/**
 * One plucked string (Karplus and Strong's method): a burst of noise circulating in a delay line
 * as long as one period of the note, losing its brightness on each pass.
 */
export function pluckBuffer(
  ctx: Ctx,
  hz: number,
  seconds: number,
  brightness: number,
  random: Random,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(seconds * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const period = Math.max(2, Math.round(rate / hz - 0.5));
  // Loss per pass, chosen so the note takes about `seconds` to fade away.
  const loss = 10 ** (-3 / (hz * seconds * 0.9));
  let previous = 0;
  for (let i = 0; i < period; i++) {
    const white = random() * 2 - 1;
    // A softer pluck starts with a duller burst.
    previous += brightness * (white - previous);
    data[i] = previous;
  }
  // Averaging two neighbours is the gentle low-pass; it also adds half a sample of delay, which
  // the rounding of `period` above allows for.
  data[period] = loss * 0.5 * (data[0]! + data[period - 1]!);
  for (let i = period + 1; i < length; i++) {
    data[i] = loss * 0.5 * (data[i - period]! + data[i - period - 1]!);
  }
  // Level every note alike, then round off the two ends.
  let peak = 0;
  for (let i = 0; i < Math.min(length, rate >> 2); i++) peak = Math.max(peak, Math.abs(data[i]!));
  const scale = peak > 0 ? 0.9 / peak : 1;
  const attack = Math.floor(rate * 0.003);
  const release = Math.floor(rate * 0.25);
  for (let i = 0; i < length; i++) {
    let gain = scale;
    if (i < attack) gain *= i / attack;
    if (i > length - release) gain *= (length - i) / release;
    data[i] = data[i]! * gain;
  }
  return buffer;
}

/** Plays a prepared buffer once. */
export function playBuffer(
  ctx: Ctx,
  buffer: AudioBuffer,
  time: number,
  gain: number,
  destination: AudioNode,
  pan = 0,
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const level = ctx.createGain();
  level.gain.value = gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  source.connect(level).connect(panner).connect(destination);
  source.start(time);
}

/** A breathy pipe: a sine with a little second harmonic, vibrato that arrives late, and air. */
export function playFlute(
  ctx: Ctx,
  hz: number,
  time: number,
  dur: number,
  gain: number,
  destination: AudioNode,
  breath: AudioBuffer,
): void {
  const end = time + dur;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + Math.min(0.12, dur * 0.3));
  envelope.gain.setValueAtTime(gain * 0.85, Math.max(time + 0.13, end - 0.12));
  envelope.gain.linearRampToValueAtTime(0, end + 0.22);
  envelope.connect(destination);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 4.6;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, time);
  depth.gain.linearRampToValueAtTime(hz * 0.006, time + Math.min(0.5, dur));
  vibrato.connect(depth);

  for (const [multiple, level] of [
    [1, 1],
    [2, 0.16],
    [3, 0.05],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz * multiple;
    depth.connect(osc.frequency);
    const part = ctx.createGain();
    part.gain.value = level;
    osc.connect(part).connect(envelope);
    osc.start(time);
    osc.stop(end + 0.3);
  }
  vibrato.start(time);
  vibrato.stop(end + 0.3);

  const air = ctx.createBufferSource();
  air.buffer = breath;
  air.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(hz * 2.5, 6000);
  band.Q.value = 1.4;
  const airLevel = ctx.createGain();
  airLevel.gain.value = 0.22;
  air.connect(band).connect(airLevel).connect(envelope);
  air.start(time, (time * 7.3) % 1.5);
  air.stop(end + 0.3);
}

/** A small bell: a few partials that are not quite in tune with each other, each fading alone. */
export function playBell(
  ctx: Ctx,
  hz: number,
  time: number,
  gain: number,
  destination: AudioNode,
): void {
  const partials = [
    [1, 1, 3.6],
    [2.01, 0.45, 2.4],
    [2.76, 0.28, 1.7],
    [5.4, 0.12, 0.9],
  ] as const;
  for (const [ratio, level, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz * ratio;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain * level, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(envelope).connect(destination);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }
}

/** One voice of a slow chord: two slightly mistuned waves behind a dark filter. */
export function playPad(
  ctx: Ctx,
  hz: number,
  time: number,
  dur: number,
  gain: number,
  destination: AudioNode,
): void {
  const attack = Math.min(2.4, dur * 0.35);
  const release = 2.8;
  const end = time + dur;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(380, time);
  filter.frequency.linearRampToValueAtTime(950, time + attack);
  filter.frequency.linearRampToValueAtTime(420, end + release);
  filter.Q.value = 0.4;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + attack);
  envelope.gain.setValueAtTime(gain, end);
  envelope.gain.linearRampToValueAtTime(0, end + release);
  filter.connect(envelope).connect(destination);
  for (const cents of [-7, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.detune.value = cents;
    osc.connect(filter);
    osc.start(time);
    osc.stop(end + release + 0.1);
  }
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.value = hz;
  const subLevel = ctx.createGain();
  subLevel.gain.value = 0.6;
  sub.connect(subLevel).connect(filter);
  sub.start(time);
  sub.stop(end + release + 0.1);
}

/** A looping bed of filtered noise; returns its gain so weather can swell and fade it. */
export function noiseBed(
  ctx: Ctx,
  buffer: AudioBuffer,
  destination: AudioNode,
  options: {
    type: BiquadFilterType;
    frequency: number;
    q?: number;
    gain: number;
    offset?: number;
  },
): { level: GainNode; filter: BiquadFilterNode; source: AudioBufferSourceNode } {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 0.7;
  const level = ctx.createGain();
  level.gain.value = options.gain;
  source.connect(filter).connect(level).connect(destination);
  source.start(0, options.offset ?? 0);
  return { level, filter, source };
}

/** A slow, endless wobble on a parameter (for swells of wind and surf). */
export function wobble(ctx: Ctx, target: AudioParam, hz: number, amount: number): OscillatorNode {
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = hz;
  const depth = ctx.createGain();
  depth.gain.value = amount;
  lfo.connect(depth).connect(target);
  lfo.start(0);
  return lfo;
}
