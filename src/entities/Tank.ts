import type { Direction } from '../core/geometry';
import {
  CREW_CAPACITY,
  MACHINE_GUN_CONFIG,
  REPAIR_CONFIG,
  SHELL_PERSONNEL_DAMAGE,
  TANK_SIZE,
  WRECK_CONFIG,
  type TankStats,
} from '../game/GameConfig';
import type { Mobility } from '../world/Tile';
import { Crew } from './Crew';
import { Entity } from './Entity';
import { Health } from './components/Health';
import { StatusEffects } from './components/StatusEffects';
import { Weapon } from './components/Weapon';
import { idleIntent, type DriveTrain, type Team, type UnitIntent, type Vehicle } from './Unit';

/** Shells disable a tank rather than destroy it: the hull stops working and the crew bails out. */
export type TankCondition = 'operational' | 'disabled';

/** A vehicle assembled from components: hull health, wreck integrity, two guns, effects and a crew. */
export abstract class Tank extends Entity implements Vehicle {
  readonly mobility: Mobility = 'tracked';
  readonly health: Health;
  /** How much more a disabled hull can take before it explodes. */
  readonly integrity = new Health(WRECK_CONFIG.integrity);
  readonly cannon: Weapon;
  readonly machineGun: Weapon;
  readonly effects = new StatusEffects();
  readonly crew = new Crew(CREW_CAPACITY);
  readonly speed: number;
  readonly driveTrain: DriveTrain;
  readonly velocity = { x: 0, y: 0 };
  slip = 0;
  impact = 0;

  condition: TankCondition = 'operational';
  /** 0..1 while a crew member with a wrench works on the wreck. */
  repairProgress = 0;
  intent: UnitIntent = idleIntent();
  moving = false;
  blocked = false;
  travelled = 0;
  /** Remaining time of the white hit flash. */
  hitFlash = 0;

  protected constructor(
    readonly team: Team,
    x: number,
    y: number,
    public direction: Direction,
    stats: TankStats,
  ) {
    super(x, y, TANK_SIZE, TANK_SIZE);
    this.health = new Health(stats.maxHealth);
    this.cannon = new Weapon({
      projectile: 'shell',
      fireCooldown: stats.fireCooldown,
      maxShells: stats.maxShells,
      shellSpeed: stats.shellSpeed,
      shellDamage: stats.shellDamage,
      shellTileDamage: stats.shellTileDamage,
      personnelDamage: SHELL_PERSONNEL_DAMAGE,
      range: Number.POSITIVE_INFINITY,
    });
    const gunnerScale = team === 'enemy' ? MACHINE_GUN_CONFIG.enemyCooldownScale : 1;
    this.machineGun = new Weapon({
      projectile: 'bullet',
      ...MACHINE_GUN_CONFIG,
      fireCooldown: MACHINE_GUN_CONFIG.fireCooldown * gunnerScale,
    });
    this.speed = stats.speed;
    this.driveTrain = { acceleration: stats.acceleration, braking: stats.braking };
  }

  /** Current speed over the ground, px/s. */
  get groundSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.y);
  }

  /** Brings the hull to a dead stop, e.g. when it is knocked out or its crew climbs out. */
  halt(): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.moving = false;
    this.slip = 0;
  }

  get operational(): boolean {
    return this.active && this.condition === 'operational';
  }

  get disabled(): boolean {
    return this.active && this.condition === 'disabled';
  }

  /** Working and crewed: the only state in which a tank drives and shoots. */
  get manned(): boolean {
    return this.operational && this.crew.size > 0;
  }

  get invulnerable(): boolean {
    return this.effects.modifiers().invulnerable;
  }

  tick(dt: number): void {
    this.cannon.update(dt);
    this.machineGun.update(dt);
    this.effects.update(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  disable(): void {
    this.condition = 'disabled';
    this.intent = idleIntent();
    this.halt();
    this.effects.clear();
    this.integrity.restore();
    this.repairProgress = 0;
  }

  repair(): void {
    this.condition = 'operational';
    this.health.restore(REPAIR_CONFIG.restoredHealth);
    this.repairProgress = 0;
  }
}
