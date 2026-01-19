import { GameState, WorldEventSchema } from '../state/index.js';
import { GAME_CONSTANTS, ENEMY_CONFIGS } from '@swarm-io/shared';
import type { WorldEventType } from '@swarm-io/shared';

/**
 * P5.1: World Event System
 * Manages random world events that add variety to gameplay:
 * - Meteor Shower: Dangerous meteors fall from sky dealing damage
 * - Invasion Wave: Extra enemies spawn in an area
 * - Double XP Zone: Area grants 2x XP for a duration
 */
export class WorldEventSystem {
  private nextEventTime: number = 0;
  private lastEventTime: number = 0;
  private eventIdCounter: number = 0;

  // Metrics for monitoring
  private metrics = {
    totalEventsSpawned: 0,
    meteorShowerCount: 0,
    invasionWaveCount: 0,
    doubleXpZoneCount: 0,
    meteorsSpawned: 0,
    invasionEnemiesSpawned: 0
  };

  constructor() {
    // Schedule first event after minimum interval
    this.nextEventTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL;
  }

  /**
   * Update the world event system
   */
  update(gameState: GameState, deltaTime: number): void {
    const gameTime = gameState.world.gameTime;

    // Check if it's time to spawn a new event
    if (gameTime >= this.nextEventTime && gameState.players.size > 0) {
      this.spawnRandomEvent(gameState);
      this.scheduleNextEvent();
    }

    // Update all active events
    this.updateActiveEvents(gameState, deltaTime);
  }

