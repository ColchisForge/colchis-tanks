import { DIRECTION_VECTORS } from '../core/geometry';
import type { Soldier } from '../entities/Soldier';
import type { Battle } from '../game/Battle';
import type { Game, Toast } from '../game/Game';
import { BATTLE_CONFIG, FIELD_X, FIELD_Y, LEVEL_HEIGHT, LEVEL_WIDTH, ROCKET_CONFIG, SCREEN_WIDTH, TOAST_DURATION } from '../game/GameConfig';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { drawHud } from './HUD';

const FIELD_CENTER_X = FIELD_X + LEVEL_WIDTH / 2;
const FIELD_CENTER_Y = FIELD_Y + LEVEL_HEIGHT / 2;

/** HUD plus battlefield; shared by gameplay and the overlays drawn on top of it. */
export function drawBattleScene(r: Renderer, game: Game, battle: Battle): void {
  r.clear(PALETTE.void);
  drawHud(r, battle, game.highScore, battle.time);
  r.drawBattle(battle, game.effects, battle.time);
}

/** A translucent strip across the battlefield carrying one or two lines of text. */
export function drawBanner(r: Renderer, title: string, subtitle: string | null, color: string, y = FIELD_CENTER_Y): void {
  const height = subtitle ? 34 : 22;
  const top = Math.round(y - height / 2);
  r.ctx.fillStyle = 'rgba(7, 7, 11, 0.72)';
  r.ctx.fillRect(FIELD_X, top, LEVEL_WIDTH, height);
  r.rect(FIELD_X, top, LEVEL_WIDTH, 1, color);
  r.rect(FIELD_X, top + height - 1, LEVEL_WIDTH, 1, color);
  r.text(title, FIELD_CENTER_X, top + 5, { color, scale: 2, align: 'center', shadow: PALETTE.ink });
  if (subtitle) r.text(subtitle, FIELD_CENTER_X, top + 23, { color: PALETTE.silver, align: 'center' });
}

/** Contextual messages over the field: level intro, first-level hints and the outcome. */
export function drawBattleBanners(r: Renderer, battle: Battle): void {
  const time = battle.time;
  if (battle.outcome === 'victory') {
    if (battle.victoryReason === 'hq') drawBanner(r, 'HQ DESTROYED!', 'THE ENEMY COMMAND IS IN RUINS', PALETTE.goldLight);
    else drawBanner(r, 'SECTOR CLEAR!', 'ALL ENEMY TANKS DESTROYED', PALETTE.goldLight);
    return;
  }
  if (battle.outcome === 'defeat') {
    const reason = battle.defeatReason === 'base' ? 'BASE DESTROYED!' : 'NO CREWS LEFT!';
    if (Math.floor(time * 3) % 2 === 0 || battle.result) drawBanner(r, reason, null, PALETTE.red);
    return;
  }
  if (time < BATTLE_CONFIG.introDuration) {
    const visible = time < BATTLE_CONFIG.introDuration - 0.6 || Math.floor(time * 10) % 2 === 0;
    if (visible) drawBanner(r, `LEVEL ${battle.session.levelIndex + 1}`, battle.level.name, PALETTE.gold);
  } else if (battle.session.levelIndex === 0 && time < 12) {
    drawStrip(r, 'WASD MOVE   SPACE CANNON   F MACHINE GUN   E GET OUT', PALETTE.white, 0);
  }
}

/** A thin translucent line of text along the top of the battlefield. */
function drawStrip(r: Renderer, text: string, color: string, row: number): void {
  // Top edge: the bottom of the field is where the player and base are.
  const y = FIELD_Y + 3 + row * 13;
  r.ctx.fillStyle = 'rgba(7, 7, 11, 0.45)';
  r.ctx.fillRect(FIELD_X, y - 3, LEVEL_WIDTH, 13);
  r.text(text, SCREEN_WIDTH / 2, y, { color, align: 'center' });
}

/** The latest event message, blinking out at the end. */
export function drawToast(r: Renderer, toast: Toast | null, battle: Battle): void {
  if (!toast) return;
  if (toast.age > TOAST_DURATION - 0.6 && Math.floor(toast.age * 10) % 2 === 0) return;
  const hintShowing = battle.session.levelIndex === 0 && battle.time < 12;
  drawStrip(r, toast.text, toast.color, hintShowing ? 1 : 0);
}

/** Short hints over the player's crew member when an action is available. */
export function drawCrewPrompt(r: Renderer, battle: Battle, time: number): void {
  const crew = battle.playerOnFoot;
  if (!crew) return;
  const tank = battle.playerTank;
  let text: string | null = null;
  let color: string = PALETTE.white;
  if (tank && battle.crew.touching(crew, tank)) {
    if (tank.operational) text = 'E: BOARD';
    else if (!crew.carryingWrench) text = 'NEED WRENCH';
  } else if (crew.rockets > 0 && enemyInLine(battle, crew)) {
    text = 'SPACE: FIRE ROCKET';
    color = PALETTE.redLight;
  }
  if (!text || Math.floor(time * 3) % 3 === 0) return;
  r.fieldText(text, crew.x + crew.w / 2, crew.y - 9, { color, align: 'center', shadow: PALETTE.ink });
}

/** True when an enemy tank is straight ahead of the crew, within rocket range, with nothing solid between. */
function enemyInLine(battle: Battle, crew: Soldier): boolean {
  const c = crew.center;
  const v = DIRECTION_VECTORS[crew.direction];
  const map = battle.map;
  return battle.enemies.some((enemy) => {
    if (!enemy.operational) return false;
    const e = enemy.center;
    const along = (e.x - c.x) * v.x + (e.y - c.y) * v.y;
    const across = Math.abs((e.x - c.x) * v.y - (e.y - c.y) * v.x);
    if (along <= 0 || along > ROCKET_CONFIG.range || across > enemy.w / 2) return false;
    for (let t = 4; t < along - enemy.w / 2; t += 4) {
      if (map.stopsShells(Math.floor((c.x + v.x * t) / map.tileSize), Math.floor((c.y + v.y * t) / map.tileSize))) return false;
    }
    return true;
  });
}
