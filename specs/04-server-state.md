# 04 - Server State Schemas (Colyseus)

## Overview
Define Colyseus Schema classes for synchronized game state. These schemas automatically serialize and delta-compress state for network transmission.

## File: src/server/src/state/GameState.ts

```typescript
import { Schema, MapSchema, type } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema';
import { EnemySchema } from './EnemySchema';
import { ProjectileSchema } from './ProjectileSchema';
import { XPOrbSchema } from './XPOrbSchema';
import { WorldSchema } from './WorldSchema';
import { generateId } from '@swarm-io/shared';
import { GAME_CONSTANTS, WEAPON_CONFIGS } from '@swarm-io/shared';

export class GameState extends Schema {
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();

  @type({ map: EnemySchema })
  enemies = new MapSchema<EnemySchema>();

  @type({ map: ProjectileSchema })
  projectiles = new MapSchema<ProjectileSchema>();

  @type({ map: XPOrbSchema })
  xpOrbs = new MapSchema<XPOrbSchema>();

  @type(WorldSchema)
  world = new WorldSchema();

  addPlayer(id: string, x: number, y: number): PlayerSchema {
    const player = new PlayerSchema();
    player.id = id;
    player.x = x;
    player.y = y;
    player.health = GAME_CONSTANTS.PLAYER_START_HEALTH;
    player.maxHealth = GAME_CONSTANTS.PLAYER_START_HEALTH;
    player.speed = GAME_CONSTANTS.PLAYER_BASE_SPEED;
    player.invulnerableTime = GAME_CONSTANTS.PLAYER_INVULN_TIME;
    
    // Start with knife weapon
    player.addWeapon('knife');
    
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  addEnemy(type: string, x: number, y: number): EnemySchema {
    const id = generateId();
    const enemy = new EnemySchema();
    enemy.id = id;
    enemy.type = type;
    enemy.x = x;
    enemy.y = y;
    
    this.enemies.set(id, enemy);
    return enemy;
  }

  addProjectile(
    type: string,
    ownerId: string,
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    damage: number,
    lifetime: number,
    radius: number,
    piercing: number = 0
  ): ProjectileSchema {
    const id = generateId();
    const projectile = new ProjectileSchema();
    projectile.id = id;
    projectile.type = type;
    projectile.ownerId = ownerId;
    projectile.x = x;
    projectile.y = y;
    projectile.velocityX = velocityX;
    projectile.velocityY = velocityY;
    projectile.damage = damage;
    projectile.lifetime = lifetime;
    projectile.radius = radius;
    projectile.piercing = piercing;
    
    this.projectiles.set(id, projectile);
    return projectile;
  }

  addXPOrb(x: number, y: number, value: number): XPOrbSchema {
    const id = generateId();
    const orb = new XPOrbSchema();
    orb.id = id;
    orb.x = x;
    orb.y = y;
    orb.value = value;
    
    // Determine size based on value
    if (value >= 25) {
      orb.size = 'large';
    } else if (value >= 5) {
      orb.size = 'medium';
    } else {
      orb.size = 'small';
    }
    
    this.xpOrbs.set(id, orb);
    return orb;
  }
}
```

## File: src/server/src/state/PlayerSchema.ts

```typescript
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
```

## File: src/server/src/state/WeaponSchema.ts

```typescript
import { Schema, type } from '@colyseus/schema';

export class WeaponSchema extends Schema {
  @type('string') type: string = '';
  @type('number') level: number = 1;
  @type('number') cooldownRemaining: number = 0;
}
```

## File: src/server/src/state/EnemySchema.ts

```typescript
import { Schema, type } from '@colyseus/schema';
import { ENEMY_CONFIGS } from '@swarm-io/shared';

export class EnemySchema extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') health: number = 10;
  @type('number') maxHealth: number = 10;
  @type('number') velocityX: number = 0;
  @type('number') velocityY: number = 0;
  @type('string') targetPlayerId: string = '';

  // Cached config values (not synced, derived from type)
  private _speed: number = 0;
  private _damage: number = 0;
  private _xpValue: number = 0;
  private _size: number = 0;

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
```

## File: src/server/src/state/ProjectileSchema.ts

```typescript
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
```

## File: src/server/src/state/XPOrbSchema.ts

```typescript
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
```

## File: src/server/src/state/WorldSchema.ts

```typescript
import { Schema, type } from '@colyseus/schema';
import { GAME_CONSTANTS } from '@swarm-io/shared';

export class WorldSchema extends Schema {
  @type('number') worldRadius: number = GAME_CONSTANTS.BASE_WORLD_RADIUS;
  @type('number') playerCount: number = 0;
  @type('number') gameTime: number = 0;
  @type('number') currentWave: number = 0;
  @type('number') difficulty: number = 1;

  recalculateSize(playerCount: number) {
    this.playerCount = playerCount;
    this.worldRadius = GAME_CONSTANTS.BASE_WORLD_RADIUS + 
                       (playerCount * GAME_CONSTANTS.RADIUS_PER_PLAYER);
  }

  updateDifficulty() {
    // Difficulty increases over time
    this.difficulty = 1 + (this.gameTime / 300) * 0.5; // +50% every 5 minutes
  }
}
```

## Acceptance Criteria

1. All schemas compile without TypeScript errors
2. Schemas can be instantiated and properties set
3. MapSchema collections properly add/remove entities
4. Player weapons are tracked in ArraySchema
5. XP and leveling calculations work correctly
6. Damage calculations include armor and PvP reduction
7. Respawn resets player to initial state
8. Enemy stats are derived from config
9. World radius scales with player count
