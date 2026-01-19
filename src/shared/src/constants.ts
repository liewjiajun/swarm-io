import type { WeaponConfig, EnemyConfig, UpgradeDefinition } from './types';

// =============================================================================
// VISUAL PALETTE - P1.11: 32-COLOR PALETTE FOR VISUAL CONSISTENCY
// =============================================================================
// Unified color palette inspired by Game Boy Pokemon style with vibrant colors
// All colors should use this palette for visual consistency

export const COLOR_PALETTE = {
  // Background colors (4)
  BG_DARK: 0x1a1a2e,         // Scene background - deep navy
  BG_MEDIUM: 0x2d2d44,       // Ground color - dark purple-gray
  BG_LIGHT: 0x3d3d5c,        // Grid lines - medium purple-gray
  BG_VOID: 0x0a0a14,         // Arena boundary void - near black

  // UI accent colors (4)
  UI_PRIMARY: 0x4ecdc4,      // Primary UI accent - teal
  UI_SECONDARY: 0x1abc9c,    // Secondary UI accent - dark teal
  UI_GOLD: 0xffd700,         // Gold accents - leaderboard, upgrades
  UI_DANGER: 0xff6b6b,       // Danger/health - coral red

  // Player colors (2)
  PLAYER_LOCAL: 0x00ff00,    // Local player - bright green
  PLAYER_OTHER: 0x0088ff,    // Other players - sky blue

  // Enemy colors (10)
  ENEMY_BAT: 0x8b4513,       // Bat - brown
  ENEMY_SKELETON: 0xffffff,  // Skeleton - white
  ENEMY_ZOMBIE: 0x228b22,    // Zombie - forest green
  ENEMY_GHOST: 0x87ceeb,     // Ghost - sky blue (ethereal)
  ENEMY_SLIME: 0x32cd32,     // Slime - lime green
  ENEMY_MINI_SLIME: 0x90ee90, // Mini Slime - light green (smaller variant)
  ENEMY_DEMON: 0xff4500,     // Demon - orange-red
  BOSS_SLIME: 0x00ff00,      // Boss Slime - bright green
  BOSS_SKELETON: 0xffd700,   // Boss Skeleton - gold
  BOSS_DEMON: 0x8b0000,      // Boss Demon - dark red

  // Projectile colors (8)
  PROJ_KNIFE: 0xc0c0c0,      // Knife slash - silver
  PROJ_WAND: 0x9b59b6,       // Magic wand - purple
  PROJ_BIBLE: 0xffd700,      // Bible orb - gold
  PROJ_LIGHTNING: 0x00ffff,  // Lightning - cyan
  PROJ_AXE: 0x8b4513,        // Axe - brown
  PROJ_FIREBALL: 0xff4500,   // Fireball - orange-red
  PROJ_WHIP: 0xa52a2a,       // Whip - dark red
  PROJ_GARLIC: 0x90ee90,     // Garlic - light green

  // XP orb colors (3)
  XP_SMALL: 0x00ff88,        // Small XP orb - teal-green
  XP_MEDIUM: 0x00ffff,       // Medium XP orb - cyan
  XP_LARGE: 0xffff00,        // Large XP orb - gold/yellow

  // Effect colors (2)
  EFFECT_EXPLOSION: 0xff6600, // Explosion - orange
  EFFECT_ENEMY_PROJ: 0xff0000, // Enemy projectile - red
} as const;

// Death particle colors by enemy type
export const DEATH_PARTICLE_COLORS: Record<string, number> = {
  bat: 0xff6b6b,
  skeleton: 0xcccccc,
  zombie: 0x4ecdc4,
  ghost: 0xaaaaff,
  slime: 0x95e1d3,
  mini_slime: 0x95e1d3, // Same as regular slime
  demon: 0xff4444,
  boss_slime: 0x00ff88,
  boss_skeleton: 0xffffff,
  boss_demon: 0xff0000,
};

// =============================================================================
// GAME BALANCE CONSTANTS
// =============================================================================

