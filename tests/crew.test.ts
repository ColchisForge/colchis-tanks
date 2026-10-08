import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/geometry';
import { NO_COMMAND } from '../src/game/Battle';
import { REPAIR_CONFIG } from '../src/game/GameConfig';
import { Perception } from '../src/systems/Perception';
import { TileMap } from '../src/world/TileMap';
import { hold, makeBattle, pressUse, run, TICK } from './helpers';

const OPEN = ['.....', '.....', '..P..', '.....'];
/** Roomy enough for a wrench to land a fair walk away. */
const FIELD = ['..........', '..........', '..........', '....P.....', '..........', '..........'];

describe('getting in and out', () => {
  it('the crew can climb out, leaving an empty working tank behind', () => {
    const battle = makeBattle(OPEN);
    const tank = battle.playerTank!;
    pressUse(battle);
    const crew = battle.playerOnFoot!;
    expect(crew).not.toBeNull();
    expect(tank.operational).toBe(true);
    expect(tank.manned).toBe(false);

    run(battle, 0.5, hold('left'));
    expect(crew.x).toBeLessThan(36);
    expect(tank.x).toBe(32);
  });

  it('climbs back in when standing next to the tank', () => {
    const battle = makeBattle(OPEN);
    const tank = battle.playerTank!;
    pressUse(battle);
    const crew = battle.playerOnFoot!;
    run(battle, 1, hold('left'));
    pressUse(battle);
    expect(tank.manned).toBe(false);

    crew.x = tank.x + 4;
    crew.y = tank.y + tank.h + 2;
    pressUse(battle);
    expect(tank.manned).toBe(true);
    expect(battle.playerOnFoot).toBeNull();
    expect(crew.vehicle).toBe(tank);
  });

  it('an empty tank ignores the controls', () => {
    const battle = makeBattle(OPEN);
    const tank = battle.playerTank!;
    pressUse(battle);
    run(battle, 0.5, hold('up'));
    expect(tank.y).toBe(32);
  });
});

describe('disabled tanks and repairs', () => {
  it('a disabled tank throws its crew out and drops a reachable wrench a fair walk away', () => {
    const battle = makeBattle(FIELD);
    const enemy = battle.addEnemy('basic', 0, 0);
    const tank = battle.playerTank!;
    tank.effects.clear();
    battle.damageTank(tank, 999, enemy);
    expect(tank.disabled).toBe(true);
    expect(battle.playerOnFoot).not.toBeNull();
    expect(battle.repairs.wrenches).toHaveLength(1);
    expect(distance(battle.repairs.wrenches[0].center, tank.center)).toBeGreaterThanOrEqual(REPAIR_CONFIG.wrenchMinDistance);
  });

  it('a crew member with a wrench repairs the wreck and climbs back in', () => {
    const battle = makeBattle(FIELD);
    const enemy = battle.addEnemy('basic', 0, 0);
    const tank = battle.playerTank!;
    tank.effects.clear();
    battle.damageTank(tank, 999, enemy);
    const crew = battle.playerOnFoot!;
    const wrench = battle.repairs.wrenches[0];

    crew.x = wrench.x;
    crew.y = wrench.y;
    run(battle, TICK);
    expect(crew.carryingWrench).toBe(true);
    expect(battle.repairs.wrenches).toHaveLength(0);

    crew.x = tank.x + 4;
    crew.y = tank.y + tank.h;
    run(battle, REPAIR_CONFIG.duration + 0.1);
    expect(tank.manned).toBe(true);
    expect(tank.health.ratio).toBeCloseTo(REPAIR_CONFIG.restoredHealth, 5);
    expect(crew.carryingWrench).toBe(false);
    expect(battle.playerOnFoot).toBeNull();
  });

  it('no wrench, no repair', () => {
    const battle = makeBattle(FIELD);
    const enemy = battle.addEnemy('basic', 0, 0);
    const tank = battle.playerTank!;
    tank.effects.clear();
    battle.damageTank(tank, 999, enemy);
    const crew = battle.playerOnFoot!;
    crew.x = tank.x + 4;
    crew.y = tank.y + tank.h;
    run(battle, REPAIR_CONFIG.duration + 1);
    expect(tank.disabled).toBe(true);
  });

  it('a stranded crew gets a new wrench when none is left on the map', () => {
    const battle = makeBattle(FIELD);
    const enemy = battle.addEnemy('basic', 0, 0);
    battle.playerTank!.effects.clear();
    battle.damageTank(battle.playerTank!, 999, enemy);
    battle.repairs.wrenches.length = 0;
    run(battle, REPAIR_CONFIG.playerWrenchDelay + 0.1);
    expect(battle.repairs.wrenches).toHaveLength(1);
  });

  it('if the wreck is destroyed, an empty replacement waits at the spawn point', () => {
    const battle = makeBattle(FIELD);
    const enemy = battle.addEnemy('basic', 0, 0);
    const wreck = battle.playerTank!;
    wreck.effects.clear();
    battle.damageTank(wreck, 999, enemy);
    const crew = battle.playerOnFoot!;
    crew.x = 0;
    crew.y = 80;
    battle.damageTank(wreck, 999, enemy);
    expect(battle.playerTank).toBeNull();

    run(battle, REPAIR_CONFIG.replacementDelay + 0.1);
    const replacement = battle.playerTank!;
    expect(replacement).not.toBeNull();
    expect(replacement.manned).toBe(false);
    crew.x = replacement.x + 4;
    crew.y = replacement.y + replacement.h;
    pressUse(battle);
    expect(replacement.manned).toBe(true);
  });
});

