import { describe, expect, it } from 'vitest';
import { SILENT_AUDIO } from '../src/audio/AudioManager';
import { Random } from '../src/core/Random';
import type { EnemyTank } from '../src/entities/EnemyTank';
import type { Battle } from '../src/game/Battle';
import { Game } from '../src/game/Game';
import { BATTLE_CONFIG, PLAYER_CONFIG, SCORE_CONFIG } from '../src/game/GameConfig';
import { Session } from '../src/game/Session';
import { LevelManager } from '../src/world/LevelManager';
import { FakeInput, makeBattle, memorySettings, run, testLevel, TICK } from './helpers';

/** Player left of the base, one enemy spawning in the far corner. */
const ARENA = testLevel(['S......', '.......', '.......', '..P..H.'], { roster: 'B', maxActiveEnemies: 1 });

function makeGame(levels = [ARENA]) {
  const settings = memorySettings();
  const game = new Game({ audio: SILENT_AUDIO, settings, levels: new LevelManager(levels), createRandom: () => new Random(7) });
  return { game, settings };
}

function advance(game: Game, input: FakeInput, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds; t += TICK) {
    game.update(TICK, input);
    input.endTick();
    if (until?.()) return;
  }
}

/** Knocks out an enemy tank and kills the crew that bails out of it. */
function eliminate(battle: Battle, enemy: EnemyTank): void {
  const attacker = battle.playerTank!;
  battle.damageTank(enemy, 999, attacker);
  for (const soldier of battle.soldiers.filter((s) => s.team === 'enemy')) battle.damageSoldier(soldier, 99, attacker);
}

/** Knocks out the player's tank and kills the crew member who bails out. */
function killPlayerCrew(battle: Battle, attacker: EnemyTank): void {
  battle.playerTank!.effects.clear();
  battle.damageTank(battle.playerTank!, 999, attacker);
  battle.damageSoldier(battle.playerCrew!, 99, attacker);
}

function waitForEnemy(game: Game, input: FakeInput) {
  advance(game, input, 5, () => (game.battle?.enemies.length ?? 0) > 0);
  const enemy = game.battle?.enemies[0];
  if (!enemy) throw new Error('enemy never spawned');
  return enemy;
}

describe('game flow', () => {
  it('starts at the menu and Start Game begins level 1', () => {
    const { game } = makeGame();
    expect(game.state).toBe('MENU');
    const input = new FakeInput();
    input.press('confirm');
    advance(game, input, TICK);
    expect(game.state).toBe('PLAYING');
    expect(game.session.levelIndex).toBe(0);
  });

  it('destroying the base triggers game over', () => {
    const { game } = makeGame();
    game.startNewGame();
    const input = new FakeInput();
    input.direction = 'right';
    input.held.add('fire');
    advance(game, input, 3, () => game.battle?.map.base?.destroyed === true);
    expect(game.battle?.map.base?.destroyed).toBe(true);
    expect(game.battle?.defeatReason).toBe('base');

    input.held.clear();
    input.direction = null;
    advance(game, input, BATTLE_CONFIG.endDelay + 0.1);
    expect(game.state).toBe('GAME_OVER');
  });

  it('destroying all enemies completes the level and pays the bonus', () => {
    const { game } = makeGame([ARENA, ARENA]);
    game.startNewGame();
    const input = new FakeInput();
    const enemy = waitForEnemy(game, input);
    eliminate(game.battle!, enemy);
    advance(game, input, BATTLE_CONFIG.endDelay + 0.1);

    expect(game.state).toBe('LEVEL_COMPLETE');
    const bonus = SCORE_CONFIG.levelClear + SCORE_CONFIG.baseIntact + SCORE_CONFIG.perLife * PLAYER_CONFIG.lives;
    expect(game.session.score).toBe(100 + SCORE_CONFIG.crewKill + bonus);

    game.continueCampaign();
    expect(game.state).toBe('PLAYING');
    expect(game.session.levelIndex).toBe(1);
  });

  it('shows victory after the final level', () => {
    const { game } = makeGame([ARENA]);
    game.startNewGame();
    const input = new FakeInput();
    const enemy = waitForEnemy(game, input);
    eliminate(game.battle!, enemy);
    advance(game, input, BATTLE_CONFIG.endDelay + 0.1);
    game.continueCampaign();
    expect(game.state).toBe('VICTORY');
  });

  it('a knocked-out enemy is not beaten while its crew is still alive', () => {
    const { game } = makeGame();
    game.startNewGame();
    const input = new FakeInput();
    const enemy = waitForEnemy(game, input);
    game.battle!.damageTank(enemy, 999, game.battle!.playerTank!);
    advance(game, input, 1);
    expect(game.battle!.enemiesRemaining).toBe(1);
    expect(game.state).toBe('PLAYING');
  });

  it('pausing freezes the battle completely', () => {
    const { game } = makeGame();
    game.startNewGame();
    const input = new FakeInput();
    advance(game, input, 1.5);
    input.press('pause');
    advance(game, input, TICK);
    expect(game.state).toBe('PAUSED');

    const battle = game.battle!;
    const snapshot = JSON.stringify({ time: battle.time, tanks: battle.tanks.map((t) => [t.x, t.y]), shells: battle.shells.length });
    input.direction = 'up';
    advance(game, input, 2);
    expect(JSON.stringify({ time: battle.time, tanks: battle.tanks.map((t) => [t.x, t.y]), shells: battle.shells.length })).toBe(snapshot);

    input.press('pause');
    advance(game, input, TICK);
    expect(game.state).toBe('PLAYING');
  });

  it('records a new high score', () => {
    const { game, settings } = makeGame();
    game.startNewGame();
    game.session.addScore(1234);
    game.quitToMenu();
    expect(settings.highScore).toBe(1234);
  });
});

