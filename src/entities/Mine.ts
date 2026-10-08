import { MINE_CONFIG, TILE_SIZE } from '../game/GameConfig';
import { Entity } from './Entity';
import type { Soldier } from './Soldier';
import type { Team } from './Unit';

/** A planted anti-tank mine. It fills one tile; a tank rolling onto it sets it off once it is armed. */
export class Mine extends Entity {
  readonly team: Team;
  /** Seconds until the fuse is live. */
  arming: number = MINE_CONFIG.armTime;
  age = 0;

  constructor(
    readonly owner: Soldier,
    col: number,
    row: number,
  ) {
    super(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    this.team = owner.team;
  }

  get armed(): boolean {
    return this.arming <= 0;
  }
}
