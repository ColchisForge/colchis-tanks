import { DIRECTION_VECTORS, type Direction, type Rect, type Vec } from '../core/geometry';
import { NIGHT_CONFIG, VISIBILITY_CONFIG } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';

const SAMPLE_STEP = 2;

function centre(rect: Rect): Vec {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Anything that can look around. Tanks see along the way they face when it is dark. */
export interface Observer extends Rect {
  readonly direction?: Direction;
}

/** A tank as a target: firing the cannon gives its position away in the dark. */
export interface Target extends Rect {
  readonly cannon: { readonly sinceLastShot: number };
}

/** True if `point` lies inside a beam of light cast from `from` along `direction`. Walls are not considered. */
export function inBeamCone(from: Vec, direction: Direction, point: Vec): boolean {
  const v = DIRECTION_VECTORS[direction];
  const dx = point.x - from.x;
  const dy = point.y - from.y;
  const along = dx * v.x + dy * v.y;
  if (along <= 0 || along > NIGHT_CONFIG.beamRange) return false;
  const across = Math.abs(dx * v.y - dy * v.x);
  return across <= 4 + along * Math.tan(NIGHT_CONFIG.beamHalfAngle);
}

/**
 * What enemies can see. Walls block sight; bushes hide a soldier standing in them. At night only
 * lit things can be seen: whatever is in a searchlight beam or near a burning wreck.
 */
export class Perception {
  /** Fires burning on the battlefield (centres of wrecks), refreshed every tick. */
  private fires: Vec[] = [];

  constructor(
    private readonly map: TileMap,
    readonly night = false,
  ) {}

  /** Collects the light sources for this tick. */
  update(wrecks: readonly Rect[]): void {
    this.fires = wrecks.map(centre);
  }

  /** True if the centre of the rect is in concealing terrain. */
  isConcealed(rect: Rect): boolean {
    const c = centre(rect);
    const s = this.map.tileSize;
    return this.map.conceals(Math.floor(c.x / s), Math.floor(c.y / s));
  }

  hasLineOfSight(from: Vec, to: Vec): boolean {
    const s = this.map.tileSize;
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / SAMPLE_STEP);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const col = Math.floor((from.x + (to.x - from.x) * t) / s);
      const row = Math.floor((from.y + (to.y - from.y) * t) / s);
      if (this.map.blocksSight(col, row)) return false;
    }
    return true;
  }

  /** Whether a point is lit as far as this observer is concerned: daylight, its own beam, or a fire. */
  isLit(point: Vec, observer: Observer): boolean {
    if (!this.night) return true;
    const eye = centre(observer);
    if (observer.direction && inBeamCone(eye, observer.direction, point)) return true;
    const r = NIGHT_CONFIG.fireRadius;
    return this.fires.some((fire) => Math.hypot(fire.x - point.x, fire.y - point.y) <= r);
  }

  /**
   * Whether an observer can spot a soldier: very close always works; otherwise it needs open
   * ground, no lingering smoke, a clear line and, at night, light.
   */
  canSeeSoldier(observer: Observer, soldier: Rect & { readonly cover?: number }): boolean {
    const a = centre(observer);
    const b = centre(soldier);
    const touching = Math.hypot(a.x - b.x, a.y - b.y) <= (observer.w + soldier.w) / 2 + VISIBILITY_CONFIG.proximity;
    if (touching) return true;
    if ((soldier.cover ?? 0) > 0 || this.isConcealed(soldier)) return false;
    if (!this.isLit(b, observer)) return false;
    return this.hasLineOfSight(a, b);
  }

  /** Whether an observer notices a tank within `range`. In the dark it must be close, lit, or firing. */
  canSpotTank(observer: Observer, target: Target, range: number): boolean {
    const a = centre(observer);
    const b = centre(target);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > range) return false;
    if (!this.night || d <= range * NIGHT_CONFIG.tankNoticeScale) return true;
    if (target.cannon.sinceLastShot < NIGHT_CONFIG.muzzleReveal) return true;
    return this.isLit(b, observer) && this.hasLineOfSight(a, b);
  }
}
