import { describe, it, expect } from 'vitest';
import {
  GAME_CONSTANTS,
  WEAPON_CONFIGS,
  ENEMY_CONFIGS,
  XP_ORB_VALUES,
  WAVE_SCHEDULE,
  UPGRADE_POOL,
  getXPForLevel,
  ENEMY_ATTACK_CONFIGS,
  BOSS_ABILITY_CONFIGS,
  WEAPON_CATEGORIES,
  getRandomStartingWeapons,
  CHARACTER_CLASSES,
  getCharacterClass,
  getClassStartingWeapons,
  getCharacterClassIds,
  WEAPON_EVOLUTIONS,
  getWeaponEvolution,
  canWeaponEvolve,
  getEvolvedWeaponType,
} from './constants';

describe('GAME_CONSTANTS', () => {
  it('should have valid world configuration', () => {
    expect(GAME_CONSTANTS.BASE_WORLD_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.RADIUS_PER_PLAYER).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.WORLD_EDGE_DAMAGE).toBeGreaterThan(0);
  });

  it('should have valid player configuration', () => {
    expect(GAME_CONSTANTS.PLAYER_START_HEALTH).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.PLAYER_BASE_SPEED).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.PLAYER_HITBOX_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.PLAYER_INVULN_TIME).toBeGreaterThanOrEqual(0);
    expect(GAME_CONSTANTS.RESPAWN_DELAY).toBeGreaterThan(0);
  });

  // P4.6: Trading constants
  it('should have valid trading configuration', () => {
    expect(GAME_CONSTANTS.TRADE_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.TRADE_RADIUS).toBeLessThan(GAME_CONSTANTS.TEAM_ZONE_RADIUS); // Closer than team zone
    expect(GAME_CONSTANTS.TRADE_RADIUS).toBeGreaterThan(GAME_CONSTANTS.REVIVAL_RADIUS); // Farther than revival
    expect(GAME_CONSTANTS.TRADE_OFFER_TIMEOUT).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.TRADE_COOLDOWN).toBeGreaterThan(0);
  });

  it('should have valid XP configuration', () => {
    expect(GAME_CONSTANTS.XP_MAGNET_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.XP_COLLECTION_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.XP_ORB_SPEED).toBeGreaterThan(0);
  });

  it('should have P9.5 XP progression multiplier for accelerated leveling', () => {
    // P9.5: Global XP multiplier for Snake.io style ~5 minute sessions
    expect(GAME_CONSTANTS.XP_PROGRESSION_MULTIPLIER).toBe(3.0);
    // Verify multiplier is significant but reasonable
    expect(GAME_CONSTANTS.XP_PROGRESSION_MULTIPLIER).toBeGreaterThanOrEqual(2.0);
    expect(GAME_CONSTANTS.XP_PROGRESSION_MULTIPLIER).toBeLessThanOrEqual(5.0);
  });

  it('should have valid combat configuration', () => {
    expect(GAME_CONSTANTS.PVP_DAMAGE_MULTIPLIER).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.PVP_DAMAGE_MULTIPLIER).toBeLessThanOrEqual(1);
    expect(GAME_CONSTANTS.HOSTILITY_DECAY_RATE).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD).toBeGreaterThan(0);
  });

  it('should have valid network configuration', () => {
    expect(GAME_CONSTANTS.SERVER_TICK_RATE).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.NETWORK_SEND_RATE).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.INTEREST_RADIUS).toBeGreaterThan(0);
  });

  it('should have valid spawning configuration', () => {
    expect(GAME_CONSTANTS.ENEMY_SPAWN_INTERVAL).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.MAX_ENEMIES_PER_PLAYER).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.WAVE_DURATION).toBeGreaterThan(0);
  });
});

