import { removeInactive } from '../core/collections';
import { clamp, DIRECTION_VECTORS, distance, rectsOverlap, type Vec } from '../core/geometry';
import { Bullet } from '../entities/Bullet';
import type { WeaponKind } from '../entities/components/Weapon';
import type { Soldier } from '../entities/Soldier';
import type { Tank } from '../entities/Tank';
import type { Team, Unit } from '../entities/Unit';
import type { BattleEvent, ImpactSurface } from '../game/BattleEvents';
import { ENEMY_BASE_CONFIG, MACHINE_GUN_CONFIG, ROCKET_CONFIG } from '../game/GameConfig';
import { Tile } from '../world/Tile';
import type { TileMap } from '../world/TileMap';
import type { CollisionSystem } from './CollisionSystem';

/** Longest distance a projectile may travel between collision checks. Smaller than any tile or shell. */
const MAX_SHELL_STEP = 2;
const HIT_FLASH = 0.1;

export interface CombatListener {
  /** Hull health ran out: the tank becomes a wreck and its crew bails out. */
  onTankDisabled(tank: Tank, attacker: Unit): void;
  /** The tank is gone for good. */
  onTankDestroyed(tank: Tank, attacker: Unit): void;
  onSoldierKilled(soldier: Soldier, attacker: Unit | null, cause: 'shot' | 'crushed'): void;
  /** A base took `hits` worth of damage. */
  onBaseHit(team: Team, hits: number): void;
  /** An armour-piercing hit: the tank is blown apart outright, whatever its state, with anyone inside. */
  onTankDestroyedOutright(tank: Tank, attacker: Unit): void;
  onRocketFired(soldier: Soldier): void;
}

function weaponOf(shell: Bullet): WeaponKind {
  return shell.kind === 'shell' ? 'cannon' : shell.kind === 'rocket' ? 'rocket' : 'machineGun';
}

/** Firing, projectile flight, impacts and damage. */
export class CombatSystem {
  constructor(
    private readonly map: TileMap,
    private readonly collision: CollisionSystem,
    private readonly events: BattleEvent[],
    private readonly listener: CombatListener,
  ) {}

  update(dt: number, tanks: readonly Tank[], soldiers: readonly Soldier[], shells: Bullet[]): void {
    for (const tank of tanks) {
      if (!tank.manned) continue;
      if (tank.intent.fire) this.tryFire(tank, shells, 'cannon');
      if (tank.intent.fireSecondary) this.tryFire(tank, shells, 'machineGun');
    }
    for (const soldier of soldiers) {
      if (soldier.onFoot && soldier.intent.fire) this.tryLaunch(soldier, shells);
    }
    for (const shell of shells) {
      if (!shell.active) continue;
      if (shell.thrust > 0) shell.speed = Math.min(shell.maxSpeed, shell.speed + shell.thrust * dt);
      this.advance(shell, dt, tanks, soldiers);
    }
    this.resolveShellClashes(shells);
    removeInactive(shells);
  }

  /** Fires a weapon from the barrel if it is loaded and the projectile limit allows it. */
  tryFire(tank: Tank, shells: Bullet[], weaponKind: WeaponKind = 'cannon'): Bullet | null {
    if (!tank.manned) return null;
    const weapon = weaponKind === 'cannon' ? tank.cannon : tank.machineGun;
    if (!weapon.ready) return null;
    // Power-ups tune the main gun only.
    const mods = weaponKind === 'cannon' ? tank.effects.modifiers() : null;
    const stats = weapon.stats;
    const inFlight = shells.reduce(
      (count, shell) => count + (shell.active && shell.owner === tank && shell.kind === stats.projectile ? 1 : 0),
      0,
    );
    if (inFlight >= stats.maxShells + (mods?.extraShells ?? 0)) return null;

    const v = DIRECTION_VECTORS[tank.direction];
    const centre = tank.center;
    const muzzle = { x: centre.x + (v.x * tank.w) / 2, y: centre.y + (v.y * tank.h) / 2 };
    const shell = new Bullet(tank, muzzle.x, muzzle.y, tank.direction, {
      kind: stats.projectile,
      speed: stats.shellSpeed * (mods?.shellSpeedScale ?? 1),
      damage: stats.shellDamage,
      personnelDamage: stats.personnelDamage,
      tileDamage: stats.shellTileDamage,
      range: stats.range,
      tracer: stats.projectile === 'bullet' && weapon.rounds % MACHINE_GUN_CONFIG.tracerEvery === 0,
    });
    shells.push(shell);
    weapon.trigger(mods?.cooldownScale ?? 1);
    this.events.push({ type: 'shot', x: muzzle.x, y: muzzle.y, direction: tank.direction, team: tank.team, weapon: weaponKind });
    return shell;
  }

