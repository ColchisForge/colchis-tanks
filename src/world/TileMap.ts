import { EPSILON, type Rect } from '../core/geometry';
import type { Team } from '../entities/Unit';
import { BASE_HEALTH, ENEMY_BASE_CONFIG, TILE_SIZE } from '../game/GameConfig';
import { Surface, type SurfaceType } from './Surface';
import { Tile, tileProperties, type Mobility, type TileType } from './Tile';

export interface TilePoint {
  col: number;
  row: number;
}

export interface BaseState {
  /** Top-left tile of the 2x2 base. */
  readonly col: number;
  readonly row: number;
  readonly team: Team;
  readonly maxHealth: number;
  health: number;
  destroyed: boolean;
}

export type TileDamageOutcome = 'none' | 'damaged' | 'destroyed' | 'indestructible';

export interface TileRange {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/** Characters shared by tile-level and block-level map layouts. */
export const TERRAIN_CHARS: Readonly<Record<string, TileType>> = {
  '.': Tile.Empty,
  '#': Tile.Brick,
  '@': Tile.Steel,
  '~': Tile.Water,
  '%': Tile.Bush,
  H: Tile.Base,
  E: Tile.EnemyBase,
};

/** Ground characters for tile-level layouts; the tile itself is empty. */
const SURFACE_CHARS: Readonly<Record<string, SurfaceType>> = {
  '*': Surface.Snow,
  '=': Surface.Road,
};

/** The live, mutable terrain of a level. Destroyed tiles really are removed from this state. */
export class TileMap {
  readonly tileSize = TILE_SIZE;
  /** The player's base. */
  readonly base: BaseState | null;
  /** The enemy's headquarters. */
  readonly enemyBase: BaseState | null;
  /** Incremented on every terrain change so renderers can cache the static layer. */
  version = 0;
  /** Tiles changed since a renderer last took them, so it can repaint just those. */
  private readonly changed: TilePoint[] = [];

  private readonly types: Uint8Array;
  private readonly health: Uint8Array;
  private readonly surfaces: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
    tiles?: ArrayLike<TileType>,
    base: TilePoint | null = null,
    surfaces?: ArrayLike<SurfaceType>,
    enemyBase: TilePoint | null = null,
  ) {
    this.types = new Uint8Array(cols * rows);
    this.health = new Uint8Array(cols * rows);
    this.surfaces = new Uint8Array(cols * rows).fill(Surface.Grass);
    if (surfaces) {
      if (surfaces.length !== cols * rows) throw new Error(`Expected ${cols * rows} surfaces, got ${surfaces.length}`);
      this.surfaces.set(surfaces);
    }
    if (tiles) {
      if (tiles.length !== cols * rows) throw new Error(`Expected ${cols * rows} tiles, got ${tiles.length}`);
      for (let i = 0; i < tiles.length; i++) {
        this.types[i] = tiles[i];
        this.health[i] = tileProperties(tiles[i]).maxHealth;
      }
    }
    this.base = base ? { col: base.col, row: base.row, team: 'player', maxHealth: BASE_HEALTH, health: BASE_HEALTH, destroyed: false } : null;
    const hq = ENEMY_BASE_CONFIG.health;
    this.enemyBase = enemyBase ? { col: enemyBase.col, row: enemyBase.row, team: 'enemy', maxHealth: hq, health: hq, destroyed: false } : null;
  }

  /**
   * Builds a map from tile-level rows (one character per 8px tile). Mainly for tests and tools.
   * Besides the terrain characters, '*' is open snow and '=' is a dirt road; everything else
   * lies on `ground`.
   */
  static fromRows(rows: readonly string[], ground: SurfaceType = Surface.Grass): TileMap {
    const cols = rows[0]?.length ?? 0;
    const tiles: TileType[] = [];
    const surfaces: SurfaceType[] = [];
    let base: TilePoint | null = null;
    let enemyBase: TilePoint | null = null;
    rows.forEach((line, row) => {
      if (line.length !== cols) throw new Error(`Row ${row} has ${line.length} columns, expected ${cols}`);
      [...line].forEach((char, col) => {
        const surface = SURFACE_CHARS[char];
        const type = surface === undefined ? TERRAIN_CHARS[char] : Tile.Empty;
        if (type === undefined) throw new Error(`Unknown tile '${char}' at ${col},${row}`);
        if (type === Tile.Base && !base) base = { col, row };
        if (type === Tile.EnemyBase && !enemyBase) enemyBase = { col, row };
        tiles.push(type);
        surfaces.push(surface ?? ground);
      });
    });
    return new TileMap(cols, rows.length, tiles, base, surfaces, enemyBase);
  }

