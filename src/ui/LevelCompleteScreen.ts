import type { Game } from '../game/Game';
import { ENEMY_KINDS, SCORE_CONFIG, SCREEN_WIDTH } from '../game/GameConfig';
import type { Screen } from '../game/GameState';
import type { InputState } from '../input/InputManager';
import { PALETTE } from '../rendering/palette';
import type { Renderer } from '../rendering/Renderer';
import { formatScore, pointsForEnemy } from '../systems/ScoreSystem';
import { drawBattleScene } from './BattleScene';

const CENTER = SCREEN_WIDTH / 2;
const REVEAL_START = 0.5;
const REVEAL_STEP = 0.22;

interface TallyLine {
  readonly label: string;
  readonly points: number;
  readonly color: string;
}

/** End-of-level tally: kills by type, then the completion bonuses, revealed line by line. */
export class LevelCompleteScreen implements Screen {
  private time = 0;
  private revealed = 0;
  private lines: TallyLine[] = [];

  constructor(private readonly game: Game) {}

  enter(): void {
    this.time = 0;
    this.revealed = 0;
    const battle = this.game.battle;
    const line = (label: string, count: number, each: number) => ({
      label: `${label.padEnd(6)} X${String(count).padStart(2)}`,
      points: count * each,
      color: PALETTE.silver,
    });
    const kills = ENEMY_KINDS.map((kind) => line(kind.toUpperCase(), battle?.kills[kind] ?? 0, pointsForEnemy(kind)));
    const crews = line('CREW', battle?.crewKills ?? 0, SCORE_CONFIG.crewKill);
    const wrecks = line('WRECKS', battle?.wrecksDestroyed ?? 0, SCORE_CONFIG.wreck);
    const bonus = this.game.lastBonus.map((entry) => ({ ...entry, color: PALETTE.goldLight }));
    this.lines = [...kills, crews, wrecks, ...bonus];
    this.game.audio.setMusic(null);
    this.game.audio.play('levelComplete');
  }

  update(dt: number, input: InputState): void {
    this.time += dt;
    this.game.effects.update(dt);
    const due = Math.min(this.lines.length, Math.max(0, Math.floor((this.time - REVEAL_START) / REVEAL_STEP)));
    if (due > this.revealed) {
      this.revealed = due;
      this.game.audio.play('tally');
    }
    const proceed = input.wasPressed('confirm') || input.wasPressed('fire') || input.pointer.clicked;
    if (!proceed || this.time < REVEAL_START) return;
    if (this.revealed < this.lines.length) {
      this.revealed = this.lines.length;
      this.time = REVEAL_START + this.lines.length * REVEAL_STEP;
    } else {
      this.game.audio.play('menuSelect');
      this.game.continueCampaign();
    }
  }

  render(r: Renderer): void {
    const battle = this.game.battle;
    if (battle) drawBattleScene(r, this.game, battle);
    r.dim(0.6);
    const top = 34;
    const rowsEnd = top + 34 + this.lines.length * 10;
    r.panel(CENTER - 90, top, 180, rowsEnd - top + 44);
    r.text(`LEVEL ${this.game.session.levelIndex + 1} COMPLETE`, CENTER, top + 10, { color: PALETTE.gold, align: 'center', shadow: PALETTE.redDark });
    r.text(battle?.level.name ?? '', CENTER, top + 21, { color: PALETTE.gray, align: 'center' });

    this.lines.slice(0, this.revealed).forEach((entry, i) => {
      const y = top + 34 + i * 10;
      r.text(entry.label, CENTER - 72, y, { color: entry.color });
      r.text(`+${entry.points}`, CENTER + 72, y, { color: entry.color, align: 'right' });
    });

    const done = this.revealed >= this.lines.length;
    if (done) {
      r.rect(CENTER - 72, rowsEnd + 2, 144, 1, PALETTE.goldDark);
      r.text('SCORE', CENTER - 72, rowsEnd + 8, { color: PALETTE.white });
      r.text(formatScore(this.game.session.score), CENTER + 72, rowsEnd + 8, { color: PALETTE.goldLight, align: 'right' });
      if (Math.floor(this.time * 2.5) % 2 === 0) {
        const next = this.game.levels.isLast(this.game.session.levelIndex) ? 'ENTER - FINISH' : 'ENTER - NEXT LEVEL';
        r.text(next, CENTER, rowsEnd + 24, { color: PALETTE.white, align: 'center' });
      }
    }
  }
}