export const GAME_CONSTANTS = {
  // World
  BASE_WORLD_RADIUS: 500,
  RADIUS_PER_PLAYER: 100,
  WORLD_EDGE_DAMAGE: 10, // DPS when outside world bounds

  // Player
  PLAYER_START_HEALTH: 100,
  PLAYER_BASE_SPEED: 12, // BUG-040: Increased from 8 for better gameplay feel
  PLAYER_HITBOX_RADIUS: 0.5,
  PLAYER_INVULN_TIME: 3, // Seconds after respawn
  RESPAWN_DELAY: 3, // Seconds before respawn allowed

  // XP & Leveling
  XP_COLLECTION_RADIUS: 0.5, // Radius for XP orb collection
  XP_MAGNET_RADIUS: 3, // Radius for magnetizing XP orbs
  XP_ORB_SPEED: 12, // BUG-042: Increased from 8 for better collection feel

  // P9.5: Accelerated Progression - 3x XP gain for ~5 minute sessions
  // Target: Reach level 8 by minute 3 (Snake.io style pacing)
  XP_PROGRESSION_MULTIPLIER: 3.0, // Global XP multiplier applied to all XP gains

  // P4.1: Cooperative XP Sharing - players near each other share XP from kills
  COOP_XP_SHARE_RADIUS: 10, // Radius within which players share XP
  COOP_XP_SHARE_PERCENTAGE: 0.5, // 50% of XP shared with nearby players

  // P4.2: Revival Mechanic - alive players can revive dead teammates
  REVIVAL_RADIUS: 3, // How close you need to be to revive
  REVIVAL_TIME: 3, // Seconds to hold to revive
  REVIVAL_COOLDOWN: 10, // Cooldown before revived player can be revived again

  // P4.4: Combo System - sequential hits by different players multiply damage
  COMBO_WINDOW: 2, // Seconds between hits to maintain combo
  COMBO_MAX_MULTIPLIER: 3, // Maximum combo damage multiplier
  COMBO_INCREMENT: 0.25, // Damage multiplier increase per combo

  // P4.3: Team Zones - areas where players buff each other
  TEAM_ZONE_RADIUS: 8, // Radius to count as being in a team zone with another player
  TEAM_ZONE_DAMAGE_BONUS: 0.15, // +15% damage per nearby ally
  TEAM_ZONE_DEFENSE_BONUS: 0.10, // -10% damage taken per nearby ally
  TEAM_ZONE_MAX_BONUS: 0.45, // Maximum bonus (capped at 3 allies worth)

  // P4.6: Trading/Gifting Upgrades - players can share weapons with nearby teammates
  TRADE_RADIUS: 5, // How close players need to be to trade (between revival 3 and team zone 8)
  TRADE_OFFER_TIMEOUT: 30, // Seconds before a trade offer expires
  TRADE_COOLDOWN: 10, // Seconds after completing a trade before another can be initiated

  // P5.1: World Events - random events that affect gameplay
  WORLD_EVENT_MIN_INTERVAL: 60, // Minimum seconds between world events
  WORLD_EVENT_MAX_INTERVAL: 120, // Maximum seconds between world events
  WORLD_EVENT_ANNOUNCEMENT_TIME: 5, // Seconds warning before event starts

  // P5.1a: Meteor Shower event
  METEOR_SHOWER_DURATION: 15, // Duration in seconds
  METEOR_SHOWER_RADIUS: 50, // Radius of affected area
  METEOR_SHOWER_DAMAGE: 25, // Damage per meteor
  METEOR_SHOWER_INTERVAL: 0.5, // Seconds between meteor strikes
  METEOR_SHOWER_METEOR_RADIUS: 3, // Damage radius per meteor

  // P5.1b: Invasion Wave event
  INVASION_WAVE_DURATION: 30, // Duration in seconds
  INVASION_WAVE_ENEMY_COUNT: 50, // Extra enemies to spawn
  INVASION_WAVE_SPAWN_RADIUS: 80, // Radius around event center to spawn enemies

  // P5.1c: Double XP Zone event
  DOUBLE_XP_ZONE_DURATION: 45, // Duration in seconds
  DOUBLE_XP_ZONE_RADIUS: 40, // Radius of affected area
  DOUBLE_XP_ZONE_MULTIPLIER: 2.0, // XP multiplier inside zone

  // P5.2: Hidden Power-Ups - rare spawns that grant temporary buffs
  POWERUP_MIN_SPAWN_INTERVAL: 45, // Minimum seconds between power-up spawns
  POWERUP_MAX_SPAWN_INTERVAL: 90, // Maximum seconds between power-up spawns
  POWERUP_SPAWN_CHANCE: 0.3, // 30% chance to spawn when interval passes
  POWERUP_LIFETIME: 60, // Seconds before uncollected power-up despawns
  POWERUP_COLLECTION_RADIUS: 1.5, // Radius for collecting power-ups
  POWERUP_MAX_ACTIVE: 3, // Maximum power-ups in the world at once

  // P5.2a: Health Restore power-up
  POWERUP_HEALTH_RESTORE_AMOUNT: 50, // Instant health restored

  // P5.2b: Damage Boost power-up
  POWERUP_DAMAGE_BOOST_MULTIPLIER: 1.5, // 50% more damage
  POWERUP_DAMAGE_BOOST_DURATION: 15, // Duration in seconds

  // P5.2c: Speed Boost power-up
  POWERUP_SPEED_BOOST_MULTIPLIER: 1.4, // 40% faster movement
  POWERUP_SPEED_BOOST_DURATION: 12, // Duration in seconds

  // P5.2d: Shield power-up
  POWERUP_SHIELD_DURATION: 8, // Seconds of invulnerability

  // P5.2e: Magnet Boost power-up
  POWERUP_MAGNET_BOOST_MULTIPLIER: 3, // 3x magnet range
  POWERUP_MAGNET_BOOST_DURATION: 20, // Duration in seconds

  // Combat
  PVP_DAMAGE_MULTIPLIER: 0.15, // 15% damage to other players
  HOSTILITY_DECAY_RATE: 0.1, // Per second
  HOSTILITY_XP_PENALTY_THRESHOLD: 10,

  // P9.8: Knockback - enemies get pushed back when hit
  KNOCKBACK_BASE_FORCE: 8, // Base knockback velocity
  KNOCKBACK_DAMAGE_SCALE: 0.2, // Additional knockback per damage point
  KNOCKBACK_DURATION: 0.15, // Duration in seconds (100-200ms range)
  KNOCKBACK_BOSS_REDUCTION: 0.3, // Bosses only receive 30% knockback
  KNOCKBACK_STUN_DURATION: 0.1, // Brief stun during knockback (100ms)

  // Network
  SERVER_TICK_RATE: 16, // Milliseconds (60Hz)
  NETWORK_SEND_RATE: 20, // Hz
  INTEREST_RADIUS: 50, // Only sync entities within this radius

  // Spawning
  ENEMY_SPAWN_INTERVAL: 0.5, // Seconds between spawns
  ENEMY_SPAWN_DISTANCE: 30, // Outside visible area
  MAX_ENEMIES_PER_PLAYER: 50,
  WAVE_DURATION: 60, // Seconds per wave

  // Physics (Enemy AI and Projectile behavior)
  ENEMY_DETECTION_RANGE: 100, // Max distance to detect players
  ENEMY_SLOW_SPEED_RATIO: 0.5, // Speed multiplier for retreat/wander
  RANGED_RETREAT_DISTANCE_RATIO: 0.5, // Ranged enemies retreat when within this ratio of range
  ORB_ORBIT_SPEED: Math.PI, // Bible orb rotation speed (radians/sec) ~1 rev per 2 sec
  ORB_MIN_DISTANCE_THRESHOLD: 0.5, // Min distance before using default radius
  ORB_DEFAULT_RADIUS: 3, // Default orbit radius for Bible orbs
  CHARGE_TARGET_REACHED_THRESHOLD: 0.5, // Distance to consider charge target reached
  CHARGE_IMPACT_LIFETIME: 0.2, // Lifetime of charge impact AOE
  CHARGE_IMPACT_RADIUS: 3, // Radius of charge impact damage
  CHARGE_IMPACT_MAX_PIERCE: 999, // Max targets hit by charge impact
  BOSS_SUMMON_ANGLE_VARIANCE: 0.5, // Random variance in summon spawn angles (radians)
  ENEMY_PROJECTILE_PIERCE: 1, // Single hit for enemy projectiles

  // BUG-030 FIX: Boundary enforcement for projectiles and enemies
  // Entities beyond worldRadius + margin are cleaned up to prevent memory leaks
  PROJECTILE_BOUNDARY_MARGIN: 50, // Projectiles removed at worldRadius + 50
  ENEMY_BOUNDARY_MARGIN: 100, // Enemies removed at worldRadius + 100

  // P9.6: Randomized Starting Weapons - players start with 2-3 random weapons
  STARTING_WEAPON_MIN: 2, // Minimum weapons to start with
  STARTING_WEAPON_MAX: 3, // Maximum weapons to start with
} as const;

