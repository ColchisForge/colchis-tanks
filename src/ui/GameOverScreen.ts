import type { Game } from '../game/Game';
import { SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { formatScore } from '../systems/ScoreSystem';
import { drawBattleScene } from './BattleScene';
import { MenuList } from './MenuList';

const CENTER = SCREEN_WIDTH / 2;
/** Ignore input briefly so a shot fired as the game ended does not skip the screen. */
const INPUT_DELAY = 0.8;

export class GameOverScreen implements Screen {
  private readonly list: MenuList;
  private time = 0;

  constructor(private readonly game: Game) {
    this.list = new MenuList(
      [
        { label: () => 'R - RETRY', select: () => game.retryLevel() },
        { label: () => 'ESC - MENU', select: () => game.quitToMenu() },
      ],
      { x: CENTER, y: 138, spacing: 13, width: 110 },
      game.audio,
    );
  }

  enter(): void {
    this.time = 0;
    this.list.selected = 0;
    this.game.audio.setMusic(null);
    this.game.audio.play('gameOver');
  }

  update(dt: number, input: InputState): void {
    this.time += dt;
    this.game.effects.update(dt);
    if (this.time < INPUT_DELAY) return;
    if (input.wasPressed('restart')) this.game.retryLevel();
    else if (input.wasPressed('back')) this.game.quitToMenu();
    else this.list.update(input);
  }

  render(r: Renderer): void {
    const battle = this.game.battle;
    if (battle) drawBattleScene(r, this.game, battle);
    r.dim(0.6);
    r.panel(CENTER - 80, 66, 160, 106, { border: PALETTE.red });
    r.text('GAME OVER', CENTER, 76, { color: PALETTE.red, scale: 2, align: 'center', shadow: PALETTE.ink });
    const reason = battle?.defeatReason === 'base' ? 'THE BASE HAS FALLEN' : 'ALL TANKS LOST';
    r.text(reason, CENTER, 96, { color: PALETTE.silver, align: 'center' });
    r.text(`SCORE: ${formatScore(this.game.session.score)}`, CENTER, 110, { color: PALETTE.white, align: 'center' });
    if (this.game.newRecord && Math.floor(this.time * 4) % 2 === 0) {
      r.text('NEW HIGH SCORE!', CENTER, 122, { color: PALETTE.goldLight, align: 'center' });
    }
    if (this.time >= INPUT_DELAY) this.list.render(r, this.time);
  }
}
