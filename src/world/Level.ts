import type { EnemyKind } from '../game/GameConfig';
import { Surface, type SurfaceType } from './Surface';
import { Tile, type TileType } from './Tile';
import type { TilePoint } from './TileMap';

/**
 * A handcrafted level. `layout` is written in 16px blocks (one character = 2x2 tiles = one tank):
 *
 *   .  empty        #  brick        @  steel        ~  water        %  bush
 *   [  brick, left half     ]  brick, right half
 *   -  brick, top half      _  brick, bottom half
 *   S  enemy spawn  P  player spawn  H  base (a brick wall is built around it automatically)
 *   E  enemy HQ (fortified automatically with brick, steel corners and a second wall in front)
 *
 * `roster` lists enemies in spawn order: B basic, F fast, H heavy. Lowercase letters
 * mark carriers that drop a power-up when destroyed.
 *
 * `roads`, if given, is a second layout of the same size where '=' marks a block of dirt road;
 * every other block keeps the land's own ground.
 */
/** The land a level is set in: it restyles ground, walls, water and bushes. */
export type Land = 'grassland' | 'coast' | 'forest' | 'snow' | 'fortress';

/** The natural ground of each land. */
export const LAND_SURFACES: Readonly<Record<Land, SurfaceType>> = {
  grassland: Surface.Grass,
  coast: Surface.Sand,
  forest: Surface.Moss,
  snow: Surface.Snow,
  fortress: Surface.Paving,
};

export interface LevelDefinition {
  readonly name: string;
  readonly land: Land;
  /** Night missions are dark: enemies only spot crews in their searchlights or near light. */
  readonly night?: boolean;
  readonly layout: readonly string[];
  readonly roads?: readonly string[];
  readonly roster: string;
  readonly maxActiveEnemies: number;
  readonly spawnInterval: number;
  /** Scales how eagerly enemies hunt the player and push for the base (1 = normal). */
  readonly aggression: number;
}

export interface RosterEntry {
  readonly kind: EnemyKind;
  readonly carrier: boolean;
}

export interface ParsedLevel {
  readonly name: string;
  readonly land: Land;
  readonly night: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly tiles: readonly TileType[];
  /** Ground under every tile, see Surface. */
  readonly surfaces: readonly SurfaceType[];
  readonly base: TilePoint | null;
  readonly enemyBase: TilePoint | null;
  readonly playerSpawn: TilePoint | null;
  readonly enemySpawns: readonly TilePoint[];
  readonly roster: readonly RosterEntry[];
  readonly maxActiveEnemies: number;
  readonly spawnInterval: number;
  readonly aggression: number;
}

type BlockPattern = readonly [TileType, TileType, TileType, TileType];

const E = Tile.Empty;
const B = Tile.Brick;

/** Tiles for each block character, ordered top-left, top-right, bottom-left, bottom-right. */
const BLOCK_PATTERNS: Readonly<Record<string, BlockPattern>> = {
  '.': [E, E, E, E],
  '#': [B, B, B, B],
  '@': [Tile.Steel, Tile.Steel, Tile.Steel, Tile.Steel],
  '~': [Tile.Water, Tile.Water, Tile.Water, Tile.Water],
  '%': [Tile.Bush, Tile.Bush, Tile.Bush, Tile.Bush],
  '[': [B, E, B, E],
  ']': [E, B, E, B],
  '-': [B, B, E, E],
  _: [E, E, B, B],
  S: [E, E, E, E],
  P: [E, E, E, E],
  H: [Tile.Base, Tile.Base, Tile.Base, Tile.Base],
  E: [Tile.EnemyBase, Tile.EnemyBase, Tile.EnemyBase, Tile.EnemyBase],
};

const ROSTER_KINDS: Readonly<Record<string, EnemyKind>> = {
  B: 'basic',
  F: 'fast',
  H: 'heavy',
};

export function parseRoster(roster: string): RosterEntry[] {
  return [...roster].map((char, index) => {
    const kind = ROSTER_KINDS[char.toUpperCase()];
    if (!kind) throw new Error(`Unknown enemy '${char}' at roster position ${index}`);
    return { kind, carrier: char !== char.toUpperCase() };
  });
}

