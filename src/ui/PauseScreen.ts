import type { Game } from '../game/Game';
import { SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { drawBattleScene } from './BattleScene';
import { MenuList } from './MenuList';

const CENTER = SCREEN_WIDTH / 2;

export class PauseScreen implements Screen {
  private readonly list: MenuList;
  private time = 0;

  constructor(private readonly game: Game) {
    this.list = new MenuList(
      [
        { label: () => 'P - RESUME', select: () => game.resume() },
        { label: () => 'R - RESTART', select: () => game.restartLevel() },
        { label: () => 'ESC - MENU', select: () => game.quitToMenu() },
      ],
      { x: CENTER, y: 112, spacing: 13, width: 110 },
      game.audio,
    );
  }

  enter(): void {
    this.time = 0;
    this.list.selected = 0;
    this.game.audio.setDucked(true);
    this.game.audio.play('pause');
  }

  /** Nothing in the battle advances here: not the simulation, not effects, not timers. */
  update(dt: number, input: InputState): void {
    this.time += dt;
    if (input.wasPressed('pause')) this.game.resume();
    else if (input.wasPressed('restart')) this.game.restartLevel();
    else if (input.wasPressed('back')) this.game.quitToMenu();
    else this.list.update(input);
  }

  render(r: Renderer): void {
    const battle = this.game.battle;
    if (battle) drawBattleScene(r, this.game, battle);
    r.dim(0.55);
    r.panel(CENTER - 70, 78, 140, 80);
    r.text('PAUSED', CENTER, 88, { color: PALETTE.gold, scale: 2, align: 'center', shadow: PALETTE.redDark });
    this.list.render(r, this.time);
  }
}
