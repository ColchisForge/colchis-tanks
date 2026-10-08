import { EPSILON, isVertical, rectsOverlap, type Direction, type Rect, type Vec } from '../core/geometry';
import { SHELL_BLAST_HALF_WIDTH } from '../game/GameConfig';
import type { Team } from '../entities/Unit';
import { Tile, type Mobility } from '../world/Tile';
import type { TileMap, TilePoint } from '../world/TileMap';

export interface ShellTileHit {
  /** Destructible or indestructible tiles along the contact line within the blast strip. */
  readonly tiles: readonly TilePoint[];
  /** Whose base the shell itself touched, if any. */
  readonly base: Team | null;
  /** Where the shell struck, for effects. */
  readonly point: Vec;
}

/** Signed gap from `box` to `obstacle` in the direction of travel (negative if behind or overlapping). */
function gapAhead(box: Rect, obstacle: Rect, direction: Direction): number {
  switch (direction) {
    case 'up':
      return box.y - (obstacle.y + obstacle.h);
    case 'down':
      return obstacle.y - (box.y + box.h);
    case 'left':
      return box.x - (obstacle.x + obstacle.w);
    case 'right':
      return obstacle.x - (box.x + box.w);
  }
}

function overlapsAcross(box: Rect, obstacle: Rect, direction: Direction): boolean {
  if (isVertical(direction)) return box.x < obstacle.x + obstacle.w - EPSILON && box.x + box.w > obstacle.x + EPSILON;
  return box.y < obstacle.y + obstacle.h - EPSILON && box.y + box.h > obstacle.y + EPSILON;
}

function sweep(box: Rect, direction: Direction, distance: number): Rect {
  switch (direction) {
    case 'up':
      return { x: box.x, y: box.y - distance, w: box.w, h: box.h + distance };
    case 'down':
      return { x: box.x, y: box.y, w: box.w, h: box.h + distance };
    case 'left':
      return { x: box.x - distance, y: box.y, w: box.w + distance, h: box.h };
    case 'right':
      return { x: box.x, y: box.y, w: box.w + distance, h: box.h };
  }
}

/** Shared spatial queries for every moving thing on the map. Holds no entity state of its own. */
export class CollisionSystem {
  constructor(readonly map: TileMap) {}

  isOutOfBounds(rect: Rect): boolean {
    return rect.x < -EPSILON || rect.y < -EPSILON || rect.x + rect.w > this.map.width + EPSILON || rect.y + rect.h > this.map.height + EPSILON;
  }

  /**
   * How far `box` can travel (up to `distance`) before touching the map edge, a tile that blocks
   * `mobility`, or one of `bodies`. Bodies already overlapping the box are ignored so units that
   * end up intersecting can always separate instead of locking together.
   */
  travelDistance(box: Rect, direction: Direction, distance: number, mobility: Mobility, bodies: readonly Rect[]): number {
    let allowed = Math.min(distance, this.distanceToEdge(box, direction));
    if (allowed <= 0) return 0;

    const swept = sweep(box, direction, allowed);
    const range = this.map.rangeForRect(swept);
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) {
        if (!this.map.blocksMovement(col, row, mobility)) continue;
        allowed = this.limitBy(box, this.map.tileRect(col, row), direction, allowed);
      }
    }
    for (const body of bodies) {
      allowed = this.limitBy(box, body, direction, allowed);
    }
    return Math.max(0, allowed);
  }

  /** True if the rect is inside the map, clear of terrain that blocks `mobility`, and clear of every body. */
  fits(box: Rect, mobility: Mobility, bodies: readonly Rect[]): boolean {
    if (this.isOutOfBounds(box)) return false;
    const range = this.map.rangeForRect(box);
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) {
        if (this.map.blocksMovement(col, row, mobility)) return false;
      }
    }
    return !bodies.some((body) => rectsOverlap(box, body));
  }

  /**
   * Resolves a shell against the terrain. The contact line is the row (or column) of the first
   * tile the shell met; every shell-stopping tile on that line within a tank-wide strip is hit.
   */
  shellTileHit(shell: Rect, direction: Direction): ShellTileHit | null {
    const range = this.map.rangeForRect(shell);
    const touched: TilePoint[] = [];
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) {
        if (this.map.stopsShells(col, row)) touched.push({ col, row });
      }
    }
    if (touched.length === 0) return null;

    const vertical = isVertical(direction);
    const towardsOrigin = direction === 'up' || direction === 'left';
    const lines = touched.map((tile) => (vertical ? tile.row : tile.col));
    const contact = towardsOrigin ? Math.max(...lines) : Math.min(...lines);
    const onContact = touched.filter((tile) => (vertical ? tile.row : tile.col) === contact);
    const base = onContact.some((tile) => this.map.get(tile.col, tile.row) === Tile.Base)
      ? 'player'
      : onContact.some((tile) => this.map.get(tile.col, tile.row) === Tile.EnemyBase)
        ? 'enemy'
        : null;

    const s = this.map.tileSize;
    const centre = vertical ? shell.x + shell.w / 2 : shell.y + shell.h / 2;
    const from = Math.floor((centre - SHELL_BLAST_HALF_WIDTH) / s);
    const to = Math.floor((centre + SHELL_BLAST_HALF_WIDTH - EPSILON) / s);
    const tiles: TilePoint[] = [];
    for (let i = from; i <= to; i++) {
      const tile = vertical ? { col: i, row: contact } : { col: contact, row: i };
      const type = this.map.get(tile.col, tile.row);
      if (this.map.inBounds(tile.col, tile.row) && type !== Tile.Base && type !== Tile.EnemyBase && this.map.stopsShells(tile.col, tile.row)) {
        tiles.push(tile);
      }
    }

    const point = vertical
      ? { x: centre, y: (contact + (towardsOrigin ? 1 : 0)) * s }
      : { x: (contact + (towardsOrigin ? 1 : 0)) * s, y: centre };
    return { tiles, base, point };
  }

  /** True if a destructible tile sits directly in front of the box. */
  destructibleAhead(box: Rect, direction: Direction): boolean {
    const probe = sweep(box, direction, 1);
    const range = this.map.rangeForRect(probe);
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) {
        if (rectsOverlap(this.map.tileRect(col, row), box)) continue;
        if (this.map.get(col, row) === Tile.Brick) return true;
      }
    }
    return false;
  }

  /**
   * True if no steel lies between two points. Bricks don't count: shooting through them is the
   * point. With `blockedByBase`, the player's base also counts as a wall, for shots meant for
   * something else. The enemy's own HQ always does: its gunners never fire through it.
   */
  hasLineOfFire(from: Vec, to: Vec, blockedByBase = false): boolean {
    const s = this.map.tileSize;
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (s / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const col = Math.floor((from.x + (to.x - from.x) * t) / s);
      const row = Math.floor((from.y + (to.y - from.y) * t) / s);
      const type = this.map.get(col, row);
      if (type === Tile.Steel || type === Tile.EnemyBase || (blockedByBase && type === Tile.Base)) return false;
    }
    return true;
  }

  private distanceToEdge(box: Rect, direction: Direction): number {
    switch (direction) {
      case 'up':
        return box.y;
      case 'down':
        return this.map.height - (box.y + box.h);
      case 'left':
        return box.x;
      case 'right':
        return this.map.width - (box.x + box.w);
    }
  }

  private limitBy(box: Rect, obstacle: Rect, direction: Direction, allowed: number): number {
    if (!overlapsAcross(box, obstacle, direction)) return allowed;
    const gap = gapAhead(box, obstacle, direction);
    if (gap < -EPSILON) return allowed;
    return Math.min(allowed, gap);
  }
}
