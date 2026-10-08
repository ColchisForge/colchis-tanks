import type { Direction } from '../core/geometry';

export type Action = 'up' | 'down' | 'left' | 'right' | 'fire' | 'secondary' | 'use' | 'pause' | 'restart' | 'confirm' | 'back';

/** Physical key codes, so WASD stays in place on any keyboard layout. */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'fire',
  KeyF: 'secondary',
  KeyE: 'use',
  KeyP: 'pause',
  KeyR: 'restart',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'back',
};

const ACTION_DIRECTIONS: Partial<Record<Action, Direction>> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly inside: boolean;
  readonly moved: boolean;
  readonly clicked: boolean;
}

/** Read-only view of the controls for one update tick. */
export interface InputState {
  isDown(action: Action): boolean;
  wasPressed(action: Action): boolean;
  /** The most recently pressed direction that is still held, so the newest key always wins. */
  readonly direction: Direction | null;
  readonly pointer: PointerState;
}

export class InputManager implements InputState {
  private readonly heldCodes = new Set<string>();
  private readonly pressed = new Set<Action>();
  private readonly directionCodes: string[] = [];
  private pointerState = { x: 0, y: 0, inside: false, moved: false, clicked: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly logicalWidth: number,
    private readonly logicalHeight: number,
  ) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointerleave', () => {
      this.pointerState.inside = false;
    });
  }

  get direction(): Direction | null {
    const code = this.directionCodes[this.directionCodes.length - 1];
    return code ? (ACTION_DIRECTIONS[KEY_BINDINGS[code]] ?? null) : null;
  }

  get pointer(): PointerState {
    return this.pointerState;
  }

  isDown(action: Action): boolean {
    for (const code of this.heldCodes) if (KEY_BINDINGS[code] === action) return true;
    return false;
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action);
  }

  /** Clears one-shot presses after an update tick has seen them. */
  endTick(): void {
    this.pressed.clear();
    this.pointerState.clicked = false;
    this.pointerState.moved = false;
  }

  /** Forgets held keys, e.g. when the window loses focus and key-ups would be missed. */
  releaseAll(): void {
    this.heldCodes.clear();
    this.directionCodes.length = 0;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) this.pressed.add(action);
    this.heldCodes.add(event.code);
    if (ACTION_DIRECTIONS[action]) {
      this.removeDirectionCode(event.code);
      this.directionCodes.push(event.code);
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.heldCodes.delete(event.code);
    this.removeDirectionCode(event.code);
  }

  private onPointerMove(event: PointerEvent): void {
    const point = this.toLogical(event);
    this.pointerState = { ...this.pointerState, ...point, inside: true, moved: true };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const point = this.toLogical(event);
    this.pointerState = { ...this.pointerState, ...point, inside: true, clicked: true };
    this.canvas.focus();
  }

  private toLogical(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.logicalWidth,
      y: ((event.clientY - rect.top) / rect.height) * this.logicalHeight,
    };
  }

  private removeDirectionCode(code: string): void {
    const index = this.directionCodes.indexOf(code);
    if (index >= 0) this.directionCodes.splice(index, 1);
  }
}
