/** What the ground under the tracks sounds like when they slip. */
export type EngineSurface = 'hard' | 'soft' | 'snow' | 'road';

export interface EngineState {
  /** 0..1: how hard the driver is pressing on. */
  readonly throttle: number;
  /** 0..1: speed over the ground as a share of top speed. */
  readonly speed: number;
  /** 0..1: how much the tracks are slipping (wheelspin, skids). */
  readonly slip: number;
  readonly surface: EngineSurface;
  /** Stereo position, -1..1. */
  readonly pan?: number;
  /** 0..1: how close the tank is to the listener; quieter and duller when far. */
  readonly presence?: number;
  /** Engine size: heavier tanks run deeper and slower. 1 is the player's tank. */
  readonly size?: number;
}

const SMOOTH = 0.12;
const CLATTER_LOOKAHEAD = 0.1;
const CLATTER_INTERVAL_MS = 30;
const SKID_BAND: Readonly<Record<EngineSurface, number>> = { hard: 2400, soft: 1300, snow: 1900, road: 900 };

function noiseBuffer(ctx: BaseAudioContext, brown: boolean): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = brown ? last * 3.5 : white;
  }
  return buffer;
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  const k = 1 + amount * 2;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

interface Graph {
  readonly master: GainNode;
  readonly panner: StereoPannerNode;
  readonly tone: BiquadFilterNode;
  readonly firing: OscillatorNode;
  readonly sub: OscillatorNode;
  readonly chug: OscillatorNode;
  readonly chugDepth: GainNode;
  readonly body: BiquadFilterNode;
  readonly mech: BiquadFilterNode;
  readonly mechGain: GainNode;
  readonly whine: OscillatorNode;
  readonly whineGain: GainNode;
  readonly rollGain: GainNode;
  readonly squeal: BiquadFilterNode;
  readonly squealGain: GainNode;
  readonly skid: BiquadFilterNode;
  readonly skidGain: GainNode;
  readonly clatterBus: GainNode;
  readonly sources: readonly AudioScheduledSourceNode[];
}

/**
 * A tank's diesel engine and running gear, synthesised continuously.
 *
 * The engine is a sawtooth at the cylinder firing rate with a half-rate subharmonic for the
 * uneven beat of a big diesel, amplitude-modulated into a chug, saturated and low-passed, with
 * mechanical noise and a faint turbo whine on top. Revs follow the throttle and the speed, and
 * flare when the tracks spin. The running gear adds a low rolling rumble, the clatter of track
 * links over the sprockets (faster as the tank speeds up), a thin squeal, and a skid hiss or snow
 * crunch when the tracks slip.
 */
