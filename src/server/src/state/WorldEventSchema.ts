import { Schema, defineTypes } from '@colyseus/schema';

/**
 * P5.1: World Event Schema
 * Represents a random world event that affects gameplay
 */
export class WorldEventSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  type!: string;          // 'meteor_shower' | 'invasion_wave' | 'double_xp_zone'
  x!: number;             // Center X position
  y!: number;             // Center Y position
  radius!: number;        // Affected area radius
  startTime!: number;     // Game time when event started
  duration!: number;      // How long the event lasts (seconds)
  active!: boolean;       // Whether event is currently active

  // Type-specific fields
  intensity!: number;     // For meteor_shower: damage per meteor
  spawnedCount!: number;  // For invasion_wave: enemies spawned so far
  xpMultiplier!: number;  // For double_xp_zone: XP multiplier

  constructor() {
    super();
    this.id = '';
    this.type = '';
    this.x = 0;
    this.y = 0;
    this.radius = 0;
    this.startTime = 0;
    this.duration = 0;
    this.active = false;
    this.intensity = 0;
    this.spawnedCount = 0;
    this.xpMultiplier = 1;
  }
}

// Use defineTypes for esbuild/tsx compatibility
defineTypes(WorldEventSchema, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  radius: 'number',
  startTime: 'number',
  duration: 'number',
  active: 'boolean',
  intensity: 'number',
  spawnedCount: 'number',
  xpMultiplier: 'number'
});
