import type { Direction } from '../core/geometry';
import type { TilePoint } from '../world/TileMap';
import type { WeaponKind } from './components/Weapon';

export type AIState = 'PATROL' | 'CHASE' | 'ATTACK' | 'CHANGE_DIRECTION' | 'GUARD' | 'DEFEND' | 'DESTROYED';

/** raider: roams the field and pushes on the player's base. guard: holds posts around the HQ. */
export type AIRole = 'raider' | 'guard';

/** player: the player's manned tank; soldier: the player's crew on foot; wreck: the player's idle or disabled tank. */
export type AITarget = 'player' | 'soldier' | 'wreck' | 'base';

/** Per-enemy memory for the finite-state AI. The behaviour itself lives in EnemyAISystem. */
export class AIBrain {
  state: AIState = 'PATROL';
  role: AIRole = 'raider';
  /** Pulled in to hunt an intruder near the HQ while the alarm is up. */
  defending = false;
  /** The guard post being held or driven to, as the tank's top-left tile. */
  post: TilePoint | null = null;
  postTimer = 0;
  /** State to resume once a CHANGE_DIRECTION decision has been made. */
  resumeState: AIState = 'PATROL';
  stateTime = 0;
  /** Countdown until the next voluntary direction change. */
  decisionTimer = 0;
  /** How long the tank has been pressing against an obstacle. */
  blockedTime = 0;
  /** While positive the tank keeps pushing and shooting into the brick in front of it. */
  digTime = 0;
  chaseTarget: 'player' | 'soldier' = 'player';
  /** Set while the tank has chosen to march on the base; only then will it shell it. */
  siege = false;
  /** Whether the current hunt follows a planned route to a firing lane, or just blunders towards the target. */
  tactical = false;
  attackTarget: AITarget = 'player';
  attackWeapon: WeaponKind = 'cannon';
  /** Route while hunting, as tile positions of the tank's top-left corner. */
  path: TilePoint[] = [];
  repathTimer = 0;
  /** A short random sidestep after the planned route ran into another tank. */
  detourTime = 0;
  detourDirection: Direction = 'down';
  /** A turn onto the other axis the driver is slowing down for. */
  pendingTurn: Direction | null = null;

  enter(state: AIState): void {
    if (state === 'CHANGE_DIRECTION' && this.state !== 'CHANGE_DIRECTION') this.resumeState = this.state;
    this.state = state;
    this.stateTime = 0;
    this.path = [];
    this.repathTimer = 0;
  }
}
