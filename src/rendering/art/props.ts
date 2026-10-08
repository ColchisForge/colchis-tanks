import type { PowerUpKind } from '../../entities/PowerUp';
import { hash, PixelArt, shade } from './PixelArt';

const INK = '#14140c';
const GOLD = { light: '#ffe07a', base: '#f0b432', dark: '#a8701c', darker: '#6e4410' };
const STONE = { light: '#d8d0bc', base: '#b4aa92', dark: '#8a8070', darker: '#5e574a' };

/** The base: a stone bunker bearing the golden fleece. 32x32, roof seen from above, front face below. */
export function paintBase(ruined: boolean): PixelArt {
  const art = new PixelArt(32, 32);
  if (ruined) {
    for (let i = 0; i < 26; i++) {
      const x = 4 + hash(i, 1, 71) * 24;
      const y = 10 + hash(i, 2, 71) * 18;
      const r = 1.5 + hash(i, 3, 71) * 2.5;
      const tone = [STONE.light, STONE.base, STONE.dark, '#3a342c'][Math.floor(hash(i, 4, 71) * 4)];
      art.disc(x, y, r, tone);
    }
    art.disc(12, 18, 2.5, GOLD.dark);
    art.disc(20, 22, 1.8, GOLD.base);
    art.outline(INK);
    return art;
  }

  // Roof slab with block joints.
  for (let y = 2; y < 22; y++) {
    for (let x = 1; x < 31; x++) {
      let c = STONE.base;
      if ((y - 2) % 7 === 6 || (x + (Math.floor((y - 2) / 7) % 2) * 5) % 10 === 0) c = STONE.dark;
      if (y === 2 || x === 1) c = STONE.light;
      if (x === 30) c = STONE.darker;
      art.set(x, y, c);
    }
  }
  // Front face with a gilded door.
  for (let y = 22; y < 31; y++) {
    for (let x = 1; x < 31; x++) {
      let c = y === 22 ? STONE.darker : (x + (y > 26 ? 4 : 0)) % 8 === 0 || y === 26 ? STONE.darker : STONE.dark;
      if (y === 30) c = '#3e3830';
      art.set(x, y, c);
    }
  }
  art.rect(12, 24, 8, 7, GOLD.dark);
  art.rect(13, 25, 6, 6, '#1a1612');
  art.rect(14, 24, 4, 1, GOLD.base);

  // The fleece medallion: a gold disc with curls of wool.
  art.disc(16, 12, 7, GOLD.darker);
  art.disc(16, 12, 6, GOLD.base);
  for (const [x, y] of [[13, 10], [17, 9], [19, 12], [16, 14], [12.5, 13.5]] as const) {
    art.disc(x, y, 1.8, GOLD.dark);
    art.disc(x - 0.4, y - 0.4, 1, GOLD.light);
  }
  art.set(12, 8, '#ffffff');
  // Corner pennants.
  for (const px of [3, 28]) {
    art.rect(px, 0, 1, 5, '#2a2a2a');
    art.polygon([[px + (px < 16 ? 1 : 0), 0], [px + (px < 16 ? 5 : -4), 1.5], [px + (px < 16 ? 1 : 0), 3]], '#d83a2e');
  }
  art.outline(INK);
  return art;
}

const SLATE = { light: '#aab6c8', base: '#7c889c', dark: '#56606e', darker: '#3a414c' };
const BRONZE = { light: '#f0c890', base: '#c08a4a', dark: '#8a5a2a', darker: '#5a3818' };

/**
 * The enemy HQ: a slate-grey command bunker bearing the invaders' crested bronze helmet, with
 * blue pennants. 32x32 like the player's base, roof from above and front face below.
 */
