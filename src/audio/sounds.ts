import { noteFrequency as n, vary, type Voice } from './Synth';

export type SoundId =
  | 'playerShot'
  | 'enemyShot'
  | 'hitSteel'
  | 'hitBrick'
  | 'brickBreak'
  | 'hitTank'
  | 'shieldHit'
  | 'clash'
  | 'explosion'
  | 'playerExplosion'
  | 'baseDestroyed'
  | 'enemyIncoming'
  | 'playerSpawn'
  | 'powerUpAppear'
  | 'powerUp'
  | 'extraLife'
  | 'levelComplete'
  | 'gameOver'
  | 'victory'
  | 'menuMove'
  | 'menuSelect'
  | 'pause'
  | 'tally'
  | 'machineGun'
  | 'enemyMachineGun'
  | 'ricochet'
  | 'bulletHitBrick'
  | 'dirtHit'
  | 'splash'
  | 'tankDisabled'
  | 'tankImpact'
  | 'rocketLaunch'
  | 'launcherReady'
  | 'rocketExplosion'
  | 'mineExplosion'
  | 'minePlant'
  | 'mineArm'
  | 'crateDrop'
  | 'pickup'
  | 'hatch'
  | 'soldierHit'
  | 'soldierDown'
  | 'crushed'
  | 'wrenchAppear'
  | 'wrench'
  | 'repairTick'
  | 'repairDone'
  | 'newTank'
  | 'baseAlarm'
  | 'enemySiren'
  | 'bunkerHit';

export interface SoundDesign {
  readonly play: (v: Voice) => void;
  /**
   * Mix level. Designs are built at natural loudness relative to each other's parts; this sets
   * where the whole sound sits in the mix (measured peaks at close range: blasts ~1, the cannon
   * ~0.7, machine guns ~0.3, impacts ~0.4).
   */
  readonly level?: number;
  /** Reverb send at close range; distance adds more. */
  readonly reverb?: number;
  /** Interface sounds ignore where things happen. */
  readonly spatial?: boolean;
}

const arpeggio = (v: Voice, notes: readonly string[], step: number, volume: number, wave: 'pulse' | 'square' | 'triangle' = 'pulse') =>
  notes.forEach((note, i) => v.tone({ wave, from: n(note), duration: step * 1.6, volume, delay: i * step }));

/** Interface sound: chiptune, centred, dry. */
const ui = (play: (v: Voice) => void): SoundDesign => ({ play, spatial: false });

/**
 * A large-calibre gun: the supersonic crack of the muzzle blast, a saturated low boom that drops in
 * pitch, a wide band of blast noise, and the clank of the breech a moment later.
 */
function cannon(v: Voice, pitch: number, weight: number): void {
  v.noise({ color: 'white', filter: 'highpass', from: vary(1600), duration: 0.06, volume: 0.9 * weight, attack: 0.0008 });
  v.noise({ color: 'pink', filter: 'bandpass', from: vary(650), q: 0.7, duration: 0.2, volume: 0.6 * weight });
  v.tone({ wave: 'sine', from: vary(95 * pitch), to: 32 * pitch, duration: 0.6, volume: 0.95 * weight, attack: 0.002, drive: 2.5 });
  v.tone({ wave: 'sine', from: 48 * pitch, to: 26, duration: 0.85, volume: 0.55 * weight, attack: 0.004 });
  v.noise({ color: 'brown', filter: 'lowpass', from: 2600, to: 160, duration: 1, volume: 0.9 * weight, attack: 0.002, drive: 1 });
  v.modes({ base: vary(560), ratios: [1, 2.37, 4.1, 6.2], decays: [0.14, 0.09, 0.06, 0.04], gains: [0.6, 0.4, 0.3, 0.2], volume: 0.1, delay: 0.34 });
}

/**
 * A blast: crack, a deep saturated thump, rolling low-passed rumble, then debris pattering down.
 * `size` scales weight and length.
 */