// =============================================================================
// P9.6: STARTING WEAPON CONFIGURATION
// =============================================================================
// Weapon categories for balanced random selection
// Ensures at least 1 ranged and 1 melee/AOE weapon

export const WEAPON_CATEGORIES = {
  // Ranged weapons - projectiles that travel to hit enemies at distance
  RANGED: ['wand', 'fireball', 'lightning'] as const,
  // Melee/AOE weapons - close combat or area damage
  MELEE_AOE: ['knife', 'garlic', 'whip', 'axe', 'bible'] as const,
} as const;

/**
 * Get a random set of starting weapons for a new player
 * Ensures balanced loadout with at least 1 ranged and 1 melee/AOE weapon
 * @returns Array of weapon type strings (2-3 weapons)
 */
export function getRandomStartingWeapons(): string[] {
  const { STARTING_WEAPON_MIN, STARTING_WEAPON_MAX } = GAME_CONSTANTS;

  // Determine number of weapons (2-3)
  const weaponCount = Math.floor(Math.random() * (STARTING_WEAPON_MAX - STARTING_WEAPON_MIN + 1)) + STARTING_WEAPON_MIN;

  const selectedWeapons: string[] = [];

  // Select 1 random ranged weapon
  const rangedWeapons = [...WEAPON_CATEGORIES.RANGED];
  const rangedIndex = Math.floor(Math.random() * rangedWeapons.length);
  selectedWeapons.push(rangedWeapons[rangedIndex]);

  // Select 1 random melee/AOE weapon
  const meleeWeapons = [...WEAPON_CATEGORIES.MELEE_AOE];
  const meleeIndex = Math.floor(Math.random() * meleeWeapons.length);
  selectedWeapons.push(meleeWeapons[meleeIndex]);

  // If we need 3 weapons, add one more random weapon from either category
  if (weaponCount >= 3) {
    // Combine remaining weapons from both categories
    const remainingRanged = rangedWeapons.filter((_, i) => i !== rangedIndex);
    const remainingMelee = meleeWeapons.filter((_, i) => i !== meleeIndex);
    const remaining = [...remainingRanged, ...remainingMelee];

    if (remaining.length > 0) {
      const extraIndex = Math.floor(Math.random() * remaining.length);
      selectedWeapons.push(remaining[extraIndex]);
    }
  }

  return selectedWeapons;
}

