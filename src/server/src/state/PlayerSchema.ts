import { Schema, ArraySchema, defineTypes } from '@colyseus/schema';
import { WeaponSchema } from './WeaponSchema';
import { GAME_CONSTANTS, WEAPON_CONFIGS, getXPForLevel, getCharacterClass, getClassStartingWeapons } from '@swarm-io/shared';

export class PlayerSchema extends Schema {
  // Don't use class field initializers - they bypass prototype getters/setters
  id!: string;
  nickname!: string; // P3.1: Player display name
  playerClass!: string; // P9.3: Character class (survivor, mage, warrior, speedster, tank)
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

  // P4.6: Trading - synchronized fields for trade UI
  pendingTradeOfferId!: string; // ID of incoming trade offer (empty if none)
  pendingTradeFromId!: string; // ID of player who sent the offer
  pendingTradeWeapon!: string; // Weapon type being offered
  pendingTradeLevel!: number; // Level of weapon being offered
  tradeCooldown!: number; // Seconds until can trade again

  // P5.2: Power-Up Buffs - synchronized for client UI
  damageBoostTime!: number; // Remaining seconds of damage boost
  speedBoostTime!: number; // Remaining seconds of speed boost
  shieldTime!: number; // Remaining seconds of shield (invuln from powerup)
  magnetBoostTime!: number; // Remaining seconds of magnet boost

  // Not synchronized - server only (can use regular initializers)
  pendingChoices: any[] = [];
  deathTime: number = 0;
  killedBy: string = '';
  outgoingTradeOfferId: string = ''; // ID of trade offer this player sent (server only)

  constructor() {
    super();
    // Initialize all synced values through the setters (with useDefineForClassFields: false)
    this.id = '';
    this.nickname = ''; // P3.1: Default empty nickname
    this.playerClass = 'survivor'; // P9.3: Default class
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

    // P4.6: Trading
    this.pendingTradeOfferId = '';
    this.pendingTradeFromId = '';
    this.pendingTradeWeapon = '';
    this.pendingTradeLevel = 0;
    this.tradeCooldown = 0;

    // P5.2: Power-Up Buffs
    this.damageBoostTime = 0;
    this.speedBoostTime = 0;
    this.shieldTime = 0;
    this.magnetBoostTime = 0;
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

  /**
   * P4.6: Remove a weapon from the player's inventory
   * Returns the level of the removed weapon, or 0 if weapon wasn't found
   */
  removeWeapon(type: string): number {
    const weaponIndex = this.weapons.findIndex(w => w.type === type);
    if (weaponIndex === -1) {
      return 0;
    }
    const weapon = this.weapons[weaponIndex];
    if (!weapon) {
      return 0;
    }
    const level = weapon.level;
    this.weapons.splice(weaponIndex, 1);
    return level;
  }

  /**
   * P4.6: Add a weapon at a specific level (used for trading)
   */
  addWeaponAtLevel(type: string, level: number): void {
    const config = WEAPON_CONFIGS[type];
    if (!config) return;

    // If player already has this weapon, upgrade it instead of adding duplicate
    if (this.hasWeapon(type)) {
      const weapon = this.weapons.find(w => w.type === type)!;
      // Take the higher level of the two
      weapon.level = Math.max(weapon.level, level);
      return;
    }

    const weapon = new WeaponSchema();
    weapon.type = type;
    weapon.level = level;
    weapon.cooldownRemaining = 0;
    this.weapons.push(weapon);
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
    if (this.dead || this.invulnerableTime > 0 || this.hasShield) return;

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

    // P9.3: Apply class-specific stat multipliers
    const classConfig = getCharacterClass(this.playerClass);

    // Reset all stats to initial values with class multipliers
    this.maxHealth = Math.round(GAME_CONSTANTS.PLAYER_START_HEALTH * classConfig.healthMultiplier);
    this.health = this.maxHealth;
    this.speed = GAME_CONSTANTS.PLAYER_BASE_SPEED * classConfig.speedMultiplier;
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

    // Clear any pending trade state (P4.6)
    this.pendingTradeOfferId = '';
    this.pendingTradeFromId = '';
    this.pendingTradeWeapon = '';
    this.pendingTradeLevel = 0;
    this.tradeCooldown = 0;
    this.outgoingTradeOfferId = '';

    // Clear power-up buffs (P5.2)
    this.damageBoostTime = 0;
    this.speedBoostTime = 0;
    this.shieldTime = 0;
    this.magnetBoostTime = 0;

    this.weapons.clear();
    // P9.3: Get class-specific starting weapons (or random for survivor)
    const startingWeapons = getClassStartingWeapons(this.playerClass);
    for (const weapon of startingWeapons) {
      this.addWeapon(weapon);
    }
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

  /**
   * P5.2: Check if player has damage boost active
   */
  get hasDamageBoost(): boolean {
    return this.damageBoostTime > 0;
  }

  /**
   * P5.2: Check if player has speed boost active
   */
  get hasSpeedBoost(): boolean {
    return this.speedBoostTime > 0;
  }

  /**
   * P5.2: Check if player has shield active (invulnerable from power-up)
   */
  get hasShield(): boolean {
    return this.shieldTime > 0;
  }

  /**
   * P5.2: Check if player has magnet boost active
   */
  get hasMagnetBoost(): boolean {
    return this.magnetBoostTime > 0;
  }
}

// Use defineTypes for esbuild/tsx compatibility (decorators don't work properly)
// Note: useDefineForClassFields: false in tsconfig is required for this to work
defineTypes(PlayerSchema, {
  id: 'string',
  nickname: 'string', // P3.1: Synced player nickname
  playerClass: 'string', // P9.3: Synced player class
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
  revivalCooldown: 'number',
  // P4.6: Trading
  pendingTradeOfferId: 'string',
  pendingTradeFromId: 'string',
  pendingTradeWeapon: 'string',
  pendingTradeLevel: 'number',
  tradeCooldown: 'number',
  // P5.2: Power-Up Buffs
  damageBoostTime: 'number',
  speedBoostTime: 'number',
  shieldTime: 'number',
  magnetBoostTime: 'number'
});
