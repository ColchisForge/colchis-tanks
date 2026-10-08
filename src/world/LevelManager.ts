import { parseLevel, type LevelDefinition, type ParsedLevel } from './Level';
import { LEVELS } from './levels';

export class LevelManager {
  private readonly levels: readonly ParsedLevel[];

  constructor(definitions: readonly LevelDefinition[] = LEVELS) {
    this.levels = definitions.map(parseLevel);
  }

  get count(): number {
    return this.levels.length;
  }

  get(index: number): ParsedLevel {
    const level = this.levels[index];
    if (!level) throw new Error(`No level at index ${index}`);
    return level;
  }

  isLast(index: number): boolean {
    return index >= this.levels.length - 1;
  }
}