// =============================================================================
// WEAPON CONFIGURATIONS
// =============================================================================

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  knife: {
    type: 'knife',
    name: 'Knife',
    description: 'Quick slashing attack in facing direction',
    damage: 10,
    cooldown: 0.5,
    range: 2,
    maxLevel: 8,
    baseDamage: 10,
    baseCooldown: 0.5,
    baseRange: 2,
  },
  wand: {
    type: 'wand',
    name: 'Magic Wand',
    description: 'Fires a magic projectile',
    damage: 15,
    cooldown: 1.0,
    range: 15,
    maxLevel: 8,
    baseDamage: 15,
    baseCooldown: 1.0,
    baseRange: 15,
    projectileSpeed: 12,
    projectileCount: 1,
  },
  bible: {
    type: 'bible',
    name: 'King Bible',
    description: 'Orbits around you, damaging enemies',
    damage: 8,
    cooldown: 0, // Continuous
    range: 3,
    maxLevel: 8,
    baseDamage: 8,
    baseCooldown: 0,
    baseRange: 3,
  },
  garlic: {
    type: 'garlic',
    name: 'Garlic',
    description: 'Damages nearby enemies continuously',
    damage: 5,
    cooldown: 0.5,
    range: 2.5,
    maxLevel: 8,
    baseDamage: 5,
    baseCooldown: 0.5,
    baseRange: 2.5,
    area: 2.5,
  },
  lightning: {
    type: 'lightning',
    name: 'Lightning Ring',
    description: 'Strikes random nearby enemies',
    damage: 25,
    cooldown: 2.0,
    range: 10,
    maxLevel: 8,
    baseDamage: 25,
    baseCooldown: 2.0,
    baseRange: 10,
  },
  axe: {
    type: 'axe',
    name: 'Axe',
    description: 'Thrown axe that passes through enemies',
    damage: 20,
    cooldown: 1.5,
    range: 12,
    maxLevel: 8,
    baseDamage: 20,
    baseCooldown: 1.5,
    baseRange: 12,
    projectileSpeed: 14, // BUG-042: Increased from 8 for better gameplay feel
  },
  fireball: {
    type: 'fireball',
    name: 'Fireball',
    description: 'Explodes on impact',
    damage: 30,
    cooldown: 3.0,
    range: 20,
    maxLevel: 8,
    baseDamage: 30,
    baseCooldown: 3.0,
    baseRange: 20,
    projectileSpeed: 20, // BUG-042: Increased from 10 for better gameplay feel
    area: 3,
  },
  whip: {
    type: 'whip',
    name: 'Whip',
    description: 'Wide horizontal attack',
    damage: 12,
    cooldown: 1.0,
    range: 4,
    maxLevel: 8,
    baseDamage: 12,
    baseCooldown: 1.0,
    baseRange: 4,
    area: 4,
  },
};

// =============================================================================
// ENEMY CONFIGURATIONS
// =============================================================================

// =============================================================================
// ENEMY ATTACK CONFIGURATIONS (for ranged enemies)
// =============================================================================

export interface EnemyAttackConfig {
  damage: number;
  cooldown: number;
  range: number;
  projectileSpeed: number;
  projectileRadius: number;
  projectileLifetime: number;
  projectileType: string;
}

export const ENEMY_ATTACK_CONFIGS: Record<string, EnemyAttackConfig> = {
  demon: {
    damage: 15,
    cooldown: 2.5,
    range: 15,
    projectileSpeed: 8,
    projectileRadius: 0.4,
    projectileLifetime: 3,
    projectileType: 'demon_fireball',
  },
  boss_demon: {
    damage: 25,
    cooldown: 1.5,
    range: 20,
    projectileSpeed: 10,
    projectileRadius: 0.6,
    projectileLifetime: 4,
    projectileType: 'demon_fireball',
  },
};

// =============================================================================
// BOSS ABILITY CONFIGURATIONS
// =============================================================================

export interface BossAbilityConfig {
  type: 'split' | 'summon' | 'charge';
  // Split ability (boss_slime): spawns smaller enemies on death
  splitCount?: number;
  splitType?: string;
  // Summon ability (boss_skeleton): spawns minions periodically
  summonCount?: number;
  summonType?: string;
  summonCooldown?: number;
  summonRange?: number;
  // Charge ability (boss_demon): charges toward player when close
  chargeSpeed?: number;
  chargeDamage?: number;
  chargeRange?: number;
  chargeCooldown?: number;
}

export const BOSS_ABILITY_CONFIGS: Record<string, BossAbilityConfig> = {
  // Regular slime splits into 2 mini_slimes on death (spec: "Splits on death")
  slime: {
    type: 'split',
    splitCount: 2,
    splitType: 'mini_slime',
  },
  boss_slime: {
    type: 'split',
    splitCount: 4,
    splitType: 'slime',
  },
  boss_skeleton: {
    type: 'summon',
    summonCount: 3,
    summonType: 'skeleton',
    summonCooldown: 8,
    summonRange: 5,
  },
  boss_demon: {
    type: 'charge',
    chargeSpeed: 15,
    chargeDamage: 40,
    chargeRange: 8,
    chargeCooldown: 5,
  },
};

