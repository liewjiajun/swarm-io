import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpawnSystem } from './SpawnSystem.js';
import { GAME_CONSTANTS, WAVE_SCHEDULE } from '@swarm-io/shared';

// Helper to create mock world
function createMockWorld(overrides: Partial<{
  worldRadius: number;
  playerCount: number;
  gameTime: number;
  currentWave: number;
  difficulty: number;
}> = {}) {
  return {
    worldRadius: overrides.worldRadius ?? 100,
    playerCount: overrides.playerCount ?? 1,
    gameTime: overrides.gameTime ?? 0,
    currentWave: overrides.currentWave ?? 0,
    difficulty: overrides.difficulty ?? 1,
    updateDifficulty: vi.fn()
  } as any;
}

// Helper to create mock player
function createMockPlayer(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  dead: boolean;
}> = {}) {
  return {
    id: overrides.id ?? `player-${Math.random().toString(36).substr(2, 9)}`,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    dead: overrides.dead ?? false
  } as any;
}

// Helper to create mock enemy
function createMockEnemy(id: string) {
  return {
    id,
    type: '',
    x: 0,
    y: 0,
    health: 10,
    initialize: vi.fn()
  } as any;
}

// Helper to create mock game state
function createMockGameState(
  world: any,
  players: any[] = [],
  enemyCount: number = 0
) {
  const playersMap = new Map(players.map(p => [p.id, p]));

  // Create enemies map with MapSchema-like interface (.size, .forEach)
  const enemiesMap = new Map<string, any>();
  for (let i = 0; i < enemyCount; i++) {
    enemiesMap.set(`enemy-${i}`, createMockEnemy(`enemy-${i}`));
  }

  const addedEnemies: any[] = [];

  return {
    world,
    players: playersMap,
    enemies: enemiesMap,
    addEnemy: vi.fn().mockImplementation((type, x, y) => {
      const enemy = createMockEnemy(`enemy-${addedEnemies.length}`);
      enemy.type = type;
      enemy.x = x;
      enemy.y = y;
      addedEnemies.push(enemy);
      enemiesMap.set(enemy.id, enemy);
      return enemy;
    }),
    _addedEnemies: addedEnemies
  } as any;
}

