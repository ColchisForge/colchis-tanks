import { placeSound, type AudioOutput, type EngineState, type EngineSurface, type SoundPosition } from '../audio/AudioManager';
import { DIRECTION_VECTORS, type Rect } from '../core/geometry';
import type { Effects } from '../effects/Effects';
import { EnemyTank } from '../entities/EnemyTank';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import { LANDS, type LandStyle } from '../rendering/lands';
import { PALETTE } from '../rendering/palette';
import { POWER_UP_DEFINITIONS } from '../systems/PowerUpSystem';
import { Surface } from '../world/Surface';
import { Tile } from '../world/Tile';
import type { TileMap } from '../world/TileMap';
import type { Battle } from './Battle';
import type { BattleEvent } from './BattleEvents';
import { TILE_SIZE } from './GameConfig';

const STEEL_SPARKS = [PALETTE.white, PALETTE.steelLight, PALETTE.steel];
const ARMOR_SPARKS = [PALETTE.white, PALETTE.goldLight, PALETTE.orange, PALETTE.red];
const GOLD_SPARKS = [PALETTE.white, PALETTE.goldLight, PALETTE.gold];
const BULLET_SPARKS = [PALETTE.white, PALETTE.goldLight];
const WOUND = [PALETTE.redLight, PALETTE.red, PALETTE.redDark];
const HULL_SCRAP = ['#5a524a', '#433c37', '#6a625a'];
const BASE_RUBBLE = ['#d8d0bc', '#b4aa92', '#8a8070', '#f0b432'];
const HQ_RUBBLE = ['#aab6c8', '#7c889c', '#56606e', '#c08a4a'];
const MG_FLASH = ['#fffbe0', '#ffe060', '#ffb020'];
const SNOW_SPRAY = ['#ffffff', '#c4d2e2', '#a4b6cc'];

/** Distance between tread marks, and between footprints in the snow. */
const TRACK_SPACING = 2;
const FOOTPRINT_SPACING = 2.5;

/** Shows a short message to the player, e.g. "FIND THE WRENCH". */
export type Notify = (text: string, color: string) => void;

function isWaterAt(map: TileMap, x: number, y: number): boolean {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor(y / TILE_SIZE);
  return map.inBounds(col, row) && map.get(col, row) === Tile.Water;
}

function inBush(map: TileMap, unit: Rect): boolean {
  const range = map.rangeForRect(unit);
  for (let row = range.r0; row <= range.r1; row++) {
    for (let col = range.c0; col <= range.c1; col++) if (map.conceals(col, row)) return true;
  }
  return false;
}

/** Ground colours thrown up by a blast in the dirt. */
function dirt(land: LandStyle): string[] {
  return [land.ground.dark, land.road.dark, land.road.base, land.dust];
}

/**
 * Turns simulation facts into sound, particles, shake and messages. Gameplay never depends on
 * this. Every sound is placed where it happened, so the mix pans and fades with distance.
 */