export class EngineSound {
  private graph: Graph | null = null;
  private readonly brown: AudioBuffer;
  private readonly white: AudioBuffer;
  private clatterTimer: ReturnType<typeof setInterval> | null = null;
  private nextClatter = 0;
  private state: EngineState | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly output: AudioNode,
    /** Overall loudness of this engine. */
    private readonly level: number,
  ) {
    this.brown = noiseBuffer(ctx, true);
    this.white = noiseBuffer(ctx, false);
  }

  update(state: EngineState | null): void {
    this.state = state;
    if (!state) {
      this.fadeOut();
      return;
    }
    const graph = this.graph ?? this.start();
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const now = this.ctx.currentTime;
    const set = (param: AudioParam, value: number, smooth = SMOOTH) => param.setTargetAtTime(value, now, smooth);
    const size = state.size ?? 1;
    const presence = state.presence ?? 1;
    // Revs: idle, pulled up by the throttle and by road speed; spinning tracks let them race.
    const rpm = Math.min(1, 0.08 + 0.32 * state.throttle + 0.5 * state.speed + 0.35 * state.slip * state.throttle);
    const firing = (34 + 62 * rpm) / size;
    set(graph.firing.frequency, firing);
    set(graph.sub.frequency, firing * 0.5);
    set(graph.chug.frequency, firing * 0.5);
    set(graph.chugDepth.gain, 0.35 - 0.15 * rpm);
    set(graph.tone.frequency, (160 + 900 * rpm) * (0.45 + 0.55 * presence));
    set(graph.body.frequency, 90 + 160 * rpm);
    set(graph.mech.frequency, 320 + 900 * rpm);
    set(graph.mechGain.gain, 0.05 + 0.12 * rpm);
    set(graph.whine.frequency, (900 + 2200 * rpm) / size);
    set(graph.whineGain.gain, 0.004 + 0.012 * rpm * presence);
    set(graph.rollGain.gain, 0.5 * state.speed);
    set(graph.squealGain.gain, 0.05 * state.speed * presence);
    set(graph.squeal.frequency, 2600 + 500 * Math.sin(now * 3.1));
    set(graph.skid.frequency, SKID_BAND[state.surface]);
    set(graph.skidGain.gain, state.slip * (0.25 + 0.5 * state.speed + 0.3 * state.throttle) * (state.surface === 'snow' ? 1.3 : 1));
    set(graph.clatterBus.gain, 0.5 + 0.5 * presence);
    set(graph.panner.pan, Math.max(-1, Math.min(1, state.pan ?? 0)), 0.05);
    set(graph.master.gain, this.level * (0.55 + 0.45 * rpm) * (0.15 + 0.85 * presence), 0.08);
  }

  private start(): Graph {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const panner = ctx.createStereoPanner();
    master.connect(panner);
    panner.connect(this.output);

    // Engine core.
    const engine = ctx.createGain();
    engine.gain.value = 0.65;
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(2.2);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.9;
    tone.frequency.value = 300;
    const firing = ctx.createOscillator();
    firing.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    firing.connect(tone);
    sub.connect(subGain);
    subGain.connect(tone);
    tone.connect(shaper);
    shaper.connect(engine);
    const chug = ctx.createOscillator();
    chug.type = 'sine';
    const chugDepth = ctx.createGain();
    chugDepth.gain.value = 0.3;
    chug.connect(chugDepth);
    chugDepth.connect(engine.gain);
    // A resonant body in the low end gives the hull's boom.
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.gain.value = 8;
    body.Q.value = 1.2;
    engine.connect(body);
    body.connect(master);

    // Mechanical clatter of the engine bay.
    const mechSource = this.loop(this.brown);
    const mech = ctx.createBiquadFilter();
    mech.type = 'bandpass';
    mech.Q.value = 0.8;
    const mechGain = ctx.createGain();
    mechSource.connect(mech);
    mech.connect(mechGain);
    mechGain.connect(master);

    const whine = ctx.createOscillator();
    whine.type = 'sine';
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain);
    whineGain.connect(master);

    // Running gear.
    const rollSource = this.loop(this.brown);
    const roll = ctx.createBiquadFilter();
    roll.type = 'lowpass';
    roll.frequency.value = 150;
    const rollGain = ctx.createGain();
    rollGain.gain.value = 0;
    rollSource.connect(roll);
    roll.connect(rollGain);
    rollGain.connect(master);

    const squealSource = this.loop(this.white);
    const squeal = ctx.createBiquadFilter();
    squeal.type = 'bandpass';
    squeal.Q.value = 6;
    squeal.frequency.value = 2700;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    squealSource.connect(squeal);
    squeal.connect(squealGain);
    squealGain.connect(master);

    const skidSource = this.loop(this.white);
    const skid = ctx.createBiquadFilter();
    skid.type = 'bandpass';
    skid.Q.value = 0.7;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSource.connect(skid);
    skid.connect(skidGain);
    skidGain.connect(master);

    const clatterBus = ctx.createGain();
    const clatterTone = ctx.createBiquadFilter();
    clatterTone.type = 'bandpass';
    clatterTone.frequency.value = 1500;
    clatterTone.Q.value = 1.1;
    clatterBus.connect(clatterTone);
    clatterTone.connect(master);

    const sources = [firing, sub, chug, whine, mechSource, rollSource, squealSource, skidSource];
    for (const source of sources) source.start();
    this.graph = {
      master,
      panner,
      tone,
      firing,
      sub,
      chug,
      chugDepth,
      body,
      mech,
      mechGain,
      whine,
      whineGain,
      rollGain,
      squeal,
      squealGain,
      skid,
      skidGain,
      clatterBus,
      sources,
    };
    this.nextClatter = ctx.currentTime;
    this.clatterTimer = setInterval(() => this.scheduleClatter(), CLATTER_INTERVAL_MS);
    return this.graph;
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.random();
    return source;
  }

  /** Track links slapping over the sprockets: one click per link, faster with speed. */
  private scheduleClatter(): void {
    const graph = this.graph;
    const state = this.state;
    if (!graph) return;
    const now = this.ctx.currentTime;
    if (this.nextClatter < now) this.nextClatter = now;
    const speed = state?.speed ?? 0;
    if (speed < 0.04) {
      this.nextClatter = now + CLATTER_INTERVAL_MS / 1000;
      return;
    }
    const rate = 5 + 26 * speed;
    while (this.nextClatter < now + CLATTER_LOOKAHEAD) {
      const at = this.nextClatter;
      const source = this.ctx.createBufferSource();
      source.buffer = this.white;
      const gain = this.ctx.createGain();
      const peak = (0.12 + 0.18 * speed) * (0.6 + Math.random() * 0.4);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.006 + Math.random() * 0.008);
      source.connect(gain);
      gain.connect(graph.clatterBus);
      source.start(at, Math.random() * 1.5);
      source.stop(at + 0.03);
      this.nextClatter += (1 / rate) * (0.85 + Math.random() * 0.3);
    }
  }

  private fadeOut(): void {
    const graph = this.graph;
    if (!graph || this.stopTimer !== null) return;
    graph.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
    this.stopTimer = setTimeout(() => this.stop(), 600);
  }

  private stop(): void {
    const graph = this.graph;
    this.stopTimer = null;
    if (!graph) return;
    if (this.clatterTimer !== null) clearInterval(this.clatterTimer);
    this.clatterTimer = null;
    for (const source of graph.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    graph.master.disconnect();
    graph.panner.disconnect();
    this.graph = null;
  }
}
