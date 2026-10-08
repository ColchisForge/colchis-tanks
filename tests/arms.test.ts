import { describe, expect, it } from 'vitest';
import type { Battle } from '../src/game/Battle';
import type { BattleEvent } from '../src/game/BattleEvents';
import { MINE_CONFIG, ROCKET_CONFIG, SUPPLY_CONFIG } from '../src/game/GameConfig';
import { Tile } from '../src/world/Tile';
import { hold, makeBattle, run, TICK } from './helpers';

const FIELD = ['...................', '...................', '...................', '...................', 'P..................'];

/** Knocks the player's tank out so the crew bails out, and returns the crew on foot. */
function bailOut(battle: Battle) {
  const tank = battle.playerTank!;
  tank.effects.clear();
  battle.damageTank(tank, 999, tank);
  battle.drainEvents();
  return battle.playerOnFoot!;
}

function collect(battle: Battle, seconds: number, command = hold(null)): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) {
    battle.update(TICK, command);
    events.push(...battle.drainEvents());
  }
  return events;
}

describe('anti-tank rockets', () => {
  it('a crew bailing out of a knocked-out tank takes one rocket with it', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    expect(crew.rockets).toBe(1);
  });

  it('a rocket destroys a working tank outright, with its crew inside', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    const enemy = battle.addEnemy('basic', 112, 8);
    crew.x = 40;
    crew.y = 12;
    crew.direction = 'right';
    const events = collect(battle, 1.5, hold(null, true));
    expect(enemy.active).toBe(false);
    expect(crew.rockets).toBe(0);
    expect(events.some((e) => e.type === 'tankDestroyed' && e.team === 'enemy')).toBe(true);
    expect(events.some((e) => e.type === 'tankDisabled' && e.team === 'enemy')).toBe(false);
    expect(events.some((e) => e.type === 'soldierKilled' && e.team === 'enemy')).toBe(true);
    expect(battle.soldiers.some((s) => s.team === 'enemy')).toBe(false);
    expect(battle.kills.basic).toBe(1);
  });

  it('accelerates after launch, as its motor burns', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    crew.direction = 'up';
    battle.update(TICK, hold(null, true));
    const rocket = battle.shells.find((shell) => shell.kind === 'rocket')!;
    const launch = rocket.speed;
    run(battle, 0.2);
    expect(launch).toBeLessThan(ROCKET_CONFIG.launchSpeed + 10);
    expect(rocket.speed).toBeGreaterThan(launch * 2);
  });

  it('firing calls in a fresh rocket crate, and walking over it reloads', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    crew.direction = 'up';
    battle.update(TICK, hold(null, true));
    expect(crew.rockets).toBe(0);
    expect(battle.supplies.count('rocket')).toBe(1);
    const crate = battle.supplies.crates[0];
    crew.x = crate.x;
    crew.y = crate.y;
    battle.update(TICK, hold(null));
    expect(crew.rockets).toBe(1);
    expect(battle.supplies.count('rocket')).toBe(0);
  });

  it('a crew can only carry one rocket, and leaves spare crates on the map', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    const crate = battle.supplies.drop('rocket', crew)!;
    crew.x = crate.x;
    crew.y = crate.y;
    battle.update(TICK, hold(null));
    expect(crew.rockets).toBe(ROCKET_CONFIG.carry);
    expect(battle.supplies.crates).toContain(crate);
  });

  it('never more than a couple of rocket crates wait on the map', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    for (let i = 0; i < 5; i++) battle.supplies.drop('rocket', crew);
    expect(battle.supplies.count('rocket')).toBe(SUPPLY_CONFIG.maxRocketCrates);
  });

  it('a shield stops a rocket', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    const enemy = battle.addEnemy('heavy', 112, 8);
    enemy.effects.add('shield', 10);
    crew.x = 40;
    crew.y = 12;
    crew.direction = 'right';
    collect(battle, 1.5, hold(null, true));
    expect(enemy.active).toBe(true);
    expect(enemy.operational).toBe(true);
  });

  it('blows a wider hole in brick than a shell', () => {
    const battle = makeBattle(['...................', '..........#........', '..........#........', '...................', 'P..................']);
    const crew = bailOut(battle);
    crew.x = 40;
    crew.y = 28;
    crew.direction = 'right';
    collect(battle, 1.5, hold(null, true));
    let destroyed = 0;
    for (let row = 2; row <= 5; row++) for (const col of [20, 21]) if (battle.map.get(col, row) === Tile.Empty) destroyed++;
    // A shell only takes out a two-tile strip; the rocket clears a 3x3 block around the impact.
    expect(destroyed).toBeGreaterThanOrEqual(5);
  });

  it('an enemy crew with a rocket lines up on the player and fires', () => {
    const battle = makeBattle(FIELD, { ai: true });
    const player = battle.playerTank!;
    player.effects.clear();
    const enemy = battle.addEnemy('basic', 160, 64);
    battle.damageTank(enemy, 999, player);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.rockets = 1;
    crew.x = player.x + 4;
    crew.y = 8;
    crew.brain.enter('HIDE');
    const events = collect(battle, ROCKET_CONFIG.aimTime + 1.5);
    expect(events.some((e) => e.type === 'shot' && e.weapon === 'rocket' && e.team === 'enemy')).toBe(true);
    expect(player.active).toBe(false);
  });
});

