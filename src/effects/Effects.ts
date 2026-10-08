import { removeInactive } from '../core/collections';
import { DIRECTION_VECTORS, type Direction, type Vec } from '../core/geometry';
import type { Team } from '../entities/Unit';
import { MAX_PARTICLES } from '../game/GameConfig';
import { PALETTE } from '../rendering/palette';

/** Cosmetic-only randomness; gameplay uses the battle's seeded RNG. */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Timed {
  active: boolean;
  age: number;
  readonly duration: number;
}

/**
 * spark: a bright streak, drawn additively. chunk: a bit of debris thrown into the air.
 * puff: soft dust or smoke. flame: rising fire. leaf: a leaf shaken from a bush.
 * drop: a water droplet. casing: a spent machine-gun cartridge.
 */
export type ParticleKind = 'spark' | 'chunk' | 'puff' | 'flame' | 'leaf' | 'drop' | 'casing';

export interface Particle extends Timed {
  readonly kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height above the ground; airborne particles are drawn raised, over a shadow. */
  z: number;
  vz: number;
  size: number;
  readonly grow: number;
  readonly drag: number;
  /** Screen-down pull in px/s²; only fireworks use it. */
  readonly gravity: number;
  /** Pull towards the ground in px/s² for things with height. */
  readonly fall: number;
  /** Opacity at birth for puffs. */
  readonly alpha: number;
  /** Colours over the particle's life, first to last. */
  readonly colors: readonly string[];
  /** Bouncing chunks come to rest as rubble on the ground. */
  readonly settle: boolean;
}

export interface Puff {
  readonly dx: number;
  readonly dy: number;
  readonly radius: number;
  readonly delay: number;
}

export interface Explosion extends Timed {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly puffs: readonly Puff[];
}

export interface FloatingText extends Timed {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: string;
}

export interface MuzzleFlash extends Timed {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly size: number;
}

export interface Ring extends Timed {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  /** Shockwaves are thick, fading bands rather than a thin outline. */
  readonly shockwave: boolean;
}

/** A short-lived light that brightens the ground, or cuts through the dark at night. */
export interface Light extends Timed {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
}

/** A fallen crew member, left on the ground for a while. */
export interface Body extends Timed {
  readonly x: number;
  readonly y: number;
  readonly team: Team;
  readonly direction: Direction;
}

/** Marks painted permanently onto the ground. Tracks fade with time; everything else stays. */
export type Decal =
  | { readonly kind: 'scorch'; readonly x: number; readonly y: number; readonly radius: number }
  | { readonly kind: 'rubble'; readonly x: number; readonly y: number; readonly color: string; readonly size: number }
  | { readonly kind: 'casing'; readonly x: number; readonly y: number }
  | { readonly kind: 'track'; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly kind: 'footprint'; readonly x: number; readonly y: number };

export const FIRE = [PALETTE.white, PALETTE.goldLight, PALETTE.gold, PALETTE.orange, PALETTE.red, PALETTE.redDark];
const FLAME = [PALETTE.goldLight, PALETTE.gold, PALETTE.orange, PALETTE.red, '#7e1c18'];
const SMOKE = ['#8a8a8e', '#6a6a70', '#4a4a50', '#34343a'];
const DARK_SMOKE = ['#4a4442', '#34302e', '#262422', '#1c1a1a'];
const BRASS = ['#ffe07a', '#d8a838', '#a8701c'];
const DROPS = ['#ffffff', '#cfeaff', '#7ab6f2'];
const DEBRIS_FALL = 260;

type ParticleSpec = Partial<Omit<Particle, 'age' | 'active' | 'kind' | 'x' | 'y' | 'colors' | 'duration'>> &
  Pick<Particle, 'kind' | 'x' | 'y' | 'colors' | 'duration'>;

/** Short-lived visual feedback in field coordinates. Never affects gameplay. */
export class Effects {
  readonly particles: Particle[] = [];
  readonly explosions: Explosion[] = [];
  readonly texts: FloatingText[] = [];
  readonly flashes: MuzzleFlash[] = [];
  readonly rings: Ring[] = [];
  readonly lights: Light[] = [];
  readonly bodies: Body[] = [];
  shake = 0;
  /** Brief full-field flash from a big blast (0..1). */
  flash = 0;
  /** Seconds the action freezes for after a heavy hit, to sell the impact. */
  hitStop = 0;
  /** Drift for smoke, dust and leaves, px/s. Set per land. */
  wind: Vec = { x: 0, y: 0 };
  private readonly decals: Decal[] = [];

