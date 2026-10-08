/** Central tuning values. Distances are logical pixels, times are seconds. */

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 240;

export const TILE_SIZE = 8;
/** Art pixels per game pixel: sprites are drawn at twice the logical resolution. */
export const RENDER_SCALE = 2;
/** Maps are authored in blocks of 2x2 tiles; one block is exactly one tank. */
export const BLOCK_SIZE = TILE_SIZE * 2;
export const LEVEL_BLOCK_COLS = 19;
export const LEVEL_BLOCK_ROWS = 13;
export const LEVEL_WIDTH = LEVEL_BLOCK_COLS * BLOCK_SIZE;
export const LEVEL_HEIGHT = LEVEL_BLOCK_ROWS * BLOCK_SIZE;

export const HUD_HEIGHT = 28;
export const FIELD_X = (SCREEN_WIDTH - LEVEL_WIDTH) / 2;
export const FIELD_Y = HUD_HEIGHT + 2;

export const FIXED_TIMESTEP = 1 / 120;
export const MAX_FRAME_TIME = 0.25;

export const TANK_SIZE = 16;
export const SHELL_SIZE = 4;
/** Shells chew through bricks across a tank-wide strip so a single line of fire opens a passable gap. */
export const SHELL_BLAST_HALF_WIDTH = TILE_SIZE;

/**
 * Vehicle physics. Tracks push against the ground through friction: the force they can transmit
 * is capped by the surface's grip (see Surface), so on snow engines spin the tracks, brakes lock
 * up and momentum carries a tank sideways through turns.
 */
export const PHYSICS_CONFIG = {
  /** Most acceleration or braking tracks can transmit on grip 1 ground, px/s². */
  tractionAccel: 700,
  /** How hard tracks resist sliding sideways on grip 1 ground, px/s². */
  lateralGrip: 1600,
  /** Engine pull fades over the last share of top speed, as power runs out against drag. */
  powerBand: 0.3,
  /** Drivers steer back onto the tile grid at this rate (px/s, scaled by grip). */
  laneAssist: 24,
  /** Collisions faster than this (px/s) are felt and heard. */
  impactThreshold: 24,
} as const;

export const BRICK_HEALTH = 2;

/**
 * The enemy headquarters. Destroying it wins the level, so the enemy guards it closely and drops
 * everything to defend it when the player gets near.
 */
export const ENEMY_BASE_CONFIG = {
  /** Shell hits it takes; only the player's fire counts. */
  health: 12,
  /** A rocket's shaped charge counts as this many hits. */
  rocketDamage: 3,
  /** The alarm sounds when the player's tank or crew comes this close to the HQ (px). */
  alarmRadius: 120,
  /** After a hit on the HQ the alarm stays up this long even if the attacker withdraws (s). */
  alarmMemory: 10,
  /** Tanks pulled off other duties to hunt the intruder while the alarm is up. */
  defenders: 3,
  /** Tanks permanently posted around the HQ: one, or two on the harder levels. */
  guards: 1,
  extraGuardAggression: 0.9,
  /** Guard posts lie this far from the HQ's centre (px). */
  postRange: [26, 64] as readonly [number, number],
  /** How long a guard holds a post before moving to another (s). */
  postTime: [3, 7] as readonly [number, number],
  /** While the alarm is up, reinforcements arrive this much faster, and this many more may be on the field. */
  surge: 2,
  surgeTanks: 2,
} as const;
/** Shell hits the base survives; the first one sounds the alarm. */
export const BASE_HEALTH = 3;

export interface TankStats {
  /** Top speed on firm ground, px/s. */
  readonly speed: number;
  /** Engine pull from a standstill, px/s², before the ground's grip limits it. */
  readonly acceleration: number;
  /** Deceleration when the driver lets off or brakes, px/s², likewise limited by grip. */
  readonly braking: number;
  readonly maxHealth: number;
  readonly fireCooldown: number;
  readonly maxShells: number;
  readonly shellSpeed: number;
  readonly shellDamage: number;
  readonly shellTileDamage: number;
}

export const PLAYER_CONFIG = {
  speed: 56,
  acceleration: 240,
  braking: 360,
  maxHealth: 100,
  fireCooldown: 0.26,
  maxShells: 2,
  shellSpeed: 190,
  shellDamage: 50,
  shellTileDamage: 1,
  lives: 3,
  respawnDelay: 1.4,
  spawnShield: 3,
} as const satisfies TankStats & Record<string, number>;

export type EnemyKind = 'basic' | 'fast' | 'heavy';

export const ENEMY_KINDS: readonly EnemyKind[] = ['basic', 'fast', 'heavy'];

export interface EnemyProfile extends TankStats {
  readonly points: number;
  /** Distance at which the enemy notices the player and starts chasing. */
  readonly detectRange: number;
  /** Chance per second of hunting the player even when out of sight. */
  readonly huntChance: number;
  /** How strongly patrol moves are biased towards the player's base (0..1). */
  readonly baseBias: number;
  /** Chance per second of a speculative shot while patrolling. */
  readonly patrolFireRate: number;
}

