import { RENDER_SCALE, TILE_SIZE } from '../../game/GameConfig';
import { Surface } from '../../world/Surface';
import { Tile, type TileType } from '../../world/Tile';
import { TileMap } from '../../world/TileMap';
import { context2d, createCanvas } from '../canvas';
import type { LandStyle } from '../lands';
import { hash, mix, PixelArt, shade } from './PixelArt';

/** Art pixels per map tile. */
export const TILE_PX = TILE_SIZE * RENDER_SCALE;
const S = TILE_PX;
/** Rows at the bottom of an exposed wall drawn as its front face, so walls read as raised blocks. */
const FACE = 5;
const SHADOW_DX = 4;
const SHADOW_DY = 5;

function isSolid(map: TileMap, col: number, row: number): boolean {
  if (!map.inBounds(col, row)) return false;
  const type = map.get(col, row);
  return type === Tile.Brick || type === Tile.Steel;
}

function isWater(map: TileMap, col: number, row: number): boolean {
  return map.inBounds(col, row) && map.get(col, row) === Tile.Water;
}

function isRoad(map: TileMap, col: number, row: number): boolean {
  return map.inBounds(col, row) && map.surfaceAt(col, row) === Surface.Road;
}

/** Art-pixel offsets across a 32px road block where tank tracks wear ruts. */
function inRut(across: number): boolean {
  const k = ((across % 32) + 32) % 32;
  return (k >= 5 && k <= 8) || (k >= 23 && k <= 26);
}

/**
 * Dirt roads: churned mud and gravel with ruts worn along the way the road runs, and a ragged
 * edge where the road meets the land's own ground (slush and snow clumps in the mountains).
 */
function paintRoads(art: PixelArt, map: TileMap, land: LandStyle): void {
  const r = land.road;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (!isRoad(map, col, row)) continue;
      const n = isRoad(map, col, row - 1);
      const s = isRoad(map, col, row + 1);
      const w = isRoad(map, col - 1, row);
      const e = isRoad(map, col + 1, row);
      // Roads are two tiles wide, so a tile always has its twin beside it: a road runs the way it
      // continues on both sides. Corners and junctions get ruts both ways.
      let runsAlong = n && s;
      let runsAcross = w && e;
      if (!runsAlong && !runsAcross) {
        runsAlong = n || s;
        runsAcross = w || e;
      }
      for (let ly = 0; ly < S; ly++) {
        for (let lx = 0; lx < S; lx++) {
          const gx = col * S + lx;
          const gy = row * S + ly;
          let edge = 99;
          if (!n) edge = Math.min(edge, ly);
          if (!s) edge = Math.min(edge, S - 1 - ly);
          if (!w) edge = Math.min(edge, lx);
          if (!e) edge = Math.min(edge, S - 1 - lx);
          const wobble = hash(gx >> 1, gy >> 1, 71) * 2.5;
          if (edge + 0.5 < wobble) continue;
          const noise = hash(gx, gy, 73);
          let c = noise < 0.08 ? r.light : noise < 0.17 ? r.dark : r.base;
          // Gravel and stones.
          if (hash(gx >> 1, gy >> 1, 79) < 0.035) c = noise < 0.5 ? r.light : shade(r.light, 0.2);
          // Ruts, darker where they are deepest.
          const rut = (runsAlong && inRut(gx)) || (runsAcross && inRut(gy));
          if (rut) c = hash(gx >> 1, gy >> 2, 83) < 0.3 ? r.dark : r.rut;
          // Puddles in the ruts.
          if (rut && hash(gx >> 3, gy >> 3, 89) < 0.035) c = mix(r.rut, noise < 0.25 ? land.water.light : land.water.deep, 0.45);
          if (edge < 1.5 + wobble) c = mix(c, r.edge, 0.55);
          if (edge < 1 + wobble && land.ground.style === 'snow' && hash(gx, gy, 97) < 0.35) c = '#ffffff';
          art.set(gx, gy, c);
        }
      }
    }
  }
}

