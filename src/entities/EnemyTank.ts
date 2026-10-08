import type { Direction } from '../core/geometry';
import { ENEMY_PROFILES, type EnemyKind, type EnemyProfile } from '../game/GameConfig';
import { AIBrain } from './AIBrain';
import { Tank } from './Tank';

export class EnemyTank extends Tank {
  readonly profile: EnemyProfile;
  readonly brain = new AIBrain();

  constructor(
    readonly kind: EnemyKind,
    x: number,
    y: number,
    direction: Direction = 'down',
    /** Carriers flash and drop a power-up the first time they are knocked out. */
    public carrier = false,
  ) {
    const profile = ENEMY_PROFILES[kind];
    super('enemy', x, y, direction, profile);
    this.profile = profile;
  }
}