export function presentBattleEvents(events: readonly BattleEvent[], battle: Battle, effects: Effects, audio: AudioOutput, notify: Notify): void {
  const land = LANDS[battle.level.land];
  for (const event of events) {
    switch (event.type) {
      case 'shot': {
        const at = { x: event.x, y: event.y };
        const v = DIRECTION_VECTORS[event.direction];
        if (event.weapon === 'cannon') {
          effects.muzzle(event.x, event.y, event.direction, 1);
          audio.play(event.team === 'player' ? 'playerShot' : 'enemyShot', at);
        } else if (event.weapon === 'rocket') {
          // Flash at the muzzle, and the backblast roaring out of the rear of the tube.
          effects.muzzle(event.x, event.y, event.direction, 0.6);
          effects.light(event.x - v.x * 8, event.y - v.y * 8, 18, PALETTE.orange, 0.15);
          for (let i = 0; i < 6; i++) effects.dust(event.x - v.x * (8 + i * 2), event.y - v.y * (8 + i * 2), land.dust, 1, 2);
          effects.smoke(event.x - v.x * 9, event.y - v.y * 9, 4, 3);
          audio.play('rocketLaunch', at);
          if (event.team === 'enemy') notify('ROCKET!', PALETTE.redLight);
        } else {
          // A short yellow star at the muzzle; the tracer itself glows green.
          effects.muzzle(event.x, event.y, event.direction, 0.4);
          effects.sparks(event.x + v.x * 2, event.y + v.y * 2, MG_FLASH, 2, 45);
          effects.casing(event.x - v.x * 7, event.y - v.y * 7, event.direction);
          audio.play(event.team === 'player' ? 'machineGun' : 'enemyMachineGun', at);
        }
        break;
      }
      case 'shellImpact':
        presentImpact(event, effects, audio, land);
        break;
      case 'shellSpent':
        if (isWaterAt(battle.map, event.x, event.y)) {
          effects.splash(event.x, event.y, event.weapon === 'cannon' ? 8 : 3);
          audio.play('splash', event);
        } else {
          effects.dust(event.x, event.y, land.dust, event.weapon === 'cannon' ? 3 : 1, 1);
          audio.play('dirtHit', event);
        }
        break;
      case 'rocketExploded':
        presentRocketBlast(event, effects, audio, land);
        break;
      case 'rocketAiming':
        audio.play('launcherReady', event);
        break;
      case 'brickDestroyed': {
        const x = event.col * TILE_SIZE + TILE_SIZE / 2;
        const y = event.row * TILE_SIZE + TILE_SIZE / 2;
        effects.debris(x, y, land.debris, 4);
        effects.dust(x, y, land.dust, 3, 3);
        audio.play('brickBreak', { x, y });
        break;
      }
      case 'tankDamaged':
        effects.smoke(event.x, event.y, 2, 3, true);
        break;
      case 'tankDisabled':
        effects.explosion(event.x, event.y, 0.7);
        effects.debris(event.x, event.y, HULL_SCRAP, 3, 0.9);
        effects.smoke(event.x, event.y, 6, 5, true);
        effects.addShake(event.team === 'player' ? 3 : 2);
        effects.freeze(0.03);
        if (event.points > 0) effects.text(event.x, event.y, `+${event.points}`, PALETTE.goldLight);
        audio.play('tankDisabled', event);
        if (event.team === 'player') notify('TANK DISABLED! FIND THE WRENCH', PALETTE.redLight);
        break;
      case 'tankDestroyed':
        effects.explosion(event.x, event.y, 1.4);
        effects.debris(event.x, event.y, HULL_SCRAP, 6, 1.4);
        effects.addShake(4);
        effects.freeze(0.06);
        if (event.points > 0) effects.text(event.x, event.y, `+${event.points}`, PALETTE.goldLight);
        audio.play(event.team === 'player' ? 'playerExplosion' : 'explosion', event);
        if (event.team === 'player') notify('YOUR TANK WAS DESTROYED', PALETTE.redLight);
        break;
      case 'tankImpact': {
        const hard = Math.min(1, event.speed / 70);
        effects.dust(event.x, event.y, land.dust, 1 + Math.round(hard * 3), 6);
        if (event.team === 'player') effects.addShake(0.6 + hard * 1.6);
        audio.play('tankImpact', event);
        break;
      }
      case 'crewBailedOut':
      case 'crewExited':
      case 'crewBoarded':
        effects.smoke(event.x, event.y, 2, 2);
        audio.play('hatch', event);
        break;
      case 'soldierHit':
        effects.sparks(event.x, event.y, WOUND, 4, 30);
        audio.play('soldierHit', event);
        break;
      case 'soldierKilled':
        effects.sparks(event.x, event.y, WOUND, 8, 40);
        effects.dust(event.x, event.y, land.dust, 2, 2);
        if (event.cause === 'shot') effects.fallen(event.x, event.y, event.team, event.direction);
        if (event.points > 0) effects.text(event.x, event.y, `+${event.points}`, PALETTE.goldLight);
        audio.play(event.cause === 'crushed' ? 'crushed' : 'soldierDown', event);
        if (event.team === 'player') notify('CREW LOST!', PALETTE.redLight);
        break;
      case 'wrenchSpawned':
        effects.ring(event.x, event.y, PALETTE.goldLight, 12, 0.5);
        effects.light(event.x, event.y, 14, PALETTE.goldLight, 0.5);
        audio.play('wrenchAppear', event);
        break;
      case 'wrenchCollected':
        effects.ring(event.x, event.y, PALETTE.white, 10, 0.3);
        effects.sparks(event.x, event.y, GOLD_SPARKS, 8, 40);
        audio.play('wrench', event);
        if (event.team === 'player') notify('GOT THE WRENCH! BACK TO THE TANK', PALETTE.goldLight);
        break;
      case 'supplySpawned':
        effects.ring(event.x, event.y, event.kind === 'rocket' ? PALETTE.redLight : PALETTE.goldLight, 12, 0.5);
        effects.dust(event.x, event.y, land.dust, 2, 3);
        audio.play('crateDrop', event);
        break;
      case 'supplyCollected':
        effects.ring(event.x, event.y, PALETTE.white, 10, 0.3);
        audio.play('pickup', event);
        if (event.team === 'player') {
          notify(event.kind === 'rocket' ? 'ROCKET LOADED - SPACE TO FIRE' : 'MINE - PRESS F TO PLANT', PALETTE.goldLight);
        }
        break;
      case 'minePlanted':
        effects.dust(event.x, event.y, land.dust, 2, 2);
        audio.play('minePlant', event);
        break;
      case 'mineArmed':
        audio.play('mineArm', event);
        break;
      case 'mineExploded':
        effects.explosion(event.x, event.y, 1.6);
        effects.debris(event.x, event.y, dirt(land), 14, 1.8);
        effects.dust(event.x, event.y, land.dust, 6, 6);
        effects.scorch(event.x, event.y, 9);
        effects.addShake(5);
        effects.freeze(0.05);
        audio.play('mineExplosion', event);
        break;
      case 'crewEscaped':
      case 'wrenchExpired':
        effects.smoke(event.x, event.y, 2, 2);
        break;
      case 'repairing':
        effects.sparks(event.x, event.y - 4, GOLD_SPARKS, 3, 35);
        effects.light(event.x, event.y - 4, 8, PALETTE.goldLight, 0.08);
        audio.play('repairTick', event);
        break;
      case 'repairComplete':
        effects.ring(event.x, event.y, PALETTE.cyan, 14, 0.5);
        audio.play('repairDone', event);
        if (event.team === 'player') notify('TANK REPAIRED!', PALETTE.green);
        break;
      case 'replacementTank':
        effects.ring(event.x, event.y, PALETTE.gold, 14, 0.6);
        audio.play('newTank');
        notify('NEW TANK WAITING AT YOUR BASE', PALETTE.cyan);
        break;
      case 'enemyIncoming':
        effects.light(event.x, event.y, 16, PALETTE.cyan, 1);
        audio.play('enemyIncoming', event);
        break;
      case 'playerSpawned':
        effects.ring(event.x, event.y, PALETTE.gold, 14, 0.5);
        audio.play('playerSpawn');
        break;
      case 'powerUpSpawned':
        effects.ring(event.x, event.y, PALETTE.goldLight, 16, 0.6);
        effects.sparks(event.x, event.y, GOLD_SPARKS, 10, 50);
        audio.play('powerUpAppear', event);
        break;
      case 'powerUpCollected':
        effects.ring(event.x, event.y, PALETTE.white, 14, 0.35);
        effects.sparks(event.x, event.y, GOLD_SPARKS, 14, 70);
        effects.text(event.x, event.y, POWER_UP_DEFINITIONS[event.kind].label, PALETTE.cyan);
        audio.play(event.kind === 'extraLife' ? 'extraLife' : 'powerUp');
        break;
      case 'powerUpExpired':
        effects.smoke(event.x, event.y, 3, 4);
        break;
      case 'baseHit':
        effects.sparks(event.x, event.y, ARMOR_SPARKS, 10, 60);
        effects.debris(event.x, event.y, BASE_RUBBLE, 5, 0.8);
        effects.smoke(event.x, event.y, 4, 4, true);
        effects.addShake(2);
        audio.play('baseAlarm');
        notify(event.health > 1 ? 'BASE UNDER ATTACK!' : 'BASE CRITICAL! DEFEND IT!', PALETTE.redLight);
        break;
      case 'baseDestroyed':
        effects.explosion(event.x, event.y, 2.2);
        effects.debris(event.x, event.y, BASE_RUBBLE, 16, 1.6);
        effects.addShake(6);
        audio.play('baseDestroyed', event);
        break;
      case 'enemyAlarm':
        audio.play('enemySiren', event);
        notify('ENEMY HQ ON ALERT!', PALETTE.orange);
        break;
      case 'enemyBaseHit':
        effects.sparks(event.x, event.y, STEEL_SPARKS, 10, 60);
        effects.debris(event.x, event.y, HQ_RUBBLE, 5, 0.9);
        effects.smoke(event.x, event.y, 4, 4, true);
        effects.addShake(1.5);
        audio.play('bunkerHit', event);
        if (event.health <= event.maxHealth / 3) notify('ENEMY HQ CRUMBLING!', PALETTE.goldLight);
        break;
      case 'enemyBaseDestroyed':
        effects.explosion(event.x, event.y, 2.4);
        effects.debris(event.x, event.y, HQ_RUBBLE, 18, 1.7);
        effects.addShake(6);
        audio.play('baseDestroyed', event);
        notify('ENEMY HQ DESTROYED!', PALETTE.goldLight);
        break;
      case 'outcome':
        break;
    }
  }
}

