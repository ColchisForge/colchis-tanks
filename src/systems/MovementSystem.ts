import { DIRECTION_VECTORS, EPSILON, isPerpendicular, isVertical, rectsOverlap, type Direction, type Rect } from '../core/geometry';
import { isVehicle, type Mobile, type Vehicle } from '../entities/Unit';
import { PHYSICS_CONFIG, TILE_SIZE } from '../game/GameConfig';
import { surfaceProperties } from '../world/Surface';
import type { CollisionSystem } from './CollisionSystem';

/** Moves `value` towards `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** How far a vehicle travelling at `speed` slides before it stops, braking at `braking` on ground with `grip`. */
export function stoppingDistance(speed: number, braking: number, grip: number): number {
  const decel = Math.min(braking, PHYSICS_CONFIG.tractionAccel * grip);
  return decel > 0 ? (speed * speed) / (2 * decel) : Number.POSITIVE_INFINITY;
}

/**
 * Carries out movement intents. Crews on foot walk at a steady pace (slower in snow and sand).
 * Vehicles are simulated: the engine accelerates the hull along its heading, brakes slow it, and
 * every force goes through the tracks, so the ground's grip caps all of them. Momentum is kept
 * through turns and bled off sideways by friction, which on snow takes a while.
 */
export class MovementSystem {
  constructor(private readonly collision: CollisionSystem) {}

  /** Moves each mover, blocked by terrain for its mobility and by the given solid bodies. */
  update(dt: number, movers: readonly Mobile[], bodies: readonly Rect[]): void {
    for (const mover of movers) {
      const others = bodies.filter((body) => body !== mover);
      if (isVehicle(mover)) this.drive(mover, dt, others);
      else this.walk(mover, dt, others);
    }
  }

  private walk(unit: Mobile, dt: number, others: readonly Rect[]): void {
    const { direction, move } = unit.intent;
    if (direction && direction !== unit.direction) this.turn(unit, direction, others);

    if (!move) {
      unit.moving = false;
      unit.blocked = false;
      return;
    }

    const ground = surfaceProperties(this.collision.map.surfaceUnder(unit));
    const wanted = unit.speed * ground.footSpeed * dt;
    const travel = this.collision.travelDistance(unit, unit.direction, wanted, unit.mobility, others);
    const v = DIRECTION_VECTORS[unit.direction];
    unit.x += v.x * travel;
    unit.y += v.y * travel;
    unit.moving = travel > EPSILON;
    unit.blocked = travel < wanted - EPSILON;
    unit.travelled += travel;
  }

  private drive(unit: Vehicle, dt: number, others: readonly Rect[]): void {
    const { direction, move } = unit.intent;
    if (direction && direction !== unit.direction) this.turn(unit, direction, others);

    const ground = surfaceProperties(this.collision.map.surfaceUnder(unit));
    const traction = PHYSICS_CONFIG.tractionAccel * ground.grip;
    const { acceleration, braking } = unit.driveTrain;
    const h = DIRECTION_VECTORS[unit.direction];
    const velocity = unit.velocity;
    // Split velocity into the part along the heading and the part across it.
    let along = velocity.x * h.x + velocity.y * h.y;
    let across = velocity.y * h.x - velocity.x * h.y;
    const top = unit.speed * ground.trackedSpeed;

    let demand: number;
    if (move && along >= 0 && along <= top) {
      // Engine power fades near top speed.
      const band = PHYSICS_CONFIG.powerBand * top;
      const pull = acceleration * Math.min(1, Math.max(0.15, (top - along) / band));
      demand = pull;
      along = Math.min(top, along + Math.min(pull, traction) * dt);
    } else {
      // Off the throttle, rolling backwards, or faster than this ground allows: brake.
      demand = braking;
      along = approach(along, 0, Math.min(braking, traction) * dt);
      if (move && along > top) along = Math.max(top, along);
    }
    const sideDecel = PHYSICS_CONFIG.lateralGrip * ground.grip;
    const sliding = Math.abs(across);
    across = approach(across, 0, sideDecel * dt);

    // Slip: demand beyond what the tracks can transmit, or a sideways slide.
    const spin = demand > traction && (move || Math.abs(along) > 1) ? Math.min(1, (demand - traction) / demand) : 0;
    unit.slip = Math.min(1, Math.max(spin, sliding / 20));

    velocity.x = h.x * along - h.y * across;
    velocity.y = h.y * along + h.x * across;
    const travelled = this.translate(unit, dt, others);
    unit.moving = travelled > EPSILON;
    unit.travelled += travelled;
    if (move && Math.abs(across) < 1) this.keepInLane(unit, ground.grip, dt, others);
  }