  /** A crew on foot fires its anti-tank rocket the way it faces, if it has one and the launcher is loaded. */
  tryLaunch(soldier: Soldier, shells: Bullet[]): Bullet | null {
    if (!soldier.onFoot || soldier.rockets <= 0 || !soldier.launcher.ready) return null;
    const v = DIRECTION_VECTORS[soldier.direction];
    const c = soldier.center;
    const muzzle = { x: c.x + v.x * 5, y: c.y + v.y * 5 };
    const stats = soldier.launcher.stats;
    const rocket = new Bullet(soldier, muzzle.x, muzzle.y, soldier.direction, {
      kind: 'rocket',
      speed: stats.shellSpeed,
      thrust: ROCKET_CONFIG.thrust,
      maxSpeed: ROCKET_CONFIG.maxSpeed,
      damage: 0,
      personnelDamage: stats.personnelDamage,
      tileDamage: stats.shellTileDamage,
      range: stats.range,
    });
    shells.push(rocket);
    soldier.rockets--;
    soldier.launcher.trigger();
    this.events.push({ type: 'shot', x: muzzle.x, y: muzzle.y, direction: soldier.direction, team: soldier.team, weapon: 'rocket' });
    this.listener.onRocketFired(soldier);
    return rocket;
  }

  /** Working hulls are disabled when their health runs out; wrecks explode when their integrity does. */
  applyDamage(tank: Tank, amount: number, attacker: Unit): void {
    if (!tank.active || amount <= 0) return;
    if (tank.operational) {
      if (tank.invulnerable) return;
      tank.health.damage(amount);
      tank.hitFlash = HIT_FLASH;
      if (tank.health.depleted) {
        this.listener.onTankDisabled(tank, attacker);
      } else {
        const centre = tank.center;
        this.events.push({ type: 'tankDamaged', x: centre.x, y: centre.y, team: tank.team, ratio: tank.health.ratio });
      }
      return;
    }
    tank.integrity.damage(amount);
    tank.hitFlash = HIT_FLASH;
    if (tank.integrity.depleted) {
      tank.active = false;
      this.listener.onTankDestroyed(tank, attacker);
    }
  }

  applyPersonnelDamage(soldier: Soldier, amount: number, attacker: Unit | null): void {
    if (!soldier.onFoot || amount <= 0) return;
    soldier.health.damage(amount);
    soldier.hitFlash = HIT_FLASH;
    if (soldier.health.depleted) {
      this.listener.onSoldierKilled(soldier, attacker, 'shot');
    } else {
      const centre = soldier.center;
      this.events.push({ type: 'soldierHit', x: centre.x, y: centre.y, team: soldier.team });
    }
  }

  private advance(shell: Bullet, dt: number, tanks: readonly Tank[], soldiers: readonly Soldier[]): void {
    const total = shell.speed * dt;
    const steps = Math.max(1, Math.ceil(total / MAX_SHELL_STEP));
    const step = total / steps;
    const v = DIRECTION_VECTORS[shell.direction];
    for (let i = 0; i < steps && shell.active; i++) {
      shell.x += v.x * step;
      shell.y += v.y * step;
      shell.rangeLeft -= step;
      if (this.hitTerrain(shell, soldiers) || this.hitTank(shell, tanks, soldiers) || this.hitSoldier(shell, soldiers)) return;
      if (this.collision.isOutOfBounds(shell)) {
        shell.active = false;
        const c = shell.center;
        const x = clamp(c.x, 0, this.map.width);
        const y = clamp(c.y, 0, this.map.height);
        if (shell.kind === 'rocket') this.detonate(shell, { x, y }, 'edge', soldiers);
        else this.events.push({ type: 'shellImpact', x, y, surface: 'edge', weapon: weaponOf(shell) });
        return;
      }
      if (shell.rangeLeft <= 0) {
        shell.active = false;
        const c = shell.center;
        // A rocket's fuse fires when the motor burns out.
        if (shell.kind === 'rocket') this.detonate(shell, c, 'spent', soldiers);
        else this.events.push({ type: 'shellSpent', x: c.x, y: c.y, weapon: weaponOf(shell) });
      }
    }
  }

  private hitTerrain(shell: Bullet, soldiers: readonly Soldier[]): boolean {
    const hit = this.collision.shellTileHit(shell, shell.direction);
    if (!hit) return false;
    shell.active = false;
    if (shell.kind === 'rocket') {
      const surface = this.blastTerrain(shell, hit.point, hit.tiles);
      this.detonate(shell, hit.point, surface, soldiers);
      this.strikeBase(shell, hit.base);
      return true;
    }

    let surface: 'brick' | 'steel' = 'steel';
    if (shell.tileDamage > 0) {
      for (const tile of hit.tiles) {
        const outcome = this.map.damage(tile.col, tile.row, shell.tileDamage);
        if (outcome === 'damaged' || outcome === 'destroyed') surface = 'brick';
        if (outcome === 'destroyed') this.events.push({ type: 'brickDestroyed', col: tile.col, row: tile.row });
      }
    } else if (hit.tiles.some((tile) => this.map.get(tile.col, tile.row) === Tile.Brick)) {
      surface = 'brick';
    }
    this.events.push({ type: 'shellImpact', x: hit.point.x, y: hit.point.y, surface, weapon: weaponOf(shell) });
    if (shell.kind === 'shell') this.strikeBase(shell, hit.base);
    return true;
  }

