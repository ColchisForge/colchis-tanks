import type { Game } from '../game/Game';
import { FIELD_Y, LEVEL_HEIGHT, RESTART_HOLD_TIME, SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { drawBattleBanners, drawBattleScene, drawCrewPrompt, drawToast } from './BattleScene';

export class PlayingScreen implements Screen {
  /** R must be held briefly mid-battle so a stray key press never wipes a level. */
  private restartHold = 0;

  constructor(private readonly game: Game) {}

  enter(): void {
    this.restartHold = 0;
    this.game.audio.setMusic('battle');
    this.game.audio.setDucked(false);
  }

  update(dt: number, input: InputState): void {
    if (input.wasPressed('pause') || input.wasPressed('back')) {
      this.game.pause();
      return;
    }
    if (input.isDown('restart')) {
      this.restartHold += dt;
      if (this.restartHold >= RESTART_HOLD_TIME) {
        this.game.restartLevel();
        return;
      }
    } else {
      this.restartHold = 0;
    }
    this.game.advanceBattle(dt, {
      direction: input.direction,
      fire: input.isDown('fire') || input.wasPressed('fire'),
      fireSecondary: input.isDown('secondary') || input.wasPressed('secondary'),
      use: input.wasPressed('use'),
    });
  }

  render(r: Renderer): void {
    const battle = this.game.battle;
    if (!battle) return;
    drawBattleScene(r, this.game, battle);
    drawCrewPrompt(r, battle, battle.time);
    drawBattleBanners(r, battle);
    drawToast(r, this.game.toast, battle);
    if (this.restartHold > 0.05) this.drawRestartMeter(r);
  }

  private drawRestartMeter(r: Renderer): void {
    const width = 120;
    const x = (SCREEN_WIDTH - width) / 2;
    const y = FIELD_Y + LEVEL_HEIGHT - 24;
    r.panel(x - 6, y - 6, width + 12, 26, { border: PALETTE.red });
    r.text('RESTARTING LEVEL', SCREEN_WIDTH / 2, y, { color: PALETTE.white, align: 'center' });
    r.rect(x, y + 10, width, 3, PALETTE.shadow);
    r.rect(x, y + 10, Math.round((width * this.restartHold) / RESTART_HOLD_TIME), 3, PALETTE.red);
  }
}
