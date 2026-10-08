import { removeInactive } from '../core/collections';
import { distance, rectsOverlap, type Direction, type Rect, type Vec } from '../core/geometry';
import { Random } from '../core/Random';
import type { Bullet } from '../entities/Bullet';
import type { WeaponKind } from '../entities/components/Weapon';
import { EnemyTank } from '../entities/EnemyTank';
import type { Mine } from '../entities/Mine';
import { PlayerTank } from '../entities/PlayerTank';
import { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import type { Team, Unit } from '../entities/Unit';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem, type CombatListener } from '../systems/CombatSystem';
import { CrewSystem } from '../systems/CrewSystem';
import { EnemyAISystem } from '../systems/EnemyAISystem';
import { GarrisonSystem } from '../systems/GarrisonSystem';
import { InfantryAISystem } from '../systems/InfantryAISystem';
import { MineSystem, type MineListener } from '../systems/MineSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { Perception } from '../systems/Perception';
import { PowerUpSystem } from '../systems/PowerUpSystem';
import { RepairSystem, type RepairListener } from '../systems/RepairSystem';
import { awardEnemyKill } from '../systems/ScoreSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { SupplySystem } from '../systems/SupplySystem';
import type { ParsedLevel } from '../world/Level';
import { TileMap } from '../world/TileMap';
import type { BattleEvent } from './BattleEvents';
import {
  BATTLE_CONFIG,
  ENEMY_BASE_CONFIG,
  MINE_CONFIG,
  PHYSICS_CONFIG,
  PLAYER_CONFIG,
  REPAIR_CONFIG,
  ROCKET_CONFIG,
  SCORE_CONFIG,
  SHELL_PERSONNEL_DAMAGE,
  SOLDIER_CONFIG,
  TILE_SIZE,
  type EnemyKind,
} from './GameConfig';
import type { Session } from './Session';

export type BattleResult = 'victory' | 'defeat';
export type DefeatReason = 'base' | 'lives';
/** cleared: every enemy beaten; hq: the enemy headquarters destroyed. */
export type VictoryReason = 'cleared' | 'hq';

export interface PlayerCommand {
  readonly direction: Direction | null;
  /** Cannon in a tank; the anti-tank rocket on foot. */
  readonly fire: boolean;
  /** Machine gun in a tank; plant a mine on foot. */
  readonly fireSecondary: boolean;
  /** Get out of the tank, or into one when standing next to it. */
  readonly use: boolean;
}

export const NO_COMMAND: PlayerCommand = { direction: null, fire: false, fireSecondary: false, use: false };

export interface BattleOptions {
  readonly level: ParsedLevel;
  readonly session: Session;
  readonly rng?: Random;
  /** Tests switch the AI off to stage precise situations. */
  readonly aiEnabled?: boolean;
}

/** One level in progress: owns the live map and entities and runs the systems in order each tick. */
export class Battle implements CombatListener, RepairListener, MineListener {
  readonly level: ParsedLevel;
  readonly session: Session;
  readonly map: TileMap;
  readonly rng: Random;
  /** Every enemy tank on the field, wrecks included. */
  readonly enemies: EnemyTank[] = [];
  /** Crew members currently on foot, both sides. */
  readonly soldiers: Soldier[] = [];
  readonly shells: Bullet[] = [];
  readonly spawner: SpawnSystem;
  readonly powerUps: PowerUpSystem;
  readonly repairs: RepairSystem;
  readonly supplies: SupplySystem;
  readonly minefield: MineSystem;
  readonly garrison: GarrisonSystem;
  readonly crew: CrewSystem;
  /** Enemy tanks knocked out, by type. */
  readonly kills: Record<EnemyKind, number> = { basic: 0, fast: 0, heavy: 0 };
  crewKills = 0;
  wrecksDestroyed = 0;