export function paintEnemyBase(ruined: boolean): PixelArt {
  const art = new PixelArt(32, 32);
  if (ruined) {
    for (let i = 0; i < 28; i++) {
      const x = 4 + hash(i, 1, 83) * 24;
      const y = 8 + hash(i, 2, 83) * 20;
      const r = 1.5 + hash(i, 3, 83) * 2.5;
      const tone = [SLATE.light, SLATE.base, SLATE.dark, '#2a2e36'][Math.floor(hash(i, 4, 83) * 4)];
      art.disc(x, y, r, tone);
    }
    art.disc(14, 16, 2.4, BRONZE.dark);
    art.disc(20, 21, 1.6, BRONZE.base);
    art.outline(INK);
    return art;
  }
  // Roof slab of big dressed stones.
  for (let y = 2; y < 22; y++) {
    for (let x = 1; x < 31; x++) {
      let c = SLATE.base;
      if ((y - 2) % 6 === 5 || (x + (Math.floor((y - 2) / 6) % 2) * 6) % 12 === 0) c = SLATE.dark;
      if (y === 2 || x === 1) c = SLATE.light;
      if (x === 30) c = SLATE.darker;
      art.set(x, y, c);
    }
  }
  // Front face with an armoured slit and a heavy door.
  for (let y = 22; y < 31; y++) {
    for (let x = 1; x < 31; x++) {
      let c = y === 22 ? SLATE.darker : (x + (y > 26 ? 3 : 0)) % 6 === 0 || y === 26 ? SLATE.darker : SLATE.dark;
      if (y === 30) c = '#262a32';
      art.set(x, y, c);
    }
  }
  art.rect(4, 24, 8, 2, '#14161c');
  art.rect(20, 24, 8, 2, '#14161c');
  art.rect(13, 24, 6, 7, SLATE.darker);
  art.rect(14, 25, 4, 6, '#1a1c22');
  art.rect(15, 27, 2, 1, BRONZE.base);

  // The crested helmet emblem on a dark shield.
  art.disc(16, 12, 7.5, '#22303e');
  art.disc(16, 12, 6.5, '#2e4a6e');
  // Crest.
  art.polygon([[10, 9], [16, 4], [22, 9], [20, 9.5], [16, 6.5], [12, 9.5]], '#c83a2a');
  art.polygon([[12, 9.3], [16, 6.3], [20, 9.3]], '#e85a40');
  // Helmet bowl and cheek guards, with the eye slit.
  art.disc(16, 12.5, 4.2, BRONZE.darker);
  art.disc(16, 12.2, 3.6, BRONZE.base);
  art.disc(15, 11.4, 1.6, BRONZE.light);
  art.rect(13, 13, 6, 1, BRONZE.darker);
  art.rect(15.5, 13, 1, 3.5, BRONZE.darker);
  art.rect(12.5, 14, 2, 3, BRONZE.dark);
  art.rect(17.5, 14, 2, 3, BRONZE.dark);
  // Corner pennants.
  for (const px of [3, 28]) {
    art.rect(px, 0, 1, 5, '#2a2a2a');
    art.polygon([[px + (px < 16 ? 1 : 0), 0], [px + (px < 16 ? 5 : -4), 1.5], [px + (px < 16 ? 1 : 0), 3]], '#3a7ad8');
  }
  art.outline(INK);
  return art;
}

const KIND_COLORS: Readonly<Record<PowerUpKind, { ring: string; glow: string }>> = {
  rapidFire: { ring: '#f0b432', glow: '#4a3a10' },
  shield: { ring: '#58c0f0', glow: '#103a4a' },
  extraLife: { ring: '#f05a5a', glow: '#4a1414' },
};

/** Paints a power-up icon into an art buffer, scaled so the 20px design fits `size`. */
function paintIcon(art: PixelArt, kind: PowerUpKind, ox: number, oy: number, size: number): void {
  const k = size / 20;
  const p = (x: number, y: number): [number, number] => [ox + x * k, oy + y * k];
  switch (kind) {
    case 'rapidFire':
      art.polygon([p(12, 0), p(3, 11), p(9, 11), p(6, 20), p(17, 7), p(11, 7), p(14, 0)], GOLD.darker);
      art.polygon([p(12, 1), p(4.5, 10.2), p(10.5, 10.2), p(7.6, 18), p(15.5, 7.8), p(9.7, 7.8), p(13, 1)], GOLD.base);
      art.polygon([p(12, 1), p(5, 9.5), p(8, 9.5), p(12.3, 3)], GOLD.light);
      return;
    case 'shield':
      art.polygon([p(10, 0), p(19, 3), p(19, 10), p(10, 20), p(1, 10), p(1, 3)], '#163a6e');
      art.polygon([p(10, 1.4), p(17.6, 4), p(17.6, 10), p(10, 18.2), p(2.4, 10), p(2.4, 4)], '#3a8ae0');
      art.polygon([p(10, 1.4), p(10, 18.2), p(2.4, 10), p(2.4, 4)], '#7ac0ff');
      art.polygon([p(4, 5), p(8, 3.6), p(8, 5.6), p(4, 7)], '#ffffff');
      return;
    case 'extraLife':
      art.disc(ox + 6 * k, oy + 7 * k, 5.2 * k, '#6a1414');
      art.disc(ox + 14 * k, oy + 7 * k, 5.2 * k, '#6a1414');
      art.polygon([p(1, 9), p(19, 9), p(10, 19.5)], '#6a1414');
      art.disc(ox + 6 * k, oy + 7 * k, 4.2 * k, '#e04040');
      art.disc(ox + 14 * k, oy + 7 * k, 4.2 * k, '#e04040');
      art.polygon([p(2.2, 9), p(17.8, 9), p(10, 18)], '#e04040');
      art.disc(ox + 5 * k, oy + 5.5 * k, 1.6 * k, '#ff9a8a');
      return;
  }
}

