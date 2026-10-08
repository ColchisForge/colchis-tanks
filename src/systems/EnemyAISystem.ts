import {
  DIRECTION_VECTORS,
  DIRECTIONS,
  distance,
  isPerpendicular,
  isVertical,
  opposite,
  type Direction,
  type Rect,
  type Vec,
} from '../core/geometry';
import type { Random } from '../core/Random';
import type { AIState, AITarget } from '../entities/AIBrain';
import type { WeaponKind } from '../entities/components/Weapon';
import type { EnemyTank } from '../entities/EnemyTank';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import { AI_CONFIG, ENEMY_BASE_CONFIG, MACHINE_GUN_CONFIG, SHELL_BLAST_HALF_WIDTH, TILE_SIZE } from '../game/GameConfig';
import { surfaceProperties } from '../world/Surface';
import type { TileMap, TilePoint } from '../world/TileMap';
import type { CollisionSystem } from './CollisionSystem';
import { stoppingDistance } from './MovementSystem';
import { findPath, reachableTiles, steerVehicle, tileOf } from './Pathfinder';
import type { Perception } from './Perception';

export interface AIContext {
  /** The player's tank in any condition: manned, empty or wrecked. */
  readonly playerTank: Tank | null;
  /** The player's crew member while out of the tank. */
  readonly playerSoldier: Soldier | null;
  /** Centre of the base, if it still stands. */
  readonly base: Vec | null;
  readonly map: TileMap;
  readonly collision: CollisionSystem;
  readonly perception: Perception;
  readonly tanks: readonly Tank[];
  readonly rng: Random;
  /** Level-wide multiplier on hunting and base pressure. */
  readonly aggression: number;
  /** Centre of the enemy's own HQ, if it stands. */
  readonly hq: Vec | null;
  /** True while the HQ is threatened. */
  readonly alarm: boolean;
  /** The player's unit the defenders go after: their tank, or their crew on foot. */
  readonly intruder: Tank | Soldier | null;
  /** Mines planted by the enemy's own crews: known, and steered around. */
  readonly ownMines: readonly Rect[];
}

/** Seconds of pushing against an obstacle before the tank reconsiders. */
const BLOCKED_PATIENCE = 0.12;
/** Speed at which drivers close the last few pixels to an obstacle, px/s. */
const CREEP_SPEED = 10;
/** Drivers only swing onto the other axis below this speed, px/s. */
const TURN_SPEED = 14;
/** How far ahead drivers watch for their own side's mines, px. */
const MINE_LOOKAHEAD = 12;

/** Overlap test that treats touching edges as clear. */
function rectsOverlapLoose(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
}
const DIG_DURATION = 1.6;
const PROBE_DISTANCE = 4;
/** Tanks never fire towards their own HQ's fortifications from this close (px). */
const HQ_CAUTION_RANGE = 96;
/** Distance within which a tank that is not besieging the base will not fire towards it. */
const BASE_CAUTION_RANGE = 64;

/**
 * Finite-state enemy tank behaviour:
 * PATROL wanders (drifting towards the base) and watches for targets, CHASE plans a route to the
 * player or a crew member it can see, ATTACK stops and fires along a clear line (machine gun for
 * soldiers), CHANGE_DIRECTION picks a new heading when blocked or bored.
 * The HQ comes first: GUARD tanks hold posts around it and shoot whatever lines up, and while the
 * alarm is up the nearest tanks DEFEND, hunting the intruder down wherever it goes.
 */
export class EnemyAISystem {
  update(dt: number, enemies: readonly EnemyTank[], ctx: AIContext): void {
    this.assignRoles(enemies, ctx);
    for (const tank of enemies) {
      if (!tank.manned) {
        if (tank.brain.state !== 'DESTROYED') tank.brain.enter('DESTROYED');
        continue;
      }
      if (tank.brain.state === 'DESTROYED') tank.brain.enter('PATROL');
      if (this.finishTurn(tank)) continue;
      this.think(tank, dt, ctx);
      this.slowForTurn(tank);
    }
  }

