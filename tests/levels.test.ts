import { describe, expect, it } from 'vitest';
import { LEVEL_BLOCK_COLS, LEVEL_BLOCK_ROWS } from '../src/game/GameConfig';
import { parseLevel, parseRoster } from '../src/world/Level';
import { LEVELS } from '../src/world/levels';
import { Surface } from '../src/world/Surface';
import { Tile } from '../src/world/Tile';
import { TileMap, type TilePoint } from '../src/world/TileMap';

/** Breadth-first search over tank positions, treating bricks as passable because they can be shot away. */
function reachable(map: TileMap, from: TilePoint, to: TilePoint): boolean {
  const passable = (col: number, row: number) =>
    map.isAreaOf(col, row, 2, 2, [Tile.Empty, Tile.Bush, Tile.Brick]);
  const key = (p: TilePoint) => p.row * map.cols + p.col;
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.col === to.col && current.row === to.row) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { col: current.col + dc, row: current.row + dr };
      if (seen.has(key(next)) || !passable(next.col, next.row)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return false;
}

describe('levels', () => {
  it('has at least three levels', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(3);
  });

  it.each(LEVELS.map((level) => [level.name, level] as const))('%s is well formed and playable', (_name, definition) => {
    expect(definition.layout).toHaveLength(LEVEL_BLOCK_ROWS);
    for (const row of definition.layout) expect(row).toHaveLength(LEVEL_BLOCK_COLS);

    const level = parseLevel(definition);
    expect(level.base).not.toBeNull();
    expect(level.playerSpawn).not.toBeNull();
    expect(level.enemySpawns.length).toBeGreaterThan(0);
    expect(level.roster.length).toBeGreaterThan(0);

    const map = new TileMap(level.cols, level.rows, level.tiles, level.base);
    const player = level.playerSpawn!;
    const base = level.base!;
    for (const spawn of level.enemySpawns) {
      expect(reachable(map, spawn, player)).toBe(true);
    }
    expect(reachable(map, player, { col: base.col, row: base.row - 2 })).toBe(true);
  });

  it('gets harder as the campaign progresses', () => {
    const sizes = LEVELS.map((level) => level.roster.length);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    expect(parseRoster(LEVELS[0].roster).every((entry) => entry.kind === 'basic')).toBe(true);
    expect(parseRoster(LEVELS[1].roster).some((entry) => entry.kind === 'fast')).toBe(true);
    expect(parseRoster(LEVELS[2].roster).some((entry) => entry.kind === 'heavy')).toBe(true);
  });

  it('builds a brick wall around the base', () => {
    const level = parseLevel(LEVELS[0]);
    const map = new TileMap(level.cols, level.rows, level.tiles, level.base);
    const { col, row } = level.base!;
    expect(map.get(col, row)).toBe(Tile.Base);
    expect(map.get(col - 1, row)).toBe(Tile.Brick);
    expect(map.get(col + 2, row + 1)).toBe(Tile.Brick);
    expect(map.get(col, row - 1)).toBe(Tile.Brick);
  });

  it('parses carriers from lowercase roster letters', () => {
    expect(parseRoster('BfH')).toEqual([
      { kind: 'basic', carrier: false },
      { kind: 'fast', carrier: true },
      { kind: 'heavy', carrier: false },
    ]);
  });
});

describe('ground', () => {
  it('each land has its own natural ground', () => {
    const level = parseLevel(LEVELS.find((l) => l.land === 'coast')!);
    expect(new Set(level.surfaces)).toEqual(new Set([Surface.Sand]));
  });

  it('the snow pass is 60% snow and 40% dirt road', () => {
    const level = parseLevel(LEVELS.find((l) => l.land === 'snow')!);
    let ground = 0;
    let road = 0;
    level.tiles.forEach((tile, i) => {
      if (tile !== Tile.Empty && tile !== Tile.Bush) return;
      ground++;
      if (level.surfaces[i] === Surface.Road) road++;
      else expect(level.surfaces[i]).toBe(Surface.Snow);
    });
    expect(Math.abs(road / ground - 0.4)).toBeLessThan(0.015);
  });

  it('rejects a road overlay of the wrong size', () => {
    expect(() => parseLevel({ ...LEVELS[0], roads: ['==='] })).toThrow(/roads/);
  });
});
