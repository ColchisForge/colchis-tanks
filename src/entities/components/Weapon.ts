export type ProjectileKind = 'shell' | 'bullet' | 'rocket';

/** Which weapon fired: a tank's cannon or coaxial machine gun, or a crew's rocket launcher. */
export type WeaponKind = 'cannon' | 'machineGun' | 'rocket';

export interface WeaponStats {
  readonly projectile: ProjectileKind;
  readonly fireCooldown: number;
  readonly maxShells: number;
  readonly shellSpeed: number;
  /** Damage to tanks. */
  readonly shellDamage: number;
  readonly shellTileDamage: number;
  /** Damage to soldiers. */
  readonly personnelDamage: number;
  /** Distance a projectile travels before it is spent. */
  readonly range: number;
}

/** A gun: owns reload timing. Projectile counts are enforced by the combat system. */
export class Weapon {
  private reload = 0;
  /** Seconds since the last shot; drives recoil and muzzle-flash visuals. */
  sinceLastShot = Number.POSITIVE_INFINITY;
  /** Rounds fired so far; machine-gun belts carry a tracer every few rounds. */
  rounds = 0;

  constructor(readonly stats: WeaponStats) {}

  get ready(): boolean {
    return this.reload <= 0;
  }

  get reloadRemaining(): number {
    return Math.max(0, this.reload);
  }

  update(dt: number): void {
    this.reload -= dt;
    this.sinceLastShot += dt;
  }

  trigger(cooldownScale = 1): void {
    this.reload = this.stats.fireCooldown * cooldownScale;
    this.sinceLastShot = 0;
    this.rounds++;
  }
}
