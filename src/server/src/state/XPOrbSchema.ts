import { Schema, type } from '@colyseus/schema';

export class XPOrbSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('string') size: string = 'small'; // 'small' | 'medium' | 'large'
  @type('number') value: number = 1;
  @type('boolean') magnetized: boolean = false;
  @type('string') targetPlayerId: string = '';

  // Not synced
  collected: boolean = false;
}