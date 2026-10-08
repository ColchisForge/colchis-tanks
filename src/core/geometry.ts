export type Direction = 'up' | 'right' | 'down' | 'left';

export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tolerance for float comparisons so touching edges never count as overlap. */
export const EPSILON = 1e-6;

export const DIRECTION_VECTORS: Readonly<Record<Direction, Readonly<Vec>>> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const OPPOSITES: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
};

export function isVertical(direction: Direction): boolean {
  return direction === 'up' || direction === 'down';
}

export function opposite(direction: Direction): Direction {
  return OPPOSITES[direction];
}

export function isPerpendicular(a: Direction, b: Direction): boolean {
  return isVertical(a) !== isVertical(b);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - EPSILON &&
    a.x + a.w > b.x + EPSILON &&
    a.y < b.y + b.h - EPSILON &&
    a.y + a.h > b.y + EPSILON
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