// P9.5: Enemy XP values doubled for accelerated progression
// Combined with XP_PROGRESSION_MULTIPLIER = 3.0 and compressed XP curve
// BUG-040: Enemy speeds scaled 1.5x to match increased player speed (8→12)
// P6.1: Health balanced for wave progression (early 2-3 hits, mid 4-6 hits, late 6-10 hits)
// P6.2: Boss health tuned for level requirements (5-6, 10+, evolved weapons)
export const ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  // === EARLY WAVE ENEMIES (0-60s) - Die in 2-3 hits at level 1-4 ===
  bat: {
    type: 'bat',
    name: 'Bat',
    health: 20,        // P6.1: 10→20 for 2-hit kill with knife (10 dmg)
    speed: 9,          // BUG-040: 6→9 (1.5x scale for player speed 8→12)
    damage: 5,
    xpValue: 2,        // P9.5: Doubled from 1
    size: 0.4,
    isBoss: false,
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    health: 30,        // P6.1: 25→30 for 3-hit kill at level 1
    speed: 5.6,        // BUG-040: 3.75→5.6 (1.5x scale)
    damage: 10,
    xpValue: 6,        // P9.5: Doubled from 3
    size: 0.5,
    isBoss: false,
  },
  // === MID WAVE ENEMIES (60-180s) - Die in 4-6 hits at level 5-10 ===
  zombie: {
    type: 'zombie',
    name: 'Zombie',
    health: 80,        // P6.1: 50→80 for 4-5 hits at level 5 (18 dmg)
    speed: 3.4,        // BUG-040: 2.25→3.4 (1.5x scale)
    damage: 15,
    xpValue: 10,       // P9.5: Doubled from 5
    size: 0.6,
    isBoss: false,
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    health: 35,        // P6.1: 15→35 (fragile but fast, 2-3 hits at level 5)
    speed: 6.75,       // BUG-040: 4.5→6.75 (1.5x scale)
    damage: 8,
    xpValue: 8,        // P9.5: Doubled from 4
    size: 0.5,
    isBoss: false,
  },
  slime: {
    type: 'slime',
    name: 'Slime',
    health: 45,        // P6.1: 20→45 for 3 hits at level 5
    speed: 4.5,        // BUG-040: 3→4.5 (1.5x scale)
    damage: 8,
    xpValue: 4,        // P9.5: Doubled from 2
    size: 0.5,
    isBoss: false,
  },
  mini_slime: {
    type: 'mini_slime',
    name: 'Mini Slime',
    health: 15,        // P6.1: 8→15 (spawns from boss, quick kills)
    speed: 5.6,        // BUG-040: 3.75→5.6 (1.5x scale)
    damage: 4,
    xpValue: 2,        // P9.5: Doubled from 1
    size: 0.3,
    isBoss: false,
  },
  // === LATE WAVE ENEMIES (180s+) - Die in 6-10 hits at level 10+ ===
  demon: {
    type: 'demon',
    name: 'Demon',
    health: 120,       // P6.1: 40→120 for 6-7 hits at level 10 (26 dmg)
    speed: 5.6,        // BUG-040: 3.75→5.6 (1.5x scale)
    damage: 20,
    xpValue: 16,       // P9.5: Doubled from 8
    size: 0.7,
    isBoss: false,
  },
  // === BOSSES - Tuned for level requirements ===
  boss_slime: {
    type: 'boss_slime',
    name: 'Giant Slime',
    health: 300,       // P6.2: 500→300 (beatable at level 5-6, ~18 dmg × 17 hits)
    speed: 2.25,       // BUG-040: 1.5→2.25 (1.5x scale)
    damage: 25,        // P6.2: 30→25 (less punishing for early boss)
    xpValue: 200,      // P9.5: Doubled from 100
    size: 3,
    isBoss: true,
  },
  boss_skeleton: {
    type: 'boss_skeleton',
    name: 'Skeleton King',
    health: 600,       // P6.2: 800→600 (requires level 10+, ~26 dmg × 23 hits)
    speed: 3.4,        // BUG-040: 2.25→3.4 (1.5x scale)
    damage: 35,        // P6.2: 40→35 (manageable at level 10)
    xpValue: 300,      // P9.5: Doubled from 150
    size: 2.5,
    isBoss: true,
  },
  boss_demon: {
    type: 'boss_demon',
    name: 'Demon Lord',
    health: 1000,      // P6.2: 1200→1000 (requires evolutions, ~1.5x dmg bonus)
    speed: 4.5,        // BUG-040: 3→4.5 (1.5x scale)
    damage: 45,        // P6.2: 50→45 (deadly but survivable with evolutions)
    xpValue: 500,      // P9.5: Doubled from 250
    size: 3,
    isBoss: true,
  },
};

// =============================================================================
// XP ORBS
// =============================================================================

// P9.5: XP orb values doubled for accelerated progression
// Combined with XP_PROGRESSION_MULTIPLIER = 3.0 for ~6x effective XP from orbs
export const XP_ORB_VALUES = {
  small: 2,   // P9.5: Doubled from 1
  medium: 10, // P9.5: Doubled from 5
  large: 50,  // P9.5: Doubled from 25
} as const;

// =============================================================================
// WAVE SCHEDULE
// =============================================================================

export interface WaveConfig {
  time: number; // When this wave starts (seconds)
  enemies: { [type: string]: number };
  bossType?: string;
}

