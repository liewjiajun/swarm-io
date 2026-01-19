/**
 * LeaderboardService - Server-Side All-Time Leaderboard (P9.2)
 *
 * Manages persistent all-time leaderboard storage for the Snake.io style retention loop.
 * Players compete to climb the global top 100, providing long-term engagement hooks.
 *
 * Storage: File-based JSON persistence (./data/leaderboard.json)
 * Capacity: Top 100 entries, sorted by score descending
 *
 * Score Formula: (kills * 100) + floor(timeAlive * 10) + (level * 50)
 *
 * Why we need this:
 * - Retention hook: Players return to climb the all-time rankings
 * - Competition: Shows rank even if not in top 100 ("Rank #1,234")
 * - Validation: Server-side score validation prevents cheating
 * - Persistence: Survives server restarts unlike TelemetryService
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

const leaderboardLogger = logger.child({ component: 'LeaderboardService' });

/**
 * A single leaderboard entry
 */
export interface LeaderboardEntry {
  /** Unique entry ID */
  id: string;
  /** Player nickname (used as identifier for all-time tracking) */
  nickname: string;
  /** Final score: (kills * 100) + floor(timeAlive * 10) + (level * 50) */
  score: number;
  /** Total enemy kills */
  kills: number;
  /** Survival time in seconds */
  survivalTime: number;
  /** Final level reached */
  level: number;
  /** Wave number reached */
  wave: number;
  /** Timestamp when score was achieved */
  timestamp: number;
}

/**
 * Query result for leaderboard retrieval
 */
export interface LeaderboardQueryResult {
  /** Leaderboard entries (sorted by score descending) */
  entries: LeaderboardEntry[];
  /** Total number of entries in leaderboard */
  totalEntries: number;
}

/**
 * Result when submitting a score
 */
export interface ScoreSubmissionResult {
  /** Whether the score was added to the leaderboard */
  accepted: boolean;
  /** The player's rank (1-indexed), or null if not on leaderboard */
  rank: number | null;
  /** Whether this score replaced a previous entry for this nickname */
  replacedPrevious: boolean;
  /** If score improved, the previous score that was replaced */
  previousScore?: number;
  /** Message describing the result */
  message: string;
}

/**
 * LeaderboardService: Persistent all-time leaderboard management
 *
 * Design decisions:
 * - File-based JSON storage for simplicity (same pattern as ban system)
 * - Single entry per nickname (only best score counts)
 * - Top 100 limit with automatic pruning
 * - Automatic save on modification
 * - Loaded on service creation
 */
export class LeaderboardService {
  private entries: LeaderboardEntry[] = [];
  private readonly dataFilePath: string;
  private readonly MAX_ENTRIES = 100;

  constructor(dataDir: string = './data') {
    this.dataFilePath = path.join(dataDir, 'leaderboard.json');
    this.loadLeaderboard();
    leaderboardLogger.info({ path: this.dataFilePath, entries: this.entries.length }, 'LeaderboardService initialized');
  }

