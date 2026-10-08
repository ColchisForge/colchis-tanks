import { REPAIR_CONFIG, SOLDIER_SIZE } from '../game/GameConfig';
import { Entity } from './Entity';

/** Dropped when a tank is disabled; a crew member carrying one can repair a wreck of their side. */
export class Wrench extends Entity {
  age = 0;

  constructor(x: number, y: number) {
    super(x, y, SOLDIER_SIZE, SOLDIER_SIZE);
  }

  get expired(): boolean {
    return this.age >= REPAIR_CONFIG.wrenchLifetime;
  }

  get expiring(): boolean {
    return REPAIR_CONFIG.wrenchLifetime - this.age <= REPAIR_CONFIG.wrenchBlinkTime;
  }
}