export function paintGround(map: TileMap, land: LandStyle): HTMLCanvasElement {
  const W = map.cols * S;
  const H = map.rows * S;
  const art = new PixelArt(W, H);
  const g = land.ground;
  const stoneTones = [g.base, mix(g.base, g.light, 0.35), mix(g.base, g.dark, 0.3), g.alt];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? g.alt : g.base;
      const n = hash(x, y, 1);
      switch (g.style) {
        case 'grass':
          if (n < 0.035) c = g.light;
          else if (n < 0.07) c = g.dark;
          break;
        case 'sand': {
          const v = Math.sin(x * 0.21 + Math.sin(y * 0.05) * 3 + y * 0.35);
          if (v > 0.93) c = g.light;
          else if (v < -0.97) c = g.dark;
          else if (n < 0.025) c = g.light;
          break;
        }
        case 'moss':
          if (hash(x >> 3, y >> 3, 2) < 0.2) c = g.dark;
          if (n < 0.04) c = g.light;
          else if (n < 0.06) c = g.dark;
          break;
        case 'snow': {
          const v = Math.sin(x * 0.045 + y * 0.02) + Math.sin(y * 0.08 - x * 0.03);
          c = v > 1.3 ? g.light : v < -1.45 ? mix(g.base, g.dark, 0.6) : g.base;
          if (n < 0.004) c = '#ffffff';
          break;
        }
        case 'paving': {
          const row = Math.floor(y / 16);
          const offset = (row % 2) * 16;
          const stone = Math.floor((x + offset) / 32);
          if (y % 16 === 0 || (x + offset) % 32 === 0) c = g.detail;
          else {
            c = stoneTones[Math.floor(hash(stone, row, 3) * stoneTones.length)];
            if (n < 0.03) c = g.dark;
          }
          break;
        }
      }
      art.set(x, y, c);
    }
  }

  // Scattered details on an 8px grid: tufts, pebbles, shells, litter, rocks.
  for (let cy = 0; cy < H / 8; cy++) {
    for (let cx = 0; cx < W / 8; cx++) {
      const roll = hash(cx, cy, 5);
      const x = cx * 8 + Math.floor(hash(cx, cy, 6) * 5);
      const y = cy * 8 + Math.floor(hash(cx, cy, 7) * 5);
      if (g.style === 'grass' && roll < 0.13) {
        art.set(x, y + 1, g.detail);
        art.set(x + 1, y, shade(g.detail, 0.25));
        art.set(x + 2, y + 1, g.detail);
        art.set(x + 1, y + 1, g.detail);
      } else if ((g.style === 'grass' || g.style === 'snow') && roll < 0.16) {
        art.rect(x, y, 2, 2, g.detail2);
        art.set(x + 1, y + 1, shade(g.detail2, -0.3));
        if (g.style === 'snow') art.rect(x, y, 2, 1, '#ffffff');
      } else if (g.style === 'sand' && roll < 0.05) {
        art.set(x, y, g.detail2);
        art.set(x + 1, y, '#f0c8b8');
      } else if (g.style === 'sand' && roll < 0.08) {
        art.set(x, y + 1, g.detail);
        art.set(x + 1, y, g.detail);
        art.set(x + 2, y + 1, g.detail);
      } else if (g.style === 'moss' && roll < 0.14) {
        art.rect(x, y, 2, 1, g.detail);
        art.set(x + 1, y + 1, shade(g.detail, 0.2));
      } else if (g.style === 'moss' && roll < 0.18) {
        art.set(x, y, g.detail2);
      }
    }
  }

  paintRoads(art, map, land);

  // Bushes cast soft shadows onto the ground beneath them.
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.get(col, row) !== Tile.Bush) continue;
      art.disc(col * S + 8 + 2, row * S + 8 + 3, 7, land.shadow.color, land.shadow.alpha * 200);
    }
  }
  return art.toCanvas();
}

/**
 * The wall layer: drop shadows, then brick or steel tops with front faces wherever a wall's
 * bottom edge is exposed. Kept as a pixel buffer so a hit only repaints the tiles around it.
 */
