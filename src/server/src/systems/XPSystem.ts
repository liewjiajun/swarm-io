import { GameState, PlayerSchema, XPOrbSchema } from '../state/GameState.js';
import { SpatialHash } from './SpatialHash.js';
import type { WorldEventSystem } from './WorldEventSystem.js';
import { GAME_CONSTANTS, UPGRADE_POOL, getXPForLevel, WEAPON_CONFIGS } from '@swarm-io/shared';
import { xpSystemLogger } from '../utils/logger.js';

interface XPMetrics {
  totalXPCollected: number;
  orbsCollected: number;
  levelsGained: number;
  upgradesApplied: number;
  magnetizationEvents: number;
  securityViolations: number;
  coopXPShared: number; // P4.1: Track cooperative XP sharing
}

interface UpgradeChoice {
  id: string;
  type: 'weapon' | 'stat';
  weaponType?: string;
  statType?: string;
  description: string;
  weight: number;
}

export class XPSystem {
  private xpMetrics: XPMetrics = {
    totalXPCollected: 0,
    orbsCollected: 0,
    levelsGained: 0,
    upgradesApplied: 0,
    magnetizationEvents: 0,
    securityViolations: 0,
    coopXPShared: 0
  };

  constructor() {
    xpSystemLogger.info('Initialized with XP collection and leveling');
  }

  // Store reference to world event system for XP multiplier checks
  private worldEventSystem: WorldEventSystem | null = null;

  update(gameState: GameState, spatialHash: SpatialHash, _deltaTime: number, worldEventSystem?: WorldEventSystem): void {
    // Store world event system reference for XP multiplier checks
    if (worldEventSystem) {
      this.worldEventSystem = worldEventSystem;
    }

    // Process XP orb magnetization
    this.processOrbMagnetization(gameState, spatialHash);

    // Process XP orb collection
    this.processOrbCollection(gameState, spatialHash);

    // Check for level ups
    this.processLevelUps(gameState);

    // Clean up collected orbs
    this.cleanupCollectedOrbs(gameState);
  }

  private processOrbMagnetization(gameState: GameState, _spatialHash: SpatialHash): void {
    gameState.xpOrbs.forEach(orb => {
      // Skip already magnetized orbs
      if (orb.magnetized || orb.collected) return;

      // Find nearest living player within magnet range
      let nearestPlayer: PlayerSchema | null = null;
      let nearestDistance = Infinity;

      gameState.players.forEach(player => {
        if (player.dead) return;

        // P5.2: Apply magnet boost from power-up
        let effectiveMagnetRange = player.magnetRange;
        if (player.hasMagnetBoost) {
          effectiveMagnetRange *= GAME_CONSTANTS.POWERUP_MAGNET_BOOST_MULTIPLIER;
        }

        const distance = Math.sqrt((orb.x - player.x) ** 2 + (orb.y - player.y) ** 2);
        if (distance <= effectiveMagnetRange && distance < nearestDistance) {
          nearestPlayer = player;
          nearestDistance = distance;
        }
      });

      // Magnetize to nearest player
      if (nearestPlayer) {
        const target = nearestPlayer as PlayerSchema;
        orb.magnetized = true;
        orb.targetPlayerId = target.id;
        this.xpMetrics.magnetizationEvents++;
      }
    });
  }

  private processOrbCollection(gameState: GameState, spatialHash: SpatialHash): void {
    gameState.players.forEach(player => {
      if (player.dead) return;

      // Get nearby XP orbs
      const nearbyOrbs = spatialHash.queryRadius(
        player.x,
        player.y,
        GAME_CONSTANTS.XP_COLLECTION_RADIUS,
        'xp'
      );

      nearbyOrbs.forEach(spatialEntity => {
        const orb = spatialEntity.entity as XPOrbSchema;

        // Skip already collected orbs
        if (orb.collected) return;

        // Check collection radius
        const distance = Math.sqrt((player.x - orb.x) ** 2 + (player.y - orb.y) ** 2);
        if (distance <= GAME_CONSTANTS.XP_COLLECTION_RADIUS) {
          this.collectXPOrb(gameState, player, orb);
        }
      });
    });
  }

