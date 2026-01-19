import { Schema, defineTypes } from '@colyseus/schema';

export class XPOrbSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  x!: number;
  y!: number;
  size!: string; // 'small' | 'medium' | 'large' | 'jackpot'
  value!: number;
  magnetized!: boolean;
  targetPlayerId!: string;
  isJackpot!: boolean; // P5.5: Whether this is a jackpot orb

  // Not synced - can use regular initializer
  collected: boolean = false;

  constructor() {
    super();
    // Initialize values through the setters
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.size = 'small';
    this.value = 1;
    this.magnetized = false;
    this.targetPlayerId = '';
    this.isJackpot = false;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(XPOrbSchema, {
  id: 'string',
  x: 'number',
  y: 'number',
  size: 'string',
  value: 'number',
  magnetized: 'boolean',
  targetPlayerId: 'string',
  isJackpot: 'boolean'
});
