import { Schema, defineTypes } from '@colyseus/schema';

/**
 * P5.2: Power-Up Schema
 * Represents a hidden power-up that spawns rarely in random locations.
 * Players can collect these for temporary or instant effects.
 *
 * Power-Up Types:
 * - health_restore: Instantly restores a portion of health
 * - damage_boost: Temporarily increases damage dealt
 * - speed_boost: Temporarily increases movement speed
 * - shield: Grants temporary invulnerability
 * - magnet_boost: Temporarily increases XP magnet range
 */
export class PowerUpSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  type!: string; // 'health_restore' | 'damage_boost' | 'speed_boost' | 'shield' | 'magnet_boost'
  x!: number;
  y!: number;
  spawnTime!: number; // Game time when spawned
  lifetime!: number; // How long it stays in the world (seconds)

  // Not synced - server-only state
  collected: boolean = false;

  constructor() {
    super();
    // Initialize values through the setters
    this.id = '';
    this.type = '';
    this.x = 0;
    this.y = 0;
    this.spawnTime = 0;
    this.lifetime = 60; // Default 60 seconds before despawning
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(PowerUpSchema, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  spawnTime: 'number',
  lifetime: 'number'
});
