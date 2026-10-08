import { rectsOverlap, type Rect } from '../core/geometry';
import { SPAWN_CONFIG, TANK_SIZE, TILE_SIZE } from '../game/GameConfig';
import type { ParsedLevel, RosterEntry } from '../world/Level';
import type { TilePoint } from '../world/TileMap';

/** A reserved spawn point where the next enemy materialises after a short warning. */
export interface SpawnPortal {
  readonly x: number;
  readonly y: number;
  readonly entry: RosterEntry;
  remaining: number;
}

export interface SpawnOrder {
  readonly x: number;
  readonly y: number;
  readonly entry: RosterEntry;
}

/** Feeds the level roster onto the field, respecting the active-enemy cap and occupied spawn points. */
export class SpawnSystem {
  readonly portals: SpawnPortal[] = [];
  private readonly queue: RosterEntry[];
  private readonly points: readonly TilePoint[];
  private timer: number = SPAWN_CONFIG.firstSpawnDelay;
  private nextPoint = 0;

  constructor(private readonly level: ParsedLevel) {
    this.queue = [...level.roster];
    this.points = level.enemySpawns;
  }

  /** Enemies not yet on the field: queued plus currently materialising. */
  get pending(): number {
    return this.queue.length + this.portals.length;
  }

  get exhausted(): boolean {
    return this.pending === 0;
  }

  /** Advances timers and returns the enemies that finished materialising this tick. */
  /** `extraActive` raises the cap on enemies at once, e.g. while reinforcements are rushed in. */
  update(dt: number, activeEnemies: number, bodies: readonly Rect[], extraActive = 0): { opened: SpawnPortal[]; spawned: SpawnOrder[] } {
    const opened: SpawnPortal[] = [];
    const spawned: SpawnOrder[] = [];

    for (let i = this.portals.length - 1; i >= 0; i--) {
      const portal = this.portals[i];
      portal.remaining -= dt;
      if (portal.remaining > 0 || bodies.some((body) => rectsOverlap(body, portalRect(portal)))) continue;
      this.portals.splice(i, 1);
      spawned.push({ x: portal.x, y: portal.y, entry: portal.entry });
    }

    this.timer -= dt;
    const onField = activeEnemies + this.portals.length + spawned.length;
    if (this.timer <= 0 && this.queue.length > 0 && onField < this.level.maxActiveEnemies + extraActive) {
      const portal = this.openPortal(bodies);
      if (portal) {
        opened.push(portal);
        this.timer = this.level.spawnInterval;
      }
    }
    return { opened, spawned };
  }

  private openPortal(bodies: readonly Rect[]): SpawnPortal | null {
    for (let attempt = 0; attempt < this.points.length; attempt++) {
      const point = this.points[(this.nextPoint + attempt) % this.points.length];
      const x = point.col * TILE_SIZE;
      const y = point.row * TILE_SIZE;
      const area = { x, y, w: TANK_SIZE, h: TANK_SIZE };
      const busy = this.portals.some((p) => p.x === x && p.y === y) || bodies.some((body) => rectsOverlap(body, area));
      if (busy) continue;
      const entry = this.queue.shift();
      if (!entry) return null;
      this.nextPoint = (this.nextPoint + attempt + 1) % this.points.length;
      const portal = { x, y, entry, remaining: SPAWN_CONFIG.portalDuration };
      this.portals.push(portal);
      return portal;
    }
    return null;
  }
}

function portalRect(portal: SpawnPortal): Rect {
  return { x: portal.x, y: portal.y, w: TANK_SIZE, h: TANK_SIZE };
}