  /** The player's tank in any condition: manned, empty or wrecked. */
  playerTank: PlayerTank | null = null;
  /** The player's crew member, inside a tank or on foot; null while waiting to respawn. */
  playerCrew: Soldier | null = null;
  time = 0;
  outcome: BattleResult | null = null;
  defeatReason: DefeatReason | null = null;
  victoryReason: VictoryReason | null = null;
  /** Up while the enemy HQ is threatened: its defenders drop everything to hunt the intruder. */
  enemyAlarm = false;
  private alarmTimer = 0;
  respawnTimer: number | null = null;
  replacementTimer: number | null = null;

  private readonly events: BattleEvent[] = [];
  private readonly collision: CollisionSystem;
  private readonly perception: Perception;
  private readonly movement: MovementSystem;
  private readonly combat: CombatSystem;
  private readonly tankAI = new EnemyAISystem();
  private readonly infantryAI = new InfantryAISystem();
  private readonly aiEnabled: boolean;
  /** Enemy spawn areas, where retreating enemy crews leave the field. */
  private readonly exits: readonly Rect[];
  private wrenchTimer: number = REPAIR_CONFIG.playerWrenchDelay;
  private endTimer = 0;

  constructor(options: BattleOptions) {
    this.level = options.level;
    this.session = options.session;
    this.rng = options.rng ?? new Random();
    this.aiEnabled = options.aiEnabled ?? true;
    this.map = new TileMap(this.level.cols, this.level.rows, this.level.tiles, this.level.base, this.level.surfaces, this.level.enemyBase);
    this.collision = new CollisionSystem(this.map);
    this.perception = new Perception(this.map, this.level.night);
    this.movement = new MovementSystem(this.collision);
    this.combat = new CombatSystem(this.map, this.collision, this.events, this);
    this.crew = new CrewSystem(this.collision, this.events);
    this.repairs = new RepairSystem(this.map, this.rng, this.events, this.crew);
    this.supplies = new SupplySystem(this.map, this.rng, this.events);
    this.minefield = new MineSystem(this.events);
    this.garrison = new GarrisonSystem(this.map, this.collision, this.events);
    this.spawner = new SpawnSystem(this.level);
    this.powerUps = new PowerUpSystem(this.map, this.rng, this.events);
    this.exits = this.level.enemySpawns.map((p) => ({ x: p.col * TILE_SIZE, y: p.row * TILE_SIZE, w: 2 * TILE_SIZE, h: 2 * TILE_SIZE }));
    this.spawnPlayer();
  }

  /** The final result, available once the closing delay has played out. */
  get result(): BattleResult | null {
    return this.outcome && this.endTimer <= 0 ? this.outcome : null;
  }

  /** Seconds left before the result screen once the outcome is decided; null while fighting. */
  get closingIn(): number | null {
    return this.outcome ? Math.max(0, this.endTimer) : null;
  }

  /** Enemies still in the fight: queued, working tanks and crews on foot (who may yet repair a wreck). */
  get enemiesRemaining(): number {
    const tanks = this.enemies.filter((tank) => tank.operational).length;
    const crews = this.soldiers.filter((soldier) => soldier.team === 'enemy').length;
    return this.spawner.pending + tanks + crews;
  }

  get tanks(): Tank[] {
    return this.playerTank ? [this.playerTank, ...this.enemies] : [...this.enemies];
  }

  /** The player's crew member while out of the tank. */
  get playerOnFoot(): Soldier | null {
    return this.playerCrew?.onFoot ? this.playerCrew : null;
  }

  /** Centre of the base while it still stands. */
  get baseTarget(): Vec | null {
    const base = this.map.base;
    if (!base || base.destroyed) return null;
    return { x: (base.col + 1) * TILE_SIZE, y: (base.row + 1) * TILE_SIZE };
  }

  /** Centre of the enemy HQ while it stands. */
  get enemyBaseTarget(): Vec | null {
    const hq = this.map.enemyBase;
    if (!hq || hq.destroyed) return null;
    return { x: (hq.col + 1) * TILE_SIZE, y: (hq.row + 1) * TILE_SIZE };
  }