  /**
   * Keeps the HQ's guard posts filled with the tanks nearest to it, and while the alarm is up
   * pulls the nearest tanks off whatever they were doing to defend it.
   */
  private assignRoles(enemies: readonly EnemyTank[], ctx: AIContext): void {
    const crewed = enemies.filter((tank) => tank.manned);
    const hq = ctx.hq;
    if (!hq) {
      for (const tank of crewed) {
        const brain = tank.brain;
        if (brain.role === 'guard' || brain.defending) {
          brain.role = 'raider';
          brain.defending = false;
          if (brain.state === 'GUARD' || brain.state === 'DEFEND') brain.enter('PATROL');
        }
      }
      return;
    }
    const byDistance = (list: EnemyTank[]) => list.sort((a, b) => distance(a.center, hq) - distance(b.center, hq));
    const wanted = ENEMY_BASE_CONFIG.guards + (ctx.aggression >= ENEMY_BASE_CONFIG.extraGuardAggression ? 1 : 0);
    let guards = crewed.filter((tank) => tank.brain.role === 'guard').length;
    for (const tank of byDistance(crewed.filter((t) => t.brain.role !== 'guard' && !t.brain.defending))) {
      if (guards >= wanted) break;
      tank.brain.role = 'guard';
      tank.brain.post = null;
      if (tank.brain.state !== 'ATTACK') tank.brain.enter('GUARD');
      guards++;
    }
    if (ctx.alarm && ctx.intruder) {
      let defenders = crewed.filter((tank) => tank.brain.defending).length;
      for (const tank of byDistance(crewed.filter((t) => !t.brain.defending))) {
        if (defenders >= ENEMY_BASE_CONFIG.defenders) break;
        tank.brain.defending = true;
        if (tank.brain.state !== 'ATTACK') tank.brain.enter('DEFEND');
        defenders++;
      }
      return;
    }
    for (const tank of crewed) {
      if (!tank.brain.defending) continue;
      tank.brain.defending = false;
      if (tank.brain.state === 'DEFEND') tank.brain.enter(tank.brain.role === 'guard' ? 'GUARD' : 'PATROL');
    }
  }

  /** Where a tank goes back to after an attack or a change of direction. */
  private homeState(tank: EnemyTank, hunting: boolean): AIState {
    if (tank.brain.defending) return 'DEFEND';
    if (tank.brain.role === 'guard') return 'GUARD';
    return hunting ? 'CHASE' : 'PATROL';
  }

  /** Forward speed along the current heading, px/s. */
  private forwardSpeed(tank: EnemyTank): number {
    const v = DIRECTION_VECTORS[tank.direction];
    return tank.velocity.x * v.x + tank.velocity.y * v.y;
  }

  /**
   * Drivers slow down before swinging onto the other axis, rather than pivoting at speed and
   * skidding sideways into whatever is beside them. The turn is remembered and made once slow.
   */
  private slowForTurn(tank: EnemyTank): void {
    const wanted = tank.intent.direction;
    if (!wanted || !isPerpendicular(wanted, tank.direction) || this.forwardSpeed(tank) <= TURN_SPEED) return;
    tank.brain.pendingTurn = wanted;
    tank.intent.direction = tank.direction;
    tank.intent.move = false;
  }

  /** While braking for a remembered turn the driver does nothing else; returns true if so. */
  private finishTurn(tank: EnemyTank): boolean {
    const turn = tank.brain.pendingTurn;
    if (!turn) return false;
    tank.intent.fire = false;
    tank.intent.fireSecondary = false;
    if (this.forwardSpeed(tank) > TURN_SPEED) {
      tank.intent.direction = tank.direction;
      tank.intent.move = false;
      return true;
    }
    tank.brain.pendingTurn = null;
    tank.intent.direction = turn;
    tank.intent.move = true;
    return true;
  }

  private think(tank: EnemyTank, dt: number, ctx: AIContext): void {
    const brain = tank.brain;
    brain.stateTime += dt;
    brain.decisionTimer -= dt;
    brain.digTime -= dt;
    brain.repathTimer -= dt;
    brain.detourTime -= dt;
    brain.blockedTime = tank.blocked ? brain.blockedTime + dt : 0;
    tank.intent.fire = false;
    tank.intent.fireSecondary = false;
    tank.intent.use = false;

    switch (brain.state) {
      case 'PATROL':
        this.patrol(tank, dt, ctx);
        break;
      case 'CHASE':
        this.chase(tank, ctx);
        break;
      case 'ATTACK':
        this.attack(tank, ctx);
        break;
      case 'CHANGE_DIRECTION':
        this.changeDirection(tank, ctx);
        break;
      case 'GUARD':
        this.guard(tank, dt, ctx);
        break;
      case 'DEFEND':
        this.defend(tank, ctx);
        break;
      case 'DESTROYED':
        break;
    }
  }

