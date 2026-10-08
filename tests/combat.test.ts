import { describe, expect, it } from 'vitest';
import { Bullet } from '../src/entities/Bullet';
import { ENEMY_PROFILES, MACHINE_GUN_CONFIG, PLAYER_CONFIG, SCORE_CONFIG, SOLDIER_CONFIG, WRECK_CONFIG } from '../src/game/GameConfig';
import { Session } from '../src/game/Session';
import { Tile } from '../src/world/Tile';
import { hold, makeBattle, run } from './helpers';

/** Player at the bottom of a 3-wide corridor, facing up. */
const CORRIDOR = ['...', '...', '...', '...', '.P.'];

describe('tank damage', () => {
  it('loses health when hit instead of exploding at once', () => {
    const battle = makeBattle(CORRIDOR);
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.fire(battle.playerTank!);
    run(battle, 1);
    expect(enemy.health.current).toBe(ENEMY_PROFILES.basic.maxHealth - PLAYER_CONFIG.shellDamage);
    expect(enemy.manned).toBe(true);
  });

  it('is disabled, not destroyed, when its health runs out, and the crew bails out', () => {
    const battle = makeBattle(CORRIDOR);
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.fire(battle.playerTank!);
    run(battle, 0.6);
    battle.fire(battle.playerTank!);
    run(battle, 0.6);
    expect(enemy.disabled).toBe(true);
    expect(enemy.manned).toBe(false);
    expect(battle.enemies).toContain(enemy);
    expect(battle.soldiers.filter((s) => s.team === 'enemy')).toHaveLength(1);
    const events = battle.drainEvents();
    expect(events.some((e) => e.type === 'tankDisabled' && e.team === 'enemy')).toBe(true);
    expect(events.some((e) => e.type === 'crewBailedOut')).toBe(true);
  });

  it('a wreck still blocks tanks and can be blown apart with more hits', () => {
    const battle = makeBattle(CORRIDOR);
    const player = battle.playerTank!;
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.damageTank(enemy, 999, player);
    run(battle, 2, hold('up'));
    expect(player.y).toBeCloseTo(16, 5);

    battle.damageTank(enemy, WRECK_CONFIG.integrity - 1, player);
    expect(enemy.active).toBe(true);
    battle.damageTank(enemy, 1, player);
    expect(enemy.active).toBe(false);
    run(battle, 0.01);
    expect(battle.enemies).not.toContain(enemy);
    expect(battle.wrecksDestroyed).toBe(1);
  });

  it('heavy tanks need several hits', () => {
    const battle = makeBattle(CORRIDOR);
    const heavy = battle.addEnemy('heavy', 16, 0);
    const player = battle.playerTank!;
    for (let hit = 0; hit < 4; hit++) battle.damageTank(heavy, PLAYER_CONFIG.shellDamage, player);
    expect(heavy.operational).toBe(true);
    battle.damageTank(heavy, PLAYER_CONFIG.shellDamage, player);
    expect(heavy.operational).toBe(false);
  });

  it('awards points by enemy type, plus extras for crews and wrecks', () => {
    const session = new Session();
    const battle = makeBattle(CORRIDOR, { session });
    const player = battle.playerTank!;
    battle.damageTank(battle.addEnemy('basic', 0, 0), 999, player);
    expect(session.score).toBe(100);
    battle.damageTank(battle.addEnemy('fast', 0, 0), 999, player);
    expect(session.score).toBe(250);
    const heavy = battle.addEnemy('heavy', 0, 0);
    battle.damageTank(heavy, 999, player);
    expect(session.score).toBe(550);
    expect(battle.kills).toEqual({ basic: 1, fast: 1, heavy: 1 });

    battle.damageSoldier(battle.soldiers[0], 99, player);
    expect(session.score).toBe(550 + SCORE_CONFIG.crewKill);
    battle.damageTank(heavy, 999, player);
    expect(session.score).toBe(550 + SCORE_CONFIG.crewKill + SCORE_CONFIG.wreck);
  });

  it('never damages the tank that fired the shell', () => {
    const battle = makeBattle(CORRIDOR);
    const player = battle.playerTank!;
    player.effects.clear();
    const c = player.center;
    battle.shells.push(
      new Bullet(player, c.x, c.y, 'up', { kind: 'shell', speed: 100, damage: 50, personnelDamage: 99, tileDamage: 1, range: Infinity }),
    );
    run(battle, 0.2);
    expect(player.health.current).toBe(player.health.max);
  });

  it('enemy shells pass through other enemies', () => {
    const battle = makeBattle(CORRIDOR);
    const shooter = battle.addEnemy('basic', 16, 0);
    const friend = battle.addEnemy('basic', 16, 24);
    battle.fire(shooter);
    run(battle, 0.15);
    expect(friend.health.current).toBe(friend.health.max);
  });
});

