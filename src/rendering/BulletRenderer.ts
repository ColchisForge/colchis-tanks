import { DIRECTION_VECTORS } from '../core/geometry';
import type { Bullet } from '../entities/Bullet';
import { AP, bandedGlow, snap } from './draw';
import { PALETTE } from './palette';

const TRACER = {
  player: { head: '#fffbe0', body: '#ffe07a', tail: '#c88a24', glow: '255, 200, 90' },
  enemy: { head: '#fff0e0', body: '#ff9a5a', tail: '#c0402a', glow: '255, 120, 70' },
} as const;

/** Machine-gun tracer: the burning compound in the round's base glows green. */
const GREEN_TRACER = { head: '#f0fff0', body: '#7dff8a', tail: '#20b040', glow: '90, 255, 120' } as const;
const BALL_ROUND = '#fff0b0';

/**
 * Machine-gun rounds. As on a real belt, only every few rounds is a tracer: a bright green streak
 * with a soft glow, visible along its whole flight. The ball rounds between are just a faint
 * yellowish flicker.
 */
function drawRound(ctx: CanvasRenderingContext2D, round: Bullet): void {
  const cx = snap(round.x + round.w / 2);
  const cy = snap(round.y + round.h / 2);
  const v = DIRECTION_VECTORS[round.direction];
  const dot = (along: number, color: string, alpha: number, size = AP) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(snap(cx + v.x * along) - size / 2, snap(cy + v.y * along) - size / 2, size, size);
  };
  ctx.globalCompositeOperation = 'lighter';
  if (!round.tracer) {
    dot(0, BALL_ROUND, 0.7);
    dot(-AP * 2, BALL_ROUND, 0.35);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  bandedGlow(ctx, cx, cy, 3.5, GREEN_TRACER.glow, 0.35);
  // The streak itself is painted normally, so it stays green over water, snow or stone.
  ctx.globalCompositeOperation = 'source-over';
  const length = 11;
  for (let i = length * 2; i >= 1; i--) {
    const t = i / (length * 2);
    dot(-i * AP, t > 0.55 ? GREEN_TRACER.tail : GREEN_TRACER.body, (1 - t) * 0.95);
  }
  dot(0, GREEN_TRACER.body, 1, AP * 2);
  dot(AP / 2, GREEN_TRACER.head, 1);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * An anti-tank rocket: an olive body with a red warhead and tail fins, riding a flickering motor
 * flame. The smoke trail behind it comes from the effects system.
 */
function drawRocket(ctx: CanvasRenderingContext2D, rocket: Bullet): void {
  const cx = snap(rocket.x + rocket.w / 2);
  const cy = snap(rocket.y + rocket.h / 2);
  const v = DIRECTION_VECTORS[rocket.direction];
  const side = { x: -v.y, y: v.x };
  const flicker = 0.75 + Math.random() * 0.5;
  const at = (along: number, across: number, w: number, l: number, color: string) => {
    // A w x l block (w across the flight line, l along it) centred on the given offsets.
    const width = Math.abs(side.x) * w + Math.abs(v.x) * l;
    const height = Math.abs(side.y) * w + Math.abs(v.y) * l;
    ctx.fillStyle = color;
    ctx.fillRect(snap(cx + v.x * along + side.x * across - width / 2), snap(cy + v.y * along + side.y * across - height / 2), width, height);
  };
  ctx.globalCompositeOperation = 'lighter';
  bandedGlow(ctx, cx - v.x * 3, cy - v.y * 3, 7 * flicker, '255, 170, 80', 0.4);
  at(-3.5, 0, 1.5, 3 * flicker, '#ffb040');
  at(-3, 0, AP * 2, 2 * flicker, '#fff4c0');
  ctx.globalCompositeOperation = 'source-over';
  at(-1.75, 0, 2.5, AP * 2, '#26301a');
  at(0, 0, 1.5, 3.5, '#4a5a2e');
  at(0, -0.5, AP, 3, '#6e7e48');
  at(2, 0, 1.5, 1, '#c83a2a');
  at(2.5, 0, AP, AP, '#ff9a7a');
}

/** Projectiles fly above the ground: a faint shadow below sells the height. */
export function drawShellShadow(ctx: CanvasRenderingContext2D, shell: Bullet): void {
  const cx = snap(shell.x + shell.w / 2);
  const cy = snap(shell.y + shell.h / 2);
  ctx.fillStyle = 'rgba(10, 12, 6, 0.35)';
  if (shell.kind !== 'bullet') ctx.fillRect(cx + 1.5 - 1, cy + 2 - 1, 2, 2);
  else ctx.fillRect(cx + 1, cy + 1.5, AP * 2, AP * 2);
}

/**
 * Tracer rounds: shells are a glowing slug with a long fading streak; machine-gun rounds are a
 * thin bright line. Both are drawn additively so they light up whatever they pass over.
 */
export function drawShell(ctx: CanvasRenderingContext2D, shell: Bullet): void {
  if (shell.kind === 'rocket') {
    drawRocket(ctx, shell);
    return;
  }
  if (shell.kind === 'bullet') {
    drawRound(ctx, shell);
    return;
  }
  const colors = TRACER[shell.team];
  const cx = snap(shell.x + shell.w / 2);
  const cy = snap(shell.y + shell.h / 2);
  const v = DIRECTION_VECTORS[shell.direction];
  const heavy = shell.kind === 'shell';
  const width = heavy ? 1.5 : AP;
  const length = heavy ? 9 : 6;

  ctx.globalCompositeOperation = 'lighter';
  if (heavy) bandedGlow(ctx, cx, cy, 6, colors.glow, 0.35);
  // The streak, from the tail (dim) to just behind the head (bright).
  const steps = length * 2;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.fillStyle = t > 0.6 ? colors.tail : colors.body;
    const along = -i * AP;
    const x = cx + v.x * along - (v.x === 0 ? width / 2 : 0);
    const y = cy + v.y * along - (v.y === 0 ? width / 2 : 0);
    ctx.fillRect(x, y, v.x === 0 ? width : AP, v.y === 0 ? width : AP);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Head.
  const hw = heavy ? 2 : 1;
  ctx.fillStyle = heavy ? colors.body : colors.head;
  ctx.fillRect(cx - hw / 2, cy - hw / 2, hw, hw);
  ctx.fillStyle = colors.head;
  ctx.fillRect(cx - AP / 2 + v.x * (hw / 2 - AP / 2), cy - AP / 2 + v.y * (hw / 2 - AP / 2), heavy ? 1 : AP, heavy ? 1 : AP);
  if (heavy) {
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(cx + v.x * (hw / 2) - AP / 2, cy + v.y * (hw / 2) - AP / 2, AP, AP);
  }
}