export const ENEMY_PROFILES: Readonly<Record<EnemyKind, EnemyProfile>> = {
  basic: {
    speed: 36,
    acceleration: 150,
    braking: 260,
    maxHealth: 100,
    fireCooldown: 1.3,
    maxShells: 1,
    shellSpeed: 130,
    shellDamage: 25,
    shellTileDamage: 1,
    points: 100,
    detectRange: 80,
    huntChance: 0.04,
    baseBias: 0.4,
    patrolFireRate: 0.35,
  },
  fast: {
    speed: 70,
    acceleration: 280,
    braking: 320,
    maxHealth: 50,
    fireCooldown: 1.1,
    maxShells: 1,
    shellSpeed: 150,
    shellDamage: 20,
    shellTileDamage: 1,
    points: 150,
    detectRange: 104,
    huntChance: 0.09,
    baseBias: 0.5,
    patrolFireRate: 0.3,
  },
  heavy: {
    speed: 26,
    acceleration: 80,
    braking: 200,
    maxHealth: 250,
    fireCooldown: 1.5,
    maxShells: 1,
    shellSpeed: 135,
    shellDamage: 34,
    shellTileDamage: 2,
    points: 300,
    detectRange: 96,
    huntChance: 0.05,
    baseBias: 0.6,
    patrolFireRate: 0.45,
  },
};

export const AI_CONFIG = {
  /** Chasing stops once the player is this far away (and the minimum chase time has passed). */
  loseRange: 150,
  /** Maximum distance at which an aligned enemy will open fire. */
  attackRange: 176,
  /** How close (px) two centres must be on an axis to count as lined up. */
  alignTolerance: 5,
  aimDelay: 0.2,
  attackDuration: 0.9,
  minChaseTime: 2,
  maxChaseTime: 7,
  /** Patrol direction changes happen at random within this window. */
  decisionInterval: [1.2, 3.2],
  chaseDecisionInterval: [0.5, 1.1],
  /** Enemies near the base take shots at it when lined up. */
  baseAttackRange: 88,
  /** Probability that a blocked enemy shoots the obstacle in front before turning. */
  blockedFireChance: 0.55,
  /** Enemy tanks notice a visible crew member on foot within this distance. */
  soldierDetectRange: 112,
  /** Chance a hunting tank plans a route to a firing lane: base + per unit of level aggression. */
  tacticalBase: 0.25,
  tacticalPerAggression: 0.45,
  /** Soldiers are one tile wide and usually half a tile off a tank's grid line. */
  machineGunAlignTolerance: 5,
  machineGunBurst: 1.2,
  /** How often a hunting tank replans its route. */
  repathInterval: 0.6,
  /** Route cost of a brick tile relative to open ground: worth blasting through, but not always. */
  brickPathCost: 6,
} as const;

export const SOLDIER_SIZE = 8;

/** A crew member on foot. Small enough for one-tile gaps, but fragile. */
export const SOLDIER_CONFIG = {
  speed: 34,
  maxHealth: 4,
  /** Gap (px) at which a soldier counts as touching a tank, for boarding and repairs. */
  reach: 3,
  /** Smoke from a knocked-out tank hides its crew from enemy eyes for a moment. */
  bailOutCover: 1.5,
} as const;

/** One crew member per tank; two-player co-op will raise this so a second player can man the machine gun. */
export const CREW_CAPACITY = 1;

/** Coaxial machine gun on every tank: deadly to crews, harmless to armour and walls. */
export const MACHINE_GUN_CONFIG = {
  fireCooldown: 0.11,
  maxShells: 8,
  shellSpeed: 240,
  shellDamage: 0,
  shellTileDamage: 0,
  personnelDamage: 1,
  range: 112,
  /** Every this many rounds is a tracer (the first of a burst always is). */
  tracerEvery: 3,
  /** Enemy gunners fire slower bursts, leaving a crew on foot a moment to dive out of the line. */
  enemyCooldownScale: 2,
} as const;

/** Tank shells kill a soldier outright. */
export const SHELL_PERSONNEL_DAMAGE = 99;

/**
 * The crew's shoulder-fired anti-tank rocket. Its shaped charge goes straight through armour: a
 * hit destroys a tank outright, crew and all. The motor keeps burning after launch, so the rocket
 * leaves the tube slowly and picks up speed.
 */
