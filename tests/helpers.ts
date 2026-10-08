import type { Direction } from '../src/core/geometry';
import { Random } from '../src/core/Random';
import { Battle, NO_COMMAND, type PlayerCommand } from '../src/game/Battle';
import { Session } from '../src/game/Session';
import { Settings, type KeyValueStorage } from '../src/game/Settings';
import type { Action, InputState, PointerState } from '../src/input/InputManager';
import { parseLevel, type Land, type LevelDefinition } from '../src/world/Level';

export const TICK = 1 / 120;

export function testLevel(layout: readonly string[], overrides: Partial<LevelDefinition> = {}): LevelDefinition {
  return {
    name: 'TEST',
    land: 'grassland',
    layout,
    roster: '',
    maxActiveEnemies: 4,
    spawnInterval: 1,
    aggression: 1,
    ...overrides,
  };
}

export interface BattleSetup {
  readonly roster?: string;
  readonly ai?: boolean;
  readonly session?: Session;
  readonly seed?: number;
  readonly land?: Land;
  /** Road overlay in the same block grid as the layout ('=' marks road). */
  readonly roads?: readonly string[];
  readonly night?: boolean;
}

/** A battle on a custom block layout with the AI switched off unless asked for. */
export function makeBattle(layout: readonly string[], options: BattleSetup = {}): Battle {
  return new Battle({
    level: parseLevel(
      testLevel(layout, {
        roster: options.roster ?? '',
        land: options.land ?? 'grassland',
        roads: options.roads,
        night: options.night,
      }),
    ),
    session: options.session ?? new Session(),
    rng: new Random(options.seed ?? 1),
    aiEnabled: options.ai ?? false,
  });
}

export function run(battle: Battle, seconds: number, command: PlayerCommand = NO_COMMAND): void {
  for (let t = 0; t < seconds; t += TICK) battle.update(TICK, command);
}

export function hold(direction: Direction | null, fire = false, extra: Partial<PlayerCommand> = {}): PlayerCommand {
  return { ...NO_COMMAND, direction, fire, ...extra };
}

/** One tick with the "use" key pressed: exit the tank, or board one when standing next to it. */
export function pressUse(battle: Battle): void {
  battle.update(TICK, { ...NO_COMMAND, use: true });
}

export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

export function memorySettings(storage = new MemoryStorage()): Settings {
  return new Settings(storage);
}

/** Scriptable controls for driving the Game state machine in tests. */
export class FakeInput implements InputState {
  readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  direction: Direction | null = null;
  pointer: PointerState = { x: 0, y: 0, inside: false, moved: false, clicked: false };

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  press(action: Action): void {
    this.pressed.add(action);
  }

  endTick(): void {
    this.pressed.clear();
  }
}
