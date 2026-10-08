import { isVertical, opposite, rectsOverlap, type Direction, type Rect, type Vec } from '../core/geometry';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import { idleIntent } from '../entities/Unit';
import type { BattleEvent } from '../game/BattleEvents';
import { SOLDIER_CONFIG } from '../game/GameConfig';
import type { CollisionSystem } from './CollisionSystem';

/** Getting in and out of tanks, and the danger of being on foot near enemy tracks. */
export class CrewSystem {
  constructor(
    private readonly collision: CollisionSystem,
    private readonly events: BattleEvent[],
  ) {}

  /** True if the soldier stands close enough to climb into the tank or work on it. */
  touching(soldier: Rect, tank: Rect): boolean {
    const r = SOLDIER_CONFIG.reach;
    return rectsOverlap({ x: soldier.x - r, y: soldier.y - r, w: soldier.w + 2 * r, h: soldier.h + 2 * r }, tank);
  }

  canBoard(soldier: Soldier, tank: Tank): boolean {
    return soldier.onFoot && tank.operational && !tank.crew.full && tank.team === soldier.team && this.touching(soldier, tank);
  }

  board(soldier: Soldier, tank: Tank): boolean {
    if (!this.canBoard(soldier, tank)) return false;
    tank.crew.add(soldier);
    tank.intent = idleIntent();
    soldier.vehicle = tank;
    soldier.home = tank;
    soldier.intent = idleIntent();
    soldier.moving = false;
    const c = tank.center;
    this.events.push({ type: 'crewBoarded', x: c.x, y: c.y, team: soldier.team });
    return true;
  }

  /**
   * Puts a crew member on the ground beside the tank, rear first. A voluntary exit needs room;
   * bailing out of a wreck always succeeds, if necessary on top of the hull to crawl away from.
   */
  disembark(soldier: Soldier, tank: Tank, bodies: readonly Rect[], reason: 'exit' | 'bailOut'): boolean {
    const spot = this.exitSpot(soldier, tank, bodies);
    if (!spot && reason === 'exit') return false;
    const place = spot ?? { x: tank.x + (tank.w - soldier.w) / 2, y: tank.y + (tank.h - soldier.h) / 2 };
    tank.crew.remove(soldier);
    tank.intent = idleIntent();
    soldier.vehicle = null;
    soldier.home = tank;
    soldier.x = place.x;
    soldier.y = place.y;
    soldier.direction = tank.direction;
    soldier.intent = idleIntent();
    const c = soldier.center;
    this.events.push({ type: reason === 'exit' ? 'crewExited' : 'crewBailedOut', x: c.x, y: c.y, team: soldier.team });
    return true;
  }

  /** Enemy soldiers caught under a moving tank. */
  crushed(tanks: readonly Tank[], soldiers: readonly Soldier[]): { victim: Soldier; tank: Tank }[] {
    const result: { victim: Soldier; tank: Tank }[] = [];
    for (const tank of tanks) {
      if (!tank.manned || !tank.moving) continue;
      for (const soldier of soldiers) {
        if (soldier.onFoot && soldier.team !== tank.team && rectsOverlap(soldier, tank)) result.push({ victim: soldier, tank });
      }
    }
    return result;
  }

  private exitSpot(soldier: Soldier, tank: Tank, bodies: readonly Rect[]): Vec | null {
    const s = soldier.w;
    const midX = tank.x + (tank.w - s) / 2;
    const midY = tank.y + (tank.h - s) / 2;
    const right = tank.x + tank.w - s;
    const bottom = tank.y + tank.h - s;
    const spots: Readonly<Record<Direction, readonly Vec[]>> = {
      up: [{ x: midX, y: tank.y - s }, { x: tank.x, y: tank.y - s }, { x: right, y: tank.y - s }],
      down: [{ x: midX, y: tank.y + tank.h }, { x: tank.x, y: tank.y + tank.h }, { x: right, y: tank.y + tank.h }],
      left: [{ x: tank.x - s, y: midY }, { x: tank.x - s, y: tank.y }, { x: tank.x - s, y: bottom }],
      right: [{ x: tank.x + tank.w, y: midY }, { x: tank.x + tank.w, y: tank.y }, { x: tank.x + tank.w, y: bottom }],
    };
    const sides: readonly Direction[] = isVertical(tank.direction) ? ['left', 'right'] : ['up', 'down'];
    for (const side of [opposite(tank.direction), ...sides, tank.direction]) {
      for (const spot of spots[side]) {
        if (this.collision.fits({ x: spot.x, y: spot.y, w: s, h: s }, soldier.mobility, bodies)) return spot;
      }
    }
    return null;
  }
}
