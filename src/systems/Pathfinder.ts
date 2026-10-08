import { DIRECTION_VECTORS, type Direction, type Rect } from '../core/geometry';
import type { Vehicle } from '../entities/Unit';
import { TILE_SIZE } from '../game/GameConfig';
import { surfaceCost, surfaceProperties } from '../world/Surface';
import { Tile, type Mobility } from '../world/Tile';
import type { TileMap, TilePoint } from '../world/TileMap';
import { stoppingDistance } from './MovementSystem';

export interface PathRequest {
  /** Tile position of the unit's top-left corner. */
  readonly start: TilePoint;
  /** Footprint edge in tiles: 1 for a soldier, 2 for a tank. */
  readonly size: number;
  readonly mobility: Mobility;
  /** Extra cost of routing through brick (which must be shot away), in units of an ordinary tile; Infinity treats brick as solid. */
  readonly brickCost: number;
  readonly isGoal: (col: number, row: number) => boolean;
  /** Stationary bodies to route around, such as wrecks and parked tanks. */
  readonly obstacles?: readonly Rect[];
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Route cost of one ordinary tile; see Surface for how other ground compares. */
const BASE_COST = 2;

/**
 * Cheapest route on the tile grid (Dial's algorithm: costs are small integers). Slippery or slow
 * ground costs more, so drivers keep to roads on snow.
 * Returns the positions after the start, ending at the first goal reached, or null if none is reachable.
 */
export function findPath(map: TileMap, request: PathRequest): TilePoint[] | null {
  const { cols, rows } = map;
  const { size, start } = request;
  const total = cols * rows;
  const best = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(total).fill(-1);
  const buckets: number[][] = [];
  const key = (col: number, row: number) => row * cols + col;
  const occupied = new Set<number>();
  for (const body of request.obstacles ?? []) {
    const range = map.rangeForRect(body);
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) occupied.add(key(c, r));
  }

  const cost = (col: number, row: number): number => {
    if (col < 0 || row < 0 || col + size > cols || row + size > rows) return Number.POSITIVE_INFINITY;
    let result = 1;
    for (let r = row; r < row + size; r++) {
      for (let c = col; c < col + size; c++) {
        if (occupied.has(key(c, r))) return Number.POSITIVE_INFINITY;
        if (!map.blocksMovement(c, r, request.mobility)) {
          result = Math.max(result, surfaceCost(map.surfaceAt(c, r), request.mobility));
          continue;
        }
        if (map.get(c, r) !== Tile.Brick) return Number.POSITIVE_INFINITY;
        result = Math.max(result, BASE_COST * (1 + request.brickCost));
      }
    }
    return result;
  };

  const startKey = key(start.col, start.row);
  best[startKey] = 0;
  buckets[0] = [startKey];
  for (let distance = 0; distance < buckets.length; distance++) {
    const bucket = buckets[distance];
    if (!bucket) continue;
    for (const node of bucket) {
      if (best[node] !== distance) continue;
      const col = node % cols;
      const row = Math.floor(node / cols);
      if (request.isGoal(col, row)) return reconstruct(previous, node, startKey, cols);
      for (const [dc, dr] of STEPS) {
        const nc = col + dc;
        const nr = row + dr;
        const step = cost(nc, nr);
        if (!Number.isFinite(step)) continue;
        const next = key(nc, nr);
        const through = distance + step;
        if (through >= best[next]) continue;
        best[next] = through;
        previous[next] = node;
        (buckets[through] ??= []).push(next);
      }
    }
  }
  return null;
}

/** Every tile position reachable from `start` without breaking walls, with its step distance. */
export function reachableTiles(map: TileMap, start: TilePoint, size: number, mobility: Mobility): Map<number, number> {
  const { cols, rows } = map;
  const open = (col: number, row: number) => {
    if (col < 0 || row < 0 || col + size > cols || row + size > rows) return false;
    for (let r = row; r < row + size; r++) {
      for (let c = col; c < col + size; c++) if (map.blocksMovement(c, r, mobility)) return false;
    }
    return true;
  };
  const steps = new Map<number, number>([[start.row * cols + start.col, 0]]);
  const queue: TilePoint[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const { col, row } = queue[i];
    const distance = steps.get(row * cols + col) ?? 0;
    for (const [dc, dr] of STEPS) {
      const nc = col + dc;
      const nr = row + dr;
      const k = nr * cols + nc;
      if (steps.has(k) || !open(nc, nr)) continue;
      steps.set(k, distance + 1);
      queue.push({ col: nc, row: nr });
    }
  }
  return steps;
}

function reconstruct(previous: Int32Array, goal: number, start: number, cols: number): TilePoint[] {
  const path: TilePoint[] = [];
  for (let node = goal; node !== start; node = previous[node]) {
    path.push({ col: node % cols, row: Math.floor(node / cols) });
  }
  return path.reverse();
}

/** The tile a unit's top-left corner is nearest to. */
export function tileOf(unit: Rect): TilePoint {
  return { col: Math.round(unit.x / TILE_SIZE), row: Math.round(unit.y / TILE_SIZE) };
}

/**
 * Steers a unit along a path: drops waypoints already reached and returns the direction towards
 * the next one, or null when the path is finished.
 */
export function steer(unit: Rect, path: TilePoint[]): Direction | null {
  while (path.length > 0) {
    const next = path[0];
    const dx = next.col * TILE_SIZE - unit.x;
    const dy = next.row * TILE_SIZE - unit.y;
    if (Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75) {
      path.shift();
      continue;
    }
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }
  return null;
}

/**
 * Steering for vehicles with momentum: the direction to the next waypoint, and whether to keep
 * the throttle open. A driver lets off in time to stop at the end of each straight run, so the
 * hull is slow when it turns instead of skidding wide (which matters a great deal on snow).
 */
export function steerVehicle(unit: Vehicle, path: TilePoint[], map: TileMap): { direction: Direction; move: boolean } | null {
  const direction = steer(unit, path);
  if (!direction) return null;
  const v = DIRECTION_VECTORS[direction];
  let end = path[0];
  for (let i = 1; i < path.length; i++) {
    if (path[i].col - path[i - 1].col !== v.x || path[i].row - path[i - 1].row !== v.y) break;
    end = path[i];
  }
  const remaining = (end.col * TILE_SIZE - unit.x) * v.x + (end.row * TILE_SIZE - unit.y) * v.y;
  const speed = unit.velocity.x * v.x + unit.velocity.y * v.y;
  const grip = surfaceProperties(map.surfaceUnder(unit)).grip;
  const stop = speed > 0 ? stoppingDistance(speed, unit.driveTrain.braking, grip) : 0;
  return { direction, move: remaining > stop + 0.5 };
}