  get width(): number {
    return this.cols * this.tileSize;
  }

  get height(): number {
    return this.rows * this.tileSize;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Out-of-bounds positions read as steel so the map edge behaves like a wall. */
  get(col: number, row: number): TileType {
    if (!this.inBounds(col, row)) return Tile.Steel;
    return this.types[row * this.cols + col] as TileType;
  }

  set(col: number, row: number, type: TileType): void {
    if (!this.inBounds(col, row)) return;
    const index = row * this.cols + col;
    this.types[index] = type;
    this.health[index] = tileProperties(type).maxHealth;
    this.touch(col, row);
  }

  /** The ground under a tile. Outside the map it reads as ordinary grass. */
  surfaceAt(col: number, row: number): SurfaceType {
    if (!this.inBounds(col, row)) return Surface.Grass;
    return this.surfaces[row * this.cols + col] as SurfaceType;
  }

  /** The ground under the centre of a rect: what a unit is standing or driving on. */
  surfaceUnder(rect: Rect): SurfaceType {
    const s = this.tileSize;
    return this.surfaceAt(Math.floor((rect.x + rect.w / 2) / s), Math.floor((rect.y + rect.h / 2) / s));
  }

  healthAt(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.health[row * this.cols + col];
  }

  blocksMovement(col: number, row: number, mobility: Mobility): boolean {
    return tileProperties(this.get(col, row)).blocks[mobility];
  }

  stopsShells(col: number, row: number): boolean {
    return tileProperties(this.get(col, row)).stopsShells;
  }

  blocksSight(col: number, row: number): boolean {
    return tileProperties(this.get(col, row)).blocksSight;
  }

  conceals(col: number, row: number): boolean {
    return tileProperties(this.get(col, row)).concealment;
  }

  damage(col: number, row: number, amount: number): TileDamageOutcome {
    if (!this.inBounds(col, row)) return 'none';
    const type = this.get(col, row);
    const props = tileProperties(type);
    if (!props.stopsShells) return 'none';
    if (!props.destructible) return 'indestructible';
    const index = row * this.cols + col;
    const remaining = Math.max(0, this.health[index] - amount);
    if (remaining === 0) {
      this.set(col, row, Tile.Empty);
      return 'destroyed';
    }
    this.health[index] = remaining;
    this.touch(col, row);
    return 'damaged';
  }

  /** Changed tiles since the last call. */
  takeChanges(): TilePoint[] {
    return this.changed.splice(0);
  }

  private touch(col: number, row: number): void {
    this.version++;
    this.changed.push({ col, row });
  }

  /** The base belonging to `team`. */
  baseOf(team: Team): BaseState | null {
    return team === 'player' ? this.base : this.enemyBase;
  }

  /** Hits on a base: one per shell, more for a rocket. */
  damageBase(team: Team = 'player', amount = 1): 'none' | 'damaged' | 'destroyed' {
    const base = this.baseOf(team);
    if (!base || base.destroyed) return 'none';
    base.health = Math.max(0, base.health - amount);
    this.version++;
    if (base.health > 0) return 'damaged';
    base.destroyed = true;
    return 'destroyed';
  }

  /** Inclusive range of tiles touched by a rect, clipped to the map. */
  rangeForRect(rect: Rect): TileRange {
    const s = this.tileSize;
    return {
      c0: Math.max(0, Math.floor(rect.x / s)),
      c1: Math.min(this.cols - 1, Math.floor((rect.x + rect.w - EPSILON) / s)),
      r0: Math.max(0, Math.floor(rect.y / s)),
      r1: Math.min(this.rows - 1, Math.floor((rect.y + rect.h - EPSILON) / s)),
    };
  }

  tileRect(col: number, row: number): Rect {
    const s = this.tileSize;
    return { x: col * s, y: row * s, w: s, h: s };
  }

  /** True if every tile in the area is in bounds and one of the allowed types. */
  isAreaOf(col: number, row: number, cols: number, rows: number, allowed: readonly TileType[]): boolean {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        if (!this.inBounds(c, r) || !allowed.includes(this.get(c, r))) return false;
      }
    }
    return true;
  }
}
