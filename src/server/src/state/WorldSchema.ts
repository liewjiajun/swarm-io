import { Schema, type } from '@colyseus/schema';
import { GAME_CONSTANTS } from '@swarm-io/shared';

export class WorldSchema extends Schema {
  @type('number') worldRadius: number = GAME_CONSTANTS.BASE_WORLD_RADIUS;
  @type('number') playerCount: number = 0;
  @type('number') gameTime: number = 0;
  @type('number') currentWave: number = 0;
  @type('number') difficulty: number = 1;

  recalculateSize(playerCount: number) {
    this.playerCount = playerCount;
    this.worldRadius = GAME_CONSTANTS.BASE_WORLD_RADIUS +
                       (playerCount * GAME_CONSTANTS.RADIUS_PER_PLAYER);
  }

  updateDifficulty() {
    // Difficulty increases over time
    this.difficulty = 1 + (this.gameTime / 300) * 0.5; // +50% every 5 minutes
  }
}