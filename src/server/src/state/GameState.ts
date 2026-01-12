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

// Re-export schema classes for use in systems
export { PlayerSchema } from './PlayerSchema';
export { EnemySchema } from './EnemySchema';
export { ProjectileSchema } from './ProjectileSchema';
export { XPOrbSchema } from './XPOrbSchema';
export { WeaponSchema } from './WeaponSchema';
export { WorldSchema } from './WorldSchema';