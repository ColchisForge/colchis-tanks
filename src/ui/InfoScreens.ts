import type { PowerUpKind } from '../entities/PowerUp';
import type { Game } from '../game/Game';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { SettingKey } from '../game/Settings';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { POWER_UP_DEFINITIONS } from '../systems/PowerUpSystem';
import { Tile, type TileType } from '../world/Tile';
import { Backdrop, backHintClicked, drawBackHint } from './Backdrop';
import { MenuList } from './MenuList';

const CENTER = SCREEN_WIDTH / 2;

function heading(r: Renderer, text: string, y = 16): void {
  r.text(text, CENTER, y, { color: PALETTE.gold, scale: 2, align: 'center', shadow: PALETTE.redDark });
}

/** Shared behaviour of the menu sub-screens: animated backdrop, Escape or click to go back. */
abstract class SubMenuScreen implements Screen {
  protected readonly backdrop = new Backdrop(24);
  protected time = 0;

  constructor(protected readonly game: Game) {}

  enter(): void {}

  update(dt: number, input: InputState): void {
    this.time += dt;
    this.backdrop.update(dt);
    if (input.wasPressed('back') || backHintClicked(input.pointer)) {
      this.game.audio.play('menuSelect');
      this.game.setState('MENU');
      return;
    }
    this.handle(input);
  }

  protected handle(_input: InputState): void {}

  abstract render(r: Renderer): void;
}

const CONTROLS: readonly (readonly [string, string])[] = [
  ['MOVE', 'W A S D  OR  ARROW KEYS'],
  ['CANNON', 'SPACE  (HOLD FOR AUTO)'],
  ['MACHINE GUN', 'F'],
  ['GET OUT / IN', 'E'],
  ['ON FOOT', 'SPACE ROCKET   F PLANT MINE'],
  ['PAUSE', 'P  OR  ESC'],
  ['RESTART', 'HOLD R'],
];

const CREW_RULES: readonly string[] = [
  'SHELLS DISABLE A TANK: ITS CREW BAILS OUT',
  'WITH ONE ANTI-TANK ROCKET. A ROCKET HIT',
  'DESTROYS ANY TANK. FIRE IT AND A NEW ONE',
  'IS DROPPED SOMEWHERE ON THE MAP.',
  'A WRENCH APPEARS TOO: TAKE IT BACK TO THE',
  'WRECK AND STAND STILL TO REPAIR.',
  'MINE CRATES TURN UP NOW AND THEN. PLANT',
  'MINES ON THE ROADS - ANY TANK SETS THEM OFF.',
  'BUSHES AND WALLS HIDE YOU FROM ENEMY EYES.',
];

const TERRAIN: readonly (readonly [TileType, string])[] = [
  [Tile.Brick, 'BRICK'],
  [Tile.Steel, 'STEEL'],
  [Tile.Water, 'WATER'],
  [Tile.Bush, 'BUSH'],
  [Tile.Base, 'BASE'],
  [Tile.EnemyBase, 'ENEMY HQ'],
];

const PAGES = 2;
const PAGE_HINT_Y = SCREEN_HEIGHT - 34;

export class HowToPlayScreen extends SubMenuScreen {
  private page = 0;

  override enter(): void {
    this.page = 0;
  }

  override handle(input: InputState): void {
    const pointer = input.pointer;
    const clickedHint = pointer.clicked && Math.abs(pointer.y - (PAGE_HINT_Y + 3)) <= 7;
    const forward = input.wasPressed('right') || input.wasPressed('confirm') || (clickedHint && pointer.x >= CENTER);
    const back = input.wasPressed('left') || (clickedHint && pointer.x < CENTER);
    if (forward) {
      if (this.page === PAGES - 1 && input.wasPressed('confirm')) this.game.setState('MENU');
      else this.turn(1);
    } else if (back) {
      this.turn(-1);
    }
  }

  render(r: Renderer): void {
    this.backdrop.render(r);
    if (this.page === 0) this.renderControls(r);
    else this.renderCrews(r);
    const arrows = `${this.page > 0 ? '<' : ' '}  ${this.page + 1}/${PAGES}  ${this.page < PAGES - 1 ? '>' : ' '}`;
    r.text(arrows, CENTER, PAGE_HINT_Y, { color: PALETTE.gold, align: 'center' });
    drawBackHint(r);
  }

  private turn(step: number): void {
    const next = Math.max(0, Math.min(PAGES - 1, this.page + step));
    if (next === this.page) return;
    this.page = next;
    this.game.audio.play('menuMove');
  }

