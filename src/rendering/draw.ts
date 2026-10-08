import { RENDER_SCALE } from '../game/GameConfig';

/** One art pixel, in game pixels. */
export const AP = 1 / RENDER_SCALE;

/** Rounds a game coordinate to the nearest art pixel, so sprites land on whole device pixels. */
export function snap(v: number): number {
  return Math.round(v * RENDER_SCALE) / RENDER_SCALE;
}

/** Draws an art-resolution canvas at its size in game pixels. */
export function drawArt(ctx: CanvasRenderingContext2D, art: CanvasImageSource & { width: number; height: number }, x: number, y: number): void {
  ctx.drawImage(art, snap(x), snap(y), art.width / RENDER_SCALE, art.height / RENDER_SCALE);
}

/** Filled circle made of art-pixel rows, so edges stay crisp at any radius. */
export function fillDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): void {
  const r = Math.round(radius * RENDER_SCALE);
  if (r <= 0) return;
  ctx.fillStyle = color;
  const x0 = Math.round(cx * RENDER_SCALE);
  const y0 = Math.round(cy * RENDER_SCALE);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect((x0 - half) * AP, (y0 + dy) * AP, (half * 2 + 1) * AP, AP);
  }
}

/** Circle outline one art pixel thick (or `thickness` art pixels). */
export function strokeRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, thickness = 1): void {
  const r = radius * RENDER_SCALE;
  if (r < 1) return;
  ctx.fillStyle = color;
  const x0 = cx * RENDER_SCALE;
  const y0 = cy * RENDER_SCALE;
  const steps = Math.max(12, Math.ceil(r * 6.3));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(x0 + Math.cos(a) * r);
    const y = Math.round(y0 + Math.sin(a) * r);
    ctx.fillRect(x * AP, y * AP, thickness * AP, thickness * AP);
  }
}

/**
 * A round light with hard-edged bands rather than a smooth falloff, which keeps the 16-bit look.
 * Draw it with 'lighter' to brighten, or 'destination-out' to cut through darkness.
 */
export function bandedGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, alpha: number): void {
  if (radius <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const bands = [1, 0.62, 0.36, 0.16];
  for (let i = 0; i < bands.length; i++) {
    const from = i / bands.length;
    const to = (i + 1) / bands.length;
    const a = (alpha * bands[i]).toFixed(3);
    g.addColorStop(from, `rgba(${rgb}, ${a})`);
    g.addColorStop(Math.min(1, to - 0.001), `rgba(${rgb}, ${a})`);
  }
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** '#rrggbb' to 'r, g, b' for building rgba() strings. */
export function rgbOf(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