// P9.5: Compressed wave schedule for ~5 minute sessions
// Waves now transition every 20-30 seconds instead of 30-60 seconds
// First boss at 60s instead of 120s for earlier power spikes
export const WAVE_SCHEDULE: WaveConfig[] = [
  { time: 0, enemies: { bat: 25 } },                                              // Wave 1: 0-20s
  { time: 20, enemies: { bat: 35, skeleton: 8 } },                                // Wave 2: 20-45s
  { time: 45, enemies: { bat: 30, skeleton: 20 } },                               // Wave 3: 45-60s
  { time: 60, enemies: { skeleton: 25, zombie: 15 }, bossType: 'boss_slime' },    // Wave 4: 60-90s, FIRST BOSS
  { time: 90, enemies: { zombie: 25, ghost: 20 } },                               // Wave 5: 90-120s
  { time: 120, enemies: { ghost: 35, slime: 25 } },                               // Wave 6: 120-150s
  { time: 150, enemies: { slime: 35, demon: 15 }, bossType: 'boss_skeleton' },    // Wave 7: 150-180s, SECOND BOSS
  { time: 180, enemies: { demon: 30, zombie: 35 } },                              // Wave 8: 180-210s
  { time: 210, enemies: { demon: 40, ghost: 35 } },                               // Wave 9: 210-240s
  { time: 240, enemies: { demon: 50, ghost: 40 }, bossType: 'boss_demon' },       // Wave 10: 240-270s, THIRD BOSS
  { time: 270, enemies: { demon: 60, zombie: 45, ghost: 40 } },                   // Wave 11: 270-300s, ENDGAME
  { time: 300, enemies: { demon: 70, boss_slime: 1, zombie: 50 }, bossType: 'boss_demon' }, // Wave 12: 300s+, CHAOS
  // After 300s (~5 min), repeat with increasing difficulty multiplier for extended sessions
];

// =============================================================================
// XP CURVE
// =============================================================================

/**
 * P9.5: Compressed XP curve for ~5 minute sessions
 *
 * Original curve (for reference):
 *   Level 1->2: 5 XP, Level 2->3: 15 XP, etc.
 *   Total to level 8: ~245 XP
 *
 * New compressed curve:
 *   Level 1->2: 3 XP, Level 2->3: 6 XP, etc.
 *   Total to level 8: ~84 XP (with 3x XP_PROGRESSION_MULTIPLIER = effective ~252 XP value)
 *
 * Combined with XP_PROGRESSION_MULTIPLIER = 3.0, players gain XP 3x faster
 * and level requirements are reduced, achieving ~9x effective progression boost.
 *
 * Target: Reach level 8 by minute 3 for Snake.io style pacing.
 */
export function getXPForLevel(level: number): number {
  // P9.5: Compressed XP requirements for faster progression
  if (level < 2) return 3;  // Was 5
  if (level <= 20) return 3 + (level - 1) * 5;  // Was 5 + (level-1) * 10, now ~50% XP req
  if (level <= 40) return 98 + (level - 20) * 7;  // Compressed mid-game
  return 238 + (level - 40) * 10;  // Compressed late-game
}

/**
 * Original XP curve preserved for reference/testing
 * Can be used for "Classic" mode in future
 */
export function getXPForLevelOriginal(level: number): number {
  if (level < 2) return 5;
  if (level <= 20) return 5 + (level - 1) * 10;
  if (level <= 40) return 195 + (level - 20) * 13;
  return 455 + (level - 40) * 16;
}

// =============================================================================
// UPGRADE POOL
// =============================================================================

export const UPGRADE_POOL: UpgradeDefinition[] = [
  // New weapons
  { id: 'new_knife', type: 'new_weapon', weaponType: 'knife', description: 'Knife - Quick slashing attack', weight: 10, maxLevel: 8 },
  { id: 'new_wand', type: 'new_weapon', weaponType: 'wand', description: 'Magic Wand - Fires projectiles', weight: 10, maxLevel: 8 },
  { id: 'new_bible', type: 'new_weapon', weaponType: 'bible', description: 'King Bible - Orbiting damage', weight: 8, maxLevel: 8 },
  { id: 'new_garlic', type: 'new_weapon', weaponType: 'garlic', description: 'Garlic - AOE around you', weight: 10, maxLevel: 8 },
  { id: 'new_lightning', type: 'new_weapon', weaponType: 'lightning', description: 'Lightning - Strikes random enemies', weight: 6, maxLevel: 8 },
  { id: 'new_axe', type: 'new_weapon', weaponType: 'axe', description: 'Axe - Piercing throw', weight: 8, maxLevel: 8 },
  { id: 'new_fireball', type: 'new_weapon', weaponType: 'fireball', description: 'Fireball - Explodes on impact', weight: 6, maxLevel: 8 },
  { id: 'new_whip', type: 'new_weapon', weaponType: 'whip', description: 'Whip - Wide arc attack', weight: 8, maxLevel: 8 },

  // Stat boosts
  { id: 'health_boost', type: 'stat_boost', statType: 'health', statBoost: 20, description: '+20 Max Health', weight: 15, maxLevel: 99 },
  { id: 'speed_boost', type: 'stat_boost', statType: 'speed', statBoost: 0.5, description: '+10% Move Speed', weight: 12, maxLevel: 5 },
  { id: 'magnet_boost', type: 'stat_boost', statType: 'magnet', statBoost: 1, description: '+1 XP Magnet Range', weight: 10, maxLevel: 5 },
  { id: 'armor_boost', type: 'stat_boost', statType: 'armor', statBoost: 5, description: '-5 Damage Taken', weight: 8, maxLevel: 5 },
];

