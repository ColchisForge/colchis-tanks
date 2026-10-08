import type { TilePoint } from '../world/TileMap';

export type InfantryState = 'BAIL_OUT' | 'FETCH_WRENCH' | 'RETURN' | 'REPAIR' | 'BOARD' | 'FETCH_MINE' | 'PLANT_MINE' | 'HIDE' | 'RETREAT';

/** Memory for an AI crew member on foot. The behaviour lives in InfantryAISystem. */
export class InfantryBrain {
  state: InfantryState = 'BAIL_OUT';
  stateTime = 0;
  /** Remaining route, as tile positions of the soldier's top-left corner. */
  path: TilePoint[] = [];
  repathTimer = 0;
  /** Total time spent hiding since bailing out. */
  hidden = 0;
  /** How long the crew has held a rocket shot lined up. */
  aim = 0;
  /** Where the crew means to plant its next mine. */
  mineSpot: TilePoint | null = null;

  enter(state: InfantryState): void {
    this.state = state;
    this.stateTime = 0;
    this.path = [];
    this.repathTimer = 0;
  }
}
