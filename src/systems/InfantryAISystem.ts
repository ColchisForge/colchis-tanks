import { distance, rectsOverlap, type Direction, type Rect, type Vec } from '../core/geometry';
import type { Random } from '../core/Random';
import type { Mine } from '../entities/Mine';
import type { Supply } from '../entities/Supply';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import { idleIntent } from '../entities/Unit';
import type { Wrench } from '../entities/Wrench';
import { ROCKET_CONFIG, SOLDIER_SIZE, TILE_SIZE } from '../game/GameConfig';
import { Surface } from '../world/Surface';
import type { TileMap, TilePoint } from '../world/TileMap';
import type { CrewSystem } from './CrewSystem';
import { findPath, reachableTiles, steer, tileOf } from './Pathfinder';
import type { Perception } from './Perception';

export interface InfantryContext {
  readonly map: TileMap;
  readonly crew: CrewSystem;
  readonly perception: Perception;
  readonly tanks: readonly Tank[];
  /** The player's tank, the only target worth a rocket. */
  readonly playerTank: Tank | null;
  /** Centre of the side's HQ: mines go on the approaches to it. */
  readonly hq: Vec | null;
  readonly crates: readonly Supply[];
  readonly mines: readonly Mine[];
  readonly rng: Random;
  readonly wrenches: readonly Wrench[];
  /** Where a crew with nothing left to fight for heads to leave the battle: its own spawn points. */
  readonly exits: readonly Rect[];
  onEscaped(soldier: Soldier): void;
  /** A crew has started lining up a rocket shot. */
  onAimRocket(soldier: Soldier): void;
}

const BAIL_OUT_PAUSE = 0.35;
const REPATH_INTERVAL = 0.8;
/** Hiding crews peek out now and then in case a wrench has turned up. */
const HIDE_RETHINK = 2.5;
/** After this long hiding without a way back into a tank, a crew gives up and retreats. */
const HIDE_PATIENCE = 10;
/** Crews only walk to mine crates this close (px). */
const CRATE_REACH = 170;
/** Mines go on the approaches to the HQ, this far out (px), or near the crew if there is no HQ. */
const MINEFIELD_RANGE: readonly [number, number] = [40, 128];
/** Mines are spread out, never closer than this to another (px). */
const MINE_SPACING = 20;

function tileRect(col: number, row: number): Rect {
  return { x: col * TILE_SIZE, y: row * TILE_SIZE, w: SOLDIER_SIZE, h: SOLDIER_SIZE };
}

/**
 * Enemy crews on foot: grab a wrench, get back to their wreck and repair it, climb aboard.
 * Waiting for a wrench they slip into the nearest bush; with no tank left to save they retreat
 * to their own lines and leave the battle. A crew that saved its launcher fires it at the
 * player's tank whenever it lines up in sight, which turns every bush into a possible ambush.
 * Crews also collect mine crates and lay the mines on the approaches to their HQ, on the roads
 * by preference, where an attacking tank is most likely to roll.
 */
export class InfantryAISystem {
  update(dt: number, soldiers: readonly Soldier[], ctx: InfantryContext): void {
    for (const soldier of soldiers) {
      if (soldier.onFoot && soldier.team === 'enemy') this.think(soldier, dt, ctx);
    }
  }

