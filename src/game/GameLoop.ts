import { FIXED_TIMESTEP, MAX_FRAME_TIME } from './GameConfig';

const MAX_STEPS_PER_FRAME = 12;

/**
 * requestAnimationFrame loop with a fixed simulation step: the game advances in identical
 * increments whatever the display refresh rate, and renders once per frame.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private handle = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
    private readonly step: number = FIXED_TIMESTEP,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    this.handle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = this.lastTime === null ? 0 : Math.min(MAX_FRAME_TIME, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= this.step && steps < MAX_STEPS_PER_FRAME) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.render();
    this.handle = requestAnimationFrame(this.frame);
  };
}
