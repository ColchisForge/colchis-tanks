import type { Rect, Vec } from '../core/geometry';

/** Anything with an axis-aligned body on the battlefield. Positions are the top-left corner. */
export abstract class Entity implements Rect {
  active = true;

  constructor(
    public x: number,
    public y: number,
    readonly w: number,
    readonly h: number,
  ) {}

  get center(): Vec {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }
}