  private think(soldier: Soldier, dt: number, ctx: InfantryContext): void {
    const brain = soldier.brain;
    brain.stateTime += dt;
    brain.repathTimer -= dt;
    soldier.intent = idleIntent();
    if (this.rocketAttack(soldier, dt, ctx)) return;

    switch (brain.state) {
      case 'BAIL_OUT':
        if (brain.stateTime >= BAIL_OUT_PAUSE) this.decide(soldier, ctx);
        return;
      case 'FETCH_WRENCH': {
        const wrench = this.nearestWrench(soldier, ctx);
        if (soldier.carryingWrench || !wrench || !this.wreckFor(soldier, ctx)) {
          this.decide(soldier, ctx);
          return;
        }
        if (!this.walk(soldier, ctx, (col, row) => rectsOverlap(tileRect(col, row), wrench))) brain.enter('HIDE');
        return;
      }
      case 'RETURN':
      case 'REPAIR': {
        const wreck = this.wreckFor(soldier, ctx);
        if (!wreck || !soldier.carryingWrench) {
          this.decide(soldier, ctx);
          return;
        }
        if (ctx.crew.touching(soldier, wreck)) {
          if (brain.state !== 'REPAIR') brain.enter('REPAIR');
          return;
        }
        if (brain.state === 'REPAIR') brain.enter('RETURN');
        if (!this.walk(soldier, ctx, this.besideTank(ctx, wreck))) brain.enter('HIDE');
        return;
      }
      case 'BOARD': {
        const tank = this.boardableFor(soldier, ctx);
        if (!tank) {
          this.decide(soldier, ctx);
          return;
        }
        if (ctx.crew.canBoard(soldier, tank)) soldier.intent.use = true;
        else if (!this.walk(soldier, ctx, this.besideTank(ctx, tank))) brain.enter('HIDE');
        return;
      }
      case 'FETCH_MINE': {
        const crate = this.nearestMineCrate(soldier, ctx);
        if (!crate || !soldier.canCarryMine) {
          this.decide(soldier, ctx);
          return;
        }
        if (!this.walk(soldier, ctx, (col, row) => rectsOverlap(tileRect(col, row), crate))) brain.enter('HIDE');
        return;
      }
      case 'PLANT_MINE': {
        if (soldier.mines <= 0) {
          this.decide(soldier, ctx);
          return;
        }
        if (!brain.mineSpot || this.mineNear(brain.mineSpot, ctx)) brain.mineSpot = this.chooseMineSpot(soldier, ctx);
        const spot = brain.mineSpot;
        if (!spot) {
          brain.enter('HIDE');
          return;
        }
        const here = tileOf(soldier);
        if (here.col === spot.col && here.row === spot.row && Math.abs(soldier.x - spot.col * TILE_SIZE) < 1 && Math.abs(soldier.y - spot.row * TILE_SIZE) < 1) {
          soldier.intent.fireSecondary = true;
          brain.mineSpot = null;
          return;
        }
        if (!this.walk(soldier, ctx, (col, row) => col === spot.col && row === spot.row)) {
          brain.mineSpot = null;
          brain.enter('HIDE');
        }
        return;
      }
      case 'HIDE':
        brain.hidden += dt;
        if (brain.stateTime >= HIDE_RETHINK) {
          this.decide(soldier, ctx);
          if (brain.state !== 'HIDE') return;
        }
        if (!ctx.perception.isConcealed(soldier)) this.walk(soldier, ctx, (col, row) => ctx.map.conceals(col, row));
        return;
      case 'RETREAT': {
        const exit = ctx.exits.find((area) => rectsOverlap(area, soldier));
        if (exit) {
          ctx.onEscaped(soldier);
          return;
        }
        this.walk(soldier, ctx, (col, row) => ctx.exits.some((area) => rectsOverlap(area, tileRect(col, row))));
        return;
      }
    }
  }

  /**
   * Lines up a rocket on the player's tank when it is straight ahead in range and in sight:
   * turn to face it, steady the aim for a moment, fire. Returns true while doing so.
   */
  private rocketAttack(soldier: Soldier, dt: number, ctx: InfantryContext): boolean {
    const brain = soldier.brain;
    const target = ctx.playerTank;
    const direction = target && soldier.rockets > 0 && brain.state !== 'BAIL_OUT' ? this.rocketLine(soldier, target, ctx) : null;
    if (!direction) {
      brain.aim = 0;
      return false;
    }
    soldier.intent.direction = direction;
    if (soldier.direction !== direction) return true;
    if (brain.aim === 0) ctx.onAimRocket(soldier);
    brain.aim += dt;
    if (brain.aim >= ROCKET_CONFIG.aimTime && soldier.launcher.ready) {
      soldier.intent.fire = true;
      brain.aim = 0;
    }
    return true;
  }

  /** The direction to fire a rocket at `target`, if it is a fair shot. */
  private rocketLine(soldier: Soldier, target: Tank, ctx: InfantryContext): Direction | null {
    if (!target.operational || target.invulnerable) return null;
    const a = soldier.center;
    const b = target.center;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const tolerance = ROCKET_CONFIG.aiAlignTolerance;
    if (Math.hypot(dx, dy) > ROCKET_CONFIG.aiRange) return null;
    let direction: Direction | null = null;
    if (Math.abs(dx) <= tolerance) direction = dy > 0 ? 'down' : 'up';
    else if (Math.abs(dy) <= tolerance) direction = dx > 0 ? 'right' : 'left';
    if (!direction) return null;
    // Crews carry no lamps: at night they need the target close, burning-lit, or firing.
    const eyes = { x: soldier.x, y: soldier.y, w: soldier.w, h: soldier.h };
    if (!ctx.perception.canSpotTank(eyes, target, ROCKET_CONFIG.aiRange) || !ctx.perception.hasLineOfSight(a, b)) return null;
    // Nothing in the way: a wreck or another tank would take the rocket instead.
    const lane = {
      x: Math.min(a.x, b.x) - 1,
      y: Math.min(a.y, b.y) - 1,
      w: Math.abs(b.x - a.x) + 2,
      h: Math.abs(b.y - a.y) + 2,
    };
    if (ctx.tanks.some((tank) => tank !== target && tank.active && rectsOverlap(lane, tank))) return null;
    return direction;
  }

  private decide(soldier: Soldier, ctx: InfantryContext): void {
    const brain = soldier.brain;
    const wreck = this.wreckFor(soldier, ctx);
    if (soldier.carryingWrench && wreck) brain.enter('RETURN');
    else if (!soldier.carryingWrench && wreck && ctx.wrenches.length > 0) brain.enter('FETCH_WRENCH');
    else if (this.boardableFor(soldier, ctx)) brain.enter('BOARD');
    else if (soldier.mines > 0 && this.chooseMineSpot(soldier, ctx)) brain.enter('PLANT_MINE');
    else if (soldier.canCarryMine && this.nearestMineCrate(soldier, ctx)) brain.enter('FETCH_MINE');
    else if (wreck && brain.hidden < HIDE_PATIENCE) brain.enter('HIDE');
    else brain.enter('RETREAT');
  }