  /** The player's unit the HQ's defenders go after: the crew if on foot, otherwise the tank. */
  get intruder(): Tank | Soldier | null {
    if (this.playerOnFoot) return this.playerOnFoot;
    return this.playerTank?.operational ? this.playerTank : null;
  }

  drainEvents(): BattleEvent[] {
    return this.events.splice(0);
  }

  update(dt: number, command: PlayerCommand): void {
    this.time += dt;
    if (this.outcome) this.endTimer -= dt;
    this.updateSpawning(dt);
    this.updateAlarm(dt);

    const tanks = this.tanks;
    for (const tank of tanks) tank.tick(dt);
    for (const soldier of this.soldiers) soldier.tick(dt);
    this.perception.update(tanks.filter((tank) => tank.disabled));

    this.applyPlayerCommand(this.outcome === 'defeat' ? NO_COMMAND : command);
    if (this.aiEnabled) {
      this.tankAI.update(dt, this.enemies, {
        playerTank: this.playerTank,
        playerSoldier: this.playerOnFoot,
        base: this.baseTarget,
        map: this.map,
        collision: this.collision,
        perception: this.perception,
        tanks,
        rng: this.rng,
        aggression: this.level.aggression,
        hq: this.enemyBaseTarget,
        alarm: this.enemyAlarm,
        intruder: this.intruder,
        ownMines: this.minefield.mines.filter((mine) => mine.team === 'enemy'),
      });
      this.infantryAI.update(dt, this.soldiers, {
        map: this.map,
        crew: this.crew,
        perception: this.perception,
        tanks,
        playerTank: this.playerTank,
        hq: this.enemyBaseTarget,
        crates: this.supplies.crates,
        mines: this.minefield.mines,
        rng: this.rng,
        wrenches: this.repairs.wrenches,
        exits: this.exits,
        onEscaped: (soldier) => this.escape(soldier),
        onAimRocket: (soldier) => this.events.push({ type: 'rocketAiming', x: soldier.center.x, y: soldier.center.y, team: soldier.team }),
      });
    }
    this.handleCrewActions();

    const movers = [...tanks.filter((tank) => tank.manned), ...this.soldiers.filter((soldier) => soldier.onFoot)];
    this.movement.update(dt, movers, tanks);
    this.reportImpacts(tanks);
    for (const { victim, tank } of this.crew.crushed(tanks, this.soldiers)) this.killSoldier(victim, tank, 'crushed');
    if (!this.outcome) this.garrison.update(dt, this.shells, this.playerTank, this.playerOnFoot);
    this.combat.update(dt, tanks, this.soldiers, this.shells);
    this.minefield.update(dt, this.tanks, this);
    this.repairs.update(dt, this.soldiers, tanks, this);
    this.supplies.update(dt, this.soldiers, this.supplyOrigins(), this.baseArea());
    removeInactive(this.enemies);
    removeInactive(this.soldiers);
    this.powerUps.update(dt, this.playerTank?.manned ? this.playerTank : null, this.session);

    if (!this.outcome && this.spawner.exhausted && this.enemiesRemaining === 0) this.declare('victory', 'cleared');
  }

  /** Adds an enemy tank with its crew aboard. */
  addEnemy(kind: EnemyKind, x: number, y: number, options: { carrier?: boolean; direction?: Direction } = {}): EnemyTank {
    const enemy = new EnemyTank(kind, x, y, options.direction ?? 'down', options.carrier ?? false);
    this.seat(new Soldier('enemy', x, y), enemy);
    this.enemies.push(enemy);
    return enemy;
  }

  /** Exposed so tests and future weapons (grenades, rockets) share the same damage rules. */
  damageTank(tank: Tank, amount: number, attacker: Unit): void {
    this.combat.applyDamage(tank, amount, attacker);
  }

  damageSoldier(soldier: Soldier, amount: number, attacker: Unit | null): void {
    this.combat.applyPersonnelDamage(soldier, amount, attacker);
  }

