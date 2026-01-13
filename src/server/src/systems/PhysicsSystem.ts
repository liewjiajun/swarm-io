import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, ENEMY_ATTACK_CONFIGS } from '@swarm-io/shared';
import { direction, distance } from '@swarm-io/shared';

export class PhysicsSystem {
  constructor(private spatialHash: SpatialHash) {}

  update(state: GameState, dt: number) {
    // Update enemy movement (AI)
    state.enemies.forEach((enemy) => {
      this.updateEnemyAI(state, enemy, dt);
    });

    // Update projectile movement
    const expiredProjectiles: string[] = [];
    state.projectiles.forEach((projectile, id) => {
      projectile.x += projectile.velocityX * dt;
      projectile.y += projectile.velocityY * dt;
      projectile.lifetime -= dt;

      // Mark for cleanup if expired
      if (projectile.lifetime <= 0) {
        expiredProjectiles.push(id);
      }
    });

    // Clean up expired projectiles and return to pool
    expiredProjectiles.forEach(id => state.removeProjectile(id));

    // Update XP orb magnetization
    state.xpOrbs.forEach((orb) => {
      if (orb.magnetized && orb.targetPlayerId) {
        const player = state.players.get(orb.targetPlayerId);
        if (player && !player.dead) {
          const dir = direction({ x: orb.x, y: orb.y }, { x: player.x, y: player.y });
          orb.x += dir.x * GAME_CONSTANTS.XP_ORB_SPEED * dt;
          orb.y += dir.y * GAME_CONSTANTS.XP_ORB_SPEED * dt;
        } else {
          orb.magnetized = false;
          orb.targetPlayerId = '';
        }
      }
    });

    // World boundary enforcement
    const worldRadius = state.world.worldRadius;
    state.players.forEach((player) => {
      if (player.dead) return;

      const dist = Math.sqrt(player.x * player.x + player.y * player.y);
      if (dist > worldRadius) {
        // Push back inside
        const ratio = worldRadius / dist;
        player.x *= ratio;
        player.y *= ratio;

        // Apply edge damage
        player.health -= GAME_CONSTANTS.WORLD_EDGE_DAMAGE * dt;
        if (player.health <= 0) {
          player.die('world_edge');
        }
      }
    });
  }

  private updateEnemyAI(state: GameState, enemy: any, dt: number) {
    // Find nearest player
    const nearestPlayer = this.spatialHash.queryNearestOfType(
      enemy.x, enemy.y, 'player', 100
    );

    // Check if this enemy has ranged attack capability
    const attackConfig = ENEMY_ATTACK_CONFIGS[enemy.type];

    if (nearestPlayer) {
      enemy.targetPlayerId = nearestPlayer.id;

      const dist = distance(
        { x: enemy.x, y: enemy.y },
        { x: nearestPlayer.x, y: nearestPlayer.y }
      );

      // Handle ranged attack behavior for demons
      if (attackConfig) {
        // Decrement attack cooldown
        if (enemy.attackCooldown > 0) {
          enemy.attackCooldown -= dt;
        }

        // If within range, fire projectile and maintain distance
        if (dist <= attackConfig.range) {
          // Fire projectile when cooldown is ready
          if (enemy.attackCooldown <= 0) {
            this.fireEnemyProjectile(state, enemy, nearestPlayer, attackConfig);
            enemy.attackCooldown = attackConfig.cooldown;
          }

          // Ranged enemies try to maintain distance (stop moving if close enough)
          if (dist < attackConfig.range * 0.5) {
            // Move away from player to maintain distance
            const dir = direction(
              { x: nearestPlayer.x, y: nearestPlayer.y },
              { x: enemy.x, y: enemy.y }
            );
            enemy.velocityX = dir.x * enemy.speed * 0.5;
            enemy.velocityY = dir.y * enemy.speed * 0.5;
          } else {
            // Stay in place while attacking
            enemy.velocityX = 0;
            enemy.velocityY = 0;
          }
        } else {
          // Move toward player to get in range
          const dir = direction(
            { x: enemy.x, y: enemy.y },
            { x: nearestPlayer.x, y: nearestPlayer.y }
          );
          enemy.velocityX = dir.x * enemy.speed;
          enemy.velocityY = dir.y * enemy.speed;
        }
      } else {
        // Standard melee AI - move toward player
        const dir = direction(
          { x: enemy.x, y: enemy.y },
          { x: nearestPlayer.x, y: nearestPlayer.y }
        );
        enemy.velocityX = dir.x * enemy.speed;
        enemy.velocityY = dir.y * enemy.speed;
      }
    } else {
      // Wander toward center
      const dir = direction({ x: enemy.x, y: enemy.y }, { x: 0, y: 0 });
      enemy.velocityX = dir.x * enemy.speed * 0.5;
      enemy.velocityY = dir.y * enemy.speed * 0.5;
    }

    enemy.x += enemy.velocityX * dt;
    enemy.y += enemy.velocityY * dt;
  }

  private fireEnemyProjectile(
    state: GameState,
    enemy: any,
    target: { x: number; y: number; id: string },
    attackConfig: typeof ENEMY_ATTACK_CONFIGS[string]
  ): void {
    // Calculate direction to target
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Normalize and apply projectile speed
    const velocityX = (dx / dist) * attackConfig.projectileSpeed;
    const velocityY = (dy / dist) * attackConfig.projectileSpeed;

    // Create enemy projectile
    state.addProjectile(
      attackConfig.projectileType,
      enemy.id,  // Owner is the enemy
      enemy.x,
      enemy.y,
      velocityX,
      velocityY,
      attackConfig.damage,
      attackConfig.projectileLifetime,
      attackConfig.projectileRadius,
      1  // Single hit, no piercing
    );
  }
}