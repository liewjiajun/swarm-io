import type { WeaponConfig, EnemyConfig, UpgradeDefinition } from './types';

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
  PLAYER_BASE_SPEED: 5,
  PLAYER_HITBOX_RADIUS: 0.5,
  PLAYER_INVULN_TIME: 3, // Seconds after respawn
  RESPAWN_DELAY: 3, // Seconds before respawn allowed

  // XP & Leveling
  XP_MAGNET_RADIUS: 3,
  XP_PICKUP_RADIUS: 0.5,
  XP_ORB_SPEED: 8, // When magnetized

  // Combat
  PVP_DAMAGE_MULTIPLIER: 0.15, // 15% damage to other players
  HOSTILITY_DECAY_RATE: 0.1, // Per second
  HOSTILITY_XP_PENALTY_THRESHOLD: 10,

  // Network
  SERVER_TICK_RATE: 60, // Hz
  NETWORK_SEND_RATE: 20, // Hz
  INTEREST_RADIUS: 50, // Only sync entities within this radius

  // Spawning
  ENEMY_SPAWN_DISTANCE: 30, // Outside visible area
  MAX_ENEMIES_PER_PLAYER: 50,
  WAVE_DURATION: 60, // Seconds per wave
} as const;

// =============================================================================
// WEAPON CONFIGURATIONS
// =============================================================================

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  knife: {
    type: 'knife',
    name: 'Knife',
    description: 'Quick slashing attack in facing direction',
    baseDamage: 10,
    baseCooldown: 0.5,
    baseRange: 2,
    maxLevel: 8,
  },
  wand: {
    type: 'wand',
    name: 'Magic Wand',
    description: 'Fires a magic projectile',
    baseDamage: 15,
    baseCooldown: 1.0,
    baseRange: 15,
    maxLevel: 8,
    projectileSpeed: 12,
    projectileCount: 1,
  },
  bible: {
    type: 'bible',
    name: 'King Bible',
    description: 'Orbits around you, damaging enemies',
    baseDamage: 8,
    baseCooldown: 0, // Continuous
    baseRange: 3,
    maxLevel: 8,
  },
  garlic: {
    type: 'garlic',
    name: 'Garlic',
    description: 'Damages nearby enemies continuously',
    baseDamage: 5,
    baseCooldown: 0.5,
    baseRange: 2.5,
    maxLevel: 8,
    area: 2.5,
  },
  lightning: {
    type: 'lightning',
    name: 'Lightning Ring',
    description: 'Strikes random nearby enemies',
    baseDamage: 25,
    baseCooldown: 2.0,
    baseRange: 10,
    maxLevel: 8,
  },
  axe: {
    type: 'axe',
    name: 'Axe',
    description: 'Thrown axe that passes through enemies',
    baseDamage: 20,
    baseCooldown: 1.5,
    baseRange: 12,
    maxLevel: 8,
    projectileSpeed: 8,
  },
  fireball: {
    type: 'fireball',
    name: 'Fireball',
    description: 'Explodes on impact',
    baseDamage: 30,
    baseCooldown: 3.0,
    baseRange: 20,
    maxLevel: 8,
    projectileSpeed: 10,
    area: 3,
  },
  whip: {
    type: 'whip',
    name: 'Whip',
    description: 'Wide horizontal attack',
    baseDamage: 12,
    baseCooldown: 1.0,
    baseRange: 4,
    maxLevel: 8,
    area: 4,
  },
};

// =============================================================================
// ENEMY CONFIGURATIONS
// =============================================================================

export const ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  bat: {
    type: 'bat',
    name: 'Bat',
    health: 10,
    speed: 4,
    damage: 5,
    xpValue: 1,
    size: 0.4,
    isBoss: false,
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    health: 25,
    speed: 2.5,
    damage: 10,
    xpValue: 3,
    size: 0.5,
    isBoss: false,
  },
  zombie: {
    type: 'zombie',
    name: 'Zombie',
    health: 50,
    speed: 1.5,
    damage: 15,
    xpValue: 5,
    size: 0.6,
    isBoss: false,
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    health: 15,
    speed: 3,
    damage: 8,
    xpValue: 4,
    size: 0.5,
    isBoss: false,
  },
  slime: {
    type: 'slime',
    name: 'Slime',
    health: 20,
    speed: 2,
    damage: 8,
    xpValue: 2,
    size: 0.5,
    isBoss: false,
  },
  demon: {
    type: 'demon',
    name: 'Demon',
    health: 40,
    speed: 2.5,
    damage: 20,
    xpValue: 8,
    size: 0.7,
    isBoss: false,
  },
  boss_slime: {
    type: 'boss_slime',
    name: 'Giant Slime',
    health: 500,
    speed: 1,
    damage: 30,
    xpValue: 100,
    size: 3,
    isBoss: true,
  },
  boss_skeleton: {
    type: 'boss_skeleton',
    name: 'Skeleton King',
    health: 800,
    speed: 1.5,
    damage: 40,
    xpValue: 150,
    size: 2.5,
    isBoss: true,
  },
  boss_demon: {
    type: 'boss_demon',
    name: 'Demon Lord',
    health: 1200,
    speed: 2,
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
  enemies: { type: string; count: number }[];
  boss?: string;
}

export const WAVE_SCHEDULE: WaveConfig[] = [
  { time: 0, enemies: [{ type: 'bat', count: 20 }] },
  { time: 30, enemies: [{ type: 'bat', count: 30 }, { type: 'skeleton', count: 5 }] },
  { time: 60, enemies: [{ type: 'bat', count: 25 }, { type: 'skeleton', count: 15 }] },
  { time: 90, enemies: [{ type: 'skeleton', count: 20 }, { type: 'zombie', count: 10 }] },
  { time: 120, enemies: [{ type: 'zombie', count: 20 }, { type: 'ghost', count: 15 }], boss: 'boss_slime' },
  { time: 180, enemies: [{ type: 'ghost', count: 30 }, { type: 'slime', count: 20 }] },
  { time: 240, enemies: [{ type: 'slime', count: 30 }, { type: 'demon', count: 10 }], boss: 'boss_skeleton' },
  { time: 300, enemies: [{ type: 'demon', count: 25 }, { type: 'zombie', count: 30 }] },
  { time: 360, enemies: [{ type: 'demon', count: 40 }, { type: 'ghost', count: 30 }], boss: 'boss_demon' },
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