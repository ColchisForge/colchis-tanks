import { DIRECTION_VECTORS, type Vec } from '../core/geometry';
import type { Effects } from '../effects/Effects';
import type { Tank } from '../entities/Tank';
import type { Battle } from '../game/Battle';
import { NIGHT_CONFIG } from '../game/GameConfig';
import type { TileMap } from '../world/TileMap';
import { context2d, createCanvas } from './canvas';
import { bandedGlow, rgbOf } from './draw';
import { PALETTE } from './palette';

const DARKNESS = 'rgba(4, 8, 24, 0.8)';
const BEAM_RAYS = 22;
const RAY_STEP = 2;
const BEAM_TINT = { player: '255, 236, 190', enemy: '255, 250, 200' } as const;

export interface Glow {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Night missions: the field is drawn dark, and light cuts through it. Every working tank throws
 * a beam ahead (walls cast it short), wrecks burn, and shots and blasts flash. Enemy beams are
 * exactly what their crews can see, so a crew on foot can read where it is safe to move.
 * Darkness is kept at game-pixel resolution so its edges stay blocky.
 */
export class LightingRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private dark: CanvasRenderingContext2D | null = null;

  draw(ctx: CanvasRenderingContext2D, battle: Battle, effects: Effects, extra: readonly Glow[], time: number): void {
    const map = battle.map;
    const dark = this.context(map);
    dark.globalCompositeOperation = 'source-over';
    dark.clearRect(0, 0, map.width, map.height);
    dark.fillStyle = DARKNESS;
    dark.fillRect(0, 0, map.width, map.height);

    dark.globalCompositeOperation = 'destination-out';
    const beams: { tank: Tank; points: Vec[] }[] = [];
    for (const tank of battle.tanks) {
      const c = tank.center;
      if (tank.manned) {
        const points = this.beam(map, tank);
        beams.push({ tank, points });
        this.fillBeam(dark, tank, points, 1);
        bandedGlow(dark, c.x, c.y, 13, '0, 0, 0', 0.75);
      } else if (tank.disabled) {
        const flicker = 0.85 + Math.sin(time * 17 + c.x) * 0.08 + Math.sin(time * 7.3 + c.y) * 0.07;
        bandedGlow(dark, c.x, c.y, NIGHT_CONFIG.fireRadius * flicker, '0, 0, 0', 1);
      }
    }
    const crew = battle.playerOnFoot;
    if (crew) bandedGlow(dark, crew.center.x, crew.center.y, 9, '0, 0, 0', 0.45);
    const base = battle.baseTarget;
    if (base) bandedGlow(dark, base.x, base.y, 16, '0, 0, 0', 0.55);
    const hq = battle.enemyBaseTarget;
    if (hq) bandedGlow(dark, hq.x, hq.y, battle.enemyAlarm ? 30 : 16, '0, 0, 0', battle.enemyAlarm ? 0.75 : 0.5);
    for (const light of effects.lights) {
      bandedGlow(dark, light.x, light.y, light.radius * 1.3, '0, 0, 0', 1 - light.age / light.duration);
    }
    for (const shell of battle.shells) bandedGlow(dark, shell.x + shell.w / 2, shell.y + shell.h / 2, shell.kind === 'rocket' ? 16 : shell.kind === 'shell' ? 9 : shell.tracer ? 7 : 3, '0, 0, 0', 0.7);
    for (const glow of extra) bandedGlow(dark, glow.x, glow.y, glow.radius, '0, 0, 0', 0.6);
    dark.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.canvas as HTMLCanvasElement, 0, 0, map.width, map.height);

    // Warm tints on top, so lit ground reads as lamplight and firelight rather than daylight.
    ctx.globalCompositeOperation = 'lighter';
    for (const { tank, points } of beams) {
      ctx.globalAlpha = tank.team === 'enemy' ? 0.1 : 0.06;
      this.fillBeam(ctx, tank, points, 1, BEAM_TINT[tank.team]);
    }
    ctx.globalAlpha = 1;
    for (const tank of battle.tanks) {
      if (!tank.disabled) continue;
      const c = tank.center;
      bandedGlow(ctx, c.x, c.y, NIGHT_CONFIG.fireRadius, rgbOf(PALETTE.orange), 0.16 + Math.sin(time * 13 + c.x) * 0.03);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private context(map: TileMap): CanvasRenderingContext2D {
    if (!this.canvas || this.canvas.width !== map.width || this.canvas.height !== map.height) {
      this.canvas = createCanvas(map.width, map.height);
      this.dark = context2d(this.canvas);
    }
    return this.dark as CanvasRenderingContext2D;
  }

  /** The lit area ahead of a tank: rays fanned across the beam, each stopped by the first wall. */
  private beam(map: TileMap, tank: Tank): Vec[] {
    const c = tank.center;
    const v = DIRECTION_VECTORS[tank.direction];
    const side = { x: -v.y, y: v.x };
    const half = NIGHT_CONFIG.beamHalfAngle;
    const range = NIGHT_CONFIG.beamRange;
    const s = map.tileSize;
    const starts: Vec[] = [];
    const ends: Vec[] = [];
    for (let i = 0; i <= BEAM_RAYS; i++) {
      const k = -1 + (2 * i) / BEAM_RAYS;
      const start = { x: c.x + side.x * 4 * k, y: c.y + side.y * 4 * k };
      const a = k * half;
      const dir = { x: v.x * Math.cos(a) + side.x * Math.sin(a), y: v.y * Math.cos(a) + side.y * Math.sin(a) };
      let reach = range / Math.cos(a);
      for (let t = 8; t <= reach; t += RAY_STEP) {
        const col = Math.floor((start.x + dir.x * t) / s);
        const row = Math.floor((start.y + dir.y * t) / s);
        if (!map.inBounds(col, row) || map.blocksSight(col, row)) {
          reach = t;
          break;
        }
      }
      if (i === 0 || i === BEAM_RAYS) starts.push(start);
      ends.push({ x: start.x + dir.x * reach, y: start.y + dir.y * reach });
    }
    return [starts[0], ...ends, starts[1]];
  }

  private fillBeam(ctx: CanvasRenderingContext2D, tank: Tank, points: readonly Vec[], alpha: number, rgb = '0, 0, 0'): void {
    const c = tank.center;
    const v = DIRECTION_VECTORS[tank.direction];
    const range = NIGHT_CONFIG.beamRange;
    const g = ctx.createLinearGradient(c.x, c.y, c.x + v.x * range, c.y + v.y * range);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(0.5, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.8})`);
    g.addColorStop(0.8, `rgba(${rgb}, ${alpha * 0.8})`);
    g.addColorStop(0.8, `rgba(${rgb}, ${alpha * 0.55})`);
    g.addColorStop(1, `rgba(${rgb}, ${alpha * 0.55})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
  }
}
