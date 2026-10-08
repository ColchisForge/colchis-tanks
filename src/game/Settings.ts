export interface SettingsValues {
  sound: boolean;
  music: boolean;
  screenShake: boolean;
  scanlines: boolean;
}

export type SettingKey = keyof SettingsValues;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SETTINGS_KEY = 'colchis-tanks:settings';
const HIGH_SCORE_KEY = 'colchis-tanks:high-score';

export const DEFAULT_SETTINGS: Readonly<SettingsValues> = {
  sound: true,
  music: true,
  screenShake: true,
  scanlines: true,
};

/** localStorage when it is usable (it can be blocked or full); otherwise settings live in memory. */
export function browserStorage(): KeyValueStorage | null {
  try {
    const probe = '__colchis_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export class Settings {
  private values: SettingsValues;
  private best: number;
  private readonly listeners = new Set<(values: Readonly<SettingsValues>) => void>();

  constructor(private readonly storage: KeyValueStorage | null) {
    this.values = { ...DEFAULT_SETTINGS, ...this.readSettings() };
    this.best = this.readHighScore();
  }

  get(key: SettingKey): boolean {
    return this.values[key];
  }

  set(key: SettingKey, value: boolean): void {
    this.values = { ...this.values, [key]: value };
    this.write(SETTINGS_KEY, JSON.stringify(this.values));
    for (const listener of this.listeners) listener(this.values);
  }

  toggle(key: SettingKey): void {
    this.set(key, !this.values[key]);
  }

  all(): Readonly<SettingsValues> {
    return this.values;
  }

  subscribe(listener: (values: Readonly<SettingsValues>) => void): void {
    this.listeners.add(listener);
    listener(this.values);
  }

  get highScore(): number {
    return this.best;
  }

  /** Stores the score if it beats the record. Returns true for a new record. */
  submitScore(score: number): boolean {
    if (score <= this.best) return false;
    this.best = score;
    this.write(HIGH_SCORE_KEY, String(score));
    return true;
  }

  private readSettings(): Partial<SettingsValues> {
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const result: Partial<SettingsValues> = {};
      for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'boolean') result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  }

  private readHighScore(): number {
    try {
      const value = Number(this.storage?.getItem(HIGH_SCORE_KEY) ?? 0);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Storage full or blocked: the setting still applies for this session.
    }
  }
}