  /**
   * Moves a vehicle by its velocity one axis at a time. Hitting something stops that component:
   * the collision is inelastic, and the speed lost is recorded as the impact.
   */
  private translate(unit: Vehicle, dt: number, others: readonly Rect[]): number {
    const h = DIRECTION_VECTORS[unit.direction];
    unit.impact = 0;
    unit.blocked = false;
    let total = 0;
    for (const axis of ['x', 'y'] as const) {
      const speed = unit.velocity[axis];
      const wanted = Math.abs(speed * dt);
      if (wanted <= 0) {
        // Pressing into something with no speed left still counts as being blocked.
        if (unit.intent.move && h[axis] !== 0 && this.pressingInto(unit, others)) unit.blocked = true;
        continue;
      }
      const direction: Direction = axis === 'x' ? (speed > 0 ? 'right' : 'left') : speed > 0 ? 'down' : 'up';
      const travel = this.collision.travelDistance(unit, direction, wanted, unit.mobility, others);
      unit[axis] += Math.sign(speed) * travel;
      total += travel;
      if (travel < wanted - EPSILON) {
        unit.impact = Math.max(unit.impact, Math.abs(speed));
        unit.velocity[axis] = 0;
        if (h[axis] !== 0 && unit.intent.move) unit.blocked = true;
      }
    }
    return total;
  }

  private pressingInto(unit: Vehicle, others: readonly Rect[]): boolean {
    return this.collision.travelDistance(unit, unit.direction, 0.5, unit.mobility, others) < 0.5 - EPSILON;
  }

  /** Drivers steer back onto the grid line they are nearest to, so corridors stay easy to enter. */
  private keepInLane(unit: Vehicle, grip: number, dt: number, others: readonly Rect[]): void {
    const axis = isVertical(unit.direction) ? 'x' : 'y';
    const value = unit[axis];
    const line = Math.round(value / TILE_SIZE) * TILE_SIZE;
    const offset = line - value;
    if (Math.abs(offset) <= EPSILON || Math.abs(offset) >= TILE_SIZE / 2) return;
    const step = Math.sign(offset) * Math.min(Math.abs(offset), PHYSICS_CONFIG.laneAssist * Math.max(0.25, grip) * dt);
    const box = { x: unit.x, y: unit.y, w: unit.w, h: unit.h, [axis]: value + step };
    if (this.collision.fits(box, unit.mobility, others)) unit[axis] = value + step;
  }

  /**
   * Turning onto the other axis snaps the unit to the tile grid, the classic trick that makes
   * exactly-fitting corridors easy to enter. Either neighbouring grid line keeps the unit inside
   * tiles it already occupies, so only other bodies can make a snap unsafe.
   */
  private turn(unit: Mobile, direction: Direction, others: readonly Rect[]): void {
    if (isPerpendicular(unit.direction, direction)) {
      const axis = isVertical(direction) ? 'x' : 'y';
      const value = unit[axis];
      const nearest = Math.round(value / TILE_SIZE) * TILE_SIZE;
      const other = nearest > value ? nearest - TILE_SIZE : nearest + TILE_SIZE;
      for (const candidate of [nearest, other]) {
        if (Math.abs(candidate - value) >= TILE_SIZE) continue;
        const box = { x: unit.x, y: unit.y, w: unit.w, h: unit.h, [axis]: candidate };
        if (!others.some((body) => rectsOverlap(box, body))) {
          unit[axis] = candidate;
          break;
        }
      }
    }
    unit.direction = direction;
  }
}
