import type { EnemyKind } from '../../game/GameConfig';
import { hash, mix, PixelArt, shade } from './PixelArt';

export type TankDesign = 'player' | EnemyKind;

export interface HullColors {
  readonly light: string;
  readonly base: string;
  readonly dark: string;
  readonly darker: string;
}

export const TANK_COLORS: Readonly<Record<TankDesign | 'wreck', HullColors>> = {
  player: { light: '#86d060', base: '#4f9a3a', dark: '#2f6826', darker: '#1d4418' },
  basic: { light: '#86aee8', base: '#4a74b8', dark: '#2e4c80', darker: '#1c3058' },
  fast: { light: '#ffb070', base: '#e07a30', dark: '#a8521c', darker: '#6e3010' },
  heavy: { light: '#c25c4c', base: '#8a2e2a', dark: '#5c1a18', darker: '#3a0e0e' },
  wreck: { light: '#6a625a', base: '#433c37', dark: '#2c2622', darker: '#1a1614' },
};

const INK = '#14140c';
const TREAD = { edge: '#5c5c58', plate: '#3a3a37', plateLight: '#4e4e4a', gap: '#1a1a18' };

interface TankShape {
  readonly treadX: number;
  readonly treadW: number;
  readonly treadY: [number, number];
  readonly hull: [number, number, number, number];
  readonly turretR: number;
  readonly turretY: number;
  readonly square: boolean;
  readonly barrels: readonly number[];
  readonly barrelW: number;
  readonly tipY: number;
  readonly muzzleBrake: boolean;
  readonly pointed: boolean;
}

const SHAPES: Readonly<Record<TankDesign, TankShape>> = {
  player: { treadX: 3, treadW: 7, treadY: [3, 30], hull: [8, 5, 24, 29], turretR: 7, turretY: 18, square: false, barrels: [16], barrelW: 4, tipY: 0, muzzleBrake: true, pointed: false },
  basic: { treadX: 3, treadW: 7, treadY: [4, 30], hull: [8, 6, 24, 29], turretR: 6.5, turretY: 18, square: true, barrels: [16], barrelW: 4, tipY: 2, muzzleBrake: false, pointed: false },
  fast: { treadX: 5, treadW: 6, treadY: [5, 30], hull: [10, 4, 22, 29], turretR: 5, turretY: 19, square: false, barrels: [16], barrelW: 2, tipY: 0, muzzleBrake: false, pointed: true },
  heavy: { treadX: 1, treadW: 8, treadY: [2, 31], hull: [8, 3, 24, 31], turretR: 8.5, turretY: 18, square: false, barrels: [13, 19], barrelW: 3, tipY: 1, muzzleBrake: true, pointed: false },
};

export interface TankPaintOptions {
  readonly colors: HullColors;
  /** Track animation phase, 0..3. */
  readonly phase: number;
  /** Scorch marks for a badly damaged hull. */
  readonly scorched: boolean;
}

