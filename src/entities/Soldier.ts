import type { Direction } from '../core/geometry';
import { MINE_CONFIG, ROCKET_CONFIG, SHELL_PERSONNEL_DAMAGE, SOLDIER_CONFIG, SOLDIER_SIZE } from '../game/GameConfig';
import type { Mobility } from '../world/Tile';
import { Entity } from './Entity';
import { Health } from './components/Health';
import { Weapon } from './components/Weapon';
import { InfantryBrain } from './InfantryBrain';
import type { Tank } from './Tank';
import { idleIntent, type Mobile, type Team, type UnitIntent } from './Unit';

/** A crew member. Inside a tank it operates it; on foot it is a small, fragile unit of its own. */
export class Soldier extends Entity implements Mobile {
  readonly mobility: Mobility = 'foot';
  readonly health = new Health(SOLDIER_CONFIG.maxHealth);
  readonly speed = SOLDIER_CONFIG.speed;
  /** Only used when the AI controls this soldier. */
  readonly brain = new InfantryBrain();

  direction: Direction = 'down';
  intent: UnitIntent = idleIntent();
  moving = false;
  blocked = false;
  travelled = 0;
  hitFlash = 0;
  /** The tank this soldier is inside, if any. */
  vehicle: Tank | null = null;
  /** The tank this soldier last crewed: the one it tries to get back into. */
  home: Tank | null = null;
  carryingWrench = false;
  /** Anti-tank rockets carried (see ROCKET_CONFIG). */
  rockets = 0;
  /** Anti-tank mines carried, ready to plant. */
  mines = 0;
  /** Seconds until another mine can be planted. */
  plantCooldown = 0;
  readonly launcher = new Weapon({
    projectile: 'rocket',
    fireCooldown: ROCKET_CONFIG.reload,
    maxShells: 1,
    shellSpeed: ROCKET_CONFIG.launchSpeed,
    shellDamage: 0,
    shellTileDamage: ROCKET_CONFIG.tileDamage,
    personnelDamage: SHELL_PERSONNEL_DAMAGE,
    range: ROCKET_CONFIG.range,
  });
  /** Seconds of smoke cover left after bailing out. */
  cover = 0;

  constructor(
    readonly team: Team,
    x = 0,
    y = 0,
  ) {
    super(x, y, SOLDIER_SIZE, SOLDIER_SIZE);
  }

  get alive(): boolean {
    return this.active && !this.health.depleted;
  }

  get onFoot(): boolean {
    return this.alive && this.vehicle === null;
  }

  get canCarryRocket(): boolean {
    return this.rockets < ROCKET_CONFIG.carry;
  }

  get canCarryMine(): boolean {
    return this.mines < MINE_CONFIG.carry;
  }

  tick(dt: number): void {
    this.launcher.update(dt);
    this.plantCooldown = Math.max(0, this.plantCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.cover = Math.max(0, this.cover - dt);
  }
}
