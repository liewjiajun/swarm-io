/**
 * PlayerStats Tests (P9.1)
 *
 * Tests for persistent player statistics storage.
 * Verifies localStorage integration, record tracking, and data integrity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPlayerStats,
  savePlayerStats,
  updateStatsAfterGame,
  getBestStats,
  resetPlayerStats,
  type PlayerStats,
} from '../PlayerStats';

describe('PlayerStats', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    resetPlayerStats();
  });

  describe('loadPlayerStats', () => {
    it('should return default stats when no data exists', () => {
      const stats = loadPlayerStats();

      expect(stats.bestScore).toBe(0);
      expect(stats.bestSurvivalTime).toBe(0);
      expect(stats.bestKills).toBe(0);
      expect(stats.bestLevel).toBe(0);
      expect(stats.totalGamesPlayed).toBe(0);
      expect(stats.lastPlayedAt).toBe(0);
    });

    it('should load saved stats correctly', () => {
      const testStats: PlayerStats = {
        bestScore: 1000,
        bestSurvivalTime: 120,
        bestKills: 50,
        bestLevel: 10,
        totalGamesPlayed: 5,
        lastPlayedAt: Date.now(),
      };

      savePlayerStats(testStats);
      const loaded = loadPlayerStats();

      expect(loaded.bestScore).toBe(1000);
      expect(loaded.bestSurvivalTime).toBe(120);
      expect(loaded.bestKills).toBe(50);
      expect(loaded.bestLevel).toBe(10);
      expect(loaded.totalGamesPlayed).toBe(5);
    });

    it('should handle corrupted data gracefully', () => {
      localStorage.setItem('swarm-io-player-stats', 'not valid json');
      const stats = loadPlayerStats();

      expect(stats.bestScore).toBe(0);
      expect(stats.bestLevel).toBe(0);
    });

    it('should handle partial data with defaults', () => {
      localStorage.setItem(
        'swarm-io-player-stats',
        JSON.stringify({ bestScore: 500 })
      );
      const stats = loadPlayerStats();

      expect(stats.bestScore).toBe(500);
      expect(stats.bestKills).toBe(0); // Missing field gets default
      expect(stats.bestLevel).toBe(0);
    });
  });

  describe('savePlayerStats', () => {
    it('should save stats to localStorage', () => {
      const testStats: PlayerStats = {
        bestScore: 2000,
        bestSurvivalTime: 300,
        bestKills: 100,
        bestLevel: 15,
        totalGamesPlayed: 10,
        lastPlayedAt: 1234567890,
      };

      savePlayerStats(testStats);
      const stored = localStorage.getItem('swarm-io-player-stats');

      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.bestScore).toBe(2000);
      expect(parsed.bestLevel).toBe(15);
    });
  });

  describe('updateStatsAfterGame', () => {
    it('should detect new score record', () => {
      const result = updateStatsAfterGame({
        score: 1000,
        survivalTime: 60,
        kills: 20,
        level: 5,
      });

      expect(result.isNewRecord).toBe(true);
      expect(result.newRecords.score).toBe(true);
      expect(result.previousBests.score).toBe(0);
    });

    it('should detect new survival time record', () => {
      // First game
      updateStatsAfterGame({
        score: 100,
        survivalTime: 30,
        kills: 5,
        level: 2,
      });

      // Second game with better survival time
      const result = updateStatsAfterGame({
        score: 50,
        survivalTime: 60,
        kills: 3,
        level: 1,
      });

      expect(result.isNewRecord).toBe(true);
      expect(result.newRecords.survivalTime).toBe(true);
      expect(result.newRecords.score).toBe(false); // Score wasn't beaten
      expect(result.previousBests.survivalTime).toBe(30);
    });

    it('should detect new kills record', () => {
      updateStatsAfterGame({
        score: 100,
        survivalTime: 30,
        kills: 10,
        level: 2,
      });

      const result = updateStatsAfterGame({
        score: 50,
        survivalTime: 20,
        kills: 25,
        level: 1,
      });

      expect(result.newRecords.kills).toBe(true);
      expect(result.previousBests.kills).toBe(10);
    });

    it('should detect new level record', () => {
      updateStatsAfterGame({
        score: 100,
        survivalTime: 30,
        kills: 10,
        level: 5,
      });

      const result = updateStatsAfterGame({
        score: 50,
        survivalTime: 20,
        kills: 5,
        level: 8,
      });

      expect(result.newRecords.level).toBe(true);
      expect(result.previousBests.level).toBe(5);
    });

    it('should return false when no records are broken', () => {
      updateStatsAfterGame({
        score: 1000,
        survivalTime: 120,
        kills: 50,
        level: 10,
      });

      const result = updateStatsAfterGame({
        score: 500,
        survivalTime: 60,
        kills: 25,
        level: 5,
      });

      expect(result.isNewRecord).toBe(false);
      expect(result.newRecords.score).toBe(false);
      expect(result.newRecords.survivalTime).toBe(false);
      expect(result.newRecords.kills).toBe(false);
      expect(result.newRecords.level).toBe(false);
    });

    it('should detect multiple records in one game', () => {
      const result = updateStatsAfterGame({
        score: 1000,
        survivalTime: 120,
        kills: 50,
        level: 10,
      });

      expect(result.isNewRecord).toBe(true);
      expect(result.newRecords.score).toBe(true);
      expect(result.newRecords.survivalTime).toBe(true);
      expect(result.newRecords.kills).toBe(true);
      expect(result.newRecords.level).toBe(true);
    });

    it('should increment totalGamesPlayed', () => {
      updateStatsAfterGame({ score: 100, survivalTime: 30, kills: 5, level: 2 });
      updateStatsAfterGame({ score: 200, survivalTime: 40, kills: 10, level: 3 });
      updateStatsAfterGame({ score: 150, survivalTime: 35, kills: 8, level: 2 });

      const stats = loadPlayerStats();
      expect(stats.totalGamesPlayed).toBe(3);
    });

    it('should update lastPlayedAt timestamp', () => {
      const before = Date.now();
      updateStatsAfterGame({ score: 100, survivalTime: 30, kills: 5, level: 2 });
      const after = Date.now();

      const stats = loadPlayerStats();
      expect(stats.lastPlayedAt).toBeGreaterThanOrEqual(before);
      expect(stats.lastPlayedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getBestStats', () => {
    it('should return zeros for new player', () => {
      const best = getBestStats();

      expect(best.score).toBe(0);
      expect(best.survivalTime).toBe(0);
      expect(best.kills).toBe(0);
      expect(best.level).toBe(0);
    });

    it('should return correct best stats after games', () => {
      updateStatsAfterGame({ score: 500, survivalTime: 60, kills: 20, level: 5 });
      updateStatsAfterGame({ score: 1000, survivalTime: 45, kills: 35, level: 8 });
      updateStatsAfterGame({ score: 750, survivalTime: 90, kills: 30, level: 6 });

      const best = getBestStats();

      expect(best.score).toBe(1000); // Best from game 2
      expect(best.survivalTime).toBe(90); // Best from game 3
      expect(best.kills).toBe(35); // Best from game 2
      expect(best.level).toBe(8); // Best from game 2
    });
  });

  describe('resetPlayerStats', () => {
    it('should clear all stored stats', () => {
      updateStatsAfterGame({ score: 1000, survivalTime: 120, kills: 50, level: 10 });
      expect(loadPlayerStats().bestScore).toBe(1000);

      resetPlayerStats();

      const stats = loadPlayerStats();
      expect(stats.bestScore).toBe(0);
      expect(stats.totalGamesPlayed).toBe(0);
    });
  });
});
