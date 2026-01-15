import { logger } from '../utils/logger.js';

const telemetryLogger = logger.child({ component: 'TelemetryService' });

/**
 * Session data recorded when a player dies
 */
export interface SessionData {
  playerId: string;
  survivalTime: number;
  kills: number;
  levelReached: number;
  waveReached: number;
  weaponsUsed: string[];
  timestamp: number;
}

/**
 * Upgrade choice tracking data
 */
export interface UpgradeChoiceData {
  playerId: string;
  type: 'weapon' | 'stat';
  target: string; // weaponType or statType
  playerLevel: number;
  timestamp: number;
}

/**
 * Aggregated telemetry statistics for balance analysis
 */
export interface TelemetryStats {
  // Session statistics
  totalSessions: number;
  averageSurvivalTime: number;
  medianSurvivalTime: number;
  averageKills: number;
  averageLevelReached: number;
  averageWaveReached: number;

  // Upgrade choice statistics
  totalUpgradeChoices: number;
  upgradeChoicesByType: Record<string, number>; // weapon vs stat
  weaponUpgrades: Record<string, number>; // Count per weapon type
  statUpgrades: Record<string, number>; // Count per stat type

  // Weapon usage statistics
  weaponUsageRate: Record<string, number>; // Percentage of sessions using each weapon

  // Level distribution
  levelDistribution: Record<number, number>; // Count of sessions reaching each level

  // Time-based data
  lastUpdated: number;
  dataCollectionStarted: number;
}

/**
 * TelemetryService: Tracks gameplay data for balance analysis
 *
 * Purpose: Collect data to answer balance questions:
 * - What is average survival time? (P2.8)
 * - Which upgrades are most popular? (P2.10)
 * - What level do players typically reach? (P2.9)
 * - Which weapons are most used? (Balance tuning)
 *
 * Data is stored in-memory (acceptable for MVP - persists until server restart)
 */
export class TelemetryService {
  private sessions: SessionData[] = [];
  private upgradeChoices: UpgradeChoiceData[] = [];
  private dataCollectionStarted: number = Date.now();

  // Maximum entries to keep (prevents unbounded memory growth)
  private readonly MAX_SESSIONS = 10000;
  private readonly MAX_UPGRADE_CHOICES = 50000;

  constructor() {
    telemetryLogger.info('TelemetryService initialized');
  }

  /**
   * Record a player session when they die
   */
  recordSession(data: Omit<SessionData, 'timestamp'>): void {
    const session: SessionData = {
      ...data,
      timestamp: Date.now()
    };

    this.sessions.push(session);

    // Trim old data if over limit (FIFO)
    if (this.sessions.length > this.MAX_SESSIONS) {
      this.sessions.shift();
    }

    telemetryLogger.debug(
      { playerId: data.playerId, survivalTime: data.survivalTime, kills: data.kills, level: data.levelReached },
      'Session recorded'
    );
  }

  /**
   * Record an upgrade choice when a player selects one
   */
  recordUpgradeChoice(data: Omit<UpgradeChoiceData, 'timestamp'>): void {
    const choice: UpgradeChoiceData = {
      ...data,
      timestamp: Date.now()
    };

    this.upgradeChoices.push(choice);

    // Trim old data if over limit (FIFO)
    if (this.upgradeChoices.length > this.MAX_UPGRADE_CHOICES) {
      this.upgradeChoices.shift();
    }

    telemetryLogger.debug(
      { playerId: data.playerId, type: data.type, target: data.target, level: data.playerLevel },
      'Upgrade choice recorded'
    );
  }

  /**
   * Get aggregated telemetry statistics for balance analysis
   */
  getStats(): TelemetryStats {
    const survivalTimes = this.sessions.map(s => s.survivalTime);
    const kills = this.sessions.map(s => s.kills);
    const levels = this.sessions.map(s => s.levelReached);
    const waves = this.sessions.map(s => s.waveReached);

    // Calculate level distribution
    const levelDistribution: Record<number, number> = {};
    for (const level of levels) {
      levelDistribution[level] = (levelDistribution[level] || 0) + 1;
    }

    // Calculate weapon usage rate
    const weaponUsageCount: Record<string, number> = {};
    for (const session of this.sessions) {
      for (const weapon of session.weaponsUsed) {
        weaponUsageCount[weapon] = (weaponUsageCount[weapon] || 0) + 1;
      }
    }
    const weaponUsageRate: Record<string, number> = {};
    const totalSessions = this.sessions.length;
    for (const [weapon, count] of Object.entries(weaponUsageCount)) {
      weaponUsageRate[weapon] = totalSessions > 0 ? (count / totalSessions) * 100 : 0;
    }

    // Calculate upgrade choice statistics
    const upgradeChoicesByType: Record<string, number> = { weapon: 0, stat: 0 };
    const weaponUpgrades: Record<string, number> = {};
    const statUpgrades: Record<string, number> = {};

    for (const choice of this.upgradeChoices) {
      upgradeChoicesByType[choice.type] = (upgradeChoicesByType[choice.type] || 0) + 1;

      if (choice.type === 'weapon') {
        weaponUpgrades[choice.target] = (weaponUpgrades[choice.target] || 0) + 1;
      } else {
        statUpgrades[choice.target] = (statUpgrades[choice.target] || 0) + 1;
      }
    }

    return {
      totalSessions,
      averageSurvivalTime: this.calculateAverage(survivalTimes),
      medianSurvivalTime: this.calculateMedian(survivalTimes),
      averageKills: this.calculateAverage(kills),
      averageLevelReached: this.calculateAverage(levels),
      averageWaveReached: this.calculateAverage(waves),
      totalUpgradeChoices: this.upgradeChoices.length,
      upgradeChoicesByType,
      weaponUpgrades,
      statUpgrades,
      weaponUsageRate,
      levelDistribution,
      lastUpdated: Date.now(),
      dataCollectionStarted: this.dataCollectionStarted
    };
  }

  /**
   * Get raw session data (for detailed analysis)
   * Limited to most recent entries for performance
   */
  getRecentSessions(limit: number = 100): SessionData[] {
    return this.sessions.slice(-limit);
  }

  /**
   * Get raw upgrade choice data (for detailed analysis)
   * Limited to most recent entries for performance
   */
  getRecentUpgradeChoices(limit: number = 100): UpgradeChoiceData[] {
    return this.upgradeChoices.slice(-limit);
  }

  /**
   * Reset all telemetry data (useful for testing or fresh start)
   */
  reset(): void {
    this.sessions = [];
    this.upgradeChoices = [];
    this.dataCollectionStarted = Date.now();
    telemetryLogger.info('Telemetry data reset');
  }

  /**
   * Get data collection duration in seconds
   */
  getCollectionDuration(): number {
    return (Date.now() - this.dataCollectionStarted) / 1000;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

// Singleton instance for server-wide telemetry
let telemetryInstance: TelemetryService | null = null;

/**
 * Get the singleton TelemetryService instance
 */
export function getTelemetryService(): TelemetryService {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryService();
  }
  return telemetryInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTelemetryService(): void {
  if (telemetryInstance) {
    telemetryInstance.reset();
  }
  telemetryInstance = null;
}
