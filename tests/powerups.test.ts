import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG, POWER_UP_CONFIG, SCORE_CONFIG } from '../src/game/GameConfig';
import { Session } from '../src/game/Session';
import { POWER_UP_DEFINITIONS } from '../src/systems/PowerUpSystem';
import { hold, makeBattle, run } from './helpers';

const OPEN = ['.....', '.....', '..P..', '.....'];

describe('power-ups', () => {
  it('rapid fire shortens the cannon cooldown and allows more shells', () => {
    const battle = makeBattle(OPEN);
    const player = battle.playerTank!;
    battle.fire(player);
    const normal = player.cannon.reloadRemaining;
    expect(normal).toBeCloseTo(PLAYER_CONFIG.fireCooldown, 5);

    POWER_UP_DEFINITIONS.rapidFire.apply({ player, session: battle.session });
    run(battle, PLAYER_CONFIG.fireCooldown);
    battle.fire(player);
    expect(player.cannon.reloadRemaining).toBeCloseTo(PLAYER_CONFIG.fireCooldown * POWER_UP_CONFIG.rapidFire.cooldownScale, 5);
    expect(player.effects.modifiers().extraShells).toBe(POWER_UP_CONFIG.rapidFire.extraShells);
  });

  it('rapid fire wears off', () => {
    const battle = makeBattle(OPEN);
    const player = battle.playerTank!;
    POWER_UP_DEFINITIONS.rapidFire.apply({ player, session: battle.session });
    run(battle, POWER_UP_CONFIG.rapidFire.duration + 0.1);
    expect(player.effects.has('rapidFire')).toBe(false);
    expect(player.effects.modifiers().cooldownScale).toBe(1);
  });

  it('shield prevents damage', () => {
    const battle = makeBattle(OPEN);
    const player = battle.playerTank!;
    const enemy = battle.addEnemy('basic', 0, 0);
    player.effects.clear();
    POWER_UP_DEFINITIONS.shield.apply({ player, session: battle.session });
    battle.damageTank(player, 50, enemy);
    expect(player.health.current).toBe(player.health.max);

    run(battle, POWER_UP_CONFIG.shield.duration + 0.1);
    battle.damageTank(player, 50, enemy);
    expect(player.health.current).toBe(player.health.max - 50);
  });

  it('extra life adds a life', () => {
    const session = new Session();
    const battle = makeBattle(OPEN, { session });
    POWER_UP_DEFINITIONS.extraLife.apply({ player: battle.playerTank!, session });
    expect(session.lives).toBe(PLAYER_CONFIG.lives + 1);
  });

  it('is collected by driving over it, which also scores', () => {
    const session = new Session();
    const battle = makeBattle(OPEN, { session });
    const player = battle.playerTank!;
    battle.addEnemy('basic', 64, 48);
    battle.powerUps.spawn('extraLife', player.x, player.y - 16);
    run(battle, 0.5, hold('up'));
    expect(battle.powerUps.items).toHaveLength(0);
    expect(session.lives).toBe(PLAYER_CONFIG.lives + 1);
    expect(session.score).toBe(SCORE_CONFIG.powerUp);
  });

  it('disappears if nobody collects it in time', () => {
    const battle = makeBattle(OPEN);
    battle.addEnemy('basic', 64, 48);
    battle.powerUps.spawn('shield', 0, 0);
    run(battle, POWER_UP_CONFIG.lifetime + 0.1);
    expect(battle.powerUps.items).toHaveLength(0);
  });

  it('drops from destroyed carrier tanks', () => {
    const battle = makeBattle(OPEN);
    const carrier = battle.addEnemy('basic', 0, 0, { carrier: true });
    battle.addEnemy('basic', 64, 48);
    battle.damageTank(carrier, 999, battle.playerTank!);
    expect(battle.powerUps.items).toHaveLength(1);
  });
});
