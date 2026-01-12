import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import { direction, distance } from '@swarm-io/shared';

export class PhysicsSystem {
  constructor(private spatialHash: SpatialHash) {}

  update(state: GameState, dt: number) {
    // Update enemy movement (AI)
    state.enemies.forEach((enemy) => {
      this.updateEnemyAI(state, enemy, dt);
    });

    // Update projectile movement
    state.projectiles.forEach((projectile) => {
      projectile.x += projectile.velocityX * dt;
      projectile.y += projectile.velocityY * dt;
      projectile.lifetime -= dt;
    });

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

    if (nearestPlayer) {
      enemy.targetPlayerId = nearestPlayer.id;

      // Move toward player
      const dir = direction(
        { x: enemy.x, y: enemy.y },
        { x: nearestPlayer.x, y: nearestPlayer.y }
      );

      enemy.velocityX = dir.x * enemy.speed;
      enemy.velocityY = dir.y * enemy.speed;
    } else {
      // Wander toward center
      const dir = direction({ x: enemy.x, y: enemy.y }, { x: 0, y: 0 });
      enemy.velocityX = dir.x * enemy.speed * 0.5;
      enemy.velocityY = dir.y * enemy.speed * 0.5;
    }

    enemy.x += enemy.velocityX * dt;
    enemy.y += enemy.velocityY * dt;
  }
}