import { removeInactive } from '../core/collections';
import { rectsOverlap, type Rect } from '../core/geometry';
import type { Random } from '../core/Random';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import { Wrench } from '../entities/Wrench';
import type { BattleEvent } from '../game/BattleEvents';
import { REPAIR_CONFIG } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';
import type { CrewSystem } from './CrewSystem';
import { dropSpot } from './Drops';

const TICK_INTERVAL = 0.35;

export interface RepairListener {
  onRepaired(tank: Tank, mechanic: Soldier): void;
}

/** Wrenches on the map, and crews fixing wrecks with them. */
export class RepairSystem {
  readonly wrenches: Wrench[] = [];
  private tickTimer = 0;

  constructor(
    private readonly map: TileMap,
    private readonly rng: Random,
    private readonly events: BattleEvent[],
    private readonly crew: CrewSystem,
  ) {}

  /** Drops a wrench a fair walk from `origin`, somewhere a soldier can actually reach from there. */
  spawnWrench(origin: Rect, avoid: readonly Rect[] = []): Wrench | null {
    const spot = dropSpot(this.map, this.rng, origin, REPAIR_CONFIG.wrenchMinDistance, REPAIR_CONFIG.wrenchMaxDistance, avoid);
    if (!spot) return null;
    const wrench = new Wrench(spot.x, spot.y);
    this.wrenches.push(wrench);
    const c = wrench.center;
    this.events.push({ type: 'wrenchSpawned', x: c.x, y: c.y });
    return wrench;
  }

  update(dt: number, soldiers: readonly Soldier[], tanks: readonly Tank[], listener: RepairListener): void {
    for (const wrench of this.wrenches) {
      wrench.age += dt;
      if (wrench.expired) {
        wrench.active = false;
        const c = wrench.center;
        this.events.push({ type: 'wrenchExpired', x: c.x, y: c.y });
        continue;
      }
      const finder = soldiers.find((soldier) => soldier.onFoot && !soldier.carryingWrench && rectsOverlap(soldier, wrench));
      if (finder) {
        finder.carryingWrench = true;
        wrench.active = false;
        const c = wrench.center;
        this.events.push({ type: 'wrenchCollected', x: c.x, y: c.y, team: finder.team });
      }
    }
    removeInactive(this.wrenches);

    this.tickTimer -= dt;
    const tick = this.tickTimer <= 0;
    if (tick) this.tickTimer = TICK_INTERVAL;
    for (const soldier of soldiers) {
      if (!soldier.onFoot || !soldier.carryingWrench || soldier.moving) continue;
      const wreck = tanks.find((tank) => tank.disabled && tank.team === soldier.team && this.crew.touching(soldier, tank));
      if (!wreck) continue;
      wreck.repairProgress = Math.min(1, wreck.repairProgress + dt / REPAIR_CONFIG.duration);
      const c = wreck.center;
      if (tick) this.events.push({ type: 'repairing', x: c.x, y: c.y, team: wreck.team });
      if (wreck.repairProgress < 1) continue;
      wreck.repair();
      soldier.carryingWrench = false;
      this.events.push({ type: 'repairComplete', x: c.x, y: c.y, team: wreck.team });
      listener.onRepaired(wreck, soldier);
    }
  }
}