  private renderControls(r: Renderer): void {
    heading(r, 'HOW TO PLAY', 14);
    let y = 34;
    for (const [action, keys] of CONTROLS) {
      r.text(action, 32, y, { color: PALETTE.goldLight });
      r.text(keys, 124, y, { color: PALETTE.white });
      y += 9;
    }

    r.text('DESTROY EVERY ENEMY TANK, OR BLOW UP THEIR HQ', CENTER, 104, { color: PALETTE.white, align: 'center' });
    r.text('AT THE TOP, WHILE PROTECTING YOUR BASE.', CENTER, 114, { color: PALETTE.white, align: 'center' });
    r.text('THE HQ GUNS COVER ITS FRONT - FLANK IT!', CENTER, 124, { color: PALETTE.orange, align: 'center' });

    r.text('POWER-UPS  (DESTROY FLASHING TANKS)', CENTER, 140, { color: PALETTE.gray, align: 'center' });
    (['rapidFire', 'shield', 'extraLife'] as const satisfies readonly PowerUpKind[]).forEach((kind, i) => {
      const x = 70 + i * 90;
      r.art(r.sprites.powerUp(kind), x - 8, 151);
      r.text(POWER_UP_DEFINITIONS[kind].label, x, 170, { color: PALETTE.cyan, align: 'center' });
    });
  }

  private renderCrews(r: Renderer): void {
    heading(r, 'TANK CREWS', 14);
    r.art(r.sprites.soldier('player', 'right', 1, false), 70, 18);
    r.art(r.sprites.wrench(), 242, 18);
    CREW_RULES.forEach((line, i) => r.text(line, CENTER, 34 + i * 10, { color: i < 4 ? PALETTE.white : PALETTE.silver, align: 'center' }));

    r.text('TERRAIN', CENTER, 126, { color: PALETTE.gray, align: 'center' });
    TERRAIN.forEach(([type, label], i) => {
      const x = 40 + i * 48;
      if (type === Tile.Base) r.art(r.sprites.base(false), x - 8, 138);
      else if (type === Tile.EnemyBase) r.art(r.sprites.enemyBase(false), x - 8, 138);
      else r.art(r.sprites.swatch(type, 'grassland'), x - 9, 137);
      r.text(label, x, 158, { color: PALETTE.silver, align: 'center' });
    });
    r.text('BUSHES HIDE CREWS  -  WATER STOPS EVERYONE', CENTER, 172, { color: PALETTE.slate, align: 'center' });
    r.text('AT NIGHT, ENEMIES SEE ONLY WHAT THEIR LIGHTS HIT', CENTER, 184, { color: PALETTE.cyanDark, align: 'center' });
  }
}

export class OptionsScreen extends SubMenuScreen {
  private readonly list: MenuList;

  constructor(game: Game) {
    super(game);
    const toggle = (key: SettingKey, label: string) => ({
      label: () => `${label}: ${game.settings.get(key) ? 'ON' : 'OFF'}`,
      select: () => game.settings.toggle(key),
      adjust: () => game.settings.toggle(key),
    });
    this.list = new MenuList(
      [
        toggle('sound', 'SOUND'),
        toggle('music', 'MUSIC'),
        toggle('screenShake', 'SCREEN SHAKE'),
        toggle('scanlines', 'SCANLINES'),
        { label: () => 'BACK', select: () => game.setState('MENU') },
      ],
      { x: CENTER, y: 74, spacing: 18, width: 150 },
      game.audio,
    );
  }

  override handle(input: InputState): void {
    this.list.update(input);
  }

  render(r: Renderer): void {
    this.backdrop.render(r);
    heading(r, 'OPTIONS', 30);
    this.list.render(r, this.time);
    r.text('SETTINGS ARE SAVED ON THIS DEVICE', CENTER, 182, { color: PALETTE.slate, align: 'center' });
    drawBackHint(r);
  }
}

export class CreditsScreen extends SubMenuScreen {
  override handle(input: InputState): void {
    if (input.wasPressed('confirm')) this.game.setState('MENU');
  }

  render(r: Renderer): void {
    this.backdrop.render(r);
    heading(r, 'COLCHIS TANKS', 40);
    const lines: readonly (readonly [string, string])[] = [
      ['AN ORIGINAL RETRO-INSPIRED TANK GAME.', PALETTE.white],
      ['', PALETTE.white],
      ['BUILT WITH TYPESCRIPT + HTML5 CANVAS.', PALETTE.silver],
      ['ALL ART, SOUND AND MUSIC ARE GENERATED', PALETTE.silver],
      ['IN CODE AND MADE FOR THIS GAME.', PALETTE.silver],
      ['', PALETTE.white],
      ['© 2026 COLCHIS FORGE', PALETTE.gold],
    ];
    lines.forEach(([text, color], i) => r.text(text, CENTER, 84 + i * 13, { color, align: 'center' }));
    drawBackHint(r);
  }
}
