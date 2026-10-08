import type { InputState } from '../input/InputManager';
import type { Renderer } from '../rendering/Renderer';

export type GameState =
  | 'MENU'
  | 'HOW_TO_PLAY'
  | 'OPTIONS'
  | 'CREDITS'
  | 'PLAYING'
  | 'PAUSED'
  | 'LEVEL_COMPLETE'
  | 'GAME_OVER'
  | 'VICTORY';

/** One state of the game: menus and gameplay each get their own screen, never shared logic. */
export interface Screen {
  enter?(previous: GameState): void;
  update(dt: number, input: InputState): void;
  render(renderer: Renderer): void;
}