export class WallLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly art: PixelArt;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tones: string[];

  constructor(
    private readonly map: TileMap,
    private readonly land: LandStyle,
  ) {
    this.art = new PixelArt(map.cols * S, map.rows * S);
    this.canvas = createCanvas(this.art.width, this.art.height);
    this.ctx = context2d(this.canvas);
    const w = land.wall;
    this.tones = [w.top, mix(w.top, w.dark, 0.18), mix(w.top, w.light, 0.12)];
    this.repaint(0, 0, map.cols - 1, map.rows - 1);
  }

  /** Repaints the tiles around a changed one: its neighbours' faces and shadows depend on it. */
  repaintAround(col: number, row: number): void {
    this.repaint(col - 1, row - 1, col + 1, row + 1);
  }

  private repaint(c0: number, r0: number, c1: number, r1: number): void {
    c0 = Math.max(0, c0);
    r0 = Math.max(0, r0);
    c1 = Math.min(this.map.cols - 1, c1);
    r1 = Math.min(this.map.rows - 1, r1);
    const x0 = c0 * S;
    const y0 = r0 * S;
    const x1 = (c1 + 1) * S;
    const y1 = (r1 + 1) * S;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.clear(x, y);

    const shadow = this.land.shadow;
    for (let row = r0 - 1; row <= r1; row++) {
      for (let col = c0 - 1; col <= c1; col++) {
        if (!isSolid(this.map, col, row)) continue;
        for (let py = 0; py < S; py++) {
          for (let px = 0; px < S; px++) {
            const x = col * S + px + SHADOW_DX;
            const y = row * S + py + SHADOW_DY;
            if (x < x0 || y < y0 || x >= x1 || y >= y1 || this.art.alpha(x, y) > 0) continue;
            this.art.set(x, y, shadow.color, shadow.alpha * 255);
          }
        }
      }
    }
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const type = this.map.get(col, row);
        if (type === Tile.Brick) this.paintWall(col, row);
        else if (type === Tile.Steel) this.paintSteel(col, row);
      }
    }
    const image = new ImageData(this.art.width, y1 - y0);
    for (let y = y0; y < y1; y++) {
      image.data.set(this.art.data.subarray((y * this.art.width) * 4, (y * this.art.width + this.art.width) * 4), (y - y0) * this.art.width * 4);
    }
    this.ctx.putImageData(image, 0, y0);
  }

  private clear(x: number, y: number): void {
    const i = (y * this.art.width + x) * 4;
    this.art.data[i + 3] = 0;
  }

  private paintWall(col: number, row: number): void {
    const w = this.land.wall;
    const above = isSolid(this.map, col, row - 1);
    const below = isSolid(this.map, col, row + 1);
    const left = isSolid(this.map, col - 1, row);
    const right = isSolid(this.map, col + 1, row);
    const damaged = this.map.healthAt(col, row) < 2;
    const faceStart = below ? S : S - FACE;

    for (let ly = 0; ly < S; ly++) {
      for (let lx = 0; lx < S; lx++) {
        const gx = col * S + lx;
        const gy = row * S + ly;
        if (damaged && hash(gx >> 1, gy >> 1, 23) < 0.2) continue;
        let c: string;
        if (ly >= faceStart) c = this.facePixel(gx, ly - faceStart);
        else c = this.topPixel(gx, gy, lx, ly, above, left, right);
        if (damaged && hash(gx, gy >> 1, 29) < 0.07) c = w.mortar;
        this.art.set(gx, gy, c);
      }
    }
  }

  private facePixel(gx: number, fy: number): string {
    const w = this.land.wall;
    if (fy === 0) return w.faceDark;
    if (fy === FACE - 1) return shade(w.faceDark, -0.2);
    switch (w.style) {
      case 'logs':
        return (gx + fy) % 7 === 0 ? w.faceDark : w.face;
      case 'rock':
        return hash(gx >> 1, fy, 31) < 0.25 ? w.faceDark : fy === FACE - 2 && gx % 5 === 0 ? '#cfe6f6' : w.face;
      default: {
        const offset = fy > 2 ? 4 : 0;
        return (gx + offset) % 8 === 7 || fy === 2 ? w.faceDark : w.face;
      }
    }
  }

  private topPixel(gx: number, gy: number, lx: number, ly: number, above: boolean, left: boolean, right: boolean): string {
    const w = this.land.wall;
    let c: string;
    switch (w.style) {
      case 'brick':
      case 'gilded':
      case 'stone': {
        const height = w.style === 'brick' ? 4 : w.style === 'stone' ? 6 : 8;
        const length = w.style === 'brick' ? 8 : w.style === 'stone' ? 10 : 16;
        const row = Math.floor(gy / height);
        const offset = (row % 2) * (length / 2);
        const inRow = gy % height;
        const inBlock = (gx + offset) % length;
        if (inRow === height - 1 || inBlock === length - 1) {
          c = w.mortar;
        } else {
          c = this.tones[Math.floor(hash(Math.floor((gx + offset) / length), row, 7) * this.tones.length)];
          if (inRow === 0) c = mix(c, w.light, 0.55);
          else if (inRow === height - 2) c = mix(c, w.dark, 0.35);
          if (inBlock === 0) c = mix(c, w.light, 0.25);
          if (w.style === 'gilded' && inRow === height / 2 && inBlock === length / 2) c = w.accent;
        }
        if (!above && ly <= 1 && (w.style === 'gilded' || w.style === 'stone')) c = ly === 0 ? shade(w.accent, 0.35) : w.accent;
        break;
      }
      case 'logs': {
        const inRow = gy % 8;
        c = [w.light, mix(w.top, w.light, 0.35), mix(w.top, w.light, 0.2), w.top, w.top, w.top, w.dark, w.mortar][inRow];
        if (inRow > 0 && inRow < 6 && hash(gx >> 1, gy, 9) < 0.14) c = w.dark;
        if (inRow < 4 && hash(gx >> 1, gy >> 1, 11) < 0.22) c = hash(gx, gy, 12) < 0.5 ? w.accent : shade(w.accent, 0.25);
        const end = (!left && lx <= 1) || (!right && lx >= S - 2);
        if (end && inRow < 7) c = inRow === 3 ? '#8a6238' : '#c89a62';
        break;
      }
      case 'rock': {
        const v = hash(gx >> 2, gy >> 2, 13);
        c = v < 0.33 ? w.top : v < 0.66 ? mix(w.top, w.dark, 0.2) : mix(w.top, w.light, 0.2);
        if (lx + ly < 7) c = mix(c, w.light, 0.3);
        if (hash(gx, gy >> 1, 17) < 0.05) c = w.mortar;
        const cap = 3 + Math.floor(hash(gx >> 1, gy >> 4, 19) * 2);
        if (!above && ly < cap) c = ly === cap - 1 ? '#c8dcec' : '#ffffff';
        break;
      }
    }
    if (!above && ly === 0 && w.style !== 'rock') c = mix(c, '#ffffff', 0.25);
    return c;
  }

  private paintSteel(col: number, row: number): void {
    const s = this.land.steel;
    const below = isSolid(this.map, col, row + 1);
    const above = isSolid(this.map, col, row - 1);
    const faceStart = below ? S : S - 4;
    for (let ly = 0; ly < S; ly++) {
      for (let lx = 0; lx < S; lx++) {
        let c: string;
        if (ly >= faceStart) {
          c = ly === faceStart ? s.darker : (lx % 4 === 3 ? s.darker : s.dark);
        } else if (lx === 0 || ly === 0) {
          c = s.light;
        } else if (lx === S - 1 || ly === faceStart - 1) {
          c = s.darker;
        } else {
          c = s.base;
          const d = lx - ly;
          if (d >= 3 && d <= 5) c = mix(s.base, s.light, 0.45);
          const rivet = (lx === 3 || lx === S - 4) && (ly === 3 || ly === faceStart - 4);
          if (rivet) c = s.darker;
          if ((lx === 2 || lx === S - 5) && (ly === 2 || ly === faceStart - 5)) c = s.light;
        }
        if (!above && ly === 0 && this.land.ambient === 'snowfall') c = '#ffffff';
        this.art.set(col * S + lx, row * S + ly, c);
      }
    }
  }
}

