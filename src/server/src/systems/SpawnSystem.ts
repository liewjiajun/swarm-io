import { GameState } from '../state/GameState.js';
import { GAME_CONSTANTS, WAVE_SCHEDULE, ENEMY_CONFIGS, SECRET_BOSS_CONFIG, SHAPESHIFTER_CONFIG } from '@swarm-io/shared';
import type { DayNightPhase } from '@swarm-io/shared';
import { randomPointOnCircle } from '@swarm-io/shared';
import { spawnSystemLogger } from '../utils/logger.js';

interface SpawnMetrics {
  totalSpawned: number;
  enemiesSpawned: number;
  bossesSpawned: number;
  spawnAttempts: number;
  validationErrors: number;
  lastSpawnTime: number;
  secretBossSpawned: boolean; // P5.3: Track if secret boss has been spawned
  shapeshiftersSpawned: number; // P5.6: Track total shapeshifters spawned
  dayNightTransitions: number; // P5.7: Track day/night cycle transitions
}

export class SpawnSystem {
  private lastSpawnTime = 0;
  private bossSpawned = new Set<number>(); // Track which waves have spawned bosses
  private secretBossTriggerTime = 0; // P5.3: Time when secret boss trigger was activated
  private secretBossTriggered = false; // P5.3: Whether secret boss spawn has been triggered
  private spawnMetrics: SpawnMetrics = {
    totalSpawned: 0,
    enemiesSpawned: 0,
    bossesSpawned: 0,
    spawnAttempts: 0,
    validationErrors: 0,
    lastSpawnTime: 0,
    secretBossSpawned: false, // P5.3
    shapeshiftersSpawned: 0, // P5.6
    dayNightTransitions: 0 // P5.7
  };

  // P5.7: Callback for day/night cycle announcements
  private dayNightAnnouncementCallback: ((phase: DayNightPhase) => void) | null = null;

  // P5.3: Callback for secret boss announcements
  private secretBossAnnouncementCallback: ((message: string) => void) | null = null;

  constructor() {
    spawnSystemLogger.info('Initialized with wave-based enemy spawning');
  }

  /**
   * P5.3: Set callback for secret boss announcements
   */
  setSecretBossAnnouncementCallback(callback: (message: string) => void): void {
    this.secretBossAnnouncementCallback = callback;
  }

  /**
   * P5.7: Set callback for day/night cycle announcements
   */
  setDayNightAnnouncementCallback(callback: (phase: DayNightPhase) => void): void {
    this.dayNightAnnouncementCallback = callback;
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

    // P5.7: Update day/night cycle
    this.updateDayNightCycle(gameState);

    // Handle boss spawning (immediate when wave becomes active)
    this.handleBossSpawning(gameState);

    // P5.3: Handle secret boss spawning (triggered by all players reaching level 15+)
    this.handleSecretBossSpawning(gameState);

    // Handle regular enemy spawning (rate limited)
    this.handleEnemySpawning(gameState, deltaTime);

    // Update metrics
    this.spawnMetrics.lastSpawnTime = gameState.world.gameTime;
  }

