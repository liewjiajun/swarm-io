import { GameState } from '../state/GameState.js';
import { GAME_CONSTANTS, WAVE_SCHEDULE, ENEMY_CONFIGS } from '@swarm-io/shared';
import { randomPointOnCircle } from '@swarm-io/shared';
import { spawnSystemLogger } from '../utils/logger.js';

interface SpawnMetrics {
  totalSpawned: number;
  enemiesSpawned: number;
  bossesSpawned: number;
  spawnAttempts: number;
  validationErrors: number;
  lastSpawnTime: number;
}

export class SpawnSystem {
  private lastSpawnTime = 0;
  private bossSpawned = new Set<number>(); // Track which waves have spawned bosses
  private spawnMetrics: SpawnMetrics = {
    totalSpawned: 0,
    enemiesSpawned: 0,
    bossesSpawned: 0,
    spawnAttempts: 0,
    validationErrors: 0,
    lastSpawnTime: 0
  };

  constructor() {
    spawnSystemLogger.info('Initialized with wave-based enemy spawning');
  }

  update(gameState: GameState, deltaTime: number): void {
    // Security validation: Ensure gameTime is monotonically increasing
    if (gameState.world.gameTime < this.lastSpawnTime - deltaTime) {
      this.logSecurityViolation('Time manipulation detected', {
        currentTime: gameState.world.gameTime,
        lastSpawnTime: this.lastSpawnTime
      });
      return;
    }

    // Update game time and current wave
    this.updateWaveProgression(gameState);

    // Handle boss spawning (immediate when wave becomes active)
    this.handleBossSpawning(gameState);

    // Handle regular enemy spawning (rate limited)
    this.handleEnemySpawning(gameState, deltaTime);

    // Update metrics
    this.spawnMetrics.lastSpawnTime = gameState.world.gameTime;
  }

  private updateWaveProgression(gameState: GameState): void {
    const gameTime = gameState.world.gameTime;

    // Find current wave by matching time thresholds
    let currentWave = 0;
    for (let i = WAVE_SCHEDULE.length - 1; i >= 0; i--) {
      if (gameTime >= WAVE_SCHEDULE[i].time) {
        currentWave = i;
        break;
      }
    }

    // Update world state if wave changed
    if (gameState.world.currentWave !== currentWave) {
      const oldWave = gameState.world.currentWave;
      gameState.world.currentWave = currentWave;

      spawnSystemLogger.info({ oldWave, currentWave, gameTime }, 'Wave progression');
    }

    // Update difficulty scaling
    gameState.world.updateDifficulty();
  }

  private handleBossSpawning(gameState: GameState): void {
    const currentWave = gameState.world.currentWave;
    const wave = WAVE_SCHEDULE[currentWave];

    // Check if wave has boss and hasn't been spawned yet
    if (wave.bossType && !this.bossSpawned.has(currentWave)) {
      // Security validation: Ensure boss type exists
      if (!ENEMY_CONFIGS[wave.bossType]) {
        this.logSecurityViolation('Invalid boss type', {
          wave: currentWave,
          bossType: wave.bossType
        });
        return;
      }

      // Spawn boss near world center
      const spawnRadius = gameState.world.worldRadius * 0.3; // 30% from center
      const spawnPos = randomPointOnCircle(spawnRadius);

      // Validate spawn position
      if (!this.validateSpawnPosition(spawnPos, gameState.world.worldRadius)) {
        this.logSecurityViolation('Invalid boss spawn position', spawnPos);
        return;
      }

      // Create boss enemy and initialize with difficulty scaling
      const boss = gameState.addEnemy(wave.bossType, spawnPos.x, spawnPos.y);
      boss.initialize(wave.bossType, gameState.world.difficulty);
      this.bossSpawned.add(currentWave);
      this.spawnMetrics.bossesSpawned++;
      this.spawnMetrics.totalSpawned++;

      spawnSystemLogger.info({ bossType: wave.bossType, x: spawnPos.x, y: spawnPos.y, wave: currentWave }, 'Boss spawned');
    }
  }

