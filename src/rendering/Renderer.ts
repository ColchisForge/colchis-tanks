import type { Rect } from '../core/geometry';
import type { Effects } from '../effects/Effects';
import type { Mine } from '../entities/Mine';
import type { Supply } from '../entities/Supply';
import type { Wrench } from '../entities/Wrench';
import type { Battle } from '../game/Battle';
import { FIELD_X, FIELD_Y, RENDER_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH, SPAWN_CONFIG, TILE_SIZE } from '../game/GameConfig';
import type { SpawnPortal } from '../systems/SpawnSystem';
import type { TileMap } from '../world/TileMap';
import { AmbientRenderer } from './AmbientRenderer';
import { drawShell, drawShellShadow } from './BulletRenderer';
import { AP, bandedGlow, drawArt, fillDisc, snap, strokeRing } from './draw';
import { EffectsRenderer } from './EffectsRenderer';
import { LANDS, type LandStyle } from './lands';
import { LightingRenderer } from './LightingRenderer';
import { MapRenderer } from './MapRenderer';
import { PALETTE } from './palette';
import { drawText, type TextStyle } from './PixelFont';
import { SoldierRenderer } from './SoldierRenderer';
import { SpriteCache } from './SpriteCache';
import { TankRenderer } from './TankRenderer';

export interface PanelStyle {
  readonly fill?: string;
  readonly border?: string;
}

/** Enemy mines show plainly within this distance of the player's tank or crew (px). */
const MINE_SPOT_RANGE = 28;
/** The battlefield opens like an iris when a level starts. */
const IRIS_TIME = 0.7;
const FRAME = { light: '#8f9ab0', mid: '#5a6378', dark: '#2c3242', rivet: '#c9d2e2' } as const;

