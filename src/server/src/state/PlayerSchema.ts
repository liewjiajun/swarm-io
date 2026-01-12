import { Schema, ArraySchema, type } from '@colyseus/schema';
import { WeaponSchema } from './WeaponSchema';
import { GAME_CONSTANTS, WEAPON_CONFIGS, getXPForLevel } from '@swarm-io/shared';

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') health: number = 100;
  @type('number') maxHealth: number = 100;
  @type('number') level: number = 1;
  @type('number') xp: number = 0;
  @type('number') xpToNextLevel: number = 5;
  @type('number') speed: number = 5;
  @type('number') facingX: number = 1;
  @type('number') facingY: number = 0;
  @type('number') kills: number = 0;
  @type('number') timeAlive: number = 0;
  @type('number') hostility: number = 0;
  @type('number') invulnerableTime: number = 0;
  @type('boolean') dead: boolean = false;
  @type('boolean') pendingUpgrade: boolean = false;
  @type('number') armor: number = 0;
  @type('number') magnetRange: number = GAME_CONSTANTS.XP_MAGNET_RADIUS;

  @type([WeaponSchema])
  weapons = new ArraySchema<WeaponSchema>();

  // Not synchronized - server only
  pendingChoices: any[] = [];
  deathTime: number = 0;
  killedBy: string = '';

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

    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.xpToNextLevel = getXPForLevel(this.level);
      this.pendingUpgrade = true;
    }
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
    this.health = this.maxHealth;
    this.invulnerableTime = GAME_CONSTANTS.PLAYER_INVULN_TIME;
    this.killedBy = '';

    // Reset to level 1 with starting weapon only
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = getXPForLevel(1);
    this.kills = 0;
    this.timeAlive = 0;
    this.hostility = 0;

    this.weapons.clear();
    this.addWeapon('knife');
  }

  get isInvulnerable(): boolean {
    return this.invulnerableTime > 0;
  }
}