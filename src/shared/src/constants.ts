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
  PLAYER_BASE_SPEED: 8,
  PLAYER_HITBOX_RADIUS: 0.5,
  PLAYER_INVULN_TIME: 3, // Seconds after respawn
  RESPAWN_DELAY: 3, // Seconds before respawn allowed

  // XP & Leveling
  XP_COLLECTION_RADIUS: 0.5, // Radius for XP orb collection
  XP_MAGNET_RADIUS: 3, // Radius for magnetizing XP orbs
  XP_ORB_SPEED: 8, // Speed when magnetized

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

  // Combat
  PVP_DAMAGE_MULTIPLIER: 0.15, // 15% damage to other players
  HOSTILITY_DECAY_RATE: 0.1, // Per second
  HOSTILITY_XP_PENALTY_THRESHOLD: 10,

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
} as const;

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
    projectileSpeed: 8,
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
    projectileSpeed: 10,
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

export const ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  bat: {
    type: 'bat',
    name: 'Bat',
    health: 10,
    speed: 6,          // Increased from 4 (BUG-037: 50% faster)
    damage: 5,
    xpValue: 1,
    size: 0.4,
    isBoss: false,
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    health: 25,
    speed: 3.75,       // Increased from 2.5 (BUG-037: 50% faster)
    damage: 10,
    xpValue: 3,
    size: 0.5,
    isBoss: false,
  },
  zombie: {
    type: 'zombie',
    name: 'Zombie',
    health: 50,
    speed: 2.25,       // Increased from 1.5 (BUG-037: 50% faster)
    damage: 15,
    xpValue: 5,
    size: 0.6,
    isBoss: false,
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    health: 15,
    speed: 4.5,        // Increased from 3 (BUG-037: 50% faster)
    damage: 8,
    xpValue: 4,
    size: 0.5,
    isBoss: false,
  },
  slime: {
    type: 'slime',
    name: 'Slime',
    health: 20,
    speed: 3,          // Increased from 2 (BUG-037: 50% faster)
    damage: 8,
    xpValue: 2,
    size: 0.5,
    isBoss: false,
  },
  mini_slime: {
    type: 'mini_slime',
    name: 'Mini Slime',
    health: 8,
    speed: 3.75,       // Increased from 2.5 (BUG-037: 50% faster)
    damage: 4,
    xpValue: 1,
    size: 0.3,
    isBoss: false,
  },
  demon: {
    type: 'demon',
    name: 'Demon',
    health: 40,
    speed: 3.75,       // Increased from 2.5 (BUG-037: 50% faster)
    damage: 20,
    xpValue: 8,
    size: 0.7,
    isBoss: false,
  },
  boss_slime: {
    type: 'boss_slime',
    name: 'Giant Slime',
    health: 500,
    speed: 1.5,        // Increased from 1 (BUG-037: 50% faster)
    damage: 30,
    xpValue: 100,
    size: 3,
    isBoss: true,
  },
  boss_skeleton: {
    type: 'boss_skeleton',
    name: 'Skeleton King',
    health: 800,
    speed: 2.25,       // Increased from 1.5 (BUG-037: 50% faster)
    damage: 40,
    xpValue: 150,
    size: 2.5,
    isBoss: true,
  },
  boss_demon: {
    type: 'boss_demon',
    name: 'Demon Lord',
    health: 1200,
    speed: 3,          // Increased from 2 (BUG-037: 50% faster)
    damage: 50,
    xpValue: 250,
    size: 3,
    isBoss: true,
  },
};

// =============================================================================
// XP ORBS
// =============================================================================

export const XP_ORB_VALUES = {
  small: 1,
  medium: 5,
  large: 25,
} as const;

// =============================================================================
// WAVE SCHEDULE
// =============================================================================

export interface WaveConfig {
  time: number; // When this wave starts (seconds)
  enemies: { [type: string]: number };
  bossType?: string;
}

export const WAVE_SCHEDULE: WaveConfig[] = [
  { time: 0, enemies: { bat: 20 } },
  { time: 30, enemies: { bat: 30, skeleton: 5 } },
  { time: 60, enemies: { bat: 25, skeleton: 15 } },
  { time: 90, enemies: { skeleton: 20, zombie: 10 } },
  { time: 120, enemies: { zombie: 20, ghost: 15 }, bossType: 'boss_slime' },
  { time: 180, enemies: { ghost: 30, slime: 20 } },
  { time: 240, enemies: { slime: 30, demon: 10 }, bossType: 'boss_skeleton' },
  { time: 300, enemies: { demon: 25, zombie: 30 } },
  { time: 360, enemies: { demon: 40, ghost: 30 }, bossType: 'boss_demon' },
  // After 360s, repeat last wave with increasing difficulty multiplier
];

// =============================================================================
// XP CURVE
// =============================================================================

export function getXPForLevel(level: number): number {
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