  private collectXPOrb(gameState: GameState, player: PlayerSchema, orb: XPOrbSchema): void {
    // Security validation: Ensure orb value is reasonable
    let validatedValue = this.validateXPValue(orb.value);

    if (validatedValue <= 0) {
      this.logSecurityViolation('Invalid XP orb value', {
        playerId: player.id,
        orbId: orb.id,
        value: orb.value
      });
      return;
    }

    // P5.1c: Apply double XP zone multiplier if player is in a double XP zone
    if (this.worldEventSystem) {
      const xpMultiplier = this.worldEventSystem.isInDoubleXpZone(gameState, player.x, player.y);
      if (xpMultiplier > 1) {
        validatedValue = Math.floor(validatedValue * xpMultiplier);
        xpSystemLogger.debug({
          playerId: player.id,
          baseXp: orb.value,
          multiplier: xpMultiplier,
          finalXp: validatedValue
        }, 'Double XP zone applied');
      }
    }

    // Award XP to player (handles hostility reduction)
    player.addXP(validatedValue);

    // P4.1: Cooperative XP Sharing - share XP with nearby players
    this.shareXPWithNearbyPlayers(gameState, player, validatedValue);

    // Mark orb as collected
    orb.collected = true;

    // Update metrics
    this.xpMetrics.totalXPCollected += validatedValue;
    this.xpMetrics.orbsCollected++;

    xpSystemLogger.debug({ playerId: player.id, xpCollected: validatedValue, totalXp: player.xp }, 'Player collected XP');
  }

  /**
   * P4.1: Share XP with nearby players within COOP_XP_SHARE_RADIUS
   * Nearby players receive a percentage of the collected XP
   */
  private shareXPWithNearbyPlayers(gameState: GameState, collector: PlayerSchema, xpValue: number): void {
    const shareRadius = GAME_CONSTANTS.COOP_XP_SHARE_RADIUS;
    const sharePercentage = GAME_CONSTANTS.COOP_XP_SHARE_PERCENTAGE;
    const sharedXP = Math.floor(xpValue * sharePercentage);

    if (sharedXP <= 0) return;

    // Find nearby living players (excluding the collector)
    gameState.players.forEach(player => {
      if (player.id === collector.id || player.dead) return;

      const distance = Math.sqrt(
        (player.x - collector.x) ** 2 + (player.y - collector.y) ** 2
      );

      if (distance <= shareRadius) {
        // Award shared XP to nearby player
        player.addXP(sharedXP);
        this.xpMetrics.coopXPShared += sharedXP;

        xpSystemLogger.debug({
          collectorId: collector.id,
          recipientId: player.id,
          sharedXP,
          distance: distance.toFixed(2)
        }, 'Shared XP with nearby player');
      }
    });
  }

  private processLevelUps(gameState: GameState): void {
    gameState.players.forEach(player => {
      // Skip if player already has pending upgrade
      if (player.pendingUpgrade || player.dead) return;

      // Check if player has enough XP to level up
      // getXPForLevel(level) returns XP needed to level up FROM that level
      const requiredXP = getXPForLevel(player.level);

      if (player.xp >= requiredXP) {
        this.levelUpPlayer(gameState, player);
      }
    });
  }

  private levelUpPlayer(gameState: GameState, player: PlayerSchema): void {
    // Calculate new level (with XP subtraction at each level)
    let newLevel = player.level;
    let remainingXP = player.xp;

    while (remainingXP >= getXPForLevel(newLevel) && newLevel < 100) {
      remainingXP -= getXPForLevel(newLevel);
      newLevel++;
    }

    if (newLevel > player.level) {
      const oldLevel = player.level;
      player.level = newLevel;
      // XP is now relative to current level, subtract what was used
      player.xp = remainingXP;
      player.xpToNextLevel = getXPForLevel(newLevel);

      // Generate upgrade choices and store them on player for client retrieval
      player.pendingChoices = this.generateUpgradeChoices(player);

      // Set pending upgrade state (this will be handled by GameRoom message system)
      player.pendingUpgrade = true;

      this.xpMetrics.levelsGained += (newLevel - oldLevel);

      xpSystemLogger.info({ playerId: player.id, oldLevel, newLevel }, 'Player leveled up');

      // Note: Upgrade choice presentation and selection will be handled by GameRoom
      // through client messages. This system just generates the choices.
    }
  }