  private handleEnemySpawning(gameState: GameState, _deltaTime: number): void {
    const currentTime = gameState.world.gameTime;
    const playerCount = gameState.world.playerCount;

    // DEBUG: Log spawn system state periodically (every ~5 seconds of game time)
    if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime) !== Math.floor(this.lastSpawnTime)) {
      spawnSystemLogger.debug({ gameTime: currentTime, playerCount, enemyCount: gameState.enemies.size }, 'Spawn system state');
    }

    // Calculate spawn interval based on player count
    const baseSpawnInterval = GAME_CONSTANTS.ENEMY_SPAWN_INTERVAL; // 0.5 seconds
    const spawnInterval = Math.max(0.1, baseSpawnInterval - (playerCount * 0.02));

    // Check if enough time has passed since last spawn
    if (currentTime - this.lastSpawnTime < spawnInterval) {
      return;
    }

    // Check spawn cap: max (playerCount * 50) enemies
    const maxEnemies = playerCount * 50;
    // Use .size for MapSchema, not Object.keys().length
    const currentEnemyCount = gameState.enemies.size;

    if (currentEnemyCount >= maxEnemies) {
      return; // Spawn cap reached
    }

    // Security validation: Validate player count
    if (playerCount <= 0 || playerCount > 150 || !Number.isFinite(playerCount)) {
      this.logSecurityViolation('Invalid player count for spawning', { playerCount });
      return;
    }

    this.spawnMetrics.spawnAttempts++;

    // Get current wave configuration
    const currentWave = gameState.world.currentWave;
    const wave = WAVE_SCHEDULE[currentWave];

    if (!wave || !wave.enemies) {
      this.logSecurityViolation('Invalid wave configuration', { wave: currentWave });
      return;
    }

    // BUG-041: Batch spawning - spawn 2-3 enemies per cycle for better gameplay pacing
    const batchSize = 2 + Math.floor(Math.random() * 2); // Random 2-3 enemies
    const enemiesToSpawn = Math.min(batchSize, maxEnemies - currentEnemyCount);

    for (let i = 0; i < enemiesToSpawn; i++) {
      // Select enemy type using weighted random selection
      const enemyType = this.selectEnemyType(wave.enemies);
      if (!enemyType || !ENEMY_CONFIGS[enemyType]) {
        this.logSecurityViolation('Invalid enemy type selected', { enemyType, wave: currentWave });
        continue;
      }

      // Generate spawn position
      const spawnPos = this.generateSpawnPosition(gameState);
      if (!this.validateSpawnPosition(spawnPos, gameState.world.worldRadius)) {
        this.logSecurityViolation('Invalid spawn position', spawnPos);
        continue;
      }

      // Create enemy and initialize with difficulty scaling
      const enemy = gameState.addEnemy(enemyType, spawnPos.x, spawnPos.y);
      enemy.initialize(enemyType, gameState.world.difficulty);
      this.spawnMetrics.enemiesSpawned++;
      this.spawnMetrics.totalSpawned++;
    }

    this.lastSpawnTime = currentTime;
  }

  private selectEnemyType(enemies: { [type: string]: number }): string | null {
    // Calculate total weight
    const totalWeight = Object.values(enemies).reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      return null;
    }

    // Select random value within total weight
    let random = Math.random() * totalWeight;

    // Find selected enemy type
    for (const [type, weight] of Object.entries(enemies)) {
      random -= weight;
      if (random <= 0) {
        return type;
      }
    }

    // Fallback to first enemy type
    return Object.keys(enemies)[0] || null;
  }

  private generateSpawnPosition(gameState: GameState): { x: number; y: number } {
    const worldRadius = gameState.world.worldRadius;

    // 70% chance to spawn near a random living player
    const livingPlayers = Array.from(gameState.players.values()).filter(player => !player.dead);

    if (livingPlayers.length > 0 && Math.random() < 0.7) {
      // Spawn near random player
      const targetPlayer = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
      const angle = Math.random() * Math.PI * 2;
      const distance = GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE; // 30 units

      return {
        x: targetPlayer.x + Math.cos(angle) * distance,
        y: targetPlayer.y + Math.sin(angle) * distance
      };
    } else {
      // Spawn at world edge (30 units outside visible area)
      const spawnRadius = worldRadius + GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE;
      return randomPointOnCircle(spawnRadius);
    }
  }

  private validateSpawnPosition(pos: { x: number; y: number }, worldRadius: number): boolean {
    // Check for finite coordinates
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      return false;
    }

    // Check reasonable bounds (allow spawning outside world for edge spawns)
    const maxDistance = worldRadius + GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE + 50; // Extra margin
    const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

    if (distance > maxDistance) {
      return false;
    }

    return true;
  }

  private logSecurityViolation(reason: string, data: any): void {
    spawnSystemLogger.warn({ reason, ...data }, 'Security violation');
    this.spawnMetrics.validationErrors++;
  }

  // Public methods for monitoring and debugging
  getSpawnMetrics(): SpawnMetrics {
    return { ...this.spawnMetrics };
  }

  getBossSpawnStatus(): { wave: number; spawned: boolean }[] {
    return WAVE_SCHEDULE.map((wave, index) => ({
      wave: index,
      spawned: this.bossSpawned.has(index)
    })).filter(status => WAVE_SCHEDULE[status.wave].bossType);
  }

  reset(): void {
    this.lastSpawnTime = 0;
    this.bossSpawned.clear();
    this.spawnMetrics = {
      totalSpawned: 0,
      enemiesSpawned: 0,
      bossesSpawned: 0,
      spawnAttempts: 0,
      validationErrors: 0,
      lastSpawnTime: 0
    };
    spawnSystemLogger.info('Reset for new game');
  }
}