/** Water layer, one canvas per animation frame. Shores get rounded corners, an edge line and foam. */
export function paintWater(map: TileMap, land: LandStyle, frames = 4): HTMLCanvasElement[] {
  const result: HTMLCanvasElement[] = [];
  const v = land.water;
  const R = 6;
  for (let f = 0; f < frames; f++) {
    const art = new PixelArt(map.cols * S, map.rows * S);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (!isWater(map, col, row)) continue;
        const n = isWater(map, col, row - 1);
        const s = isWater(map, col, row + 1);
        const w = isWater(map, col - 1, row);
        const e = isWater(map, col + 1, row);
        for (let ly = 0; ly < S; ly++) {
          for (let lx = 0; lx < S; lx++) {
            let d = 99;
            const corners: [boolean, number, number][] = [
              [!n && !w, R, R],
              [!n && !e, S - R, R],
              [!s && !w, R, S - R],
              [!s && !e, S - R, S - R],
            ];
            let outside = false;
            for (const [round, cx, cy] of corners) {
              if (!round) continue;
              const inCorner = (cx === R ? lx < R : lx >= S - R) && (cy === R ? ly < R : ly >= S - R);
              if (!inCorner) continue;
              const dist = Math.hypot(lx + 0.5 - cx, ly + 0.5 - cy);
              if (dist > R) outside = true;
              d = Math.min(d, R - dist);
            }
            if (outside) continue;
            if (!n) d = Math.min(d, ly);
            if (!s) d = Math.min(d, S - 1 - ly);
            if (!w) d = Math.min(d, lx);
            if (!e) d = Math.min(d, S - 1 - lx);
            const gx = col * S + lx;
            const gy = row * S + ly;
            art.set(gx, gy, waterPixel(v, d, gx, gy, f));
          }
        }
      }
    }
    result.push(art.toCanvas());
  }
  return result;
}

