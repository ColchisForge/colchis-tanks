import type { AudioOutput } from '../audio/AudioManager';
import { Random } from '../core/Random';
import { Effects } from '../effects/Effects';
import type { InputState } from '../input/InputManager';
import type { Renderer } from '../rendering/Renderer';
import { applyBonus, levelCompletionBonus, type BonusLine } from '../systems/ScoreSystem';
import { GameOverScreen } from '../ui/GameOverScreen';
import { CreditsScreen, HowToPlayScreen, OptionsScreen } from '../ui/InfoScreens';
import { LevelCompleteScreen } from '../ui/LevelCompleteScreen';
import { MenuScreen } from '../ui/MenuScreen';
import { PauseScreen } from '../ui/PauseScreen';
import { PlayingScreen } from '../ui/PlayingScreen';
import { VictoryScreen } from '../ui/VictoryScreen';
import { LevelManager } from '../world/LevelManager';
import { Battle, type PlayerCommand } from './Battle';
import { emitAmbientEffects, presentBattleEvents, updateBattleAudio, type Notify } from './BattleFeedback';
import { TOAST_DURATION } from './GameConfig';
import type { GameState, Screen } from './GameState';
import { Session } from './Session';
import type { Settings } from './Settings';

export interface Toast {
  readonly text: string;
  readonly color: string;
  age: number;
}

export interface GameServices {
  readonly audio: AudioOutput;
  readonly settings: Settings;
  readonly levels?: LevelManager;
  readonly createRandom?: () => Random;
}

/** Top-level state machine. Screens handle their own input and call back into these actions. */
export class Game {
  readonly session = new Session();
  readonly effects = new Effects();
  readonly audio: AudioOutput;
  readonly settings: Settings;
  readonly levels: LevelManager;
  battle: Battle | null = null;
  lastBonus: readonly BonusLine[] = [];
  newRecord = false;
  /** The latest message for the player, shown briefly over the battlefield. */
  toast: Toast | null = null;

  private current: GameState = 'MENU';
  private readonly screens: Readonly<Record<GameState, Screen>>;
  private readonly createRandom: () => Random;

  constructor(services: GameServices) {
    this.audio = services.audio;
    this.settings = services.settings;
    this.levels = services.levels ?? new LevelManager();
    this.createRandom = services.createRandom ?? (() => new Random());
    this.screens = {
      MENU: new MenuScreen(this),
      HOW_TO_PLAY: new HowToPlayScreen(this),
      OPTIONS: new OptionsScreen(this),
      CREDITS: new CreditsScreen(this),
      PLAYING: new PlayingScreen(this),
      PAUSED: new PauseScreen(this),
      LEVEL_COMPLETE: new LevelCompleteScreen(this),
      GAME_OVER: new GameOverScreen(this),
      VICTORY: new VictoryScreen(this),
    };
    this.screens.MENU.enter?.('MENU');
  }

  get state(): GameState {
    return this.current;
  }

  get highScore(): number {
    return Math.max(this.settings.highScore, this.session.score);
  }

  setState(next: GameState): void {
    const previous = this.current;
    this.current = next;
    // Engines only run while the battle does.
    if (next !== 'PLAYING') {
      this.audio.setEngine('player', null);
      this.audio.setEngine('enemy', null);
    }
    this.screens[next].enter?.(previous);
  }

  update(dt: number, input: InputState): void {
    this.screens[this.current].update(dt, input);
  }

  render(renderer: Renderer): void {
    this.screens[this.current].render(renderer);
  }

  startNewGame(): void {
    this.session.reset();
    this.newRecord = false;
    this.startLevel(0);
  }

  startLevel(index: number): void {
    this.session.beginLevel(index);
    this.loadBattle();
  }

  /** Mid-level restart: back to the score and lives the level began with. */
  restartLevel(): void {
    this.session.restoreCheckpoint();
    this.loadBattle();
  }

  /** After a game over: same level, full lives. */
  retryLevel(): void {
    this.session.retry();
    this.loadBattle();
  }

  /** One simulation tick of the running battle, plus the feedback and state changes it causes. */
  advanceBattle(dt: number, command: PlayerCommand): void {
    const battle = this.battle;
    if (!battle) return;
    // A heavy hit freezes the action for a few frames.
    if (this.effects.hitStop > 0) {
      this.effects.hitStop -= dt;
      return;
    }
    battle.update(dt, command);
    presentBattleEvents(battle.drainEvents(), battle, this.effects, this.audio, this.notify);
    updateBattleAudio(battle, this.audio);
    emitAmbientEffects(battle, this.effects, dt);
    this.effects.update(dt);
    if (this.toast) {
      this.toast.age += dt;
      if (this.toast.age >= TOAST_DURATION) this.toast = null;
    }

    if (battle.result === 'victory') this.completeLevel();
    else if (battle.result === 'defeat') this.endGame();
  }

  continueCampaign(): void {
    const index = this.session.levelIndex;
    if (this.levels.isLast(index)) {
      this.recordScore();
      this.setState('VICTORY');
    } else {
      this.startLevel(index + 1);
    }
  }

  pause(): void {
    if (this.current === 'PLAYING') this.setState('PAUSED');
  }

  resume(): void {
    if (this.current === 'PAUSED') this.setState('PLAYING');
  }

  quitToMenu(): void {
    this.recordScore();
    this.battle = null;
    this.effects.clear();
    this.setState('MENU');
  }

  private completeLevel(): void {
    this.lastBonus = levelCompletionBonus(this.session.lives, this.battle?.victoryReason === 'hq');
    applyBonus(this.session, this.lastBonus);
    this.recordScore();
    this.setState('LEVEL_COMPLETE');
  }

  private endGame(): void {
    this.recordScore();
    this.setState('GAME_OVER');
  }

  private readonly notify: Notify = (text, color) => {
    this.toast = { text, color, age: 0 };
  };

  private loadBattle(): void {
    this.battle = new Battle({
      level: this.levels.get(this.session.levelIndex),
      session: this.session,
      rng: this.createRandom(),
    });
    this.effects.clear();
    this.toast = null;
    this.setState('PLAYING');
  }

  private recordScore(): void {
    if (this.settings.submitScore(this.session.score)) this.newRecord = true;
  }
}