  /**
   * Submit a score to the leaderboard
   *
   * @param nickname - Player's display name (used as unique identifier)
   * @param score - Calculated score: (kills * 100) + floor(timeAlive * 10) + (level * 50)
   * @param kills - Number of enemy kills
   * @param survivalTime - Time survived in seconds
   * @param level - Final level reached
   * @param wave - Wave number reached
   * @returns Result indicating if score was accepted and the player's rank
   */
  submitScore(
    nickname: string,
    score: number,
    kills: number,
    survivalTime: number,
    level: number,
    wave: number
  ): ScoreSubmissionResult {
    // Validate inputs
    if (!nickname || nickname.trim().length === 0) {
      return { accepted: false, rank: null, replacedPrevious: false, message: 'Invalid nickname' };
    }

    const trimmedNickname = nickname.trim().substring(0, 20); // Max 20 chars

    // Validate score components are reasonable (anti-cheat basic validation)
    if (score < 0 || kills < 0 || survivalTime < 0 || level < 1 || wave < 1) {
      leaderboardLogger.warn({ nickname: trimmedNickname, score, kills, survivalTime, level, wave }, 'Invalid score submission');
      return { accepted: false, rank: null, replacedPrevious: false, message: 'Invalid score data' };
    }

    // Verify score calculation matches components (prevents score manipulation)
    const expectedScore = (kills * 100) + Math.floor(survivalTime * 10) + (level * 50);
    if (Math.abs(score - expectedScore) > 1) { // Allow 1 point tolerance for rounding
      leaderboardLogger.warn(
        { nickname: trimmedNickname, submittedScore: score, expectedScore, kills, survivalTime, level },
        'Score mismatch - possible manipulation'
      );
      return { accepted: false, rank: null, replacedPrevious: false, message: 'Score validation failed' };
    }

    // Check if this nickname already has an entry
    const existingIndex = this.entries.findIndex(e => e.nickname.toLowerCase() === trimmedNickname.toLowerCase());
    let replacedPrevious = false;
    let previousScore: number | undefined;

    if (existingIndex >= 0) {
      const existingEntry = this.entries[existingIndex];

      // Only update if new score is better
      if (score <= existingEntry.score) {
        // Find their current rank
        const rank = existingIndex + 1;
        return {
          accepted: false,
          rank,
          replacedPrevious: false,
          message: `Score not high enough to beat your personal best (${existingEntry.score})`
        };
      }

      // Remove old entry (will add new one in sorted position)
      previousScore = existingEntry.score;
      this.entries.splice(existingIndex, 1);
      replacedPrevious = true;
    }

    // Create new entry
    const newEntry: LeaderboardEntry = {
      id: this.generateEntryId(),
      nickname: trimmedNickname,
      score,
      kills,
      survivalTime,
      level,
      wave,
      timestamp: Date.now()
    };

    // Find insertion point (maintain descending score order)
    let insertIndex = this.entries.findIndex(e => e.score < score);
    if (insertIndex === -1) {
      insertIndex = this.entries.length;
    }

    // Check if score qualifies for top 100
    if (insertIndex >= this.MAX_ENTRIES && !replacedPrevious) {
      return {
        accepted: false,
        rank: insertIndex + 1, // Their would-be rank
        replacedPrevious: false,
        message: `Score not high enough for top ${this.MAX_ENTRIES} (minimum: ${this.entries[this.MAX_ENTRIES - 1]?.score || 0})`
      };
    }

    // Insert new entry
    this.entries.splice(insertIndex, 0, newEntry);

    // Trim to MAX_ENTRIES
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries = this.entries.slice(0, this.MAX_ENTRIES);
    }

    // Save to disk
    this.saveLeaderboard();

    const rank = insertIndex + 1;
    leaderboardLogger.info(
      { nickname: trimmedNickname, score, rank, replacedPrevious, previousScore },
      'New leaderboard entry'
    );