  private patrol(tank: EnemyTank, dt: number, ctx: AIContext): void {
    const { profile } = tank;
    if (this.visibleSoldier(tank, ctx)) {
      this.startChase(tank, 'soldier', ctx);
      return;
    }
    const player = ctx.playerTank?.manned ? ctx.playerTank : null;
    const spotted = player && ctx.perception.canSpotTank(tank, player, profile.detectRange);
    if (player && (spotted || ctx.rng.chance(profile.huntChance * ctx.aggression * dt))) {
      this.startChase(tank, 'player', ctx);
      return;
    }
    // An empty or wrecked player tank is a sitting duck: destroy it before the crew can get back in.
    const idle = ctx.playerTank && !ctx.playerTank.manned ? ctx.playerTank : null;
    if (idle && this.lineOfFire(tank, idle.center, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, ctx)) {
      this.startAttack(tank, 'wreck', 'cannon');
      return;
    }
    const siegeRange = AI_CONFIG.baseAttackRange * Math.min(1, ctx.aggression);
    if (tank.brain.siege && ctx.base && this.lineOfFire(tank, ctx.base, siegeRange, AI_CONFIG.alignTolerance, ctx, false)) {
      this.startAttack(tank, 'base', 'cannon');
      return;
    }
    const potShot = !this.facingBase(tank, ctx) && ctx.rng.chance(profile.patrolFireRate * dt);
    if (this.handleObstacle(tank, ctx) === 'clear') this.drive(tank, potShot, ctx);
  }

  private chase(tank: EnemyTank, ctx: AIContext): void {
    const brain = tank.brain;
    const huntingSoldier = brain.chaseTarget === 'soldier';
    const target: Rect | null = huntingSoldier ? this.visibleSoldier(tank, ctx) : ctx.playerTank?.manned ? ctx.playerTank : null;
    // Losing sight of a crew member ends the hunt: hiding works.
    if (!target) {
      brain.enter('PATROL');
      return;
    }
    const centre = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    if (huntingSoldier) {
      // Crews get the machine gun only: a burst can be dodged, a shell would kill outright.
      if (this.lineOfFire(tank, centre, MACHINE_GUN_CONFIG.range, AI_CONFIG.machineGunAlignTolerance, ctx)) {
        this.startAttack(tank, 'soldier', 'machineGun');
        return;
      }
    } else if (this.lineOfFire(tank, centre, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, ctx)) {
      this.startAttack(tank, 'player', 'cannon');
      return;
    }
    const far = distance(tank.center, centre) > AI_CONFIG.loseRange;
    if ((!huntingSoldier && far && brain.stateTime > AI_CONFIG.minChaseTime) || brain.stateTime > AI_CONFIG.maxChaseTime) {
      brain.enter('PATROL');
      return;
    }
    if (!brain.tactical) {
      if (this.handleObstacle(tank, ctx) === 'clear') this.drive(tank, false, ctx);
    } else if (huntingSoldier) {
      this.hunt(tank, centre, MACHINE_GUN_CONFIG.range, AI_CONFIG.machineGunAlignTolerance, true, ctx);
    } else {
      this.hunt(tank, centre, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, false, ctx);
    }
  }

  private attack(tank: EnemyTank, ctx: AIContext): void {
    const brain = tank.brain;
    const weapon = brain.attackWeapon;
    const target = this.attackPoint(tank, brain.attackTarget, ctx);
    const machineGun = weapon === 'machineGun';
    const siegeRange = AI_CONFIG.baseAttackRange * Math.min(1, ctx.aggression);
    const range = machineGun ? MACHINE_GUN_CONFIG.range : brain.attackTarget === 'base' ? siegeRange : AI_CONFIG.attackRange;
    const tolerance = brain.attackTarget === 'soldier' ? AI_CONFIG.machineGunAlignTolerance : AI_CONFIG.alignTolerance;
    const direction = target ? this.lineOfFire(tank, target, range, tolerance, ctx, brain.attackTarget !== 'base') : null;
    const duration = machineGun ? AI_CONFIG.machineGunBurst : AI_CONFIG.attackDuration;
    if (!direction || brain.stateTime > duration) {
      const hunting = brain.attackTarget === 'player' || brain.attackTarget === 'soldier';
      brain.enter(this.homeState(tank, hunting));
      brain.decisionTimer = 0;
      return;
    }
    const aimed = brain.stateTime >= AI_CONFIG.aimDelay && tank.direction === direction;
    tank.intent.direction = direction;
    tank.intent.move = false;
    tank.intent.fire = aimed && !machineGun;
    tank.intent.fireSecondary = aimed && machineGun;
  }