  fire(tank: Tank, weapon: WeaponKind = 'cannon'): Bullet | null {
    return this.combat.tryFire(tank, this.shells, weapon);
  }

  onTankDisabled(tank: Tank, attacker: Unit): void {
    this.knockOut(tank, attacker, true);
  }

  /** Rockets: the hull is destroyed on the spot, and nobody inside gets out. */
  onTankDestroyedOutright(tank: Tank, attacker: Unit): void {
    if (!tank.active) return;
    const points = tank.operational ? this.knockOut(tank, attacker, false) : 0;
    tank.active = false;
    this.onTankDestroyed(tank, attacker, points);
  }

  /** Every rocket fired calls in a fresh one somewhere on the map. */
  onRocketFired(soldier: Soldier): void {
    this.supplies.drop('rocket', soldier, this.baseArea());
  }

  /**
   * A mine goes off under a tank. The blast rips the tracks off and knocks the hull out (the crew
   * bails out, shaken but alive), and leaves the wreck badly weakened. Crews on foot nearby die.
   */
  onMineDetonated(mine: Mine, tank: Tank): void {
    const c = mine.center;
    this.events.push({ type: 'mineExploded', x: c.x, y: c.y });
    for (const soldier of [...this.soldiers]) {
      if (soldier.onFoot && Math.hypot(soldier.center.x - c.x, soldier.center.y - c.y) <= MINE_CONFIG.splashRadius) {
        this.combat.applyPersonnelDamage(soldier, SHELL_PERSONNEL_DAMAGE, mine.owner);
      }
    }
    if (tank.operational) {
      if (tank.invulnerable) return;
      this.combat.applyDamage(tank, tank.health.max, mine.owner);
    }
    if (tank.disabled) this.combat.applyDamage(tank, MINE_CONFIG.wreckDamage, mine.owner);
  }

  /** Disables a tank and scores it. With `bailOut` the crew climbs out and a wrench is dropped. */
  private knockOut(tank: Tank, attacker: Unit, bailOut: boolean): number {
    const c = tank.center;
    tank.disable();
    if (bailOut) for (const member of [...tank.crew.members]) this.leaveTank(member, tank, 'bailOut');

    let points = 0;
    if (tank instanceof EnemyTank) {
      this.kills[tank.kind]++;
      if (attacker.team === 'player') points = awardEnemyKill(this.session, tank.kind);
      if (tank.carrier) {
        tank.carrier = false;
        this.powerUps.spawnRandom(this.powerUpExclusions());
      }
    }
    if (!bailOut) return points;
    const kind = tank instanceof EnemyTank ? tank.kind : 'player';
    this.events.push({ type: 'tankDisabled', x: c.x, y: c.y, team: tank.team, kind, points });
    this.repairs.spawnWrench(tank, this.baseArea());
    return points;
  }

  /** `extraPoints` carries the kill score when a working tank was destroyed in one blow. */
  onTankDestroyed(tank: Tank, attacker: Unit, extraPoints = 0): void {
    const c = tank.center;
    for (const member of tank.crew.clear()) {
      member.vehicle = null;
      member.x = c.x - member.w / 2;
      member.y = c.y - member.h / 2;
      this.killSoldier(member, attacker, 'shot');
    }

    let points = extraPoints;
    if (tank instanceof EnemyTank) {
      this.wrecksDestroyed++;
      if (attacker.team === 'player') {
        points += SCORE_CONFIG.wreck;
        this.session.addScore(SCORE_CONFIG.wreck);
      }
    }
    const kind = tank instanceof EnemyTank ? tank.kind : 'player';
    this.events.push({ type: 'tankDestroyed', x: c.x, y: c.y, team: tank.team, kind, points });

    if (tank === this.playerTank) {
      this.playerTank = null;
      if (this.playerCrew?.alive) this.replacementTimer = REPAIR_CONFIG.replacementDelay;
    }
  }

  onSoldierKilled(soldier: Soldier, attacker: Unit | null, cause: 'shot' | 'crushed'): void {
    this.killSoldier(soldier, attacker, cause);
  }

