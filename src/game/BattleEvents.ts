import type { Direction } from '../core/geometry';
import type { WeaponKind } from '../entities/components/Weapon';
import type { PowerUpKind } from '../entities/PowerUp';
import type { SupplyKind } from '../entities/Supply';
import type { Team } from '../entities/Unit';
import type { EnemyKind } from './GameConfig';

export type ImpactSurface = 'brick' | 'steel' | 'edge' | 'shell' | 'shield' | 'armor' | 'flesh';

export type TankKind = EnemyKind | 'player';

/**
 * Facts the simulation reports for presentation (sound, particles, screen shake, messages).
 * Coordinates are in field pixels.
 */
export type BattleEvent =
  | { type: 'shot'; x: number; y: number; direction: Direction; team: Team; weapon: WeaponKind }
  | { type: 'shellImpact'; x: number; y: number; surface: ImpactSurface; weapon: WeaponKind }
  /** A round that ran out of range and dropped to the ground (or into the water). */
  | { type: 'shellSpent'; x: number; y: number; weapon: WeaponKind }
  | { type: 'brickDestroyed'; col: number; row: number }
  | { type: 'tankDamaged'; x: number; y: number; team: Team; ratio: number }
  /** Hull knocked out by ordinary fire: the tank becomes a wreck and the crew bails out. */
  | { type: 'tankDisabled'; x: number; y: number; team: Team; kind: TankKind; points: number }
  /** A wreck (or a tank with its crew inside) blown apart for good. */
  | { type: 'tankDestroyed'; x: number; y: number; team: Team; kind: TankKind; points: number }
  | { type: 'crewBailedOut'; x: number; y: number; team: Team }
  | { type: 'crewExited'; x: number; y: number; team: Team }
  | { type: 'crewBoarded'; x: number; y: number; team: Team }
  | { type: 'soldierHit'; x: number; y: number; team: Team }
  | { type: 'crewEscaped'; x: number; y: number; team: Team }
  | { type: 'soldierKilled'; x: number; y: number; team: Team; direction: Direction; cause: 'shot' | 'crushed'; points: number }
  | { type: 'wrenchSpawned'; x: number; y: number }
  | { type: 'wrenchCollected'; x: number; y: number; team: Team }
  | { type: 'wrenchExpired'; x: number; y: number }
  | { type: 'repairing'; x: number; y: number; team: Team }
  | { type: 'repairComplete'; x: number; y: number; team: Team }
  | { type: 'replacementTank'; x: number; y: number }
  | { type: 'enemyIncoming'; x: number; y: number }
  | { type: 'playerSpawned'; x: number; y: number }
  | { type: 'powerUpSpawned'; x: number; y: number; kind: PowerUpKind }
  | { type: 'powerUpCollected'; x: number; y: number; kind: PowerUpKind; points: number }
  | { type: 'powerUpExpired'; x: number; y: number }
  /** A crew on foot has raised its launcher and is lining up a shot. */
  | { type: 'rocketAiming'; x: number; y: number; team: Team }
  /** A rocket's warhead went off, on a target or at the end of its flight. */
  | { type: 'rocketExploded'; x: number; y: number; surface: ImpactSurface | 'spent' }
  /** A tank ran into something hard enough to feel it. */
  | { type: 'tankImpact'; x: number; y: number; speed: number; team: Team }
  | { type: 'supplySpawned'; x: number; y: number; kind: SupplyKind }
  | { type: 'supplyCollected'; x: number; y: number; kind: SupplyKind; team: Team }
  | { type: 'minePlanted'; x: number; y: number; team: Team }
  | { type: 'mineArmed'; x: number; y: number; team: Team }
  | { type: 'mineExploded'; x: number; y: number }
  | { type: 'baseHit'; x: number; y: number; health: number }
  /** The player is closing in on the enemy HQ: its defenders are scrambling. */
  | { type: 'enemyAlarm'; x: number; y: number }
  | { type: 'enemyBaseHit'; x: number; y: number; health: number; maxHealth: number }
  | { type: 'enemyBaseDestroyed'; x: number; y: number }
  | { type: 'baseDestroyed'; x: number; y: number }
  | { type: 'outcome'; result: 'victory' | 'defeat' };
