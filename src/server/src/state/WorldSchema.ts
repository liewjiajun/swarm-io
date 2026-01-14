import { Schema, defineTypes } from '@colyseus/schema';
import { GAME_CONSTANTS } from '@swarm-io/shared';

export class WorldSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  worldRadius!: number;
  playerCount!: number;
  gameTime!: number;
  currentWave!: number;
  difficulty!: number;

  constructor() {
    super();
    // Initialize values through the setters (with useDefineForClassFields: false)
    this.worldRadius = GAME_CONSTANTS.BASE_WORLD_RADIUS;
    this.playerCount = 0;
    this.gameTime = 0;
    this.currentWave = 0;
    this.difficulty = 1;
  }

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

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(WorldSchema, {
  worldRadius: 'number',
  playerCount: 'number',
  gameTime: 'number',
  currentWave: 'number',
  difficulty: 'number'
});