  /**
   * Guard duty: hold a post around the HQ, watching the approach, and move to another now and
   * then. Anything that lines up in front gets shot: crews with the machine gun, tanks with the
   * cannon. Guards do not chase; the alarm brings defenders for that.
   */
  private guard(tank: EnemyTank, dt: number, ctx: AIContext): void {
    const brain = tank.brain;
    const hq = ctx.hq;
    if (!hq) {
      brain.role = 'raider';
      brain.enter('PATROL');
      return;
    }
    const soldier = this.visibleSoldier(tank, ctx);
    if (soldier && this.lineOfFire(tank, soldier.center, MACHINE_GUN_CONFIG.range, AI_CONFIG.machineGunAlignTolerance, ctx)) {
      this.startAttack(tank, 'soldier', 'machineGun');
      return;
    }
    const player = ctx.playerTank?.operational ? ctx.playerTank : null;
    if (
      player &&
      ctx.perception.canSpotTank(tank, player, AI_CONFIG.attackRange) &&
      this.lineOfFire(tank, player.center, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, ctx)
    ) {
      this.startAttack(tank, player.manned ? 'player' : 'wreck', 'cannon');
      return;
    }
    brain.postTimer -= dt;
    const atPost = brain.post !== null && this.atPost(tank, brain.post);
    if (!brain.post || (atPost && brain.postTimer <= 0)) {
      brain.post = this.choosePost(tank, hq, ctx);
      brain.postTimer = ctx.rng.range(...ENEMY_BASE_CONFIG.postTime);
      brain.path = [];
      brain.repathTimer = 0;
    }
    const post = brain.post;
    if (!post) {
      tank.intent.move = false;
      return;
    }
    if (this.atPost(tank, post)) {
      tank.intent.direction = this.watchDirection(tank, hq);
      tank.intent.move = false;
      return;
    }
    this.travel(tank, (col, row) => col === post.col && row === post.row, ctx);
  }

  /** While the alarm is up: hunt the intruder down and kill it, knowing where it is. */
  private defend(tank: EnemyTank, ctx: AIContext): void {
    const brain = tank.brain;
    const target = ctx.intruder;
    if (!ctx.alarm || !target) {
      brain.defending = false;
      brain.enter(brain.role === 'guard' ? 'GUARD' : 'PATROL');
      return;
    }
    const centre = target.center;
    if (target.mobility === 'foot') {
      if (this.visibleSoldier(tank, ctx) && this.lineOfFire(tank, centre, MACHINE_GUN_CONFIG.range, AI_CONFIG.machineGunAlignTolerance, ctx)) {
        this.startAttack(tank, 'soldier', 'machineGun');
        return;
      }
      this.hunt(tank, centre, MACHINE_GUN_CONFIG.range, AI_CONFIG.machineGunAlignTolerance, true, ctx);
      return;
    }
    const manned = (target as Tank).manned;
    if (this.lineOfFire(tank, centre, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, ctx)) {
      this.startAttack(tank, manned ? 'player' : 'wreck', 'cannon');
      return;
    }
    this.hunt(tank, centre, AI_CONFIG.attackRange, AI_CONFIG.alignTolerance, false, ctx);
  }

  private atPost(tank: EnemyTank, post: TilePoint): boolean {
    return Math.abs(tank.x - post.col * TILE_SIZE) < 2 && Math.abs(tank.y - post.row * TILE_SIZE) < 2;
  }

  /** A guard faces away from the HQ, out over the ground an attacker has to cross. */
  private watchDirection(tank: EnemyTank, hq: Vec): Direction {
    const c = tank.center;
    const dx = c.x - hq.x;
    const dy = c.y - hq.y;
    if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 'down' : 'up';
    return dx >= 0 ? 'right' : 'left';
  }

