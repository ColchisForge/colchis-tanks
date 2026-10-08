import type { Decal } from '../effects/Effects';
import { RENDER_SCALE } from '../game/GameConfig';
import type { BaseState, TileMap } from '../world/TileMap';
import { hash, shade } from './art/PixelArt';
import { paintBushes, paintGround, paintWater, WallLayer } from './art/terrain';
import { context2d, createCanvas } from './canvas';
import { AP, drawArt } from './draw';
import type { LandStyle } from './lands';
import type { SpriteCache } from './SpriteCache';

const WATER_FRAME_TIME = 0.28;
/** How often fading tracks are worn down, in seconds. */
const TRACK_FADE_STEP = 1;

/** Cracks across the bunker roof (art pixels), one polyline per hit taken. */
const BASE_CRACKS: readonly (readonly (readonly [number, number])[])[] = [
  [[5, 13], [8, 15], [7, 18], [10, 21]],
  [[26, 11], [23, 14], [25, 17], [22, 20]],
  [[15, 3], [17, 6], [14, 8], [16, 10]],
];

interface Layers {
  readonly map: TileMap;
  readonly land: LandStyle;
  readonly ground: HTMLCanvasElement;
  readonly groundCtx: CanvasRenderingContext2D;
  readonly tracks: HTMLCanvasElement;
  readonly tracksCtx: CanvasRenderingContext2D;
  readonly water: readonly HTMLCanvasElement[];
  readonly walls: WallLayer;
  readonly bushes: HTMLCanvasElement;
}

/**
 * Terrain as cached layers at art resolution: ground (with scorch marks and rubble painted in
 * for good), fading tread tracks, animated water, the raised wall layer with its shadows, and the
 * bush canopy drawn above units. Only the tiles around a hit wall are ever repainted.
 */
export class MapRenderer {
  private layers: Layers | null = null;
  private trackClock = 0;
  private lastTime = 0;

  constructor(private readonly sprites: SpriteCache) {}

  drawTerrain(ctx: CanvasRenderingContext2D, map: TileMap, land: LandStyle, time: number, decals: readonly Decal[]): void {
    const layers = this.prepare(map, land);
    for (const change of map.takeChanges()) layers.walls.repaintAround(change.col, change.row);
    for (const decal of decals) this.paintDecal(layers, decal);
    this.fadeTracks(layers, time);

    ctx.drawImage(layers.ground, 0, 0, map.width, map.height);
    ctx.globalAlpha = land.trackAlpha;
    ctx.drawImage(layers.tracks, 0, 0, map.width, map.height);
    ctx.globalAlpha = 1;
    const frame = Math.floor(time / WATER_FRAME_TIME) % layers.water.length;
    ctx.drawImage(layers.water[frame], 0, 0, map.width, map.height);
    ctx.drawImage(layers.walls.canvas, 0, 0, map.width, map.height);
    if (map.base) this.drawBase(ctx, map, map.base, this.sprites.base(map.base.destroyed), land);
    if (map.enemyBase) this.drawBase(ctx, map, map.enemyBase, this.sprites.enemyBase(map.enemyBase.destroyed), land);
  }

  /** Bushes are drawn above units so tanks and crews can slip underneath them. */
  drawOverlay(ctx: CanvasRenderingContext2D, map: TileMap): void {
    if (this.layers?.map === map) ctx.drawImage(this.layers.bushes, 0, 0, map.width, map.height);
  }