function presentImpact(event: Extract<BattleEvent, { type: 'shellImpact' }>, effects: Effects, audio: AudioOutput, land: LandStyle): void {
  if (event.weapon === 'machineGun') {
    if (event.surface === 'flesh') return;
    if (event.surface === 'brick') {
      effects.dust(event.x, event.y, land.dust, 1, 0.5);
      effects.sparks(event.x, event.y, land.debris, 2, 30);
      audio.play('bulletHitBrick', event);
    } else {
      effects.sparks(event.x, event.y, BULLET_SPARKS, 3, 40);
      audio.play('ricochet', event);
    }
    return;
  }
  switch (event.surface) {
    case 'brick':
      effects.sparks(event.x, event.y, land.debris, 4, 40);
      effects.debris(event.x, event.y, land.debris, 2, 0.6);
      effects.dust(event.x, event.y, land.dust, 2, 1.5);
      effects.light(event.x, event.y, 12, PALETTE.orange, 0.1);
      audio.play('hitBrick', event);
      break;
    case 'steel':
    case 'edge':
      effects.sparks(event.x, event.y, STEEL_SPARKS, 6, 60);
      effects.light(event.x, event.y, 10, PALETTE.white, 0.08);
      audio.play('hitSteel', event);
      break;
    case 'shell':
      effects.sparks(event.x, event.y, GOLD_SPARKS, 8, 60);
      effects.light(event.x, event.y, 14, PALETTE.goldLight, 0.12);
      audio.play('clash', event);
      break;
    case 'shield':
      effects.ring(event.x, event.y, PALETTE.cyan, 6, 0.2);
      audio.play('shieldHit', event);
      break;
    case 'armor':
      effects.sparks(event.x, event.y, ARMOR_SPARKS, 7, 60);
      effects.light(event.x, event.y, 14, PALETTE.orange, 0.12);
      audio.play('hitTank', event);
      break;
    case 'flesh':
      break;
  }
}