  /**
   * P5.7: Update day/night cycle and broadcast phase changes
   */
  private updateDayNightCycle(gameState: GameState): void {
    const phaseChanged = gameState.world.updateDayNightCycle();

    if (phaseChanged) {
      this.spawnMetrics.dayNightTransitions++;
      const newPhase = gameState.world.dayNightPhase as DayNightPhase;

      spawnSystemLogger.info({
        phase: newPhase,
        gameTime: gameState.world.gameTime,
        cycleTime: gameState.world.dayNightCycleTime
      }, `P5.7: Day/Night cycle changed to ${newPhase}`);

      // Send announcement
      if (this.dayNightAnnouncementCallback) {
        this.dayNightAnnouncementCallback(newPhase);
      }
    }
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

  /**
   * P5.3: Handle secret boss spawning
   * Trigger: All alive players reach level 15+
   * Spawn: At world center with announcement
   */
  private handleSecretBossSpawning(gameState: GameState): void {
    // Skip if already spawned
    if (this.spawnMetrics.secretBossSpawned) {
      return;
    }

    const currentTime = gameState.world.gameTime;

    // Get all living players
    const livingPlayers = Array.from(gameState.players.values()).filter(p => !p.dead);

    // Need at least 1 living player to trigger
    if (livingPlayers.length === 0) {
      return;
    }

    // Check if all living players are at or above the minimum level
    const allPlayersQualified = livingPlayers.every(
      p => p.level >= SECRET_BOSS_CONFIG.MIN_PLAYER_LEVEL
    );

    // Trigger phase: Set trigger time when condition first becomes true
    if (allPlayersQualified && !this.secretBossTriggered) {
      this.secretBossTriggered = true;
      this.secretBossTriggerTime = currentTime;

      spawnSystemLogger.info({
        playerCount: livingPlayers.length,
        minLevel: SECRET_BOSS_CONFIG.MIN_PLAYER_LEVEL,
        playerLevels: livingPlayers.map(p => p.level)
      }, 'P5.3: Secret boss trigger activated');

      // Send announcement
      if (this.secretBossAnnouncementCallback) {
        this.secretBossAnnouncementCallback('THE ANCIENT ONE AWAKENS...');
      }
    }

    // If not triggered yet, check if players dropped below requirement (reset trigger)
    if (this.secretBossTriggered && !allPlayersQualified) {
      // Players no longer qualify (perhaps one died and respawned at lower level)
      // Reset the trigger
      this.secretBossTriggered = false;
      this.secretBossTriggerTime = 0;
      spawnSystemLogger.info('P5.3: Secret boss trigger reset - players no longer qualify');
      return;
    }

    // Spawn phase: After delay, spawn the secret boss
    if (this.secretBossTriggered && !this.spawnMetrics.secretBossSpawned) {
      const timeSinceTrigger = currentTime - this.secretBossTriggerTime;

      if (timeSinceTrigger >= SECRET_BOSS_CONFIG.SPAWN_DELAY) {
        // Spawn at world center (0, 0)
        const boss = gameState.addEnemy('secret_boss', 0, 0);
        boss.initialize('secret_boss', gameState.world.difficulty);

        this.spawnMetrics.secretBossSpawned = true;
        this.spawnMetrics.bossesSpawned++;
        this.spawnMetrics.totalSpawned++;

        spawnSystemLogger.info({
          x: 0,
          y: 0,
          playerCount: livingPlayers.length,
          gameTime: currentTime
        }, 'P5.3: Secret boss spawned at world center');

        // Send final announcement
        if (this.secretBossAnnouncementCallback) {
          this.secretBossAnnouncementCallback('DEFEAT THE ANCIENT ONE!');
        }
      }
    }
  }

  private handleEnemySpawning(gameState: GameState, _deltaTime: number): void {
    const currentTime = gameState.world.gameTime;
    const playerCount = gameState.world.playerCount;

    // DEBUG: Log spawn system state periodically (every ~5 seconds of game time)
    if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime) !== Math.floor(this.lastSpawnTime)) {
      spawnSystemLogger.debug({ gameTime: currentTime, playerCount, enemyCount: gameState.enemies.size, phase: gameState.world.dayNightPhase }, 'Spawn system state');
    }

    // Calculate spawn interval based on player count
    const baseSpawnInterval = GAME_CONSTANTS.ENEMY_SPAWN_INTERVAL; // 0.5 seconds
    let spawnInterval = Math.max(0.1, baseSpawnInterval - (playerCount * 0.02));

    // P5.7: Apply day/night spawn multiplier
    // During night (NIGHT_SPAWN_MULTIPLIER = 2.0), spawn interval is halved for 2x spawn rate
    const spawnMultiplier = gameState.world.isNighttime()
      ? GAME_CONSTANTS.NIGHT_SPAWN_MULTIPLIER
      : GAME_CONSTANTS.DAY_SPAWN_MULTIPLIER;
    spawnInterval = spawnInterval / spawnMultiplier;

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

      // P5.6: Chance to spawn shapeshifter instead of regular enemy
      const shouldSpawnShapeshifter = this.shouldSpawnShapeshifter(gameState, currentTime);

      if (shouldSpawnShapeshifter) {
        const shapeshifter = this.spawnShapeshifter(gameState, spawnPos);
        if (shapeshifter) {
          this.spawnMetrics.enemiesSpawned++;
          this.spawnMetrics.totalSpawned++;
          this.spawnMetrics.shapeshiftersSpawned++;
          continue; // Skip regular enemy spawn
        }
      }