export function parseLevel(definition: LevelDefinition): ParsedLevel {
  const blockRows = definition.layout.length;
  const blockCols = definition.layout[0]?.length ?? 0;
  if (blockRows === 0 || blockCols === 0) throw new Error(`Level "${definition.name}" has an empty layout`);

  const cols = blockCols * 2;
  const rows = blockRows * 2;
  const tiles: TileType[] = new Array<TileType>(cols * rows).fill(Tile.Empty);
  const enemySpawns: TilePoint[] = [];
  let playerSpawn: TilePoint | null = null;
  let base: TilePoint | null = null;
  let enemyBase: TilePoint | null = null;

  for (let by = 0; by < blockRows; by++) {
    const line = definition.layout[by];
    if (line.length !== blockCols) {
      throw new Error(`Level "${definition.name}" row ${by} has ${line.length} blocks, expected ${blockCols}`);
    }
    for (let bx = 0; bx < blockCols; bx++) {
      const char = line[bx];
      const pattern = BLOCK_PATTERNS[char];
      if (!pattern) throw new Error(`Level "${definition.name}" has unknown block '${char}' at ${bx},${by}`);
      const col = bx * 2;
      const row = by * 2;
      tiles[row * cols + col] = pattern[0];
      tiles[row * cols + col + 1] = pattern[1];
      tiles[(row + 1) * cols + col] = pattern[2];
      tiles[(row + 1) * cols + col + 1] = pattern[3];

      const point = { col, row };
      if (char === 'S') enemySpawns.push(point);
      if (char === 'P') {
        if (playerSpawn) throw new Error(`Level "${definition.name}" has more than one player spawn`);
        playerSpawn = point;
      }
      if (char === 'H') {
        if (base) throw new Error(`Level "${definition.name}" has more than one base`);
        base = point;
      }
      if (char === 'E') {
        if (enemyBase) throw new Error(`Level "${definition.name}" has more than one enemy HQ`);
        enemyBase = point;
      }
    }
  }

  if (base) fortifyBase(tiles, cols, rows, base);
  if (enemyBase) fortifyEnemyBase(tiles, cols, rows, enemyBase);
  const surfaces = parseSurfaces(definition, blockCols, blockRows);

  return {
    name: definition.name,
    land: definition.land,
    night: definition.night ?? false,
    cols,
    rows,
    tiles,
    surfaces,
    base,
    enemyBase,
    playerSpawn,
    enemySpawns,
    roster: parseRoster(definition.roster),
    maxActiveEnemies: definition.maxActiveEnemies,
    spawnInterval: definition.spawnInterval,
    aggression: definition.aggression,
  };
}

function parseSurfaces(definition: LevelDefinition, blockCols: number, blockRows: number): SurfaceType[] {
  const cols = blockCols * 2;
  const surfaces = new Array<SurfaceType>(cols * blockRows * 2).fill(LAND_SURFACES[definition.land]);
  const roads = definition.roads;
  if (!roads) return surfaces;
  if (roads.length !== blockRows) throw new Error(`Level "${definition.name}" roads have ${roads.length} rows, expected ${blockRows}`);
  for (let by = 0; by < blockRows; by++) {
    if (roads[by].length !== blockCols) throw new Error(`Level "${definition.name}" roads row ${by} has the wrong width`);
    for (let bx = 0; bx < blockCols; bx++) {
      if (roads[by][bx] !== '=') continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) surfaces[(by * 2 + dy) * cols + bx * 2 + dx] = Surface.Road;
    }
  }
  return surfaces;
}

/**
 * The enemy HQ is dug in: a brick ring with steel corner posts, and a second brick wall across the
 * side that faces the field (the side away from the nearest map edge).
 */
function fortifyEnemyBase(tiles: TileType[], cols: number, rows: number, hq: TilePoint): void {
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  for (let r = hq.row - 1; r <= hq.row + 2; r++) {
    for (let c = hq.col - 1; c <= hq.col + 2; c++) {
      const core = r >= hq.row && r <= hq.row + 1 && c >= hq.col && c <= hq.col + 1;
      if (core || !inside(c, r)) continue;
      const corner = (r === hq.row - 1 || r === hq.row + 2) && (c === hq.col - 1 || c === hq.col + 2);
      tiles[r * cols + c] = corner ? Tile.Steel : Tile.Brick;
    }
  }
  const front = hq.row < rows / 2 ? hq.row + 3 : hq.row - 2;
  for (let c = hq.col - 1; c <= hq.col + 2; c++) if (inside(c, front)) tiles[front * cols + c] = Tile.Brick;
}

/** Surrounds the 2x2 base with a one-tile brick wall wherever the ring stays inside the map. */
function fortifyBase(tiles: TileType[], cols: number, rows: number, base: TilePoint): void {
  for (let r = base.row - 1; r <= base.row + 2; r++) {
    for (let c = base.col - 1; c <= base.col + 2; c++) {
      const insideBase = r >= base.row && r <= base.row + 1 && c >= base.col && c <= base.col + 1;
      if (insideBase || c < 0 || r < 0 || c >= cols || r >= rows) continue;
      tiles[r * cols + c] = Tile.Brick;
    }
  }
}
