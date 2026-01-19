import { describe, it, expect, beforeEach } from 'vitest';
import { PowerUpSystem } from './PowerUpSystem';
import { GameState } from '../state/GameState';
import { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS } from '@swarm-io/shared';

describe('PowerUpSystem', () => {
  let powerUpSystem: PowerUpSystem;
  let gameState: GameState;
  let spatialHash: SpatialHash;

  beforeEach(() => {
    powerUpSystem = new PowerUpSystem();
    gameState = new GameState();
    spatialHash = new SpatialHash(50);
  });

  describe('initialization', () => {
    it('should initialize with default metrics', () => {
      const metrics = powerUpSystem.getMetrics();
      expect(metrics.totalSpawned).toBe(0);
      expect(metrics.totalCollected).toBe(0);
      expect(metrics.totalDespawned).toBe(0);
      expect(metrics.healthRestoreCount).toBe(0);
      expect(metrics.damageBoostCount).toBe(0);
      expect(metrics.speedBoostCount).toBe(0);
      expect(metrics.shieldCount).toBe(0);
      expect(metrics.magnetBoostCount).toBe(0);
    });

    it('should reset metrics on reset()', () => {
      // Manually manipulate gameState to trigger spawning
      gameState.addPlayer('player1', 0, 0);
      gameState.world.gameTime = GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL + 10;

      // Multiple updates to potentially spawn
      for (let i = 0; i < 100; i++) {
        powerUpSystem.update(gameState, spatialHash, 0.016);
      }

      // Reset
      powerUpSystem.reset();

      const metrics = powerUpSystem.getMetrics();
      expect(metrics.totalSpawned).toBe(0);
    });
  });

  describe('spawning', () => {
    it('should not spawn if no players in game', () => {
      gameState.world.gameTime = GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL + 10;

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(0);
    });

    it('should not spawn before minimum interval', () => {
      gameState.addPlayer('player1', 0, 0);
      gameState.world.gameTime = 1; // Less than min interval

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(0);
    });

    it('should not exceed max active power-ups', () => {
      gameState.addPlayer('player1', 0, 0);

      // Manually add max power-ups
      for (let i = 0; i < GAME_CONSTANTS.POWERUP_MAX_ACTIVE; i++) {
        gameState.addPowerUp('health_restore', i * 10, 0, 60);
      }

      gameState.world.gameTime = GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL + 10;

      // Try to spawn more
      const _initialCount = gameState.powerUps.size;
      powerUpSystem.update(gameState, spatialHash, 0.016);

      // Should not exceed max
      expect(gameState.powerUps.size).toBeLessThanOrEqual(GAME_CONSTANTS.POWERUP_MAX_ACTIVE);
    });

    it('should create power-ups within world bounds', () => {
      gameState.addPlayer('player1', 0, 0);
      gameState.world.worldRadius = 500;
      gameState.world.gameTime = GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL;

      // Force multiple spawn attempts
      for (let i = 0; i < 200; i++) {
        gameState.world.gameTime += GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL;
        powerUpSystem.update(gameState, spatialHash, 0.016);
      }

      // Check any spawned power-ups are within bounds
      gameState.powerUps.forEach(powerUp => {
        const dist = Math.sqrt(powerUp.x ** 2 + powerUp.y ** 2);
        expect(dist).toBeLessThan(gameState.world.worldRadius);
      });
    });
  });

  describe('collection', () => {
    it('should collect power-up when player is within radius', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      const powerUp = gameState.addPowerUp('health_restore', 0.5, 0, 60);

      // Insert into spatial hash
      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      spatialHash.insert({
        id: player.id,
        x: player.x,
        y: player.y,
        type: 'player',
        entity: player
      });

      player.health = 50; // Damage player first
      powerUpSystem.update(gameState, spatialHash, 0.016);

      // Power-up should be collected (and removed)
      expect(gameState.powerUps.size).toBe(0);
      expect(powerUpSystem.getMetrics().totalCollected).toBe(1);
    });

    it('should not collect power-up when player is out of range', () => {
      const _player = gameState.addPlayer('player1', 0, 0);
      const powerUp = gameState.addPowerUp('health_restore', 100, 100, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(1);
      expect(powerUpSystem.getMetrics().totalCollected).toBe(0);
    });

    it('should not collect power-up when player is dead', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.dead = true;
      const powerUp = gameState.addPowerUp('health_restore', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(1);
      expect(powerUpSystem.getMetrics().totalCollected).toBe(0);
    });
  });

  describe('health restore power-up', () => {
    it('should restore health when collected', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 50;
      player.maxHealth = 100;

      const powerUp = gameState.addPowerUp('health_restore', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.health).toBe(50 + GAME_CONSTANTS.POWERUP_HEALTH_RESTORE_AMOUNT);
      expect(powerUpSystem.getMetrics().healthRestoreCount).toBe(1);
    });

    it('should not exceed max health', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.health = 90;
      player.maxHealth = 100;

      const powerUp = gameState.addPowerUp('health_restore', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.health).toBe(100); // Capped at maxHealth
    });
  });

  describe('damage boost power-up', () => {
    it('should grant damage boost when collected', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      expect(player.damageBoostTime).toBe(0);

      const powerUp = gameState.addPowerUp('damage_boost', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.damageBoostTime).toBe(GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_DURATION);
      expect(player.hasDamageBoost).toBe(true);
      expect(powerUpSystem.getMetrics().damageBoostCount).toBe(1);
    });

    it('should decay damage boost over time', () => {
      const player = gameState.addPlayer('player1', 100, 100); // Far from power-up location
      player.damageBoostTime = 10;

      powerUpSystem.update(gameState, spatialHash, 1); // 1 second

      expect(player.damageBoostTime).toBe(9);
    });

    it('should provide correct damage multiplier', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      expect(powerUpSystem.getDamageMultiplier(player)).toBe(1);

      player.damageBoostTime = 5;
      expect(powerUpSystem.getDamageMultiplier(player)).toBe(GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_MULTIPLIER);
    });
  });

  describe('speed boost power-up', () => {
    it('should grant speed boost when collected', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      expect(player.speedBoostTime).toBe(0);

      const powerUp = gameState.addPowerUp('speed_boost', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.speedBoostTime).toBe(GAME_CONSTANTS.POWERUP_SPEED_BOOST_DURATION);
      expect(player.hasSpeedBoost).toBe(true);
      expect(powerUpSystem.getMetrics().speedBoostCount).toBe(1);
    });

    it('should provide correct speed multiplier', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      expect(powerUpSystem.getSpeedMultiplier(player)).toBe(1);

      player.speedBoostTime = 5;
      expect(powerUpSystem.getSpeedMultiplier(player)).toBe(GAME_CONSTANTS.POWERUP_SPEED_BOOST_MULTIPLIER);
    });
  });

  describe('shield power-up', () => {
    it('should grant shield when collected', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      expect(player.shieldTime).toBe(0);

      const powerUp = gameState.addPowerUp('shield', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.shieldTime).toBe(GAME_CONSTANTS.POWERUP_SHIELD_DURATION);
      expect(player.hasShield).toBe(true);
      expect(powerUpSystem.getMetrics().shieldCount).toBe(1);
    });

    it('should make player immune to damage', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      player.shieldTime = 5;
      player.invulnerableTime = 0; // Not invulnerable from respawn

      const initialHealth = player.health;
      player.takeDamage(50, 'enemy1', false);

      expect(player.health).toBe(initialHealth); // No damage taken
    });
  });

  describe('magnet boost power-up', () => {
    it('should grant magnet boost when collected', () => {
      const player = gameState.addPlayer('player1', 0, 0);
      expect(player.magnetBoostTime).toBe(0);

      const powerUp = gameState.addPowerUp('magnet_boost', 0.5, 0, 60);

      spatialHash.insert({
        id: powerUp.id,
        x: powerUp.x,
        y: powerUp.y,
        type: 'powerup',
        entity: powerUp
      });

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(player.magnetBoostTime).toBe(GAME_CONSTANTS.POWERUP_MAGNET_BOOST_DURATION);
      expect(player.hasMagnetBoost).toBe(true);
      expect(powerUpSystem.getMetrics().magnetBoostCount).toBe(1);
    });

    it('should provide correct magnet multiplier', () => {
      const player = gameState.addPlayer('player1', 0, 0);

      expect(powerUpSystem.getMagnetMultiplier(player)).toBe(1);

      player.magnetBoostTime = 5;
      expect(powerUpSystem.getMagnetMultiplier(player)).toBe(GAME_CONSTANTS.POWERUP_MAGNET_BOOST_MULTIPLIER);
    });
  });

  describe('expiration', () => {
    it('should remove expired power-ups', () => {
      const powerUp = gameState.addPowerUp('health_restore', 100, 100, 60);
      powerUp.spawnTime = 0;
      gameState.world.gameTime = 61; // Past lifetime

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(0);
      expect(powerUpSystem.getMetrics().totalDespawned).toBe(1);
    });

    it('should not remove power-ups before expiration', () => {
      const powerUp = gameState.addPowerUp('health_restore', 100, 100, 60);
      powerUp.spawnTime = 0;
      gameState.world.gameTime = 30; // Still within lifetime

      powerUpSystem.update(gameState, spatialHash, 0.016);

      expect(gameState.powerUps.size).toBe(1);
    });
  });

  describe('buff timer decay', () => {
    it('should decay all buff timers over time', () => {
      const player = gameState.addPlayer('player1', 100, 100);
      player.damageBoostTime = 10;
      player.speedBoostTime = 10;
      player.shieldTime = 10;
      player.magnetBoostTime = 10;

      powerUpSystem.update(gameState, spatialHash, 2); // 2 seconds

      expect(player.damageBoostTime).toBe(8);
      expect(player.speedBoostTime).toBe(8);
      expect(player.shieldTime).toBe(8);
      expect(player.magnetBoostTime).toBe(8);
    });

    it('should not decay buffs below zero', () => {
      const player = gameState.addPlayer('player1', 100, 100);
      player.damageBoostTime = 1;

      powerUpSystem.update(gameState, spatialHash, 5);

      expect(player.damageBoostTime).toBe(0);
    });

    it('should not decay buffs for dead players', () => {
      const player = gameState.addPlayer('player1', 100, 100);
      player.dead = true;
      player.damageBoostTime = 10;

      powerUpSystem.update(gameState, spatialHash, 2);

      expect(player.damageBoostTime).toBe(10);
    });
  });

  describe('GameState power-up management', () => {
    it('should add power-ups correctly', () => {
      const powerUp = gameState.addPowerUp('health_restore', 10, 20, 60);

      expect(powerUp.type).toBe('health_restore');
      expect(powerUp.x).toBe(10);
      expect(powerUp.y).toBe(20);
      expect(powerUp.lifetime).toBe(60);
      expect(gameState.powerUps.size).toBe(1);
    });

    it('should remove power-ups correctly', () => {
      const powerUp = gameState.addPowerUp('health_restore', 10, 20, 60);
      const id = powerUp.id;

      gameState.removePowerUp(id);

      expect(gameState.powerUps.size).toBe(0);
    });

    it('should handle removing non-existent power-up', () => {
      expect(() => gameState.removePowerUp('non-existent')).not.toThrow();
    });
  });

  describe('constants validation', () => {
    it('should have valid power-up spawn interval', () => {
      expect(GAME_CONSTANTS.POWERUP_MIN_SPAWN_INTERVAL).toBeLessThan(GAME_CONSTANTS.POWERUP_MAX_SPAWN_INTERVAL);
      expect(GAME_CONSTANTS.POWERUP_MIN_SPAWN_INTERVAL).toBeGreaterThan(0);
    });

    it('should have valid spawn chance', () => {
      expect(GAME_CONSTANTS.POWERUP_SPAWN_CHANCE).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.POWERUP_SPAWN_CHANCE).toBeLessThanOrEqual(1);
    });

    it('should have valid collection radius', () => {
      expect(GAME_CONSTANTS.POWERUP_COLLECTION_RADIUS).toBeGreaterThan(0);
    });

    it('should have valid boost multipliers', () => {
      expect(GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_MULTIPLIER).toBeGreaterThan(1);
      expect(GAME_CONSTANTS.POWERUP_SPEED_BOOST_MULTIPLIER).toBeGreaterThan(1);
      expect(GAME_CONSTANTS.POWERUP_MAGNET_BOOST_MULTIPLIER).toBeGreaterThan(1);
    });

    it('should have valid durations', () => {
      expect(GAME_CONSTANTS.POWERUP_DAMAGE_BOOST_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.POWERUP_SPEED_BOOST_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.POWERUP_SHIELD_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.POWERUP_MAGNET_BOOST_DURATION).toBeGreaterThan(0);
    });

    it('should have valid health restore amount', () => {
      expect(GAME_CONSTANTS.POWERUP_HEALTH_RESTORE_AMOUNT).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.POWERUP_HEALTH_RESTORE_AMOUNT).toBeLessThanOrEqual(100);
    });
  });
});
