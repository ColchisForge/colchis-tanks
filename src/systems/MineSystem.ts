import { removeInactive } from '../core/collections';
import type { Rect } from '../core/geometry';
import { Mine } from '../entities/Mine';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import type { BattleEvent } from '../game/BattleEvents';
import { MINE_CONFIG, TILE_SIZE } from '../game/GameConfig';

export interface MineListener {
  /** An armed mine went off under `tank`. */
  onMineDetonated(mine: Mine, tank: Tank): void;
}

/** True once the mine's centre is under the hull, `reach` px in from its edge. */
function under(mine: Mine, tank: Rect): boolean {
  const c = mine.center;
  const reach = MINE_CONFIG.triggerReach;
  return c.x > tank.x + reach && c.x < tank.x + tank.w - reach && c.y > tank.y + reach && c.y < tank.y + tank.h - reach;
}

/**
 * Anti-tank mines. A crew on foot plants one on the tile it stands on; after a short arming delay
 * the fuse is live and the next tank to roll over it, of either side, sets it off. Crews on foot
 * are far too light to trigger one.
 */
export class MineSystem {
  readonly mines: Mine[] = [];

  constructor(private readonly events: BattleEvent[]) {}

  plant(soldier: Soldier): Mine | null {
    if (!soldier.onFoot || soldier.mines <= 0 || soldier.plantCooldown > 0) return null;
    if (this.mines.length >= MINE_CONFIG.maxPlanted) return null;
    const c = soldier.center;
    const col = Math.floor(c.x / TILE_SIZE);
    const row = Math.floor(c.y / TILE_SIZE);
    if (this.mines.some((mine) => mine.x === col * TILE_SIZE && mine.y === row * TILE_SIZE)) return null;
    const mine = new Mine(soldier, col, row);
    soldier.mines--;
    soldier.plantCooldown = MINE_CONFIG.plantCooldown;
    this.mines.push(mine);
    const m = mine.center;
    this.events.push({ type: 'minePlanted', x: m.x, y: m.y, team: mine.team });
    return mine;
  }

  update(dt: number, tanks: readonly Tank[], listener: MineListener): void {
    for (const mine of this.mines) {
      mine.age += dt;
      if (!mine.armed) {
        mine.arming -= dt;
        if (mine.armed) {
          const m = mine.center;
          this.events.push({ type: 'mineArmed', x: m.x, y: m.y, team: mine.team });
        }
        continue;
      }
      const victim = tanks.find((tank) => tank.active && under(mine, tank));
      if (!victim) continue;
      mine.active = false;
      listener.onMineDetonated(mine, victim);
    }
    removeInactive(this.mines);
  }
}
