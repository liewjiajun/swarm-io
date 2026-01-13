import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, ENEMY_ATTACK_CONFIGS, BOSS_ABILITY_CONFIGS } from '@swarm-io/shared';
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
      // Special handling for Bible orb projectiles - they orbit their owner
      if (projectile.type === 'orb') {
        const owner = state.players.get(projectile.ownerId);
        if (owner && !owner.dead) {
          // Calculate current angle from owner
          const dx = projectile.x - owner.x;
          const dy = projectile.y - owner.y;
          const currentDist = Math.sqrt(dx * dx + dy * dy);
          const currentAngle = Math.atan2(dy, dx);

          // Rotate at ~1 revolution per 2 seconds (π radians/sec)
          const orbitSpeed = Math.PI;
          const newAngle = currentAngle + orbitSpeed * dt;

          // Maintain orbit radius (use current distance or default to 3 units)
          const orbitRadius = currentDist > 0.5 ? currentDist : 3;

          // Update position to orbit around owner
          projectile.x = owner.x + Math.cos(newAngle) * orbitRadius;
          projectile.y = owner.y + Math.sin(newAngle) * orbitRadius;
        } else {
          // Owner died or disconnected, mark for cleanup
          expiredProjectiles.push(id);
        }
      } else {
        // Standard projectile movement
        projectile.x += projectile.velocityX * dt;
        projectile.y += projectile.velocityY * dt;
      }

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
    // Check for boss abilities
    const bossAbility = BOSS_ABILITY_CONFIGS[enemy.type];

    // Decrement ability cooldown for bosses
    if (bossAbility && enemy.abilityCooldown > 0) {
      enemy.abilityCooldown -= dt;
    }

    // Handle boss charging state
    if (enemy.isCharging && bossAbility?.type === 'charge') {
      this.updateChargingBoss(state, enemy, dt, bossAbility);
      return;
    }

    if (nearestPlayer) {
      enemy.targetPlayerId = nearestPlayer.id;

      const dist = distance(
        { x: enemy.x, y: enemy.y },
        { x: nearestPlayer.x, y: nearestPlayer.y }
      );

      // Handle boss abilities
      if (bossAbility) {
        this.handleBossAbility(state, enemy, nearestPlayer, dist, bossAbility);
      }

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

  /**
   * Handle boss-specific abilities during combat
   */
  private handleBossAbility(
    state: GameState,
    enemy: any,
    target: { x: number; y: number; id: string },
    dist: number,
    ability: typeof BOSS_ABILITY_CONFIGS[string]
  ): void {
    if (enemy.abilityCooldown > 0) return;

    // Summon ability (boss_skeleton)
    if (ability.type === 'summon' && ability.summonCount && ability.summonType && ability.summonRange) {
      const angleStep = (Math.PI * 2) / ability.summonCount;
      for (let i = 0; i < ability.summonCount; i++) {
        const angle = angleStep * i + Math.random() * 0.5;
        const spawnX = enemy.x + Math.cos(angle) * ability.summonRange;
        const spawnY = enemy.y + Math.sin(angle) * ability.summonRange;

        const minion = state.addEnemy(ability.summonType, spawnX, spawnY);
        minion.initialize(ability.summonType, 1);
      }
      enemy.abilityCooldown = ability.summonCooldown || 8;
      console.log(`[PhysicsSystem] Boss ${enemy.type} summoned ${ability.summonCount} ${ability.summonType}s`);
    }

    // Charge ability (boss_demon)
    if (ability.type === 'charge' && ability.chargeRange && dist <= ability.chargeRange) {
      // Start charging at the player's position
      enemy.isCharging = true;
      enemy.chargeTargetX = target.x;
      enemy.chargeTargetY = target.y;
      enemy.abilityCooldown = ability.chargeCooldown || 5;
      console.log(`[PhysicsSystem] Boss ${enemy.type} started charge attack`);
    }
  }

  /**
   * Update boss during charge attack
   */
  private updateChargingBoss(
    state: GameState,
    enemy: any,
    dt: number,
    ability: typeof BOSS_ABILITY_CONFIGS[string]
  ): void {
    const chargeSpeed = ability.chargeSpeed || 15;
    const chargeDamage = ability.chargeDamage || 40;

    // Move toward charge target
    const dx = enemy.chargeTargetX - enemy.x;
    const dy = enemy.chargeTargetY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.5) {
      // Reached target, end charge
      enemy.isCharging = false;
      enemy.velocityX = 0;
      enemy.velocityY = 0;

      // Create impact damage AOE at charge endpoint
      state.addProjectile(
        'charge_impact',
        enemy.id,
        enemy.x,
        enemy.y,
        0,
        0,
        chargeDamage,
        0.2,  // Short lifetime for AOE effect
        3,    // 3 unit radius damage
        999   // Hits all in radius
      );
      console.log(`[PhysicsSystem] Boss ${enemy.type} charge impact at (${enemy.x.toFixed(1)}, ${enemy.y.toFixed(1)})`);
      return;
    }

    // Apply charge velocity
    enemy.velocityX = (dx / dist) * chargeSpeed;
    enemy.velocityY = (dy / dist) * chargeSpeed;
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