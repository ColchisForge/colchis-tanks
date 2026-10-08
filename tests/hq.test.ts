import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/geometry';
import type { Battle } from '../src/game/Battle';
import type { BattleEvent } from '../src/game/BattleEvents';
import { ENEMY_BASE_CONFIG, MACHINE_GUN_CONFIG, TILE_SIZE } from '../src/game/GameConfig';
import { parseLevel } from '../src/world/Level';
import { LEVELS } from '../src/world/levels';
import { Tile } from '../src/world/Tile';
import { hold, makeBattle, TICK } from './helpers';

/** The enemy HQ at the top centre, a long open field below it, the player at the bottom. */
const FIELD = [
  '....E....',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....P....',
];

/** There are no spawn points, so a roster stays pending and keeps the battle from ending. */
const ONGOING = { roster: 'B' };

function collect(battle: Battle, seconds: number, command = hold(null)): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) {
    battle.update(TICK, command);
    events.push(...battle.drainEvents());
  }
  return events;
}

/** Clears the HQ's fortification so shots reach the bunker itself. */
function strip(battle: Battle): void {
  const hq = battle.map.enemyBase!;
  for (let row = hq.row - 1; row <= hq.row + 3; row++) {
    for (let col = hq.col - 1; col <= hq.col + 2; col++) {
      const type = battle.map.get(col, row);
      if (type === Tile.Brick || type === Tile.Steel) battle.map.set(col, row, Tile.Empty);
    }
  }
}

describe('the enemy HQ', () => {
  it('stands at the top of every level, dug in behind brick, steel and a second wall', () => {
    for (const definition of LEVELS) {
      const level = parseLevel(definition);
      const hq = level.enemyBase!;
      expect(hq).not.toBeNull();
      const at = (col: number, row: number) => level.tiles[row * level.cols + col];
      expect(at(hq.col, hq.row)).toBe(Tile.EnemyBase);
      expect(at(hq.col - 1, hq.row)).toBe(Tile.Brick);
      expect(at(hq.col - 1, hq.row + 2)).toBe(Tile.Steel);
      expect(at(hq.col + 2, hq.row + 2)).toBe(Tile.Steel);
      expect(at(hq.col, hq.row + 2)).toBe(Tile.Brick);
      expect(at(hq.col, hq.row + 3)).toBe(Tile.Brick);
    }
  });

  it('takes the player\'s shells and falls after enough hits, winning the level', () => {
    const battle = makeBattle(FIELD, ONGOING);
    strip(battle);
    const player = battle.playerTank!;
    const hq = battle.map.enemyBase!;
    player.x = hq.col * TILE_SIZE;
    player.y = 6 * TILE_SIZE;
    player.direction = 'up';
    const events: BattleEvent[] = [];
    for (let i = 0; i < ENEMY_BASE_CONFIG.health + 2 && !hq.destroyed; i++) {
      battle.fire(player);
      events.push(...collect(battle, 0.5));
    }
    expect(hq.destroyed).toBe(true);
    expect(battle.outcome).toBe('victory');
    expect(battle.victoryReason).toBe('hq');
    expect(events.filter((e) => e.type === 'enemyBaseHit').length).toBe(ENEMY_BASE_CONFIG.health - 1);
    expect(events.some((e) => e.type === 'enemyBaseDestroyed')).toBe(true);
  });

  it('is never damaged by the enemy\'s own fire', () => {
    const battle = makeBattle(FIELD, ONGOING);
    strip(battle);
    const hq = battle.map.enemyBase!;
    const enemy = battle.addEnemy('heavy', hq.col * TILE_SIZE, 6 * TILE_SIZE, { direction: 'up' });
    for (let i = 0; i < 6; i++) {
      battle.fire(enemy);
      collect(battle, 0.6);
    }
    expect(hq.health).toBe(ENEMY_BASE_CONFIG.health);
  });

  it('takes several hits\' worth from a rocket', () => {
    const battle = makeBattle(FIELD, ONGOING);
    battle.onBaseHit('enemy', ENEMY_BASE_CONFIG.rocketDamage);
    expect(battle.map.enemyBase!.health).toBe(ENEMY_BASE_CONFIG.health - ENEMY_BASE_CONFIG.rocketDamage);
  });

  it('a level is still won the old way, by beating every enemy', () => {
    const battle = makeBattle(FIELD);
    collect(battle, 0.2);
    expect(battle.outcome).toBe('victory');
    expect(battle.victoryReason).toBe('cleared');
  });
});

