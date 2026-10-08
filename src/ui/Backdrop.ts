import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../game/GameConfig';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';

interface Ember {
  x: number;
  y: number;
  speed: number;
  drift: number;
  color: string;
}

const EMBER_COLORS = [PALETTE.goldDark, PALETTE.amber, PALETTE.redDark, PALETTE.slate];

/** Slow drifting embers and a double-line frame shared by the menu screens. */
export class Backdrop {
  private readonly embers: Ember[] = [];

  constructor(count = 36) {
    for (let i = 0; i < count; i++) this.embers.push(this.spawn(Math.random() * SCREEN_HEIGHT));
  }

  update(dt: number): void {
    for (const ember of this.embers) {
      ember.y -= ember.speed * dt;
      ember.x += Math.sin(ember.y / 18 + ember.drift) * 4 * dt;
      if (ember.y < -2) Object.assign(ember, this.spawn(SCREEN_HEIGHT + 2));
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.void);
    for (let y = 0; y < SCREEN_HEIGHT; y += 4) {
      if (y > SCREEN_HEIGHT * 0.55) r.rect(0, y, SCREEN_WIDTH, 2, PALETTE.night);
    }
    for (const ember of this.embers) r.rect(Math.round(ember.x), Math.round(ember.y), 1, 1, ember.color);
    this.frame(r);
  }

  private frame(r: Renderer): void {
    const w = SCREEN_WIDTH;
    const h = SCREEN_HEIGHT;
    const c = PALETTE.goldDark;
    r.rect(4, 4, w - 8, 1, c);
    r.rect(4, h - 5, w - 8, 1, c);
    r.rect(4, 4, 1, h - 8, c);
    r.rect(w - 5, 4, 1, h - 8, c);
    r.rect(6, 6, w - 12, 1, c);
    r.rect(6, h - 7, w - 12, 1, c);
    r.rect(6, 6, 1, h - 12, c);
    r.rect(w - 7, 6, 1, h - 12, c);
    for (const [x, y] of [[4, 4], [w - 7, 4], [4, h - 7], [w - 7, h - 7]]) r.rect(x, y, 3, 3, PALETTE.gold);
  }

  private spawn(y: number): Ember {
    return {
      x: 8 + Math.random() * (SCREEN_WIDTH - 16),
      y,
      speed: 4 + Math.random() * 10,
      drift: Math.random() * Math.PI * 2,
      color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)],
    };
  }
}

const BACK_HINT_Y = SCREEN_HEIGHT - 20;

/** The "ESC - BACK" footer of sub-menus; it doubles as a click target. */
export function drawBackHint(r: Renderer, label = 'ESC - BACK'): void {
  r.text(label, SCREEN_WIDTH / 2, BACK_HINT_Y, { color: PALETTE.gray, align: 'center' });
}

export function backHintClicked(pointer: { readonly x: number; readonly y: number; readonly clicked: boolean }): boolean {
  return pointer.clicked && Math.abs(pointer.y - (BACK_HINT_Y + 3)) <= 7 && Math.abs(pointer.x - SCREEN_WIDTH / 2) < 50;
}
