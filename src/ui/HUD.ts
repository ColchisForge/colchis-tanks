import type { Battle } from '../game/Battle';
import { HUD_HEIGHT, SCREEN_WIDTH } from '../game/GameConfig';
import { AP } from '../rendering/draw';
import { PALETTE } from '../rendering/palette';
import { measureText } from '../rendering/PixelFont';
import type { Renderer } from '../rendering/Renderer';
import { formatScore } from '../systems/ScoreSystem';

const LINE_1 = 5;
const LINE_2 = 16;
const LEFT = 9;
const RIGHT = SCREEN_WIDTH - 9;
const ARMOR_SEGMENTS = 10;
const SEPARATOR_GAP = 7;
const MAX_HEARTS = 5;
const FRAME = { light: '#8f9ab0', mid: '#5a6378', dark: '#2c3242', fill: '#151a26', fillLight: '#1d2434' } as const;

/** The score shown in the HUD rolls up towards the real one. */
const ticker = { battle: null as Battle | null, shown: 0, time: 0 };

interface Segment {
  readonly label: string;
  readonly value: string;
  readonly color: string;
}

/**
 * A framed steel bar above the battlefield. The top row reads like a classic arcade cabinet:
 * LIVES | SCORE | LEVEL | ENEMIES. The second row carries the tank's armour (or, on foot, the
 * crew's health and the wrench), active power-ups and the record.
 */
export function drawHud(r: Renderer, battle: Battle, highScore: number, time: number): void {
  const session = battle.session;
  drawFrame(r);
  const score = rollScore(battle, session.score);

  const hearts = session.lives <= MAX_HEARTS ? '♥'.repeat(session.lives) : `♥X${session.lives}`;
  const segments: Segment[] = [
    { label: 'LIVES: ', value: session.lives > 0 ? hearts : '-', color: PALETTE.red },
    { label: 'SCORE: ', value: formatScore(score), color: score < session.score ? PALETTE.white : PALETTE.goldLight },
    { label: 'LEVEL: ', value: String(session.levelIndex + 1), color: PALETTE.white },
    { label: 'ENEMIES: ', value: String(battle.enemiesRemaining).padStart(2, '0'), color: PALETTE.redLight },
  ];
  const widths = segments.map((s) => measureText(s.label) + measureText(s.value));
  const total = widths.reduce((a, b) => a + b, 0) + (segments.length - 1) * (SEPARATOR_GAP * 2 + 1);
  let x = Math.round((SCREEN_WIDTH - total) / 2);
  segments.forEach((segment, i) => {
    if (i > 0) {
      r.rect(x + SEPARATOR_GAP, LINE_1 - 1, 1, 9, FRAME.mid);
      x += SEPARATOR_GAP * 2 + 1;
    }
    r.text(segment.label, x, LINE_1, { color: PALETTE.silver, shadow: PALETTE.ink });
    r.text(segment.value, x + measureText(segment.label), LINE_1, { color: segment.color, shadow: PALETTE.ink });
    x += widths[i];
  });

  const tank = battle.playerTank?.manned ? battle.playerTank : null;
  const crew = battle.playerOnFoot;
  if (crew) drawCrewStatus(r, crew.health.current, crew.health.max, crew.carryingWrench, time);
  else drawArmour(r, tank?.health.ratio ?? 0, time);

  // The crew's own kit: anti-tank rockets and mines, carried in or out of the tank.
  const kit = battle.playerCrew;
  let kitX = 100;
  for (const kind of ['rocket', 'mine'] as const) {
    const count = kind === 'rocket' ? (kit?.rockets ?? 0) : (kit?.mines ?? 0);
    if (count <= 0) continue;
    r.art(r.sprites.crate(kind), kitX, LINE_2 - 1);
    r.text(String(count), kitX + 10, LINE_2, { color: kind === 'rocket' ? PALETTE.redLight : PALETTE.goldLight, shadow: PALETTE.ink });
    kitX += 22;
  }

  let iconX = 150;
  for (const kind of ['rapidFire', 'shield'] as const) {
    const remaining = tank?.effects.remaining(kind) ?? 0;
    if (remaining <= 0) continue;
    if (remaining > 2 || Math.floor(time * 8) % 2 === 0) {
      r.art(r.sprites.icon(kind), iconX, LINE_2 - 1);
      r.text(String(Math.ceil(remaining)), iconX + 10, LINE_2, { color: PALETTE.white, shadow: PALETTE.ink });
    }
    iconX += 26;
  }
  drawEnemyHq(r, battle, time);
  if (battle.level.night) drawMoon(r, 251, LINE_2);
  r.text(`HI ${formatScore(highScore)}`, RIGHT, LINE_2, { color: PALETTE.gray, align: 'right', shadow: PALETTE.ink });
}