/** Paints a 32x32 tank facing up, lit from the top left. */
export function paintTank(design: TankDesign, options: TankPaintOptions): PixelArt {
  const art = new PixelArt(32, 32);
  const shape = SHAPES[design];
  const c = options.colors;

  // Tracks.
  for (const tx of [shape.treadX, 32 - shape.treadX - shape.treadW]) {
    for (let y = shape.treadY[0]; y < shape.treadY[1]; y++) {
      for (let x = tx; x < tx + shape.treadW; x++) {
        const seg = (y + options.phase) % 4;
        let col = seg === 0 ? TREAD.plateLight : seg === 3 ? TREAD.gap : TREAD.plate;
        if (x === tx) col = seg === 3 ? TREAD.gap : TREAD.edge;
        if (x === tx + shape.treadW - 1) col = TREAD.gap;
        if (y === shape.treadY[0] || y === shape.treadY[1] - 1) col = TREAD.gap;
        art.set(x, y, col);
      }
      if ((y + 2) % 6 === 0) art.rect(tx + Math.floor(shape.treadW / 2) - 1, y, 2, 2, '#262624');
    }
  }

  // Hull.
  const [x0, y0, x1, y1] = shape.hull;
  for (let y = y0; y < y1; y++) {
    const inset = shape.pointed && y < y0 + 4 ? y0 + 4 - y : 0;
    for (let x = x0 + inset; x < x1 - inset; x++) {
      let col = c.base;
      if (y < y0 + 2 || x === x0 + inset) col = c.light;
      if (x === x1 - inset - 1) col = c.dark;
      if (y >= y1 - 2) col = c.dark;
      if (y >= y0 + 2 && y < y0 + 5 && x > x0 + inset && x < x1 - inset - 1) col = mix(c.base, c.light, 0.45);
      const deck = y >= y1 - 8 && y < y1 - 3 && x > x0 + 2 && x < x1 - 3;
      if (deck && x % 2 === 0) col = c.darker;
      art.set(x, y, col);
    }
  }
  for (const [rx, ry] of [[x0 + 2, y0 + 9], [x1 - 3, y0 + 9], [x0 + 2, y1 - 10], [x1 - 3, y1 - 10]] as const) art.set(rx, ry, c.darker);
  if (design === 'heavy') {
    art.rect(x0 - 1, y0 + 6, 1, y1 - y0 - 10, c.light);
    art.rect(x1, y0 + 6, 1, y1 - y0 - 10, c.dark);
  }

  // Turret.
  const cx = 16;
  const cy = shape.turretY;
  const r = shape.turretR;
  const turret = mix(c.base, c.light, 0.15);
  if (shape.square) {
    art.rect(Math.round(cx - r), Math.round(cy - r), Math.round(r * 2), Math.round(r * 2), c.darker);
    art.rect(Math.round(cx - r) + 1, Math.round(cy - r) + 1, Math.round(r * 2) - 2, Math.round(r * 2) - 2, turret);
  } else {
    art.disc(cx, cy, r, c.darker);
    art.disc(cx, cy, r - 1, turret);
  }
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const inside = shape.square ? Math.abs(dx) < r - 1 && Math.abs(dy) < r - 1 : Math.hypot(dx, dy) < r - 1;
      if (!inside) continue;
      const s = (dx + dy) / r;
      if (s < -0.55) art.set(x, y, c.light);
      else if (s > 0.6) art.set(x, y, c.dark);
    }
  }
  art.disc(cx + 2.5, cy + 2.5, 2, c.darker);
  art.disc(cx + 2.5, cy + 2.5, 1.2, c.dark);
  art.set(cx + 2, cy + 2, c.light);
  for (let i = 0; i < 4; i++) art.set(cx - 4 - i, cy + 3 + i, c.darker);

  // Barrels.
  for (const bx of shape.barrels) {
    const left = Math.round(bx - shape.barrelW / 2);
    for (let y = shape.tipY; y < cy - 2; y++) {
      for (let x = left; x < left + shape.barrelW; x++) {
        const col = x === left ? c.light : x === left + shape.barrelW - 1 ? c.darker : c.base;
        art.set(x, y, col);
      }
    }
    if (shape.muzzleBrake) {
      art.rect(left - 1, shape.tipY, shape.barrelW + 2, 3, c.darker);
      art.rect(left, shape.tipY + 1, shape.barrelW, 1, c.dark);
    }
    art.rect(left + Math.floor(shape.barrelW / 2) - (shape.barrelW > 2 ? 1 : 0), shape.tipY, shape.barrelW > 2 ? 2 : 1, 1, '#0a0a0a');
  }

  // Markings.
  if (design === 'player') {
    art.polygon([[16, y1 - 7], [18.5, y1 - 4.5], [16, y1 - 2], [13.5, y1 - 4.5]], '#f0b432');
    art.set(15, y1 - 6, '#ffe07a');
  } else if (design === 'basic') {
    art.rect(x0 + 2, y1 - 3, x1 - x0 - 4, 1, '#e8ecf0');
  } else if (design === 'fast') {
    for (let i = 0; i < 3; i++) {
      art.set(13 + i, y0 + 7 + i, '#ffe07a');
      art.set(18 - i, y0 + 7 + i, '#ffe07a');
    }
  }

  if (options.scorched) {
    for (let i = 0; i < 6; i++) {
      art.disc(9 + hash(i, 1, 3) * 14, 7 + hash(i, 2, 3) * 20, 1.5 + hash(i, 3, 3) * 1.5, '#1a1410', 150);
    }
  }
  art.outline(INK);
  return art;
}

