import { createCanvas } from '../canvas';

type RGB = readonly [number, number, number];

const parsed = new Map<string, RGB>();

function rgb(color: string): RGB {
  let value = parsed.get(color);
  if (!value) {
    const n = Number.parseInt(color.slice(1), 16);
    value = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    parsed.set(color, value);
  }
  return value;
}

/** Lightens (amount > 0) or darkens (amount < 0) a '#rrggbb' colour. */
export function shade(color: string, amount: number): string {
  const [r, g, b] = rgb(color);
  const f = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes two '#rrggbb' colours; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${f(r1, r2)}${f(g1, g2)}${f(b1, b2)}`;
}

/** Cheap deterministic hash of grid coordinates into 0..1, for stable per-tile variation. */
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A small RGBA pixel buffer for painting sprites procedurally, flushed to a canvas once.
 * Painting at the pixel level keeps every edge crisp, like hand-placed pixel art.
 */
export class PixelArt {
  readonly data: Uint8ClampedArray<ArrayBuffer>;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x: number, y: number, color: string, alpha = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const [r, g, b] = rgb(color);
    const i = (y * this.width + x) * 4;
    if (alpha >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    const a = alpha / 255;
    const under = this.data[i + 3] / 255;
    const out = a + under * (1 - a);
    if (out <= 0) return;
    this.data[i] = (r * a + this.data[i] * under * (1 - a)) / out;
    this.data[i + 1] = (g * a + this.data[i + 1] * under * (1 - a)) / out;
    this.data[i + 2] = (b * a + this.data[i + 2] * under * (1 - a)) / out;
    this.data[i + 3] = out * 255;
  }

  alpha(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.width + x) * 4 + 3];
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color, alpha);
  }

  /** Filled disc centred on a pixel-grid point; radius in pixels. */
  disc(cx: number, cy: number, r: number, color: string, alpha = 255): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, color, alpha);
      }
    }
  }

  /** Fills a polygon (pixel centres inside it). */
  polygon(points: readonly (readonly [number, number])[], color: string, alpha = 255): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (insidePolygon(x + 0.5, y + 0.5, points)) this.set(x, y, color, alpha);
      }
    }
  }

  /** Runs a callback for every opaque pixel, e.g. to shade by position. */
  eachOpaque(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.alpha(x, y) > 0) fn(x, y);
  }

  /** Draws a one-pixel outline around everything painted so far. */
  outline(color: string): void {
    const edge: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alpha(x, y) > 0) continue;
        if (this.alpha(x - 1, y) > 128 || this.alpha(x + 1, y) > 128 || this.alpha(x, y - 1) > 128 || this.alpha(x, y + 1) > 128) {
          edge.push([x, y]);
        }
      }
    }
    for (const [x, y] of edge) this.set(x, y, color);
  }

  /** Recolours every opaque pixel, keeping its alpha: used for hit flashes and silhouettes. */
  tint(color: string, strength: number): void {
    this.eachOpaque((x, y) => {
      const i = (y * this.width + x) * 4;
      const [r, g, b] = rgb(color);
      this.data[i] += (r - this.data[i]) * strength;
      this.data[i + 1] += (g - this.data[i + 1]) * strength;
      this.data[i + 2] += (b - this.data[i + 2]) * strength;
    });
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    ctx?.putImageData(new ImageData(this.data, this.width, this.height), 0, 0);
    return canvas;
  }
}

function insidePolygon(x: number, y: number, points: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
