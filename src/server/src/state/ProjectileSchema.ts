import { Schema, ArraySchema, type } from '@colyseus/schema';

export class ProjectileSchema extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('string') ownerId: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') velocityX: number = 0;
  @type('number') velocityY: number = 0;
  @type('number') damage: number = 0;
  @type('number') lifetime: number = 0;
  @type('number') radius: number = 0.5;
  @type('number') piercing: number = 0;

  // Track hit enemies (not synced)
  hitEnemies: Set<string> = new Set();

  canHit(enemyId: string): boolean {
    if (this.hitEnemies.has(enemyId)) return false;
    if (this.piercing > 0 && this.hitEnemies.size >= this.piercing) return false;
    return true;
  }

  recordHit(enemyId: string) {
    this.hitEnemies.add(enemyId);
  }
}