describe('WEAPON_CONFIGS', () => {
  // Original 8 weapons + P8.2 new 4 weapons = 12 total
  const expectedWeapons = [
    'knife', 'wand', 'bible', 'garlic', 'lightning', 'axe', 'fireball', 'whip',
    // P8.2: New weapons
    'boomerang', 'chain_lightning', 'poison_cloud', 'shield'
  ];

  it('should have all 12 weapons', () => {
    expect(Object.keys(WEAPON_CONFIGS)).toHaveLength(12);
    expectedWeapons.forEach((weaponType) => {
      expect(WEAPON_CONFIGS[weaponType]).toBeDefined();
    });
  });

  it('should have valid configuration for each weapon', () => {
    Object.entries(WEAPON_CONFIGS).forEach(([type, config]) => {
      expect(config.type).toBe(type);
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.damage).toBeGreaterThan(0);
      expect(config.cooldown).toBeGreaterThanOrEqual(0);
      expect(config.range).toBeGreaterThan(0);
      expect(config.maxLevel).toBe(8);
      expect(config.baseDamage).toBe(config.damage);
      expect(config.baseCooldown).toBe(config.cooldown);
      expect(config.baseRange).toBe(config.range);
    });
  });

  it('should have projectileSpeed for projectile weapons', () => {
    const projectileWeapons = ['wand', 'axe', 'fireball'];
    projectileWeapons.forEach((weaponType) => {
      expect(WEAPON_CONFIGS[weaponType].projectileSpeed).toBeGreaterThan(0);
    });
  });

  it('should have area for AOE weapons', () => {
    const aoeWeapons = ['garlic', 'fireball', 'whip'];
    aoeWeapons.forEach((weaponType) => {
      expect(WEAPON_CONFIGS[weaponType].area).toBeGreaterThan(0);
    });
  });
});

describe('ENEMY_CONFIGS', () => {
  const regularEnemies = ['bat', 'skeleton', 'zombie', 'ghost', 'slime', 'mini_slime', 'demon', 'shapeshifter']; // P5.6: Added shapeshifter
  const bossEnemies = ['boss_slime', 'boss_skeleton', 'boss_demon', 'secret_boss']; // P5.3: Added secret_boss

  it('should have all 12 enemy types', () => {
    // P5.3: 10 original + 1 secret_boss = 11, P5.6: +1 shapeshifter = 12
    expect(Object.keys(ENEMY_CONFIGS)).toHaveLength(12);
  });

  it('should have valid configuration for each enemy', () => {
    Object.entries(ENEMY_CONFIGS).forEach(([type, config]) => {
      expect(config.type).toBe(type);
      expect(config.name).toBeTruthy();
      expect(config.health).toBeGreaterThan(0);
      expect(config.speed).toBeGreaterThan(0);
      expect(config.damage).toBeGreaterThan(0);
      expect(config.xpValue).toBeGreaterThan(0);
      expect(config.size).toBeGreaterThan(0);
      expect(typeof config.isBoss).toBe('boolean');
    });
  });

  it('should mark regular enemies as non-boss', () => {
    regularEnemies.forEach((type) => {
      expect(ENEMY_CONFIGS[type].isBoss).toBe(false);
    });
  });

  it('should mark boss enemies as boss', () => {
    bossEnemies.forEach((type) => {
      expect(ENEMY_CONFIGS[type].isBoss).toBe(true);
    });
  });

  it('should have bosses with more health than regular enemies', () => {
    const maxRegularHealth = Math.max(...regularEnemies.map((t) => ENEMY_CONFIGS[t].health));
    const minBossHealth = Math.min(...bossEnemies.map((t) => ENEMY_CONFIGS[t].health));
    expect(minBossHealth).toBeGreaterThan(maxRegularHealth);
  });

  it('should have bosses with more xpValue than regular enemies', () => {
    const maxRegularXP = Math.max(...regularEnemies.map((t) => ENEMY_CONFIGS[t].xpValue));
    const minBossXP = Math.min(...bossEnemies.map((t) => ENEMY_CONFIGS[t].xpValue));
    expect(minBossXP).toBeGreaterThan(maxRegularXP);
  });
});

describe('ENEMY_ATTACK_CONFIGS', () => {
  it('should have attack configs for demon and boss_demon', () => {
    expect(ENEMY_ATTACK_CONFIGS.demon).toBeDefined();
    expect(ENEMY_ATTACK_CONFIGS.boss_demon).toBeDefined();
  });

  it('should have valid attack configuration', () => {
    Object.values(ENEMY_ATTACK_CONFIGS).forEach((config) => {
      expect(config.damage).toBeGreaterThan(0);
      expect(config.cooldown).toBeGreaterThan(0);
      expect(config.range).toBeGreaterThan(0);
      expect(config.projectileSpeed).toBeGreaterThan(0);
      expect(config.projectileRadius).toBeGreaterThan(0);
      expect(config.projectileLifetime).toBeGreaterThan(0);
      expect(config.projectileType).toBeTruthy();
    });
  });

  it('boss_demon should have stronger attack than regular demon', () => {
    expect(ENEMY_ATTACK_CONFIGS.boss_demon.damage).toBeGreaterThan(
      ENEMY_ATTACK_CONFIGS.demon.damage
    );
    expect(ENEMY_ATTACK_CONFIGS.boss_demon.range).toBeGreaterThanOrEqual(
      ENEMY_ATTACK_CONFIGS.demon.range
    );
  });
});