describe('lives', () => {
  it('losing the tank alone costs no life', () => {
    const session = new Session();
    const battle = makeBattle(['P....', '.....'], { session });
    const enemy = battle.addEnemy('basic', 64, 0);
    battle.playerTank!.effects.clear();
    battle.damageTank(battle.playerTank!, 999, enemy);
    expect(battle.playerTank!.disabled).toBe(true);
    expect(battle.playerOnFoot).not.toBeNull();
    expect(session.lives).toBe(PLAYER_CONFIG.lives);
  });

  it('respawns a fresh crew and tank while lives remain', () => {
    const session = new Session();
    const battle = makeBattle(['P....', '.....'], { session });
    const enemy = battle.addEnemy('basic', 64, 0);
    const wreck = battle.playerTank!;
    killPlayerCrew(battle, enemy);

    expect(battle.playerCrew).toBeNull();
    expect(session.lives).toBe(PLAYER_CONFIG.lives - 1);
    run(battle, PLAYER_CONFIG.respawnDelay + 0.05);
    expect(battle.playerTank).not.toBe(wreck);
    expect(wreck.active).toBe(false);
    expect(battle.playerTank!.manned).toBe(true);
    expect(battle.playerTank!.health.current).toBe(PLAYER_CONFIG.maxHealth);
    expect(battle.playerTank!.invulnerable).toBe(true);
    expect(battle.outcome).toBeNull();
  });

  it('waits to respawn while an enemy sits on the spawn point', () => {
    const battle = makeBattle(['P....', '.....']);
    const squatter = battle.addEnemy('basic', 0, 0);
    killPlayerCrew(battle, squatter);
    run(battle, PLAYER_CONFIG.respawnDelay + 0.5);
    expect(battle.playerCrew).toBeNull();

    squatter.x = 48;
    run(battle, 0.05);
    expect(battle.playerCrew).not.toBeNull();
  });

  it('ends the game when the last crew is lost', () => {
    const session = new Session();
    session.lives = 1;
    const battle = makeBattle(['P....', '.....'], { session });
    const enemy = battle.addEnemy('basic', 64, 0);
    killPlayerCrew(battle, enemy);

    expect(session.lives).toBe(0);
    expect(battle.outcome).toBe('defeat');
    expect(battle.defeatReason).toBe('lives');
    run(battle, BATTLE_CONFIG.endDelay + 0.05);
    expect(battle.result).toBe('defeat');
    expect(battle.playerCrew).toBeNull();
  });

  it('restarting a level restores its starting score and lives; retrying refills lives', () => {
    const session = new Session();
    session.addScore(500);
    session.lives = 2;
    session.beginLevel(1);
    session.addScore(300);
    session.lives = 1;

    session.restoreCheckpoint();
    expect(session.score).toBe(500);
    expect(session.lives).toBe(2);

    session.lives = 0;
    session.retry();
    expect(session.score).toBe(500);
    expect(session.lives).toBe(PLAYER_CONFIG.lives);
  });
});
