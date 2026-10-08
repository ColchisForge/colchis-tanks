import { describe, expect, it } from 'vitest';
import { PlayerTank } from '../src/entities/PlayerTank';
import { Soldier } from '../src/entities/Soldier';
import { idleIntent } from '../src/entities/Unit';
import { CollisionSystem } from '../src/systems/CollisionSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { Tile } from '../src/world/Tile';
import { TileMap } from '../src/world/TileMap';
import { hold, makeBattle, run } from './helpers';

describe('tank movement collision', () => {
  it('cannot drive through brick', () => {
    const battle = makeBattle(['P..#.', '.....']);
    run(battle, 2, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(32, 5);
    expect(battle.playerTank!.blocked).toBe(true);
  });

  it('cannot drive through steel', () => {
    const battle = makeBattle(['P..@.', '.....']);
    run(battle, 2, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(32, 5);
  });

  it('cannot drive into water', () => {
    const battle = makeBattle(['P.~..', '.....']);
    run(battle, 2, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(16, 5);
  });

  it('can drive through bushes', () => {
    const battle = makeBattle(['P.%..', '.....']);
    run(battle, 3, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(64, 5);
  });

  it('cannot leave the map', () => {
    const battle = makeBattle(['P....', '.....']);
    run(battle, 1, hold('left'));
    expect(battle.playerTank!.x).toBe(0);
    run(battle, 1, hold('up'));
    expect(battle.playerTank!.y).toBe(0);
    run(battle, 3, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(battle.map.width - 16, 5);
    run(battle, 3, hold('down'));
    expect(battle.playerTank!.y).toBeCloseTo(battle.map.height - 16, 5);
  });

  it('is blocked by other tanks', () => {
    const battle = makeBattle(['P....', '.....']);
    battle.addEnemy('basic', 48, 0);
    run(battle, 2, hold('right'));
    expect(battle.playerTank!.x).toBeCloseTo(32, 5);
  });

  it('snaps to the tile grid when turning onto the other axis', () => {
    const battle = makeBattle(['.....', 'P....', '.....']);
    const player = battle.playerTank!;
    player.direction = 'right';
    player.x = 13;
    run(battle, 0.05, hold('down'));
    expect(player.x).toBe(16);
    expect(player.direction).toBe('down');
  });

  it('slides into a one-tank corridor after turning', () => {
    // Tile-level map: a 2-tile wide vertical gap at columns 4-5.
    const map = TileMap.fromRows(['........', '........', '####..##', '####..##', '####..##']);
    const tank = new PlayerTank(35, 0);
    tank.direction = 'right';
    tank.intent = { ...idleIntent(), direction: 'down', move: true };
    const movement = new MovementSystem(new CollisionSystem(map));
    for (let i = 0; i < 240; i++) movement.update(1 / 120, [tank], [tank]);
    expect(tank.x).toBe(32);
    expect(tank.y).toBeGreaterThan(16);
  });
});

describe('soldier movement', () => {
  /** Tile-level map with a one-tile gap in a brick wall at column 3, and water further down. */
  const GAP = ['........', '........', '###.####', '........', '~~~~~~~~', '........'];

  it('squeezes through a one-tile gap that stops a tank', () => {
    const map = TileMap.fromRows(GAP);
    const movement = new MovementSystem(new CollisionSystem(map));
    const soldier = new Soldier('player', 24, 0);
    soldier.intent = { ...idleIntent(), direction: 'down', move: true };
    const tank = new PlayerTank(24, 0);
    tank.intent = { ...idleIntent(), direction: 'down', move: true };
    for (let i = 0; i < 120; i++) movement.update(1 / 120, [soldier], []);
    for (let i = 0; i < 120; i++) movement.update(1 / 120, [tank], []);
    expect(soldier.y).toBeCloseTo(24, 5);
    expect(tank.y).toBe(0);
  });

  it('cannot wade into water', () => {
    const map = TileMap.fromRows(GAP);
    const movement = new MovementSystem(new CollisionSystem(map));
    const soldier = new Soldier('player', 0, 24);
    soldier.intent = { ...idleIntent(), direction: 'down', move: true };
    for (let i = 0; i < 240; i++) movement.update(1 / 120, [soldier], []);
    expect(soldier.y).toBeCloseTo(24, 5);
  });

  it('is blocked by tanks, wrecks included', () => {
    const battle = makeBattle(['.....', '.....']);
    const enemy = battle.addEnemy('basic', 32, 0);
    battle.damageTank(enemy, 999, enemy);
    const crew = battle.soldiers[0];
    crew.x = 0;
    crew.y = 4;
    crew.direction = 'right';
    const movement = new MovementSystem(new CollisionSystem(battle.map));
    crew.intent = { ...idleIntent(), direction: 'right', move: true };
    for (let i = 0; i < 240; i++) movement.update(1 / 120, [crew], battle.tanks);
    expect(crew.x).toBeCloseTo(24, 5);
  });
});

describe('shell collision', () => {
  it('stops at steel without damaging it', () => {
    const battle = makeBattle(['.@.', '...', '.P.']);
    battle.fire(battle.playerTank!);
    run(battle, 1);
    expect(battle.shells).toHaveLength(0);
    expect(battle.map.get(2, 1)).toBe(Tile.Steel);
    expect(battle.map.get(3, 1)).toBe(Tile.Steel);
  });

  it('damages the brick strip in front of it', () => {
    const battle = makeBattle(['.#.', '...', '.P.']);
    battle.fire(battle.playerTank!);
    run(battle, 1);
    expect(battle.map.healthAt(2, 1)).toBe(1);
    expect(battle.map.healthAt(3, 1)).toBe(1);
    expect(battle.map.healthAt(2, 0)).toBe(2);
  });

  it('passes over water and bushes', () => {
    const battle = makeBattle(['.@.', '.~.', '.%.', '.P.']);
    battle.fire(battle.playerTank!);
    run(battle, 0.15);
    expect(battle.shells).toHaveLength(1);
    expect(battle.shells[0].y).toBeLessThan(32);
  });

  it('disappears outside the map', () => {
    const battle = makeBattle(['...', '.P.']);
    battle.fire(battle.playerTank!);
    run(battle, 1);
    expect(battle.shells).toHaveLength(0);
    expect(battle.drainEvents().some((e) => e.type === 'shellImpact' && e.surface === 'edge')).toBe(true);
  });

  it('hits enemy tanks', () => {
    const battle = makeBattle(['...', '...', '...', '.P.']);
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.fire(battle.playerTank!);
    run(battle, 1);
    expect(enemy.health.current).toBeLessThan(enemy.health.max);
    expect(battle.shells).toHaveLength(0);
  });

  it('cancels out against an opposing shell', () => {
    const battle = makeBattle(['...', '...', '...', '...', '.P.']);
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.fire(battle.playerTank!);
    battle.fire(enemy);
    run(battle, 1);
    expect(battle.shells).toHaveLength(0);
    expect(enemy.health.current).toBe(enemy.health.max);
    expect(battle.drainEvents().some((e) => e.type === 'shellImpact' && e.surface === 'shell')).toBe(true);
  });

  it('only hits the contact row, across a tank-wide strip', () => {
    const map = TileMap.fromRows(['....', '####', '####', '....']);
    const collision = new CollisionSystem(map);
    const hit = collision.shellTileHit({ x: 14, y: 22, w: 4, h: 4 }, 'up');
    expect(hit?.tiles).toEqual([
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ]);
  });
});