function blast(v: Voice, size: number, debris: number): void {
  v.noise({ color: 'white', filter: 'highpass', from: vary(1300), duration: 0.05 + 0.03 * size, volume: 0.85, attack: 0.0008 });
  v.tone({ wave: 'sine', from: vary(90 - 15 * size), to: 22, duration: 0.7 + 0.5 * size, volume: 1, attack: 0.003, drive: 3 + size });
  v.tone({ wave: 'sine', from: 44, to: 18, duration: 1 + 0.6 * size, volume: 0.65, attack: 0.006 });
  v.noise({ color: 'brown', filter: 'lowpass', from: 3200, to: 90, duration: 1 + 0.8 * size, volume: 1, attack: 0.003, drive: 1.5 });
  v.noise({ color: 'pink', filter: 'bandpass', from: vary(500), q: 0.6, duration: 0.35 + 0.2 * size, volume: 0.45 });
  v.grains({
    count: Math.round(debris * size),
    start: 0.18,
    end: 0.9 + 0.9 * size,
    length: [0.006, 0.03],
    filter: 'bandpass',
    frequency: [900, 3600],
    volume: [0.03, 0.12],
    q: 1.2,
    fade: true,
  });
}

/** A metal plate struck hard: ringing inharmonic modes over a transient and a thump. */
function clang(v: Voice, base: number, ring: number, volume: number): void {
  v.noise({ color: 'white', filter: 'highpass', from: 2400, duration: 0.02, volume: 0.6 * volume, attack: 0.0006 });
  v.noise({ color: 'pink', filter: 'bandpass', from: vary(1700), q: 1, duration: 0.08, volume: 0.35 * volume });
  v.tone({ wave: 'sine', from: vary(140), to: 70, duration: 0.09, volume: 0.35 * volume, drive: 1 });
  v.modes({
    base: vary(base, 0.08),
    ratios: [1, 2.32, 4.25, 6.63, 9.38],
    decays: [1.1 * ring, 0.7 * ring, 0.45 * ring, 0.3 * ring, 0.2 * ring],
    gains: [0.5, 0.35, 0.25, 0.15, 0.1],
    volume: 0.4 * volume,
  });
}

/** One round from a machine gun: crack, pop and a short chest thump, a little different each time. */
function gunshot(v: Voice, crack: number, thump: number, volume: number): void {
  v.noise({ color: 'white', filter: 'bandpass', from: vary(crack, 0.1), q: 0.9, duration: 0.025, volume: 0.6 * volume, attack: 0.0005 });
  v.noise({ color: 'pink', filter: 'lowpass', from: vary(1900), to: 380, duration: 0.075, volume: 0.5 * volume });
  v.tone({ wave: 'sine', from: vary(thump, 0.08), to: thump * 0.45, duration: 0.055, volume: 0.45 * volume, drive: 1.5 });
  v.noise({ color: 'white', filter: 'highpass', from: 5200, duration: 0.008, volume: 0.1 * volume, delay: vary(0.045, 0.15) });
}