// =============================================================================
// P9.3: CHARACTER CLASSES
// =============================================================================
// Each class provides unique starting weapons and a passive bonus
// Classes are unlocked through gameplay achievements stored in localStorage

export interface CharacterClassConfig {
  id: string;
  name: string;
  description: string;
  // Starting weapons (fixed loadout, not random)
  startingWeapons: string[];
  // Stat multipliers (1.0 = no change)
  healthMultiplier: number;
  speedMultiplier: number;
  damageMultiplier: number;
  xpMultiplier: number;
  // Unlock requirements (null = always unlocked)
  unlockRequirement: CharacterClassUnlockRequirement | null;
}

export interface CharacterClassUnlockRequirement {
  type: 'level' | 'kills' | 'survival' | 'damage_blocked';
  value: number;
  description: string;
}

export const CHARACTER_CLASSES: Record<string, CharacterClassConfig> = {
  survivor: {
    id: 'survivor',
    name: 'Survivor',
    description: 'Balanced start with random weapons',
    startingWeapons: [], // Empty = use getRandomStartingWeapons()
    healthMultiplier: 1.0,
    speedMultiplier: 1.0,
    damageMultiplier: 1.0,
    xpMultiplier: 1.0,
    unlockRequirement: null, // Always available
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    description: '+20% XP gain',
    startingWeapons: ['wand', 'fireball'],
    healthMultiplier: 1.0,
    speedMultiplier: 1.0,
    damageMultiplier: 1.0,
    xpMultiplier: 1.2,
    unlockRequirement: {
      type: 'level',
      value: 10,
      description: 'Reach level 10 in a single run',
    },
  },
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    description: '+25% damage',
    startingWeapons: ['axe', 'whip'],
    healthMultiplier: 1.0,
    speedMultiplier: 1.0,
    damageMultiplier: 1.25,
    xpMultiplier: 1.0,
    unlockRequirement: {
      type: 'kills',
      value: 500,
      description: 'Kill 500 enemies total',
    },
  },
  speedster: {
    id: 'speedster',
    name: 'Speedster',
    description: '+30% move speed',
    startingWeapons: ['knife', 'knife'], // Two knives!
    healthMultiplier: 1.0,
    speedMultiplier: 1.3,
    damageMultiplier: 1.0,
    xpMultiplier: 1.0,
    unlockRequirement: {
      type: 'survival',
      value: 300, // 5 minutes
      description: 'Survive for 5 minutes',
    },
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    description: '+50% HP',
    startingWeapons: ['garlic', 'bible'],
    healthMultiplier: 1.5,
    speedMultiplier: 1.0,
    damageMultiplier: 1.0,
    xpMultiplier: 1.0,
    unlockRequirement: {
      type: 'damage_blocked',
      value: 1000,
      description: 'Block 1000 damage total',
    },
  },
};

/**
 * Get the class configuration for a given class ID
 * Returns survivor class if the ID is invalid
 */
export function getCharacterClass(classId: string): CharacterClassConfig {
  return CHARACTER_CLASSES[classId] || CHARACTER_CLASSES.survivor;
}

/**
 * Get starting weapons for a class
 * If the class has no preset weapons, returns random starting weapons
 */
export function getClassStartingWeapons(classId: string): string[] {
  const classConfig = getCharacterClass(classId);
  if (classConfig.startingWeapons.length === 0) {
    return getRandomStartingWeapons();
  }
  return [...classConfig.startingWeapons];
}

/**
 * Get all available class IDs
 */
export function getCharacterClassIds(): string[] {
  return Object.keys(CHARACTER_CLASSES);
}

// =============================================================================
// P9.4: WEAPON EVOLUTION SYSTEM
// =============================================================================
// When a weapon reaches max level (8), it evolves into a more powerful form
// Each evolution has unique enhanced effects

export interface WeaponEvolutionConfig {
  baseWeapon: string;           // Original weapon type (e.g., 'knife')
  evolvedType: string;          // Evolved weapon type (e.g., 'thousand_cuts')
  name: string;                 // Display name
  description: string;          // Description of enhanced effects
  // Stat multipliers (applied on top of max level stats)
  damageMultiplier: number;     // Damage boost (1.0 = no change)
  cooldownMultiplier: number;   // Cooldown reduction (0.5 = 50% faster)
  rangeMultiplier: number;      // Range increase
  // Special effect flags
  projectileMultiplier: number; // More projectiles (1.0 = no change, 3.0 = 3x)
  pierceAll: boolean;           // Pierces all enemies
  homing: boolean;              // Projectiles seek enemies
  leaveTrail: boolean;          // Leaves damaging trail
  bounces: boolean;             // Bounces to nearby enemies
  executeDamage: number;        // Instant kill below this HP % (0 = disabled)
  heals: boolean;               // Heals player on damage
  expandsOutward: boolean;      // Orbitals expand radius over time
  splitsOnReturn: boolean;      // Splits into multiple on return path
}