    return {
      accepted: true,
      rank,
      replacedPrevious,
      previousScore,
      message: replacedPrevious
        ? `New personal best! Rank #${rank} (improved from ${previousScore})`
        : `Congratulations! You're #${rank} on the all-time leaderboard!`
    };
  }

  /**
   * Get the top entries from the leaderboard
   *
   * @param limit - Maximum number of entries to return (default 100, max 100)
   * @param offset - Number of entries to skip (for pagination)
   * @returns Leaderboard entries sorted by score descending
   */
  getLeaderboard(limit: number = 100, offset: number = 0): LeaderboardQueryResult {
    const clampedLimit = Math.min(Math.max(1, limit), this.MAX_ENTRIES);
    const clampedOffset = Math.max(0, offset);

    const entries = this.entries.slice(clampedOffset, clampedOffset + clampedLimit);

    return {
      entries,
      totalEntries: this.entries.length
    };
  }

  /**
   * Get a specific player's rank and nearby entries
   *
   * @param nickname - Player's nickname to look up
   * @returns Player's entry and rank, or null if not on leaderboard
   */
  getPlayerRank(nickname: string): {
    entry: LeaderboardEntry | null;
    rank: number | null;
    nearbyEntries: LeaderboardEntry[];
  } {
    const trimmedNickname = nickname.trim().toLowerCase();
    const index = this.entries.findIndex(e => e.nickname.toLowerCase() === trimmedNickname);

    if (index === -1) {
      return { entry: null, rank: null, nearbyEntries: [] };
    }

    // Get 2 entries above and 2 below for context
    const startIndex = Math.max(0, index - 2);
    const endIndex = Math.min(this.entries.length, index + 3);
    const nearbyEntries = this.entries.slice(startIndex, endIndex);

    return {
      entry: this.entries[index],
      rank: index + 1,
      nearbyEntries
    };
  }

  /**
   * Get the minimum score required to enter the leaderboard
   */
  getMinimumScore(): number {
    if (this.entries.length < this.MAX_ENTRIES) {
      return 0; // Leaderboard not full yet
    }
    return this.entries[this.MAX_ENTRIES - 1]?.score || 0;
  }

  /**
   * Get leaderboard statistics
   */
  getStats(): {
    totalEntries: number;
    highestScore: number;
    lowestScore: number;
    averageScore: number;
    lastUpdated: number;
  } {
    if (this.entries.length === 0) {
      return {
        totalEntries: 0,
        highestScore: 0,
        lowestScore: 0,
        averageScore: 0,
        lastUpdated: 0
      };
    }

    const scores = this.entries.map(e => e.score);
    const sum = scores.reduce((a, b) => a + b, 0);
    const latestTimestamp = Math.max(...this.entries.map(e => e.timestamp));

    return {
      totalEntries: this.entries.length,
      highestScore: this.entries[0].score,
      lowestScore: this.entries[this.entries.length - 1].score,
      averageScore: Math.round(sum / this.entries.length),
      lastUpdated: latestTimestamp
    };
  }

  /**
   * Reset the leaderboard (for testing)
   */
  reset(): void {
    this.entries = [];
    this.saveLeaderboard();
    leaderboardLogger.info('Leaderboard reset');
  }

  /**
   * Load leaderboard from persistent storage
   */
  private loadLeaderboard(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'));

        if (Array.isArray(data.entries)) {
          // Validate and load entries
          this.entries = data.entries
            .filter((e: LeaderboardEntry) =>
              e.id && e.nickname && typeof e.score === 'number' &&
              typeof e.kills === 'number' && typeof e.survivalTime === 'number' &&
              typeof e.level === 'number' && typeof e.timestamp === 'number'
            )
            .sort((a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score)
            .slice(0, this.MAX_ENTRIES);

          leaderboardLogger.info({ entries: this.entries.length }, 'Loaded leaderboard');
        }
      }
    } catch (error) {
      leaderboardLogger.error({ err: error }, 'Failed to load leaderboard');
      this.entries = [];
    }
  }

  /**
   * Save leaderboard to persistent storage
   */
  private saveLeaderboard(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = {
        entries: this.entries,
        lastUpdated: Date.now(),
        version: 1 // Schema version for future migrations
      };

      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      leaderboardLogger.error({ err: error }, 'Failed to save leaderboard');
    }
  }

  /**
   * Generate a unique entry ID
   */
  private generateEntryId(): string {
    return `lb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance for server-wide leaderboard
let leaderboardInstance: LeaderboardService | null = null;

/**
 * Get the singleton LeaderboardService instance
 */
export function getLeaderboardService(): LeaderboardService {
  if (!leaderboardInstance) {
    leaderboardInstance = new LeaderboardService();
  }
  return leaderboardInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetLeaderboardService(): void {
  if (leaderboardInstance) {
    leaderboardInstance.reset();
  }
  leaderboardInstance = null;
}
