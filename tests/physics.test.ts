import { describe, expect, it } from 'vitest';
import { ENEMY_PROFILES, PHYSICS_CONFIG, PLAYER_CONFIG } from '../src/game/GameConfig';
import { stoppingDistance } from '../src/systems/MovementSystem';
import { findPath, steerVehicle, tileOf } from '../src/systems/Pathfinder';
import { SURFACE_PROPERTIES, Surface } from '../src/world/Surface';
import { hold, makeBattle, run, TICK } from './helpers';

/** A long, empty strip: the player starts at the left, facing right after the first input. */
const STRIP = ['P..................', '...................', '...................'];

/** Holds right until the tank is at full speed, then lets go and returns how far it coasted. */
function coastAfterFullSpeed(land: 'grassland' | 'snow'): number {
  const battle = makeBattle(STRIP, { land });
  const tank = battle.playerTank!;
  run(battle, 1.5, hold('right'));
  const released = tank.x;
  run(battle, 2);
  return tank.x - released;
}

describe('tank physics', () => {
  it('accelerates up to top speed instead of jumping to it', () => {
    const battle = makeBattle(STRIP);
    const tank = battle.playerTank!;
    run(battle, 0.05, hold('right'));
    expect(tank.velocity.x).toBeGreaterThan(0);
    expect(tank.velocity.x).toBeLessThan(PLAYER_CONFIG.speed * 0.5);
    run(battle, 1, hold('right'));
    expect(tank.velocity.x).toBeCloseTo(PLAYER_CONFIG.speed, 5);
  });

  it('keeps rolling for a moment after the driver lets go', () => {
    const coast = coastAfterFullSpeed('grassland');
    expect(coast).toBeGreaterThan(2);
    expect(coast).toBeCloseTo(stoppingDistance(PLAYER_CONFIG.speed, PLAYER_CONFIG.braking, 1), 0);
  });

  it('slides much further before stopping on snow', () => {
    const grass = coastAfterFullSpeed('grassland');
    const snow = coastAfterFullSpeed('snow');
    expect(snow).toBeGreaterThan(grass * 2);
    expect(snow).toBeCloseTo(stoppingDistance(PLAYER_CONFIG.speed, PLAYER_CONFIG.braking, SURFACE_PROPERTIES[Surface.Snow].grip), 0);
  });

  it('spins its tracks pulling away on snow, so it takes longer to get up to speed', () => {
    const grass = makeBattle(STRIP);
    const snow = makeBattle(STRIP, { land: 'snow' });
    run(grass, 0.15, hold('right'));
    run(snow, 0.15, hold('right'));
    expect(snow.playerTank!.velocity.x).toBeLessThan(grass.playerTank!.velocity.x);
    expect(snow.playerTank!.slip).toBeGreaterThan(0);
    expect(grass.playerTank!.slip).toBe(0);
  });

  it('is slowed by a dirt road in proportion to its speed', () => {
    const battle = makeBattle(STRIP, { roads: ['===================', '...................', '...................'] });
    const tank = battle.playerTank!;
    run(battle, 2, hold('right'));
    expect(tank.velocity.x).toBeCloseTo(PLAYER_CONFIG.speed * SURFACE_PROPERTIES[Surface.Road].trackedSpeed, 5);
  });

  it('drifts sideways through a turn on snow, but barely at all on grass', () => {
    const drift = (land: 'grassland' | 'snow') => {
      const battle = makeBattle(STRIP, { land });
      const tank = battle.playerTank!;
      run(battle, 1.5, hold('right'));
      run(battle, TICK, hold('down'));
      const turnedAt = tank.x;
      run(battle, 0.6, hold('down'));
      return Math.abs(tank.x - turnedAt);
    };
    expect(drift('snow')).toBeGreaterThan(3);
    expect(drift('snow')).toBeGreaterThan(drift('grassland') * 3);
  });

  it('heavy tanks are sluggish: they take longer to reach their (lower) top speed', () => {
    const timeToSpeed = (kind: 'heavy' | 'fast') => {
      const battle = makeBattle(STRIP);
      const enemy = battle.addEnemy(kind, 0, 32, { direction: 'right' });
      enemy.intent = { direction: 'right', move: true, fire: false, fireSecondary: false, use: false };
      let t = 0;
      while (enemy.velocity.x < ENEMY_PROFILES[kind].speed * 0.95 && t < 3) {
        battle.update(TICK, hold(null));
        enemy.intent = { direction: 'right', move: true, fire: false, fireSecondary: false, use: false };
        t += TICK;
      }
      return t;
    };
    expect(timeToSpeed('heavy')).toBeGreaterThan(timeToSpeed('fast'));
  });

  it('stops dead when it runs into a wall, and the impact is reported', () => {
    const battle = makeBattle(['P.....#.....', '............']);
    const tank = battle.playerTank!;
    const impacts: number[] = [];
    for (let t = 0; t < 3; t += TICK) {
      battle.update(TICK, hold('right'));
      for (const event of battle.drainEvents()) if (event.type === 'tankImpact') impacts.push(event.speed);
    }
    expect(tank.x).toBeCloseTo(80, 5);
    expect(tank.velocity.x).toBe(0);
    expect(impacts.length).toBe(1);
    expect(impacts[0]).toBeGreaterThan(PHYSICS_CONFIG.impactThreshold);
  });
});

describe('AI drivers', () => {
  it('let off the throttle in time to make the next turn', () => {
    const battle = makeBattle(STRIP);
    const tank = battle.addEnemy('fast', 0, 16, { direction: 'right' });
    tank.velocity.x = ENEMY_PROFILES.fast.speed;
    // Straight along row 2 to column 10, then down.
    const corner = [{ col: 10, row: 2 }, { col: 10, row: 3 }, { col: 10, row: 4 }];
    const far = [...Array.from({ length: 9 }, (_, i) => ({ col: i + 1, row: 2 })), ...corner];
    expect(steerVehicle(tank, far, battle.map)).toEqual({ direction: 'right', move: true });
    tank.x = 78;
    expect(steerVehicle(tank, [...corner], battle.map)).toEqual({ direction: 'right', move: false });
  });

  it('prefer the road to the slippery snow', () => {
    // Two ways from the left to the right edge: straight across the snow, or round by the road.
    const battle = makeBattle(['.........', '.........', '.........', '.........'], {
      land: 'snow',
      roads: ['=========', '=........', '=........', '=........'],
    });
    const enemy = battle.addEnemy('basic', 0, 48, { direction: 'right' });
    const route = findPath(battle.map, { start: tileOf(enemy), size: 2, mobility: 'tracked', brickCost: 6, isGoal: (col) => col === 16 })!;
    const onRoad = route.filter((step) => battle.map.surfaceAt(step.col, step.row) === Surface.Road).length;
    expect(onRoad).toBeGreaterThan(route.length / 2);
  });
});