  private generateUpgradeChoices(player: PlayerSchema): UpgradeChoice[] {
    const choices: UpgradeChoice[] = [];
    const availableUpgrades = [...UPGRADE_POOL];

    // Security validation: Ensure upgrade pool is valid
    if (!availableUpgrades || availableUpgrades.length === 0) {
      this.logSecurityViolation('Empty upgrade pool', { playerId: player.id });
      return choices;
    }

    // Generate 4 weighted random choices
    for (let i = 0; i < 4; i++) {
      if (availableUpgrades.length === 0) break;

      const upgrade = this.selectWeightedUpgrade(availableUpgrades, player);
      if (upgrade) {
        choices.push(upgrade);

        // Remove selected upgrade to prevent duplicates
        // Compare by weaponType/statType since UpgradeChoice.type differs from UpgradeDefinition.type
        const index = availableUpgrades.findIndex(u =>
          u.weaponType === upgrade.weaponType &&
          u.statType === upgrade.statType
        );
        if (index >= 0) {
          availableUpgrades.splice(index, 1);
        }
      }
    }

    return choices;
  }

  private selectWeightedUpgrade(upgrades: any[], player: PlayerSchema): UpgradeChoice | null {
    // Filter valid upgrades for this player
    const validUpgrades = upgrades.filter(upgrade => {
      if (upgrade.type === 'new_weapon' || upgrade.type === 'upgrade_weapon') {
        // Only offer weapon upgrades if player doesn't have it or can upgrade it
        const hasWeapon = player.hasWeapon(upgrade.weaponType);
        const weaponLevel = player.getWeaponLevel(upgrade.weaponType);

        return !hasWeapon || (hasWeapon && weaponLevel < 10);
      } else if (upgrade.type === 'stat_boost') {
        // All stat upgrades are always valid
        return true;
      }
      return false;
    });

    if (validUpgrades.length === 0) return null;

    // Calculate total weight
    const totalWeight = validUpgrades.reduce((sum, upgrade) => sum + upgrade.weight, 0);

    if (totalWeight <= 0) return null;

    // Select weighted random upgrade
    let random = Math.random() * totalWeight;

    for (const upgrade of validUpgrades) {
      random -= upgrade.weight;
      if (random <= 0) {
        return {
          id: `${upgrade.type}_${upgrade.weaponType || upgrade.statType}_${Date.now()}`,
          type: (upgrade.type === 'new_weapon' || upgrade.type === 'upgrade_weapon') ? 'weapon' : 'stat',
          weaponType: upgrade.weaponType,
          statType: upgrade.statType,
          description: this.generateUpgradeDescription(upgrade, player),
          weight: upgrade.weight
        };
      }
    }

    // Fallback to first upgrade
    const fallback = validUpgrades[0];
    return {
      id: `${fallback.type}_${fallback.weaponType || fallback.statType}_${Date.now()}`,
      type: (fallback.type === 'new_weapon' || fallback.type === 'upgrade_weapon') ? 'weapon' : 'stat',
      weaponType: fallback.weaponType,
      statType: fallback.statType,
      description: this.generateUpgradeDescription(fallback, player),
      weight: fallback.weight
    };
  }

  private generateUpgradeDescription(upgrade: any, player: PlayerSchema): string {
    if (upgrade.type === 'new_weapon' || upgrade.type === 'upgrade_weapon') {
      const weaponConfig = WEAPON_CONFIGS[upgrade.weaponType];
      const hasWeapon = player.hasWeapon(upgrade.weaponType);
      const currentLevel = player.getWeaponLevel(upgrade.weaponType);

      if (!hasWeapon) {
        return `${weaponConfig?.name || upgrade.weaponType} - ${weaponConfig?.description || 'New weapon'}`;
      } else {
        return `${weaponConfig?.name || upgrade.weaponType} Level ${currentLevel + 1} - Improved damage and effects`;
      }
    } else if (upgrade.type === 'stat_boost') {
      switch (upgrade.statType) {
        case 'health':
          return `+20 Max Health (Current: ${player.maxHealth})`;
        case 'speed':
          return `+10% Movement Speed (Current: ${player.speed.toFixed(1)})`;
        case 'magnet':
          return `+1 Magnet Range (Current: ${player.magnetRange})`;
        case 'armor':
          return `+5 Armor (Current: ${player.armor})`;
        default:
          return `${upgrade.statType} upgrade`;
      }
    }

    return 'Unknown upgrade';
  }

