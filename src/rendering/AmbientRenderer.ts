import type { Vec } from '../core/geometry';
import { Tile } from '../world/Tile';
import type { TileMap } from '../world/TileMap';
import { AP, snap } from './draw';
import type { LandStyle } from './lands';
import type { Glow } from './LightingRenderer';

interface Mote {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
  size: number;
  age: number;
  life: number;
}

const COUNTS = { none: 0, spray: 18, fireflies: 14, snowfall: 80, motes: 26 } as const;

/** Atmosphere that belongs to each land: sea spray, fireflies, falling snow, drifting motes. */
export class AmbientRenderer {
  private motes: Mote[] = [];
  private map: TileMap | null = null;
  private land: LandStyle | null = null;
  private shore: Vec[] = [];
  private lastTime = 0;
  /** Fireflies glow in the dark; the lighting pass cuts small holes for them. */
  readonly glows: Glow[] = [];

  update(map: TileMap, land: LandStyle, time: number): void {
    if (this.map !== map || this.land !== land) this.reset(map, land);
    const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const W = map.width;
    const H = map.height;
    this.glows.length = 0;
    for (const m of this.motes) {
      m.age += dt;
      switch (land.ambient) {
        case 'snowfall':
          m.x += (land.wind.x + Math.sin(m.age * 1.3 + m.phase) * 6) * dt;
          m.y += m.vy * dt;
          if (m.y > H + 2) m.y -= H + 4;
          if (m.x > W + 2) m.x -= W + 4;
          if (m.x < -2) m.x += W + 4;
          break;
        case 'fireflies': {
          m.vx += Math.sin(m.age * 0.9 + m.phase) * 14 * dt;
          m.vy += Math.cos(m.age * 0.7 + m.phase * 2) * 14 * dt;
          m.vx *= Math.exp(-dt * 0.6);
          m.vy *= Math.exp(-dt * 0.6);
          m.x = (m.x + m.vx * dt + W) % W;
          m.y = (m.y + m.vy * dt + H) % H;
          const glow = this.fireflyGlow(m);
          if (glow > 0.3) this.glows.push({ x: m.x, y: m.y, radius: 4 + glow * 3 });
          break;
        }
        case 'motes':
          m.x = (m.x + (land.wind.x * 0.4 + Math.sin(m.age + m.phase) * 3) * dt + W) % W;
          m.y += (m.vy + land.wind.y * 0.3) * dt;
          if (m.y < -2) m.y += H + 4;
          break;
        case 'spray':
          m.vz -= 90 * dt;
          m.z += m.vz * dt;
          m.x += (m.vx + land.wind.x) * dt;
          m.y += m.vy * dt;
          if (m.z <= 0 || m.age > m.life) this.spawnSpray(m);
          break;
        case 'none':
          break;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, land: LandStyle, time: number): void {
    switch (land.ambient) {
      case 'snowfall':
        for (const m of this.motes) {
          ctx.fillStyle = m.size > 1 ? '#ffffff' : '#e8f0ff';
          ctx.globalAlpha = m.size > 1 ? 0.95 : 0.7;
          ctx.fillRect(snap(m.x), snap(m.y), AP * m.size, AP * m.size);
        }
        ctx.globalAlpha = 1;
        return;
      case 'fireflies':
        ctx.globalCompositeOperation = 'lighter';
        for (const m of this.motes) {
          const glow = this.fireflyGlow(m);
          if (glow <= 0.05) continue;
          ctx.globalAlpha = glow * 0.35;
          ctx.fillStyle = '#c8f070';
          ctx.fillRect(snap(m.x) - AP * 2, snap(m.y) - AP, AP * 5, AP * 3);
          ctx.fillRect(snap(m.x) - AP, snap(m.y) - AP * 2, AP * 3, AP * 5);
          ctx.globalAlpha = glow;
          ctx.fillStyle = '#f4ffb0';
          ctx.fillRect(snap(m.x), snap(m.y), AP, AP);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return;
      case 'motes':
        ctx.globalCompositeOperation = 'lighter';
        for (const m of this.motes) {
          const twinkle = 0.25 + 0.25 * Math.sin(time * 3 + m.phase * 5);
          ctx.globalAlpha = Math.max(0, twinkle);
          ctx.fillStyle = '#ffe07a';
          ctx.fillRect(snap(m.x), snap(m.y), AP * m.size, AP * m.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return;
      case 'spray':
        for (const m of this.motes) {
          if (m.z <= 0) continue;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(snap(m.x), snap(m.y - m.z), AP, AP);
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#165a86';
          ctx.fillRect(snap(m.x), snap(m.y), AP, AP);
        }
        ctx.globalAlpha = 1;
        return;
      case 'none':
        return;
    }
  }

  private fireflyGlow(m: Mote): number {
    const s = Math.sin(m.age * 1.6 + m.phase * 7);
    return s > 0 ? s * s : 0;
  }

  private reset(map: TileMap, land: LandStyle): void {
    this.map = map;
    this.land = land;
    this.motes = [];
    this.shore = [];
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        if (map.get(col, row) !== Tile.Water) continue;
        const coast = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dc, dr]) => map.inBounds(col + dc, row + dr) && map.get(col + dc, row + dr) !== Tile.Water);
        if (coast) this.shore.push({ x: col * map.tileSize + 4, y: row * map.tileSize + 4 });
      }
    }
    const count = land.ambient === 'spray' && this.shore.length === 0 ? 0 : COUNTS[land.ambient];
    for (let i = 0; i < count; i++) {
      const m: Mote = {
        x: Math.random() * map.width,
        y: Math.random() * map.height,
        z: 0,
        vx: 0,
        vy: land.ambient === 'snowfall' ? 10 + Math.random() * 14 : land.ambient === 'motes' ? -2 - Math.random() * 3 : 0,
        vz: 0,
        phase: Math.random() * Math.PI * 2,
        size: Math.random() < 0.3 ? 2 : 1,
        age: Math.random() * 10,
        life: 1,
      };
      if (land.ambient === 'spray') this.spawnSpray(m);
      this.motes.push(m);
    }
  }

  private spawnSpray(m: Mote): void {
    const p = this.shore[Math.floor(Math.random() * this.shore.length)];
    m.x = p.x + (Math.random() - 0.5) * 8;
    m.y = p.y + (Math.random() - 0.5) * 8;
    m.z = 0.5;
    m.vz = 14 + Math.random() * 20;
    m.vx = (Math.random() - 0.5) * 10;
    m.vy = (Math.random() - 0.5) * 10;
    m.age = 0;
    m.life = 0.3 + Math.random() * 1.6;
  }
}
