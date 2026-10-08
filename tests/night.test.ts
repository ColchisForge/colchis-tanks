import { describe, expect, it } from 'vitest';
import { NIGHT_CONFIG } from '../src/game/GameConfig';
import { inBeamCone, Perception } from '../src/systems/Perception';
import { TileMap } from '../src/world/TileMap';

/** 20 tiles wide (160px), 14 tall (112px), with one wall block at columns 10-11 of row 4. */
const ROWS = [
  '....................',
  '....................',
  '....................',
  '....................',
  '..........##........',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
];

describe('night perception', () => {
  const map = TileMap.fromRows(ROWS);
  const night = new Perception(map, true);
  /** A tank in the top-left corner, its searchlight pointing right along the top rows. */
  const lookout = { x: 0, y: 0, w: 16, h: 16, direction: 'right' as const };

  it('only sees a soldier in the open when a light is on them', () => {
    const inBeam = { x: 80, y: 4, w: 8, h: 8 };
    const inDark = { x: 40, y: 48, w: 8, h: 8 };
    expect(night.canSeeSoldier(lookout, inBeam)).toBe(true);
    expect(night.canSeeSoldier(lookout, inDark)).toBe(false);
    expect(new Perception(map, false).canSeeSoldier(lookout, inDark)).toBe(true);
  });

  it('still notices a soldier right next to it in the dark', () => {
    expect(night.canSeeSoldier(lookout, { x: 18, y: 18, w: 8, h: 8 })).toBe(true);
  });

  it('sees whoever stands by a burning wreck', () => {
    const soldier = { x: 40, y: 48, w: 8, h: 8 };
    night.update([{ x: 40, y: 40, w: 16, h: 16 }]);
    expect(night.canSeeSoldier(lookout, soldier)).toBe(true);
    night.update([]);
    expect(night.canSeeSoldier(lookout, soldier)).toBe(false);
  });

  it('cannot see past a wall even inside the beam', () => {
    const behindWall = { x: 120, y: 32, w: 8, h: 8 };
    const looking = { x: 40, y: 28, w: 16, h: 16, direction: 'right' as const };
    expect(inBeamCone({ x: 48, y: 36 }, 'right', { x: 124, y: 36 })).toBe(true);
    expect(night.canSeeSoldier(looking, behindWall)).toBe(false);
  });

  it('notices a dark tank only up close, in its beam, or when it fires', () => {
    const range = 100;
    const close = { x: 0, y: 40, w: 16, h: 16, cannon: { sinceLastShot: Infinity } };
    const distant = { ...close, y: 88 };
    const lookingDown = { ...lookout, direction: 'down' as const };
    const sideways = { ...lookout, direction: 'left' as const };
    expect(40 <= range * NIGHT_CONFIG.tankNoticeScale).toBe(true);
    expect(night.canSpotTank(sideways, close, range)).toBe(true);
    expect(night.canSpotTank(sideways, distant, range)).toBe(false);
    expect(night.canSpotTank(lookingDown, distant, range)).toBe(true);
    expect(night.canSpotTank(sideways, { ...distant, cannon: { sinceLastShot: 0.2 } }, range)).toBe(true);
    expect(new Perception(map, false).canSpotTank(sideways, distant, range)).toBe(true);
  });
});
