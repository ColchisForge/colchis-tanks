import { removeInactive } from '../core/collections';
import { rectsOverlap, type Rect, type Vec } from '../core/geometry';
import type { Random } from '../core/Random';
import type { PlayerTank } from '../entities/PlayerTank';
import { POWER_UP_KINDS, PowerUp, type PowerUpKind } from '../entities/PowerUp';
import type { BattleEvent } from '../game/BattleEvents';
import { POWER_UP_CONFIG, SCORE_CONFIG, TANK_SIZE, TILE_SIZE } from '../game/GameConfig';
import type { Session } from '../game/Session';
import { Tile } from '../world/Tile';
import type { TileMap } from '../world/TileMap';

export interface PowerUpRecipient {
  readonly player: PlayerTank;
  readonly session: Session;
}

export interface PowerUpDefinition {
  readonly label: string;
  readonly weight: number;
  apply(recipient: PowerUpRecipient): void;
}

/** Every power-up the game knows about. Adding one means adding a kind and a row here. */
export const POWER_UP_DEFINITIONS: Readonly<Record<PowerUpKind, PowerUpDefinition>> = {
  rapidFire: {
    label: 'RAPID FIRE',
    weight: POWER_UP_CONFIG.weights.rapidFire,
    apply: ({ player }) => player.effects.add('rapidFire', POWER_UP_CONFIG.rapidFire.duration),
  },
  shield: {
    label: 'SHIELD',
    weight: POWER_UP_CONFIG.weights.shield,
    apply: ({ player }) => player.effects.add('shield', POWER_UP_CONFIG.shield.duration),
  },
  extraLife: {
    label: 'EXTRA LIFE',
    weight: POWER_UP_CONFIG.weights.extraLife,
    apply: ({ session }) => {
      session.lives += 1;
    },
  },
};

const SPOT_ATTEMPTS = 80;

export class PowerUpSystem {
  readonly items: PowerUp[] = [];

  constructor(
    private readonly map: TileMap,
    private readonly rng: Random,
    private readonly events: BattleEvent[],
  ) {}

  /** Drops a random power-up on open ground away from the given areas. */
  spawnRandom(avoid: readonly Rect[]): PowerUp | null {
    const kind = this.rng.weighted(POWER_UP_KINDS, (k) => POWER_UP_DEFINITIONS[k].weight);
    const spot = this.findSpot(avoid);
    return spot ? this.spawn(kind, spot.x, spot.y) : null;
  }

  spawn(kind: PowerUpKind, x: number, y: number): PowerUp {
    const item = new PowerUp(kind, x, y);
    this.items.push(item);
    const c = item.center;
    this.events.push({ type: 'powerUpSpawned', x: c.x, y: c.y, kind });
    return item;
  }

  update(dt: number, player: PlayerTank | null, session: Session): void {
    for (const item of this.items) {
      item.age += dt;
      const c = item.center;
      if (item.expired) {
        item.active = false;
        this.events.push({ type: 'powerUpExpired', x: c.x, y: c.y });
      } else if (player?.manned && rectsOverlap(player, item)) {
        this.collect(item, player, session);
      }
    }
    removeInactive(this.items);
  }

  collect(item: PowerUp, player: PlayerTank, session: Session): void {
    POWER_UP_DEFINITIONS[item.kind].apply({ player, session });
    session.addScore(SCORE_CONFIG.powerUp);
    item.active = false;
    const c = item.center;
    this.events.push({ type: 'powerUpCollected', x: c.x, y: c.y, kind: item.kind, points: SCORE_CONFIG.powerUp });
  }

  private findSpot(avoid: readonly Rect[]): Vec | null {
    const blockCols = Math.floor(this.map.cols / 2);
    const blockRows = Math.floor(this.map.rows / 2);
    for (let attempt = 0; attempt < SPOT_ATTEMPTS; attempt++) {
      const col = this.rng.int(blockCols) * 2;
      const row = this.rng.int(blockRows) * 2;
      if (!this.map.isAreaOf(col, row, 2, 2, [Tile.Empty, Tile.Bush])) continue;
      const area = { x: col * TILE_SIZE, y: row * TILE_SIZE, w: TANK_SIZE, h: TANK_SIZE };
      if (avoid.some((rect) => rectsOverlap(rect, area))) continue;
      return { x: area.x, y: area.y };
    }
    return null;
  }
}
