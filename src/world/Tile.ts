import { BRICK_HEALTH } from '../game/GameConfig';

export const Tile = {
  Empty: 0,
  Brick: 1,
  Steel: 2,
  Water: 3,
  Bush: 4,
  Base: 5,
  /** The enemy's headquarters bunker. */
  EnemyBase: 6,
} as const;

export type TileType = (typeof Tile)[keyof typeof Tile];

/** How a unit moves across terrain: tanks on tracks, crews on foot. */
export type Mobility = 'tracked' | 'foot';

export interface TileProperties {
  readonly name: string;
  readonly blocks: Readonly<Record<Mobility, boolean>>;
  readonly stopsShells: boolean;
  /** Enemies cannot see through it. */
  readonly blocksSight: boolean;
  readonly destructible: boolean;
  readonly maxHealth: number;
  /** Drawn above units, partially hiding whatever is underneath. */
  readonly overlay: boolean;
  /** A soldier standing in it cannot be seen from a distance. */
  readonly concealment: boolean;
}

export const TILE_PROPERTIES: Readonly<Record<TileType, TileProperties>> = {
  [Tile.Empty]: {
    name: 'empty',
    blocks: { tracked: false, foot: false },
    stopsShells: false,
    blocksSight: false,
    destructible: false,
    maxHealth: 0,
    overlay: false,
    concealment: false,
  },
  [Tile.Brick]: {
    name: 'brick',
    blocks: { tracked: true, foot: true },
    stopsShells: true,
    blocksSight: true,
    destructible: true,
    maxHealth: BRICK_HEALTH,
    overlay: false,
    concealment: false,
  },
  [Tile.Steel]: {
    name: 'steel',
    blocks: { tracked: true, foot: true },
    stopsShells: true,
    blocksSight: true,
    destructible: false,
    maxHealth: 0,
    overlay: false,
    concealment: false,
  },
  [Tile.Water]: {
    name: 'water',
    blocks: { tracked: true, foot: true },
    stopsShells: false,
    blocksSight: false,
    destructible: false,
    maxHealth: 0,
    overlay: false,
    concealment: false,
  },
  [Tile.Bush]: {
    name: 'bush',
    blocks: { tracked: false, foot: false },
    stopsShells: false,
    blocksSight: false,
    destructible: false,
    maxHealth: 0,
    overlay: true,
    concealment: true,
  },
  [Tile.Base]: {
    name: 'base',
    blocks: { tracked: true, foot: true },
    stopsShells: true,
    blocksSight: true,
    destructible: false,
    maxHealth: 0,
    overlay: false,
    concealment: false,
  },
  [Tile.EnemyBase]: {
    name: 'enemyBase',
    blocks: { tracked: true, foot: true },
    stopsShells: true,
    blocksSight: true,
    destructible: false,
    maxHealth: 0,
    overlay: false,
    concealment: false,
  },
};

export function tileProperties(type: TileType): TileProperties {
  return TILE_PROPERTIES[type];
}
