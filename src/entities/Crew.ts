import type { Soldier } from './Soldier';

export type Station = 'driver' | 'gunner' | 'machineGunner';

/** The people inside a tank. A lone crew member works every station. */
export class Crew {
  private readonly aboard: Soldier[] = [];

  constructor(readonly capacity: number) {}

  get size(): number {
    return this.aboard.length;
  }

  get full(): boolean {
    return this.aboard.length >= this.capacity;
  }

  get members(): readonly Soldier[] {
    return this.aboard;
  }

  add(soldier: Soldier): boolean {
    if (this.full || this.aboard.includes(soldier)) return false;
    this.aboard.push(soldier);
    return true;
  }

  remove(soldier: Soldier): void {
    const index = this.aboard.indexOf(soldier);
    if (index >= 0) this.aboard.splice(index, 1);
  }

  /** Empties the tank and returns who was inside. */
  clear(): Soldier[] {
    return this.aboard.splice(0);
  }

  /** Who works a station. With two aboard, the second member takes the machine gun. */
  operator(station: Station): Soldier | null {
    if (station === 'machineGunner' && this.aboard.length > 1) return this.aboard[1];
    return this.aboard[0] ?? null;
  }
}