  /** A reachable spot near the HQ, clear of other tanks and of the crews' own mines. */
  private choosePost(tank: EnemyTank, hq: Vec, ctx: AIContext): TilePoint | null {
    const [near, far] = ENEMY_BASE_CONFIG.postRange;
    const others = ctx.tanks.filter((other) => other !== tank && other.active);
    const spots: TilePoint[] = [];
    for (const key of reachableTiles(ctx.map, tileOf(tank), 2, tank.mobility).keys()) {
      const col = key % ctx.map.cols;
      const row = Math.floor(key / ctx.map.cols);
      const box = { x: col * TILE_SIZE, y: row * TILE_SIZE, w: tank.w, h: tank.h };
      const d = distance({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, hq);
      if (d < near || d > far) continue;
      if (others.some((other) => rectsOverlapLoose(other, box)) || ctx.ownMines.some((mine) => rectsOverlapLoose(mine, box))) continue;
      spots.push({ col, row });
    }
    return spots.length > 0 ? ctx.rng.pick(spots) : null;
  }

  /** Follows a planned route to the first tile satisfying `isGoal`, with the usual detours. */
  private travel(tank: EnemyTank, isGoal: (col: number, row: number) => boolean, ctx: AIContext): void {
    this.followRoute(tank, isGoal, ctx);
  }

  private changeDirection(tank: EnemyTank, ctx: AIContext): void {
    const brain = tank.brain;
    const chasing = brain.resumeState === 'CHASE';
    let target: Vec | null = null;
    if (chasing) target = (brain.chaseTarget === 'soldier' ? ctx.playerSoldier?.center : ctx.playerTank?.center) ?? null;
    else if (ctx.base && ctx.rng.chance(tank.profile.baseBias * ctx.aggression)) target = ctx.base;
    brain.siege = !chasing && target !== null;
    const direction = this.chooseDirection(tank, target, ctx);
    const [min, max] = chasing ? AI_CONFIG.chaseDecisionInterval : AI_CONFIG.decisionInterval;
    brain.decisionTimer = ctx.rng.range(min, max);
    brain.blockedTime = 0;
    brain.enter(brain.resumeState === 'CHANGE_DIRECTION' ? 'PATROL' : brain.resumeState);
    tank.intent.direction = direction;
    tank.intent.move = true;
  }

  /** Some hunters plan their approach, others charge in; tougher levels field more planners. */
  private startChase(tank: EnemyTank, target: 'player' | 'soldier', ctx: AIContext): void {
    tank.brain.chaseTarget = target;
    tank.brain.tactical = ctx.rng.chance(AI_CONFIG.tacticalBase + AI_CONFIG.tacticalPerAggression * ctx.aggression);
    tank.brain.enter('CHASE');
    tank.brain.decisionTimer = 0;
  }

  private startAttack(tank: EnemyTank, target: AITarget, weapon: WeaponKind): void {
    tank.brain.attackTarget = target;
    tank.brain.attackWeapon = weapon;
    tank.brain.enter('ATTACK');
  }

  private attackPoint(tank: EnemyTank, target: AITarget, ctx: AIContext): Vec | null {
    switch (target) {
      case 'player':
        return ctx.playerTank?.manned ? ctx.playerTank.center : null;
      case 'soldier':
        return this.visibleSoldier(tank, ctx)?.center ?? null;
      case 'wreck':
        return ctx.playerTank && !ctx.playerTank.manned ? ctx.playerTank.center : null;
      case 'base':
        return ctx.base;
    }
  }

  /**
   * True if a shot straight ahead would hit the base (or the wall right around it). Unless the tank
   * has decided to besiege the base, it holds fire rather than knocking it out by accident.
   */
  private facingBase(tank: EnemyTank, ctx: AIContext): boolean {
    // Never into the walls of their own HQ; into the player's base only when besieging it.
    if (ctx.hq && this.facing(tank, ctx.hq, HQ_CAUTION_RANGE, 2 * TILE_SIZE + SHELL_BLAST_HALF_WIDTH)) return true;
    if (!ctx.base || tank.brain.siege) return false;
    return this.facing(tank, ctx.base, BASE_CAUTION_RANGE, TILE_SIZE + SHELL_BLAST_HALF_WIDTH);
  }

  /** True if a shot straight ahead would pass within `width` of `point`, no further than `range`. */
  private facing(tank: EnemyTank, point: Vec, range: number, width: number): boolean {
    const c = tank.center;
    const v = DIRECTION_VECTORS[tank.direction];
    const ahead = (point.x - c.x) * v.x + (point.y - c.y) * v.y;
    const across = Math.abs((point.x - c.x) * v.y) + Math.abs((point.y - c.y) * v.x);
    return ahead > 0 && ahead <= range && across <= width;
  }

  /** The player's crew member, if this tank can actually see them. */
  private visibleSoldier(tank: Tank, ctx: AIContext): Soldier | null {
    const soldier = ctx.playerSoldier;
    if (!soldier?.onFoot) return null;
    if (distance(tank.center, soldier.center) > AI_CONFIG.soldierDetectRange) return null;
    return ctx.perception.canSeeSoldier(tank, soldier) ? soldier : null;
  }

  /**
   * Plans a route to the nearest firing lane on the target (or, for crews on foot, right over
   * them), blasting through bricks on the way. Another tank in the way triggers a short detour.
   */
  private hunt(tank: EnemyTank, target: Vec, range: number, tolerance: number, crush: boolean, ctx: AIContext): void {
    this.followRoute(tank, (col, row) => this.isFiringPosition((col + 1) * TILE_SIZE, (row + 1) * TILE_SIZE, target, range, tolerance, crush, ctx), ctx);
  }

  /**
   * Plans (and periodically replans) a route to the first tile satisfying `isGoal` and drives it,
   * blasting through bricks on the way and stepping around wrecks and the crews' own mines.
   */
  private followRoute(tank: EnemyTank, isGoal: (col: number, row: number) => boolean, ctx: AIContext): void {
    const brain = tank.brain;
    const stuck = brain.blockedTime >= BLOCKED_PATIENCE && !ctx.collision.destructibleAhead(tank, tank.direction);
    if (brain.detourTime > 0 || stuck) {
      if (brain.detourTime <= 0) {
        brain.detourTime = ctx.rng.range(0.5, 1.1);
        brain.detourDirection = this.chooseDirection(tank, null, ctx);
        brain.blockedTime = 0;
        brain.repathTimer = brain.detourTime;
      }
      tank.intent.direction = brain.detourDirection;
      tank.intent.move = !this.mustBrake(tank, ctx);
      return;
    }
    if (brain.repathTimer <= 0) {
      brain.repathTimer = AI_CONFIG.repathInterval;
      brain.path =
        findPath(ctx.map, {
          start: tileOf(tank),
          size: 2,
          mobility: tank.mobility,
          brickCost: AI_CONFIG.brickPathCost,
          obstacles: [...ctx.tanks.filter((other) => other !== tank && other.active && !other.manned), ...ctx.ownMines],
          isGoal,
        }) ?? [];
    }
    const steering = steerVehicle(tank, brain.path, ctx.map);
    if (!steering) {
      if (this.handleObstacle(tank, ctx) === 'clear') this.drive(tank, false, ctx);
      return;
    }
    const { direction } = steering;
    tank.intent.direction = direction;
    tank.intent.move = steering.move && !(tank.direction === direction && this.mustBrake(tank, ctx));
    tank.intent.fire = tank.blocked && tank.direction === direction && ctx.collision.destructibleAhead(tank, direction) && !this.facingBase(tank, ctx);
  }

  /** True if a tank centred at (x, y) could shoot the target from there (or roll over it). */
  private isFiringPosition(x: number, y: number, target: Vec, range: number, tolerance: number, crush: boolean, ctx: AIContext): boolean {
    const dx = Math.abs(x - target.x);
    const dy = Math.abs(y - target.y);
    if (crush && dx <= TILE_SIZE && dy <= TILE_SIZE) return true;
    if ((dx > tolerance && dy > tolerance) || Math.hypot(dx, dy) > range) return false;
    return ctx.collision.hasLineOfFire({ x, y }, target, true);
  }

  /**
   * Reacts to being stuck or bored. A tank blocked by bricks may decide to blast its way
   * through instead of turning away.
   */
  private handleObstacle(tank: EnemyTank, ctx: AIContext): 'clear' | 'digging' | 'turning' {
    const brain = tank.brain;
    const mayShoot = !this.facingBase(tank, ctx);
    if (brain.digTime > 0) {
      this.drive(tank, mayShoot, ctx);
      return 'digging';
    }
    const stuck = brain.blockedTime >= BLOCKED_PATIENCE;
    if (!stuck && brain.decisionTimer > 0) return 'clear';
    if (stuck && mayShoot && ctx.collision.destructibleAhead(tank, tank.direction) && ctx.rng.chance(AI_CONFIG.blockedFireChance)) {
      brain.digTime = DIG_DURATION;
      brain.blockedTime = 0;
      this.drive(tank, true, ctx);
      return 'digging';
    }
    brain.enter('CHANGE_DIRECTION');
    tank.intent.move = false;
    return 'turning';
  }

  /**
   * Drives straight on. A driver who sees something solid ahead within stopping distance lets off
   * and rolls up to it at a crawl, rather than ramming it at full speed.
   */
  private drive(tank: EnemyTank, fire: boolean, ctx: AIContext): void {
    tank.intent.direction = tank.direction;
    tank.intent.fire = fire;
    if (this.mineAhead(tank, ctx)) {
      // A mine of our own ahead: stop and pick another way.
      tank.intent.move = false;
      tank.brain.blockedTime = BLOCKED_PATIENCE;
      return;
    }
    tank.intent.move = !this.mustBrake(tank, ctx);
  }

  private mineAhead(tank: EnemyTank, ctx: AIContext): boolean {
    if (ctx.ownMines.length === 0) return false;
    return ctx.collision.travelDistance(tank, tank.direction, MINE_LOOKAHEAD, tank.mobility, ctx.ownMines) < MINE_LOOKAHEAD;
  }

  private mustBrake(tank: EnemyTank, ctx: AIContext): boolean {
    const v = DIRECTION_VECTORS[tank.direction];
    const speed = tank.velocity.x * v.x + tank.velocity.y * v.y;
    if (speed <= CREEP_SPEED) return false;
    const grip = surfaceProperties(ctx.map.surfaceUnder(tank)).grip;
    const stop = stoppingDistance(speed - CREEP_SPEED, tank.driveTrain.braking, grip);
    const others = ctx.tanks.filter((other) => other !== tank && other.active);
    return ctx.collision.travelDistance(tank, tank.direction, stop + 2, tank.mobility, others) < stop + 1;
  }

  /**
   * If the target sits on the tank's row or column within range and no steel is in the way, the
   * direction to fire. Unless the base is the target, it counts as a wall: enemies hunting the
   * player do not get to hit the base by accident from the player's own spawn row.
   */
  private lineOfFire(tank: Tank, target: Vec, range: number, tolerance: number, ctx: AIContext, blockedByBase = true): Direction | null {
    const c = tank.center;
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    let direction: Direction | null = null;
    if (Math.abs(dx) <= tolerance && Math.abs(dy) <= range) direction = dy < 0 ? 'up' : 'down';
    else if (Math.abs(dy) <= tolerance && Math.abs(dx) <= range) direction = dx < 0 ? 'left' : 'right';
    if (!direction || !ctx.collision.hasLineOfFire(c, target, blockedByBase)) return null;
    return direction;
  }

  /** Weighted choice among open directions, favouring progress towards the target and avoiding U-turns. */
  private chooseDirection(tank: Tank, target: Vec | null, ctx: AIContext): Direction {
    const bodies = [...ctx.tanks.filter((other) => other !== tank), ...ctx.ownMines];
    const centre = tank.center;
    const gapX = target ? target.x - centre.x : 0;
    const gapY = target ? target.y - centre.y : 0;
    const alignAxis = Math.abs(gapX) < Math.abs(gapY) ? 'x' : 'y';

    return ctx.rng.weighted(DIRECTIONS, (direction) => {
      const open = this.isOpen(tank, direction, bodies, ctx.collision);
      let weight = open ? 1 : 0.04;
      if (target) {
        const v = DIRECTION_VECTORS[direction];
        const progress = v.x * gapX + v.y * gapY;
        if (progress > TILE_SIZE / 2) {
          weight += 2.5;
          if ((isVertical(direction) ? 'y' : 'x') === alignAxis) weight += 1.5;
        }
      }
      if (direction === opposite(tank.direction)) weight *= 0.35;
      if (direction === tank.direction && tank.blocked) weight *= 0.1;
      return open ? weight : Math.min(weight, 0.04);
    });
  }

  private isOpen(tank: Tank, direction: Direction, bodies: readonly Rect[], collision: CollisionSystem): boolean {
    const axis = isVertical(direction) ? 'x' : 'y';
    const box = { x: tank.x, y: tank.y, w: tank.w, h: tank.h };
    box[axis] = Math.round(box[axis] / TILE_SIZE) * TILE_SIZE;
    return collision.travelDistance(box, direction, PROBE_DISTANCE, tank.mobility, bodies) >= PROBE_DISTANCE - 1;
  }
}