export const ROCKET_CONFIG = {
  launchSpeed: 60,
  maxSpeed: 230,
  /** Motor thrust, px/s². */
  thrust: 520,
  range: 200,
  tileDamage: 2,
  /** Bricks within this many tiles of the blast are hit. */
  blastTiles: 1,
  /** Fragments kill crews on foot this close to the blast, px. */
  splashRadius: 12,
  reload: 1.2,
  /** Rockets a crew member can carry. */
  carry: 1,
  /** A crew bailing out of a knocked-out tank grabs the tank's launcher. Enemy crews do so this often (scaled by aggression). */
  enemyCarryChance: 0.15,
  enemyCarryPerAggression: 0.25,
  /** Enemy crews line up a shot for this long before firing, long enough to be seen and dodged. */
  aimTime: 1,
  aiRange: 128,
  aiAlignTolerance: 5,
} as const;

/** The HQ's own guns, firing out over the ground in front of the bunker. */
export const GARRISON_CONFIG = {
  /** How far either side of the HQ's centre line the embrasure can traverse (px). */
  arc: 10,
  /** The two firing ports sit this far either side of the centre line (px). */
  portOffset: 5,
  /** Reach of the anti-tank gun (px). */
  range: 168,
  shellSpeed: 160,
  shellDamage: 34,
  cannonCooldown: 1.7,
  /** The gunners need a moment to lay the guns on a new target. */
  aimTime: 0.5,
} as const;

/** Anti-tank mines: picked up as crates, planted by a crew on foot, set off by the weight of a tank. */
export const MINE_CONFIG = {
  carry: 2,
  /** Seconds after planting before the fuse is live. */
  armTime: 1.5,
  /** Time between plants while the key is held. */
  plantCooldown: 0.6,
  /** A tank sets it off once the mine's centre is this far under its hull, px (tile centres sit 4px in). */
  triggerReach: 2,
  /** Damage to the wreck beyond knocking the tank out. */
  wreckDamage: 40,
  /** Crews on foot this close are killed by the blast, px. */
  splashRadius: 14,
  /** Most mines live on the field at once. */
  maxPlanted: 6,
} as const;

/** Supply crates on the map: rocket reloads and mines. */
export const SUPPLY_CONFIG = {
  /** A new rocket crate appears whenever a rocket is fired, up to this many on the map. */
  maxRocketCrates: 2,
  /** Mine crates turn up from time to time. */
  firstMineCrate: 8,
  mineCrateInterval: 20,
  maxMineCrates: 3,
  /** Crates land this far (straight line, px) from where they were called in. */
  minDistance: 40,
  maxDistance: 160,
} as const;

export const WRECK_CONFIG = {
  /** Extra punishment a disabled hull absorbs before it blows apart. */
  integrity: 100,
} as const;

export const REPAIR_CONFIG = {
  duration: 3,
  /** A field repair gets the tank moving again, not back to factory condition. */
  restoredHealth: 0.6,
  wrenchLifetime: 30,
  wrenchBlinkTime: 6,
  /** Wrenches land a fair walk from the wreck (straight-line px). */
  wrenchMinDistance: 40,
  wrenchMaxDistance: 128,
  /** A stranded player crew gets a fresh wrench after this long without one on the map. */
  playerWrenchDelay: 1.5,
  /** If the player's wreck is destroyed, a new empty tank waits at the spawn point after this delay. */
  replacementDelay: 5,
} as const;

export const VISIBILITY_CONFIG = {
  /** Soldiers in cover are still noticed this close (px, from the observer's edge). */
  proximity: 10,
} as const;

/** Night missions: enemies only see what their searchlights or a fire light up. */
export const NIGHT_CONFIG = {
  /** Reach of a tank's searchlight beam (px) and its half-angle (radians). */
  beamRange: 104,
  beamHalfAngle: 0.4,
  /** Burning wrecks light up the ground around them. */
  fireRadius: 26,
  /** Tanks are big and loud: in the dark they are still noticed at this share of the usual range. */
  tankNoticeScale: 0.65,
  /** A cannon shot gives the shooter away for this long. */
  muzzleReveal: 1.2,
} as const;

export const SPAWN_CONFIG = {
  portalDuration: 1.0,
  firstSpawnDelay: 0.5,
} as const;

export const BATTLE_CONFIG = {
  /** Time between the outcome being decided and the result screen appearing. */
  endDelay: 2.2,
  introDuration: 2.6,
} as const;

export const SCORE_CONFIG = {
  crewKill: 50,
  wreck: 50,
  powerUp: 500,
  levelClear: 1000,
  baseIntact: 500,
  enemyHq: 2000,
  perLife: 200,
} as const;

export const POWER_UP_CONFIG = {
  lifetime: 15,
  blinkTime: 4,
  rapidFire: {
    duration: 10,
    cooldownScale: 0.45,
    extraShells: 2,
    shellSpeedScale: 1.3,
  },
  shield: {
    duration: 10,
  },
  weights: {
    rapidFire: 0.4,
    shield: 0.35,
    extraLife: 0.25,
  },
} as const;

export const RESTART_HOLD_TIME = 0.7;
export const TOAST_DURATION = 3;
export const MAX_PARTICLES = 500;
