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

  it('should have valid XP configuration', () => {
    expect(GAME_CONSTANTS.XP_MAGNET_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.XP_COLLECTION_RADIUS).toBeGreaterThan(0);
    expect(GAME_CONSTANTS.XP_ORB_SPEED).toBeGreaterThan(0);
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
  const expectedWeapons = ['knife', 'wand', 'bible', 'garlic', 'lightning', 'axe', 'fireball', 'whip'];

  it('should have all 8 weapons', () => {
    expect(Object.keys(WEAPON_CONFIGS)).toHaveLength(8);
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
  const regularEnemies = ['bat', 'skeleton', 'zombie', 'ghost', 'slime', 'demon'];
  const bossEnemies = ['boss_slime', 'boss_skeleton', 'boss_demon'];

  it('should have all 9 enemy types', () => {
    expect(Object.keys(ENEMY_CONFIGS)).toHaveLength(9);
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

  it('should have 3 boss waves', () => {
    const bossWaves = WAVE_SCHEDULE.filter((w) => w.bossType);
    expect(bossWaves.length).toBe(3);
  });
});

describe('getXPForLevel', () => {
  it('should return base XP for level 1', () => {
    expect(getXPForLevel(1)).toBe(5);
  });

  it('should increase XP requirements as level increases', () => {
    for (let level = 2; level <= 50; level++) {
      expect(getXPForLevel(level)).toBeGreaterThan(getXPForLevel(level - 1));
    }
  });

  it('should use formula for levels 2-20', () => {
    expect(getXPForLevel(2)).toBe(5 + 10); // 15
    expect(getXPForLevel(10)).toBe(5 + 9 * 10); // 95
    expect(getXPForLevel(20)).toBe(5 + 19 * 10); // 195
  });

  it('should use different formula for levels 21-40', () => {
    expect(getXPForLevel(21)).toBe(195 + 13); // 208
    expect(getXPForLevel(40)).toBe(195 + 20 * 13); // 455
  });

  it('should use final formula for levels above 40', () => {
    expect(getXPForLevel(41)).toBe(455 + 16); // 471
    expect(getXPForLevel(50)).toBe(455 + 10 * 16); // 615
  });
});

describe('UPGRADE_POOL', () => {
  it('should have weapon upgrades for all 8 weapons', () => {
    const weaponUpgrades = UPGRADE_POOL.filter((u) => u.type === 'new_weapon');
    expect(weaponUpgrades.length).toBe(8);

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