  // Public method for applying upgrades (called from GameRoom)
  applyUpgrade(gameState: GameState, playerId: string, upgradeChoice: UpgradeChoice): boolean {
    const player = gameState.players.get(playerId);
    if (!player || !player.pendingUpgrade) {
      this.logSecurityViolation('Invalid upgrade application', {
        playerId,
        pendingUpgrade: player?.pendingUpgrade
      });
      return false;
    }

    // Security validation: Ensure upgrade choice is valid
    if (!upgradeChoice || !upgradeChoice.type) {
      this.logSecurityViolation('Invalid upgrade choice structure', {
        playerId,
        upgradeChoice
      });
      return false;
    }

    let success = false;

    if (upgradeChoice.type === 'weapon' && upgradeChoice.weaponType) {
      success = this.applyWeaponUpgrade(player, upgradeChoice.weaponType);
    } else if (upgradeChoice.type === 'stat' && upgradeChoice.statType) {
      success = this.applyStatUpgrade(player, upgradeChoice.statType);
    }

    if (success) {
      player.pendingUpgrade = false;
      this.xpMetrics.upgradesApplied++;
      xpSystemLogger.debug({ playerId, upgradeType: upgradeChoice.type, target: upgradeChoice.weaponType || upgradeChoice.statType }, 'Applied upgrade');
    }

    return success;
  }

  private applyWeaponUpgrade(player: PlayerSchema, weaponType: string): boolean {
    // Validate weapon type exists
    if (!WEAPON_CONFIGS[weaponType]) {
      this.logSecurityViolation('Invalid weapon type for upgrade', {
        playerId: player.id,
        weaponType
      });
      return false;
    }

    if (player.hasWeapon(weaponType)) {
      // Upgrade existing weapon
      const currentLevel = player.getWeaponLevel(weaponType);
      if (currentLevel >= 10) {
        this.logSecurityViolation('Weapon already at max level', {
          playerId: player.id,
          weaponType,
          level: currentLevel
        });
        return false;
      }
      player.upgradeWeapon(weaponType);
    } else {
      // Add new weapon
      player.addWeapon(weaponType);
    }

    return true;
  }

  private applyStatUpgrade(player: PlayerSchema, statType: string): boolean {
    switch (statType) {
      case 'health':
        player.maxHealth += 20;
        player.health = Math.min(player.health + 20, player.maxHealth); // Also heal
        break;
      case 'speed':
        player.speed *= 1.1; // 10% increase
        break;
      case 'magnet':
        player.magnetRange += 1; // +1 per upgrade as per UPGRADE_POOL spec
        break;
      case 'armor':
        player.armor += 5;
        break;
      default:
        this.logSecurityViolation('Invalid stat type for upgrade', {
          playerId: player.id,
          statType
        });
        return false;
    }

    return true;
  }

  private validateXPValue(value: number): number {
    // Ensure XP value is finite and reasonable
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }

    // Cap XP value to prevent exploits
    const maxXPValue = 1000; // Reasonable maximum for single orb
    return Math.min(value, maxXPValue);
  }

  private cleanupCollectedOrbs(gameState: GameState): void {
    const toRemove: string[] = [];
    gameState.xpOrbs.forEach((orb, orbId) => {
      if (orb.collected) {
        toRemove.push(orbId);
      }
    });
    toRemove.forEach(orbId => gameState.removeXPOrb(orbId));
  }

  private logSecurityViolation(reason: string, data: any): void {
    xpSystemLogger.warn({ reason, ...data }, 'Security violation');
    this.xpMetrics.securityViolations++;
  }

  // Public methods for monitoring and debugging
  getXPMetrics(): XPMetrics {
    return { ...this.xpMetrics };
  }

  reset(): void {
    this.xpMetrics = {
      totalXPCollected: 0,
      orbsCollected: 0,
      levelsGained: 0,
      upgradesApplied: 0,
      magnetizationEvents: 0,
      securityViolations: 0,
      coopXPShared: 0
    };
    xpSystemLogger.info('Reset for new game');
  }
}