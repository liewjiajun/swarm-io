import { Schema, ArraySchema, defineTypes } from '@colyseus/schema';
import { WeaponSchema } from './WeaponSchema';
import { GAME_CONSTANTS, WEAPON_CONFIGS, getXPForLevel } from '@swarm-io/shared';

export class PlayerSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  nickname!: string; // P3.1: Player display name
  x!: number;
  y!: number;
  health!: number;
  maxHealth!: number;
  level!: number;
  xp!: number;
  xpToNextLevel!: number;
  speed!: number;
  facingX!: number;
  facingY!: number;
  kills!: number;
  timeAlive!: number;
  hostility!: number;
  invulnerableTime!: number;
  dead!: boolean;
  pendingUpgrade!: boolean;
  armor!: number;
  magnetRange!: number;
  lastProcessedSequence!: number; // For client-side prediction reconciliation
  weapons!: ArraySchema<WeaponSchema>;

  // P4.2: Revival Mechanic - synchronized fields for revival UI
  revivalProgress!: number; // 0-1 progress of being revived
  revivingPlayerId!: string; // ID of player currently reviving this one
  revivalCooldown!: number; // Seconds until can be revived again

  // Not synchronized - server only (can use regular initializers)
  pendingChoices: any[] = [];
  deathTime: number = 0;
  killedBy: string = '';

  constructor() {
    super();
    // Initialize all synced values through the setters (with useDefineForClassFields: false)
    this.id = '';
    this.nickname = ''; // P3.1: Default empty nickname
    this.x = 0;
    this.y = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = 5;
    this.speed = 5;
    this.facingX = 1;
    this.facingY = 0;
    this.kills = 0;
    this.timeAlive = 0;
    this.hostility = 0;
    this.invulnerableTime = 0;
    this.dead = false;
    this.pendingUpgrade = false;
    this.armor = 0;
    this.magnetRange = GAME_CONSTANTS.XP_MAGNET_RADIUS;
    this.lastProcessedSequence = 0;
    this.weapons = new ArraySchema<WeaponSchema>();

    // P4.2: Revival Mechanic
    this.revivalProgress = 0;
    this.revivingPlayerId = '';
    this.revivalCooldown = 0;
  }

  addWeapon(type: string) {
    const config = WEAPON_CONFIGS[type];
    if (!config) return;

    const weapon = new WeaponSchema();
    weapon.type = type;
    weapon.level = 1;
    weapon.cooldownRemaining = 0;
    this.weapons.push(weapon);
  }

  upgradeWeapon(type: string) {
    const weapon = this.weapons.find(w => w.type === type);
    if (weapon) {
      weapon.level++;
    }
  }

  hasWeapon(type: string): boolean {
    return this.weapons.some(w => w.type === type);
  }

  getWeaponLevel(type: string): number {
    const weapon = this.weapons.find(w => w.type === type);
    return weapon ? weapon.level : 0;
  }

  addXP(amount: number) {
    // Apply hostility penalty
    if (this.hostility > GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD) {
      amount = Math.floor(amount * 0.5);
    }

    this.xp += amount;
    // Note: Level-up logic is handled by XPSystem.processLevelUps() to ensure
    // pendingChoices are generated properly. Don't handle level-ups here.
  }

  takeDamage(amount: number, sourceId: string, isPvP: boolean = false) {
    if (this.dead || this.invulnerableTime > 0) return;

    // Apply PvP damage reduction
    if (isPvP) {
      amount *= GAME_CONSTANTS.PVP_DAMAGE_MULTIPLIER;
    }

    // Apply armor
    amount = Math.max(1, amount - this.armor);

    this.health -= amount;

    if (this.health <= 0) {
      this.die(sourceId);
    }
  }

  die(killedBy: string) {
    this.dead = true;
    this.health = 0;
    this.killedBy = killedBy;
    this.deathTime = Date.now();
  }

  respawn(x: number, y: number) {
    this.dead = false;
    this.x = x;
    this.y = y;
    this.invulnerableTime = GAME_CONSTANTS.PLAYER_INVULN_TIME;
    this.killedBy = '';

    // Reset all stats to initial values
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.speed = 5;
    this.armor = 0;
    this.magnetRange = GAME_CONSTANTS.XP_MAGNET_RADIUS;

    // Reset to level 1 with starting weapon only
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = getXPForLevel(1);
    this.kills = 0;
    this.timeAlive = 0;
    this.hostility = 0;

    // Clear any pending upgrade state
    this.pendingUpgrade = false;
    this.pendingChoices = [];

    this.weapons.clear();
    this.addWeapon('knife');
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTime > 0;
  }

  /**
   * P4.2: Revive a dead player at their current position
   * Unlike respawn, revival keeps the player's level, weapons, and progress
   */
  revive(): void {
    if (!this.dead) return;

    this.dead = false;
    this.health = Math.floor(this.maxHealth * 0.5); // Revive with 50% health
    this.invulnerableTime = GAME_CONSTANTS.PLAYER_INVULN_TIME;
    this.killedBy = '';
    this.revivalProgress = 0;
    this.revivingPlayerId = '';
    this.revivalCooldown = GAME_CONSTANTS.REVIVAL_COOLDOWN;
    // Note: Keep level, weapons, xp, kills, timeAlive, etc.
  }

  /**
   * P4.2: Check if this player can be revived
   */
  get canBeRevived(): boolean {
    return this.dead && this.revivalCooldown <= 0;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
// Note: useDefineForClassFields: false in tsconfig is required for this to work
defineTypes(PlayerSchema, {
  id: 'string',
  nickname: 'string', // P3.1: Synced player nickname
  x: 'number',
  y: 'number',
  health: 'number',
  maxHealth: 'number',
  level: 'number',
  xp: 'number',
  xpToNextLevel: 'number',
  speed: 'number',
  facingX: 'number',
  facingY: 'number',
  kills: 'number',
  timeAlive: 'number',
  hostility: 'number',
  invulnerableTime: 'number',
  dead: 'boolean',
  pendingUpgrade: 'boolean',
  armor: 'number',
  magnetRange: 'number',
  lastProcessedSequence: 'number',
  weapons: [WeaponSchema],
  // P4.2: Revival Mechanic
  revivalProgress: 'number',
  revivingPlayerId: 'string',
  revivalCooldown: 'number'
});
