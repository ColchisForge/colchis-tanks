import { ENEMY_PROFILES, SCORE_CONFIG, type EnemyKind } from '../game/GameConfig';
import type { Session } from '../game/Session';

export interface BonusLine {
  readonly label: string;
  readonly points: number;
}

export function pointsForEnemy(kind: EnemyKind): number {
  return ENEMY_PROFILES[kind].points;
}

export function awardEnemyKill(session: Session, kind: EnemyKind): number {
  const points = pointsForEnemy(kind);
  session.addScore(points);
  return points;
}

/** End-of-level bonuses. Reaching this point means the base survived. */
export function levelCompletionBonus(livesRemaining: number, enemyHqDestroyed = false): BonusLine[] {
  const lines: BonusLine[] = [
    { label: 'LEVEL CLEAR', points: SCORE_CONFIG.levelClear },
    { label: 'BASE INTACT', points: SCORE_CONFIG.baseIntact },
  ];
  if (enemyHqDestroyed) lines.push({ label: 'ENEMY HQ', points: SCORE_CONFIG.enemyHq });
  lines.push({ label: `LIVES X${livesRemaining}`, points: SCORE_CONFIG.perLife * livesRemaining });
  return lines;
}

export function applyBonus(session: Session, lines: readonly BonusLine[]): number {
  const total = lines.reduce((sum, line) => sum + line.points, 0);
  session.addScore(total);
  return total;
}

export function formatScore(score: number, digits = 6): string {
  return Math.max(0, Math.floor(score)).toString().padStart(digits, '0');
}