/** A shaped charge going off: a sharp, bright blast, and a jet of sparks if it struck armour. */
function presentRocketBlast(event: Extract<BattleEvent, { type: 'rocketExploded' }>, effects: Effects, audio: AudioOutput, land: LandStyle): void {
  if (event.surface === 'shield') {
    effects.ring(event.x, event.y, PALETTE.cyan, 10, 0.3);
    effects.sparks(event.x, event.y, [PALETTE.white, PALETTE.cyan], 12, 70);
    audio.play('shieldHit', event);
    return;
  }
  effects.explosion(event.x, event.y, 1);
  if (event.surface === 'armor') effects.sparks(event.x, event.y, ARMOR_SPARKS, 16, 110);
  effects.debris(event.x, event.y, event.surface === 'brick' ? land.debris : dirt(land), 6, 1.2);
  effects.addShake(3);
  audio.play('rocketExplosion', event);
}

const ENGINE_SIZE: Readonly<Record<string, number>> = { player: 1, basic: 1.1, fast: 0.85, heavy: 1.35 };

function engineSurface(map: TileMap, tank: Tank): EngineSurface {
  const surface = map.surfaceUnder(tank);
  if (surface === Surface.Snow) return 'snow';
  if (surface === Surface.Road) return 'road';
  return surface === Surface.Sand || surface === Surface.Moss ? 'soft' : 'hard';
}