  /**
   * Projectiles stop on any opposing tank, wrecks included; machine-gun rounds only spark off the
   * armour, and a rocket's shaped charge goes straight through it.
   */
  private hitTank(shell: Bullet, tanks: readonly Tank[], soldiers: readonly Soldier[]): boolean {
    for (const tank of tanks) {
      if (tank === shell.owner || !tank.active) continue;
      // A rocket goes off against any hull it meets, its own side's too, but only harms the enemy's.
      if (shell.kind === 'rocket' && tank.team === shell.team && rectsOverlap(shell, tank)) {
        shell.active = false;
        this.detonate(shell, shell.center, 'armor', soldiers);
        return true;
      }
      if (tank.team === shell.team) continue;
      if (!rectsOverlap(shell, tank)) continue;
      shell.active = false;
      const c = shell.center;
      const surface = tank.operational && tank.invulnerable ? 'shield' : 'armor';
      if (shell.kind === 'rocket') {
        this.detonate(shell, c, surface, soldiers);
        if (surface === 'armor') this.listener.onTankDestroyedOutright(tank, shell.owner);
        return true;
      }
      this.events.push({ type: 'shellImpact', x: c.x, y: c.y, surface, weapon: weaponOf(shell) });
      this.applyDamage(tank, shell.damage, shell.owner);
      return true;
    }
    return false;
  }

  private hitSoldier(shell: Bullet, soldiers: readonly Soldier[]): boolean {
    for (const soldier of soldiers) {
      if (!soldier.onFoot || soldier.team === shell.team || !rectsOverlap(shell, soldier)) continue;
      shell.active = false;
      const c = shell.center;
      if (shell.kind === 'rocket') {
        this.applyPersonnelDamage(soldier, shell.personnelDamage, shell.owner);
        this.detonate(shell, c, 'flesh', soldiers);
        return true;
      }
      this.events.push({ type: 'shellImpact', x: c.x, y: c.y, surface: 'flesh', weapon: weaponOf(shell) });
      this.applyPersonnelDamage(soldier, shell.personnelDamage, shell.owner);
      return true;
    }
    return false;
  }

  /**
   * Damage to a base. The player's base takes any shell (the classic rule: watch your own fire);
   * the enemy HQ only takes the player's, and a rocket hits it far harder.
   */
  private strikeBase(shell: Bullet, base: Team | null): void {
    if (!base) return;
    if (base === 'enemy' && shell.team === 'enemy') return;
    const hits = shell.kind === 'rocket' ? (base === 'enemy' ? ENEMY_BASE_CONFIG.rocketDamage : 2) : 1;
    this.listener.onBaseHit(base, hits);
  }

  /** A rocket's blast chews a wider hole in brick than a shell: every brick around the impact. */
  private blastTerrain(rocket: Bullet, point: Vec, struck: readonly { col: number; row: number }[]): 'brick' | 'steel' {
    const s = this.map.tileSize;
    const v = DIRECTION_VECTORS[rocket.direction];
    // Centre the blast a little into the wall.
    const col = Math.floor((point.x + v.x * 2) / s);
    const row = Math.floor((point.y + v.y * 2) / s);
    const reach = ROCKET_CONFIG.blastTiles;
    const tiles = [...struck];
    for (let r = row - reach; r <= row + reach; r++) for (let c = col - reach; c <= col + reach; c++) tiles.push({ col: c, row: r });
    let surface: 'brick' | 'steel' = 'steel';
    const seen = new Set<number>();
    for (const tile of tiles) {
      const key = tile.row * this.map.cols + tile.col;
      if (seen.has(key) || this.map.get(tile.col, tile.row) !== Tile.Brick) continue;
      seen.add(key);
      surface = 'brick';
      const outcome = this.map.damage(tile.col, tile.row, rocket.tileDamage);
      if (outcome === 'destroyed') this.events.push({ type: 'brickDestroyed', col: tile.col, row: tile.row });
    }
    return surface;
  }

  /** The warhead goes off: fragments kill crews on foot close by, whichever side they are on. */
  private detonate(rocket: Bullet, at: Vec, surface: ImpactSurface | 'spent', soldiers: readonly Soldier[]): void {
    this.events.push({ type: 'rocketExploded', x: at.x, y: at.y, surface });
    for (const soldier of soldiers) {
      if (!soldier.onFoot || soldier === rocket.owner) continue;
      if (distance(soldier.center, at) <= ROCKET_CONFIG.splashRadius) this.applyPersonnelDamage(soldier, rocket.personnelDamage, rocket.owner);
    }
  }

  /** Opposing tank shells that meet cancel each other out. Bullets fly past each other. */
  private resolveShellClashes(shells: readonly Bullet[]): void {
    for (let i = 0; i < shells.length; i++) {
      const a = shells[i];
      if (!a.active || a.kind !== 'shell') continue;
      for (let j = i + 1; j < shells.length; j++) {
        const b = shells[j];
        if (!b.active || b.kind !== 'shell' || a.team === b.team || !rectsOverlap(a, b)) continue;
        a.active = false;
        b.active = false;
        const c = a.center;
        this.events.push({ type: 'shellImpact', x: c.x, y: c.y, surface: 'shell', weapon: 'cannon' });
        break;
      }
    }
  }
}
