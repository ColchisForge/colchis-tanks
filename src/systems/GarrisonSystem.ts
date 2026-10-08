import type { Direction, Vec } from '../core/geometry';
import { Bullet } from '../entities/Bullet';
import { Weapon } from '../entities/components/Weapon';
import { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import type { BattleEvent } from '../game/BattleEvents';
import { GARRISON_CONFIG, MACHINE_GUN_CONFIG, SHELL_PERSONNEL_DAMAGE, TILE_SIZE } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';
import type { CollisionSystem } from './CollisionSystem';

/**
 * The enemy HQ's own garrison: an anti-tank gun and a machine gun firing out of an embrasure in
 * the side that faces the field. They cover the ground straight in front of the bunker, so a
 * frontal assault walks into their fire; the flanks are the way in.
 */
export class GarrisonSystem {
  /** The crew working the guns, kept out of the battle's own soldier list. */
  readonly gunner = new Soldier('enemy');
  private readonly cannon = new Weapon({
    projectile: 'shell',
    fireCooldown: GARRISON_CONFIG.cannonCooldown,
    maxShells: 1,
    shellSpeed: GARRISON_CONFIG.shellSpeed,
    shellDamage: GARRISON_CONFIG.shellDamage,
    shellTileDamage: 1,
    personnelDamage: SHELL_PERSONNEL_DAMAGE,
    range: Number.POSITIVE_INFINITY,
  });
  private readonly machineGun = new Weapon({ projectile: 'bullet', ...MACHINE_GUN_CONFIG, fireCooldown: MACHINE_GUN_CONFIG.fireCooldown * MACHINE_GUN_CONFIG.enemyCooldownScale });
  /** Time the current target has been in the sights; the gunners take a moment to lay the guns. */
  private aim = 0;
  /** The bunker has two firing ports either side of its centre line; the guns use them by turns. */
  private port = 1;

  constructor(
    private readonly map: TileMap,
    private readonly collision: CollisionSystem,
    private readonly events: BattleEvent[],
  ) {}

  /** Which way the embrasure faces: away from the map edge the HQ is built against. */
  get facing(): Direction {
    const hq = this.map.enemyBase;
    return hq && hq.row < this.map.rows / 2 ? 'down' : 'up';
  }

  update(dt: number, shells: Bullet[], tank: Tank | null, crew: Soldier | null): void {
    this.cannon.update(dt);
    this.machineGun.update(dt);
    const hq = this.map.enemyBase;
    if (!hq || hq.destroyed) return;
    const facing = this.facing;
    const sign = facing === 'down' ? 1 : -1;
    // The embrasure opens beyond the outer wall, so the garrison never shells its own defences.
    const muzzle = { x: (hq.col + 1) * TILE_SIZE, y: (facing === 'down' ? hq.row + 4 : hq.row - 2) * TILE_SIZE + sign * 3 };
    const covers = (target: Vec, reach: number) => {
      const ahead = (target.y - muzzle.y) * sign;
      return ahead > 0 && ahead <= reach && Math.abs(target.x - muzzle.x) <= GARRISON_CONFIG.arc && this.collision.hasLineOfFire(muzzle, target);
    };
    const tankInSights = tank?.operational && covers(tank.center, GARRISON_CONFIG.range);
    const crewInSights = crew?.onFoot && covers(crew.center, MACHINE_GUN_CONFIG.range);
    if (!tankInSights && !crewInSights) {
      this.aim = 0;
      return;
    }
    this.aim += dt;
    if (this.aim < GARRISON_CONFIG.aimTime) return;
    this.gunner.x = muzzle.x - this.gunner.w / 2;
    this.gunner.y = muzzle.y - this.gunner.h / 2;
    if (tankInSights && this.cannon.ready) this.fire(this.cannon, 'cannon', this.nextPort(muzzle), facing, shells);
    if (crewInSights && this.machineGun.ready) this.fire(this.machineGun, 'machineGun', this.nextPort(muzzle), facing, shells);
  }

  private nextPort(muzzle: Vec): Vec {
    this.port = -this.port;
    return { x: muzzle.x + this.port * GARRISON_CONFIG.portOffset, y: muzzle.y };
  }

  private fire(weapon: Weapon, kind: 'cannon' | 'machineGun', muzzle: Vec, direction: Direction, shells: Bullet[]): void {
    const stats = weapon.stats;
    shells.push(
      new Bullet(this.gunner, muzzle.x, muzzle.y, direction, {
        kind: stats.projectile,
        speed: stats.shellSpeed,
        damage: stats.shellDamage,
        personnelDamage: stats.personnelDamage,
        tileDamage: stats.shellTileDamage,
        range: stats.range,
        tracer: stats.projectile === 'bullet' && weapon.rounds % MACHINE_GUN_CONFIG.tracerEvery === 0,
      }),
    );
    weapon.trigger();
    this.events.push({ type: 'shot', x: muzzle.x, y: muzzle.y, direction, team: 'enemy', weapon: kind });
  }
}
