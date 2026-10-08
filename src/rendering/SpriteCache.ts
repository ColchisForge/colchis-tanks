import type { Direction } from '../core/geometry';
import type { PowerUpKind } from '../entities/PowerUp';
import type { Team } from '../entities/Unit';
import type { Land } from '../world/Level';
import type { TileType } from '../world/Tile';
import type { SupplyKind } from '../entities/Supply';
import { paintBase, paintEnemyBase, paintMine, paintMineCrate, paintPowerUp, paintRocketCrate, paintSmallIcon, paintWrench } from './art/props';
import { paintSwatch } from './art/terrain';
import { paintFallen, paintSoldier, paintTank, SOLDIER_COLORS, TANK_COLORS, type TankDesign } from './art/units';
import { context2d, createCanvas } from './canvas';
import { LANDS } from './lands';

export type TankScheme = 'normal' | 'wreck' | 'flash' | 'carrier';

const ANGLES: Readonly<Record<Direction, number>> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

function rotated(source: HTMLCanvasElement, direction: Direction): HTMLCanvasElement {
  if (direction === 'up') return source;
  const canvas = createCanvas(source.width, source.height);
  const ctx = context2d(canvas);
  ctx.translate(source.width / 2, source.height / 2);
  ctx.rotate(ANGLES[direction]);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/** Paints every sprite variant once, on first use, so frames only blit images. */
export class SpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly silhouettes = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

  tank(design: TankDesign, scheme: TankScheme, direction: Direction, phase: number, scorched: boolean): HTMLCanvasElement {
    return this.memo(`tank:${design}:${scheme}:${direction}:${phase}:${scorched}`, () => {
      const up = this.memo(`tank:${design}:${scheme}:up:${phase}:${scorched}`, () => {
        const art = paintTank(design, { colors: TANK_COLORS[scheme === 'wreck' ? 'wreck' : design], phase, scorched: scorched || scheme === 'wreck' });
        if (scheme === 'flash') art.tint('#ffffff', 0.85);
        if (scheme === 'carrier') art.tint('#ff6a9a', 0.45);
        return art.toCanvas();
      });
      return rotated(up, direction);
    });
  }

  soldier(team: Team, direction: Direction, frame: number, flash: boolean, launcher = false): HTMLCanvasElement {
    return this.memo(`soldier:${team}:${direction}:${frame}:${flash}:${launcher}`, () => {
      const art = paintSoldier(SOLDIER_COLORS[team], frame, launcher);
      if (flash) art.tint('#ffffff', 0.85);
      return rotated(art.toCanvas(), direction);
    });
  }

  fallen(team: Team, direction: Direction): HTMLCanvasElement {
    return this.memo(`fallen:${team}:${direction}`, () => rotated(paintFallen(SOLDIER_COLORS[team]).toCanvas(), direction));
  }

  base(ruined: boolean): HTMLCanvasElement {
    return this.memo(`base:${ruined}`, () => paintBase(ruined).toCanvas());
  }

  enemyBase(ruined: boolean): HTMLCanvasElement {
    return this.memo(`enemyBase:${ruined}`, () => paintEnemyBase(ruined).toCanvas());
  }

  powerUp(kind: PowerUpKind): HTMLCanvasElement {
    return this.memo(`powerUp:${kind}`, () => paintPowerUp(kind).toCanvas());
  }

  /** The bare power-up icon, for the HUD. */
  icon(kind: PowerUpKind): HTMLCanvasElement {
    return this.memo(`icon:${kind}`, () => paintSmallIcon(kind).toCanvas());
  }

  wrench(): HTMLCanvasElement {
    return this.memo('wrench', () => paintWrench().toCanvas());
  }

  crate(kind: SupplyKind): HTMLCanvasElement {
    return this.memo(`crate:${kind}`, () => (kind === 'rocket' ? paintRocketCrate() : paintMineCrate()).toCanvas());
  }

  /** A planted mine; `lamp` is the colour of its arming light, if lit. */
  mine(lamp: string | null): HTMLCanvasElement {
    return this.memo(`mine:${lamp}`, () => paintMine(lamp).toCanvas());
  }

  /** A small sample of one terrain type in a land's style, for legends. */
  swatch(type: TileType, land: Land): HTMLCanvasElement {
    return this.memo(`swatch:${type}:${land}`, () => paintSwatch(type, LANDS[land]));
  }

  /** The sprite's shape filled with one colour, for drop shadows. */
  silhouette(sprite: HTMLCanvasElement, color: string): HTMLCanvasElement {
    let byColor = this.silhouettes.get(sprite);
    if (!byColor) {
      byColor = new Map();
      this.silhouettes.set(sprite, byColor);
    }
    let shadow = byColor.get(color);
    if (!shadow) {
      shadow = createCanvas(sprite.width, sprite.height);
      const ctx = context2d(shadow);
      ctx.drawImage(sprite, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, sprite.width, sprite.height);
      byColor.set(color, shadow);
    }
    return shadow;
  }

  private memo(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
    let canvas = this.cache.get(key);
    if (!canvas) {
      canvas = build();
      this.cache.set(key, canvas);
    }
    return canvas;
  }
}
