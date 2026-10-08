import './style.css';
import { AudioManager } from './audio/AudioManager';
import { Game } from './game/Game';
import { RENDER_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from './game/GameConfig';
import { GameLoop } from './game/GameLoop';
import { browserStorage, Settings } from './game/Settings';
import { InputManager } from './input/InputManager';
import { Renderer } from './rendering/Renderer';

/** Below this share of the available space, integer scaling wastes too much screen. */
const MIN_INTEGER_FILL = 0.85;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

/**
 * Scales the canvas (RENDER_SCALE pixels per game pixel) to the window, preferring whole device
 * pixels per canvas pixel so the art stays crisp, and always keeping the aspect ratio.
 */
function fitToWindow(canvas: HTMLCanvasElement, stage: HTMLElement): void {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height) * dpr;
  const whole = Math.floor(fit);
  const deviceScale = whole >= 1 && whole / fit >= MIN_INTEGER_FILL ? whole : fit;
  const cssScale = deviceScale / dpr;
  canvas.style.width = `${Math.floor(canvas.width * cssScale)}px`;
  canvas.style.height = `${Math.floor(canvas.height * cssScale)}px`;
  // Scanlines follow game pixels, not canvas pixels.
  stage.style.setProperty('--px', `${cssScale * RENDER_SCALE}px`);
}

function start(): void {
  const canvas = required<HTMLCanvasElement>('#game');
  const stage = required<HTMLElement>('#stage');
  const crt = required<HTMLElement>('#crt');

  const renderer = new Renderer(canvas);
  const settings = new Settings(browserStorage());
  const audio = new AudioManager();
  settings.subscribe((values) => {
    audio.configure(values.sound, values.music);
    renderer.screenShake = values.screenShake;
    crt.classList.toggle('off', !values.scanlines);
  });

  const input = new InputManager(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);
  const unlockAudio = () => audio.unlock();
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);

  const game = new Game({ audio, settings });
  const loop = new GameLoop(
    (dt) => {
      game.update(dt, input);
      input.endTick();
    },
    () => game.render(renderer),
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
  });
  window.addEventListener('blur', () => game.pause());
  window.addEventListener('resize', () => fitToWindow(canvas, stage));
  fitToWindow(canvas, stage);
  canvas.focus();
  loop.start();

  if (import.meta.env.DEV) Object.assign(window, { colchis: { game, renderer, input, loop } });
}

start();
