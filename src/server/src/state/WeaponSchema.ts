import { Schema, type } from '@colyseus/schema';

export class WeaponSchema extends Schema {
  @type('string') type: string = '';
  @type('number') level: number = 1;
  @type('number') cooldownRemaining: number = 0;
}