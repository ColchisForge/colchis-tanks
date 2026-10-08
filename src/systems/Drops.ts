import { rectsOverlap, type Rect } from '../core/geometry';
import type { Random } from '../core/Random';
import { SOLDIER_SIZE, TILE_SIZE } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';
import { reachableTiles } from './Pathfinder';

/**
 * Picks a tile for something dropped onto the battlefield (a wrench, a crate): one a soldier can
 * walk to from `origin`, outside the `avoid` areas, ideally between `min` and `max` px away.
 */
export function dropSpot(map: TileMap, rng: Random, origin: Rect, min: number, max: number, avoid: readonly Rect[] = []): Rect | null {
  const cx = origin.x + origin.w / 2;
  const cy = origin.y + origin.h / 2;
  const start = { col: Math.floor(cx / TILE_SIZE), row: Math.floor(cy / TILE_SIZE) };
  const reachable = reachableTiles(map, start, 1, 'foot');
  const near: Rect[] = [];
  const fair: Rect[] = [];
  for (const key of reachable.keys()) {
    const col = key % map.cols;
    const row = Math.floor(key / map.cols);
    const spot = { x: col * TILE_SIZE, y: row * TILE_SIZE, w: SOLDIER_SIZE, h: SOLDIER_SIZE };
    if (avoid.some((area) => rectsOverlap(area, spot))) continue;
    const distance = Math.hypot(spot.x + SOLDIER_SIZE / 2 - cx, spot.y + SOLDIER_SIZE / 2 - cy);
    if (distance > max) continue;
    (distance >= min ? fair : near).push(spot);
  }
  const pool = fair.length > 0 ? fair : near;
  return pool.length > 0 ? rng.pick(pool) : null;
}
