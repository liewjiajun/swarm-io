import { GameState, PlayerSchema, HazardSchema } from '../state/index.js';
import { SpatialHash } from './SpatialHash.js';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import type { HazardType } from '@swarm-io/shared';

/**
 * P5.4: Environmental Hazard System
 * Manages hazards that spawn in the world and affect player movement/health:
 * - lava: DOT damage to players standing in it
 * - ice: Slows player movement speed while on it
 * - teleporter: Paired portals that teleport players between locations
 */
export class HazardSystem {
  private nextSpawnTime: number = 0;
  private lastSpawnTime: number = 0;

  // Track player teleport cooldowns (playerId -> timestamp when cooldown ends)
  private teleportCooldowns: Map<string, number> = new Map();

  // Track which players are in ice patches for speed modification
  private playersInIce: Set<string> = new Set();

  // Metrics for monitoring
  private metrics = {
    totalSpawned: 0,
    lavaSpawned: 0,
    iceSpawned: 0,
    teleporterSpawned: 0,
    totalDamageDealt: 0,
    totalTeleports: 0,
    totalDespawned: 0
  };

  // Hazard type weights for random selection (higher = more common)
  private readonly hazardWeights: Record<HazardType, number> = {
    lava: 35,       // Common - adds danger
    ice: 40,        // Most common - tactical element
    teleporter: 25  // Less common - strategic repositioning
  };

  constructor() {
    // Schedule first hazard spawn after minimum interval
    this.nextSpawnTime = GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL;
  }

  /**
   * Update the hazard system
   */
  update(gameState: GameState, spatialHash: SpatialHash, deltaTime: number): void {
    const gameTime = gameState.world.gameTime;

    // Check if it's time to try spawning a hazard
    if (gameTime >= this.nextSpawnTime && gameState.players.size > 0) {
      this.trySpawnHazard(gameState);
      this.scheduleNextSpawn(gameTime);
    }

    // Update animation times
    this.updateAnimations(gameState, deltaTime);

    // Process hazard effects on players
    this.processHazardEffects(gameState, spatialHash, deltaTime);

    // Clean up expired hazards
    this.cleanupExpiredHazards(gameState);
  }

  /**
   * Update animation times for all hazards
   */
  private updateAnimations(gameState: GameState, deltaTime: number): void {
    gameState.hazards.forEach(hazard => {
      hazard.animationTime += deltaTime;
    });
  }

  /**
   * Try to spawn a hazard (subject to chance and max limit)
   */
  private trySpawnHazard(gameState: GameState): void {
    // Check if we've hit the max hazards limit
    if (gameState.hazards.size >= GAME_CONSTANTS.HAZARD_MAX_ACTIVE) {
      return;
    }

    // Roll spawn chance
    if (Math.random() > GAME_CONSTANTS.HAZARD_SPAWN_CHANCE) {
      return;
    }

    // Select a random hazard type (weighted)
    const hazardType = this.selectRandomHazardType();

    // Spawn based on type
    switch (hazardType) {
      case 'lava':
        this.spawnLava(gameState);
        break;
      case 'ice':
        this.spawnIceGroup(gameState);
        break;
      case 'teleporter':
        this.spawnTeleporterPair(gameState);
        break;
    }

    this.lastSpawnTime = gameState.world.gameTime;
  }

  /**
   * Select a random hazard type using weighted selection
   */
  private selectRandomHazardType(): HazardType {
    const types = Object.keys(this.hazardWeights) as HazardType[];
    const totalWeight = Object.values(this.hazardWeights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (const type of types) {
      random -= this.hazardWeights[type];
      if (random <= 0) {
        return type;
      }
    }

    // Fallback (shouldn't happen)
    return 'lava';
  }

  /**
   * Find a valid spawn position that's away from players and other hazards
   */
  private findSpawnPosition(gameState: GameState): { x: number; y: number } | null {
    const worldRadius = gameState.world.worldRadius;
    const maxAttempts = 20;

    for (let i = 0; i < maxAttempts; i++) {
      // Random position within world bounds
      const maxRadius = worldRadius * 0.85; // Keep hazards accessible but not at very edge
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * maxRadius;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      // Check distance from players
      let tooCloseToPlayer = false;
      gameState.players.forEach(player => {
        if (player.dead) return;
        const dx = player.x - x;
        const dy = player.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < GAME_CONSTANTS.HAZARD_MIN_DISTANCE_FROM_PLAYER * GAME_CONSTANTS.HAZARD_MIN_DISTANCE_FROM_PLAYER) {
          tooCloseToPlayer = true;
        }
      });

      if (tooCloseToPlayer) continue;

      // Check distance from other hazards
      let tooCloseToHazard = false;
      gameState.hazards.forEach(hazard => {
        const dx = hazard.x - x;
        const dy = hazard.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < GAME_CONSTANTS.HAZARD_MIN_DISTANCE_BETWEEN * GAME_CONSTANTS.HAZARD_MIN_DISTANCE_BETWEEN) {
          tooCloseToHazard = true;
        }
      });

      if (tooCloseToHazard) continue;

      return { x, y };
    }