      // Create enemy and initialize with difficulty scaling
      const enemy = gameState.addEnemy(enemyType, spawnPos.x, spawnPos.y);
      enemy.initialize(enemyType, gameState.world.difficulty);
      this.spawnMetrics.enemiesSpawned++;
      this.spawnMetrics.totalSpawned++;
    }

    this.lastSpawnTime = currentTime;
  }

  /**
   * P5.6: Check if a shapeshifter should spawn
   */
  private shouldSpawnShapeshifter(gameState: GameState, currentTime: number): boolean {
    // Check minimum game time (after wave 5, ~90s)
    if (currentTime < SHAPESHIFTER_CONFIG.MIN_GAME_TIME) {
      return false;
    }

    // Count active shapeshifters
    let activeShapeshifters = 0;
    gameState.enemies.forEach(enemy => {
      if (enemy.type === 'shapeshifter') {
        activeShapeshifters++;
      }
    });

    // Check max active limit
    if (activeShapeshifters >= SHAPESHIFTER_CONFIG.MAX_ACTIVE) {
      return false;
    }

    // Check spawn chance (3%)
    return Math.random() < SHAPESHIFTER_CONFIG.SPAWN_CHANCE;
  }

  /**
   * P5.6: Spawn a shapeshifter enemy that copies a random player's weapons
   */
  private spawnShapeshifter(
    gameState: GameState,
    spawnPos: { x: number; y: number }
  ): ReturnType<typeof gameState.addEnemy> | null {
    // Get all living players with weapons
    const livingPlayers = Array.from(gameState.players.values()).filter(
      p => !p.dead && p.weapons && p.weapons.length > 0
    );

    if (livingPlayers.length === 0) {
      return null; // No players to copy
    }

    // Select random player to copy
    const targetPlayer = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];

    // Create shapeshifter enemy
    const shapeshifter = gameState.addEnemy('shapeshifter', spawnPos.x, spawnPos.y);
    shapeshifter.initialize('shapeshifter', gameState.world.difficulty);

    // Copy player's weapons (extract weapon types)
    const copiedWeaponTypes = targetPlayer.weapons.map(w => w.type);
    shapeshifter.copiedPlayerId = targetPlayer.id;
    shapeshifter.copiedWeapons = JSON.stringify(copiedWeaponTypes);
    shapeshifter.shapeshifterLastCopyTime = gameState.world.gameTime;

    // Initialize weapon cooldowns
    copiedWeaponTypes.forEach(weaponType => {
      shapeshifter.shapeshifterWeaponCooldowns.set(weaponType, 0);
    });

    spawnSystemLogger.info({
      shapeshifterId: shapeshifter.id,
      copiedPlayerId: targetPlayer.id,
      copiedWeapons: copiedWeaponTypes,
      x: spawnPos.x,
      y: spawnPos.y
    }, 'P5.6: Shapeshifter spawned');

    return shapeshifter;
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
    // P5.3: Reset secret boss state
    this.secretBossTriggered = false;
    this.secretBossTriggerTime = 0;
    this.spawnMetrics = {
      totalSpawned: 0,
      enemiesSpawned: 0,
      bossesSpawned: 0,
      spawnAttempts: 0,
      validationErrors: 0,
      lastSpawnTime: 0,
      secretBossSpawned: false, // P5.3
      shapeshiftersSpawned: 0, // P5.6
      dayNightTransitions: 0 // P5.7
    };
    spawnSystemLogger.info('Reset for new game');
  }

  /**
   * P5.7: Get day/night cycle status for monitoring
   */
  getDayNightStatus(gameState: GameState): { phase: string; cycleTime: number; transitions: number } {
    return {
      phase: gameState.world.dayNightPhase,
      cycleTime: gameState.world.dayNightCycleTime,
      transitions: this.spawnMetrics.dayNightTransitions
    };
  }

  /**
   * P5.3: Get secret boss status for monitoring
   */
  getSecretBossStatus(): { triggered: boolean; spawned: boolean; triggerTime: number } {
    return {
      triggered: this.secretBossTriggered,
      spawned: this.spawnMetrics.secretBossSpawned,
      triggerTime: this.secretBossTriggerTime
    };
  }
}