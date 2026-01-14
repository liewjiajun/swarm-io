import { Schema, defineTypes } from '@colyseus/schema';
import { ENEMY_CONFIGS } from '@swarm-io/shared';

export class EnemySchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  type!: string;
  x!: number;
  y!: number;
  health!: number;
  maxHealth!: number;
  velocityX!: number;
  velocityY!: number;
  targetPlayerId!: string;

  // Cached config values (not synced, derived from type) - can use regular initializers
  private _speed: number = 0;
  private _damage: number = 0;
  private _xpValue: number = 0;
  private _size: number = 0;

  // Attack cooldown tracking (not synced, server-only)
  attackCooldown: number = 0;

  // Boss ability cooldown and state tracking (not synced, server-only)
  abilityCooldown: number = 0;
  isCharging: boolean = false;
  chargeTargetX: number = 0;
  chargeTargetY: number = 0;

  constructor() {
    super();
    // Initialize synced values through the setters
    this.id = '';
    this.type = '';
    this.x = 0;
    this.y = 0;
    this.health = 10;
    this.maxHealth = 10;
    this.velocityX = 0;
    this.velocityY = 0;
    this.targetPlayerId = '';
  }

  initialize(type: string, difficulty: number = 1) {
    const config = ENEMY_CONFIGS[type];
    if (!config) return;

    this.type = type;
    this.health = Math.floor(config.health * difficulty);
    this.maxHealth = this.health;
    this._speed = config.speed;
    this._damage = Math.floor(config.damage * difficulty);
    this._xpValue = config.xpValue;
    this._size = config.size;
  }

  get speed(): number {
    if (this._speed === 0) {
      const config = ENEMY_CONFIGS[this.type];
      this._speed = config?.speed || 2;
    }
    return this._speed;
  }

  get damage(): number {
    if (this._damage === 0) {
      const config = ENEMY_CONFIGS[this.type];
      this._damage = config?.damage || 5;
    }
    return this._damage;
  }

  get xpValue(): number {
    if (this._xpValue === 0) {
      const config = ENEMY_CONFIGS[this.type];
      this._xpValue = config?.xpValue || 1;
    }
    return this._xpValue;
  }

  get size(): number {
    if (this._size === 0) {
      const config = ENEMY_CONFIGS[this.type];
      this._size = config?.size || 0.5;
    }
    return this._size;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(EnemySchema, {
  id: 'string',
  type: 'string',
  x: 'number',
  y: 'number',
  health: 'number',
  maxHealth: 'number',
  velocityX: 'number',
  velocityY: 'number',
  targetPlayerId: 'string'
});