  update(dt: number): void {
    for (const p of this.particles) {
      p.age += dt;
      const damping = Math.exp(-p.drag * dt);
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * dt;
      if (p.kind === 'puff' || p.kind === 'leaf' || p.kind === 'flame') {
        p.x += this.wind.x * dt;
        p.y += this.wind.y * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
      if (p.fall > 0) this.applyHeight(p, dt);
    }
    for (const list of [this.particles, this.explosions, this.texts, this.flashes, this.rings, this.lights, this.bodies] as Timed[][]) {
      for (const item of list) {
        if (list !== this.particles) item.age += dt;
        if (item.age >= item.duration) item.active = false;
      }
      removeInactive(list);
    }
    this.shake = this.shake > 0.05 ? this.shake * Math.exp(-dt * 7) : 0;
    this.flash = this.flash > 0.02 ? this.flash * Math.exp(-dt * 14) : 0;
  }

  clear(): void {
    for (const list of [this.particles, this.explosions, this.texts, this.flashes, this.rings, this.lights, this.bodies]) list.length = 0;
    this.decals.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
  }

  /** Decals waiting to be painted onto the ground. */
  takeDecals(): Decal[] {
    return this.decals.splice(0);
  }

  explosion(x: number, y: number, scale = 1): void {
    const puffs: Puff[] = [{ dx: 0, dy: 0, radius: 8 * scale, delay: 0 }];
    const count = Math.round(6 * scale);
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(4, 10) * scale;
      puffs.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, radius: rand(4, 6.5) * scale, delay: rand(0.03, 0.22) * scale });
    }
    this.explosions.push({ x, y, scale, puffs, age: 0, duration: 1.05 * Math.sqrt(scale), active: true });
    this.shockwave(x, y, 20 * scale, 0.3);
    this.light(x, y, 34 * Math.sqrt(scale), PALETTE.orange, 0.45);
    this.sparks(x, y, FIRE, Math.round(18 * scale), 110 * Math.sqrt(scale));
    this.debris(x, y, ['#5a524a', '#433c37', '#2c2622'], Math.round(5 * scale), 1.2);
    this.smoke(x, y, Math.round(8 * scale), 4 * scale, true);
    this.scorch(x, y, 7 * scale);
    if (scale >= 1) this.flash = Math.min(1, this.flash + 0.25 * scale);
  }

  sparks(x: number, y: number, colors: readonly string[], count: number, speed = 70): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const v = rand(0.3, 1) * speed;
      this.add({ kind: 'spark', x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, drag: 5, colors, duration: rand(0.15, 0.4) });
    }
  }

  firework(x: number, y: number, colors: readonly string[]): void {
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2 + rand(-0.1, 0.1);
      const v = rand(45, 70);
      this.add({ kind: 'spark', x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, drag: 2.4, gravity: 22, colors, duration: rand(0.9, 1.4) });
    }
    this.ring(x, y, colors[1] ?? colors[0], 14, 0.45);
  }

  /** Chunks thrown into the air; they bounce and come to rest as rubble. */
  debris(x: number, y: number, colors: readonly string[], count: number, power = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const v = rand(8, 30) * power;
      this.add({
        kind: 'chunk',
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        z: rand(1, 4),
        vz: rand(30, 90) * power,
        fall: DEBRIS_FALL,
        size: rand(0.5, 1.5),
        drag: 1.2,
        colors: [colors[Math.floor(rand(0, colors.length))]],
        duration: 3,
        settle: true,
      });
    }
  }

  smoke(x: number, y: number, count = 1, spread = 2, dark = false): void {
    for (let i = 0; i < count; i++) {
      this.add({
        kind: 'puff',
        x: x + rand(-spread, spread),
        y: y + rand(-spread, spread),
        vx: rand(-6, 6),
        vy: rand(-14, -4),
        size: rand(1.5, 3),
        grow: 4,
        drag: 1.5,
        alpha: dark ? 0.85 : 0.7,
        colors: dark ? DARK_SMOKE : SMOKE,
        duration: rand(0.8, 1.6),
      });
    }
  }

  /** A wisp left behind by a shell in flight. */
  trail(x: number, y: number): void {
    this.add({ kind: 'puff', x, y, vx: rand(-2, 2), vy: rand(-2, 2), size: 0.6, grow: 2.2, drag: 2, alpha: 0.32, colors: SMOKE, duration: rand(0.35, 0.55) });
  }

  /** Low, slow clouds kicked up from the ground. */
  dust(x: number, y: number, color: string, count = 1, spread = 2): void {
    for (let i = 0; i < count; i++) {
      this.add({
        kind: 'puff',
        x: x + rand(-spread, spread),
        y: y + rand(-spread, spread),
        vx: rand(-8, 8),
        vy: rand(-8, 8),
        size: rand(1, 2),
        grow: 3,
        drag: 3,
        alpha: 0.45,
        colors: [color],
        duration: rand(0.5, 0.9),
      });
    }
  }

  fire(x: number, y: number, spread = 3): void {
    this.add({
      kind: 'flame',
      x: x + rand(-spread, spread),
      y: y + rand(-spread, spread),
      vx: rand(-3, 3),
      vy: rand(-16, -8),
      size: rand(1.2, 2.2),
      grow: -2,
      drag: 1,
      colors: FLAME,
      duration: rand(0.3, 0.6),
    });
  }

  leaves(x: number, y: number, colors: readonly string[], count = 2): void {
    for (let i = 0; i < count; i++) {
      this.add({
        kind: 'leaf',
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: rand(-14, 14),
        vy: rand(-14, 14),
        z: rand(2, 5),
        vz: rand(4, 14),
        fall: 30,
        drag: 2.5,
        colors: [colors[Math.floor(rand(0, colors.length))]],
        duration: rand(0.9, 1.6),
      });
    }
  }

  splash(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const v = rand(8, 30);
      this.add({ kind: 'drop', x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, z: 1, vz: rand(30, 60), fall: 220, drag: 1, colors: DROPS, duration: 1 });
    }
    this.ring(x, y, '#cfeaff', 6, 0.35);
  }

  /** Snow, slush or grit flung up by slipping tracks, thrown back along `direction`. */
  kickUp(x: number, y: number, colors: readonly string[], dx: number, dy: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      const v = rand(10, 34);
      this.add({
        kind: 'drop',
        x: x + rand(-1.5, 1.5),
        y: y + rand(-1.5, 1.5),
        vx: dx * v + rand(-8, 8),
        vy: dy * v + rand(-8, 8),
        z: 1,
        vz: rand(16, 40),
        fall: 200,
        drag: 2,
        colors: [colors[Math.floor(rand(0, colors.length))]],
        duration: 1,
      });
    }
  }

  /** A spent cartridge thrown out of the right side of the gun. */
  casing(x: number, y: number, direction: Direction): void {
    const v = DIRECTION_VECTORS[direction];
    const side = { x: -v.y, y: v.x };
    const speed = rand(18, 32);
    this.add({
      kind: 'casing',
      x,
      y,
      vx: side.x * speed - v.x * rand(0, 8),
      vy: side.y * speed - v.y * rand(0, 8),
      z: 3,
      vz: rand(25, 45),
      fall: DEBRIS_FALL,
      drag: 1.5,
      colors: BRASS,
      duration: 2,
      settle: true,
    });
  }

  muzzle(x: number, y: number, direction: Direction, size = 1): void {
    this.flashes.push({ x, y, direction, size, age: 0, duration: size >= 1 ? 0.08 : 0.04, active: true });
    this.light(x, y, size >= 1 ? 26 : 12, PALETTE.goldLight, size >= 1 ? 0.12 : 0.05);
    if (size >= 1) {
      const v = DIRECTION_VECTORS[direction];
      for (let i = 0; i < 3; i++) {
        this.add({
          kind: 'puff',
          x: x + v.x * 2,
          y: y + v.y * 2,
          vx: v.x * rand(10, 26) + rand(-6, 6),
          vy: v.y * rand(10, 26) + rand(-6, 6),
          size: rand(1, 2),
          grow: 5,
          drag: 4,
          alpha: 0.55,
          colors: SMOKE,
          duration: rand(0.4, 0.7),
        });
      }
    }
  }

  ring(x: number, y: number, color: string, radius = 12, duration = 0.4): void {
    this.rings.push({ x, y, color, radius, shockwave: false, age: 0, duration, active: true });
  }

  shockwave(x: number, y: number, radius: number, duration: number): void {
    this.rings.push({ x, y, color: '#fff4d8', radius, shockwave: true, age: 0, duration, active: true });
  }

  light(x: number, y: number, radius: number, color: string, duration: number): void {
    this.lights.push({ x, y, radius, color, age: 0, duration, active: true });
  }

  text(x: number, y: number, text: string, color: string = PALETTE.white): void {
    this.texts.push({ x, y, text, color, age: 0, duration: 0.9, active: true });
  }

  fallen(x: number, y: number, team: Team, direction: Direction): void {
    this.bodies.push({ x, y, team, direction, age: 0, duration: 9, active: true });
  }

  /** A permanent scorch mark on the ground. */
  scorch(x: number, y: number, radius: number): void {
    this.decals.push({ kind: 'scorch', x, y, radius });
  }

  track(x: number, y: number, w: number, h: number): void {
    this.decals.push({ kind: 'track', x, y, w, h });
  }

  footprint(x: number, y: number): void {
    this.decals.push({ kind: 'footprint', x, y });
  }

  addShake(amount: number): void {
    this.shake = Math.min(6, this.shake + amount);
  }

  freeze(seconds: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  private applyHeight(p: Particle, dt: number): void {
    p.vz -= p.fall * dt;
    p.z += p.vz * dt;
    if (p.z > 0) return;
    p.z = 0;
    if (p.kind === 'leaf') {
      p.vz = 0;
      p.vx *= 0.2;
      p.vy *= 0.2;
      return;
    }
    if (p.kind === 'drop') {
      p.active = false;
      p.age = p.duration;
      return;
    }
    if (p.vz < -18) {
      p.vz *= -0.35;
      p.vx *= 0.55;
      p.vy *= 0.55;
      return;
    }
    // Come to rest.
    p.age = p.duration;
    if (!p.settle) return;
    if (p.kind === 'casing') this.decals.push({ kind: 'casing', x: p.x, y: p.y });
    else this.decals.push({ kind: 'rubble', x: p.x, y: p.y, color: p.colors[0], size: p.size });
  }

  private add(spec: ParticleSpec): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      size: 1,
      grow: 0,
      drag: 0,
      gravity: 0,
      fall: 0,
      alpha: 1,
      settle: false,
      ...spec,
      age: 0,
      active: true,
    });
  }
}
