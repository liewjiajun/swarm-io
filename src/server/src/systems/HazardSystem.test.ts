import { describe, it, expect, beforeEach } from 'vitest';
import { HazardSystem } from './HazardSystem';
import { GameState } from '../state/GameState';
import { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS } from '@swarm-io/shared';

describe('HazardSystem', () => {
  let hazardSystem: HazardSystem;
  let gameState: GameState;
  let spatialHash: SpatialHash;

  beforeEach(() => {
    hazardSystem = new HazardSystem();
    gameState = new GameState();
    spatialHash = new SpatialHash(50);
  });

  describe('initialization', () => {
    it('should initialize with default metrics', () => {
      const metrics = hazardSystem.getMetrics();
      expect(metrics.totalSpawned).toBe(0);
      expect(metrics.lavaSpawned).toBe(0);
      expect(metrics.iceSpawned).toBe(0);
      expect(metrics.teleporterSpawned).toBe(0);
      expect(metrics.totalDamageDealt).toBe(0);
      expect(metrics.totalTeleports).toBe(0);
      expect(metrics.totalDespawned).toBe(0);
    });

    it('should reset metrics when reset is called', () => {
      // Force spawn some hazards manually to increment metrics
      gameState.addHazard('lava', 0, 0, 4, 60);

      hazardSystem.reset();

      const metrics = hazardSystem.getMetrics();
      expect(metrics.totalSpawned).toBe(0);
      expect(metrics.lavaSpawned).toBe(0);
    });
  });

  describe('spawning', () => {
    it('should not spawn hazards without players', () => {
      // Advance game time beyond spawn interval
      gameState.world.gameTime = GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL + 10;

      hazardSystem.update(gameState, spatialHash, 0.016);

      // No hazards should spawn without players
      expect(gameState.hazards.size).toBe(0);
    });

    it('should not exceed max active hazards', () => {
      // Add hazards up to max limit
      for (let i = 0; i < GAME_CONSTANTS.HAZARD_MAX_ACTIVE; i++) {
        gameState.addHazard('lava', i * 30, 0, 4, 60);
      }

      // Add a player for spawning
      gameState.addPlayer('player1', 100, 100);
      gameState.world.gameTime = GAME_CONSTANTS.HAZARD_MAX_SPAWN_INTERVAL + 1;

      hazardSystem.update(gameState, spatialHash, 0.016);

      // Should not exceed max
      expect(gameState.hazards.size).toBeLessThanOrEqual(GAME_CONSTANTS.HAZARD_MAX_ACTIVE);
    });
  });

  describe('lava mechanics', () => {
    it('should deal DOT damage to player standing in lava', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 100;
      player.invulnerableTime = 0;
      player.shieldTime = 0;

      const lava = gameState.addHazard('lava', 0, 0, 4, 60);
      lava.active = true;

      // Simulate 1 second in lava
      hazardSystem.update(gameState, spatialHash, 1.0);

      const expectedDamage = GAME_CONSTANTS.HAZARD_LAVA_DAMAGE_PER_SECOND * 1.0;
      expect(player.health).toBeCloseTo(100 - expectedDamage, 1);
    });

    it('should not damage invulnerable player', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 100;
      player.invulnerableTime = 5; // Invulnerable

      gameState.addHazard('lava', 0, 0, 4, 60);

      hazardSystem.update(gameState, spatialHash, 1.0);

      expect(player.health).toBe(100);
    });

    it('should not damage player with shield', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 100;
      player.invulnerableTime = 0;
      player.shieldTime = 5; // Shielded

      gameState.addHazard('lava', 0, 0, 4, 60);

      hazardSystem.update(gameState, spatialHash, 1.0);

      expect(player.health).toBe(100);
    });

    it('should kill player when health reaches 0 from lava', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 10;
      player.invulnerableTime = 0;
      player.shieldTime = 0;

      gameState.addHazard('lava', 0, 0, 4, 60);

      // Deal more damage than health
      hazardSystem.update(gameState, spatialHash, 10.0);

      expect(player.health).toBe(0);
      expect(player.dead).toBe(true);
      expect(player.killedBy).toBe('lava');
    });

    it('should not damage player outside lava radius', () => {
      const player = gameState.addPlayer('player1', 20, 20); // Far from lava
      player.health = 100;
      player.invulnerableTime = 0;

      gameState.addHazard('lava', 0, 0, 4, 60);

      hazardSystem.update(gameState, spatialHash, 1.0);

      expect(player.health).toBe(100);
    });
  });

  describe('ice mechanics', () => {
    it('should track player in ice patch', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      const ice = gameState.addHazard('ice', 0, 0, 5, 45);
      ice.active = true;

      hazardSystem.update(gameState, spatialHash, 0.016);

      expect(hazardSystem.isPlayerInIce(player.id)).toBe(true);
    });

    it('should return ice speed multiplier for player in ice', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      const ice = gameState.addHazard('ice', 0, 0, 5, 45);
      ice.active = true;

      hazardSystem.update(gameState, spatialHash, 0.016);

      expect(hazardSystem.getSpeedMultiplier(player.id)).toBe(GAME_CONSTANTS.HAZARD_ICE_SLOW_MULTIPLIER);
    });

    it('should return normal speed multiplier for player not in ice', () => {
      const player = gameState.addPlayer('player1', 100, 100); // Far from ice

      gameState.addHazard('ice', 0, 0, 5, 45);

      hazardSystem.update(gameState, spatialHash, 0.016);

      expect(hazardSystem.getSpeedMultiplier(player.id)).toBe(1);
    });

    it('should clear ice tracking each frame', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      const ice = gameState.addHazard('ice', 0, 0, 5, 45);
      ice.active = true;

      // First update - player in ice
      hazardSystem.update(gameState, spatialHash, 0.016);
      expect(hazardSystem.isPlayerInIce(player.id)).toBe(true);

      // Move player out of ice
      player.x = 100;
      player.y = 100;

      // Second update - player not in ice
      hazardSystem.update(gameState, spatialHash, 0.016);
      expect(hazardSystem.isPlayerInIce(player.id)).toBe(false);
    });
  });

  describe('teleporter mechanics', () => {
    it('should teleport player to linked teleporter', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      // Create linked teleporter pair
      const teleporter1 = gameState.addHazard('teleporter', 0, 0, 2, 90);
      const teleporter2 = gameState.addHazard('teleporter', 50, 50, 2, 90);
      teleporter1.linkedHazardId = teleporter2.id;
      teleporter2.linkedHazardId = teleporter1.id;
      teleporter1.active = true;
      teleporter2.active = true;

      gameState.world.gameTime = 10;

      hazardSystem.update(gameState, spatialHash, 0.016);

      // Player should be near teleporter 2 (with exit offset)
      const distToTeleporter2 = Math.sqrt(
        (player.x - teleporter2.x) ** 2 + (player.y - teleporter2.y) ** 2
      );
      expect(distToTeleporter2).toBeLessThan(5); // Should be near destination with offset
    });

    it('should apply teleport cooldown after teleporting', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      // Create linked teleporter pair
      const teleporter1 = gameState.addHazard('teleporter', 0, 0, 2, 90);
      const teleporter2 = gameState.addHazard('teleporter', 50, 50, 2, 90);
      teleporter1.linkedHazardId = teleporter2.id;
      teleporter2.linkedHazardId = teleporter1.id;
      teleporter1.active = true;
      teleporter2.active = true;

      gameState.world.gameTime = 10;

      // First teleport
      hazardSystem.update(gameState, spatialHash, 0.016);

      // Verify player was teleported (should be near teleporter 2)
      expect(player.x).not.toBe(0);
      expect(player.y).not.toBe(0);

      // Move player back to teleporter 1
      player.x = 0;
      player.y = 0;

      // Should NOT teleport again due to cooldown
      hazardSystem.update(gameState, spatialHash, 0.016);

      // Player should still be at teleporter 1 (not teleported back)
      expect(player.x).toBe(0);
      expect(player.y).toBe(0);
    });

    it('should allow teleportation after cooldown expires', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      // Create linked teleporter pair
      const teleporter1 = gameState.addHazard('teleporter', 0, 0, 2, 90);
      const teleporter2 = gameState.addHazard('teleporter', 50, 50, 2, 90);
      teleporter1.linkedHazardId = teleporter2.id;
      teleporter2.linkedHazardId = teleporter1.id;
      teleporter1.active = true;
      teleporter2.active = true;

      gameState.world.gameTime = 10;

      // First teleport
      hazardSystem.update(gameState, spatialHash, 0.016);

      // Advance time past cooldown
      gameState.world.gameTime = 10 + GAME_CONSTANTS.HAZARD_TELEPORTER_COOLDOWN + 1;

      // Move player back to teleporter 1
      player.x = 0;
      player.y = 0;

      // Should teleport again after cooldown
      hazardSystem.update(gameState, spatialHash, 0.016);

      // Player should be near teleporter 2 again
      const distToTeleporter2 = Math.sqrt(
        (player.x - teleporter2.x) ** 2 + (player.y - teleporter2.y) ** 2
      );
      expect(distToTeleporter2).toBeLessThan(5);
    });

    it('should not teleport if linked teleporter is inactive', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      const originalPos = { x: player.x, y: player.y };

      // Create linked teleporter pair but disable destination
      const teleporter1 = gameState.addHazard('teleporter', 0, 0, 2, 90);
      const teleporter2 = gameState.addHazard('teleporter', 50, 50, 2, 90);
      teleporter1.linkedHazardId = teleporter2.id;
      teleporter2.linkedHazardId = teleporter1.id;
      teleporter1.active = true;
      teleporter2.active = false; // Inactive destination

      gameState.world.gameTime = 10;

      hazardSystem.update(gameState, spatialHash, 0.016);

      // Player should not have teleported
      expect(player.x).toBe(originalPos.x);
      expect(player.y).toBe(originalPos.y);
    });
  });

  describe('expiration', () => {
    it('should remove expired hazards', () => {
      gameState.addPlayer('player1', 100, 100);

      const hazard = gameState.addHazard('lava', 0, 0, 4, 10); // 10 second duration
      hazard.spawnTime = 0;

      expect(gameState.hazards.size).toBe(1);

      // Advance time past duration
      gameState.world.gameTime = 15;

      hazardSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.hazards.size).toBe(0);
    });

    it('should not remove permanent hazards (duration 0)', () => {
      gameState.addPlayer('player1', 100, 100);

      const hazard = gameState.addHazard('lava', 0, 0, 4, 0); // Permanent
      hazard.spawnTime = 0;

      // Advance time significantly but use reset() to prevent spawning interference
      hazardSystem.reset();
      gameState.world.gameTime = 1000;

      // Fill hazards to max to prevent any spawning
      for (let i = 0; i < GAME_CONSTANTS.HAZARD_MAX_ACTIVE - 1; i++) {
        gameState.addHazard('lava', 1000 + i * 50, 1000, 4, 0);
      }

      hazardSystem.update(gameState, spatialHash, 0.016);

      // Original hazard should still exist (plus the fill hazards)
      expect(gameState.hazards.has(hazard.id)).toBe(true);
    });

    it('should remove linked teleporter when one expires', () => {
      gameState.addPlayer('player1', 100, 100);

      // Create linked pair with same spawn time
      const teleporter1 = gameState.addHazard('teleporter', 0, 0, 2, 90);
      const teleporter2 = gameState.addHazard('teleporter', 50, 50, 2, 90);
      teleporter1.linkedHazardId = teleporter2.id;
      teleporter2.linkedHazardId = teleporter1.id;
      teleporter1.spawnTime = 0;
      teleporter2.spawnTime = 0;

      expect(gameState.hazards.size).toBe(2);

      // Reset to ensure spawning doesn't interfere, then advance time past duration
      hazardSystem.reset();
      gameState.world.gameTime = 100;

      // Fill hazards to max to prevent any spawning
      for (let i = 0; i < GAME_CONSTANTS.HAZARD_MAX_ACTIVE - 2; i++) {
        gameState.addHazard('lava', 1000 + i * 50, 1000, 4, 0);
      }

      hazardSystem.update(gameState, spatialHash, 0.016);

      // Both teleporters should be removed (the fill hazards remain)
      expect(gameState.hazards.has(teleporter1.id)).toBe(false);
      expect(gameState.hazards.has(teleporter2.id)).toBe(false);
    });
  });

  describe('animations', () => {
    it('should update animation time', () => {
      const hazard = gameState.addHazard('lava', 0, 0, 4, 60);
      hazard.animationTime = 0;

      hazardSystem.update(gameState, spatialHash, 0.5);

      expect(hazard.animationTime).toBeCloseTo(0.5, 1);
    });
  });

  describe('GameState hazard management', () => {
    it('should add hazard with correct properties', () => {
      const hazard = gameState.addHazard('lava', 10, 20, 4, 60);

      expect(hazard.type).toBe('lava');
      expect(hazard.x).toBe(10);
      expect(hazard.y).toBe(20);
      expect(hazard.radius).toBe(4);
      expect(hazard.duration).toBe(60);
      expect(hazard.active).toBe(true);
      expect(hazard.linkedHazardId).toBe('');
    });

    it('should add hazard with linked ID', () => {
      const hazard = gameState.addHazard('teleporter', 10, 20, 2, 90, 'linked-id');

      expect(hazard.linkedHazardId).toBe('linked-id');
    });

    it('should remove hazard', () => {
      const hazard = gameState.addHazard('lava', 0, 0, 4, 60);
      expect(gameState.hazards.size).toBe(1);

      gameState.removeHazard(hazard.id);
      expect(gameState.hazards.size).toBe(0);
    });
  });

  describe('constants validation', () => {
    it('should have valid hazard spawn intervals', () => {
      expect(GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL)
        .toBeLessThan(GAME_CONSTANTS.HAZARD_MAX_SPAWN_INTERVAL);
      expect(GAME_CONSTANTS.HAZARD_MIN_SPAWN_INTERVAL).toBeGreaterThan(0);
    });

    it('should have valid hazard spawn chance', () => {
      expect(GAME_CONSTANTS.HAZARD_SPAWN_CHANCE).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.HAZARD_SPAWN_CHANCE).toBeLessThanOrEqual(1);
    });

    it('should have valid lava damage value', () => {
      expect(GAME_CONSTANTS.HAZARD_LAVA_DAMAGE_PER_SECOND).toBeGreaterThan(0);
    });

    it('should have valid ice slow multiplier', () => {
      expect(GAME_CONSTANTS.HAZARD_ICE_SLOW_MULTIPLIER).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.HAZARD_ICE_SLOW_MULTIPLIER).toBeLessThan(1);
    });

    it('should have valid teleporter cooldown', () => {
      expect(GAME_CONSTANTS.HAZARD_TELEPORTER_COOLDOWN).toBeGreaterThan(0);
    });

    it('should have valid hazard radii', () => {
      expect(GAME_CONSTANTS.HAZARD_LAVA_RADIUS).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.HAZARD_ICE_RADIUS).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.HAZARD_TELEPORTER_RADIUS).toBeGreaterThan(0);
    });

    it('should have valid ice group size', () => {
      expect(GAME_CONSTANTS.HAZARD_ICE_GROUP_SIZE).toBeGreaterThan(0);
    });

    it('should have valid max active hazards', () => {
      expect(GAME_CONSTANTS.HAZARD_MAX_ACTIVE).toBeGreaterThan(0);
    });
  });
});
