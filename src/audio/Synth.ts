export type Waveform = OscillatorType | 'pulse';
export type NoiseColor = 'white' | 'pink' | 'brown';

export interface ToneOptions {
  readonly wave: Waveform;
  readonly from: number;
  readonly to?: number;
  readonly duration: number;
  readonly volume: number;
  readonly delay?: number;
  readonly attack?: number;
  /** Share of the duration held at full level before the decay (0 = decay at once). */
  readonly sustain?: number;
  /** Soft saturation: 0 is clean, higher values add harmonics and weight to low booms. */
  readonly drive?: number;
}

export interface NoiseOptions {
  readonly duration: number;
  readonly volume: number;
  readonly filter: BiquadFilterType;
  readonly from: number;
  readonly to?: number;
  readonly q?: number;
  readonly delay?: number;
  readonly color?: NoiseColor;
  readonly attack?: number;
  readonly sustain?: number;
  readonly drive?: number;
}

/** A set of inharmonic resonances, as struck metal rings: plates, hatches, armour. */
export interface ModesOptions {
  /** Base frequency; each mode sounds at base × ratio. */
  readonly base: number;
  readonly ratios: readonly number[];
  /** Ring time of each mode, seconds. */
  readonly decays: readonly number[];
  readonly gains: readonly number[];
  readonly volume: number;
  readonly delay?: number;
}

/** Many tiny random bursts, for crackle, falling debris, gravel and droplets. */
export interface GrainOptions {
  readonly count: number;
  /** When the first and last grain may fall, seconds from now. */
  readonly start: number;
  readonly end: number;
  readonly length: readonly [number, number];
  readonly filter: BiquadFilterType;
  readonly frequency: readonly [number, number];
  readonly volume: readonly [number, number];
  readonly q?: number;
  readonly color?: NoiseColor;
  /** Grains get quieter towards the end, like debris settling. */
  readonly fade?: boolean;
}

export interface VoiceOptions {
  /** Stereo position, -1 (left) to 1 (right). */
  readonly pan?: number;
  readonly gain?: number;
  /** Low-pass cutoff in Hz, for distance (air soaks up the highs). */
  readonly cutoff?: number;
  /** Share of the signal sent to the reverb. */
  readonly reverb?: number;
}

/** Random value around `value`, ± `amount` as a share of it. */
export function vary(value: number, amount = 0.06): number {
  return value * (1 + (Math.random() * 2 - 1) * amount);
}

const between = (range: readonly [number, number]) => range[0] + Math.random() * (range[1] - range[0]);

/** 25% duty pulse, the classic thin chip lead, built from its Fourier series. */
function createPulseWave(ctx: BaseAudioContext, duty = 0.25, harmonics = 32): PeriodicWave {
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

/** Two seconds of noise. Pink and brown are filtered white noise with stronger lows, like real blasts. */
function createNoise(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') {
      data[i] = white;
    } else if (color === 'pink') {
      // Paul Kellet's refined pink noise filter.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** A soft-clipping curve: gentle tanh saturation, normalised so the drive changes tone more than level. */
function createDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  const k = 1 + drive * 2;
  const norm = Math.tanh(k);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/**
 * An outdoor impulse response: a cluster of early reflections off nearby walls and hills, then a
 * short diffuse tail that loses its highs as it fades. Stereo, slightly different per channel.
 */
export function createOutdoorImpulse(ctx: BaseAudioContext, seconds = 1.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    const taps = channel === 0 ? [0.019, 0.037, 0.061, 0.094, 0.131] : [0.023, 0.044, 0.071, 0.103, 0.149];
    taps.forEach((t, i) => {
      const at = Math.floor(t * rate);
      if (at < length) data[at] += (0.55 - i * 0.09) * (Math.random() < 0.5 ? -1 : 1);
    });
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-t / 0.32) * Math.min(1, t / 0.02);
      // One-pole low-pass whose cutoff falls over time: the tail darkens.
      const k = 0.5 * Math.exp(-t * 2.2) + 0.08;
      smooth += k * ((Math.random() * 2 - 1) - smooth);
      data[i] += smooth * envelope * 0.6;
    }
  }
  return buffer;
}

interface Shared {
  readonly pulse: PeriodicWave;
  readonly noise: Readonly<Record<NoiseColor, AudioBuffer>>;
  readonly curves: Map<number, Float32Array<ArrayBuffer>>;
}

const shared = new WeakMap<BaseAudioContext, Shared>();

function resources(ctx: BaseAudioContext): Shared {
  let res = shared.get(ctx);
  if (!res) {
    res = {
      pulse: createPulseWave(ctx),
      noise: { white: createNoise(ctx, 'white'), pink: createNoise(ctx, 'pink'), brown: createNoise(ctx, 'brown') },
      curves: new Map(),
    };
    shared.set(ctx, res);
  }
  return res;
}

function driveCurve(res: Shared, drive: number): Float32Array<ArrayBuffer> {
  const key = Math.round(drive * 4) / 4;
  let curve = res.curves.get(key);
  if (!curve) {
    curve = createDriveCurve(key);
    res.curves.set(key, curve);
  }
  return curve;
}

/**
 * Sound primitives writing into one destination. A Voice is one sound effect: its own chain of
 * gain, distance filter and stereo position, plus a send to the shared reverb. Everything it
 * schedules is torn down once the sound has rung out.
 */
