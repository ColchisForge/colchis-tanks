import { LEVEL_HEIGHT, LEVEL_WIDTH } from '../game/GameConfig';
import { EngineSound, type EngineState } from './EngineSound';
import { MusicPlayer, type MusicTrack } from './music';
import { SOUNDS, type SoundId } from './sounds';
import { createOutdoorImpulse, Synth, Voice } from './Synth';

export type { EngineState, EngineSurface } from './EngineSound';
export type { MusicTrack } from './music';
export type { SoundId } from './sounds';

/** A point on the battlefield, in field pixels. */
export interface SoundPosition {
  readonly x: number;
  readonly y: number;
}

/** The player's own tank, and the loudest enemy tank within earshot. */
export type EngineSlot = 'player' | 'enemy';

/** What the game needs from audio. Tests use SILENT_AUDIO. */
export interface AudioOutput {
  /** Plays a sound effect, placed at `at` on the battlefield if given. */
  play(sound: SoundId, at?: SoundPosition): void;
  /** Where the player is: sounds further away are quieter and duller. */
  setListener(at: SoundPosition | null): void;
  /** Runs (or, with null, silences) a continuous engine sound. */
  setEngine(slot: EngineSlot, state: EngineState | null): void;
  setMusic(track: MusicTrack | null): void;
  /** Quietens the music, e.g. while paused. */
  setDucked(ducked: boolean): void;
}

export const SILENT_AUDIO: AudioOutput = {
  play: () => undefined,
  setListener: () => undefined,
  setEngine: () => undefined,
  setMusic: () => undefined,
  setDucked: () => undefined,
};

/** Stops machine-gun stacking when many identical events land in one frame. */
const MIN_REPEAT_SECONDS = 0.035;
/** Most effects sounding at once; beyond this, new ones are dropped rather than muddying the mix. */
const MAX_VOICES = 48;
const MUSIC_VOLUME = 0.55;
const DUCKED_VOLUME = 0.18;
const SFX_VOLUME = 0.85;
const REVERB_RETURN = 0.45;
/** How quickly sounds fade with distance from the listener (px). */
const FALLOFF = 170;
/** Distance over which air takes the top off a sound (px). */
const AIR = 190;
/** How wide the battlefield spreads across the stereo field. */
const STEREO_WIDTH = 0.8;

export interface Placement {
  readonly pan: number;
  readonly gain: number;
  readonly cutoff: number;
  readonly reverb: number;
}

/**
 * Where a sound sits in the mix. The camera sees the whole field, so stereo follows the screen;
 * distance from the listener lowers the level, filters off the highs and adds room.
 */
export function placeSound(at: SoundPosition, listener: SoundPosition | null, reverb: number): Placement {
  const pan = Math.max(-1, Math.min(1, (at.x - LEVEL_WIDTH / 2) / (LEVEL_WIDTH / 2))) * STEREO_WIDTH;
  const ear = listener ?? { x: LEVEL_WIDTH / 2, y: LEVEL_HEIGHT };
  const distance = Math.hypot(at.x - ear.x, at.y - ear.y);
  return {
    pan,
    gain: 1 / (1 + distance / FALLOFF),
    cutoff: Math.max(1600, 18000 * Math.exp(-distance / AIR)),
    reverb: reverb * (1 + distance / 200),
  };
}

export class AudioManager implements AudioOutput {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private music: MusicPlayer | null = null;
  private musicBus: GainNode | null = null;
  private engines: Record<EngineSlot, EngineSound> | null = null;
  private soundEnabled = true;
  private musicEnabled = true;
  private track: MusicTrack | null = null;
  private playingTrack: MusicTrack | null = null;
  private ducked = false;
  private listener: SoundPosition | null = null;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundId, number>();

  /** Must be called from a user gesture; browsers keep audio suspended until then. */
  unlock(): void {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return;
      try {
        this.build(new AudioCtor());
      } catch {
        return;
      }
    }
    void this.ctx?.resume();
    this.syncMusic();
  }

  configure(sound: boolean, music: boolean): void {
    this.soundEnabled = sound;
    this.musicEnabled = music;
    if (!sound && this.engines) for (const engine of Object.values(this.engines)) engine.update(null);
    this.syncMusic();
  }

  play(sound: SoundId, at?: SoundPosition): void {
    const ctx = this.ctx;
    if (!this.soundEnabled || !ctx || !this.sfxBus || ctx.state !== 'running') return;
    if (this.voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(sound) ?? -1;
    if (now - last < MIN_REPEAT_SECONDS) return;
    this.lastPlayed.set(sound, now);

    const design = SOUNDS[sound];
    const reverb = design.reverb ?? 0.1;
    const placement = at && design.spatial !== false ? placeSound(at, this.listener, reverb) : { pan: 0, gain: 1, cutoff: 20000, reverb };
    const voice = new Voice(ctx, this.sfxBus, this.reverb, { ...placement, gain: placement.gain * (design.level ?? 1) });
    design.play(voice);
    voice.release();
    this.voices++;
    setTimeout(() => this.voices--, (voice.remaining + 0.3) * 1000);
  }

  setListener(at: SoundPosition | null): void {
    this.listener = at;
  }

  setEngine(slot: EngineSlot, state: EngineState | null): void {
    const engines = this.engines;
    if (!engines) return;
    const running = this.soundEnabled && this.ctx?.state === 'running';
    engines[slot].update(running ? state : null);
  }

  setMusic(track: MusicTrack | null): void {
    this.track = track;
    this.syncMusic();
  }

  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(ducked ? DUCKED_VOLUME : MUSIC_VOLUME, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * master → compressor → speakers. Effects and engines share a bus with a send to an outdoor
   * reverb; the music has its own bus. The compressor keeps explosions from clipping and glues
   * the mix together.
   */
  private build(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 10;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(compressor);

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOLUME;
    sfxBus.connect(master);
    const reverb = ctx.createConvolver();
    reverb.buffer = createOutdoorImpulse(ctx);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = REVERB_RETURN;
    reverb.connect(reverbReturn);
    reverbReturn.connect(master);

    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(master);

    this.ctx = ctx;
    this.sfxBus = sfxBus;
    this.reverb = reverb;
    this.musicBus = musicBus;
    this.music = new MusicPlayer(new Synth(ctx, musicBus));
    this.engines = { player: new EngineSound(ctx, sfxBus, 0.11), enemy: new EngineSound(ctx, sfxBus, 0.09) };
  }

  private syncMusic(): void {
    if (!this.music) return;
    const wanted = this.musicEnabled ? this.track : null;
    if (wanted === this.playingTrack) return;
    this.playingTrack = wanted;
    if (wanted) this.music.play(wanted);
    else this.music.stop();
    this.setDucked(this.ducked);
  }
}