describe('danger on foot', () => {
  it('enemy tanks run over crews on foot', () => {
    const battle = makeBattle(['.....', '..P..']);
    pressUse(battle);
    const crew = battle.playerOnFoot!;
    crew.x = 0;
    crew.y = 4;
    const enemy = battle.addEnemy('basic', 64, 0, { direction: 'left' });
    enemy.intent = { ...NO_COMMAND, move: true, direction: 'left' };
    run(battle, 2);
    expect(crew.alive).toBe(false);
    expect(battle.drainEvents().some((e) => e.type === 'soldierKilled' && e.cause === 'crushed')).toBe(true);
  });

  it('a visible crew draws machine-gun fire', () => {
    const battle = makeBattle(['.....', '.....', '.....', '.....', '.....', '.....', '..P..'], { ai: true });
    pressUse(battle);
    const crew = battle.playerOnFoot!;
    crew.x = 36;
    crew.y = 64;
    battle.addEnemy('basic', 32, 0);
    let machineGun = false;
    for (let t = 0; t < 1.5 && !machineGun; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      machineGun = battle.drainEvents().some((e) => e.type === 'shot' && e.team === 'enemy' && e.weapon === 'machineGun');
    }
    expect(machineGun).toBe(true);
  });

  it('a crew hiding in a bush is left alone', () => {
    const battle = makeBattle(['.....', '.....', '.....', '.....', '..%..', '.....', '..P..'], { ai: true });
    pressUse(battle);
    const crew = battle.playerOnFoot!;
    crew.x = 36;
    crew.y = 68;
    battle.addEnemy('basic', 32, 0);
    let machineGun = false;
    for (let t = 0; t < 1.5; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      machineGun ||= battle.drainEvents().some((e) => e.type === 'shot' && e.weapon === 'machineGun');
    }
    expect(machineGun).toBe(false);
  });
});

describe('perception', () => {
  const map = TileMap.fromRows(['..........', '....#.....', '..........', '......%...', '..........']);
  const perception = new Perception(map);
  const tank = { x: 0, y: 0, w: 16, h: 16 };

  it('sees a soldier in the open', () => {
    expect(perception.canSeeSoldier(tank, { x: 64, y: 0, w: 8, h: 8 })).toBe(true);
  });

  it('cannot see through walls', () => {
    expect(perception.canSeeSoldier({ x: 16, y: 8, w: 16, h: 16 }, { x: 48, y: 8, w: 8, h: 8 })).toBe(false);
  });

  it('cannot see into bushes, unless right next to them', () => {
    const hidden = { x: 48, y: 24, w: 8, h: 8 };
    expect(perception.canSeeSoldier(tank, hidden)).toBe(false);
    expect(perception.canSeeSoldier({ x: 32, y: 24, w: 16, h: 16 }, hidden)).toBe(true);
  });
});

describe('enemy crews', () => {
  it('fetch a wrench, repair their tank and get back in', () => {
    const battle = makeBattle(['..........', '..........', '..........', '..........', '..........', '..........'], { ai: true, seed: 3 });
    const enemy = battle.addEnemy('basic', 64, 32);
    battle.damageTank(enemy, 999, enemy);
    expect(battle.soldiers).toHaveLength(1);

    let repaired = false;
    for (let t = 0; t < 30 && !repaired; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      repaired = battle.drainEvents().some((e) => e.type === 'repairComplete');
    }
    expect(repaired).toBe(true);
    expect(enemy.manned).toBe(true);
    expect(battle.soldiers).toHaveLength(0);
  });

  it('hide in bushes while waiting for a wrench', () => {
    const battle = makeBattle(['..........', '..........', '.......%%.', '..........'], { ai: true, seed: 5 });
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.damageTank(enemy, 999, enemy);
    battle.repairs.wrenches.length = 0;
    const crew = battle.soldiers[0];
    run(battle, 6);
    expect(new Perception(battle.map).isConcealed(crew)).toBe(true);
  });

  it('retreat to their own lines when their tank is gone for good', () => {
    const battle = makeBattle(['S.........', '..........', '..........', '..........'], { ai: true, seed: 5 });
    const enemy = battle.addEnemy('basic', 128, 32);
    battle.damageTank(enemy, 999, enemy);
    battle.damageTank(enemy, 999, enemy);
    const crew = battle.soldiers[0];
    expect(battle.enemiesRemaining).toBe(1);
    let escaped = false;
    for (let t = 0; t < 12 && !escaped; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      escaped = battle.drainEvents().some((e) => e.type === 'crewEscaped');
    }
    expect(escaped).toBe(true);
    expect(crew.active).toBe(false);
    expect(battle.enemiesRemaining).toBe(0);
  });
});
