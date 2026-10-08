import { POWER_UP_CONFIG } from '../../game/GameConfig';

export type EffectKind = 'shield' | 'rapidFire';

export interface EffectModifiers {
  readonly invulnerable: boolean;
  readonly cooldownScale: number;
  readonly extraShells: number;
  readonly shellSpeedScale: number;
}

const NEUTRAL: EffectModifiers = {
  invulnerable: false,
  cooldownScale: 1,
  extraShells: 0,
  shellSpeedScale: 1,
};

/** What each timed effect changes. New effects only need a row here. */
const EFFECT_MODIFIERS: Readonly<Record<EffectKind, Partial<EffectModifiers>>> = {
  shield: { invulnerable: true },
  rapidFire: {
    cooldownScale: POWER_UP_CONFIG.rapidFire.cooldownScale,
    extraShells: POWER_UP_CONFIG.rapidFire.extraShells,
    shellSpeedScale: POWER_UP_CONFIG.rapidFire.shellSpeedScale,
  },
};

export class StatusEffects {
  private readonly timers = new Map<EffectKind, number>();

  /** Starts an effect, or extends it if the new duration is longer than what remains. */
  add(kind: EffectKind, duration: number): void {
    this.timers.set(kind, Math.max(this.remaining(kind), duration));
  }

  has(kind: EffectKind): boolean {
    return this.remaining(kind) > 0;
  }

  remaining(kind: EffectKind): number {
    return this.timers.get(kind) ?? 0;
  }

  update(dt: number): void {
    for (const [kind, time] of this.timers) {
      const left = time - dt;
      if (left <= 0) this.timers.delete(kind);
      else this.timers.set(kind, left);
    }
  }

  clear(): void {
    this.timers.clear();
  }

  modifiers(): EffectModifiers {
    let result = NEUTRAL;
    for (const kind of this.timers.keys()) {
      const mod = EFFECT_MODIFIERS[kind];
      result = {
        invulnerable: result.invulnerable || (mod.invulnerable ?? false),
        cooldownScale: result.cooldownScale * (mod.cooldownScale ?? 1),
        extraShells: result.extraShells + (mod.extraShells ?? 0),
        shellSpeedScale: result.shellSpeedScale * (mod.shellSpeedScale ?? 1),
      };
    }
    return result;
  }
}
