/**
 * PlayerStats - Persistent player statistics storage (P9.1)
 *
 * Manages localStorage persistence for player achievements and statistics.
 * Tracks personal bests across sessions for retention and meta-progression.
 *
 * Storage Key: 'swarm-io-player-stats'
 *
 * Why we need this:
 * - Retention hook: Players return to beat their personal best
 * - Meta-progression: Track lifetime achievements
 * - Death screen comparison: Show current vs best stats
 * - NEW RECORD celebration: Visual feedback when records are broken
 */

const STORAGE_KEY = 'swarm-io-player-stats';

/**
 * Player statistics persisted across sessions
 */
export interface PlayerStats {
  /** Best score achieved (kills * 100 + floor(timeAlive * 10) + level * 50) */
  bestScore: number;
  /** Longest survival time in seconds */
  bestSurvivalTime: number;
  /** Most kills in a single run */
  bestKills: number;
  /** Highest level reached */
  bestLevel: number;
  /** Total games played (for analytics) */
  totalGamesPlayed: number;
  /** Last played timestamp (for analytics) */
  lastPlayedAt: number;
}

/**
 * Result of comparing current run to personal bests
 */
export interface RecordCheckResult {
  /** True if any record was broken */
  isNewRecord: boolean;
  /** Specific records broken */
  newRecords: {
    score: boolean;
    survivalTime: boolean;
    kills: boolean;
    level: boolean;
  };
  /** Previous best values (for comparison display) */
  previousBests: {
    score: number;
    survivalTime: number;
    kills: number;
    level: number;
  };
}

/**
 * Default stats for new players
 */
const DEFAULT_STATS: PlayerStats = {
  bestScore: 0,
  bestSurvivalTime: 0,
  bestKills: 0,
  bestLevel: 0,
  totalGamesPlayed: 0,
  lastPlayedAt: 0,
};

/**
 * Load player stats from localStorage
 * Returns default stats if none exist or if data is corrupted
 */
export function loadPlayerStats(): PlayerStats {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_STATS };
    }

    const parsed = JSON.parse(stored) as Partial<PlayerStats>;

    // Validate and merge with defaults to handle schema changes
    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      bestSurvivalTime: typeof parsed.bestSurvivalTime === 'number' ? parsed.bestSurvivalTime : 0,
      bestKills: typeof parsed.bestKills === 'number' ? parsed.bestKills : 0,
      bestLevel: typeof parsed.bestLevel === 'number' ? parsed.bestLevel : 0,
      totalGamesPlayed: typeof parsed.totalGamesPlayed === 'number' ? parsed.totalGamesPlayed : 0,
      lastPlayedAt: typeof parsed.lastPlayedAt === 'number' ? parsed.lastPlayedAt : 0,
    };
  } catch {
    // If localStorage is unavailable or data is corrupted, return defaults
    return { ...DEFAULT_STATS };
  }
}

/**
 * Save player stats to localStorage
 */
export function savePlayerStats(stats: PlayerStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Silently fail if localStorage is unavailable (e.g., private mode)
  }
}

/**
 * Update stats after a game session and check for new records
 *
 * @param currentRun - Stats from the current game session
 * @returns RecordCheckResult with information about broken records
 */
export function updateStatsAfterGame(currentRun: {
  score: number;
  survivalTime: number;
  kills: number;
  level: number;
}): RecordCheckResult {
  const stats = loadPlayerStats();

  // Store previous bests for comparison
  const previousBests = {
    score: stats.bestScore,
    survivalTime: stats.bestSurvivalTime,
    kills: stats.bestKills,
    level: stats.bestLevel,
  };

  // Check which records were broken
  const newRecords = {
    score: currentRun.score > stats.bestScore,
    survivalTime: currentRun.survivalTime > stats.bestSurvivalTime,
    kills: currentRun.kills > stats.bestKills,
    level: currentRun.level > stats.bestLevel,
  };

  // Update bests if records were broken
  if (newRecords.score) stats.bestScore = currentRun.score;
  if (newRecords.survivalTime) stats.bestSurvivalTime = currentRun.survivalTime;
  if (newRecords.kills) stats.bestKills = currentRun.kills;
  if (newRecords.level) stats.bestLevel = currentRun.level;

  // Update session tracking
  stats.totalGamesPlayed++;
  stats.lastPlayedAt = Date.now();

  // Persist updated stats
  savePlayerStats(stats);

  return {
    isNewRecord: newRecords.score || newRecords.survivalTime || newRecords.kills || newRecords.level,
    newRecords,
    previousBests,
  };
}

/**
 * Get the player's all-time best stats without modifying them
 */
export function getBestStats(): {
  score: number;
  survivalTime: number;
  kills: number;
  level: number;
} {
  const stats = loadPlayerStats();
  return {
    score: stats.bestScore,
    survivalTime: stats.bestSurvivalTime,
    kills: stats.bestKills,
    level: stats.bestLevel,
  };
}

/**
 * Reset all player stats (for debugging/testing)
 */
export function resetPlayerStats(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
