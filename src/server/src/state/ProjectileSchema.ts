import { Schema, defineTypes } from '@colyseus/schema';

export class ProjectileSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  type!: string;
  ownerId!: string;
  x!: number;
  y!: number;
  velocityX!: number;
  velocityY!: number;
  damage!: number;
  lifetime!: number;
  radius!: number;
  piercing!: number;

  // Track hit enemies (not synced - can use regular initializer)
  hitEnemies: Set<string> = new Set();

  constructor() {
    super();
    // Initialize values through the setters
    this.id = '';
    this.type = '';
    this.ownerId = '';
    this.x = 0;
    this.y = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.damage = 0;
    this.lifetime = 0;
    this.radius = 0.5;
    this.piercing = 0;
  }

  canHit(enemyId: string): boolean {
    if (this.hitEnemies.has(enemyId)) return false;
    if (this.piercing > 0 && this.hitEnemies.size >= this.piercing) return false;
    return true;
  }

  recordHit(enemyId: string) {
    this.hitEnemies.add(enemyId);
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(ProjectileSchema, {
  id: 'string',
  type: 'string',
  ownerId: 'string',
  x: 'number',
  y: 'number',
  velocityX: 'number',
  velocityY: 'number',
  damage: 'number',
  lifetime: 'number',
  radius: 'number',
  piercing: 'number'
});
