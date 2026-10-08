import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { Battle, NO_COMMAND } from '../src/game/Battle';
import { Session } from '../src/game/Session';
import { LevelManager } from '../src/world/LevelManager';
import { makeBattle, run, TICK } from './helpers';

describe('enemy AI', () => {
  it('changes direction when blocked', () => {
    const battle = makeBattle(['.....', '..@..', '.....', '.....'], { ai: true });
    const enemy = battle.addEnemy('basic', 32, 32, { direction: 'up' });
    enemy.brain.decisionTimer = 100;
    const start = { x: enemy.x, y: enemy.y };
    run(battle, 0.6);
    expect(enemy.direction).not.toBe('up');
    expect(Math.abs(enemy.x - start.x) + Math.abs(enemy.y - start.y)).toBeGreaterThan(4);
  });

  it('notices and chases a nearby player', () => {
    const battle = makeBattle(['.....', '.....', '...P.'], { ai: true });
    const enemy = battle.addEnemy('basic', 0, 0);
    run(battle, TICK);
    expect(enemy.brain.state).toBe('CHASE');
  });

  it('turns towards an aligned player and fires', () => {
    const battle = makeBattle(['.....', '.....', '.....', '.....', '..P..'], { ai: true });
    const enemy = battle.addEnemy('basic', 32, 0, { direction: 'left' });
    let fired = false;
    for (let t = 0; t < 1.5 && !fired; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      fired = battle.drainEvents().some((e) => e.type === 'shot' && e.team === 'enemy');
    }
    expect(fired).toBe(true);
    expect(enemy.direction).toBe('down');
  });

  it('shoots at the base when it has chosen to besiege it and is lined up', () => {
    const battle = makeBattle(['.....', '.....', '.....', '..H..'], { ai: true });
    const enemy = battle.addEnemy('basic', 32, 0, { direction: 'left' });
    enemy.brain.siege = true;
    run(battle, TICK);
    expect(enemy.brain.state).toBe('ATTACK');
    expect(enemy.brain.attackTarget).toBe('base');
  });

  it('leaves the base alone while just passing by', () => {
    const battle = makeBattle(['.....', '.....', '.....', '..H..'], { ai: true });
    const enemy = battle.addEnemy('basic', 32, 0, { direction: 'left' });
    enemy.brain.decisionTimer = 100;
    run(battle, TICK);
    expect(enemy.brain.state).not.toBe('ATTACK');
  });

  it('hunts towards a firing lane instead of ramming the target', () => {
    const battle = makeBattle(['.........', '.........', '.........', '.........', '........P'], { ai: true, seed: 2 });
    const player = battle.playerTank!;
    const enemy = battle.addEnemy('basic', 0, 0);
    enemy.brain.chaseTarget = 'player';
    enemy.brain.enter('CHASE');
    let attacked = false;
    for (let t = 0; t < 6 && !attacked; t += TICK) {
      battle.update(TICK, NO_COMMAND);
      attacked = enemy.brain.state === 'ATTACK';
    }
    expect(attacked).toBe(true);
    const c = enemy.center;
    const p = player.center;
    expect(Math.min(Math.abs(c.x - p.x), Math.abs(c.y - p.y))).toBeLessThanOrEqual(5);
  });

  it('never stays stuck for long on the real maps', () => {
    const levels = new LevelManager();
    for (let index = 0; index < levels.count; index++) {
      const battle = new Battle({ level: levels.get(index), session: new Session(), rng: new Random(index + 11) });
      battle.playerTank = null;
      battle.playerCrew = null;
      battle.map.base!.destroyed = true;
      const lastMoved = new Map<object, { x: number; y: number; t: number }>();
      for (let t = 0; t < 60; t += TICK) {
        battle.update(TICK, NO_COMMAND);
        battle.drainEvents();
        for (const enemy of battle.enemies) {
          // Guards hold their posts on purpose; they are tested separately.
          if (enemy.brain.role === 'guard') {
            lastMoved.delete(enemy);
            continue;
          }
          const seen = lastMoved.get(enemy);
          if (!seen || Math.abs(seen.x - enemy.x) + Math.abs(seen.y - enemy.y) > 4) {
            lastMoved.set(enemy, { x: enemy.x, y: enemy.y, t });
          }
          expect(t - (lastMoved.get(enemy)?.t ?? t)).toBeLessThan(8);
        }
      }
    }
  });
});