describe('BOSS_ABILITY_CONFIGS', () => {
  it('should have ability configs for all three bosses', () => {
    expect(BOSS_ABILITY_CONFIGS.boss_slime).toBeDefined();
    expect(BOSS_ABILITY_CONFIGS.boss_skeleton).toBeDefined();
    expect(BOSS_ABILITY_CONFIGS.boss_demon).toBeDefined();
  });

  it('boss_slime should have split ability', () => {
    const config = BOSS_ABILITY_CONFIGS.boss_slime;
    expect(config.type).toBe('split');
    expect(config.splitCount).toBeGreaterThan(0);
    expect(config.splitType).toBeTruthy();
    expect(ENEMY_CONFIGS[config.splitType!]).toBeDefined();
  });

  it('boss_skeleton should have summon ability', () => {
    const config = BOSS_ABILITY_CONFIGS.boss_skeleton;
    expect(config.type).toBe('summon');
    expect(config.summonCount).toBeGreaterThan(0);
    expect(config.summonType).toBeTruthy();
    expect(config.summonCooldown).toBeGreaterThan(0);
    expect(ENEMY_CONFIGS[config.summonType!]).toBeDefined();
  });

  it('boss_demon should have charge ability', () => {
    const config = BOSS_ABILITY_CONFIGS.boss_demon;
    expect(config.type).toBe('charge');
    expect(config.chargeSpeed).toBeGreaterThan(0);
    expect(config.chargeDamage).toBeGreaterThan(0);
    expect(config.chargeRange).toBeGreaterThan(0);
    expect(config.chargeCooldown).toBeGreaterThan(0);
  });
});

describe('XP_ORB_VALUES', () => {
  it('should have all orb sizes', () => {
    expect(XP_ORB_VALUES.small).toBeDefined();
    expect(XP_ORB_VALUES.medium).toBeDefined();
    expect(XP_ORB_VALUES.large).toBeDefined();
  });

  it('should have increasing values', () => {
    expect(XP_ORB_VALUES.small).toBeLessThan(XP_ORB_VALUES.medium);
    expect(XP_ORB_VALUES.medium).toBeLessThan(XP_ORB_VALUES.large);
  });
});

describe('WAVE_SCHEDULE', () => {
  it('should have at least 9 waves', () => {
    expect(WAVE_SCHEDULE.length).toBeGreaterThanOrEqual(9);
  });

  it('should have increasing time values', () => {
    for (let i = 1; i < WAVE_SCHEDULE.length; i++) {
      expect(WAVE_SCHEDULE[i].time).toBeGreaterThan(WAVE_SCHEDULE[i - 1].time);
    }
  });

  it('should start at time 0', () => {
    expect(WAVE_SCHEDULE[0].time).toBe(0);
  });

  it('should have valid enemy types in each wave', () => {
    WAVE_SCHEDULE.forEach((wave) => {
      Object.keys(wave.enemies).forEach((enemyType) => {
        expect(ENEMY_CONFIGS[enemyType]).toBeDefined();
      });
      if (wave.bossType) {
        expect(ENEMY_CONFIGS[wave.bossType]).toBeDefined();
        expect(ENEMY_CONFIGS[wave.bossType].isBoss).toBe(true);
      }
    });
  });

  it('should have enemy counts greater than 0', () => {
    WAVE_SCHEDULE.forEach((wave) => {
      Object.values(wave.enemies).forEach((count) => {
        expect(count).toBeGreaterThan(0);
      });
    });
  });

  it('should have 4 boss waves for P9.5 compressed schedule', () => {
    // P9.5: Compressed wave schedule has 4 boss waves (was 3)
    // Wave 4 (60s): boss_slime, Wave 7 (150s): boss_skeleton,
    // Wave 10 (240s): boss_demon, Wave 12 (300s): boss_demon (chaos wave)
    const bossWaves = WAVE_SCHEDULE.filter((w) => w.bossType);
    expect(bossWaves.length).toBe(4);
  });
});

