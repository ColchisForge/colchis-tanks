import { noteFrequency, type Synth } from './Synth';

export type MusicTrack = 'menu' | 'battle';

interface Track {
  readonly bpm: number;
  readonly stepsPerBeat: number;
  readonly lead: readonly (string | null)[];
  readonly bass: readonly (string | null)[];
  /** One character per step: k kick, s snare, h hat, . rest. */
  readonly drums: string;
  readonly leadVolume: number;
  readonly bassVolume: number;
  readonly drumVolume: number;
}

const steps = (pattern: string): (string | null)[] => pattern.trim().split(/\s+/).map((token) => (token === '.' ? null : token));

/** Original compositions in D minor. */
const TRACKS: Readonly<Record<MusicTrack, Track>> = {
  menu: {
    bpm: 112,
    stepsPerBeat: 2,
    lead: steps(`
      D5 . F5 . A5 . G5 F5    E5 . C5 . D5 . . .
      F5 . A5 . C6 . A#5 A5   G5 . E5 . F5 . . .
      D5 . F5 . A5 . D6 C6    A#5 . A5 . G5 . F5 G5
      A5 . G5 . F5 . E5 .     D5 . . . A4 . C#5 .
    `),
    bass: steps(`
      D3 . D3 . D3 . D3 .     C3 . C3 . A2 . A2 .
      F2 . F2 . F2 . F2 .     C3 . C3 . C3 . C3 .
      D3 . D3 . D3 . D3 .     A#2 . A#2 . G2 . G2 .
      A2 . A2 . A2 . A2 .     D3 . D3 . A2 . A2 .
    `),
    drums: 'k.h.s.h.'.repeat(8),
    leadVolume: 0.05,
    bassVolume: 0.08,
    drumVolume: 0.05,
  },
  battle: {
    bpm: 128,
    stepsPerBeat: 4,
    lead: steps(`
      D5 . . . . . F5 . . . . . A5 . . .   . . . . . . . . G5 . . . F5 . E5 .
      A#4 . . . . . D5 . . . . . F5 . . .  . . . . . . . . E5 . . . C#5 . . .
    `),
    bass: steps(`
      D2 . D3 . D2 . D3 . F2 . F3 . G2 . A2 .     D2 . D3 . D2 . D3 . C3 . C2 . A1 . C2 .
      A#1 . A#2 . A#1 . A#2 . C2 . C3 . A1 . A2 . A#1 . A#2 . G1 . G2 . A1 . A2 . A1 . C#2 .
    `),
    drums: 'k.h.s.hkk.h.s.hh'.repeat(4),
    leadVolume: 0.025,
    bassVolume: 0.07,
    drumVolume: 0.045,
  },
};

const LOOKAHEAD = 0.12;
const SCHEDULE_INTERVAL_MS = 25;

/** Look-ahead step sequencer: notes are scheduled slightly ahead on the audio clock for steady timing. */
export class MusicPlayer {
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly synth: Synth) {}

  play(name: MusicTrack): void {
    this.stop();
    this.track = TRACKS[name];
    this.step = 0;
    this.nextTime = this.synth.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  private schedule(): void {
    const track = this.track;
    if (!track) return;
    const stepDuration = 60 / track.bpm / track.stepsPerBeat;
    const length = Math.max(track.lead.length, track.bass.length, track.drums.length);
    while (this.nextTime < this.synth.ctx.currentTime + LOOKAHEAD) {
      this.playStep(track, this.step % length, this.nextTime, stepDuration);
      this.nextTime += stepDuration;
      this.step++;
    }
  }

  private playStep(track: Track, index: number, at: number, stepDuration: number): void {
    const lead = track.lead[index % track.lead.length];
    if (lead) this.synth.tone({ wave: 'pulse', from: noteFrequency(lead), duration: stepDuration * 1.7, volume: track.leadVolume }, at);
    const bass = track.bass[index % track.bass.length];
    if (bass) this.synth.tone({ wave: 'triangle', from: noteFrequency(bass), duration: stepDuration * 1.8, volume: track.bassVolume }, at);
    const hit = track.drums[index % track.drums.length];
    const v = track.drumVolume;
    if (hit === 'k') this.synth.tone({ wave: 'sine', from: 130, to: 40, duration: 0.12, volume: v * 2.2 }, at);
    else if (hit === 's') this.synth.noise({ filter: 'highpass', from: 1500, duration: 0.09, volume: v * 1.4 }, at);
    else if (hit === 'h') this.synth.noise({ filter: 'highpass', from: 7000, duration: 0.03, volume: v }, at);
  }
}
