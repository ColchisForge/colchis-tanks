import { describe, expect, it } from 'vitest';
import { findPath, steer } from '../src/systems/Pathfinder';
import { TileMap } from '../src/world/TileMap';

describe('pathfinder', () => {
  const map = TileMap.fromRows(['..@...', '..@...', '..@...', '......']);

  it('routes around walls', () => {
    const path = findPath(map, {
      start: { col: 0, row: 0 },
      size: 1,
      mobility: 'foot',
      brickCost: Infinity,
      isGoal: (col, row) => col === 4 && row === 0,
    });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ col: 4, row: 0 });
    expect(path!.some((step) => step.row === 3)).toBe(true);
    expect(path).toHaveLength(10);
  });

  it('returns null when the goal cannot be reached', () => {
    const walled = TileMap.fromRows(['..@...', '..@...', '..@...', '..@...']);
    const path = findPath(walled, { start: { col: 0, row: 0 }, size: 1, mobility: 'foot', brickCost: Infinity, isGoal: (col) => col === 5 });
    expect(path).toBeNull();
  });

  it('will blast through bricks when going round costs more', () => {
    const bricks = TileMap.fromRows(['..#.....', '..#.....', '..#.....', '..#.....', '..#.....', '..#.....', '........']);
    const goal = (col: number, row: number) => col === 4 && row === 0;
    const around = findPath(bricks, { start: { col: 0, row: 0 }, size: 1, mobility: 'foot', brickCost: Infinity, isGoal: goal });
    const through = findPath(bricks, { start: { col: 0, row: 0 }, size: 1, mobility: 'tracked', brickCost: 3, isGoal: goal });
    expect(around!.length).toBeGreaterThan(through!.length);
    expect(through!.some((step) => step.col === 2)).toBe(true);
  });

  it('plans with a tank-sized footprint', () => {
    const narrow = TileMap.fromRows(['......', '.@.@..', '......', '......']);
    const path = findPath(narrow, { start: { col: 0, row: 2 }, size: 2, mobility: 'tracked', brickCost: Infinity, isGoal: (col, row) => col === 4 && row === 0 });
    expect(path).not.toBeNull();
    expect(path!.every((step) => !(step.row <= 1 && step.col <= 3))).toBe(true);
  });

  it('steers towards the next waypoint and drops reached ones', () => {
    const path = [{ col: 1, row: 0 }, { col: 1, row: 1 }];
    const unit = { x: 8, y: 0, w: 8, h: 8 };
    expect(steer(unit, path)).toBe('down');
    expect(path).toHaveLength(1);
  });
});