/**
 * Owns the canvas context and composes the specialised renderers into frames. The canvas holds
 * RENDER_SCALE device pixels per game pixel; everything is drawn in game pixels, and sprites carry
 * art at the finer resolution.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites = new SpriteCache();
  readonly width = SCREEN_WIDTH;
  readonly height = SCREEN_HEIGHT;
  screenShake = true;
  private readonly terrain = new MapRenderer(this.sprites);
  private readonly tanks = new TankRenderer(this.sprites);
  private readonly soldiers = new SoldierRenderer(this.sprites);
  private readonly fx = new EffectsRenderer();
  private readonly lighting = new LightingRenderer();
  private readonly ambient = new AmbientRenderer();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser does not support 2D canvas');
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.ctx = ctx;
  }

  clear(color: string = PALETTE.void): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Draws art-resolution artwork at its size in game pixels. */
  art(art: HTMLCanvasElement, x: number, y: number): void {
    drawArt(this.ctx, art, x, y);
  }

  text(text: string, x: number, y: number, style: TextStyle): void {
    drawText(this.ctx, text, x, y, style);
  }

  /** Darkens everything drawn so far, for overlays. */
  dim(alpha = 0.6): void {
    this.ctx.fillStyle = `rgba(7, 7, 11, ${alpha})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** A riveted steel frame with a bevel and a coloured inner line. */
  panel(x: number, y: number, w: number, h: number, style: PanelStyle = {}): void {
    const ctx = this.ctx;
    const accent = style.border ?? PALETTE.gold;
    this.rect(x, y, w, h, PALETTE.ink);
    this.rect(x + 1, y + 1, w - 2, h - 2, FRAME.mid);
    this.rect(x + 1, y + 1, w - 2, 1, FRAME.light);
    this.rect(x + 1, y + 1, 1, h - 2, FRAME.light);
    this.rect(x + 1, y + h - 2, w - 2, 1, FRAME.dark);
    this.rect(x + w - 2, y + 1, 1, h - 2, FRAME.dark);
    this.rect(x + 3, y + 3, w - 6, h - 6, PALETTE.ink);
    this.rect(x + 4, y + 4, w - 8, h - 8, style.fill ?? PALETTE.panel);
    ctx.fillStyle = accent;
    ctx.fillRect(x + 4, y + 4, w - 8, AP);
    ctx.fillRect(x + 4, y + h - 4 - AP, w - 8, AP);
    ctx.fillRect(x + 4, y + 4, AP, h - 8);
    ctx.fillRect(x + w - 4 - AP, y + 4, AP, h - 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(x + 4 + AP, y + 4 + AP, w - 8 - 2 * AP, (h - 8) / 2);
    for (const [rx, ry] of [[x + 1.5, y + 1.5], [x + w - 2.5, y + 1.5], [x + 1.5, y + h - 2.5], [x + w - 2.5, y + h - 2.5]]) {
      ctx.fillStyle = FRAME.dark;
      ctx.fillRect(rx + AP, ry + AP, 1, 1);
      ctx.fillStyle = FRAME.rivet;
      ctx.fillRect(rx, ry, 1, 1);
    }
  }

  drawBattle(battle: Battle, effects: Effects, time: number): void {
    const ctx = this.ctx;
    const map = battle.map;
    const land = LANDS[battle.level.land];
    this.drawFieldFrame(map.width, map.height);

    const shake = this.screenShake ? effects.shake : 0;
    const ox = FIELD_X + snap((Math.random() * 2 - 1) * shake);
    const oy = FIELD_Y + snap((Math.random() * 2 - 1) * shake);

    ctx.save();
    ctx.beginPath();
    ctx.rect(FIELD_X, FIELD_Y, map.width, map.height);
    ctx.clip();
    ctx.translate(ox, oy);

    this.terrain.drawTerrain(ctx, map, land, time, effects.takeDecals());
    this.fx.drawGroundLight(ctx, effects);
    for (const body of effects.bodies) this.soldiers.drawBody(ctx, body);
    for (const mine of battle.minefield.mines) this.drawMine(mine, battle, time);
    this.drawPowerUps(battle, land);
    for (const portal of battle.spawner.portals) this.drawPortal(portal);
    this.fx.drawUnder(ctx, effects);
    for (const tank of battle.tanks) this.tanks.drawShadow(ctx, tank, land, time);
    for (const soldier of battle.soldiers) this.soldiers.drawShadow(ctx, soldier, land);
    for (const tank of battle.tanks) this.tanks.draw(ctx, tank, time);
    for (const soldier of battle.soldiers) this.soldiers.draw(ctx, soldier);
    for (const shell of battle.shells) drawShellShadow(ctx, shell);
    for (const shell of battle.shells) drawShell(ctx, shell);
    this.terrain.drawOverlay(ctx, map);
    this.fx.drawOver(ctx, effects, 'matter');

    this.ambient.update(map, land, time);
    this.ambient.draw(ctx, land, time);
    if (battle.level.night) this.lighting.draw(ctx, battle, effects, this.ambient.glows, time);
    this.fx.drawOver(ctx, effects, 'glow');

    // Above the bushes and the dark: things the player must always be able to find.
    this.drawGuide(battle, time);
    for (const wrench of battle.repairs.wrenches) this.drawWrench(wrench, land, time);
    for (const crate of battle.supplies.crates) this.drawCrate(crate, land, time);
    const crew = battle.playerOnFoot;
    if (crew && this.isUnderBush(map, crew)) {
      ctx.globalAlpha = 0.5;
      this.soldiers.draw(ctx, crew);
      ctx.globalAlpha = 1;
    }
    for (const enemy of battle.enemies) this.tanks.drawHealthBar(ctx, enemy);
    for (const tank of battle.tanks) this.tanks.drawRepairBar(ctx, tank);
    this.drawEnemyBaseStatus(battle, time);
    for (const soldier of battle.soldiers) this.soldiers.drawHealth(ctx, soldier);
    for (const soldier of battle.soldiers) this.soldiers.drawAimWarning(ctx, soldier, time);
    this.fx.drawTexts(ctx, effects);

    if (this.screenShake && effects.flash > 0) {
      ctx.fillStyle = `rgba(255, 244, 216, ${(effects.flash * 0.3).toFixed(3)})`;
      ctx.fillRect(0, 0, map.width, map.height);
    }
    this.drawDanger(battle, map, time);
    if (time < IRIS_TIME) this.drawIris(battle, map, time / IRIS_TIME);
    ctx.restore();
  }

  /** Text drawn in field coordinates, e.g. prompts over a unit. */
  fieldText(text: string, x: number, y: number, style: TextStyle): void {
    drawText(this.ctx, text, FIELD_X + x, FIELD_Y + y, style);
  }

  private drawPowerUps(battle: Battle, land: LandStyle): void {
    const ctx = this.ctx;
    for (const item of battle.powerUps.items) {
      if (item.expiring && Math.floor(item.age * 8) % 2 === 0) continue;
      const bob = (Math.sin(item.age * 4) + 1) * 1;
      const sprite = this.sprites.powerUp(item.kind);
      ctx.globalAlpha = land.shadow.alpha * (1.3 - bob * 0.2);
      drawArt(ctx, this.sprites.silhouette(sprite, land.shadow.color), item.x + 1.5, item.y + 2);
      ctx.globalAlpha = 1;
      drawArt(ctx, sprite, item.x, item.y - bob);
      // A glint sweeping across the crate.
      const glint = (item.age * 1.2) % 3;
      if (glint < 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        const gx = item.x + 2 + glint * 12;
        ctx.fillRect(snap(gx), snap(item.y - bob + 2), AP * 2, 1);
        ctx.fillRect(snap(gx - 1), snap(item.y - bob + 3), AP * 2, 1);
      }
    }
  }

  private drawWrench(wrench: Wrench, land: LandStyle, time: number): void {
    if (wrench.expiring && Math.floor(wrench.age * 8) % 2 === 0) return;
    const ctx = this.ctx;
    const cx = wrench.x + wrench.w / 2;
    const cy = wrench.y + wrench.h / 2;
    ctx.globalCompositeOperation = 'lighter';
    bandedGlow(ctx, cx, cy, 9, '255, 200, 90', 0.25 + Math.sin(time * 6) * 0.08);
    ctx.globalCompositeOperation = 'source-over';
    strokeRing(ctx, cx, cy, 6 + (Math.floor(time * 6) % 3), PALETTE.gold, 1);
    const bob = (Math.sin(wrench.age * 4) + 1) * 0.75;
    const sprite = this.sprites.wrench();
    ctx.globalAlpha = land.shadow.alpha * 1.3;
    drawArt(ctx, this.sprites.silhouette(sprite, land.shadow.color), wrench.x + 1, wrench.y + 1.5);
    ctx.globalAlpha = 1;
    drawArt(ctx, sprite, wrench.x, wrench.y - bob);
  }

  /** A crate glows faintly so it can be spotted from across the field, even under a bush. */
  private drawCrate(crate: Supply, land: LandStyle, time: number): void {
    const ctx = this.ctx;
    const cx = crate.x + crate.w / 2;
    const cy = crate.y + crate.h / 2;
    const glow = crate.kind === 'rocket' ? '255, 110, 80' : '240, 200, 80';
    ctx.globalCompositeOperation = 'lighter';
    bandedGlow(ctx, cx, cy, 8, glow, 0.18 + Math.sin(time * 4 + crate.x) * 0.06);
    ctx.globalCompositeOperation = 'source-over';
    const sprite = this.sprites.crate(crate.kind);
    ctx.globalAlpha = land.shadow.alpha * 1.3;
    drawArt(ctx, this.sprites.silhouette(sprite, land.shadow.color), crate.x + 1, crate.y + 1.5);
    ctx.globalAlpha = 1;
    drawArt(ctx, sprite, crate.x, crate.y);
  }

  /** Planted mines: the arming light blinks fast while the fuse sets, then winks slowly once live. */
  private drawMine(mine: Mine, battle: Battle, time: number): void {
    if (mine.team === 'enemy' && !this.spotted(mine, battle)) {
      // Buried by the enemy: only a patch of disturbed earth gives it away, and not in the dark.
      if (battle.level.night) return;
      const c = mine.center;
      this.ctx.globalAlpha = 0.28;
      fillDisc(this.ctx, c.x, c.y, 2.5, '#2a2016');
      this.ctx.globalAlpha = 0.4;
      this.ctx.fillStyle = '#2a2016';
      this.ctx.fillRect(snap(c.x + 2), snap(c.y - 2), AP, AP);
      this.ctx.fillRect(snap(c.x - 3), snap(c.y + 1), AP, AP);
      this.ctx.globalAlpha = 1;
      return;
    }
    let lamp: string | null = null;
    if (!mine.armed) lamp = Math.floor(mine.age * 8) % 2 === 0 ? '#ff4a3a' : null;
    else if ((time + mine.x * 0.01) % 1.6 < 0.12) lamp = '#7ad84a';
    drawArt(this.ctx, this.sprites.mine(lamp), mine.x, mine.y);
  }

  /** An enemy mine is plain to see once the player's tank or crew is right next to it. */
  private spotted(mine: Mine, battle: Battle): boolean {
    const c = mine.center;
    const near = (unit: { center: { x: number; y: number } } | null) => unit !== null && Math.hypot(unit.center.x - c.x, unit.center.y - c.y) <= MINE_SPOT_RANGE;
    return near(battle.playerOnFoot) || near(battle.playerTank?.active ? battle.playerTank : null);
  }

  /** The enemy HQ's remaining strength once it has been hit, and its beacon while the alarm is up. */
  private drawEnemyBaseStatus(battle: Battle, time: number): void {
    const hq = battle.map.enemyBase;
    if (!hq || hq.destroyed) return;
    const ctx = this.ctx;
    const x = hq.col * TILE_SIZE;
    const y = hq.row * TILE_SIZE;
    if (battle.enemyAlarm) {
      // A rotating red beacon on the roof.
      const sweep = time * 6;
      const bx = x + 8 + Math.cos(sweep) * 1.5;
      const by = y + 3;
      ctx.globalCompositeOperation = 'lighter';
      bandedGlow(ctx, bx, by, 10, '255, 60, 40', 0.25 + 0.2 * Math.max(0, Math.sin(sweep)));
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = Math.sin(sweep) > 0 ? '#ff5a3a' : '#a8221a';
      ctx.fillRect(x + 7, y + 2, 2, 1.5);
    }
    if (hq.health >= hq.maxHealth) return;
    const width = 16;
    const ratio = hq.health / hq.maxHealth;
    const top = y + 2 * TILE_SIZE + 1;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x - AP, top - AP, width + 2 * AP, 1 + 2 * AP);
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(x, top, width, 1);
    ctx.fillStyle = ratio > 0.5 ? PALETTE.cyan : ratio > 0.25 ? PALETTE.gold : PALETTE.red;
    ctx.fillRect(x, top, Math.max(AP, snap(width * ratio)), 1);
  }

  /** Marching dots from a crew on foot to whatever it needs next: the wrench, then the tank. */
  private drawGuide(battle: Battle, time: number): void {
    const crew = battle.playerOnFoot;
    const tank = battle.playerTank;
    if (!crew || !tank) return;
    let target: { x: number; y: number } | null = null;
    if (tank.disabled && !crew.carryingWrench) {
      let best = Infinity;
      for (const wrench of battle.repairs.wrenches) {
        const d = Math.hypot(wrench.x - crew.x, wrench.y - crew.y);
        if (d < best) {
          best = d;
          target = { x: wrench.x + wrench.w / 2, y: wrench.y + wrench.h / 2 };
        }
      }
    } else {
      target = tank.center;
    }
    if (!target) return;
    const from = crew.center;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 14) return;
    const ctx = this.ctx;
    const offset = (time * 16) % 6;
    for (let t = 6 + offset; t < length - 6; t += 6) {
      const fade = Math.min(1, (length - 6 - t) / 18, (t - 4) / 10);
      ctx.globalAlpha = 0.6 * Math.max(0, fade);
      ctx.fillStyle = PALETTE.goldLight;
      ctx.fillRect(snap(from.x + (dx * t) / length) - AP, snap(from.y + (dy * t) / length) - AP, AP * 2, AP * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** The edges of the field pulse red while the player's tank or crew is about to be lost. */
  private drawDanger(battle: Battle, map: TileMap, time: number): void {
    if (battle.outcome) return;
    const crew = battle.playerOnFoot;
    const tank = battle.playerTank;
    const critical = crew ? crew.health.current <= 1 : !!tank?.manned && tank.health.ratio <= 0.25;
    if (!critical) return;
    const ctx = this.ctx;
    const pulse = 0.6 + Math.sin(time * 7) * 0.4;
    const bands = [0.3, 0.18, 0.1, 0.05];
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = `rgba(216, 58, 46, ${(bands[i] * pulse).toFixed(3)})`;
      const w = 3;
      ctx.fillRect(i * w, i * w, map.width - 2 * i * w, w);
      ctx.fillRect(i * w, map.height - (i + 1) * w, map.width - 2 * i * w, w);
      ctx.fillRect(i * w, (i + 1) * w, w, map.height - 2 * (i + 1) * w);
      ctx.fillRect(map.width - (i + 1) * w, (i + 1) * w, w, map.height - 2 * (i + 1) * w);
    }
  }

  /** Everything outside a growing circle around the player's tank is drawn black. */
  private drawIris(battle: Battle, map: TileMap, progress: number): void {
    const ctx = this.ctx;
    const c = battle.playerTank?.center ?? { x: map.width / 2, y: map.height / 2 };
    const reach = Math.max(Math.hypot(c.x, c.y), Math.hypot(map.width - c.x, c.y), Math.hypot(c.x, map.height - c.y), Math.hypot(map.width - c.x, map.height - c.y));
    const r = reach * progress * progress;
    ctx.fillStyle = PALETTE.void;
    for (let y = 0; y < map.height; y++) {
      const dy = y + 0.5 - c.y;
      const half = r > Math.abs(dy) ? Math.sqrt(r * r - dy * dy) : 0;
      const left = Math.max(0, Math.round(c.x - half));
      const right = Math.min(map.width, Math.round(c.x + half));
      if (half <= 0) {
        ctx.fillRect(0, y, map.width, 1);
        continue;
      }
      if (left > 0) ctx.fillRect(0, y, left, 1);
      if (right < map.width) ctx.fillRect(right, y, map.width - right, 1);
    }
    ctx.fillStyle = PALETTE.gold;
    if (r > 2) strokeRing(ctx, c.x, c.y, r, PALETTE.gold, 1);
  }

  private isUnderBush(map: TileMap, unit: Rect): boolean {
    const range = map.rangeForRect(unit);
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) if (map.conceals(col, row)) return true;
    }
    return false;
  }

  /** A bevelled steel frame around the battlefield, like the HUD's. */
  private drawFieldFrame(width: number, height: number): void {
    this.rect(FIELD_X - 3, FIELD_Y - 3, width + 6, height + 6, PALETTE.ink);
    this.rect(FIELD_X - 2, FIELD_Y - 2, width + 4, height + 4, FRAME.dark);
    this.rect(FIELD_X - 2, FIELD_Y - 2, width + 4, 1, FRAME.mid);
    this.rect(FIELD_X - 2, FIELD_Y - 2, 1, height + 4, FRAME.mid);
    this.rect(FIELD_X - 1, FIELD_Y - 1, width + 2, height + 2, PALETTE.ink);
  }

  /** A twinkling star that warns where an enemy is about to appear. */
  private drawPortal(portal: SpawnPortal): void {
    const ctx = this.ctx;
    const age = SPAWN_CONFIG.portalDuration - portal.remaining;
    const arm = [1, 3, 5, 7, 5, 3][Math.floor(age * 14) % 6];
    const cx = portal.x + 8;
    const cy = portal.y + 8;
    ctx.globalCompositeOperation = 'lighter';
    bandedGlow(ctx, cx, cy, 10, '88, 224, 240', 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillRect(cx - arm, cy - AP, arm * 2, AP * 2);
    ctx.fillRect(cx - AP, cy - arm, AP * 2, arm * 2);
    ctx.fillStyle = PALETTE.white;
    const diag = Math.floor(arm / 2);
    for (let i = 1; i <= diag; i++) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(cx + sx * i - AP / 2, cy + sy * i - AP / 2, AP, AP);
    }
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }
}