export const WEAPON_EVOLUTIONS: Record<string, WeaponEvolutionConfig> = {
  // Knife -> Thousand Cuts: 3x projectiles, faster attack
  knife: {
    baseWeapon: 'knife',
    evolvedType: 'thousand_cuts',
    name: 'Thousand Cuts',
    description: '3x projectiles, 50% faster',
    damageMultiplier: 1.2,
    cooldownMultiplier: 0.5,
    rangeMultiplier: 1.2,
    projectileMultiplier: 3.0,
    pierceAll: false,
    homing: false,
    leaveTrail: false,
    bounces: false,
    executeDamage: 0,
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Wand -> Arcane Barrage: Homing projectiles that pierce all
  wand: {
    baseWeapon: 'wand',
    evolvedType: 'arcane_barrage',
    name: 'Arcane Barrage',
    description: 'Homing, pierces all enemies',
    damageMultiplier: 1.3,
    cooldownMultiplier: 0.7,
    rangeMultiplier: 1.5,
    projectileMultiplier: 2.0,
    pierceAll: true,
    homing: true,
    leaveTrail: false,
    bounces: false,
    executeDamage: 0,
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Fireball -> Inferno: Leaves fire trail
  fireball: {
    baseWeapon: 'fireball',
    evolvedType: 'inferno',
    name: 'Inferno',
    description: 'Leaves damaging fire trail',
    damageMultiplier: 1.5,
    cooldownMultiplier: 0.8,
    rangeMultiplier: 1.3,
    projectileMultiplier: 1.0,
    pierceAll: false,
    homing: false,
    leaveTrail: true,
    bounces: false,
    executeDamage: 0,
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Garlic -> Holy Aura: 2x radius, heals player
  garlic: {
    baseWeapon: 'garlic',
    evolvedType: 'holy_aura',
    name: 'Holy Aura',
    description: '2x radius, heals on damage',
    damageMultiplier: 1.4,
    cooldownMultiplier: 0.8,
    rangeMultiplier: 2.0,
    projectileMultiplier: 1.0,
    pierceAll: false,
    homing: false,
    leaveTrail: false,
    bounces: false,
    executeDamage: 0,
    heals: true,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Whip -> Chain Whip: Bounces to nearby enemies
  whip: {
    baseWeapon: 'whip',
    evolvedType: 'chain_whip',
    name: 'Chain Whip',
    description: 'Bounces to nearby enemies',
    damageMultiplier: 1.3,
    cooldownMultiplier: 0.7,
    rangeMultiplier: 1.5,
    projectileMultiplier: 1.0,
    pierceAll: false,
    homing: false,
    leaveTrail: false,
    bounces: true,
    executeDamage: 0,
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Axe -> Executioner: Instant kill enemies below 20% HP
  axe: {
    baseWeapon: 'axe',
    evolvedType: 'executioner',
    name: 'Executioner',
    description: 'Instant kill below 20% HP',
    damageMultiplier: 1.5,
    cooldownMultiplier: 0.8,
    rangeMultiplier: 1.3,
    projectileMultiplier: 1.5,
    pierceAll: true,
    homing: false,
    leaveTrail: false,
    bounces: false,
    executeDamage: 0.2, // 20% HP threshold
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },

  // Bible -> Crusade: Orbitals expand outward over time
  bible: {
    baseWeapon: 'bible',
    evolvedType: 'crusade',
    name: 'Crusade',
    description: 'Orbitals expand outward',
    damageMultiplier: 1.4,
    cooldownMultiplier: 1.0, // Bible has no cooldown
    rangeMultiplier: 1.5,
    projectileMultiplier: 1.5,
    pierceAll: false,
    homing: false,
    leaveTrail: false,
    bounces: false,
    executeDamage: 0,
    heals: false,
    expandsOutward: true,
    splitsOnReturn: false,
  },

  // Lightning -> Divine Storm: Double strikes, chain lightning
  lightning: {
    baseWeapon: 'lightning',
    evolvedType: 'divine_storm',
    name: 'Divine Storm',
    description: 'Double strikes, chains to nearby',
    damageMultiplier: 1.5,
    cooldownMultiplier: 0.6,
    rangeMultiplier: 1.5,
    projectileMultiplier: 2.0,
    pierceAll: false,
    homing: false,
    leaveTrail: false,
    bounces: true, // Chain lightning effect
    executeDamage: 0,
    heals: false,
    expandsOutward: false,
    splitsOnReturn: false,
  },
};

/**
 * Get evolution config for a weapon type
 * @returns Evolution config or null if no evolution exists
 */
export function getWeaponEvolution(weaponType: string): WeaponEvolutionConfig | null {
  return WEAPON_EVOLUTIONS[weaponType] || null;
}

/**
 * Check if a weapon can evolve (at max level)
 */
export function canWeaponEvolve(weaponType: string, level: number): boolean {
  const config = WEAPON_CONFIGS[weaponType];
  if (!config) return false;
  return level >= config.maxLevel && WEAPON_EVOLUTIONS[weaponType] !== undefined;
}

/**
 * Get the evolved weapon type for a base weapon
 */
export function getEvolvedWeaponType(baseWeapon: string): string | null {
  const evolution = WEAPON_EVOLUTIONS[baseWeapon];
  return evolution ? evolution.evolvedType : null;
}