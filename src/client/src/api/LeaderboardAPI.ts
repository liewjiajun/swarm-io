/**
 * LeaderboardAPI - Client-side API for fetching all-time leaderboard (P9.2)
 *
 * Provides functions to fetch the server-side leaderboard data for display
 * in the HUD death screen and other UI components.
 *
 * Endpoints:
 * - GET /api/leaderboard - Top 100 all-time scores
 * - GET /api/leaderboard/player/:nickname - Player's rank and nearby entries
 * - GET /api/leaderboard/stats - Leaderboard statistics
 */

/**
 * Leaderboard entry from the server
 */
export interface LeaderboardEntry {
  id: string;
  nickname: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  wave: number;
  timestamp: number;
}

/**
 * Response from GET /api/leaderboard
 */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalEntries: number;
  minimumScore: number;
  timestamp: string;
}

/**
 * Response from GET /api/leaderboard/player/:nickname
 */
export interface PlayerRankResponse {
  entry: LeaderboardEntry | null;
  rank: number | null;
  nearbyEntries: LeaderboardEntry[];
  timestamp: string;
}

/**
 * Response from GET /api/leaderboard/stats
 */
export interface LeaderboardStatsResponse {
  stats: {
    totalEntries: number;
    highestScore: number;
    lowestScore: number;
    averageScore: number;
    lastUpdated: number;
  };
  timestamp: string;
}

// Get the API base URL (same host, different port in dev, same origin in prod)
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return 'http://localhost:2567';
  }
  return window.location.origin;
}

/**
 * Fetch the top entries from the all-time leaderboard
 *
 * @param limit - Maximum entries to fetch (default 100, max 100)
 * @param offset - Number of entries to skip (for pagination)
 * @returns Leaderboard response with entries and metadata
 */
export async function fetchLeaderboard(
  limit: number = 100,
  offset: number = 0
): Promise<LeaderboardResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/leaderboard?limit=${limit}&offset=${offset}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch leaderboard: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[LeaderboardAPI] Failed to fetch leaderboard:', error);
    // Return empty response on error
    return {
      entries: [],
      totalEntries: 0,
      minimumScore: 0,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Fetch a player's rank and nearby entries
 *
 * @param nickname - Player's nickname to look up
 * @returns Player's rank info or null if not on leaderboard
 */
export async function fetchPlayerRank(nickname: string): Promise<PlayerRankResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/leaderboard/player/${encodeURIComponent(nickname)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch player rank: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[LeaderboardAPI] Failed to fetch player rank:', error);
    return {
      entry: null,
      rank: null,
      nearbyEntries: [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Fetch leaderboard statistics
 *
 * @returns Leaderboard stats including total entries, high score, etc.
 */
export async function fetchLeaderboardStats(): Promise<LeaderboardStatsResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/leaderboard/stats`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch leaderboard stats: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('[LeaderboardAPI] Failed to fetch leaderboard stats:', error);
    return {
      stats: {
        totalEntries: 0,
        highestScore: 0,
        lowestScore: 0,
        averageScore: 0,
        lastUpdated: 0
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Format a leaderboard entry for display
 *
 * @param entry - The leaderboard entry to format
 * @param rank - The rank to display (1-indexed)
 * @returns Formatted HTML string for the entry
 */
export function formatLeaderboardEntry(entry: LeaderboardEntry, rank: number): string {
  const minutes = Math.floor(entry.survivalTime / 60);
  const seconds = Math.floor(entry.survivalTime % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return `
    <div class="alltime-leaderboard-entry">
      <span class="alltime-rank">#${rank}</span>
      <span class="alltime-name">${escapeHtml(entry.nickname)}</span>
      <span class="alltime-score">${entry.score.toLocaleString()}</span>
      <span class="alltime-kills">💀${entry.kills}</span>
      <span class="alltime-time">${timeStr}</span>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
