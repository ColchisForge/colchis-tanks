import { removeInactive } from '../core/collections';
import { rectsOverlap, type Rect } from '../core/geometry';
import type { Random } from '../core/Random';
import type { Soldier } from '../entities/Soldier';
import { Supply, type SupplyKind } from '../entities/Supply';
import type { BattleEvent } from '../game/BattleEvents';
import { SUPPLY_CONFIG } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';
import { dropSpot } from './Drops';

/**
 * Supply crates on the battlefield. Every rocket fired calls in a fresh one; mine crates turn up
 * now and then, by turns near the player and on the approaches to the enemy HQ. Crews of either
 * side pick a crate up by walking over it, if they have room.
 */
export class SupplySystem {
  readonly crates: Supply[] = [];
  private mineTimer: number = SUPPLY_CONFIG.firstMineCrate;
  private nextOrigin = 0;

  constructor(
    private readonly map: TileMap,
    private readonly rng: Random,
    private readonly events: BattleEvent[],
  ) {}

  count(kind: SupplyKind): number {
    return this.crates.reduce((n, crate) => n + (crate.kind === kind ? 1 : 0), 0);
  }

  /** Drops a crate a fair walk from `origin`, unless the map already holds as many as allowed. */
  drop(kind: SupplyKind, origin: Rect, avoid: readonly Rect[] = []): Supply | null {
    const cap = kind === 'rocket' ? SUPPLY_CONFIG.maxRocketCrates : SUPPLY_CONFIG.maxMineCrates;
    if (this.count(kind) >= cap) return null;
    const spot = dropSpot(this.map, this.rng, origin, SUPPLY_CONFIG.minDistance, SUPPLY_CONFIG.maxDistance, [...avoid, ...this.crates]);
    if (!spot) return null;
    const crate = new Supply(kind, spot.x, spot.y);
    this.crates.push(crate);
    const c = crate.center;
    this.events.push({ type: 'supplySpawned', x: c.x, y: c.y, kind });
    return crate;
  }

  /**
   * Ages crates, calls in mine crates on a timer around each of `mineOrigins` in turn, and hands
   * crates to crews walking over them.
   */
  update(dt: number, soldiers: readonly Soldier[], mineOrigins: readonly Rect[], avoid: readonly Rect[]): void {
    this.mineTimer -= dt;
    if (this.mineTimer <= 0) {
      this.mineTimer = SUPPLY_CONFIG.mineCrateInterval;
      if (mineOrigins.length > 0) {
        const origin = mineOrigins[this.nextOrigin % mineOrigins.length];
        this.nextOrigin++;
        this.drop('mine', origin, avoid);
      }
    }
    for (const crate of this.crates) {
      crate.age += dt;
      const finder = soldiers.find((soldier) => soldier.onFoot && rectsOverlap(soldier, crate) && this.wants(soldier, crate.kind));
      if (!finder) continue;
      if (crate.kind === 'rocket') finder.rockets++;
      else finder.mines++;
      crate.active = false;
      const c = crate.center;
      this.events.push({ type: 'supplyCollected', x: c.x, y: c.y, kind: crate.kind, team: finder.team });
    }
    removeInactive(this.crates);
  }

  private wants(soldier: Soldier, kind: SupplyKind): boolean {
    return kind === 'rocket' ? soldier.canCarryRocket : soldier.canCarryMine;
  }
}