function engineState(battle: Battle, tank: Tank, ear: SoundPosition | null): EngineState {
  const placement = placeSound(tank.center, ear, 0);
  return {
    throttle: tank.intent.move ? 1 : 0,
    speed: Math.min(1, tank.groundSpeed / tank.speed),
    slip: tank.slip,
    surface: engineSurface(battle.map, tank),
    pan: placement.pan,
    presence: placement.gain,
    size: ENGINE_SIZE[tank instanceof EnemyTank ? tank.kind : 'player'],
  };
}

/**
 * Continuous sound for the battle: the player is the listener, their tank's engine runs while it
 * is crewed, and the loudest enemy engine nearby can be heard approaching, which matters most to
 * a crew hiding on foot.
 */
export function updateBattleAudio(battle: Battle, audio: AudioOutput): void {
  const crew = battle.playerOnFoot;
  const tank = battle.playerTank;
  const ear = crew?.center ?? tank?.center ?? null;
  audio.setListener(ear);
  audio.setEngine('player', tank?.manned ? engineState(battle, tank, ear) : null);
  let loudest: EngineState | null = null;
  let score = 0;
  for (const enemy of battle.enemies) {
    if (!enemy.manned) continue;
    const state = engineState(battle, enemy, ear);
    const weight = (state.presence ?? 0) * (0.5 + state.speed + 0.3 * state.throttle);
    if (weight > score) {
      score = weight;
      loudest = state;
    }
  }
  audio.setEngine('enemy', loudest);
}

/** Travel at which each unit last left a mark on the ground. */
const lastMark = new WeakMap<Tank | Soldier, number>();

/** True once a unit has travelled `spacing` since its last mark; resets after teleports. */
function dueForMark(unit: Tank | Soldier, spacing: number): boolean {
  const last = lastMark.get(unit);
  if (last === undefined || unit.travelled < last || unit.travelled - last > spacing * 6) {
    lastMark.set(unit, unit.travelled);
    return false;
  }
  if (unit.travelled - last < spacing) return false;
  lastMark.set(unit, unit.travelled);
  return true;
}

/** Tread marks laid behind a moving tank, one plate across each track. */
function layTracks(tank: Tank, effects: Effects): void {
  if (!dueForMark(tank, TRACK_SPACING)) return;
  const v = DIRECTION_VECTORS[tank.direction];
  const c = tank.center;
  const x = c.x - v.x * 6;
  const y = c.y - v.y * 6;
  for (const side of [-4.75, 4.75]) {
    if (v.x === 0) effects.track(x + side - 1.5, y - 0.5, 3, 1);
    else effects.track(x - 0.5, y + side - 1.5, 1, 3);
  }
}

