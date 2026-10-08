import type { Direction, Rect } from '../core/geometry';
import type { Mobility } from '../world/Tile';
import type { Soldier } from './Soldier';
import type { Tank } from './Tank';

export type Team = 'player' | 'enemy';

/** Anything that can fight: a tank or a soldier on foot. */
export type Unit = Tank | Soldier;

/**
 * What a unit's operator wants to do this tick. Player input and AI both produce intents and the
 * systems carry them out; a tank only acts on the intents of the crew inside it.
 */
export interface UnitIntent {
  direction: Direction | null;
  move: boolean;
  /** Main weapon: a tank's cannon. */
  fire: boolean;
  /** Secondary weapon: a tank's machine gun. */
  fireSecondary: boolean;
  /** Get into or out of a tank. */
  use: boolean;
}

export function idleIntent(): UnitIntent {
  return { direction: null, move: false, fire: false, fireSecondary: false, use: false };
}

/** The movement system's view of a unit. */
export interface Mobile extends Rect {
  direction: Direction;
  readonly speed: number;
  readonly mobility: Mobility;
  intent: UnitIntent;
  /** True while the unit actually travelled this tick. */
  moving: boolean;
  /** True when the unit tried to move but something stopped it short. */
  blocked: boolean;
  /** Accumulated travel, used to animate tracks and legs. */
  travelled: number;
}

export interface DriveTrain {
  readonly acceleration: number;
  readonly braking: number;
}

/** A mover with mass: it accelerates, brakes and slides according to the ground under it. */
export interface Vehicle extends Mobile {
  /** World-space velocity, px/s. */
  readonly velocity: { x: number; y: number };
  readonly driveTrain: DriveTrain;
  /** 0..1: how much the tracks are slipping this tick (wheelspin, skids, side slides). */
  slip: number;
  /** Speed lost in a collision this tick, px/s (0 if none). */
  impact: number;
}

export function isVehicle(mover: Mobile): mover is Vehicle {
  return 'velocity' in mover;
}
