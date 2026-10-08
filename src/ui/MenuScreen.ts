import type { Direction } from '../core/geometry';
import { Effects } from '../effects/Effects';
import type { Game } from '../game/Game';
import { SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { EffectsRenderer } from '../rendering/EffectsRenderer';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { formatScore } from '../systems/ScoreSystem';
import { Backdrop } from './Backdrop';
import { MenuList } from './MenuList';

const TITLE_ROWS = [PALETTE.goldLight, PALETTE.goldLight, PALETTE.gold, PALETTE.gold, PALETTE.gold, PALETTE.amber, PALETTE.goldDark];
const STRIP_Y = 158;
const TANK_SPEED = 30;
const GLINT_PERIOD = 5;

/** Draws the big two-line logo, with an occasional light glint sweeping across it. */
export function drawLogo(r: Renderer, y: number, time: number, scale = 4): void {
  const lines = ['COLCHIS', 'TANKS'];
  const lineHeight = 8 * scale;
  lines.forEach((line, i) => {
    r.text(line, SCREEN_WIDTH / 2, y + i * lineHeight, {
      color: PALETTE.gold,
      rowColors: TITLE_ROWS,
      scale,
      shadow: PALETTE.redDark,
      align: 'center',
    });
  });

  const phase = (time % GLINT_PERIOD) / 0.7;
  if (phase >= 1) return;
  const x = 50 + phase * 240;
  const ctx = r.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 8, y);
  ctx.lineTo(x - 12, y + lineHeight * 2);
  ctx.lineTo(x - 20, y + lineHeight * 2);
  ctx.closePath();
  ctx.clip();
  lines.forEach((line, i) => r.text(line, SCREEN_WIDTH / 2, y + i * lineHeight, { color: PALETTE.white, scale, align: 'center' }));
  ctx.restore();
}

export class MenuScreen implements Screen {
  private readonly backdrop = new Backdrop();
  private readonly list: MenuList;
  private readonly effects = new Effects();
  private readonly fx = new EffectsRenderer();
  private readonly tank = { x: 30, direction: 'right' as Direction, tread: 0, reload: 1.5 };
  private readonly shells: { x: number; step: number }[] = [];
  private time = 0;

  constructor(private readonly game: Game) {
    this.list = new MenuList(
      [
        { label: () => 'START GAME', select: () => game.startNewGame() },
        { label: () => 'HOW TO PLAY', select: () => game.setState('HOW_TO_PLAY') },
        { label: () => 'OPTIONS', select: () => game.setState('OPTIONS') },
        { label: () => 'CREDITS', select: () => game.setState('CREDITS') },
      ],
      { x: SCREEN_WIDTH / 2, y: 104, spacing: 13, width: 112 },
      game.audio,
    );
  }

  enter(): void {
    this.game.audio.setMusic('menu');
    this.game.audio.setDucked(false);
  }

  update(dt: number, input: InputState): void {
    this.time += dt;
    this.backdrop.update(dt);
    this.animateTank(dt);
    this.effects.update(dt);
    this.list.update(input);
  }

  render(r: Renderer): void {
    this.backdrop.render(r);
    drawLogo(r, 20, this.time);
    r.text('DEFEND THE GOLDEN FLEECE', SCREEN_WIDTH / 2, 87, { color: PALETTE.silver, align: 'center' });
    this.list.render(r, this.time);

    r.rect(12, STRIP_Y + 17, SCREEN_WIDTH - 24, 1, PALETTE.shadow);
    const phase = Math.floor(this.tank.tread * 2) % 4;
    r.art(r.sprites.tank('player', 'normal', this.tank.direction, phase, false), this.tank.x, STRIP_Y);
    for (const shell of this.shells) r.rect(Math.round(shell.x) - 2, STRIP_Y + 7, 4, 2, PALETTE.goldLight);
    this.fx.drawUnder(r.ctx, this.effects);
    this.fx.drawOver(r.ctx, this.effects);

    r.text(`HI-SCORE ${formatScore(this.game.settings.highScore)}`, SCREEN_WIDTH / 2, 186, { color: PALETTE.gold, align: 'center' });
    r.text('ARROWS + ENTER  OR  MOUSE', SCREEN_WIDTH / 2, 202, { color: PALETTE.slate, align: 'center' });
    r.text('© 2026 COLCHIS FORGE', SCREEN_WIDTH / 2, 216, { color: PALETTE.slate, align: 'center' });
  }

  /** A little patrol under the menu: the tank drives, turns at the edges and takes potshots. */
  private animateTank(dt: number): void {
    const tank = this.tank;
    const step = tank.direction === 'right' ? 1 : -1;
    tank.x += step * TANK_SPEED * dt;
    tank.tread += TANK_SPEED * dt;
    if (tank.x > SCREEN_WIDTH - 34) tank.direction = 'left';
    if (tank.x < 18) tank.direction = 'right';

    tank.reload -= dt;
    if (tank.reload <= 0) {
      tank.reload = 1.6 + Math.random() * 1.6;
      const muzzle = tank.x + 8 + step * 9;
      this.shells.push({ x: muzzle, step });
      this.effects.muzzle(muzzle, STRIP_Y + 8, tank.direction);
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.x += shell.step * 160 * dt;
      if (shell.x < 12 || shell.x > SCREEN_WIDTH - 12) {
        this.effects.sparks(shell.x, STRIP_Y + 8, [PALETTE.white, PALETTE.goldLight, PALETTE.orange], 8, 50);
        this.shells.splice(i, 1);
      }
    }
  }
}
