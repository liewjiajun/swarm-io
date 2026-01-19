import { GameState, PlayerSchema, PowerUpSchema } from '../state/index.js';
import { SpatialHash } from './SpatialHash.js';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import type { PowerUpType } from '@swarm-io/shared';

/**
 * P5.2: Power-Up System
 * Manages hidden power-ups that spawn rarely in random locations.
 * Players can collect these for temporary or instant effects:
 * - health_restore: Instantly restores health
 * - damage_boost: Temporarily increases damage dealt
 * - speed_boost: Temporarily increases movement speed
 * - shield: Grants temporary invulnerability
 * - magnet_boost: Temporarily increases XP magnet range
 */
export class PowerUpSystem {
  private nextSpawnTime: number = 0;
  private lastSpawnTime: number = 0;

  // Metrics for monitoring
  private metrics = {
    totalSpawned: 0,
    totalCollected: 0,
    totalDespawned: 0,
    healthRestoreCount: 0,
    damageBoostCount: 0,
    speedBoostCount: 0,
    shieldCount: 0,
    magnetBoostCount: 0
  };

  // Power-up type weights for random selection (higher = more common)
  private readonly powerUpWeights: Record<PowerUpType, number> = {
    health_restore: 30,  // Most common - useful for survival
    damage_boost: 25,    // Common - helps with clearing
    speed_boost: 20,     // Moderate - good for escape/kiting
    magnet_boost: 15,    // Less common - utility
    shield: 10           // Rare - very powerful
  };

  constructor() {
    // Schedule first power-up spawn after minimum interval
    this.nextSpawnTime = GAME_CONSTANTS.POWERUP_MIN_SPAWN_INTERVAL;
  }

  /**
   * Update the power-up system
   */
  update(gameState: GameState, spatialHash: SpatialHash, deltaTime: number): void {
    const gameTime = gameState.world.gameTime;

    // Update player buff timers
    this.updatePlayerBuffs(gameState, deltaTime);

    // Check if it's time to try spawning a power-up
    if (gameTime >= this.nextSpawnTime && gameState.players.size > 0) {
      this.trySpawnPowerUp(gameState);
      this.scheduleNextSpawn(gameTime);
    }

    // Process power-up collection
    this.processCollection(gameState, spatialHash);

    // Clean up expired power-ups
    this.cleanupExpiredPowerUps(gameState);
  }

  /**
   * Update buff timers for all players
   */
  private updatePlayerBuffs(gameState: GameState, deltaTime: number): void {
    gameState.players.forEach(player => {
      if (player.dead) return;

      // Decay damage boost
      if (player.damageBoostTime > 0) {
        player.damageBoostTime = Math.max(0, player.damageBoostTime - deltaTime);
      }

      // Decay speed boost
      if (player.speedBoostTime > 0) {
        player.speedBoostTime = Math.max(0, player.speedBoostTime - deltaTime);
      }

      // Decay shield
      if (player.shieldTime > 0) {
        player.shieldTime = Math.max(0, player.shieldTime - deltaTime);
      }

      // Decay magnet boost
      if (player.magnetBoostTime > 0) {
        player.magnetBoostTime = Math.max(0, player.magnetBoostTime - deltaTime);
      }
    });
  }

  /**
   * Try to spawn a power-up (subject to chance and max limit)
   */
  private trySpawnPowerUp(gameState: GameState): void {
    // Check if we've hit the max power-ups limit
    if (gameState.powerUps.size >= GAME_CONSTANTS.POWERUP_MAX_ACTIVE) {
      return;
    }

    // Roll spawn chance
    if (Math.random() > GAME_CONSTANTS.POWERUP_SPAWN_CHANCE) {
      return;
    }

    // Select a random power-up type (weighted)
    const powerUpType = this.selectRandomPowerUpType();

    // Pick a random location within the world
    const worldRadius = gameState.world.worldRadius;
    const maxRadius = worldRadius * 0.8; // Keep power-ups accessible
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * maxRadius;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    // Create the power-up (return value not used, tracked in gameState)
    gameState.addPowerUp(powerUpType, x, y, GAME_CONSTANTS.POWERUP_LIFETIME);

    this.metrics.totalSpawned++;
    this.lastSpawnTime = gameState.world.gameTime;
  }