describe('firing', () => {
  it('respects the cannon cooldown', () => {
    const battle = makeBattle(CORRIDOR);
    const player = battle.playerTank!;
    expect(battle.fire(player)).not.toBeNull();
    expect(battle.fire(player)).toBeNull();
    run(battle, PLAYER_CONFIG.fireCooldown + 0.02);
    expect(battle.fire(player)).not.toBeNull();
  });

  it('limits shells in flight', () => {
    const battle = makeBattle(['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', 'P']);
    const player = battle.playerTank!;
    for (let i = 0; i < 5; i++) {
      battle.fire(player);
      run(battle, PLAYER_CONFIG.fireCooldown + 0.01);
    }
    expect(battle.shells.length).toBeLessThanOrEqual(PLAYER_CONFIG.maxShells);
  });

  it('an empty or disabled tank cannot fire', () => {
    const battle = makeBattle(CORRIDOR);
    const enemy = battle.addEnemy('basic', 16, 0);
    battle.damageTank(enemy, 999, battle.playerTank!);
    expect(battle.fire(enemy)).toBeNull();
    expect(battle.fire(enemy, 'machineGun')).toBeNull();
  });
});

describe('machine gun', () => {
  it('is fired by holding the secondary trigger and is short-ranged', () => {
    const battle = makeBattle(['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', 'P']);
    run(battle, 0.05, hold(null, false, { fireSecondary: true }));
    expect(battle.shells.some((shell) => shell.kind === 'bullet')).toBe(true);
    run(battle, 2);
    // The map is 208px tall: bullets give out before the far edge.
    expect(battle.drainEvents().some((e) => e.type === 'shellImpact' && e.surface === 'edge' && e.weapon === 'machineGun')).toBe(false);
    expect(MACHINE_GUN_CONFIG.range).toBeLessThan(battle.map.height - 16);
  });

  it('cuts down soldiers but leaves armour and walls untouched', () => {
    const battle = makeBattle(['.#.', '...', '...', '...', '.P.']);
    const player = battle.playerTank!;
    const enemy = battle.addEnemy('basic', 16, 16);
    battle.fire(player, 'machineGun');
    run(battle, 0.5);
    expect(enemy.health.current).toBe(enemy.health.max);

    battle.damageTank(enemy, 999, player);
    battle.damageTank(enemy, 999, player);
    run(battle, 0.01);
    const crew = battle.soldiers.find((s) => s.team === 'enemy')!;
    crew.x = 20;
    crew.y = 24;
    for (let i = 0; i < SOLDIER_CONFIG.maxHealth; i++) {
      run(battle, MACHINE_GUN_CONFIG.fireCooldown + 0.01);
      battle.fire(player, 'machineGun');
      run(battle, 0.3);
    }
    expect(crew.alive).toBe(false);

    battle.fire(player, 'machineGun');
    run(battle, 0.5);
    expect(battle.map.healthAt(2, 1)).toBe(2);
  });

  it('cannot destroy the base', () => {
    const battle = makeBattle(['.H.', '...', '...', '.P.']);
    // Clear the brick ring below the base so bullets reach it.
    for (let col = 1; col <= 4; col++) battle.map.set(col, 2, Tile.Empty);
    for (let i = 0; i < 20; i++) {
      battle.fire(battle.playerTank!, 'machineGun');
      run(battle, 0.15);
    }
    expect(battle.map.base!.destroyed).toBe(false);
  });
});

describe('destructible terrain', () => {
  it('destroys a brick after enough hits and really removes it from the map', () => {
    const battle = makeBattle(['.-.', '...', '.P.']);
    const player = battle.playerTank!;
    expect(battle.map.get(2, 0)).toBe(Tile.Brick);

    battle.fire(player);
    run(battle, 0.5);
    expect(battle.map.get(2, 0)).toBe(Tile.Brick);
    expect(battle.map.healthAt(2, 0)).toBe(1);

    battle.fire(player);
    run(battle, 0.5);
    expect(battle.map.get(2, 0)).toBe(Tile.Empty);
    expect(battle.map.get(3, 0)).toBe(Tile.Empty);

    // The gap is real: the tank can now drive all the way to the top edge.
    run(battle, 2, hold('up'));
    expect(player.y).toBeCloseTo(0, 5);
  });
});