    return null; // Could not find valid position
  }

  /**
   * Spawn a lava pool
   */
  private spawnLava(gameState: GameState): void {
    const pos = this.findSpawnPosition(gameState);
    if (!pos) return;

    gameState.addHazard(
      'lava',
      pos.x,
      pos.y,
      GAME_CONSTANTS.HAZARD_LAVA_RADIUS,
      GAME_CONSTANTS.HAZARD_LAVA_DURATION
    );

    this.metrics.totalSpawned++;
    this.metrics.lavaSpawned++;
  }

  /**
   * Spawn a group of ice patches
   */
  private spawnIceGroup(gameState: GameState): void {
    const centerPos = this.findSpawnPosition(gameState);
    if (!centerPos) return;

    const groupSize = GAME_CONSTANTS.HAZARD_ICE_GROUP_SIZE;

    for (let i = 0; i < groupSize; i++) {
      // Spread ice patches in a small cluster
      const offsetAngle = (i / groupSize) * Math.PI * 2 + Math.random() * 0.5;
      const offsetDistance = GAME_CONSTANTS.HAZARD_ICE_RADIUS * (0.8 + Math.random() * 0.6);
      const x = centerPos.x + Math.cos(offsetAngle) * offsetDistance;
      const y = centerPos.y + Math.sin(offsetAngle) * offsetDistance;

      gameState.addHazard(
        'ice',
        x,
        y,
        GAME_CONSTANTS.HAZARD_ICE_RADIUS,
        GAME_CONSTANTS.HAZARD_ICE_DURATION
      );

      this.metrics.totalSpawned++;
      this.metrics.iceSpawned++;
    }
  }

  /**
   * Spawn a pair of linked teleporters
   */
  private spawnTeleporterPair(gameState: GameState): void {
    const pos1 = this.findSpawnPosition(gameState);
    if (!pos1) return;

    // Find second position that's far enough from first
    let pos2: { x: number; y: number } | null = null;
    const minTeleportDistance = GAME_CONSTANTS.HAZARD_MIN_DISTANCE_BETWEEN * 2;

    for (let i = 0; i < 20; i++) {
      const candidate = this.findSpawnPosition(gameState);
      if (!candidate) continue;

      const dx = candidate.x - pos1.x;
      const dy = candidate.y - pos1.y;
      const distSq = dx * dx + dy * dy;

      if (distSq >= minTeleportDistance * minTeleportDistance) {
        pos2 = candidate;
        break;
      }
    }

    if (!pos2) return;

    // Create first teleporter
    const teleporter1 = gameState.addHazard(
      'teleporter',
      pos1.x,
      pos1.y,
      GAME_CONSTANTS.HAZARD_TELEPORTER_RADIUS,
      GAME_CONSTANTS.HAZARD_TELEPORTER_DURATION
    );

    // Create second teleporter linked to first
    const teleporter2 = gameState.addHazard(
      'teleporter',
      pos2.x,
      pos2.y,
      GAME_CONSTANTS.HAZARD_TELEPORTER_RADIUS,
      GAME_CONSTANTS.HAZARD_TELEPORTER_DURATION,
      teleporter1.id
    );

    // Link first teleporter to second
    teleporter1.linkedHazardId = teleporter2.id;

    this.metrics.totalSpawned += 2;
    this.metrics.teleporterSpawned += 2;
  }

  /**
   * Schedule the next hazard spawn attempt
   */
  private scheduleNextSpawn(currentTime: number): void {
    const minInterval = GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL;
    const maxInterval = GAME_CONSTANTS.HAZARD_MAX_SPAWN_INTERVAL;
    const interval = minInterval + Math.random() * (maxInterval - minInterval);
    this.nextSpawnTime = currentTime + interval;
  }

  /**
   * Process hazard effects on all players
   */
  private processHazardEffects(gameState: GameState, _spatialHash: SpatialHash, deltaTime: number): void {
    const gameTime = gameState.world.gameTime;

    // Clear ice tracking for this frame
    this.playersInIce.clear();

    gameState.players.forEach(player => {
      if (player.dead) return;

      gameState.hazards.forEach(hazard => {
        if (!hazard.active) return;

        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = hazard.radius * hazard.radius;

        if (distSq <= radiusSq) {
          // Player is in hazard
          switch (hazard.type) {
            case 'lava':
              this.applyLavaDamage(player, deltaTime);
              break;
            case 'ice':
              this.playersInIce.add(player.id);
              break;
            case 'teleporter':
              this.tryTeleportPlayer(gameState, player, hazard, gameTime);
              break;
          }
        }
      });
    });
  }

  /**
   * Apply lava DOT damage to a player
   */
  private applyLavaDamage(player: PlayerSchema, deltaTime: number): void {
    // Skip if player is invulnerable (from respawn or shield)
    if (player.invulnerableTime > 0 || player.shieldTime > 0) return;

    const damage = GAME_CONSTANTS.HAZARD_LAVA_DAMAGE_PER_SECOND * deltaTime;
    player.health -= damage;
    this.metrics.totalDamageDealt += damage;

    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      player.killedBy = 'lava';
    }
  }

  /**
   * Try to teleport a player through a teleporter
   */
  private tryTeleportPlayer(gameState: GameState, player: PlayerSchema, teleporter: HazardSchema, gameTime: number): void {
    // Check cooldown
    const cooldownEnd = this.teleportCooldowns.get(player.id);
    if (cooldownEnd && gameTime < cooldownEnd) {
      return; // Still on cooldown
    }

    // Find linked teleporter
    const linkedTeleporter = gameState.hazards.get(teleporter.linkedHazardId);
    if (!linkedTeleporter || !linkedTeleporter.active) {
      return; // No valid destination
    }

    // Teleport player to linked teleporter with slight offset to prevent instant re-teleport
    const exitOffset = 2; // Units away from teleporter center
    const angle = Math.random() * Math.PI * 2;
    player.x = linkedTeleporter.x + Math.cos(angle) * exitOffset;
    player.y = linkedTeleporter.y + Math.sin(angle) * exitOffset;

    // Set cooldown
    this.teleportCooldowns.set(player.id, gameTime + GAME_CONSTANTS.HAZARD_TELEPORTER_COOLDOWN);

    this.metrics.totalTeleports++;
  }

  /**
   * Check if a player is currently in an ice patch (for speed modification)
   * Called by InputSystem or PhysicsSystem
   */
  isPlayerInIce(playerId: string): boolean {
    return this.playersInIce.has(playerId);
  }

  /**
   * Get the speed multiplier for a player based on ice patch status
   */
  getSpeedMultiplier(playerId: string): number {
    if (this.playersInIce.has(playerId)) {
      return GAME_CONSTANTS.HAZARD_ICE_SLOW_MULTIPLIER;
    }
    return 1;
  }

  /**
   * Clean up expired hazards
   */
  private cleanupExpiredHazards(gameState: GameState): void {
    const gameTime = gameState.world.gameTime;
    const toRemove: string[] = [];

    gameState.hazards.forEach((hazard, id) => {
      // Duration of 0 means permanent
      if (hazard.duration <= 0) return;

      const age = gameTime - hazard.spawnTime;
      if (age >= hazard.duration) {
        toRemove.push(id);
        this.metrics.totalDespawned++;
      }
    });

    for (const id of toRemove) {
      // Skip if already removed (e.g., as a linked teleporter)
      if (!gameState.hazards.has(id)) continue;

      // If removing a teleporter, also remove its linked partner
      const hazard = gameState.hazards.get(id);
      if (hazard && hazard.type === 'teleporter' && hazard.linkedHazardId) {
        const linkedId = hazard.linkedHazardId;
        if (gameState.hazards.has(linkedId)) {
          gameState.removeHazard(linkedId);
          this.metrics.totalDespawned++;
        }
      }
      gameState.removeHazard(id);
    }

    // Clean up stale teleport cooldowns
    const staleCooldowns: string[] = [];
    this.teleportCooldowns.forEach((cooldownEnd, playerId) => {
      if (gameTime > cooldownEnd) {
        staleCooldowns.push(playerId);
      }
    });
    for (const playerId of staleCooldowns) {
      this.teleportCooldowns.delete(playerId);
    }
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
    this.nextSpawnTime = GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL;
    this.lastSpawnTime = 0;
    this.teleportCooldowns.clear();
    this.playersInIce.clear();
    this.metrics = {
      totalSpawned: 0,
      lavaSpawned: 0,
      iceSpawned: 0,
      teleporterSpawned: 0,
      totalDamageDealt: 0,
      totalTeleports: 0,
      totalDespawned: 0
    };
  }
}
