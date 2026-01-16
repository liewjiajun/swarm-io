import { describe, it, expect, beforeEach } from 'vitest';
import { WorldEventSystem } from './WorldEventSystem';
import { GameState } from '../state/GameState';
import { GAME_CONSTANTS } from '@swarm-io/shared';

describe('WorldEventSystem', () => {
  let worldEventSystem: WorldEventSystem;
  let gameState: GameState;

  beforeEach(() => {
    worldEventSystem = new WorldEventSystem();
    gameState = new GameState();
  });

  describe('initialization', () => {
    it('should initialize with zero metrics', () => {
      const metrics = worldEventSystem.getMetrics();
      expect(metrics.totalEventsSpawned).toBe(0);
      expect(metrics.meteorShowerCount).toBe(0);
      expect(metrics.invasionWaveCount).toBe(0);
      expect(metrics.doubleXpZoneCount).toBe(0);
    });
  });

  describe('update', () => {
    it('should not spawn events when no players exist', () => {
      // Fast forward past first event time
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MAX_INTERVAL + 1;

      worldEventSystem.update(gameState, 1);

      const metrics = worldEventSystem.getMetrics();
      expect(metrics.totalEventsSpawned).toBe(0);
      expect(gameState.worldEvents.size).toBe(0);
    });

    it('should not spawn events before minimum interval', () => {
      // Add a player
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL - 1;

      worldEventSystem.update(gameState, 1);

      const metrics = worldEventSystem.getMetrics();
      expect(metrics.totalEventsSpawned).toBe(0);
    });

    it('should spawn an event after minimum interval with players', () => {
      // Add a player
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL + 1;

      worldEventSystem.update(gameState, 1);

      const metrics = worldEventSystem.getMetrics();
      expect(metrics.totalEventsSpawned).toBe(1);
      expect(gameState.worldEvents.size).toBe(1);
    });
  });

  describe('event types', () => {
    beforeEach(() => {
      // Add a player so events can spawn
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
    });

    it('should create events with correct properties', () => {
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL + 1;

      worldEventSystem.update(gameState, 1);

      expect(gameState.worldEvents.size).toBe(1);

      let event: any;
      gameState.worldEvents.forEach(e => { event = e; });

      expect(event.id).toBeTruthy();
      expect(['meteor_shower', 'invasion_wave', 'double_xp_zone']).toContain(event.type);
      expect(event.active).toBe(true);
      expect(event.startTime).toBe(gameState.world.gameTime);
    });
  });

  describe('event expiration', () => {
    beforeEach(() => {
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
    });

    it('should remove expired events', () => {
      // Spawn an event
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL + 1;
      worldEventSystem.update(gameState, 1);
      expect(gameState.worldEvents.size).toBe(1);

      // Get the event
      let event: any;
      gameState.worldEvents.forEach(e => { event = e; });

      // Fast forward past event duration
      gameState.world.gameTime = event.startTime + event.duration + 1;
      worldEventSystem.update(gameState, 1);

      // Event should be removed
      expect(gameState.worldEvents.size).toBe(0);
    });
  });

  describe('double XP zone', () => {
    beforeEach(() => {
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
    });

    it('should return multiplier 1 when no double XP zone exists', () => {
      const multiplier = worldEventSystem.isInDoubleXpZone(gameState, 0, 0);
      expect(multiplier).toBe(1);
    });

    it('should return multiplier when player is inside double XP zone', () => {
      // Manually add a double XP zone event
      const event = gameState.addWorldEvent(
        'double_xp_zone',
        0, 0,
        GAME_CONSTANTS.DOUBLE_XP_ZONE_RADIUS,
        GAME_CONSTANTS.DOUBLE_XP_ZONE_DURATION,
        gameState.world.gameTime
      );
      event.xpMultiplier = GAME_CONSTANTS.DOUBLE_XP_ZONE_MULTIPLIER;

      const multiplier = worldEventSystem.isInDoubleXpZone(gameState, 0, 0);
      expect(multiplier).toBe(GAME_CONSTANTS.DOUBLE_XP_ZONE_MULTIPLIER);
    });

    it('should return multiplier 1 when player is outside double XP zone', () => {
      // Manually add a double XP zone event at origin
      const event = gameState.addWorldEvent(
        'double_xp_zone',
        0, 0,
        GAME_CONSTANTS.DOUBLE_XP_ZONE_RADIUS,
        GAME_CONSTANTS.DOUBLE_XP_ZONE_DURATION,
        gameState.world.gameTime
      );
      event.xpMultiplier = GAME_CONSTANTS.DOUBLE_XP_ZONE_MULTIPLIER;

      // Check position far outside the zone
      const farX = GAME_CONSTANTS.DOUBLE_XP_ZONE_RADIUS * 2;
      const multiplier = worldEventSystem.isInDoubleXpZone(gameState, farX, 0);
      expect(multiplier).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      // Spawn some events first
      gameState.addPlayer('player-1', 0, 0, 'TestPlayer');
      gameState.world.gameTime = GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL + 1;
      worldEventSystem.update(gameState, 1);

      expect(worldEventSystem.getMetrics().totalEventsSpawned).toBe(1);

      // Reset
      worldEventSystem.reset();

      const metrics = worldEventSystem.getMetrics();
      expect(metrics.totalEventsSpawned).toBe(0);
      expect(metrics.meteorShowerCount).toBe(0);
      expect(metrics.invasionWaveCount).toBe(0);
      expect(metrics.doubleXpZoneCount).toBe(0);
    });
  });

  describe('constants validation', () => {
    it('should have valid world event configuration', () => {
      expect(GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.WORLD_EVENT_MAX_INTERVAL).toBeGreaterThan(GAME_CONSTANTS.WORLD_EVENT_MIN_INTERVAL);
      expect(GAME_CONSTANTS.WORLD_EVENT_ANNOUNCEMENT_TIME).toBeGreaterThan(0);
    });

    it('should have valid meteor shower configuration', () => {
      expect(GAME_CONSTANTS.METEOR_SHOWER_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.METEOR_SHOWER_RADIUS).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.METEOR_SHOWER_DAMAGE).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.METEOR_SHOWER_INTERVAL).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.METEOR_SHOWER_METEOR_RADIUS).toBeGreaterThan(0);
    });

    it('should have valid invasion wave configuration', () => {
      expect(GAME_CONSTANTS.INVASION_WAVE_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.INVASION_WAVE_ENEMY_COUNT).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.INVASION_WAVE_SPAWN_RADIUS).toBeGreaterThan(0);
    });

    it('should have valid double XP zone configuration', () => {
      expect(GAME_CONSTANTS.DOUBLE_XP_ZONE_DURATION).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.DOUBLE_XP_ZONE_RADIUS).toBeGreaterThan(0);
      expect(GAME_CONSTANTS.DOUBLE_XP_ZONE_MULTIPLIER).toBeGreaterThan(1);
    });
  });
});
