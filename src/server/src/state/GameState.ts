import { Schema, MapSchema, type, filterChildren } from '@colyseus/schema';
import { Client } from '@colyseus/core';
import { PlayerSchema } from './PlayerSchema';
import { EnemySchema } from './EnemySchema';
import { ProjectileSchema } from './ProjectileSchema';
import { XPOrbSchema } from './XPOrbSchema';
import { WorldSchema } from './WorldSchema';
import { generateId } from '@swarm-io/shared';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import { ObjectPool, resetProjectile, resetEnemy, resetXPOrb } from '../systems/ObjectPool';

// Pre-calculate squared interest radius for efficient distance checks
const INTEREST_RADIUS_SQ = GAME_CONSTANTS.INTEREST_RADIUS * GAME_CONSTANTS.INTEREST_RADIUS;

/**
 * Filter function for enemies - only sync enemies within player's interest radius.
 * This reduces network bandwidth by ~60-80% in games with many enemies spread across the world.
 */
function filterEnemiesByDistance(
  client: Client,
  _key: string,
  value: EnemySchema,
  root: GameState
): boolean {
  const player = root.players.get(client.sessionId);
  if (!player) return true; // Show all if player not found (fallback for edge cases)
  if (player.dead) return true; // Show all when dead (spectating)

  const dx = value.x - player.x;
  const dy = value.y - player.y;
  const distSq = dx * dx + dy * dy;

  return distSq <= INTEREST_RADIUS_SQ;
}

/**
 * Filter function for projectiles - only sync projectiles within player's interest radius.
 * Projectiles move fast so we use a slightly larger radius to prevent pop-in.
 */
function filterProjectilesByDistance(
  client: Client,
  _key: string,
  value: ProjectileSchema,
  root: GameState
): boolean {
  const player = root.players.get(client.sessionId);
  if (!player) return true;
  if (player.dead) return true;

  const dx = value.x - player.x;
  const dy = value.y - player.y;
  const distSq = dx * dx + dy * dy;

  // Use larger radius for projectiles to prevent pop-in due to fast movement
  const projectileRadiusSq = INTEREST_RADIUS_SQ * 1.44; // 1.2x radius squared

  return distSq <= projectileRadiusSq;
}

/**
 * Filter function for XP orbs - only sync orbs within player's interest radius.
 * Static orbs re-evaluate when magnetized (position updates) or when player approaches.
 */
function filterXPOrbsByDistance(
  client: Client,
  _key: string,
  value: XPOrbSchema,
  root: GameState
): boolean {
  const player = root.players.get(client.sessionId);
  if (!player) return true;
  if (player.dead) return true;

  const dx = value.x - player.x;
  const dy = value.y - player.y;
  const distSq = dx * dx + dy * dy;

  return distSq <= INTEREST_RADIUS_SQ;
}

export class GameState extends Schema {
  // Players are always fully synced - everyone needs to see all players
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();

  // Enemies are filtered by distance - only sync enemies within player's view
  @filterChildren(filterEnemiesByDistance)
  @type({ map: EnemySchema })
  enemies = new MapSchema<EnemySchema>();

  // Projectiles are filtered by distance with extended radius for fast movement
  @filterChildren(filterProjectilesByDistance)
  @type({ map: ProjectileSchema })
  projectiles = new MapSchema<ProjectileSchema>();

  // XP orbs are filtered by distance
  @filterChildren(filterXPOrbsByDistance)
  @type({ map: XPOrbSchema })
  xpOrbs = new MapSchema<XPOrbSchema>();

  // World state is always fully synced
  @type(WorldSchema)
  world = new WorldSchema();

  // Object pools for reducing GC pressure (not synced)
  // Pre-allocate commonly created/destroyed entities
  private projectilePool = new ObjectPool<ProjectileSchema>(
    () => new ProjectileSchema(),
    500,   // Initial size: pre-allocate 500 projectiles
    2000,  // Max size: cap at 2000 to prevent memory bloat
    resetProjectile as (obj: ProjectileSchema) => void
  );

  private enemyPool = new ObjectPool<EnemySchema>(
    () => new EnemySchema(),
    200,   // Initial size: pre-allocate 200 enemies
    1000,  // Max size: cap at 1000 to prevent memory bloat
    resetEnemy as (obj: EnemySchema) => void
  );

  private xpOrbPool = new ObjectPool<XPOrbSchema>(
    () => new XPOrbSchema(),
    500,   // Initial size: pre-allocate 500 XP orbs
    3000,  // Max size: cap at 3000 (enemies drop many orbs)
    resetXPOrb as (obj: XPOrbSchema) => void
  );

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
    const enemy = this.enemyPool.acquire();
    enemy.id = id;
    enemy.type = type;
    enemy.x = x;
    enemy.y = y;

    this.enemies.set(id, enemy);
    return enemy;
  }

  /**
   * Remove an enemy and return it to the pool for reuse.
   */
  removeEnemy(id: string): void {
    const enemy = this.enemies.get(id);
    if (enemy) {
      this.enemies.delete(id);
      this.enemyPool.release(enemy);
    }
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
    const projectile = this.projectilePool.acquire();
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

  /**
   * Remove a projectile and return it to the pool for reuse.
   */
  removeProjectile(id: string): void {
    const projectile = this.projectiles.get(id);
    if (projectile) {
      this.projectiles.delete(id);
      this.projectilePool.release(projectile);
    }
  }

  addXPOrb(x: number, y: number, value: number): XPOrbSchema {
    const id = generateId();
    const orb = this.xpOrbPool.acquire();
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

  /**
   * Remove an XP orb and return it to the pool for reuse.
   */
  removeXPOrb(id: string): void {
    const orb = this.xpOrbs.get(id);
    if (orb) {
      this.xpOrbs.delete(id);
      this.xpOrbPool.release(orb);
    }
  }

  /**
   * Get pool statistics for debugging/monitoring.
   */
  getPoolStats(): { projectiles: number; enemies: number; xpOrbs: number } {
    return {
      projectiles: this.projectilePool.available,
      enemies: this.enemyPool.available,
      xpOrbs: this.xpOrbPool.available
    };
  }
}

// Re-export schema classes for use in systems
export { PlayerSchema } from './PlayerSchema';
export { EnemySchema } from './EnemySchema';
export { ProjectileSchema } from './ProjectileSchema';
export { XPOrbSchema } from './XPOrbSchema';
export { WeaponSchema } from './WeaponSchema';
export { WorldSchema } from './WorldSchema';