/** Slipping tracks fling the ground up behind them: snow on snow, mud and grit elsewhere. */
function sprayFromTracks(tank: Tank, effects: Effects, land: LandStyle, map: TileMap, dt: number): void {
  if (tank.slip < 0.12 || Math.random() > dt * 60 * tank.slip) return;
  const v = DIRECTION_VECTORS[tank.direction];
  const c = tank.center;
  const surface = map.surfaceUnder(tank);
  const colors = surface === Surface.Snow ? SNOW_SPRAY : surface === Surface.Road ? [land.road.dark, land.road.base] : [land.dust, land.ground.dark];
  // Thrown back off the tracks, plus some sideways if the hull is sliding.
  const speed = tank.groundSpeed || 1;
  const back = { x: -v.x, y: -v.y };
  const drift = { x: tank.velocity.x / speed, y: tank.velocity.y / speed };
  for (const side of [-4.75, 4.75]) {
    const x = c.x - v.x * 7 - v.y * side;
    const y = c.y - v.y * 7 + v.x * side;
    effects.kickUp(x, y, colors, back.x - drift.x * 0.5, back.y - drift.y * 0.5, 1);
  }
}

/**
 * Per-tick atmosphere: smoke and fire from damaged tanks and wrecks, tracks, dust and spray behind
 * moving tanks, leaves shaken from bushes, footprints in the snow, and trails behind shells and
 * rockets in flight.
 */
export function emitAmbientEffects(battle: Battle, effects: Effects, dt: number): void {
  const land = LANDS[battle.level.land];
  const map = battle.map;
  effects.wind = land.wind;
  const leaves = [land.bush.light, land.bush.base, land.bush.dark];
  for (const tank of battle.tanks) {
    const c = tank.center;
    if (tank.disabled) {
      if (Math.random() < dt * 14) effects.fire(c.x, c.y - 1, 4);
      if (Math.random() < dt * 6) effects.smoke(c.x, c.y - 2, 1, 3, true);
    } else {
      const rate = tank.health.ratio <= 0.25 ? 9 : tank.health.ratio <= 0.5 ? 4 : 0;
      if (rate > 0 && Math.random() < dt * rate) effects.smoke(c.x, c.y - 2, 1, 3, true);
    }
    if (tank.manned) sprayFromTracks(tank, effects, land, map, dt);
    if (!tank.moving) continue;
    layTracks(tank, effects);
    const v = DIRECTION_VECTORS[tank.direction];
    if (Math.random() < dt * 5) effects.dust(c.x - v.x * 8, c.y - v.y * 8, land.dust, 1, 4);
    if (Math.random() < dt * 8 && inBush(map, tank)) effects.leaves(c.x, c.y, leaves, 2);
  }
  for (const soldier of battle.soldiers) {
    if (!soldier.onFoot || !soldier.moving) continue;
    const c = soldier.center;
    if (land.trackLife === 0 && map.surfaceUnder(soldier) === Surface.Snow && dueForMark(soldier, FOOTPRINT_SPACING)) {
      const v = DIRECTION_VECTORS[soldier.direction];
      const side = Math.floor(soldier.travelled / FOOTPRINT_SPACING) % 2 === 0 ? -1.2 : 1.2;
      effects.footprint(c.x - v.y * side, c.y + v.x * side);
    }
    if (Math.random() < dt * 5 && inBush(map, soldier)) effects.leaves(c.x, c.y, leaves, 1);
  }
  for (const shell of battle.shells) {
    const x = shell.x + shell.w / 2;
    const y = shell.y + shell.h / 2;
    if (shell.kind === 'shell' && Math.random() < dt * 40) effects.trail(x, y);
    if (shell.kind === 'rocket') {
      const v = DIRECTION_VECTORS[shell.direction];
      effects.trail(x - v.x * 4, y - v.y * 4);
      if (Math.random() < dt * 60) effects.smoke(x - v.x * 5, y - v.y * 5, 1, 0.8);
    }
  }
  // Damaged bases smoulder, the worse the damage the thicker.
  for (const base of [map.base, map.enemyBase]) {
    if (!base || base.destroyed || base.health >= base.maxHealth) continue;
    const damage = (base.maxHealth - base.health) / base.maxHealth;
    if (Math.random() < dt * damage * 7) effects.smoke((base.col + 1) * TILE_SIZE, (base.row + 1) * TILE_SIZE - 2, 1, 4, true);
  }
}