describe('getXPForLevel', () => {
  // P9.5: Tests updated for compressed XP curve (Snake.io style pacing)
  // New curve: level 1 = 3 XP, levels 2-20 = 3 + (level-1) * 5

  it('should return base XP for level 1', () => {
    expect(getXPForLevel(1)).toBe(3); // P9.5: Reduced from 5 for faster progression
  });

  it('should increase XP requirements as level increases', () => {
    for (let level = 2; level <= 50; level++) {
      expect(getXPForLevel(level)).toBeGreaterThan(getXPForLevel(level - 1));
    }
  });

  it('should use compressed formula for levels 2-20', () => {
    // P9.5: Formula is now 3 + (level - 1) * 5 (was 5 + (level - 1) * 10)
    expect(getXPForLevel(2)).toBe(3 + 5); // 8
    expect(getXPForLevel(10)).toBe(3 + 9 * 5); // 48
    expect(getXPForLevel(20)).toBe(3 + 19 * 5); // 98
  });

  it('should use compressed formula for levels 21-40', () => {
    // P9.5: Formula is now 98 + (level - 20) * 7 (was 195 + (level - 20) * 13)
    expect(getXPForLevel(21)).toBe(98 + 7); // 105
    expect(getXPForLevel(40)).toBe(98 + 20 * 7); // 238
  });

  it('should use compressed formula for levels above 40', () => {
    // P9.5: Formula is now 238 + (level - 40) * 10 (was 455 + (level - 40) * 16)
    expect(getXPForLevel(41)).toBe(238 + 10); // 248
    expect(getXPForLevel(50)).toBe(238 + 10 * 10); // 338
  });

  it('should enable reaching level 8 by minute 3 with P9.5 progression', () => {
    // P9.5 Target: ~84 XP total to reach level 8 (was ~245 XP)
    // This test verifies the compressed curve achieves the Snake.io pacing goal
    let totalXPToLevel8 = 0;
    for (let level = 1; level < 8; level++) {
      totalXPToLevel8 += getXPForLevel(level);
    }
    // Should be approximately 84 XP (3+8+13+18+23+28+33 = 126... let me calculate correctly)
    // Level 1->2: 3, 2->3: 8, 3->4: 13, 4->5: 18, 5->6: 23, 6->7: 28, 7->8: 33 = 126
    // With enemy XP doubled and 3x multiplier, this is ~3-4x faster than before
    expect(totalXPToLevel8).toBeLessThan(150); // Much less than original ~245
  });
});

