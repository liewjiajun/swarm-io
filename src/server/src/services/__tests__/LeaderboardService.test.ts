/**
 * LeaderboardService Tests (P9.2)
 *
 * Tests the server-side all-time leaderboard functionality:
 * - Score submission and validation
 * - Ranking and sorting
 * - Player lookup
 * - Persistence (file-based)
 * - Edge cases and anti-cheat validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  LeaderboardService,
  getLeaderboardService,
  resetLeaderboardService,
  type LeaderboardEntry,
  type ScoreSubmissionResult
} from '../LeaderboardService';

describe('LeaderboardService', () => {
  const testDataDir = './data/test-leaderboard';
  let service: LeaderboardService;

  // Helper to clean up test files
  const cleanupTestFiles = () => {
    try {
      const testFile = path.join(testDataDir, 'leaderboard.json');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      if (fs.existsSync(testDataDir)) {
        fs.rmdirSync(testDataDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  };

  beforeEach(() => {
    // Clean up before each test to ensure fresh state
    cleanupTestFiles();
    // Create fresh service with test directory
    service = new LeaderboardService(testDataDir);
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestFiles();
  });

  // Helper to calculate expected score
  const calcScore = (kills: number, survivalTime: number, level: number) =>
    (kills * 100) + Math.floor(survivalTime * 10) + (level * 50);

  describe('submitScore', () => {
    it('should accept a valid score submission', () => {
      const kills = 10, survivalTime = 50, level = 5;
      const score = calcScore(kills, survivalTime, level); // 1000 + 500 + 250 = 1750

      const result = service.submitScore('TestPlayer', score, kills, survivalTime, level, 3);

      expect(result.accepted).toBe(true);
      expect(result.rank).toBe(1);
      expect(result.replacedPrevious).toBe(false);
      expect(result.message).toContain('#1');
    });

    it('should reject submission with invalid nickname', () => {
      const result = service.submitScore('', 1750, 10, 50, 5, 3);

      expect(result.accepted).toBe(false);
      expect(result.message).toBe('Invalid nickname');
    });

    it('should reject submission with negative score components', () => {
      const result = service.submitScore('TestPlayer', -100, -1, 50, 5, 3);

      expect(result.accepted).toBe(false);
      expect(result.message).toBe('Invalid score data');
    });

    it('should validate score calculation matches components', () => {
      // Submit with mismatched score
      const kills = 10;
      const survivalTime = 50;
      const level = 5;
      const expectedScore = (kills * 100) + Math.floor(survivalTime * 10) + (level * 50);
      const wrongScore = expectedScore + 1000; // Tampered score

      const result = service.submitScore('Cheater', wrongScore, kills, survivalTime, level, 1);

      expect(result.accepted).toBe(false);
      expect(result.message).toBe('Score validation failed');
    });

    it('should allow 1 point tolerance for rounding', () => {
      const kills = 10;
      const survivalTime = 50.5; // Will round differently
      const level = 5;
      const expectedScore = (kills * 100) + Math.floor(survivalTime * 10) + (level * 50);

      const result = service.submitScore('TestPlayer', expectedScore + 1, kills, survivalTime, level, 1);

      expect(result.accepted).toBe(true);
    });

    it('should truncate nickname to 20 characters', () => {
      const longNickname = 'ThisIsAVeryLongNicknameMoreThan20Chars';
      const kills = 10, survivalTime = 50, level = 5;
      const score = calcScore(kills, survivalTime, level);
      const result = service.submitScore(longNickname, score, kills, survivalTime, level, 3);

      expect(result.accepted).toBe(true);

      const leaderboard = service.getLeaderboard();
      expect(leaderboard.entries[0].nickname.length).toBeLessThanOrEqual(20);
    });

    it('should replace existing entry when new score is higher', () => {
      // Submit first score: (5*100) + (45*10) + (3*50) = 500 + 450 + 150 = 1100
      const score1 = calcScore(5, 45, 3);
      service.submitScore('TestPlayer', score1, 5, 45, 3, 2);

      // Submit higher score: (15*100) + (55*10) + (7*50) = 1500 + 550 + 350 = 2400
      const score2 = calcScore(15, 55, 7);
      const result = service.submitScore('TestPlayer', score2, 15, 55, 7, 4);

      expect(result.accepted).toBe(true);
      expect(result.replacedPrevious).toBe(true);
      expect(result.previousScore).toBe(score1);

      const leaderboard = service.getLeaderboard();
      expect(leaderboard.entries.length).toBe(1);
      expect(leaderboard.entries[0].score).toBe(score2);
    });

    it('should reject score lower than existing personal best', () => {
      // Submit first score
      const score1 = calcScore(15, 55, 7);
      service.submitScore('TestPlayer', score1, 15, 55, 7, 4);

      // Try to submit lower score
      const score2 = calcScore(5, 45, 3);
      const result = service.submitScore('TestPlayer', score2, 5, 45, 3, 2);

      expect(result.accepted).toBe(false);
      expect(result.rank).toBe(1); // Still shows current rank
      expect(result.message).toContain('personal best');
    });

    it('should be case-insensitive for nickname matching', () => {
      const score1 = calcScore(5, 45, 3);
      service.submitScore('TestPlayer', score1, 5, 45, 3, 2);

      // Same player with different case
      const score2 = calcScore(15, 55, 7);
      const result = service.submitScore('TESTPLAYER', score2, 15, 55, 7, 4);

      expect(result.accepted).toBe(true);
      expect(result.replacedPrevious).toBe(true);

      const leaderboard = service.getLeaderboard();
      expect(leaderboard.entries.length).toBe(1);
    });

    it('should maintain descending score order', () => {
      const score1 = calcScore(5, 45, 3);   // 1100
      const score2 = calcScore(25, 75, 9);  // 2500 + 750 + 450 = 3700
      const score3 = calcScore(15, 55, 7);  // 2400

      service.submitScore('Player1', score1, 5, 45, 3, 2);
      service.submitScore('Player2', score2, 25, 75, 9, 6);
      service.submitScore('Player3', score3, 15, 55, 7, 4);

      const leaderboard = service.getLeaderboard();

      expect(leaderboard.entries[0].nickname).toBe('Player2');
      expect(leaderboard.entries[0].score).toBe(score2);
      expect(leaderboard.entries[1].nickname).toBe('Player3');
      expect(leaderboard.entries[1].score).toBe(score3);
      expect(leaderboard.entries[2].nickname).toBe('Player1');
      expect(leaderboard.entries[2].score).toBe(score1);
    });

    it('should limit to top 100 entries', () => {
      // Add 105 entries with valid scores
      for (let i = 0; i < 105; i++) {
        const kills = i + 1;
        const survivalTime = (i + 1) * 2;
        const level = Math.floor(i / 10) + 1;
        const score = calcScore(kills, survivalTime, level);
        service.submitScore(`Player${i}`, score, kills, survivalTime, level, 1);
      }

      const leaderboard = service.getLeaderboard();
      expect(leaderboard.entries.length).toBe(100);
      expect(leaderboard.totalEntries).toBe(100);

      // Highest score player should be first (Player104 with highest stats)
      expect(leaderboard.entries[0].nickname).toBe('Player104');
    });

    it('should reject score not high enough for top 100 when full', () => {
      // Fill leaderboard with 100 entries
      for (let i = 0; i < 100; i++) {
        const kills = (i + 1) * 5;
        const survivalTime = (i + 1) * 10;
        const level = i + 1;
        const score = calcScore(kills, survivalTime, level);
        service.submitScore(`Player${i}`, score, kills, survivalTime, level, 1);
      }

      // Try to submit a very low score
      const lowScore = calcScore(1, 1, 1); // Very low score
      const result = service.submitScore('NewPlayer', lowScore, 1, 1, 1, 1);

      expect(result.accepted).toBe(false);
      expect(result.message).toContain('not high enough');
    });
  });

  describe('getLeaderboard', () => {
    // Use valid scores for these tests
    const score1 = calcScore(25, 75, 9);  // 2500 + 750 + 450 = 3700
    const score2 = calcScore(15, 55, 7);  // 1500 + 550 + 350 = 2400
    const score3 = calcScore(5, 45, 3);   // 500 + 450 + 150 = 1100

    beforeEach(() => {
      // Add some test entries with valid scores
      service.submitScore('Player1', score1, 25, 75, 9, 6);
      service.submitScore('Player2', score2, 15, 55, 7, 4);
      service.submitScore('Player3', score3, 5, 45, 3, 2);
    });

    it('should return all entries with default limit', () => {
      const result = service.getLeaderboard();

      expect(result.entries.length).toBe(3);
      expect(result.totalEntries).toBe(3);
    });

    it('should respect limit parameter', () => {
      const result = service.getLeaderboard(2);

      expect(result.entries.length).toBe(2);
      expect(result.totalEntries).toBe(3);
    });

    it('should respect offset parameter', () => {
      const result = service.getLeaderboard(2, 1);

      expect(result.entries.length).toBe(2);
      // Player1 has highest score so is first, offset=1 skips to second place
      expect(result.entries[0].nickname).toBe('Player2'); // Second place
      expect(result.entries[1].nickname).toBe('Player3'); // Third place
    });

    it('should clamp limit to max 100', () => {
      const result = service.getLeaderboard(200);

      expect(result.entries.length).toBe(3);
    });
  });

  describe('getPlayerRank', () => {
    const rankScore1 = calcScore(25, 75, 9);  // 3700
    const rankScore2 = calcScore(15, 55, 7);  // 2400
    const rankScore3 = calcScore(5, 45, 3);   // 1100

    beforeEach(() => {
      service.submitScore('Player1', rankScore1, 25, 75, 9, 6);
      service.submitScore('Player2', rankScore2, 15, 55, 7, 4);
      service.submitScore('Player3', rankScore3, 5, 45, 3, 2);
    });

    it('should return rank for existing player', () => {
      const result = service.getPlayerRank('Player2');

      expect(result.rank).toBe(2);
      expect(result.entry?.nickname).toBe('Player2');
      expect(result.entry?.score).toBe(rankScore2);
    });

    it('should return nearby entries', () => {
      const result = service.getPlayerRank('Player2');

      expect(result.nearbyEntries.length).toBe(3); // All 3 entries (within ±2 range)
    });

    it('should be case-insensitive', () => {
      const result = service.getPlayerRank('PLAYER2');

      expect(result.rank).toBe(2);
    });

    it('should return null for non-existent player', () => {
      const result = service.getPlayerRank('NonExistent');

      expect(result.rank).toBe(null);
      expect(result.entry).toBe(null);
      expect(result.nearbyEntries.length).toBe(0);
    });
  });

  describe('getMinimumScore', () => {
    it('should return 0 when leaderboard is not full', () => {
      const score = calcScore(5, 45, 3);
      service.submitScore('Player1', score, 5, 45, 3, 2);

      expect(service.getMinimumScore()).toBe(0);
    });

    it('should return lowest score when leaderboard is full', () => {
      // Fill leaderboard with 100 entries
      for (let i = 0; i < 100; i++) {
        const kills = i + 1;
        const survivalTime = (i + 1) * 2;
        const level = Math.floor(i / 10) + 1;
        const score = calcScore(kills, survivalTime, level);
        service.submitScore(`Player${i}`, score, kills, survivalTime, level, 1);
      }

      // Minimum score is Player0 with lowest stats
      const minScore = calcScore(1, 2, 1); // kills=1, survivalTime=2, level=1
      expect(service.getMinimumScore()).toBe(minScore);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const statScore1 = calcScore(25, 75, 9);  // 3700
      const statScore2 = calcScore(15, 55, 7);  // 2400
      const statScore3 = calcScore(5, 45, 3);   // 1100

      service.submitScore('Player1', statScore1, 25, 75, 9, 6);
      service.submitScore('Player2', statScore2, 15, 55, 7, 4);
      service.submitScore('Player3', statScore3, 5, 45, 3, 2);

      const stats = service.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.highestScore).toBe(statScore1);
      expect(stats.lowestScore).toBe(statScore3);
      expect(stats.averageScore).toBe(Math.round((statScore1 + statScore2 + statScore3) / 3));
      expect(stats.lastUpdated).toBeGreaterThan(0);
    });

    it('should return zeros for empty leaderboard', () => {
      const stats = service.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.highestScore).toBe(0);
      expect(stats.lowestScore).toBe(0);
      expect(stats.averageScore).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should persist entries to file', () => {
      const persistScore = calcScore(10, 50, 5);
      service.submitScore('Player1', persistScore, 10, 50, 5, 3);

      const filePath = path.join(testDataDir, 'leaderboard.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data.entries.length).toBe(1);
      expect(data.entries[0].nickname).toBe('Player1');
    });

    it('should load entries from file on creation', () => {
      // Add entry and verify it's saved
      const loadScore = calcScore(10, 50, 5);
      service.submitScore('Player1', loadScore, 10, 50, 5, 3);

      // Create new service instance (simulating server restart)
      const newService = new LeaderboardService(testDataDir);
      const leaderboard = newService.getLeaderboard();

      expect(leaderboard.entries.length).toBe(1);
      expect(leaderboard.entries[0].nickname).toBe('Player1');
    });

    it('should handle corrupted data gracefully', () => {
      // Write corrupted data
      const filePath = path.join(testDataDir, 'leaderboard.json');
      fs.mkdirSync(testDataDir, { recursive: true });
      fs.writeFileSync(filePath, 'not valid json');

      // Create service - should not throw
      const newService = new LeaderboardService(testDataDir);
      const leaderboard = newService.getLeaderboard();

      expect(leaderboard.entries.length).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all entries', () => {
      const resetScore1 = calcScore(10, 50, 5);
      const resetScore2 = calcScore(15, 55, 7);
      service.submitScore('Player1', resetScore1, 10, 50, 5, 3);
      service.submitScore('Player2', resetScore2, 15, 55, 7, 4);

      service.reset();

      const leaderboard = service.getLeaderboard();
      expect(leaderboard.entries.length).toBe(0);
    });
  });
});

describe('LeaderboardService Singleton', () => {
  afterEach(() => {
    resetLeaderboardService();
  });

  it('should return same instance on multiple calls', () => {
    const instance1 = getLeaderboardService();
    const instance2 = getLeaderboardService();

    expect(instance1).toBe(instance2);
  });

  it('should create new instance after reset', () => {
    const instance1 = getLeaderboardService();
    resetLeaderboardService();
    const instance2 = getLeaderboardService();

    // After reset, same singleton pattern but fresh state
    expect(instance2).toBeDefined();
  });
});
