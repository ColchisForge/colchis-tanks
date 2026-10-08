export class Health {
  private value: number;

  constructor(readonly max: number) {
    this.value = max;
  }

  get current(): number {
    return this.value;
  }

  get ratio(): number {
    return this.max > 0 ? this.value / this.max : 0;
  }

  get depleted(): boolean {
    return this.value <= 0;
  }

  /** Applies damage and returns the amount actually removed. */
  damage(amount: number): number {
    const applied = Math.min(this.value, Math.max(0, amount));
    this.value -= applied;
    return applied;
  }

  /** Sets health to a share of the maximum (full by default). */
  restore(ratio = 1): void {
    this.value = Math.max(1, Math.round(this.max * ratio));
  }
}
