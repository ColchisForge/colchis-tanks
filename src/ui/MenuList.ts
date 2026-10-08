import type { AudioOutput } from '../audio/AudioManager';
import type { Rect } from '../core/geometry';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import { measureText } from '../rendering/PixelFont';
import type { Renderer } from '../rendering/Renderer';

export interface MenuItem {
  readonly label: () => string;
  readonly select: () => void;
  /** Left/right adjust, for option toggles. */
  readonly adjust?: () => void;
}

export interface MenuListLayout {
  /** Centre of the list. */
  readonly x: number;
  readonly y: number;
  readonly spacing: number;
  readonly width: number;
}

const ITEM_HEIGHT = 11;

/** Vertical list navigated with arrows + Enter, or hovered and clicked with the mouse. */
export class MenuList {
  selected = 0;

  constructor(
    private readonly items: readonly MenuItem[],
    private readonly layout: MenuListLayout,
    private readonly audio: AudioOutput,
  ) {}

  update(input: InputState): void {
    const count = this.items.length;
    if (input.wasPressed('up')) this.move((this.selected - 1 + count) % count);
    if (input.wasPressed('down')) this.move((this.selected + 1) % count);

    const item = this.items[this.selected];
    if (item.adjust && (input.wasPressed('left') || input.wasPressed('right'))) {
      item.adjust();
      this.audio.play('menuMove');
    }

    const pointer = input.pointer;
    const hovered = pointer.inside ? this.itemAt(pointer.x, pointer.y) : -1;
    if (hovered >= 0 && pointer.moved) this.move(hovered);
    if (pointer.clicked && hovered >= 0) {
      this.selected = hovered;
      this.activate();
      return;
    }
    if (input.wasPressed('confirm') || input.wasPressed('fire')) this.activate();
  }

  render(r: Renderer, time: number): void {
    this.items.forEach((item, index) => {
      const rect = this.itemRect(index);
      const active = index === this.selected;
      const label = item.label();
      if (active) {
        r.rect(rect.x, rect.y, rect.w, rect.h, PALETTE.panelLight);
        if (Math.floor(time * 3) % 2 === 0) {
          const left = this.layout.x - measureText(label) / 2 - 10;
          r.text('>', left, rect.y + 2, { color: PALETTE.gold });
        }
      }
      r.text(label, this.layout.x, rect.y + 2, {
        color: active ? PALETTE.goldLight : PALETTE.silver,
        align: 'center',
        shadow: PALETTE.ink,
      });
    });
  }

  itemRect(index: number): Rect {
    return {
      x: Math.round(this.layout.x - this.layout.width / 2),
      y: Math.round(this.layout.y + index * this.layout.spacing - 2),
      w: this.layout.width,
      h: ITEM_HEIGHT,
    };
  }

  private itemAt(x: number, y: number): number {
    return this.items.findIndex((_, index) => {
      const rect = this.itemRect(index);
      return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
    });
  }

  private move(index: number): void {
    if (index === this.selected) return;
    this.selected = index;
    this.audio.play('menuMove');
  }

  private activate(): void {
    this.audio.play('menuSelect');
    this.items[this.selected].select();
  }
}