function waterPixel(v: LandStyle['water'], d: number, gx: number, gy: number, f: number): string {
  if (d < 1) return v.edge;
  if (v.style === 'moat' && d < 2) return v.edge;
  if (v.style === 'ice') {
    if (d < 3) return v.foam;
    if (hash(gx >> 2, gy, 43) < 0.03 || hash(gx, gy >> 2, 47) < 0.03) return v.light;
    return d > 8 ? v.deep : v.base;
  }
  const foamBand = v.style === 'surf' ? 2 + 1.5 * (1 + Math.sin((f * Math.PI) / 2 + (gx + gy) * 0.25)) : 2;
  if (d < foamBand) return v.foam;
  if (d < foamBand + 2) return v.light;
  const wave = (gy + f * 2) % 7 === 0 && (gx + Math.floor(gy / 7) * 5 + f * 3) % 12 < 4;
  if (wave) return v.style === 'surf' ? v.foam : v.light;
  return d > 9 || hash(gx >> 3, gy >> 3, 53) < 0.3 ? v.deep : v.base;
}

/** Bushes, drawn above units. One rounded plant per tile; neighbours merge into clusters. */
export function paintBushes(map: TileMap, land: LandStyle): HTMLCanvasElement {
  const art = new PixelArt(map.cols * S, map.rows * S);
  const b = land.bush;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.get(col, row) !== Tile.Bush) continue;
      const cx = col * S + 8 + (hash(col, row, 31) - 0.5) * 2;
      const cy = row * S + 8 + (hash(col, row, 37) - 0.5) * 2;
      paintPlant(art, b, cx, cy, col, row);
    }
  }
  art.outline(b.darkest);
  return art.toCanvas();
}

