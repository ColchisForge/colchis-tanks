import type { Direction } from '../core/geometry';
import { SHELL_SIZE } from '../game/GameConfig';
import type { ProjectileKind } from './components/Weapon';
import { Entity } from './Entity';
import type { Team, Unit } from './Unit';

/**
 * Machine-gun rounds are drawn one pixel wide but collide like shells: tanks sit on the 8px grid
 * and soldiers on tile centres, so a burst down a tank's centre line must still clip a soldier
 * standing half a tile off it.
 */
const BULLET_SIZE = 4;

export interface ShellSpec {
  readonly kind: ProjectileKind;
  readonly speed: number;
  /** Rockets keep accelerating under thrust up to `maxSpeed`. */
  readonly thrust?: number;
  readonly maxSpeed?: number;
  readonly damage: number;
  readonly personnelDamage: number;
  readonly tileDamage: number;
  readonly range: number;
  /** A tracer round: its burning base glows along its whole flight. */
  readonly tracer?: boolean;
}

/** A projectile: a tank shell, a machine-gun bullet or a rocket. Its team is fixed at launch. */
export class Bullet extends Entity {
  readonly kind: ProjectileKind;
  readonly team: Team;
  speed: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly damage: number;
  readonly personnelDamage: number;
  readonly tileDamage: number;
  readonly tracer: boolean;
  rangeLeft: number;

  constructor(
    readonly owner: Unit,
    centerX: number,
    centerY: number,
    readonly direction: Direction,
    spec: ShellSpec,
  ) {
    const size = spec.kind === 'bullet' ? BULLET_SIZE : SHELL_SIZE;
    super(centerX - size / 2, centerY - size / 2, size, size);
    this.kind = spec.kind;
    this.team = owner.team;
    this.speed = spec.speed;
    this.thrust = spec.thrust ?? 0;
    this.maxSpeed = spec.maxSpeed ?? spec.speed;
    this.damage = spec.damage;
    this.personnelDamage = spec.personnelDamage;
    this.tileDamage = spec.tileDamage;
    this.rangeLeft = spec.range;
    this.tracer = spec.tracer ?? false;
  }
}