  onRepaired(tank: Tank, mechanic: Soldier): void {
    this.boardTank(mechanic, tank);
  }

  onBaseHit(team: Team = 'player', hits = 1): void {
    const base = this.map.baseOf(team);
    if (!base || this.outcome === 'victory') return;
    if (team === 'enemy' && this.outcome) return;
    const result = this.map.damageBase(team, hits);
    const x = (base.col + 1) * TILE_SIZE;
    const y = (base.row + 1) * TILE_SIZE;
    if (team === 'enemy') {
      this.alarmTimer = ENEMY_BASE_CONFIG.alarmMemory;
      if (result === 'damaged') this.events.push({ type: 'enemyBaseHit', x, y, health: base.health, maxHealth: base.maxHealth });
      if (result !== 'destroyed') return;
      this.events.push({ type: 'enemyBaseDestroyed', x, y });
      this.declare('victory', 'hq');
      return;
    }
    if (result === 'damaged') this.events.push({ type: 'baseHit', x, y, health: base.health });
    if (result !== 'destroyed') return;
    this.events.push({ type: 'baseDestroyed', x, y });
    if (!this.outcome) this.declare('defeat', 'base');
  }

  private applyPlayerCommand(command: PlayerCommand): void {
    const crew = this.playerCrew;
    if (!crew?.alive) return;
    const intent = {
      direction: command.direction,
      move: command.direction !== null,
      fire: command.fire,
      fireSecondary: command.fireSecondary,
      use: command.use,
    };
    if (crew.vehicle) crew.vehicle.intent = intent;
    else crew.intent = intent;
  }

  /** Carries out requests to get out of or into a tank. */
  private handleCrewActions(): void {
    for (const tank of this.tanks) {
      if (!tank.manned || !tank.intent.use) continue;
      tank.intent.use = false;
      const driver = tank.crew.operator('driver');
      if (driver) this.leaveTank(driver, tank, 'exit');
    }
    for (const soldier of this.soldiers) {
      if (soldier.onFoot && soldier.intent.fireSecondary) this.minefield.plant(soldier);
    }
    for (const soldier of [...this.soldiers]) {
      if (!soldier.onFoot || !soldier.intent.use) continue;
      soldier.intent.use = false;
      const tank = this.tanks.find((candidate) => this.crew.canBoard(soldier, candidate));
      if (tank) this.boardTank(soldier, tank);
    }
  }

  private leaveTank(soldier: Soldier, tank: Tank, reason: 'exit' | 'bailOut'): void {
    // A driver stops before climbing out; a knocked-out hull has already stopped.
    tank.halt();
    if (!this.crew.disembark(soldier, tank, this.tanks, reason)) return;
    soldier.brain.enter('BAIL_OUT');
    soldier.brain.hidden = 0;
    if (reason === 'bailOut') {
      soldier.cover = SOLDIER_CONFIG.bailOutCover;
      // The crew grabs the tank's anti-tank launcher on the way out.
      const chance = ROCKET_CONFIG.enemyCarryChance + ROCKET_CONFIG.enemyCarryPerAggression * this.level.aggression;
      if (soldier.canCarryRocket && (soldier.team === 'player' || this.rng.chance(chance))) soldier.rockets++;
    }
    this.soldiers.push(soldier);
  }

  /** Collisions hard enough to be felt are reported, for sound and shake. */
  private reportImpacts(tanks: readonly Tank[]): void {
    for (const tank of tanks) {
      if (tank.impact < PHYSICS_CONFIG.impactThreshold) continue;
      const c = tank.center;
      this.events.push({ type: 'tankImpact', x: c.x, y: c.y, speed: tank.impact, team: tank.team });
    }
  }

  private boardTank(soldier: Soldier, tank: Tank): void {
    if (!this.crew.board(soldier, tank)) return;
    const index = this.soldiers.indexOf(soldier);
    if (index >= 0) this.soldiers.splice(index, 1);
    if (tank instanceof EnemyTank) tank.brain.enter('PATROL');
  }

