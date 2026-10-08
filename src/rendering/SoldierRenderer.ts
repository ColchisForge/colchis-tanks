import type { Body } from '../effects/Effects';
import type { Soldier } from '../entities/Soldier';
import { ROCKET_CONFIG } from '../game/GameConfig';
import { AP, drawArt, snap } from './draw';
import type { LandStyle } from './lands';
import { PALETTE } from './palette';
import type { SpriteCache } from './SpriteCache';

const STRIDE = 3;
/** Fallen crew fade out over the last part of their time on the ground. */
const BODY_FADE = 2;

export class SoldierRenderer {
  constructor(private readonly sprites: SpriteCache) {}

  private sprite(soldier: Soldier): HTMLCanvasElement {
    const frame = soldier.moving ? 1 + (Math.floor(soldier.travelled / STRIDE) % 2) : 0;
    return this.sprites.soldier(soldier.team, soldier.direction, frame, soldier.hitFlash > 0, soldier.rockets > 0);
  }

  drawShadow(ctx: CanvasRenderingContext2D, soldier: Soldier, land: LandStyle): void {
    ctx.globalAlpha = land.shadow.alpha * 1.4;
    drawArt(ctx, this.sprites.silhouette(this.sprite(soldier), land.shadow.color), soldier.x + 1, soldier.y + 1.5);
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, soldier: Soldier): void {
    const x = snap(soldier.x);
    const y = snap(soldier.y);
    drawArt(ctx, this.sprite(soldier), x, y);
    if (soldier.carryingWrench) {
      // A tiny spanner held overhead.
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x + 2.5, y - 3.5, 3, 2);
      ctx.fillStyle = PALETTE.steelLight;
      ctx.fillRect(x + 3, y - 3, 2, 1);
      ctx.fillRect(x + 4.5, y - 3.5, AP, AP);
      ctx.fillStyle = PALETTE.goldLight;
      ctx.fillRect(x + 3, y - 3, AP, AP);
    }
  }

  drawBody(ctx: CanvasRenderingContext2D, body: Body): void {
    const left = body.duration - body.age;
    if (left < BODY_FADE) ctx.globalAlpha = Math.max(0, left / BODY_FADE);
    drawArt(ctx, this.sprites.fallen(body.team, body.direction), body.x - 4, body.y - 4);
    ctx.globalAlpha = 1;
  }

  /** An enemy crew lining up a rocket gets a red warning sign, blinking faster as it takes aim. */
  drawAimWarning(ctx: CanvasRenderingContext2D, soldier: Soldier, time: number): void {
    const aim = soldier.brain.aim;
    if (soldier.team !== 'enemy' || aim <= 0) return;
    const rate = 4 + 10 * Math.min(1, aim / ROCKET_CONFIG.aimTime);
    if (Math.floor(time * rate) % 2 === 1) return;
    const x = snap(soldier.x) + soldier.w / 2;
    const y = snap(soldier.y) - 7;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x - 2, y - 1, 4, 7);
    ctx.fillStyle = PALETTE.red;
    ctx.fillRect(x - 1, y, 2, 3.5);
    ctx.fillRect(x - 1, y + 4.5, 2, 1);
  }

  /** Remaining hits as pips over a wounded soldier. */
  drawHealth(ctx: CanvasRenderingContext2D, soldier: Soldier): void {
    const { current, max } = soldier.health;
    if (current >= max) return;
    const x = snap(soldier.x) + (soldier.w - (max * 1.5 - AP)) / 2;
    const y = snap(soldier.y) - 2.5;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x - AP, y - AP, max * 1.5 + AP, 1 + 2 * AP);
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < current ? PALETTE.redLight : PALETTE.shadow;
      ctx.fillRect(x + i * 1.5, y, 1, 1);
    }
  }
}