describe('defending the HQ', () => {
  it('sounds the alarm when the player comes close, once', () => {
    const battle = makeBattle(FIELD, { ai: true, roster: 'BBB' });
    const player = battle.playerTank!;
    const hq = battle.enemyBaseTarget!;
    expect(battle.enemyAlarm).toBe(false);
    player.y = hq.y + ENEMY_BASE_CONFIG.alarmRadius - 30;
    const events = collect(battle, 1);
    expect(battle.enemyAlarm).toBe(true);
    expect(events.filter((e) => e.type === 'enemyAlarm').length).toBe(1);
  });

  it('pulls the nearest tanks off their duties to hunt the intruder', () => {
    const battle = makeBattle(FIELD, { ai: true });
    const player = battle.playerTank!;
    const hq = battle.enemyBaseTarget!;
    const tanks = [battle.addEnemy('basic', 0, 64), battle.addEnemy('basic', 128, 96), battle.addEnemy('basic', 0, 96), battle.addEnemy('basic', 128, 64)];
    collect(battle, 0.2);
    player.y = hq.y + 60;
    player.x = 0;
    collect(battle, 0.5);
    const defenders = tanks.filter((tank) => tank.brain.defending);
    expect(defenders.length).toBe(ENEMY_BASE_CONFIG.defenders);
  });

  it('keeps a guard posted around the HQ', () => {
    const battle = makeBattle(FIELD, { ai: true });
    battle.playerTank!.effects.add('shield', 99);
    const hq = battle.enemyBaseTarget!;
    const guard = battle.addEnemy('basic', 0, 48);
    collect(battle, 6);
    expect(guard.brain.role).toBe('guard');
    expect(distance(guard.center, hq)).toBeLessThanOrEqual(ENEMY_BASE_CONFIG.postRange[1] + 12);
  });

  it('rushes reinforcements in while the alarm is up', () => {
    const layout = ['S.S.E.S.S', ...FIELD.slice(1)];
    const calm = makeBattle(layout, { ai: false, roster: 'BBBBBB' });
    const alarmed = makeBattle(layout, { ai: false, roster: 'BBBBBB' });
    alarmed.onBaseHit('enemy', 1);
    collect(calm, 2.2);
    collect(alarmed, 2.2);
    expect(alarmed.enemies.length).toBeGreaterThan(calm.enemies.length);
  });
});

describe('the HQ garrison', () => {
  it('fires on a tank straight in front of the bunker', () => {
    const battle = makeBattle(FIELD, ONGOING);
    const player = battle.playerTank!;
    player.effects.clear();
    const hq = battle.map.enemyBase!;
    player.x = hq.col * TILE_SIZE;
    player.y = 9 * TILE_SIZE;
    const events = collect(battle, 3);
    expect(events.some((e) => e.type === 'shot' && e.team === 'enemy' && e.weapon === 'cannon')).toBe(true);
    expect(player.health.ratio).toBeLessThan(1);
  });

  it('cannot cover the flanks', () => {
    const battle = makeBattle(FIELD, ONGOING);
    const player = battle.playerTank!;
    player.effects.clear();
    player.x = 0;
    player.y = 4 * TILE_SIZE;
    const events = collect(battle, 3);
    expect(events.some((e) => e.type === 'shot' && e.team === 'enemy')).toBe(false);
  });

  it('machine-guns a crew on foot in front of it', () => {
    const battle = makeBattle(FIELD, ONGOING);
    const tank = battle.playerTank!;
    tank.effects.clear();
    battle.damageTank(tank, 999, tank);
    const crew = battle.playerOnFoot!;
    const hq = battle.map.enemyBase!;
    crew.x = (hq.col + 1) * TILE_SIZE - 4;
    crew.y = 8 * TILE_SIZE;
    const events = collect(battle, 2);
    expect(events.some((e) => e.type === 'shot' && e.team === 'enemy' && e.weapon === 'machineGun')).toBe(true);
  });
});

describe('enemy mines', () => {
  it('an enemy crew with a mine plants it on the approaches to its HQ', () => {
    const battle = makeBattle(FIELD, { ai: true });
    battle.playerTank!.effects.add('shield', 99);
    const enemy = battle.addEnemy('basic', 0, 96);
    battle.onTankDestroyedOutright(enemy, battle.playerTank!);
    // A crew from elsewhere, on foot with a mine and nothing else to do.
    const crewTank = battle.addEnemy('basic', 128, 96);
    battle.damageTank(crewTank, 999, battle.playerTank!);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.mines = 1;
    crewTank.active = false;
    crew.home = null;
    crew.brain.enter('HIDE');
    collect(battle, 12);
    const mine = battle.minefield.mines.find((m) => m.team === 'enemy');
    expect(mine).toBeDefined();
    const d = distance(mine!.center, battle.enemyBaseTarget!);
    expect(d).toBeGreaterThanOrEqual(36);
    expect(d).toBeLessThanOrEqual(132);
  });

  it('enemy crews pick up mine crates too', () => {
    const battle = makeBattle(FIELD, ONGOING);
    const enemy = battle.addEnemy('basic', 0, 96);
    battle.damageTank(enemy, 999, battle.playerTank!);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    const crate = battle.supplies.drop('mine', crew)!;
    crew.x = crate.x;
    crew.y = crate.y;
    battle.update(TICK, hold(null));
    expect(crew.mines).toBe(1);
  });

  it('enemy tanks steer clear of their own crews\' mines', () => {
    // A one-lane corridor: the enemy drives along it towards one of its own mines.
    const battle = makeBattle(['@@@@@@@@@', '.........', '@@@@@@@@@', '....P....'], { ai: true });
    battle.playerTank!.effects.add('shield', 99);
    const enemy = battle.addEnemy('basic', 0, 16, { direction: 'right' });
    const crewTank = battle.addEnemy('basic', 128, 48);
    battle.damageTank(crewTank, 999, battle.playerTank!);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.mines = 1;
    crew.x = 72;
    crew.y = 16;
    battle.minefield.plant(crew);
    crew.active = false;
    collect(battle, 8);
    expect(enemy.operational).toBe(true);
    expect(battle.minefield.mines.length).toBe(1);
  });
});

describe('machine-gun tracers', () => {
  it('every few rounds is a tracer, starting with the first', () => {
    const battle = makeBattle(FIELD, ONGOING);
    const player = battle.playerTank!;
    const tracers: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      const round = battle.fire(player, 'machineGun');
      if (round) tracers.push(round.tracer);
      collect(battle, MACHINE_GUN_CONFIG.fireCooldown + 0.01);
    }
    expect(tracers).toEqual([true, false, false, true, false, false, true]);
  });
});
