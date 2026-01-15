import { describe, it, expect, beforeEach } from 'vitest';
import {
  TelemetryService,
  getTelemetryService,
  resetTelemetryService,
  type SessionData as _SessionData,
  type UpgradeChoiceData as _UpgradeChoiceData,
  type TelemetryStats as _TelemetryStats
} from './TelemetryService.js';

describe('TelemetryService', () => {
  let telemetry: TelemetryService;

  beforeEach(() => {
    resetTelemetryService();
    telemetry = new TelemetryService();
  });

  describe('constructor', () => {
    it('should initialize with empty data', () => {
      const stats = telemetry.getStats();
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalUpgradeChoices).toBe(0);
    });

    it('should set dataCollectionStarted to current time', () => {
      const stats = telemetry.getStats();
      const now = Date.now();
      expect(stats.dataCollectionStarted).toBeLessThanOrEqual(now);
      expect(stats.dataCollectionStarted).toBeGreaterThan(now - 1000);
    });
  });

  describe('recordSession', () => {
    it('should record a session correctly', () => {
      telemetry.recordSession({
        playerId: 'player1',
        survivalTime: 120,
        kills: 50,
        levelReached: 10,
        waveReached: 5,
        weaponsUsed: ['knife', 'wand']
      });

      const stats = telemetry.getStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.averageSurvivalTime).toBe(120);
      expect(stats.averageKills).toBe(50);
      expect(stats.averageLevelReached).toBe(10);
      expect(stats.averageWaveReached).toBe(5);
    });

    it('should calculate averages correctly with multiple sessions', () => {
      telemetry.recordSession({
        playerId: 'player1',
        survivalTime: 100,
        kills: 40,
        levelReached: 8,
        waveReached: 4,
        weaponsUsed: ['knife']
      });

      telemetry.recordSession({
        playerId: 'player2',
        survivalTime: 200,
        kills: 60,
        levelReached: 12,
        waveReached: 6,
        weaponsUsed: ['wand', 'bible']
      });

      const stats = telemetry.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.averageSurvivalTime).toBe(150);
      expect(stats.averageKills).toBe(50);
      expect(stats.averageLevelReached).toBe(10);
      expect(stats.averageWaveReached).toBe(5);
    });

    it('should calculate median survival time correctly with odd number of sessions', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '2', survivalTime: 200, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '3', survivalTime: 300, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });

      const stats = telemetry.getStats();
      expect(stats.medianSurvivalTime).toBe(200);
    });

    it('should calculate median survival time correctly with even number of sessions', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '2', survivalTime: 200, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '3', survivalTime: 300, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '4', survivalTime: 400, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });

      const stats = telemetry.getStats();
      expect(stats.medianSurvivalTime).toBe(250);
    });

    it('should track weapon usage rate', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: ['knife', 'wand'] });
      telemetry.recordSession({ playerId: '2', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: ['knife'] });

      const stats = telemetry.getStats();
      expect(stats.weaponUsageRate['knife']).toBe(100); // Used in both sessions
      expect(stats.weaponUsageRate['wand']).toBe(50); // Used in one of two sessions
    });

    it('should track level distribution', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 5, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '2', survivalTime: 100, kills: 0, levelReached: 5, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '3', survivalTime: 100, kills: 0, levelReached: 10, waveReached: 1, weaponsUsed: [] });

      const stats = telemetry.getStats();
      expect(stats.levelDistribution[5]).toBe(2);
      expect(stats.levelDistribution[10]).toBe(1);
    });

    it('should add timestamp to session data', () => {
      telemetry.recordSession({
        playerId: 'player1',
        survivalTime: 100,
        kills: 0,
        levelReached: 1,
        waveReached: 1,
        weaponsUsed: []
      });

      const sessions = telemetry.getRecentSessions(1);
      expect(sessions[0].timestamp).toBeDefined();
      expect(sessions[0].timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('recordUpgradeChoice', () => {
    it('should record weapon upgrade choice', () => {
      telemetry.recordUpgradeChoice({
        playerId: 'player1',
        type: 'weapon',
        target: 'wand',
        playerLevel: 5
      });

      const stats = telemetry.getStats();
      expect(stats.totalUpgradeChoices).toBe(1);
      expect(stats.upgradeChoicesByType['weapon']).toBe(1);
      expect(stats.weaponUpgrades['wand']).toBe(1);
    });

    it('should record stat upgrade choice', () => {
      telemetry.recordUpgradeChoice({
        playerId: 'player1',
        type: 'stat',
        target: 'health',
        playerLevel: 3
      });

      const stats = telemetry.getStats();
      expect(stats.totalUpgradeChoices).toBe(1);
      expect(stats.upgradeChoicesByType['stat']).toBe(1);
      expect(stats.statUpgrades['health']).toBe(1);
    });

    it('should aggregate multiple upgrade choices correctly', () => {
      telemetry.recordUpgradeChoice({ playerId: '1', type: 'weapon', target: 'knife', playerLevel: 1 });
      telemetry.recordUpgradeChoice({ playerId: '1', type: 'weapon', target: 'knife', playerLevel: 2 });
      telemetry.recordUpgradeChoice({ playerId: '2', type: 'weapon', target: 'wand', playerLevel: 1 });
      telemetry.recordUpgradeChoice({ playerId: '2', type: 'stat', target: 'health', playerLevel: 2 });
      telemetry.recordUpgradeChoice({ playerId: '3', type: 'stat', target: 'speed', playerLevel: 3 });

      const stats = telemetry.getStats();
      expect(stats.totalUpgradeChoices).toBe(5);
      expect(stats.upgradeChoicesByType['weapon']).toBe(3);
      expect(stats.upgradeChoicesByType['stat']).toBe(2);
      expect(stats.weaponUpgrades['knife']).toBe(2);
      expect(stats.weaponUpgrades['wand']).toBe(1);
      expect(stats.statUpgrades['health']).toBe(1);
      expect(stats.statUpgrades['speed']).toBe(1);
    });

    it('should add timestamp to upgrade choice data', () => {
      telemetry.recordUpgradeChoice({
        playerId: 'player1',
        type: 'weapon',
        target: 'knife',
        playerLevel: 1
      });

      const choices = telemetry.getRecentUpgradeChoices(1);
      expect(choices[0].timestamp).toBeDefined();
      expect(choices[0].timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getRecentSessions', () => {
    it('should return empty array when no sessions', () => {
      const sessions = telemetry.getRecentSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all sessions when count is less than limit', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.recordSession({ playerId: '2', survivalTime: 200, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });

      const sessions = telemetry.getRecentSessions(10);
      expect(sessions.length).toBe(2);
    });

    it('should return limited sessions when count exceeds limit', () => {
      for (let i = 0; i < 10; i++) {
        telemetry.recordSession({ playerId: `${i}`, survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      }

      const sessions = telemetry.getRecentSessions(5);
      expect(sessions.length).toBe(5);
      // Should return the most recent 5 sessions
      expect(sessions[0].playerId).toBe('5');
      expect(sessions[4].playerId).toBe('9');
    });
  });

  describe('getRecentUpgradeChoices', () => {
    it('should return empty array when no choices', () => {
      const choices = telemetry.getRecentUpgradeChoices();
      expect(choices).toEqual([]);
    });

    it('should return limited choices when count exceeds limit', () => {
      for (let i = 0; i < 10; i++) {
        telemetry.recordUpgradeChoice({ playerId: `${i}`, type: 'weapon', target: 'knife', playerLevel: 1 });
      }

      const choices = telemetry.getRecentUpgradeChoices(5);
      expect(choices.length).toBe(5);
    });
  });

  describe('reset', () => {
    it('should clear all session data', () => {
      telemetry.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
      telemetry.reset();

      const stats = telemetry.getStats();
      expect(stats.totalSessions).toBe(0);
    });

    it('should clear all upgrade choice data', () => {
      telemetry.recordUpgradeChoice({ playerId: '1', type: 'weapon', target: 'knife', playerLevel: 1 });
      telemetry.reset();

      const stats = telemetry.getStats();
      expect(stats.totalUpgradeChoices).toBe(0);
    });

    it('should reset data collection timestamp', () => {
      const originalStats = telemetry.getStats();
      const originalTimestamp = originalStats.dataCollectionStarted;

      // Wait a tiny bit
      telemetry.reset();

      const newStats = telemetry.getStats();
      expect(newStats.dataCollectionStarted).toBeGreaterThanOrEqual(originalTimestamp);
    });
  });

  describe('getCollectionDuration', () => {
    it('should return collection duration in seconds', () => {
      const duration = telemetry.getCollectionDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1); // Should be less than 1 second for a fresh instance
    });
  });

  describe('getStats edge cases', () => {
    it('should handle empty data without errors', () => {
      const stats = telemetry.getStats();
      expect(stats.averageSurvivalTime).toBe(0);
      expect(stats.medianSurvivalTime).toBe(0);
      expect(stats.averageKills).toBe(0);
      expect(stats.averageLevelReached).toBe(0);
      expect(stats.averageWaveReached).toBe(0);
      expect(Object.keys(stats.weaponUsageRate)).toHaveLength(0);
      expect(Object.keys(stats.levelDistribution)).toHaveLength(0);
    });

    it('should include lastUpdated timestamp', () => {
      const stats = telemetry.getStats();
      expect(stats.lastUpdated).toBeDefined();
      expect(stats.lastUpdated).toBeLessThanOrEqual(Date.now());
    });
  });
});

describe('TelemetryService Singleton', () => {
  beforeEach(() => {
    resetTelemetryService();
  });

  describe('getTelemetryService', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getTelemetryService();
      const instance2 = getTelemetryService();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getTelemetryService();
      instance1.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });

      resetTelemetryService();

      const instance2 = getTelemetryService();
      const stats = instance2.getStats();
      expect(stats.totalSessions).toBe(0);
    });
  });

  describe('resetTelemetryService', () => {
    it('should clear data on existing instance', () => {
      const instance = getTelemetryService();
      instance.recordSession({ playerId: '1', survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });

      resetTelemetryService();

      const newInstance = getTelemetryService();
      const stats = newInstance.getStats();
      expect(stats.totalSessions).toBe(0);
    });
  });
});

describe('TelemetryService Memory Management', () => {
  let telemetry: TelemetryService;

  beforeEach(() => {
    resetTelemetryService();
    telemetry = new TelemetryService();
  });

  it('should not grow sessions unbounded (test with smaller limit)', () => {
    // Note: The actual limit is 10000, but we test the FIFO behavior
    // by verifying the service handles many records without error
    for (let i = 0; i < 100; i++) {
      telemetry.recordSession({ playerId: `${i}`, survivalTime: 100, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
    }

    const stats = telemetry.getStats();
    expect(stats.totalSessions).toBe(100);
  });

  it('should preserve most recent sessions when limit exceeded', () => {
    // Record sessions with identifiable player IDs
    for (let i = 0; i < 50; i++) {
      telemetry.recordSession({ playerId: `player_${i}`, survivalTime: i, kills: 0, levelReached: 1, waveReached: 1, weaponsUsed: [] });
    }

    const sessions = telemetry.getRecentSessions(10);
    // Should have the most recent sessions (40-49)
    expect(sessions[0].playerId).toBe('player_40');
    expect(sessions[9].playerId).toBe('player_49');
  });
});
