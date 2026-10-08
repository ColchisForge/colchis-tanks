import { DIRECTION_VECTORS } from '../core/geometry';
import type { Effects, Explosion, Particle, ParticleKind, Puff } from '../effects/Effects';
import { shade } from './art/PixelArt';
import { AP, bandedGlow, fillDisc, rgbOf, snap, strokeRing } from './draw';
import { PALETTE } from './palette';
import { drawText } from './PixelFont';

const EMISSIVE: ReadonlySet<ParticleKind> = new Set(['spark', 'flame']);
const FIREBALL = [PALETTE.white, PALETTE.goldLight, PALETTE.gold, PALETTE.orange, '#d0582a', '#8a3a24'];
const FIREBALL_RIMS = FIREBALL.map((c) => shade(c, -0.3));
const SMOKE_BALL = ['#6a5a52', '#4e4440', '#3a3432'];
/** Share of a puff's life spent as fire before it turns to smoke. */
const FIRE_SHARE = 0.45;

/** Kept for code that strokes rings in game pixels. */
export function strokePixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): void {
  strokeRing(ctx, cx, cy, radius, color, 2);
}

function colorAt(colors: readonly string[], progress: number): string {
  return colors[Math.min(colors.length - 1, Math.floor(progress * colors.length))];
}

export class EffectsRenderer {
  /** Light thrown onto the ground by blasts and muzzle flashes, under everything standing on it. */
  drawGroundLight(ctx: CanvasRenderingContext2D, effects: Effects): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const light of effects.lights) {
      const fade = 1 - light.age / light.duration;
      bandedGlow(ctx, light.x, light.y, light.radius * (0.8 + fade * 0.2), rgbOf(light.color), 0.32 * fade);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Ground-level effects: flashes appear under bushes like the tanks firing them, plus shadows of airborne bits. */
  drawUnder(ctx: CanvasRenderingContext2D, effects: Effects): void {
    ctx.fillStyle = 'rgba(10, 12, 6, 0.3)';
    for (const p of effects.particles) {
      if (p.z > 0.4 && (p.kind === 'chunk' || p.kind === 'casing' || p.kind === 'leaf' || p.kind === 'drop')) {
        ctx.fillRect(snap(p.x) + AP, snap(p.y) + AP, AP * 2, AP * 2);
      }
    }
    for (const flash of effects.flashes) {
      const v = DIRECTION_VECTORS[flash.direction];
      const side = { x: -v.y, y: v.x };
      const x = snap(flash.x);
      const y = snap(flash.y);
      const progress = flash.age / flash.duration;
      const len = (flash.size >= 1 ? 6 : 3) * (1 - progress * 0.4);
      ctx.globalCompositeOperation = 'lighter';
      for (let t = 0; t <= len; t += AP) {
        const width = (len - t) * (flash.size >= 1 ? 0.55 : 0.35) + AP;
        const color = t < len * 0.35 ? PALETTE.white : t < len * 0.7 ? PALETTE.goldLight : PALETTE.orange;
        ctx.fillStyle = color;
        ctx.fillRect(x + v.x * t - side.x * width - AP / 2, y + v.y * t - side.y * width - AP / 2, Math.abs(side.x) * width * 2 + AP, Math.abs(side.y) * width * 2 + AP);
      }
      if (flash.size >= 1) {
        // Side vents of the muzzle brake.
        ctx.fillStyle = PALETTE.gold;
        for (const s of [-1, 1]) ctx.fillRect(x + side.x * s * 2.5 + v.x - AP / 2, y + side.y * s * 2.5 + v.y - AP / 2, 1, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Effects above units. 'matter' is what darkness covers (smoke, debris); 'glow' gives off its
   * own light (fireballs, sparks, flames, shockwaves) and is drawn after the night overlay.
   */
  drawOver(ctx: CanvasRenderingContext2D, effects: Effects, pass: 'all' | 'matter' | 'glow' = 'all'): void {
    if (pass !== 'glow') {
      for (const p of effects.particles) if (!EMISSIVE.has(p.kind)) this.drawParticle(ctx, p);
    }
    if (pass === 'matter') return;
    for (const explosion of effects.explosions) this.drawExplosion(ctx, explosion);
    for (const p of effects.particles) if (EMISSIVE.has(p.kind)) this.drawParticle(ctx, p);
    for (const ring of effects.rings) {
      const progress = ring.age / ring.duration;
      if (ring.shockwave) {
        const eased = 1 - (1 - progress) * (1 - progress);
        ctx.globalAlpha = (1 - progress) * 0.55;
        strokeRing(ctx, ring.x, ring.y, ring.radius * (0.25 + eased * 0.75), ring.color, 3);
        ctx.globalAlpha = 1;
      } else {
        strokeRing(ctx, ring.x, ring.y, ring.radius * (0.3 + progress * 0.7), ring.color, 2);
      }
    }
    if (pass === 'all') this.drawTexts(ctx, effects);
  }

  drawTexts(ctx: CanvasRenderingContext2D, effects: Effects): void {
    for (const text of effects.texts) {
      const progress = text.age / text.duration;
      if (progress > 0.75 && Math.floor(text.age * 20) % 2 === 0) continue;
      drawText(ctx, text.text, text.x, text.y - 6 - progress * 10, { color: text.color, align: 'center', shadow: PALETTE.ink });
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const progress = p.age / p.duration;
    const color = colorAt(p.colors, progress);
    switch (p.kind) {
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;
        const x = snap(p.x);
        const y = snap(p.y);
        ctx.fillRect(x, y, AP, AP);
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 25) {
          ctx.globalAlpha = 0.5;
          ctx.fillRect(snap(p.x - (p.vx / speed) * AP * 2), snap(p.y - (p.vy / speed) * AP * 2), AP, AP);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      case 'chunk': {
        const size = Math.max(1, Math.round(p.size * 2)) * AP;
        ctx.fillStyle = color;
        ctx.fillRect(snap(p.x - size / 2), snap(p.y - p.z - size / 2), size, size);
        return;
      }
      case 'puff': {
        ctx.globalAlpha = p.alpha * Math.pow(1 - progress, 0.8);
        fillDisc(ctx, p.x, p.y, p.size, color);
        ctx.globalAlpha = 1;
        return;
      }
      case 'flame': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 - progress * 0.5;
        fillDisc(ctx, p.x, p.y, Math.max(AP, p.size), color);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      case 'leaf': {
        const flip = Math.floor(p.age * 8) % 2 === 0;
        ctx.globalAlpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;
        ctx.fillStyle = color;
        ctx.fillRect(snap(p.x), snap(p.y - p.z), flip ? AP * 2 : AP, flip ? AP : AP * 2);
        ctx.globalAlpha = 1;
        return;
      }
      case 'drop': {
        ctx.fillStyle = color;
        ctx.fillRect(snap(p.x), snap(p.y - p.z), AP, AP);
        return;
      }
      case 'casing': {
        const flip = Math.floor(p.age * 14) % 2 === 0 || p.z <= 0;
        ctx.fillStyle = color;
        ctx.fillRect(snap(p.x), snap(p.y - p.z), flip ? AP * 2 : AP, flip ? AP : AP * 2);
        return;
      }
    }
  }

  /** A puff with two smaller lumps on its edge, so clouds read as billowing rather than round. */
  private lumpyDisc(ctx: CanvasRenderingContext2D, puff: Puff, x: number, y: number, radius: number, color: string): void {
    fillDisc(ctx, x, y, radius * 0.85, color);
    const a = puff.dx * 7 + puff.dy * 3;
    for (const angle of [a, a + 2.4]) {
      fillDisc(ctx, x + Math.cos(angle) * radius * 0.42, y + Math.sin(angle) * radius * 0.42, radius * 0.6, color);
    }
  }

  private drawExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion): void {
    const early = explosion.age / explosion.duration;
    if (early < 0.25) {
      ctx.globalCompositeOperation = 'lighter';
      bandedGlow(ctx, explosion.x, explosion.y, 16 * explosion.scale, '255, 210, 120', 0.5 * (1 - early / 0.25));
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const puff of explosion.puffs) {
      const local = (explosion.age - puff.delay) / (explosion.duration - puff.delay);
      if (local < 0 || local >= 1) continue;
      const x = explosion.x + puff.dx;
      const y = explosion.y + puff.dy - local * 3;
      if (local < FIRE_SHARE) {
        // Fireball: a darker rim offset down-right gives it volume, a hot core sits up-left.
        const t = local / FIRE_SHARE;
        const radius = puff.radius * Math.min(1, local / 0.12);
        const i = Math.min(FIREBALL.length - 1, Math.floor(t * FIREBALL.length));
        this.lumpyDisc(ctx, puff, x + AP * 2, y + AP * 2, radius, FIREBALL_RIMS[i]);
        this.lumpyDisc(ctx, puff, x, y, radius, FIREBALL[i]);
        if (t < 0.7) fillDisc(ctx, x - radius * 0.3, y - radius * 0.3, radius * 0.4, FIREBALL[Math.max(0, i - 1)]);
      } else {
        // Then it rolls on as smoke, swelling and thinning out.
        const t = (local - FIRE_SHARE) / (1 - FIRE_SHARE);
        const radius = puff.radius * (1 + t * 0.3);
        const color = colorAt(SMOKE_BALL, t);
        ctx.globalAlpha = 0.85 * (1 - t);
        this.lumpyDisc(ctx, puff, x + AP * 2, y + AP * 2, radius, shade(color, -0.3));
        this.lumpyDisc(ctx, puff, x, y, radius, color);
        ctx.globalAlpha = 1;
      }
    }
  }
}