/** Original sound design: every effect is synthesised on the fly. */
export const SOUNDS: Readonly<Record<SoundId, SoundDesign>> = {
  // Weapons.
  playerShot: { level: 0.25, play: (v) => cannon(v, 1, 1), reverb: 0.32 },
  enemyShot: { level: 0.29, play: (v) => cannon(v, 1.15, 0.85), reverb: 0.32 },
  machineGun: { level: 0.54, play: (v) => gunshot(v, 3200, 160, 1), reverb: 0.18 },
  // Enemy tanks mount a heavier, slower machine gun with a deeper bark.
  enemyMachineGun: { level: 0.55, play: (v) => gunshot(v, 2300, 115, 1.05), reverb: 0.2 },
  launcherReady: {
    level: 0.9,
    play: (v) => {
      // The tube coming up onto a shoulder, and the firing mechanism cocked: clack, clack.
      v.noise({ color: 'pink', filter: 'bandpass', from: 900, q: 1.5, duration: 0.06, volume: 0.18 });
      v.modes({ base: vary(1300), ratios: [1, 2.2, 3.9], decays: [0.07, 0.05, 0.03], gains: [0.5, 0.3, 0.2], volume: 0.22, delay: 0.12 });
      v.noise({ color: 'white', filter: 'highpass', from: 3000, duration: 0.01, volume: 0.25, delay: 0.12 });
      v.modes({ base: vary(1700), ratios: [1, 2.4], decays: [0.06, 0.04], gains: [0.5, 0.3], volume: 0.2, delay: 0.26 });
      v.noise({ color: 'white', filter: 'highpass', from: 3400, duration: 0.01, volume: 0.25, delay: 0.26 });
    },
  },
  rocketLaunch: {
    level: 0.85,
    reverb: 0.28,
    play: (v) => {
      v.noise({ color: 'white', filter: 'bandpass', from: 2500, duration: 0.03, volume: 0.6, attack: 0.0006 });
      v.tone({ wave: 'sine', from: 130, to: 55, duration: 0.09, volume: 0.55, drive: 1.5 });
      // Backblast: a wide whoosh sweeping up.
      v.noise({ color: 'pink', filter: 'bandpass', from: 420, to: 1900, q: 0.7, duration: 0.4, volume: 0.75, attack: 0.006 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 900, to: 200, duration: 0.5, volume: 0.5 });
      // The motor's hiss, held while it burns.
      v.noise({ color: 'white', filter: 'bandpass', from: 2800, to: 1300, q: 0.6, duration: 0.95, volume: 0.32, attack: 0.04, sustain: 0.6 });
    },
  },

  // Impacts.
  hitBrick: {
    level: 0.5,
    reverb: 0.22,
    play: (v) => {
      v.noise({ color: 'white', filter: 'highpass', from: 900, duration: 0.03, volume: 0.55, attack: 0.0008 });
      v.tone({ wave: 'sine', from: vary(110), to: 45, duration: 0.22, volume: 0.6, drive: 1.5 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 950, to: 330, q: 0.8, duration: 0.35, volume: 0.5 });
      v.grains({ count: 9, start: 0.04, end: 0.55, length: [0.005, 0.02], filter: 'lowpass', frequency: [1400, 3200], volume: [0.04, 0.14], fade: true });
    },
  },
  brickBreak: {
    level: 0.52,
    reverb: 0.25,
    play: (v) => {
      v.tone({ wave: 'sine', from: vary(92), to: 36, duration: 0.32, volume: 0.6, drive: 2 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 1900, to: 190, duration: 0.6, volume: 0.65 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 700, q: 0.7, duration: 0.25, volume: 0.4 });
      v.grains({ count: 16, start: 0.05, end: 0.9, length: [0.006, 0.03], filter: 'lowpass', frequency: [900, 2600], volume: [0.04, 0.16], fade: true });
    },
  },
  hitSteel: { level: 0.65, play: (v) => clang(v, 410, 1, 1), reverb: 0.32 },
  hitTank: {
    level: 0.4,
    reverb: 0.28,
    play: (v) => {
      // Armour is thick: a duller, heavier clang with a big thud and spall.
      v.tone({ wave: 'sine', from: vary(95), to: 40, duration: 0.28, volume: 0.75, drive: 2 });
      clang(v, 190, 0.5, 0.9);
      v.noise({ color: 'white', filter: 'bandpass', from: 3200, q: 0.8, duration: 0.12, volume: 0.2, delay: 0.01 });
    },
  },
  clash: {
    level: 0.47,
    reverb: 0.3,
    play: (v) => {
      v.noise({ color: 'white', filter: 'highpass', from: 2000, duration: 0.03, volume: 0.6 });
      v.modes({ base: vary(880), ratios: [1, 2.4, 4.2], decays: [0.3, 0.18, 0.1], gains: [0.5, 0.35, 0.2], volume: 0.35 });
      v.tone({ wave: 'sine', from: 160, to: 60, duration: 0.15, volume: 0.4, drive: 1.5 });
    },
  },
  shieldHit: {
    play: (v) => {
      v.tone({ wave: 'triangle', from: 1400, to: 2600, duration: 0.12, volume: 0.12 });
      v.noise({ color: 'white', filter: 'highpass', from: 6000, duration: 0.05, volume: 0.1 });
    },
  },
  ricochet: {
    level: 0.6,
    reverb: 0.2,
    play: (v) => {
      v.noise({ color: 'white', filter: 'highpass', from: 4200, duration: 0.012, volume: 0.32, attack: 0.0005 });
      if (Math.random() < 0.55) {
        // The classic whine of a deflected round.
        const from = vary(3100, 0.15);
        v.tone({ wave: 'sine', from, to: from * vary(0.36, 0.2), duration: vary(0.24, 0.3), volume: 0.1, attack: 0.003 });
      } else {
        v.modes({ base: vary(2100, 0.1), ratios: [1, 1.71, 2.53], decays: [0.12, 0.08, 0.05], gains: [0.5, 0.3, 0.2], volume: 0.18 });
      }
    },
  },
  bulletHitBrick: {
    level: 2.4,
    reverb: 0.12,
    play: (v) => {
      v.noise({ color: 'pink', filter: 'bandpass', from: vary(1200, 0.15), q: 1, duration: 0.04, volume: 0.35 });
      v.grains({ count: 3, start: 0.01, end: 0.12, length: [0.004, 0.012], filter: 'lowpass', frequency: [1800, 3500], volume: [0.04, 0.1] });
    },
  },
  dirtHit: { level: 2.5, play: (v) => v.noise({ color: 'brown', filter: 'lowpass', from: vary(700), duration: 0.07, volume: 0.32 }), reverb: 0.1 },
  splash: {
    level: 1.3,
    reverb: 0.15,
    play: (v) => {
      v.noise({ color: 'white', filter: 'bandpass', from: 1500, to: 600, q: 0.8, duration: 0.25, volume: 0.32 });
      v.grains({ count: 7, start: 0.03, end: 0.4, length: [0.005, 0.015], filter: 'bandpass', frequency: [2000, 4500], volume: [0.03, 0.08], q: 2, fade: true });
    },
  },

  // Explosions.
  tankDisabled: {
    level: 0.27,
    reverb: 0.38,
    play: (v) => {
      blast(v, 0.6, 14);
      clang(v, 160, 0.6, 0.7);
      v.grains({ count: 12, start: 0.3, end: 1.6, length: [0.003, 0.01], filter: 'bandpass', frequency: [2500, 5200], volume: [0.02, 0.07], q: 1.5 });
    },
  },
  explosion: {
    level: 0.33,
    reverb: 0.45,
    play: (v) => {
      blast(v, 1, 20);
      // Ammunition cooking off.
      for (const t of [0.24, 0.52, 0.83]) {
        v.tone({ wave: 'sine', from: vary(130), to: 50, duration: 0.2, volume: 0.35, delay: vary(t, 0.15), drive: 2 });
        v.noise({ color: 'pink', filter: 'bandpass', from: vary(900), duration: 0.12, volume: 0.3, delay: t });
      }
    },
  },
  playerExplosion: {
    level: 0.4,
    reverb: 0.4,
    play: (v) => {
      blast(v, 1.2, 22);
      for (const t of [0.3, 0.6]) v.tone({ wave: 'sine', from: vary(120), to: 45, duration: 0.22, volume: 0.35, delay: t, drive: 2 });
    },
  },
  rocketExplosion: {
    level: 0.34,
    reverb: 0.42,
    play: (v) => {
      // A shaped charge: a very sharp crack on top of the blast.
      v.noise({ color: 'white', filter: 'highpass', from: 1800, duration: 0.04, volume: 1, attack: 0.0005 });
      blast(v, 0.8, 14);
    },
  },
  mineExplosion: {
    level: 0.43,
    reverb: 0.48,
    play: (v) => {
      // Buried charge: deep, heavy and muffled, then earth raining down.
      v.tone({ wave: 'sine', from: 58, to: 17, duration: 1.4, volume: 1, attack: 0.004, drive: 4 });
      v.tone({ wave: 'sine', from: 34, to: 15, duration: 1.8, volume: 0.8, attack: 0.01 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 1300, to: 70, duration: 1.8, volume: 1, attack: 0.004, drive: 2 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 650, q: 0.6, duration: 0.5, volume: 0.45, delay: 0.04 });
      v.grains({ count: 26, start: 0.35, end: 2.4, length: [0.01, 0.05], filter: 'lowpass', frequency: [500, 1600], volume: [0.05, 0.18], fade: true });
    },
  },
  baseDestroyed: {
    level: 0.32,
    reverb: 0.5,
    play: (v) => {
      blast(v, 1.5, 26);
      // The bunker settling as it collapses.
      v.noise({ color: 'brown', filter: 'lowpass', from: 320, duration: 2.6, volume: 0.6, delay: 0.3, attack: 0.2 });
      v.grains({ count: 18, start: 0.6, end: 2.6, length: [0.02, 0.06], filter: 'lowpass', frequency: [400, 1200], volume: [0.06, 0.16], fade: true });
    },
  },

  // Vehicles and crews.
  tankImpact: {
    level: 0.5,
    reverb: 0.25,
    play: (v) => {
      v.tone({ wave: 'sine', from: vary(80), to: 38, duration: 0.22, volume: 0.65, drive: 2 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 900, duration: 0.12, volume: 0.5 });
      v.modes({ base: vary(150), ratios: [1, 2.7, 5.1], decays: [0.35, 0.2, 0.12], gains: [0.5, 0.3, 0.2], volume: 0.3 });
    },
  },
  hatch: {
    level: 0.7,
    reverb: 0.15,
    play: (v) => {
      v.noise({ color: 'white', filter: 'highpass', from: 3000, duration: 0.01, volume: 0.25 });
      v.modes({ base: vary(560), ratios: [1, 2.6, 4.9], decays: [0.22, 0.12, 0.07], gains: [0.5, 0.3, 0.2], volume: 0.22 });
      v.tone({ wave: 'sine', from: 140, to: 80, duration: 0.07, volume: 0.25 });
    },
  },
  soldierHit: {
    play: (v) => {
      v.noise({ color: 'pink', filter: 'lowpass', from: 650, duration: 0.05, volume: 0.35 });
      v.tone({ wave: 'sine', from: 190, to: 120, duration: 0.06, volume: 0.25 });
    },
  },
  soldierDown: {
    play: (v) => {
      v.noise({ color: 'brown', filter: 'lowpass', from: 420, duration: 0.16, volume: 0.45 });
      v.tone({ wave: 'sine', from: 95, to: 50, duration: 0.13, volume: 0.35 });
    },
  },
  crushed: {
    play: (v) => {
      v.noise({ color: 'pink', filter: 'lowpass', from: 1200, to: 280, duration: 0.2, volume: 0.45 });
      v.grains({ count: 5, start: 0, end: 0.15, length: [0.005, 0.015], filter: 'lowpass', frequency: [800, 1800], volume: [0.05, 0.12] });
    },
  },
  crateDrop: {
    level: 0.75,
    reverb: 0.15,
    play: (v) => {
      // A wooden crate thumping down.
      v.tone({ wave: 'sine', from: vary(190), to: 120, duration: 0.09, volume: 0.35 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 800, q: 1.2, duration: 0.07, volume: 0.3 });
      v.grains({ count: 3, start: 0.02, end: 0.15, length: [0.005, 0.015], filter: 'lowpass', frequency: [1200, 2400], volume: [0.03, 0.08] });
    },
  },
  pickup: {
    level: 0.65,
    play: (v) => {
      // Latches snapping open, a strap pulled tight.
      v.noise({ color: 'white', filter: 'highpass', from: 3200, duration: 0.01, volume: 0.25 });
      v.noise({ color: 'white', filter: 'highpass', from: 3600, duration: 0.01, volume: 0.22, delay: 0.07 });
      v.modes({ base: 1700, ratios: [1, 2.1], decays: [0.08, 0.05], gains: [0.5, 0.3], volume: 0.12, delay: 0.07 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 1500, q: 2, duration: 0.09, volume: 0.12, delay: 0.12 });
    },
  },
  minePlant: {
    level: 1.3,
    play: (v) => {
      // Scraping out a hollow, then pressing the mine in.
      v.noise({ color: 'pink', filter: 'bandpass', from: 1500, q: 2, duration: 0.09, volume: 0.25 });
      v.noise({ color: 'pink', filter: 'bandpass', from: 1300, q: 2, duration: 0.09, volume: 0.22, delay: 0.14 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 500, duration: 0.08, volume: 0.3, delay: 0.3 });
    },
  },
  mineArm: {
    level: 0.6,
    play: (v) => {
      v.noise({ color: 'white', filter: 'highpass', from: 4200, duration: 0.006, volume: 0.25 });
      v.tone({ wave: 'sine', from: 2400, duration: 0.035, volume: 0.06, delay: 0.02 });
    },
  },
  wrenchAppear: { play: (v) => arpeggio(v, ['E6', 'B6'], 0.05, 0.05, 'triangle') },
  wrench: {
    level: 0.67,
    play: (v) => {
      v.modes({ base: 2300, ratios: [1, 1.63, 2.9], decays: [0.25, 0.15, 0.08], gains: [0.4, 0.3, 0.2], volume: 0.2 });
      v.noise({ color: 'white', filter: 'highpass', from: 3500, duration: 0.01, volume: 0.2 });
    },
  },
  repairTick: {
    level: 0.3,
    play: (v) => {
      // A ratchet spanner: three quick clicks with a metallic tick.
      for (let i = 0; i < 3; i++) v.noise({ color: 'white', filter: 'highpass', from: 3600, duration: 0.006, volume: 0.22, delay: i * 0.035 });
      v.modes({ base: 1900, ratios: [1, 2.3], decays: [0.06, 0.04], gains: [0.4, 0.2], volume: 0.08 });
    },
  },
  repairDone: {
    play: (v) => {
      v.modes({ base: 420, ratios: [1, 2.5, 4.4], decays: [0.3, 0.2, 0.1], gains: [0.5, 0.3, 0.2], volume: 0.25 });
      // The engine catches.
      v.tone({ wave: 'sawtooth', from: 28, to: 46, duration: 0.6, volume: 0.25, delay: 0.15, attack: 0.08, drive: 2 });
    },
  },
  newTank: ui((v) => arpeggio(v, ['A4', 'D5', 'F#5', 'A5'], 0.08, 0.06, 'triangle')),

  // The enemy HQ.
  enemySiren: {
    level: 0.5,
    reverb: 0.5,
    play: (v) => {
      // An air-raid siren winding up and down twice: two detuned rotors through a horn-like band.
      for (const start of [0, 1.7]) {
        for (const [from, to, at, length] of [[260, 720, 0, 0.8], [720, 360, 0.8, 0.9]] as const) {
          v.tone({ wave: 'sawtooth', from, to, duration: length, volume: 0.16, delay: start + at, attack: 0.08, sustain: 0.8 });
          v.tone({ wave: 'square', from: from * 1.005, to: to * 1.005, duration: length, volume: 0.07, delay: start + at, attack: 0.08, sustain: 0.8 });
        }
      }
    },
  },
  bunkerHit: {
    level: 0.45,
    reverb: 0.35,
    play: (v) => {
      // Reinforced concrete over steel: a deep thud, crumbling, and a dull ring of the frame.
      v.noise({ color: 'white', filter: 'highpass', from: 1200, duration: 0.03, volume: 0.6, attack: 0.0008 });
      v.tone({ wave: 'sine', from: vary(80), to: 34, duration: 0.4, volume: 0.9, drive: 2.5 });
      v.noise({ color: 'brown', filter: 'lowpass', from: 1500, to: 160, duration: 0.55, volume: 0.7 });
      v.modes({ base: vary(130), ratios: [1, 2.6, 4.7], decays: [0.6, 0.35, 0.2], gains: [0.5, 0.3, 0.2], volume: 0.3 });
      v.grains({ count: 14, start: 0.05, end: 0.9, length: [0.006, 0.03], filter: 'lowpass', frequency: [700, 2200], volume: [0.04, 0.14], fade: true });
    },
  },

  // Interface and signals.
  enemyIncoming: { play: (v) => v.tone({ wave: 'triangle', from: 220, to: 660, duration: 0.25, volume: 0.04 }) },
  playerSpawn: ui((v) => arpeggio(v, ['D5', 'A5', 'D6'], 0.05, 0.05, 'triangle')),
  powerUpAppear: { play: (v) => arpeggio(v, ['A5', 'E6', 'A6'], 0.045, 0.06, 'triangle') },
  powerUp: ui((v) => arpeggio(v, ['D5', 'F#5', 'A5', 'D6', 'F#6'], 0.045, 0.08)),
  extraLife: ui((v) => arpeggio(v, ['G5', 'B5', 'D6', 'G6', 'D6', 'G6'], 0.06, 0.08)),
  levelComplete: ui((v) => {
    arpeggio(v, ['D5', 'F#5', 'A5', 'D6', 'A5', 'D6', 'F#6'], 0.1, 0.08);
    arpeggio(v, ['D3', 'D3', 'A3', 'D4'], 0.18, 0.12, 'triangle');
  }),
  gameOver: ui((v) => {
    arpeggio(v, ['A4', 'F4', 'D4', 'C#4', 'D4'], 0.18, 0.08);
    arpeggio(v, ['D3', 'A#2', 'A2', 'D2'], 0.22, 0.14, 'triangle');
  }),
  victory: ui((v) => {
    arpeggio(v, ['D5', 'D5', 'D5', 'A#4', 'C5', 'D5', 'C5', 'D5', 'F5', 'A5', 'D6'], 0.12, 0.08);
    arpeggio(v, ['D3', 'A#2', 'C3', 'D3', 'F3', 'A3', 'D4'], 0.19, 0.12, 'triangle');
  }),
  menuMove: ui((v) => v.tone({ wave: 'square', from: 660, duration: 0.035, volume: 0.05 })),
  menuSelect: ui((v) => v.tone({ wave: 'square', from: 660, to: 1320, duration: 0.09, volume: 0.07 })),
  pause: ui((v) => arpeggio(v, ['E5', 'B4'], 0.06, 0.06)),
  tally: ui((v) => v.tone({ wave: 'pulse', from: 1040, duration: 0.04, volume: 0.05 })),
  baseAlarm: ui((v) => {
    // A klaxon: two detuned saws through a nasal band-pass.
    for (const [from, delay] of [[440, 0], [370, 0.22], [440, 0.44]] as const) {
      v.tone({ wave: 'sawtooth', from, duration: 0.2, volume: 0.06, delay, sustain: 0.7, attack: 0.01 });
      v.tone({ wave: 'sawtooth', from: from * 1.01, duration: 0.2, volume: 0.05, delay, sustain: 0.7, attack: 0.01 });
    }
  }),
};