describe('fair rockets', () => {
  it('an enemy crew will not fire through a tank standing in the way', () => {
    const battle = makeBattle(FIELD, { ai: true });
    const player = battle.playerTank!;
    player.effects.clear();
    const enemy = battle.addEnemy('basic', 160, 64);
    battle.damageTank(enemy, 999, player);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.rockets = 1;
    crew.x = player.x + 4;
    crew.y = 0;
    crew.brain.enter('HIDE');
    // A wreck between the crew and the player's tank.
    const blocker = battle.addEnemy('heavy', player.x, 24);
    battle.damageTank(blocker, 999, player);
    for (const s of battle.soldiers) if (s !== crew && s.team === 'enemy') s.active = false;
    const events = collect(battle, ROCKET_CONFIG.aimTime + 1);
    expect(events.some((e) => e.type === 'shot' && e.weapon === 'rocket')).toBe(false);
    expect(player.active).toBe(true);
  });

  it('warns before it fires', () => {
    const battle = makeBattle(FIELD, { ai: true });
    const player = battle.playerTank!;
    player.effects.clear();
    const enemy = battle.addEnemy('basic', 160, 64);
    battle.damageTank(enemy, 999, player);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.rockets = 1;
    crew.x = player.x + 4;
    crew.y = 8;
    crew.brain.enter('HIDE');
    const events = collect(battle, ROCKET_CONFIG.aimTime + 1);
    const warned = events.findIndex((e) => e.type === 'rocketAiming');
    const fired = events.findIndex((e) => e.type === 'shot' && e.weapon === 'rocket');
    expect(warned).toBeGreaterThanOrEqual(0);
    expect(fired).toBeGreaterThan(warned);
  });
});

describe('anti-tank mines', () => {
  /** A crew on foot with a mine to plant, standing in the open. */
  function sapper() {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    crew.mines = 1;
    crew.x = 80;
    crew.y = 16;
    return { battle, crew };
  }

  it('plants a mine on the tile underfoot with the secondary key', () => {
    const { battle, crew } = sapper();
    battle.update(TICK, hold(null, false, { fireSecondary: true }));
    expect(battle.minefield.mines.length).toBe(1);
    expect(crew.mines).toBe(0);
    const mine = battle.minefield.mines[0];
    expect(mine.x).toBe(80);
    expect(mine.y).toBe(16);
    expect(mine.armed).toBe(false);
  });

  it('a tank rolling over an armed mine is knocked out; its crew bails out', () => {
    const { battle, crew } = sapper();
    battle.update(TICK, hold(null, false, { fireSecondary: true }));
    crew.x = 8;
    crew.y = 0;
    run(battle, MINE_CONFIG.armTime + 0.1);
    expect(battle.minefield.mines[0].armed).toBe(true);
    const enemy = battle.addEnemy('heavy', 76, 48, { direction: 'up' });
    const events: BattleEvent[] = [];
    for (let t = 0; t < 1.5 && enemy.operational; t += TICK) {
      enemy.intent = { direction: 'up', move: true, fire: false, fireSecondary: false, use: false };
      battle.update(TICK, hold(null));
      events.push(...battle.drainEvents());
    }
    expect(events.some((e) => e.type === 'mineExploded')).toBe(true);
    expect(enemy.disabled).toBe(true);
    expect(enemy.integrity.current).toBeLessThan(enemy.integrity.max);
    expect(battle.soldiers.some((s) => s.team === 'enemy')).toBe(true);
    expect(battle.minefield.mines.length).toBe(0);
  });

  it('does nothing until it is armed', () => {
    const { battle, crew } = sapper();
    battle.update(TICK, hold(null, false, { fireSecondary: true }));
    crew.x = 8;
    crew.y = 0;
    const enemy = battle.addEnemy('basic', 76, 28, { direction: 'up' });
    for (let t = 0; t < 0.5; t += TICK) {
      enemy.intent = { direction: 'up', move: true, fire: false, fireSecondary: false, use: false };
      battle.update(TICK, hold(null));
    }
    expect(enemy.operational).toBe(true);
    expect(battle.minefield.mines.length).toBe(1);
  });

  it('crews on foot are too light to set one off', () => {
    const { battle, crew } = sapper();
    battle.update(TICK, hold(null, false, { fireSecondary: true }));
    run(battle, MINE_CONFIG.armTime + 0.1);
    run(battle, 1, hold('left'));
    run(battle, 1, hold('right'));
    expect(crew.alive).toBe(true);
    expect(battle.minefield.mines.length).toBe(1);
  });

  it('mine crates turn up over time, and only the player picks them up', () => {
    const battle = makeBattle(FIELD);
    const crew = bailOut(battle);
    run(battle, SUPPLY_CONFIG.firstMineCrate + 0.1);
    expect(battle.supplies.count('mine')).toBe(1);
    const crate = battle.supplies.crates.find((c) => c.kind === 'mine')!;
    crew.x = crate.x;
    crew.y = crate.y;
    battle.update(TICK, hold(null));
    expect(crew.mines).toBe(1);
  });
});