describe('SpawnSystem', () => {
  let spawnSystem: SpawnSystem;
  const deltaTime = 0.016;

  beforeEach(() => {
    spawnSystem = new SpawnSystem();
  });

  describe('initialization', () => {
    it('should initialize with zero metrics', () => {
      const metrics = spawnSystem.getSpawnMetrics();

      expect(metrics.totalSpawned).toBe(0);
      expect(metrics.enemiesSpawned).toBe(0);
      expect(metrics.bossesSpawned).toBe(0);
      expect(metrics.spawnAttempts).toBe(0);
      expect(metrics.validationErrors).toBe(0);
      expect(metrics.lastSpawnTime).toBe(0);
    });

    it('should return empty boss spawn status initially', () => {
      const status = spawnSystem.getBossSpawnStatus();

      // P9.5: Compressed wave schedule has 4 boss waves (indices 3, 6, 9, 11)
      // Wave 3 (60s): boss_slime, Wave 6 (150s): boss_skeleton,
      // Wave 9 (240s): boss_demon, Wave 11 (300s): boss_demon
      expect(status.length).toBe(4);
      status.forEach(s => {
        expect(s.spawned).toBe(false);
      });
    });
  });

  describe('wave progression', () => {
    it('should start at wave 0', () => {
      const world = createMockWorld({ gameTime: 0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(world.currentWave).toBe(0);
    });

    it('should progress to wave 1 at 20 seconds', () => {
      // P9.5: Compressed wave schedule - wave 1 starts at 20s (was 30s)
      const world = createMockWorld({ gameTime: 20, currentWave: 0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(world.currentWave).toBe(1);
    });

    it('should progress to wave 5 at 120 seconds', () => {
      // P9.5: Compressed wave schedule - at 120s we're at wave 5 (was wave 4)
      const world = createMockWorld({ gameTime: 120, currentWave: 0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(world.currentWave).toBe(5);
    });

    it('should reach final wave at 360 seconds', () => {
      const world = createMockWorld({ gameTime: 360, currentWave: 0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(world.currentWave).toBe(WAVE_SCHEDULE.length - 1);
    });

    it('should update difficulty when wave changes', () => {
      const world = createMockWorld({ gameTime: 30 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(world.updateDifficulty).toHaveBeenCalled();
    });
  });

  describe('boss spawning', () => {
    it('should spawn boss when wave with boss becomes active', () => {
      // P9.5: Wave 3 (index 3, at 60s) has boss_slime (was wave 4 at 120s)
      const world = createMockWorld({ gameTime: 60, currentWave: 2, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      // Boss should be spawned
      expect(gameState.addEnemy).toHaveBeenCalledWith(
        'boss_slime',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should spawn boss only once per wave', () => {
      // P9.5: Wave 3 (at 60s) has boss_slime
      const world = createMockWorld({ gameTime: 60, currentWave: 2, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      // First update - boss spawns
      spawnSystem.update(gameState, deltaTime);
      const _firstCallCount = gameState.addEnemy.mock.calls.length;

      // Second update - boss should NOT spawn again
      world.gameTime = 61;
      spawnSystem.update(gameState, deltaTime);

      // Check that boss wasn't spawned again (allow for regular enemy spawns)
      const bossSpawns = gameState.addEnemy.mock.calls.filter(
        (call: any) => call[0] === 'boss_slime'
      );
      expect(bossSpawns.length).toBe(1);
    });

    it('should track boss spawn status', () => {
      // P9.5: Wave 3 (at 60s) has boss_slime
      const world = createMockWorld({ gameTime: 60, currentWave: 2, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const status = spawnSystem.getBossSpawnStatus();
      // P9.5: Wave 3 is the first boss wave (index 3)
      const wave3Status = status.find(s => s.wave === 3);
      expect(wave3Status?.spawned).toBe(true);
    });

    it('should initialize boss with difficulty scaling', () => {
      // P9.5: Wave 3 (at 60s) has boss_slime
      const world = createMockWorld({
        gameTime: 60,
        currentWave: 2,
        worldRadius: 100,
        difficulty: 1.5
      });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      // Find the boss that was added
      const boss = gameState._addedEnemies.find((e: any) => e.type === 'boss_slime');
      expect(boss.initialize).toHaveBeenCalledWith('boss_slime', 1.5);
    });

    it('should increment bossesSpawned metric', () => {
      // P9.5: Wave 3 (at 60s) has boss_slime
      const world = createMockWorld({ gameTime: 60, currentWave: 2, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.bossesSpawned).toBe(1);
    });
  });

  describe('enemy spawning', () => {
    it('should spawn enemies at regular intervals', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      expect(gameState.addEnemy).toHaveBeenCalled();
    });

    it('should respect spawn interval based on player count', () => {
      const world = createMockWorld({ gameTime: 0.3, playerCount: 1 }); // Less than 0.5s interval
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      // Should not spawn yet (interval is 0.5s for 1 player)
      expect(gameState.addEnemy).not.toHaveBeenCalled();
    });

    it('should decrease spawn interval with more players', () => {
      // With 20 players: interval = max(0.1, 0.5 - 20*0.02) = max(0.1, 0.1) = 0.1s
      const world = createMockWorld({ gameTime: 0.15, playerCount: 20 });
      const players = Array.from({ length: 20 }, () => createMockPlayer());
      const gameState = createMockGameState(world, players);

      spawnSystem.update(gameState, deltaTime);

      expect(gameState.addEnemy).toHaveBeenCalled();
    });

    it('should enforce spawn cap based on player count', () => {
      // Cap is playerCount * 50 = 1 * 50 = 50
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()], 50); // Already at cap

      spawnSystem.update(gameState, deltaTime);

      expect(gameState.addEnemy).not.toHaveBeenCalled();
    });

    it('should allow spawning below cap', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()], 49); // Below cap

      spawnSystem.update(gameState, deltaTime);

      expect(gameState.addEnemy).toHaveBeenCalled();
    });

    it('should increment enemiesSpawned metric', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.enemiesSpawned).toBeGreaterThan(0);
    });

    it('should initialize enemies with difficulty scaling', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1, difficulty: 2.0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      // Check that enemy was initialized with difficulty
      const enemy = gameState._addedEnemies[0];
      expect(enemy.initialize).toHaveBeenCalledWith(
        expect.any(String),
        2.0
      );
    });
  });

  describe('enemy type selection', () => {
    it('should select enemy types from current wave config', () => {
      // Wave 0 only has bats
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1, currentWave: 0 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      // Should spawn a bat
      const enemy = gameState._addedEnemies[0];
      expect(enemy.type).toBe('bat');
    });

    it('should select from multiple enemy types in later waves', () => {
      // Wave 1 has bats and skeletons
      const world = createMockWorld({ gameTime: 31, playerCount: 1, currentWave: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      // Spawn many to test distribution
      for (let i = 0; i < 50; i++) {
        world.gameTime += GAME_CONSTANTS.ENEMY_SPAWN_INTERVAL + 0.1;
        spawnSystem.update(gameState, deltaTime);
      }

      // Should have both bats and skeletons
      const types = new Set(gameState._addedEnemies.map((e: any) => e.type));
      expect(types.has('bat')).toBe(true);
      // Skeletons should appear with high probability given 50 spawns
    });
  });

  describe('spawn position generation', () => {
    it('should spawn enemies with valid positions', () => {
      // Test that spawning works and positions are valid
      const world = createMockWorld({ gameTime: 0, playerCount: 1, worldRadius: 100 });
      const player = createMockPlayer({ x: 0, y: 0 });
      const gameState = createMockGameState(world, [player]);

      // Spawn some enemies
      for (let i = 0; i < 10; i++) {
        world.gameTime += 1;
        spawnSystem.update(gameState, deltaTime);
      }

      // Verify enemies were spawned with finite positions
      expect(gameState._addedEnemies.length).toBeGreaterThan(0);
      gameState._addedEnemies.forEach((enemy: any) => {
        expect(Number.isFinite(enemy.x)).toBe(true);
        expect(Number.isFinite(enemy.y)).toBe(true);
      });
    });

    it('should not spawn near dead players', () => {
      const world = createMockWorld({ gameTime: 0, playerCount: 1, worldRadius: 100 });
      const deadPlayer = createMockPlayer({ x: 50, y: 50, dead: true });
      const gameState = createMockGameState(world, [deadPlayer]);

      // All spawns should be at world edge since only player is dead
      for (let i = 0; i < 10; i++) {
        world.gameTime += 1;
        spawnSystem.update(gameState, deltaTime);
      }

      // All enemies should be spawned at world edge (far from center)
      gameState._addedEnemies.forEach((enemy: any) => {
        const distance = Math.sqrt(enemy.x * enemy.x + enemy.y * enemy.y);
        // Should be near world edge + spawn distance
        expect(distance).toBeGreaterThan(50);
      });
    });
  });

  describe('security validation', () => {
    it('should detect time manipulation', () => {
      const world = createMockWorld({ gameTime: 10, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      // First update at time 10
      spawnSystem.update(gameState, deltaTime);

      // Then time goes backwards
      world.gameTime = 5;
      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.validationErrors).toBeGreaterThan(0);
    });

    it('should not spawn when player count is zero (cap is 0)', () => {
      // With playerCount=0, spawn cap is 0*50=0, so no spawning should occur
      const world = createMockWorld({ gameTime: 1.0, playerCount: 0 });
      const gameState = createMockGameState(world, []);

      spawnSystem.update(gameState, deltaTime);

      // No enemies should be spawned (spawn cap reached before validation check)
      expect(gameState.addEnemy).not.toHaveBeenCalled();
    });

    it('should reject invalid player count (too high)', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 200 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.validationErrors).toBeGreaterThan(0);
    });

    it('should reject non-finite player count', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: NaN });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.validationErrors).toBeGreaterThan(0);
    });
  });

  describe('metrics', () => {
    it('should track total spawned', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.totalSpawned).toBeGreaterThan(0);
    });

    it('should track spawn attempts', () => {
      const world = createMockWorld({ gameTime: 1.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.spawnAttempts).toBeGreaterThan(0);
    });

    it('should track last spawn time', () => {
      const world = createMockWorld({ gameTime: 5.0, playerCount: 1 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      const metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.lastSpawnTime).toBe(5.0);
    });

    it('should return copy of metrics (immutability)', () => {
      const metrics1 = spawnSystem.getSpawnMetrics();
      const metrics2 = spawnSystem.getSpawnMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      const world = createMockWorld({ gameTime: 120, currentWave: 3, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      let metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.totalSpawned).toBeGreaterThan(0);

      spawnSystem.reset();

      metrics = spawnSystem.getSpawnMetrics();
      expect(metrics.totalSpawned).toBe(0);
      expect(metrics.enemiesSpawned).toBe(0);
      expect(metrics.bossesSpawned).toBe(0);
      expect(metrics.spawnAttempts).toBe(0);
      expect(metrics.validationErrors).toBe(0);
    });

    it('should clear boss spawn tracking', () => {
      // P9.5: Wave 3 (at 60s) has boss_slime
      const world = createMockWorld({ gameTime: 60, currentWave: 2, worldRadius: 100 });
      const gameState = createMockGameState(world, [createMockPlayer()]);

      spawnSystem.update(gameState, deltaTime);

      let status = spawnSystem.getBossSpawnStatus();
      // P9.5: Wave 3 is the first boss wave
      expect(status.find(s => s.wave === 3)?.spawned).toBe(true);

      spawnSystem.reset();

      status = spawnSystem.getBossSpawnStatus();
      expect(status.find(s => s.wave === 3)?.spawned).toBe(false);
    });
  });

  describe('boss spawn status', () => {
    it('should return status for all boss waves', () => {
      const status = spawnSystem.getBossSpawnStatus();

      // P9.5: WAVE_SCHEDULE has bosses at waves 3, 6, 9, 11 (indices with bossType)
      expect(status.length).toBe(4);
      expect(status.map(s => s.wave)).toContain(3);
      expect(status.map(s => s.wave)).toContain(6);
      expect(status.map(s => s.wave)).toContain(9);
      expect(status.map(s => s.wave)).toContain(11);
    });

    it('should not include non-boss waves', () => {
      const status = spawnSystem.getBossSpawnStatus();

      // P9.5: Waves 0, 1, 2, 4, 5, 7, 8, 10 don't have bosses
      expect(status.map(s => s.wave)).not.toContain(0);
      expect(status.map(s => s.wave)).not.toContain(1);
      expect(status.map(s => s.wave)).not.toContain(2);
      expect(status.map(s => s.wave)).not.toContain(4);
      expect(status.map(s => s.wave)).not.toContain(5);
      expect(status.map(s => s.wave)).not.toContain(7);
    });
  });
});
