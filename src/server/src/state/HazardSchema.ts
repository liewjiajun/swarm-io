import { Schema, defineTypes } from '@colyseus/schema';

/**
 * P5.4: Environmental Hazard Schema
 * Represents hazards in the world that affect player movement and health
 *
 * Hazard Types:
 * - lava: DOT damage to players standing in it
 * - ice: Slows player movement speed
 * - teleporter: Paired portals that teleport players between locations
 */
export class HazardSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  type!: string;          // 'lava' | 'ice' | 'teleporter'
  x!: number;             // Center X position
  y!: number;             // Center Y position
  radius!: number;        // Collision/effect radius
  active!: boolean;       // Whether hazard is currently active
  spawnTime!: number;     // Game time when spawned
  duration!: number;      // How long before despawning (0 = permanent)

  // Teleporter-specific
  linkedHazardId!: string; // ID of paired teleporter (empty for non-teleporters)

  // Visual state
  animationTime!: number;  // For client-side animation timing

  constructor() {
    super();
    this.id = '';
    this.type = '';
    this.x = 0;
    this.y = 0;
    this.radius = 0;
    this.active = true;
    this.spawnTime = 0;
    this.duration = 0;
    this.linkedHazardId = '';
    this.animationTime = 0;
  }
}

// Use defineTypes for esbuild/tsx compatibility
defineTypes(HazardSchema, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  radius: 'number',
  active: 'boolean',
  spawnTime: 'number',
  duration: 'number',
  linkedHazardId: 'string',
  animationTime: 'number'
});

/**
 * Reset function for object pooling
 */
export function resetHazard(hazard: HazardSchema): void {
  hazard.id = '';
  hazard.type = '';
  hazard.x = 0;
  hazard.y = 0;
  hazard.radius = 0;
  hazard.active = true;
  hazard.spawnTime = 0;
  hazard.duration = 0;
  hazard.linkedHazardId = '';
  hazard.animationTime = 0;
}