  /**
   * Select a random power-up type using weighted selection
   */
  private selectRandomPowerUpType(): PowerUpType {
    const types = Object.keys(this.powerUpWeights) as PowerUpType[];
    const totalWeight = Object.values(this.powerUpWeights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (const type of types) {
      random -= this.powerUpWeights[type];
      if (random <= 0) {
        return type;
      }
    }

    // Fallback (shouldn't happen)
    return 'health_restore';
  }

  /**
   * Schedule the next power-up spawn attempt
   */
  private scheduleNextSpawn(currentTime: number): void {
    const minInterval = GAME_CONSTANTS.POWERUP_MIN_SPAWN_INTERVAL;
    const maxInterval = GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL;
    const interval = minInterval + Math.random() * (maxInterval - minInterval);
    this.nextSpawnTime = currentTime + interval;
  }

  /**
   * Process power-up collection by players
   */
  private processCollection(gameState: GameState, _spatialHash: SpatialHash): void {
    const collectionRadius = GAME_CONSTANTS.POWERUP_COLLECTION_RADIUS;
    const powerUpsToRemove: string[] = [];

    gameState.powerUps.forEach((powerUp, powerUpId) => {
      if (powerUp.collected) {
        powerUpsToRemove.push(powerUpId);
        return;
      }

      // Check for nearby players
      gameState.players.forEach(player => {
        if (player.dead || powerUp.collected) return;

        const dx = player.x - powerUp.x;
        const dy = player.y - powerUp.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = collectionRadius * collectionRadius;

        if (distSq <= radiusSq) {
          // Collect the power-up
          this.collectPowerUp(gameState, player, powerUp);
          powerUp.collected = true;
          powerUpsToRemove.push(powerUpId);
        }
      });
    });

    // Remove collected power-ups
    for (const id of powerUpsToRemove) {
      gameState.removePowerUp(id);
    }
  }

  /**
   * Apply power-up effect to player
   */
  private collectPowerUp(gameState: GameState, player: PlayerSchema, powerUp: PowerUpSchema): void {
    const type = powerUp.type as PowerUpType;

    switch (type) {
      case 'health_restore':
        this.applyHealthRestore(player);
        this.metrics.healthRestoreCount++;
        break;
      case 'damage_boost':
        this.applyDamageBoost(player);
        this.metrics.damageBoostCount++;
        break;
      case 'speed_boost':
        this.applySpeedBoost(player);
        this.metrics.speedBoostCount++;
        break;
      case 'shield':
        this.applyShield(player);
        this.metrics.shieldCount++;
        break;
      case 'magnet_boost':
        this.applyMagnetBoost(player);
        this.metrics.magnetBoostCount++;
        break;
    }

    this.metrics.totalCollected++;
  }

  /**
   * Apply health restore - instantly heals player
   */
  private applyHealthRestore(player: PlayerSchema): void {
    const healAmount = GAME_CONSTANTS.POWERUP_HEALTH_RESTORE_AMOUNT;
    player.health = Math.min(player.maxHealth, player.health + healAmount);
  }

  /**
   * Apply damage boost - temporarily increases damage
   */
  private applyDamageBoost(player: PlayerSchema): void {
    // Add duration (stacks if already active)
    player.damageBoostTime = Math.max(
      player.damageBoostTime,
      GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_DURATION
    );
  }

  /**
   * Apply speed boost - temporarily increases movement speed
   */
  private applySpeedBoost(player: PlayerSchema): void {
    // Add duration (stacks if already active)
    player.speedBoostTime = Math.max(
      player.speedBoostTime,
      GAME_CONSTANTS.POWERUP_SPEED_BOOST_DURATION
    );
  }

  /**
   * Apply shield - grants temporary invulnerability
   */
  private applyShield(player: PlayerSchema): void {
    // Add duration (stacks if already active)
    player.shieldTime = Math.max(
      player.shieldTime,
      GAME_CONSTANTS.POWERUP_SHIELD_DURATION
    );
  }

  /**
   * Apply magnet boost - temporarily increases XP collection range
   */
  private applyMagnetBoost(player: PlayerSchema): void {
    // Add duration (stacks if already active)
    player.magnetBoostTime = Math.max(
      player.magnetBoostTime,
      GAME_CONSTANTS.POWERUP_MAGNET_BOOST_DURATION
    );
  }

  /**
   * Clean up expired (uncollected) power-ups
   */
  private cleanupExpiredPowerUps(gameState: GameState): void {
    const gameTime = gameState.world.gameTime;
    const toRemove: string[] = [];

    gameState.powerUps.forEach((powerUp, id) => {
      const age = gameTime - powerUp.spawnTime;
      if (age >= powerUp.lifetime) {
        toRemove.push(id);
        this.metrics.totalDespawned++;
      }
    });

    for (const id of toRemove) {
      gameState.removePowerUp(id);
    }
  }

  /**
   * Get the damage multiplier for a player (based on damage boost buff)
   */
  getDamageMultiplier(player: PlayerSchema): number {
    if (player.hasDamageBoost) {
      return GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_MULTIPLIER;
    }
    return 1;
  }

  /**
   * Get the speed multiplier for a player (based on speed boost buff)
   */
  getSpeedMultiplier(player: PlayerSchema): number {
    if (player.hasSpeedBoost) {
      return GAME_CONSTANTS.POWERUP_SPEED_BOOST_MULTIPLIER;
    }
    return 1;
  }

  /**
   * Get the magnet range multiplier for a player (based on magnet boost buff)
   */
  getMagnetMultiplier(player: PlayerSchema): number {
    if (player.hasMagnetBoost) {
      return GAME_CONSTANTS.POWERUP_MAGNET_BOOST_MULTIPLIER;
    }
    return 1;
  }

  /**
   * Get system metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Reset the system
   */
  reset(): void {
    this.nextSpawnTime = GAME_CONSTANTS.POWERUP_MIN_SPAWN_INTERVAL;
    this.lastSpawnTime = 0;
    this.metrics = {
      totalSpawned: 0,
      totalCollected: 0,
      totalDespawned: 0,
      healthRestoreCount: 0,
      damageBoostCount: 0,
      speedBoostCount: 0,
      shieldCount: 0,
      magnetBoostCount: 0
    };
  }
}
