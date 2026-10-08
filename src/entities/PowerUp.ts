import { POWER_UP_CONFIG, TANK_SIZE } from '../game/GameConfig';
import { Entity } from './Entity';

export type PowerUpKind = 'rapidFire' | 'shield' | 'extraLife';

export const POWER_UP_KINDS: readonly PowerUpKind[] = ['rapidFire', 'shield', 'extraLife'];

export class PowerUp extends Entity {
  age = 0;

  constructor(
    readonly kind: PowerUpKind,
    x: number,
    y: number,
    readonly lifetime: number = POWER_UP_CONFIG.lifetime,
  ) {
    super(x, y, TANK_SIZE, TANK_SIZE);
  }

  get expired(): boolean {
    return this.age >= this.lifetime;
  }

  /** True during the final seconds, when the item blinks as a warning. */
  get expiring(): boolean {
    return this.lifetime - this.age <= POWER_UP_CONFIG.blinkTime;
  }
}