function paintPlant(art: PixelArt, b: LandStyle['bush'], cx: number, cy: number, col: number, row: number): void {
  const shadeAt = (x: number, y: number, r: number) => (x - cx + (y - cy)) / r;
  switch (b.style) {
    case 'shrub':
    case 'pine':
    case 'fern': {
      const blobs: [number, number, number][] =
        b.style === 'fern'
          ? [[cx - 3, cy - 2, 5], [cx + 3, cy - 1, 4.5], [cx - 1, cy + 3, 5], [cx + 3, cy + 4, 4]]
          : [[cx, cy, 8]];
      for (const [bx, by, r] of blobs) {
        for (let y = Math.floor(by - r); y <= by + r; y++) {
          for (let x = Math.floor(bx - r); x <= bx + r; x++) {
            const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
            if (d > r) continue;
            const n = hash(x >> 1, y >> 1, 41);
            if (b.style === 'pine' && d > r - 1.5 && Math.sin(Math.atan2(y - by, x - bx) * 9) > 0.2) continue;
            if (b.style !== 'pine' && d > r - 1 && hash(x, y, 43) < 0.5) continue;
            const s = shadeAt(x, y, r);
            let c = s < -0.5 ? b.light : s > 0.45 ? b.dark : b.base;
            if (n < 0.12 && s < 0.2) c = b.style === 'pine' ? b.accent : shade(b.light, 0.25);
            else if (n > 0.9) c = b.dark;
            art.set(x, y, c);
          }
        }
      }
      return;
    }
    case 'palm': {
      const spin = hash(col, row, 59) * Math.PI;
      for (let k = 0; k < 7; k++) {
        const a = spin + (k * Math.PI * 2) / 7;
        for (let t = 1; t <= 8; t += 0.5) {
          const width = t < 5 ? 2 : 1;
          const x = cx + Math.cos(a) * t;
          const y = cy + Math.sin(a) * t * 0.9 + (t > 5 ? (t - 5) * 0.4 : 0);
          for (let w = -width / 2; w <= width / 2; w += 1) {
            const px = x - Math.sin(a) * w;
            const py = y + Math.cos(a) * w;
            art.set(px, py, w < 0 ? b.light : b.base);
          }
          art.set(x, y, b.dark);
        }
      }
      art.disc(cx, cy, 2, b.accent);
      art.set(cx - 1, cy - 1, shade(b.accent, 0.3));
      return;
    }
    case 'hedge': {
      for (let y = Math.floor(cy - 7.5); y < cy + 7.5; y++) {
        for (let x = Math.floor(cx - 7.5); x < cx + 7.5; x++) {
          const corner = Math.abs(x + 0.5 - cx) > 6 && Math.abs(y + 0.5 - cy) > 6;
          if (corner) continue;
          const top = y - (cy - 7.5);
          let c = top < 3 ? b.light : top > 11 ? b.dark : b.base;
          const n = hash(x, y, 61);
          if (n < 0.05) c = b.accent;
          else if (n > 0.92) c = b.dark;
          art.set(x, y, c);
        }
      }
      return;
    }
  }
}

/** A 2x2-tile sample of one terrain type in a land's style, for the how-to-play legend. */
export function paintSwatch(type: TileType, land: LandStyle): HTMLCanvasElement {
  const map = new TileMap(4, 4, new Array<TileType>(16).fill(Tile.Empty));
  for (let r = 1; r <= 2; r++) for (let c = 1; c <= 2; c++) map.set(c, r, type);
  const canvas = createCanvas(4 * S, 4 * S);
  const ctx = context2d(canvas);
  ctx.drawImage(paintGround(map, land), 0, 0);
  ctx.drawImage(paintWater(map, land, 1)[0], 0, 0);
  ctx.drawImage(new WallLayer(map, land).canvas, 0, 0);
  ctx.drawImage(paintBushes(map, land), 0, 0);
  const swatch = createCanvas(2 * S + 8, 2 * S + 8);
  context2d(swatch).drawImage(canvas, S - 2, S - 2, 2 * S + 8, 2 * S + 8, 0, 0, 2 * S + 8, 2 * S + 8);
  return swatch;
}
