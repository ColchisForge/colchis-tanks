import { SOLDIER_SIZE } from '../game/GameConfig';
import { Entity } from './Entity';

export type SupplyKind = 'rocket' | 'mine';

/** A crate on the map: a reload for the rocket launcher, or an anti-tank mine. */
export class Supply extends Entity {
  age = 0;

  constructor(
    readonly kind: SupplyKind,
    x: number,
    y: number,
  ) {
    super(x, y, SOLDIER_SIZE, SOLDIER_SIZE);
  }
}