  /** Puts a crew member straight into a tank, for spawning. */
  private seat(soldier: Soldier, tank: Tank): void {
    tank.crew.add(soldier);
    soldier.vehicle = tank;
    soldier.home = tank;
  }

  private killSoldier(soldier: Soldier, attacker: Unit | null, cause: 'shot' | 'crushed'): void {
    if (!soldier.active) return;
    soldier.active = false;
    soldier.vehicle?.crew.remove(soldier);
    soldier.vehicle = null;

    let points = 0;
    if (soldier.team === 'enemy') {
      this.crewKills++;
      if (attacker?.team === 'player') {
        points = SCORE_CONFIG.crewKill;
        this.session.addScore(points);
      }
    }
    const c = soldier.center;
    this.events.push({ type: 'soldierKilled', x: c.x, y: c.y, team: soldier.team, direction: soldier.direction, cause, points });
    if (soldier === this.playerCrew) {
      this.playerCrew = null;
      this.loseLife();
    }
  }

  /** An enemy crew that made it back to its own lines leaves the battle, unscored. */
  private escape(soldier: Soldier): void {
    soldier.active = false;
    const c = soldier.center;
    this.events.push({ type: 'crewEscaped', x: c.x, y: c.y, team: soldier.team });
  }

  /** A life is a crew: it is lost when the player's crew member dies, not when the tank does. */
  private loseLife(): void {
    if (this.outcome) return;
    this.session.lives = Math.max(0, this.session.lives - 1);
    if (this.session.lives > 0) this.respawnTimer = PLAYER_CONFIG.respawnDelay;
    else this.declare('defeat', 'lives');
  }

  private updateSpawning(dt: number): void {
    if (this.respawnTimer !== null) {
      this.respawnTimer -= dt;
      // An enemy parked on the spawn point delays the respawn until it moves on.
      if (this.respawnTimer <= 0 && this.spawnPlayer()) this.respawnTimer = null;
    }
    if (this.replacementTimer !== null) {
      this.replacementTimer -= dt;
      if (this.replacementTimer <= 0 && this.spawnReplacement()) this.replacementTimer = null;
    }
    this.offerWrench(dt);
    if (this.outcome) return;

    // Crews on foot do not hold back reinforcements; only working tanks count towards the cap.
    const active = this.enemies.filter((tank) => tank.operational).length;
    const surge = this.enemyAlarm;
    const { opened, spawned } = this.spawner.update(dt * (surge ? ENEMY_BASE_CONFIG.surge : 1), active, this.tanks, surge ? ENEMY_BASE_CONFIG.surgeTanks : 0);
    for (const portal of opened) {
      this.events.push({ type: 'enemyIncoming', x: portal.x + TILE_SIZE, y: portal.y + TILE_SIZE });
    }
    for (const order of spawned) {
      this.addEnemy(order.entry.kind, order.x, order.y, { carrier: order.entry.carrier });
    }
  }

  /** A stranded player crew always gets a way back: if no wrench is left on the map, a new one appears. */
  private offerWrench(dt: number): void {
    const crew = this.playerOnFoot;
    const stranded = crew && !crew.carryingWrench && this.playerTank?.disabled && this.repairs.wrenches.length === 0;
    if (!stranded || !this.playerTank) {
      this.wrenchTimer = REPAIR_CONFIG.playerWrenchDelay;
      return;
    }
    this.wrenchTimer -= dt;
    if (this.wrenchTimer > 0) return;
    this.wrenchTimer = REPAIR_CONFIG.playerWrenchDelay;
    this.repairs.spawnWrench(this.playerTank, this.baseArea());
  }