/** The enemy HQ's strength: one segment per hit it can still take; red and blinking under alarm. */
function drawEnemyHq(r: Renderer, battle: Battle, time: number): void {
  const hq = battle.map.enemyBase;
  if (!hq) return;
  const x = 204;
  const alarm = battle.enemyAlarm && Math.floor(time * 4) % 2 === 0;
  r.text('HQ', x, LINE_2, { color: alarm ? PALETTE.redLight : PALETTE.gray, shadow: PALETTE.ink });
  const left = x + 12;
  const step = Math.min(4, Math.floor(32 / hq.maxHealth));
  for (let i = 0; i < hq.maxHealth; i++) {
    const on = i < hq.health;
    r.rect(left + i * step, LINE_2 + 1, step - 1, 5, on ? (alarm ? PALETTE.red : PALETTE.cyanDark) : PALETTE.shadow);
  }
  if (hq.destroyed) r.text('X', left + 12, LINE_2, { color: PALETTE.goldLight, shadow: PALETTE.ink });
}

/** A small crescent moon for night missions. */
function drawMoon(r: Renderer, x: number, y: number): void {
  const ctx = r.ctx;
  ctx.fillStyle = '#e8f0ff';
  ctx.fillRect(x + 1, y, 3, 1);
  ctx.fillRect(x, y + 1, 2, 5);
  ctx.fillRect(x + 1, y + 6, 3, 1);
  ctx.fillRect(x + 2, y + 1, AP, AP);
  ctx.fillRect(x + 2, y + 5.5, AP, AP);
}

function rollScore(battle: Battle, score: number): number {
  if (ticker.battle !== battle || score < ticker.shown) {
    ticker.battle = battle;
    ticker.shown = score;
    ticker.time = battle.time;
  }
  const dt = Math.max(0, battle.time - ticker.time);
  ticker.time = battle.time;
  if (ticker.shown < score) ticker.shown = Math.min(score, ticker.shown + Math.max(120, (score - ticker.shown) * 5) * dt);
  return Math.floor(ticker.shown);
}

function drawFrame(r: Renderer): void {
  const ctx = r.ctx;
  const x = 3;
  const y = 1;
  const w = SCREEN_WIDTH - 6;
  const h = HUD_HEIGHT - 3;
  r.rect(0, 0, SCREEN_WIDTH, HUD_HEIGHT, PALETTE.void);
  r.rect(x, y, w, h, PALETTE.ink);
  r.rect(x + 1, y + 1, w - 2, h - 2, FRAME.mid);
  r.rect(x + 1, y + 1, w - 2, 1, FRAME.light);
  r.rect(x + 1, y + 1, 1, h - 2, FRAME.light);
  r.rect(x + 1, y + h - 2, w - 2, 1, FRAME.dark);
  r.rect(x + w - 2, y + 1, 1, h - 2, FRAME.dark);
  r.rect(x + 2, y + 2, w - 4, h - 4, PALETTE.ink);
  r.rect(x + 2, y + 2, w - 4, h - 4, FRAME.fill);
  ctx.fillStyle = FRAME.fillLight;
  ctx.fillRect(x + 2 + AP, y + 2 + AP, w - 4 - 2 * AP, 10);
  ctx.fillStyle = FRAME.dark;
  ctx.fillRect(x + 6, LINE_2 - 3, w - 12, AP);
  for (const rx of [x + 1, x + w - 2]) {
    for (const ry of [y + 1, y + h - 2]) {
      ctx.fillStyle = '#c9d2e2';
      ctx.fillRect(rx, ry, AP, AP);
    }
  }
}

function drawArmour(r: Renderer, ratio: number, time: number): void {
  const lit = Math.ceil(ratio * ARMOR_SEGMENTS);
  r.text('ARMOR', LEFT, LINE_2, { color: PALETTE.gray, shadow: PALETTE.ink });
  const barLeft = LEFT + 34;
  const color = ratio > 0.5 ? PALETTE.green : ratio > 0.25 ? PALETTE.gold : PALETTE.red;
  const critical = ratio > 0 && ratio <= 0.25 && Math.floor(time * 6) % 2 === 0;
  for (let i = 0; i < ARMOR_SEGMENTS; i++) {
    const on = i < lit;
    r.rect(barLeft + i * 5, LINE_2, 4, 7, on ? (critical ? PALETTE.white : color) : PALETTE.shadow);
    if (on) {
      r.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      r.ctx.fillRect(barLeft + i * 5, LINE_2, 4, 1);
    }
  }
}

function drawCrewStatus(r: Renderer, health: number, max: number, wrench: boolean, time: number): void {
  // Without a wrench the label pulses: the crew is exposed and should be heading somewhere.
  const color = wrench || Math.floor(time * 2) % 2 === 0 ? PALETTE.goldLight : PALETTE.amber;
  r.text('ON FOOT', LEFT, LINE_2, { color, shadow: PALETTE.ink });
  const pipsLeft = LEFT + 46;
  for (let i = 0; i < max; i++) {
    r.text('♥', pipsLeft + i * 7, LINE_2, { color: i < health ? PALETTE.redLight : PALETTE.shadow });
  }
  if (wrench) r.art(r.sprites.wrench(), pipsLeft + max * 7 + 4, LINE_2 - 1);
}