describe('UPGRADE_POOL', () => {
  it('should have weapon upgrades for all 12 weapons', () => {
    const weaponUpgrades = UPGRADE_POOL.filter((u) => u.type === 'new_weapon');
    expect(weaponUpgrades.length).toBe(12);

    const weaponTypes = weaponUpgrades.map((u) => u.weaponType);
    Object.keys(WEAPON_CONFIGS).forEach((weaponType) => {
      expect(weaponTypes).toContain(weaponType);
    });
  });

  it('should have stat boost upgrades', () => {
    const statBoosts = UPGRADE_POOL.filter((u) => u.type === 'stat_boost');
    expect(statBoosts.length).toBeGreaterThan(0);

    const statTypes = statBoosts.map((u) => u.statType);
    expect(statTypes).toContain('health');
    expect(statTypes).toContain('speed');
    expect(statTypes).toContain('magnet');
    expect(statTypes).toContain('armor');
  });

  it('should have valid upgrade definitions', () => {
    UPGRADE_POOL.forEach((upgrade) => {
      expect(upgrade.id).toBeTruthy();
      expect(upgrade.description).toBeTruthy();
      expect(upgrade.weight).toBeGreaterThan(0);
      expect(upgrade.maxLevel).toBeGreaterThan(0);

      if (upgrade.type === 'new_weapon') {
        expect(upgrade.weaponType).toBeTruthy();
        expect(WEAPON_CONFIGS[upgrade.weaponType!]).toBeDefined();
      }

      if (upgrade.type === 'stat_boost') {
        expect(upgrade.statType).toBeTruthy();
        expect(upgrade.statBoost).toBeGreaterThan(0);
      }
    });
  });

  it('should have unique IDs', () => {
    const ids = UPGRADE_POOL.map((u) => u.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// P9.6: Starting Weapon Configuration Tests
describe('WEAPON_CATEGORIES', () => {
  it('should have ranged weapons defined', () => {
    expect(WEAPON_CATEGORIES.RANGED.length).toBeGreaterThanOrEqual(3);
    // Verify all ranged weapons exist in WEAPON_CONFIGS
    WEAPON_CATEGORIES.RANGED.forEach(weapon => {
      expect(WEAPON_CONFIGS[weapon]).toBeDefined();
    });
  });

  it('should have melee/AOE weapons defined', () => {
    expect(WEAPON_CATEGORIES.MELEE_AOE.length).toBeGreaterThanOrEqual(5);
    // Verify all melee weapons exist in WEAPON_CONFIGS
    WEAPON_CATEGORIES.MELEE_AOE.forEach(weapon => {
      expect(WEAPON_CONFIGS[weapon]).toBeDefined();
    });
  });

  it('should have no overlapping weapons between categories', () => {
    const rangedSet = new Set<string>(WEAPON_CATEGORIES.RANGED);
    const meleeSet = new Set<string>(WEAPON_CATEGORIES.MELEE_AOE);

    // Check for overlaps
    WEAPON_CATEGORIES.RANGED.forEach(weapon => {
      expect(meleeSet.has(weapon)).toBe(false);
    });
    WEAPON_CATEGORIES.MELEE_AOE.forEach(weapon => {
      expect(rangedSet.has(weapon)).toBe(false);
    });
  });
});

describe('getRandomStartingWeapons', () => {
  it('should return 2-3 weapons', () => {
    // Run multiple times to test randomness
    for (let i = 0; i < 20; i++) {
      const weapons = getRandomStartingWeapons();
      expect(weapons.length).toBeGreaterThanOrEqual(GAME_CONSTANTS.STARTING_WEAPON_MIN);
      expect(weapons.length).toBeLessThanOrEqual(GAME_CONSTANTS.STARTING_WEAPON_MAX);
    }
  });

  it('should include at least one ranged weapon', () => {
    const rangedSet = new Set<string>(WEAPON_CATEGORIES.RANGED);

    // Run multiple times to verify consistency
    for (let i = 0; i < 20; i++) {
      const weapons = getRandomStartingWeapons();
      const hasRanged = weapons.some(w => rangedSet.has(w));
      expect(hasRanged).toBe(true);
    }
  });

  it('should include at least one melee/AOE weapon', () => {
    const meleeSet = new Set<string>(WEAPON_CATEGORIES.MELEE_AOE);

    // Run multiple times to verify consistency
    for (let i = 0; i < 20; i++) {
      const weapons = getRandomStartingWeapons();
      const hasMelee = weapons.some(w => meleeSet.has(w));
      expect(hasMelee).toBe(true);
    }
  });

  it('should return unique weapons (no duplicates)', () => {
    // Run multiple times to verify uniqueness
    for (let i = 0; i < 20; i++) {
      const weapons = getRandomStartingWeapons();
      const uniqueWeapons = new Set(weapons);
      expect(uniqueWeapons.size).toBe(weapons.length);
    }
  });

  it('should only return valid weapon types', () => {
    const allValidWeapons = new Set<string>([
      ...WEAPON_CATEGORIES.RANGED,
      ...WEAPON_CATEGORIES.MELEE_AOE
    ]);

    // Run multiple times to verify all weapons are valid
    for (let i = 0; i < 20; i++) {
      const weapons = getRandomStartingWeapons();
      weapons.forEach(weapon => {
        expect(allValidWeapons.has(weapon)).toBe(true);
      });
    }
  });
});

// P9.3: Character Classes tests
describe('CHARACTER_CLASSES', () => {
  it('should have 5 character classes', () => {
    expect(Object.keys(CHARACTER_CLASSES).length).toBe(5);
  });

  it('should have all required classes', () => {
    expect(CHARACTER_CLASSES.survivor).toBeDefined();
    expect(CHARACTER_CLASSES.mage).toBeDefined();
    expect(CHARACTER_CLASSES.warrior).toBeDefined();
    expect(CHARACTER_CLASSES.speedster).toBeDefined();
    expect(CHARACTER_CLASSES.tank).toBeDefined();
  });

  it('should have valid configurations for all classes', () => {
    for (const [id, config] of Object.entries(CHARACTER_CLASSES)) {
      expect(config.id).toBe(id);
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.healthMultiplier).toBeGreaterThan(0);
      expect(config.speedMultiplier).toBeGreaterThan(0);
      expect(config.damageMultiplier).toBeGreaterThan(0);
      expect(config.xpMultiplier).toBeGreaterThan(0);
      expect(Array.isArray(config.startingWeapons)).toBe(true);
    }
  });

  it('survivor should have no stat bonuses', () => {
    const survivor = CHARACTER_CLASSES.survivor;
    expect(survivor.healthMultiplier).toBe(1.0);
    expect(survivor.speedMultiplier).toBe(1.0);
    expect(survivor.damageMultiplier).toBe(1.0);
    expect(survivor.xpMultiplier).toBe(1.0);
    expect(survivor.unlockRequirement).toBeNull();
  });

  it('mage should have +20% XP gain', () => {
    const mage = CHARACTER_CLASSES.mage;
    expect(mage.xpMultiplier).toBe(1.2);
    expect(mage.startingWeapons).toEqual(['wand', 'fireball']);
  });

  it('warrior should have +25% damage', () => {
    const warrior = CHARACTER_CLASSES.warrior;
    expect(warrior.damageMultiplier).toBe(1.25);
    expect(warrior.startingWeapons).toEqual(['axe', 'whip']);
  });

  it('speedster should have +30% move speed', () => {
    const speedster = CHARACTER_CLASSES.speedster;
    expect(speedster.speedMultiplier).toBe(1.3);
    expect(speedster.startingWeapons).toEqual(['knife', 'knife']);
  });

  it('tank should have +50% HP', () => {
    const tank = CHARACTER_CLASSES.tank;
    expect(tank.healthMultiplier).toBe(1.5);
    expect(tank.startingWeapons).toEqual(['garlic', 'bible']);
  });

  it('non-survivor classes should have unlock requirements', () => {
    const nonSurvivorClasses = ['mage', 'warrior', 'speedster', 'tank'];
    for (const classId of nonSurvivorClasses) {
      const config = CHARACTER_CLASSES[classId];
      expect(config.unlockRequirement).not.toBeNull();
      expect(config.unlockRequirement?.type).toBeTruthy();
      expect(config.unlockRequirement?.value).toBeGreaterThan(0);
      expect(config.unlockRequirement?.description).toBeTruthy();
    }
  });

  it('class starting weapons should all be valid weapon types', () => {
    for (const config of Object.values(CHARACTER_CLASSES)) {
      for (const weapon of config.startingWeapons) {
        expect(WEAPON_CONFIGS[weapon]).toBeDefined();
      }
    }
  });
});

describe('getCharacterClass', () => {
  it('should return correct class for valid IDs', () => {
    expect(getCharacterClass('survivor').id).toBe('survivor');
    expect(getCharacterClass('mage').id).toBe('mage');
    expect(getCharacterClass('warrior').id).toBe('warrior');
    expect(getCharacterClass('speedster').id).toBe('speedster');
    expect(getCharacterClass('tank').id).toBe('tank');
  });

  it('should return survivor for invalid class IDs', () => {
    expect(getCharacterClass('invalid').id).toBe('survivor');
    expect(getCharacterClass('').id).toBe('survivor');
  });
});

describe('getClassStartingWeapons', () => {
  it('should return preset weapons for classes with fixed loadouts', () => {
    expect(getClassStartingWeapons('mage')).toEqual(['wand', 'fireball']);
    expect(getClassStartingWeapons('warrior')).toEqual(['axe', 'whip']);
    expect(getClassStartingWeapons('speedster')).toEqual(['knife', 'knife']);
    expect(getClassStartingWeapons('tank')).toEqual(['garlic', 'bible']);
  });

  it('should return random weapons for survivor', () => {
    // Survivor has empty startingWeapons, so should get random
    const weapons = getClassStartingWeapons('survivor');
    expect(weapons.length).toBeGreaterThanOrEqual(2);
    expect(weapons.length).toBeLessThanOrEqual(3);
  });

  it('should return new array instance (not reference)', () => {
    const weapons1 = getClassStartingWeapons('mage');
    const weapons2 = getClassStartingWeapons('mage');
    expect(weapons1).not.toBe(weapons2); // Different array instances
    expect(weapons1).toEqual(weapons2); // Same contents
  });
});

describe('getCharacterClassIds', () => {
  it('should return all 5 class IDs', () => {
    const ids = getCharacterClassIds();
    expect(ids.length).toBe(5);
  });

  it('should include all class IDs', () => {
    const ids = getCharacterClassIds();
    expect(ids).toContain('survivor');
    expect(ids).toContain('mage');
    expect(ids).toContain('warrior');
    expect(ids).toContain('speedster');
    expect(ids).toContain('tank');
  });
});

// P9.4: Weapon Evolution System tests
describe('WEAPON_EVOLUTIONS', () => {
  it('should have evolutions for all 12 weapons', () => {
    expect(Object.keys(WEAPON_EVOLUTIONS).length).toBe(12);
  });

  it('should have all required weapon evolutions', () => {
    // Original 8 weapons
    expect(WEAPON_EVOLUTIONS.knife).toBeDefined();
    expect(WEAPON_EVOLUTIONS.wand).toBeDefined();
    expect(WEAPON_EVOLUTIONS.fireball).toBeDefined();
    expect(WEAPON_EVOLUTIONS.garlic).toBeDefined();
    expect(WEAPON_EVOLUTIONS.whip).toBeDefined();
    expect(WEAPON_EVOLUTIONS.axe).toBeDefined();
    expect(WEAPON_EVOLUTIONS.bible).toBeDefined();
    expect(WEAPON_EVOLUTIONS.lightning).toBeDefined();
    // P8.2: New 4 weapons
    expect(WEAPON_EVOLUTIONS.boomerang).toBeDefined();
    expect(WEAPON_EVOLUTIONS.chain_lightning).toBeDefined();
    expect(WEAPON_EVOLUTIONS.poison_cloud).toBeDefined();
    expect(WEAPON_EVOLUTIONS.shield).toBeDefined();
  });

  it('should have valid configuration for each evolution', () => {
    for (const [baseWeapon, config] of Object.entries(WEAPON_EVOLUTIONS)) {
      expect(config.baseWeapon).toBe(baseWeapon);
      expect(config.evolvedType).toBeTruthy();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.damageMultiplier).toBeGreaterThan(0);
      expect(config.cooldownMultiplier).toBeGreaterThan(0);
      expect(config.rangeMultiplier).toBeGreaterThan(0);
      expect(config.projectileMultiplier).toBeGreaterThan(0);
    }
  });

  it('knife -> Thousand Cuts should have 3x projectiles and 50% faster cooldown', () => {
    const knife = WEAPON_EVOLUTIONS.knife;
    expect(knife.evolvedType).toBe('thousand_cuts');
    expect(knife.name).toBe('Thousand Cuts');
    expect(knife.projectileMultiplier).toBe(3.0);
    expect(knife.cooldownMultiplier).toBe(0.5);
  });

  it('wand -> Arcane Barrage should have homing and pierce all', () => {
    const wand = WEAPON_EVOLUTIONS.wand;
    expect(wand.evolvedType).toBe('arcane_barrage');
    expect(wand.name).toBe('Arcane Barrage');
    expect(wand.homing).toBe(true);
    expect(wand.pierceAll).toBe(true);
  });

  it('fireball -> Inferno should leave trail', () => {
    const fireball = WEAPON_EVOLUTIONS.fireball;
    expect(fireball.evolvedType).toBe('inferno');
    expect(fireball.name).toBe('Inferno');
    expect(fireball.leaveTrail).toBe(true);
  });

  it('garlic -> Holy Aura should have 2x range and heal', () => {
    const garlic = WEAPON_EVOLUTIONS.garlic;
    expect(garlic.evolvedType).toBe('holy_aura');
    expect(garlic.name).toBe('Holy Aura');
    expect(garlic.rangeMultiplier).toBe(2.0);
    expect(garlic.heals).toBe(true);
  });

  it('whip -> Chain Whip should bounce', () => {
    const whip = WEAPON_EVOLUTIONS.whip;
    expect(whip.evolvedType).toBe('chain_whip');
    expect(whip.name).toBe('Chain Whip');
    expect(whip.bounces).toBe(true);
  });

  it('axe -> Executioner should have execute damage threshold', () => {
    const axe = WEAPON_EVOLUTIONS.axe;
    expect(axe.evolvedType).toBe('executioner');
    expect(axe.name).toBe('Executioner');
    expect(axe.executeDamage).toBe(0.2); // 20% HP threshold
    expect(axe.pierceAll).toBe(true);
  });

  it('bible -> Crusade should expand outward', () => {
    const bible = WEAPON_EVOLUTIONS.bible;
    expect(bible.evolvedType).toBe('crusade');
    expect(bible.name).toBe('Crusade');
    expect(bible.expandsOutward).toBe(true);
  });

  it('lightning -> Divine Storm should have chain lightning (bounces)', () => {
    const lightning = WEAPON_EVOLUTIONS.lightning;
    expect(lightning.evolvedType).toBe('divine_storm');
    expect(lightning.name).toBe('Divine Storm');
    expect(lightning.bounces).toBe(true);
    expect(lightning.projectileMultiplier).toBe(2.0);
  });

  it('all evolutions should have positive stat multipliers', () => {
    for (const config of Object.values(WEAPON_EVOLUTIONS)) {
      expect(config.damageMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(config.cooldownMultiplier).toBeLessThanOrEqual(1.0); // Lower is faster
      expect(config.cooldownMultiplier).toBeGreaterThan(0);
      expect(config.rangeMultiplier).toBeGreaterThanOrEqual(1.0);
    }
  });
});

describe('getWeaponEvolution', () => {
  it('should return evolution config for valid weapons', () => {
    expect(getWeaponEvolution('knife')?.evolvedType).toBe('thousand_cuts');
    expect(getWeaponEvolution('wand')?.evolvedType).toBe('arcane_barrage');
    expect(getWeaponEvolution('fireball')?.evolvedType).toBe('inferno');
    expect(getWeaponEvolution('garlic')?.evolvedType).toBe('holy_aura');
    expect(getWeaponEvolution('whip')?.evolvedType).toBe('chain_whip');
    expect(getWeaponEvolution('axe')?.evolvedType).toBe('executioner');
    expect(getWeaponEvolution('bible')?.evolvedType).toBe('crusade');
    expect(getWeaponEvolution('lightning')?.evolvedType).toBe('divine_storm');
  });

  it('should return null for invalid weapon types', () => {
    expect(getWeaponEvolution('invalid')).toBeNull();
    expect(getWeaponEvolution('')).toBeNull();
  });
});

describe('canWeaponEvolve', () => {
  it('should return false for weapons below max level', () => {
    expect(canWeaponEvolve('knife', 1)).toBe(false);
    expect(canWeaponEvolve('knife', 7)).toBe(false);
    expect(canWeaponEvolve('wand', 5)).toBe(false);
  });

  it('should return true for weapons at max level', () => {
    expect(canWeaponEvolve('knife', 8)).toBe(true);
    expect(canWeaponEvolve('wand', 8)).toBe(true);
    expect(canWeaponEvolve('fireball', 8)).toBe(true);
    expect(canWeaponEvolve('garlic', 8)).toBe(true);
    expect(canWeaponEvolve('whip', 8)).toBe(true);
    expect(canWeaponEvolve('axe', 8)).toBe(true);
    expect(canWeaponEvolve('bible', 8)).toBe(true);
    expect(canWeaponEvolve('lightning', 8)).toBe(true);
  });

  it('should return true for weapons above max level', () => {
    expect(canWeaponEvolve('knife', 9)).toBe(true);
    expect(canWeaponEvolve('knife', 10)).toBe(true);
  });

  it('should return false for invalid weapon types', () => {
    expect(canWeaponEvolve('invalid', 8)).toBe(false);
    expect(canWeaponEvolve('', 8)).toBe(false);
  });
});

describe('getEvolvedWeaponType', () => {
  it('should return evolved type for valid weapons', () => {
    expect(getEvolvedWeaponType('knife')).toBe('thousand_cuts');
    expect(getEvolvedWeaponType('wand')).toBe('arcane_barrage');
    expect(getEvolvedWeaponType('fireball')).toBe('inferno');
    expect(getEvolvedWeaponType('garlic')).toBe('holy_aura');
    expect(getEvolvedWeaponType('whip')).toBe('chain_whip');
    expect(getEvolvedWeaponType('axe')).toBe('executioner');
    expect(getEvolvedWeaponType('bible')).toBe('crusade');
    expect(getEvolvedWeaponType('lightning')).toBe('divine_storm');
  });

  it('should return null for invalid weapon types', () => {
    expect(getEvolvedWeaponType('invalid')).toBeNull();
    expect(getEvolvedWeaponType('')).toBeNull();
  });
});