/** A 32x32 power-up crate: dark bevelled tile, coloured rim, icon. */
export function paintPowerUp(kind: PowerUpKind): PixelArt {
  const art = new PixelArt(32, 32);
  const tone = KIND_COLORS[kind];
  for (let y = 2; y < 30; y++) {
    for (let x = 2; x < 30; x++) {
      const corner = (x < 4 || x > 27) && (y < 4 || y > 27);
      if (corner && (x === 2 || x === 29) && (y === 2 || y === 29)) continue;
      let c = '#20222e';
      if (x === 2 || y === 2) c = '#4a4e66';
      if (x === 29 || y === 29) c = '#0c0c14';
      if ((x === 4 || x === 27) && y >= 4 && y <= 27) c = tone.ring;
      if ((y === 4 || y === 27) && x >= 4 && x <= 27) c = tone.ring;
      if (x > 4 && x < 27 && y > 4 && y < 27) c = tone.glow;
      art.set(x, y, c);
    }
  }
  paintIcon(art, kind, 6, 6, 20);
  art.outline(INK);
  return art;
}

/** A bare 16x16 icon for the HUD. */
export function paintSmallIcon(kind: PowerUpKind): PixelArt {
  const art = new PixelArt(16, 16);
  paintIcon(art, kind, 1, 1, 14);
  art.outline(INK);
  return art;
}

const CRATE = { light: '#9a8a5a', base: '#7a6a40', dark: '#54482a', band: '#3a3220' };

/** A 16x16 wooden supply crate seen from above, with a stencilled emblem drawn by `emblem`. */
function paintCrate(emblem: (art: PixelArt) => void): PixelArt {
  const art = new PixelArt(16, 16);
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      let c = (x + (y > 7 ? 2 : 0)) % 4 === 0 ? CRATE.dark : CRATE.base;
      if (y === 1 || x === 1) c = CRATE.light;
      if (y === 14 || x === 14) c = CRATE.band;
      if (y === 4 || y === 11) c = CRATE.band;
      art.set(x, y, c);
    }
  }
  emblem(art);
  art.outline(INK);
  return art;
}

/** Rocket crate: a red warhead emblem on olive wood. */
export function paintRocketCrate(): PixelArt {
  return paintCrate((art) => {
    art.rect(5, 5, 6, 6, '#2e3a1e');
    art.polygon([[8, 4.5], [10.5, 7], [10.5, 11], [5.5, 11], [5.5, 7]], '#c83a2a');
    art.rect(6, 7, 1, 3, '#ff7a5a');
    art.rect(5, 10, 6, 1, '#f0b432');
  });
}

/** Mine crate: a round anti-tank mine stencilled in yellow. */
export function paintMineCrate(): PixelArt {
  return paintCrate((art) => {
    art.disc(8, 8, 3.2, '#f0b432');
    art.disc(8, 8, 2.2, '#3a3220');
    art.disc(8, 8, 1, '#f0b432');
  });
}

/**
 * A planted anti-tank mine (16x16 art, one tile): a flat olive disc with a pressure plate, half
 * dug in. `lamp` is the arming light, or null when it is off.
 */
export function paintMine(lamp: string | null): PixelArt {
  const art = new PixelArt(16, 16);
  art.disc(8.5, 9, 6, '#3a3424', 140);
  art.disc(8, 8, 5.5, '#2e3a1e');
  art.disc(8, 8, 4.5, '#4a5a2e');
  art.disc(7.4, 7.4, 3.6, '#5a6c38');
  art.disc(8, 8, 2.2, '#3a4826');
  art.disc(7.6, 7.6, 1.6, '#6e7e48');
  for (const [x, y] of [[8, 3], [13, 8], [8, 13], [3, 8]] as const) art.set(x, y, '#2a3018');
  if (lamp) {
    art.set(11, 5, lamp);
    art.set(12, 5, shade(lamp, -0.3));
  }
  art.outline('#1a1e10');
  return art;
}

export function paintWrench(): PixelArt {
  const art = new PixelArt(16, 16);
  const steel = { light: '#eef2f6', base: '#b4bcc6', dark: '#6c7480' };
  for (let t = 0; t <= 9; t += 0.5) {
    const x = 3 + t * 0.8;
    const y = 13 - t * 0.8;
    art.disc(x, y, 1.6, steel.dark);
    art.disc(x - 0.3, y - 0.3, 1, steel.base);
  }
  art.disc(11.5, 4.5, 3.8, steel.dark);
  art.disc(11.2, 4.2, 3, steel.base);
  art.disc(10.8, 3.8, 1.2, steel.light);
  // Cut the open jaw of the spanner head.
  for (let y = 0; y < 5; y++) for (let x = 12; x < 16; x++) if (x - 12 > y - 1 && x + y > 13) art.data[(y * 16 + x) * 4 + 3] = 0;
  art.set(4, 11, steel.light);
  art.set(6, 9, steel.light);
  art.outline(INK);
  art.set(2, 2, '#ffe07a');
  art.set(1, 2, shade('#ffe07a', -0.3));
  return art;
}