export interface SoldierColors {
  readonly helmet: string;
  readonly band: string;
  readonly uniform: string;
}

export const SOLDIER_COLORS: Readonly<Record<'player' | 'enemy', SoldierColors>> = {
  player: { helmet: '#5a8a3a', band: '#f0b432', uniform: '#6f7f3c' },
  enemy: { helmet: '#a83a30', band: '#2a2a2a', uniform: '#5a606c' },
};

/**
 * A 16x16 crew member seen from above, facing up. Frame 0 stands; 1 and 2 are walking steps.
 * With `launcher` the crew carries an anti-tank rocket tube on the right shoulder.
 */
export function paintSoldier(colors: SoldierColors, frame: number, launcher = false): PixelArt {
  const art = new PixelArt(16, 16);
  const u = colors.uniform;
  const legs: Record<number, [number, number]> = { 0: [12, 12], 1: [13, 11], 2: [11, 13] };
  const [leftY, rightY] = legs[frame] ?? legs[0];
  art.rect(5, leftY, 2, 3, '#22241c');
  art.rect(9, rightY, 2, 3, '#22241c');
  art.rect(4, 6, 8, 7, u);
  art.rect(4, 6, 1, 7, shade(u, 0.25));
  art.rect(11, 6, 1, 7, shade(u, -0.3));
  art.rect(6, 9, 4, 4, shade(u, -0.35));
  art.rect(3, 8, 2, 3, u);
  art.rect(11, 7, 2, 3, u);
  if (launcher) {
    // An olive tube over the shoulder, the warhead poking out of the front.
    art.rect(11, 2, 3, 12, '#3a4a24');
    art.rect(11, 2, 1, 12, '#5a6c38');
    art.rect(13, 2, 1, 12, '#26301a');
    art.rect(11, 13, 3, 1, '#1a1e10');
    art.polygon([[12.5, -0.5], [14, 2.2], [11, 2.2]], '#8a2a1e');
    art.set(12, 1, '#c83a2a');
  } else {
    art.rect(12, 1, 1, 9, '#2a2a2a');
    art.set(12, 0, '#4a4a4a');
    art.rect(13, 4, 1, 3, '#5a4a30');
  }
  art.disc(8, 6, 3.6, shade(colors.helmet, -0.35));
  art.disc(8, 6, 2.9, colors.helmet);
  art.set(7, 4, shade(colors.helmet, 0.35));
  art.set(6, 5, shade(colors.helmet, 0.25));
  art.rect(5, 7, 6, 1, colors.band);
  art.outline(INK);
  return art;
}

/** Paints the same 16x16 soldier lying down, faded, for a short-lived fallen body. */
export function paintFallen(colors: SoldierColors): PixelArt {
  const art = new PixelArt(16, 16);
  art.rect(2, 7, 9, 4, shade(colors.uniform, -0.2));
  art.rect(10, 7, 3, 2, '#22241c');
  art.rect(10, 10, 3, 1, '#22241c');
  art.disc(3.5, 9, 3, shade(colors.helmet, -0.2));
  art.rect(4, 12, 7, 1, '#2a2a2a');
  art.outline(INK);
  return art;
}