  /**
   * Spawn a random world event
   */
  private spawnRandomEvent(gameState: GameState): void {
    const eventTypes: WorldEventType[] = ['meteor_shower', 'invasion_wave', 'double_xp_zone'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    // Pick a random location within the world
    const worldRadius = gameState.world.worldRadius;
    const maxRadius = worldRadius * 0.7; // Keep events somewhat centered
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * maxRadius;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    switch (eventType) {
      case 'meteor_shower':
        this.spawnMeteorShower(gameState, x, y);
        break;
      case 'invasion_wave':
        this.spawnInvasionWave(gameState, x, y);
        break;
      case 'double_xp_zone':
        this.spawnDoubleXpZone(gameState, x, y);
        break;
    }

    this.lastEventTime = gameState.world.gameTime;
    this.metrics.totalEventsSpawned++;
  }

  /**
   * P5.1a: Spawn a meteor shower event
   */
  private spawnMeteorShower(gameState: GameState, x: number, y: number): void {
    const event = gameState.addWorldEvent(
      'meteor_shower',
      x,
      y,
      GAME_CONSTANTS.METEOR_SHOWER_RADIUS,
      GAME_CONSTANTS.METEOR_SHOWER_DURATION,
      gameState.world.gameTime
    );
    event.intensity = GAME_CONSTANTS.METEOR_SHOWER_DAMAGE;
    this.metrics.meteorShowerCount++;
  }

  /**
   * P5.1b: Spawn an invasion wave event
   */
  private spawnInvasionWave(gameState: GameState, x: number, y: number): void {
    const event = gameState.addWorldEvent(
      'invasion_wave',
      x,
      y,
      GAME_CONSTANTS.INVASION_WAVE_SPAWN_RADIUS,
      GAME_CONSTANTS.INVASION_WAVE_DURATION,
      gameState.world.gameTime
    );
    event.spawnedCount = 0;
    this.metrics.invasionWaveCount++;
  }

  /**
   * P5.1c: Spawn a double XP zone event
   */
  private spawnDoubleXpZone(gameState: GameState, x: number, y: number): void {
    const event = gameState.addWorldEvent(
      'double_xp_zone',
      x,
      y,
      GAME_CONSTANTS.DOUBLE_XP_ZONE_RADIUS,
      GAME_CONSTANTS.DOUBLE_XP_ZONE_DURATION,
      gameState.world.gameTime
    );
    event.xpMultiplier = GAME_CONSTANTS.DOUBLE_XP_ZONE_MULTIPLIER;
    this.metrics.doubleXpZoneCount++;
  }

  /**
   * Schedule the next event
   */
  private scheduleNextEvent(): void {
    const minInterval = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL;
    const maxInterval = GAME_CONSTANTS.WORLD_EVENT_MAX_INTERVAL;
    const interval = minInterval + Math.random() * (maxInterval - minInterval);
    this.nextEventTime = this.lastEventTime + interval;
  }

  /**
   * Update all active events
   */
  private updateActiveEvents(gameState: GameState, deltaTime: number): void {
    const gameTime = gameState.world.gameTime;
    const eventsToRemove: string[] = [];

    gameState.worldEvents.forEach((event, eventId) => {
      if (!event.active) {
        eventsToRemove.push(eventId);
        return;
      }

      // Check if event has expired
      const elapsed = gameTime - event.startTime;
      if (elapsed >= event.duration) {
        event.active = false;
        eventsToRemove.push(eventId);
        return;
      }

      // Update event-specific logic
      switch (event.type) {
        case 'meteor_shower':
          this.updateMeteorShower(gameState, event, deltaTime);
          break;
        case 'invasion_wave':
          this.updateInvasionWave(gameState, event, deltaTime);
          break;
        // double_xp_zone doesn't need per-tick updates, just affects XP collection
      }
    });

    // Remove expired events
    for (const eventId of eventsToRemove) {
      gameState.removeWorldEvent(eventId);
    }
  }

  /**
   * Update meteor shower - spawn meteors that deal damage
   */
  private updateMeteorShower(gameState: GameState, event: WorldEventSchema, _deltaTime: number): void {
    // Spawn meteors at regular intervals
    // Use server-side tracking since events don't need per-meteor syncing
    const meteorInterval = GAME_CONSTANTS.METEOR_SHOWER_INTERVAL;

    // Calculate how many meteors should have spawned by now
    const elapsed = gameState.world.gameTime - event.startTime;
    const expectedMeteors = Math.floor(elapsed / meteorInterval);
    const currentMeteors = event.spawnedCount || 0;

    if (expectedMeteors > currentMeteors) {
      // Spawn a meteor
      const meteorCount = expectedMeteors - currentMeteors;
      for (let i = 0; i < meteorCount; i++) {
        this.spawnMeteor(gameState, event);
      }
      event.spawnedCount = expectedMeteors;
    }
  }

  /**
   * Spawn a single meteor within the event area
   */
  private spawnMeteor(gameState: GameState, event: WorldEventSchema): void {
    // Random position within event radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * event.radius;
    const x = event.x + Math.cos(angle) * distance;
    const y = event.y + Math.sin(angle) * distance;

    // Create a meteor projectile (return value tracked in gameState)
    gameState.addProjectile(
      'meteor', // New projectile type
      'world_event', // System-owned
      x,
      y,
      0, // No velocity (instant impact)
      0,
      GAME_CONSTANTS.METEOR_SHOWER_DAMAGE,
      0.5, // Short lifetime for visual
      GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS,
      999 // Hits multiple targets
    );

    this.metrics.meteorsSpawned++;

    // Deal damage to players in meteor radius
    gameState.players.forEach(player => {
      if (player.dead) return;
      const dx = player.x - x;
      const dy = player.y - y;
      const distSq = dx * dx + dy * dy;
      const radiusSq = GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS * GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS;
      if (distSq <= radiusSq) {
        player.takeDamage(GAME_CONSTANTS.METEOR_SHOWER_DAMAGE, 'meteor_shower');
      }
    });

    // Also damage enemies in meteor radius
    gameState.enemies.forEach(enemy => {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distSq = dx * dx + dy * dy;
      const radiusSq = GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS * GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS;
      if (distSq <= radiusSq) {
        enemy.health -= GAME_CONSTANTS.METEOR_SHOWER_DAMAGE;
      }
    });
  }

  /**
   * Update invasion wave - spawn extra enemies
   */
  private updateInvasionWave(gameState: GameState, event: WorldEventSchema, _deltaTime: number): void {
    const totalToSpawn = GAME_CONSTANTS.INVASION_WAVE_ENEMY_COUNT;
    const duration = GAME_CONSTANTS.INVASION_WAVE_DURATION;
    const spawnRate = totalToSpawn / duration;

    // Calculate how many should be spawned by now
    const elapsed = gameState.world.gameTime - event.startTime;
    const expectedSpawns = Math.min(totalToSpawn, Math.floor(elapsed * spawnRate));
    const currentSpawns = event.spawnedCount || 0;

    if (expectedSpawns > currentSpawns) {
      const toSpawn = expectedSpawns - currentSpawns;
      for (let i = 0; i < toSpawn; i++) {
        this.spawnInvasionEnemy(gameState, event);
      }
      event.spawnedCount = expectedSpawns;
    }
  }

  /**
   * Spawn an invasion enemy
   */
  private spawnInvasionEnemy(gameState: GameState, event: WorldEventSchema): void {
    // Pick a random enemy type (scaled by wave difficulty)
    const currentWave = gameState.world.currentWave;
    const enemyTypes = this.getEnemyTypesForWave(currentWave);
    const enemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];

    // Random position within event radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * event.radius;
    const x = event.x + Math.cos(angle) * distance;
    const y = event.y + Math.sin(angle) * distance;

    // Initialize enemy with proper stats
    const config = ENEMY_CONFIGS[enemyType];
    if (config) {
      const enemy = gameState.addEnemy(enemyType, x, y);
      enemy.health = config.health * gameState.world.difficulty;
      enemy.maxHealth = enemy.health;
      this.metrics.invasionEnemiesSpawned++;
    }
  }

  /**
   * Get appropriate enemy types based on current wave
   */
  private getEnemyTypesForWave(wave: number): string[] {
    if (wave < 2) return ['bat', 'skeleton'];
    if (wave < 4) return ['bat', 'skeleton', 'zombie', 'ghost'];
    if (wave < 6) return ['skeleton', 'zombie', 'ghost', 'slime'];
    return ['zombie', 'ghost', 'slime', 'demon'];
  }

  /**
   * Check if a player is inside a double XP zone
   */
  isInDoubleXpZone(gameState: GameState, playerX: number, playerY: number): number {
    let multiplier = 1;

    gameState.worldEvents.forEach(event => {
      if (event.type === 'double_xp_zone' && event.active) {
        const dx = playerX - event.x;
        const dy = playerY - event.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = event.radius * event.radius;
        if (distSq <= radiusSq) {
          multiplier = Math.max(multiplier, event.xpMultiplier);
        }
      }
    });

    return multiplier;
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
    this.nextEventTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL;
    this.lastEventTime = 0;
    this.eventIdCounter = 0;
    this.metrics = {
      totalEventsSpawned: 0,
      meteorShowerCount: 0,
      invasionWaveCount: 0,
      doubleXpZoneCount: 0,
      meteorsSpawned: 0,
      invasionEnemiesSpawned: 0
    };
  }
}