  /** The wreck worth fixing: the crew's own if it still stands, otherwise the nearest one of their side. */
  private wreckFor(soldier: Soldier, ctx: InfantryContext): Tank | null {
    if (soldier.home?.disabled) return soldier.home;
    return this.nearest(soldier, ctx.tanks.filter((tank) => tank.disabled && tank.team === soldier.team));
  }

  private boardableFor(soldier: Soldier, ctx: InfantryContext): Tank | null {
    return this.nearest(soldier, ctx.tanks.filter((tank) => tank.operational && tank.team === soldier.team && !tank.crew.full));
  }

  private nearestMineCrate(soldier: Soldier, ctx: InfantryContext): Supply | null {
    const crate = this.nearest(soldier, ctx.crates.filter((c) => c.kind === 'mine'));
    return crate && distance(soldier.center, crate.center) <= CRATE_REACH ? crate : null;
  }

  private mineNear(spot: TilePoint, ctx: InfantryContext): boolean {
    const x = spot.col * TILE_SIZE + TILE_SIZE / 2;
    const y = spot.row * TILE_SIZE + TILE_SIZE / 2;
    return ctx.mines.some((mine) => Math.hypot(mine.center.x - x, mine.center.y - y) < MINE_SPACING);
  }

  /**
   * A tile to mine: on the approaches to the HQ (or near the crew if there is none), reachable on
   * foot, clear of tanks and other mines. Roads, where tanks drive, are picked far more often.
   */
  private chooseMineSpot(soldier: Soldier, ctx: InfantryContext): TilePoint | null {
    const [near, far] = MINEFIELD_RANGE;
    const centre = ctx.hq ?? soldier.center;
    const candidates: (TilePoint & { weight: number })[] = [];
    for (const key of reachableTiles(ctx.map, tileOf(soldier), 1, 'foot').keys()) {
      const col = key % ctx.map.cols;
      const row = Math.floor(key / ctx.map.cols);
      const x = col * TILE_SIZE + TILE_SIZE / 2;
      const y = row * TILE_SIZE + TILE_SIZE / 2;
      const d = Math.hypot(x - centre.x, y - centre.y);
      if (d > far || (ctx.hq && d < near)) continue;
      const spot = { col, row };
      if (this.mineNear(spot, ctx) || ctx.tanks.some((tank) => tank.active && rectsOverlap(tank, tileRect(col, row)))) continue;
      // Only where a tank can actually drive over it.
      if (!this.tankLane(ctx.map, col, row)) continue;
      candidates.push({ ...spot, weight: ctx.map.surfaceAt(col, row) === Surface.Road ? 5 : 1 });
    }
    if (candidates.length === 0) return null;
    const chosen = ctx.rng.weighted(candidates, (spot) => spot.weight);
    return { col: chosen.col, row: chosen.row };
  }

  /** True if some 2x2 tank footprint covering the tile is open ground. */
  private tankLane(map: TileMap, col: number, row: number): boolean {
    for (const [dc, dr] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      let open = true;
      for (let r = row + dr; r <= row + dr + 1 && open; r++) {
        for (let c = col + dc; c <= col + dc + 1 && open; c++) if (!map.inBounds(c, r) || map.blocksMovement(c, r, 'tracked')) open = false;
      }
      if (open) return true;
    }
    return false;
  }

  private nearestWrench(soldier: Soldier, ctx: InfantryContext): Wrench | null {
    return this.nearest(soldier, ctx.wrenches);
  }

  private nearest<T extends Rect>(soldier: Soldier, items: readonly T[]): T | null {
    let best: T | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of items) {
      const d = distance(soldier.center, { x: item.x + item.w / 2, y: item.y + item.h / 2 });
      if (d < bestDistance) {
        best = item;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Goal test for standing right next to a tank without overlapping it. */
  private besideTank(ctx: InfantryContext, tank: Tank): (col: number, row: number) => boolean {
    return (col, row) => {
      const spot = tileRect(col, row);
      return ctx.crew.touching(spot, tank) && !rectsOverlap(spot, tank);
    };
  }

  /** Follows (and periodically replans) a route. Returns false once a replan finds no route at all. */
  private walk(soldier: Soldier, ctx: InfantryContext, isGoal: (col: number, row: number) => boolean): boolean {
    const brain = soldier.brain;
    if (brain.repathTimer <= 0) {
      brain.repathTimer = REPATH_INTERVAL;
      const route = findPath(ctx.map, {
        start: tileOf(soldier),
        size: 1,
        mobility: 'foot',
        brickCost: Number.POSITIVE_INFINITY,
        obstacles: ctx.tanks.filter((tank) => tank.active && !tank.manned),
        isGoal,
      });
      if (!route) return false;
      brain.path = route;
    }
    const direction = steer(soldier, brain.path);
    if (!direction) return true;
    soldier.intent.direction = direction;
    soldier.intent.move = true;
    return true;
  }
}
