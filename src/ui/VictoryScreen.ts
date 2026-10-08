import { Effects } from '../effects/Effects';
import type { Game } from '../game/Game';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { EffectsRenderer } from '../rendering/EffectsRenderer';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { formatScore } from '../systems/ScoreSystem';
import { Backdrop } from './Backdrop';

const CENTER = SCREEN_WIDTH / 2;
const INPUT_DELAY = 1;
const FIREWORK_COLORS = [
  [PALETTE.white, PALETTE.goldLight, PALETTE.gold, PALETTE.amber],
  [PALETTE.white, PALETTE.cyan, PALETTE.cyanDark],
  [PALETTE.white, PALETTE.redLight, PALETTE.red],
  [PALETTE.white, PALETTE.green, PALETTE.bush],
] as const;

export class VictoryScreen implements Screen {
  private readonly backdrop = new Backdrop(20);
  private readonly fireworks = new Effects();
  private readonly fx = new EffectsRenderer();
  private time = 0;
  private nextFirework = 0;

  constructor(private readonly game: Game) {}

  enter(): void {
    this.time = 0;
    this.nextFirework = 0.2;
    this.fireworks.clear();
    this.game.audio.setMusic(null);
    this.game.audio.play('victory');
  }

  update(dt: number, input: InputState): void {
    this.time += dt;
    this.backdrop.update(dt);
    this.fireworks.update(dt);
    this.nextFirework -= dt;
    if (this.nextFirework <= 0) {
      this.nextFirework = 0.35 + Math.random() * 0.5;
      // Above or below the panel, never hidden behind it.
      const x = 30 + Math.random() * (SCREEN_WIDTH - 60);
      const y = Math.random() < 0.6 ? 22 + Math.random() * 36 : SCREEN_HEIGHT - 52 + Math.random() * 24;
      this.fireworks.firework(x, y, FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]);
    }
    if (this.time < INPUT_DELAY) return;
    if (input.wasPressed('confirm') || input.wasPressed('back') || input.wasPressed('fire') || input.pointer.clicked) {
      this.game.audio.play('menuSelect');
      this.game.quitToMenu();
    }
  }

  render(r: Renderer): void {
    this.backdrop.render(r);
    this.fx.drawOver(r.ctx, this.fireworks);
    r.panel(CENTER - 90, 70, 180, 104);
    r.text('VICTORY!', CENTER, 82, { color: PALETTE.goldLight, scale: 3, align: 'center', shadow: PALETTE.redDark });
    r.text('MISSION COMPLETE', CENTER, 110, { color: PALETTE.white, align: 'center' });
    r.text('THE GOLDEN FLEECE IS SAFE', CENTER, 122, { color: PALETTE.silver, align: 'center' });
    r.text(`SCORE: ${formatScore(this.game.session.score)}`, CENTER, 138, { color: PALETTE.gold, align: 'center' });
    if (this.game.newRecord && Math.floor(this.time * 4) % 2 === 0) {
      r.text('NEW HIGH SCORE!', CENTER, 150, { color: PALETTE.cyan, align: 'center' });
    }
    if (this.time >= INPUT_DELAY && Math.floor(this.time * 2.5) % 2 === 0) {
      r.text('ENTER - MENU', CENTER, 160, { color: PALETTE.white, align: 'center' });
    }
  }
}
