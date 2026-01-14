import { Schema, defineTypes } from '@colyseus/schema';

export class WeaponSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  type!: string;
  level!: number;
  cooldownRemaining!: number;

  constructor() {
    super();
    // Initialize values through the setters
    this.type = '';
    this.level = 1;
    this.cooldownRemaining = 0;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(WeaponSchema, {
  type: 'string',
  level: 'number',
  cooldownRemaining: 'number'
});