  /** A base with a crack added for each third of its strength lost. */
  private drawBase(ctx: CanvasRenderingContext2D, map: TileMap, base: BaseState, sprite: HTMLCanvasElement, land: LandStyle): void {
    const x = base.col * map.tileSize;
    const y = base.row * map.tileSize;
    ctx.globalAlpha = land.shadow.alpha;
    drawArt(ctx, this.sprites.silhouette(sprite, land.shadow.color), x + 1.5, y + 2);
    ctx.globalAlpha = 1;
    drawArt(ctx, sprite, x, y);
    if (base.destroyed) return;
    ctx.fillStyle = '#14140c';
    const cracks = Math.ceil(((base.maxHealth - base.health) / base.maxHealth) * BASE_CRACKS.length);
    for (const crack of BASE_CRACKS.slice(0, cracks)) {
      for (let i = 1; i < crack.length; i++) {
        const [x0, y0] = crack[i - 1];
        const [x1, y1] = crack[i];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let s = 0; s <= steps; s++) {
          const px = Math.round(x0 + ((x1 - x0) * s) / steps);
          const py = Math.round(y0 + ((y1 - y0) * s) / steps);
          ctx.fillRect(x + px * AP, y + py * AP, AP, AP);
        }
      }
    }
  }

  private prepare(map: TileMap, land: LandStyle): Layers {
    if (this.layers?.map === map && this.layers.land === land) return this.layers;
    map.takeChanges();
    const ground = paintGround(map, land);
    const tracks = createCanvas(ground.width, ground.height);
    this.layers = {
      map,
      land,
      ground,
      groundCtx: this.artContext(ground),
      tracks,
      tracksCtx: this.artContext(tracks),
      water: paintWater(map, land),
      walls: new WallLayer(map, land),
      bushes: paintBushes(map, land),
    };
    this.trackClock = 0;
    return this.layers;
  }

  /** A context on an art-resolution canvas that takes game-pixel coordinates. */
  private artContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = context2d(canvas);
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    return ctx;
  }

  /** Wears tracks down a step at a time; snow keeps them for good. */
  private fadeTracks(layers: Layers, time: number): void {
    const elapsed = time - this.lastTime;
    this.lastTime = time;
    if (layers.land.trackLife <= 0 || elapsed <= 0 || elapsed > 1) return;
    this.trackClock += elapsed;
    if (this.trackClock < TRACK_FADE_STEP) return;
    this.trackClock -= TRACK_FADE_STEP;
    const ctx = layers.tracksCtx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1 - Math.exp((-3 * TRACK_FADE_STEP) / layers.land.trackLife);
    ctx.fillRect(0, 0, layers.map.width, layers.map.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private paintDecal(layers: Layers, decal: Decal): void {
    const land = layers.land;
    switch (decal.kind) {
      case 'scorch':
        this.paintScorch(layers.groundCtx, decal.x, decal.y, decal.radius, land);
        return;
      case 'rubble': {
        const ctx = layers.groundCtx;
        const size = Math.min(2, Math.max(1, Math.round(decal.size * RENDER_SCALE))) * AP;
        ctx.fillStyle = shade(decal.color, -0.35);
        ctx.fillRect(Math.round(decal.x * 2) / 2 + AP, Math.round(decal.y * 2) / 2 + AP, size, size);
        ctx.fillStyle = decal.color;
        ctx.fillRect(Math.round(decal.x * 2) / 2, Math.round(decal.y * 2) / 2, size, size);
        return;
      }
      case 'casing': {
        const ctx = layers.groundCtx;
        ctx.fillStyle = '#a8701c';
        ctx.fillRect(Math.round(decal.x * 2) / 2, Math.round(decal.y * 2) / 2, AP, AP);
        return;
      }
      case 'track': {
        const ctx = layers.tracksCtx;
        ctx.fillStyle = shade(land.ground.dark, -0.55);
        ctx.fillRect(decal.x, decal.y, decal.w, decal.h);
        return;
      }
      case 'footprint': {
        const ctx = layers.tracksCtx;
        ctx.fillStyle = shade(land.ground.dark, -0.4);
        ctx.fillRect(Math.round(decal.x * 2) / 2, Math.round(decal.y * 2) / 2, AP * 2, AP);
        return;
      }
    }
  }

  /** Blast marks: a burnt core with a ragged ring of blackened ground. */
  private paintScorch(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, land: LandStyle): void {
    const r = Math.ceil(radius * RENDER_SCALE);
    const cx = Math.round(x * RENDER_SCALE);
    const cy = Math.round(y * RENDER_SCALE);
    const seed = Math.floor(Math.random() * 1000);
    const core = land.ground.style === 'snow' ? '#4a4038' : '#1a140e';
    const rim = shade(land.ground.dark, -0.35);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const n = hash(dx + cx, dy + cy, seed);
        if (n > 1.15 - d) continue;
        ctx.globalAlpha = d < 0.45 ? 0.75 : 0.45;
        ctx.fillStyle = d < 0.45 ? core : rim;
        ctx.fillRect((cx + dx) * AP, (cy + dy) * AP, AP, AP);
      }
    }
    ctx.globalAlpha = 1;
  }
}