  /** A fresh crew in a fresh tank at the spawn point. Returns false if the spot is occupied. */
  private spawnPlayer(): boolean {
    const tank = this.newPlayerTank();
    if (!tank) return true;
    if (this.enemies.some((enemy) => rectsOverlap(enemy, tank))) return false;
    if (this.playerTank) this.playerTank.active = false;
    const crew = new Soldier('player', tank.x, tank.y);
    this.seat(crew, tank);
    tank.effects.add('shield', PLAYER_CONFIG.spawnShield);
    this.playerTank = tank;
    this.playerCrew = crew;
    this.replacementTimer = null;
    const c = tank.center;
    this.events.push({ type: 'playerSpawned', x: c.x, y: c.y });
    return true;
  }

  /** An empty tank waiting at the spawn point for a crew whose own tank was destroyed. */
  private spawnReplacement(): boolean {
    if (!this.playerCrew?.alive) return true;
    const tank = this.newPlayerTank();
    if (!tank) return true;
    if (this.tanks.some((other) => rectsOverlap(other, tank))) return false;
    this.playerTank = tank;
    const c = tank.center;
    this.events.push({ type: 'replacementTank', x: c.x, y: c.y });
    return true;
  }

  private newPlayerTank(): PlayerTank | null {
    const spawn = this.level.playerSpawn;
    return spawn ? new PlayerTank(spawn.col * TILE_SIZE, spawn.row * TILE_SIZE) : null;
  }

  private declare(result: 'victory', reason: VictoryReason): void;
  private declare(result: 'defeat', reason: DefeatReason): void;
  private declare(result: BattleResult, reason: DefeatReason | VictoryReason): void {
    this.outcome = result;
    if (result === 'victory') this.victoryReason = reason as VictoryReason;
    else this.defeatReason = reason as DefeatReason;
    this.enemyAlarm = false;
    this.endTimer = BATTLE_CONFIG.endDelay;
    this.events.push({ type: 'outcome', result });
    if (result === 'victory') {
      for (const shell of this.shells) if (shell.team === 'enemy') shell.active = false;
      if (this.playerTank?.operational) this.playerTank.effects.add('shield', BATTLE_CONFIG.endDelay + 1);
    }
  }

  /** Ground around both bases where nothing gets dropped: the fortifications. */
  private baseArea(): Rect[] {
    const areas: Rect[] = [];
    for (const base of [this.map.base, this.map.enemyBase]) {
      if (base) areas.push({ x: (base.col - 2) * TILE_SIZE, y: (base.row - 2) * TILE_SIZE, w: 6 * TILE_SIZE, h: 6 * TILE_SIZE });
    }
    return areas;
  }

  /** Mine crates are dropped by turns near the player and on the approaches to the enemy HQ. */
  private supplyOrigins(): Rect[] {
    const origins: Rect[] = [];
    const player = this.playerOnFoot ?? this.playerTank;
    if (player) origins.push(player);
    const hq = this.map.enemyBase;
    if (hq && !hq.destroyed) origins.push({ x: (hq.col - 3) * TILE_SIZE, y: (hq.row + 4) * TILE_SIZE, w: 8 * TILE_SIZE, h: TILE_SIZE });
    return origins;
  }

  /**
   * The alarm goes up when the player's tank or crew comes close to the enemy HQ, and stays up for
   * a while after the HQ takes a hit. While it is up, reinforcements are rushed in.
   */
  private updateAlarm(dt: number): void {
    const hq = this.enemyBaseTarget;
    if (!hq || this.outcome) {
      this.enemyAlarm = false;
      return;
    }
    this.alarmTimer = Math.max(0, this.alarmTimer - dt);
    const intruder = this.intruder;
    if (intruder && distance(intruder.center, hq) <= ENEMY_BASE_CONFIG.alarmRadius) this.alarmTimer = Math.max(this.alarmTimer, 2);
    const alarm = this.alarmTimer > 0;
    if (alarm && !this.enemyAlarm) this.events.push({ type: 'enemyAlarm', x: hq.x, y: hq.y });
    this.enemyAlarm = alarm;
  }

  private powerUpExclusions(): Rect[] {
    return this.playerTank ? [this.playerTank, ...this.baseArea()] : this.baseArea();
  }
}
