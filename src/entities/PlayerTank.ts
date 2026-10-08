import { PLAYER_CONFIG } from '../game/GameConfig';
import { Tank } from './Tank';

export class PlayerTank extends Tank {
  constructor(x: number, y: number) {
    super('player', x, y, 'up', PLAYER_CONFIG);
  }
}