export class Voice {
  readonly input: GainNode;
  private readonly res: Shared;
  private readonly chain: AudioNode[] = [];
  private end: number;

  constructor(
    readonly ctx: BaseAudioContext,
    output: AudioNode,
    reverb: AudioNode | null,
    options: VoiceOptions = {},
  ) {
    this.res = resources(ctx);
    this.end = ctx.currentTime;
    this.input = ctx.createGain();
    this.input.gain.value = options.gain ?? 1;
    let node: AudioNode = this.input;
    if (options.cutoff !== undefined && options.cutoff < 16000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.cutoff;
      filter.Q.value = 0.5;
      node.connect(filter);
      node = filter;
      this.chain.push(filter);
    }
    if (options.pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      node.connect(panner);
      node = panner;
      this.chain.push(panner);
    }
    node.connect(output);
    if (reverb && options.reverb) {
      const send = ctx.createGain();
      send.gain.value = options.reverb;
      node.connect(send);
      send.connect(reverb);
      this.chain.push(send);
    }
  }

  /** Seconds after the last scheduled sound before the chain is released. */
  get remaining(): number {
    return Math.max(0, this.end - this.ctx.currentTime);
  }

  tone(options: ToneOptions, at = this.ctx.currentTime): void {
    const start = at + (options.delay ?? 0);
    const end = start + options.duration;
    const osc = this.ctx.createOscillator();
    if (options.wave === 'pulse') osc.setPeriodicWave(this.res.pulse);
    else osc.type = options.wave;
    osc.frequency.setValueAtTime(options.from, start);
    if (options.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), end);
    const out = this.envelope(start, end, options.volume, options.attack ?? 0.004, options.sustain ?? 0);
    osc.connect(this.shape(out, options.drive));
    osc.start(start);
    osc.stop(end + 0.02);
  }

  noise(options: NoiseOptions, at = this.ctx.currentTime): void {
    const start = at + (options.delay ?? 0);
    const end = start + options.duration;
    const source = this.ctx.createBufferSource();
    source.buffer = this.res.noise[options.color ?? 'white'];
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q ?? 0.8;
    filter.frequency.setValueAtTime(options.from, start);
    if (options.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), end);
    const out = this.envelope(start, end, options.volume, options.attack ?? 0.002, options.sustain ?? 0);
    source.connect(filter);
    filter.connect(this.shape(out, options.drive));
    source.start(start, Math.random() * 1.5);
    source.stop(end + 0.02);
  }

  modes(options: ModesOptions, at = this.ctx.currentTime): void {
    const start = at + (options.delay ?? 0);
    options.ratios.forEach((ratio, i) => {
      const decay = options.decays[i] ?? options.decays[options.decays.length - 1];
      const gain = (options.gains[i] ?? 0.1) * options.volume;
      this.tone({ wave: 'sine', from: options.base * ratio * vary(1, 0.004), duration: decay, volume: gain, attack: 0.0015 }, start);
    });
  }

  grains(options: GrainOptions, at = this.ctx.currentTime): void {
    for (let i = 0; i < options.count; i++) {
      const t = options.start + Math.random() * (options.end - options.start);
      const fade = options.fade ? 1 - (t - options.start) / Math.max(0.001, options.end - options.start) : 1;
      this.noise(
        {
          color: options.color,
          filter: options.filter,
          from: between(options.frequency),
          q: options.q,
          duration: between(options.length),
          volume: between(options.volume) * (0.3 + 0.7 * fade),
          attack: 0.001,
        },
        at + t,
      );
    }
  }

  /** Disconnects the chain once everything has played. */
  release(): void {
    const ms = (this.remaining + 0.3) * 1000;
    setTimeout(() => {
      this.input.disconnect();
      for (const node of this.chain) node.disconnect();
    }, ms);
  }

  private shape(out: AudioNode, drive: number | undefined): AudioNode {
    if (!drive) return out;
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = driveCurve(this.res, drive);
    shaper.oversample = '2x';
    shaper.connect(out);
    return shaper;
  }

  private envelope(start: number, end: number, volume: number, attack: number, sustain: number): GainNode {
    const gain = this.ctx.createGain();
    const peak = Math.max(0.0002, volume);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    if (sustain > 0) gain.gain.setValueAtTime(peak, start + attack + (end - start - attack) * sustain);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(this.input);
    this.end = Math.max(this.end, end + 0.05);
    return gain;
  }
}

/** The chiptune voice used by the music and the menus: straight into its bus, no positioning. */
export class Synth {
  private readonly voice: Voice;

  constructor(
    readonly ctx: AudioContext,
    output: AudioNode,
  ) {
    this.voice = new Voice(ctx, output, null);
  }

  tone(options: ToneOptions, at = this.ctx.currentTime): void {
    this.voice.tone(options, at);
  }

  noise(options: NoiseOptions, at = this.ctx.currentTime): void {
    this.voice.noise(options, at);
  }
}

const NOTE_OFFSETS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' → 440 Hz. Accepts sharps ('C#5'). */
export function noteFrequency(note: string): number {
  const match = /^([A-G])(#?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Bad note: ${note}`);
  const midi = (Number(match[3]) + 1) * 12 + NOTE_OFFSETS[match[1]] + (match[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
