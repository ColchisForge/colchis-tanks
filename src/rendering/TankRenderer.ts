import { DIRECTION_VECTORS } from '../core/geometry';
import { EnemyTank } from '../entities/EnemyTank';
import type { Tank } from '../entities/Tank';
import type { TankDesign } from './art/units';
import { AP, drawArt, snap, strokeRing } from './draw';
import type { LandStyle } from './lands';
import { PALETTE } from './palette';
import type { SpriteCache, TankScheme } from './SpriteCache';

const RECOIL_TIME = 0.08;
const SHIELD_WARNING_TIME = 1.5;
/** Drop shadows fall down and to the right, matching the walls. */
export const SHADOW_OFFSET = { x: 1.5, y: 2 } as const;

export class TankRenderer {
  constructor(private readonly sprites: SpriteCache) {}

  private sprite(tank: Tank, time: number): HTMLCanvasElement {
    const design: TankDesign = tank instanceof EnemyTank ? tank.kind : 'player';
    let scheme: TankScheme = tank.disabled ? 'wreck' : 'normal';
    if (tank instanceof EnemyTank && tank.carrier && tank.operational && Math.floor(time * 7) % 2 === 0) scheme = 'carrier';
    if (tank.hitFlash > 0) scheme = 'flash';
    const phase = Math.floor(tank.travelled * 2) % 4;
    const scorched = !tank.disabled && tank.health.ratio <= 0.5;
    return this.sprites.tank(design, scheme, tank.direction, phase, scorched);
  }

  private position(tank: Tank): { x: number; y: number } {
    const recoil = tank.cannon.sinceLastShot < RECOIL_TIME ? 1 : 0;
    const v = DIRECTION_VECTORS[tank.direction];
    return { x: snap(tank.x) - v.x * recoil, y: snap(tank.y) - v.y * recoil };
  }

  drawShadow(ctx: CanvasRenderingContext2D, tank: Tank, land: LandStyle, time: number): void {
    const { x, y } = this.position(tank);
    ctx.globalAlpha = land.shadow.alpha * 1.4;
    drawArt(ctx, this.sprites.silhouette(this.sprite(tank, time), land.shadow.color), x + SHADOW_OFFSET.x, y + SHADOW_OFFSET.y);
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, tank: Tank, time: number): void {
    const { x, y } = this.position(tank);
    drawArt(ctx, this.sprite(tank, time), x, y);
    const shield = tank.effects.remaining('shield');
    if (shield > 0 && (shield > SHIELD_WARNING_TIME || Math.floor(time * 10) % 2 === 0)) {
      this.drawShield(ctx, snap(tank.x) + tank.w / 2, snap(tank.y) + tank.h / 2, time);
    }
  }

  /** A small bar over damaged enemies so heavy tanks visibly wear down. */
  drawHealthBar(ctx: CanvasRenderingContext2D, tank: Tank): void {
    if (!tank.operational) return;
    const ratio = tank.health.ratio;
    if (ratio >= 1 || ratio <= 0) return;
    const color = ratio > 0.5 ? PALETTE.green : ratio > 0.25 ? PALETTE.gold : PALETTE.red;
    this.drawBar(ctx, tank, ratio, color, PALETTE.redDark);
  }

  /** Progress of a repair in hand, over the wreck. */
  drawRepairBar(ctx: CanvasRenderingContext2D, tank: Tank): void {
    if (!tank.disabled || tank.repairProgress <= 0) return;
    this.drawBar(ctx, tank, tank.repairProgress, PALETTE.cyan, PALETTE.shadow);
  }

  private drawBar(ctx: CanvasRenderingContext2D, tank: Tank, ratio: number, color: string, empty: string): void {
    const width = 12;
    const x = Math.round(tank.x) + 2;
    const y = Math.round(tank.y) - 4;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x - AP, y - AP, width + 2 * AP, 1 + 2 * AP);
    ctx.fillStyle = empty;
    ctx.fillRect(x, y, width, 1);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(AP, snap(width * ratio)), 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(x, y, Math.max(AP, snap(width * ratio)), AP);
  }

  /** A shimmering bubble of dashes; colour alternates so it reads as energy. */
  private drawShield(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
    ctx.globalCompositeOperation = 'lighter';
    const spin = time * 3;
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const phase = (i + Math.floor(time * 30)) % 6;
      if (phase >= 3) continue;
      const a = (i / steps) * Math.PI * 2 + spin;
      const r = 12 + Math.sin(a * 3 + time * 6) * 0.5;
      ctx.fillStyle = phase === 0 ? PALETTE.white : PALETTE.cyan;
      ctx.fillRect(snap(cx + Math.cos(a) * r), snap(cy + Math.sin(a) * r), AP * 2, AP * 2);
    }
    ctx.globalAlpha = 0.18;
    strokeRing(ctx, cx, cy, 11, PALETTE.cyan, 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
