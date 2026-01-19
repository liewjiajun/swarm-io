import { Schema, defineTypes } from '@colyseus/schema';

export class WeaponSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  type!: string;
  level!: number;
  cooldownRemaining!: number;
  // P9.4: Weapon Evolution System
  evolved!: boolean;           // Whether weapon has evolved
  evolvedType!: string;        // The evolved weapon type (e.g., 'thousand_cuts')

  constructor() {
    super();
    // Initialize values through the setters
    this.type = '';
    this.level = 1;
    this.cooldownRemaining = 0;
    this.evolved = false;
    this.evolvedType = '';
  }

  /**
   * P9.4: Evolve this weapon to its evolved form
   * @param evolvedType The evolved weapon type string
   */
  evolve(evolvedType: string): void {
    this.evolved = true;
    this.evolvedType = evolvedType;
  }

  /**
   * Check if this weapon has evolved
   */
  isEvolved(): boolean {
    return this.evolved;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
defineTypes(WeaponSchema, {
  type: 'string',
  level: 'number',
  cooldownRemaining: 'number',
  evolved: 'boolean',
  evolvedType: 'string'
});
