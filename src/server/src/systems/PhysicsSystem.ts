import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, ENEMY_ATTACK_CONFIGS, BOSS_ABILITY_CONFIGS, ENEMY_CONFIGS } from '@swarm-io/shared';
import { direction, distance } from '@swarm-io/shared';
import { physicsSystemLogger } from '../utils/logger.js';

// P4.5: Boss aggro tracking for shared aggro system
interface BossAggroEntry {
  targetTime: number; // How long the boss has targeted this player
  lastSwitchTime: number; // When the boss last switched targets
}

// P4.5: Constants for shared boss aggro
const BOSS_AGGRO_SWITCH_INTERVAL = 5; // Seconds between potential target switches
const BOSS_AGGRO_SWITCH_CHANCE = 0.3; // 30% chance to switch to a different nearby player

export class PhysicsSystem {
  // P4.5: Track boss aggro state for target switching
  private bossAggroState: Map<string, BossAggroEntry> = new Map();

  constructor(private spatialHash: SpatialHash) {}

  update(state: GameState, dt: number) {
    // Get world radius early for boundary checks (BUG-030 FIX)
    const worldRadius = state.world.worldRadius;

    // Update enemy movement (AI) with boundary enforcement
    const enemiesToRemove: string[] = [];
    state.enemies.forEach((enemy, id) => {
      // BUG-030 FIX: Clean up enemies that go beyond world boundary + margin
      const enemyDist = Math.sqrt(enemy.x * enemy.x + enemy.y * enemy.y);
      const enemyBoundary = worldRadius + GAME_CONSTANTS.ENEMY_BOUNDARY_MARGIN;
      if (enemyDist > enemyBoundary) {
        enemiesToRemove.push(id);
        return; // Skip AI update for this enemy
      }
    });

    // Clean up out-of-bounds enemies
    enemiesToRemove.forEach(id => state.removeEnemy(id));

    // Now run AI updates for remaining enemies
    state.enemies.forEach((enemy) => {
      this.updateEnemyAI(state, enemy, dt);
    });

    // Update projectile movement
    const expiredProjectiles: string[] = [];
    state.projectiles.forEach((projectile, id) => {
      // Special handling for Bible orb projectiles - they orbit their owner
      // BUG-053 FIX: Also handle 'expanding_orb' type created by evolved Bible (Crusade)
      if (projectile.type === 'orb' || projectile.type === 'expanding_orb') {
        const owner = state.players.get(projectile.ownerId);
        if (owner && !owner.dead) {
          // Calculate current angle from owner
          const dx = projectile.x - owner.x;
          const dy = projectile.y - owner.y;
          const currentDist = Math.sqrt(dx * dx + dy * dy);
          const currentAngle = Math.atan2(dy, dx);

          // Rotate at ~1 revolution per 2 seconds
          const newAngle = currentAngle + GAME_CONSTANTS.ORB_ORBIT_SPEED * dt;

          // Maintain orbit radius (use current distance or default radius)
          const orbitRadius = currentDist > GAME_CONSTANTS.ORB_MIN_DISTANCE_THRESHOLD
            ? currentDist
            : GAME_CONSTANTS.ORB_DEFAULT_RADIUS;

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

      // BUG-030 FIX: Clean up projectiles that go beyond world boundary + margin
      // This prevents memory leaks from projectiles that miss their targets
      const projDist = Math.sqrt(projectile.x * projectile.x + projectile.y * projectile.y);
      const projBoundary = worldRadius + GAME_CONSTANTS.PROJECTILE_BOUNDARY_MARGIN;
      if (projDist > projBoundary) {
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

    // World boundary enforcement for players
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
    // P9.8: Handle knockback state - enemy is pushed back and cannot move normally
    const currentTime = Date.now() / 1000;
    if (enemy.isKnockedBack) {
      if (currentTime < enemy.knockbackEndTime) {
        // Apply knockback velocity with decay
        const knockbackProgress = 1 - (enemy.knockbackEndTime - currentTime) / GAME_CONSTANTS.KNOCKBACK_DURATION;
        const decayFactor = 1 - knockbackProgress * knockbackProgress; // Quadratic decay

        enemy.x += enemy.knockbackVX * decayFactor * dt;
        enemy.y += enemy.knockbackVY * decayFactor * dt;

        // Enemies in knockback cannot take normal AI actions (stunned)
        enemy.velocityX = 0;
        enemy.velocityY = 0;
        return;
      } else {
        // Knockback ended, reset state
        enemy.isKnockedBack = false;
        enemy.knockbackVX = 0;
        enemy.knockbackVY = 0;
      }
    }

    // Check if this is a boss enemy
    const enemyConfig = ENEMY_CONFIGS[enemy.type];
    const isBoss = enemyConfig?.isBoss ?? false;

    // P4.5: Use shared aggro system for bosses to target multiple players
    let targetPlayer: { x: number; y: number; id: string } | null = null;

    if (isBoss) {
      targetPlayer = this.getBossTarget(state, enemy, dt);
    } else {
      // Find nearest player for non-boss enemies
      targetPlayer = this.spatialHash.queryNearestOfType(
        enemy.x, enemy.y, 'player', GAME_CONSTANTS.ENEMY_DETECTION_RANGE
      );
    }

    // Check if this enemy has ranged attack capability
    const attackConfig = ENEMY_ATTACK_CONFIGS[enemy.type];
    // Check for boss abilities
    const bossAbility = BOSS_ABILITY_CONFIGS[enemy.type];

    // Use targetPlayer instead of nearestPlayer
    const nearestPlayer = targetPlayer;

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
          if (dist < attackConfig.range * GAME_CONSTANTS.RANGED_RETREAT_DISTANCE_RATIO) {
            // Move away from player to maintain distance
            const dir = direction(
              { x: nearestPlayer.x, y: nearestPlayer.y },
              { x: enemy.x, y: enemy.y }
            );
            enemy.velocityX = dir.x * enemy.speed * GAME_CONSTANTS.ENEMY_SLOW_SPEED_RATIO;
            enemy.velocityY = dir.y * enemy.speed * GAME_CONSTANTS.ENEMY_SLOW_SPEED_RATIO;
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
      enemy.velocityX = dir.x * enemy.speed * GAME_CONSTANTS.ENEMY_SLOW_SPEED_RATIO;
      enemy.velocityY = dir.y * enemy.speed * GAME_CONSTANTS.ENEMY_SLOW_SPEED_RATIO;
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
        const angle = angleStep * i + Math.random() * GAME_CONSTANTS.BOSS_SUMMON_ANGLE_VARIANCE;
        const spawnX = enemy.x + Math.cos(angle) * ability.summonRange;
        const spawnY = enemy.y + Math.sin(angle) * ability.summonRange;

        const minion = state.addEnemy(ability.summonType, spawnX, spawnY);
        minion.initialize(ability.summonType, 1);
      }
      enemy.abilityCooldown = ability.summonCooldown || 8;
      physicsSystemLogger.debug({ bossType: enemy.type, summonCount: ability.summonCount, summonType: ability.summonType }, 'Boss summoned minions');
    }

    // Charge ability (boss_demon)
    if (ability.type === 'charge' && ability.chargeRange && dist <= ability.chargeRange) {
      // Start charging at the player's position
      enemy.isCharging = true;
      enemy.chargeTargetX = target.x;
      enemy.chargeTargetY = target.y;
      enemy.abilityCooldown = ability.chargeCooldown || 5;
      physicsSystemLogger.debug({ bossType: enemy.type }, 'Boss started charge attack');
    }
  }

  /**
   * Update boss during charge attack
   * BUG-029 FIX: Now tracks player position during charge instead of using static target
   */
  private updateChargingBoss(
    state: GameState,
    enemy: any,
    dt: number,
    ability: typeof BOSS_ABILITY_CONFIGS[string]
  ): void {
    const chargeSpeed = ability.chargeSpeed || 15;
    const chargeDamage = ability.chargeDamage || 40;

    // BUG-029 FIX: Update charge target to track player's current position
    if (enemy.targetPlayerId) {
      const targetPlayer = state.players.get(enemy.targetPlayerId);
      if (targetPlayer && !targetPlayer.dead) {
        enemy.chargeTargetX = targetPlayer.x;
        enemy.chargeTargetY = targetPlayer.y;
      }
    }

    // Move toward charge target
    const dx = enemy.chargeTargetX - enemy.x;
    const dy = enemy.chargeTargetY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < GAME_CONSTANTS.CHARGE_TARGET_REACHED_THRESHOLD) {
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
        GAME_CONSTANTS.CHARGE_IMPACT_LIFETIME,
        GAME_CONSTANTS.CHARGE_IMPACT_RADIUS,
        GAME_CONSTANTS.CHARGE_IMPACT_MAX_PIERCE
      );
      physicsSystemLogger.debug({ bossType: enemy.type, x: enemy.x, y: enemy.y }, 'Boss charge impact');
      return;
    }

    // Apply charge velocity
    enemy.velocityX = (dx / dist) * chargeSpeed;
    enemy.velocityY = (dy / dist) * chargeSpeed;
    enemy.x += enemy.velocityX * dt;
    enemy.y += enemy.velocityY * dt;
  }

  /**
   * P4.5: Get boss target with shared aggro system
   * Bosses periodically switch between nearby players to engage multiple targets
   */
  private getBossTarget(
    state: GameState,
    enemy: any,
    dt: number
  ): { x: number; y: number; id: string } | null {
    // Get or create aggro state for this boss
    let aggroState = this.bossAggroState.get(enemy.id);
    if (!aggroState) {
      aggroState = { targetTime: 0, lastSwitchTime: 0 };
      this.bossAggroState.set(enemy.id, aggroState);
    }

    // Update targeting time
    aggroState.targetTime += dt;
    aggroState.lastSwitchTime += dt;

    // Find all nearby players
    const nearbyPlayers = this.spatialHash.queryRadius(
      enemy.x, enemy.y, GAME_CONSTANTS.ENEMY_DETECTION_RANGE, 'player'
    ).filter(p => {
      const player = p.entity as any;
      return player && !player.dead;
    });

    if (nearbyPlayers.length === 0) {
      return null;
    }

    // If only one player, target them
    if (nearbyPlayers.length === 1) {
      const player = nearbyPlayers[0].entity as any;
      enemy.targetPlayerId = player.id;
      return { x: player.x, y: player.y, id: player.id };
    }

    // Multiple players nearby - implement shared aggro
    const currentTarget = enemy.targetPlayerId
      ? nearbyPlayers.find(p => (p.entity as any).id === enemy.targetPlayerId)
      : null;

    // Check if we should switch targets
    if (aggroState.lastSwitchTime >= BOSS_AGGRO_SWITCH_INTERVAL) {
      aggroState.lastSwitchTime = 0;

      // Roll for target switch
      if (Math.random() < BOSS_AGGRO_SWITCH_CHANCE) {
        // Pick a random different player
        const otherPlayers = nearbyPlayers.filter(p => (p.entity as any).id !== enemy.targetPlayerId);
        if (otherPlayers.length > 0) {
          const newTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
          const player = newTarget.entity as any;
          enemy.targetPlayerId = player.id;
          aggroState.targetTime = 0;

          physicsSystemLogger.debug({
            bossId: enemy.id,
            bossType: enemy.type,
            newTargetId: player.id,
            playerCount: nearbyPlayers.length
          }, 'Boss switched aggro target');

          return { x: player.x, y: player.y, id: player.id };
        }
      }
    }

    // Keep current target if valid, otherwise pick nearest
    if (currentTarget) {
      const player = currentTarget.entity as any;
      return { x: player.x, y: player.y, id: player.id };
    }

    // Find nearest player as fallback
    let nearestPlayer = nearbyPlayers[0];
    let nearestDist = distance(
      { x: enemy.x, y: enemy.y },
      { x: (nearestPlayer.entity as any).x, y: (nearestPlayer.entity as any).y }
    );

    for (let i = 1; i < nearbyPlayers.length; i++) {
      const p = nearbyPlayers[i];
      const d = distance(
        { x: enemy.x, y: enemy.y },
        { x: (p.entity as any).x, y: (p.entity as any).y }
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestPlayer = p;
      }
    }

    const player = nearestPlayer.entity as any;
    enemy.targetPlayerId = player.id;
    return { x: player.x, y: player.y, id: player.id };
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
      GAME_CONSTANTS.ENEMY_PROJECTILE_PIERCE
    );
  }
}