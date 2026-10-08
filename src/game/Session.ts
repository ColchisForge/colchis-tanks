import { PLAYER_CONFIG } from './GameConfig';

/** Progress that survives between levels: score, lives and where the run is. */
export class Session {
  score = 0;
  lives: number = PLAYER_CONFIG.lives;
  levelIndex = 0;
  private checkpoint: { score: number; lives: number } = { score: 0, lives: PLAYER_CONFIG.lives };

  /** Fresh run from level one. */
  reset(): void {
    this.score = 0;
    this.lives = PLAYER_CONFIG.lives;
    this.levelIndex = 0;
    this.checkpoint = { score: 0, lives: this.lives };
  }

  /** Records the state at the start of a level so it can be restarted fairly. */
  beginLevel(index: number): void {
    this.levelIndex = index;
    this.checkpoint = { score: this.score, lives: this.lives };
  }

  /** Restart mid-level: back to how the level began. */
  restoreCheckpoint(): void {
    this.score = this.checkpoint.score;
    this.lives = this.checkpoint.lives;
  }

  /** Retry after game over: the level's starting score with a full set of lives. */
  retry(): void {
    this.score = this.checkpoint.score;
    this.lives = PLAYER_CONFIG.lives;
    this.checkpoint = { score: this.score, lives: this.lives };
  }

  addScore(points: number): void {
    this.score += points;
  }
}
