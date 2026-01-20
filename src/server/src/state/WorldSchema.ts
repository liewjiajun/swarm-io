import { Schema, defineTypes } from '@colyseus/schema';
import { GAME_CONSTANTS } from '@swarm-io/shared';

export class WorldSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  worldRadius!: number;
  playerCount!: number;
  gameTime!: number;
  currentWave!: number;
  difficulty!: number;
  // P5.7: Day/Night Cycle
  dayNightPhase!: string; // 'day' or 'night'
  dayNightCycleTime!: number; // Time within current cycle (0-120 seconds)

  constructor() {
    super();
    // Initialize values through the setters (with useDefineForClassFields: false)
    this.worldRadius = GAME_CONSTANTS.BASE_WORLD_RADIUS;
    this.playerCount = 0;
    this.gameTime = 0;
    this.currentWave = 0;
    this.difficulty = 1;
    // P5.7: Start in day phase
    this.dayNightPhase = 'day';
    this.dayNightCycleTime = 0;
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

  /**
   * P5.7: Update day/night cycle based on game time
   * 2-minute cycle: 0-60s = day, 60-120s = night
   */
  updateDayNightCycle() {
    // Calculate position within current cycle
    this.dayNightCycleTime = this.gameTime % GAME_CONSTANTS.DAY_NIGHT_CYCLE_DURATION;

    // Determine phase: first half is day, second half is night
    const previousPhase = this.dayNightPhase;
    this.dayNightPhase = this.dayNightCycleTime < GAME_CONSTANTS.DAY_DURATION ? 'day' : 'night';

    // Return whether phase changed (useful for announcements)
    return previousPhase !== this.dayNightPhase;
  }

  /**
   * P5.7: Check if currently daytime
   */
  isDaytime(): boolean {
    return this.dayNightPhase === 'day';
  }

  /**
   * P5.7: Check if currently nighttime
   */
  isNighttime(): boolean {
    return this.dayNightPhase === 'night';
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(WorldSchema, {
  worldRadius: 'number',
  playerCount: 'number',
  gameTime: 'number',
  currentWave: 'number',
  difficulty: 'number',
  // P5.7: Day/Night Cycle
  dayNightPhase: 'string',
  dayNightCycleTime: 'number'
});
