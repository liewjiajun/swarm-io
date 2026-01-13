import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerSchema } from './PlayerSchema';
import { GAME_CONSTANTS, getXPForLevel } from '@swarm-io/shared';

describe('PlayerSchema', () => {
  let player: PlayerSchema;

  beforeEach(() => {
    player = new PlayerSchema();
    player.id = 'test-player';
  });

  describe('initial state', () => {
    it('should have correct default values', () => {
      expect(player.health).toBe(100);
      expect(player.maxHealth).toBe(100);
      expect(player.level).toBe(1);
      expect(player.xp).toBe(0);
      expect(player.xpToNextLevel).toBe(5);
      expect(player.speed).toBe(5);
      expect(player.dead).toBe(false);
      expect(player.armor).toBe(0);
      expect(player.magnetRange).toBe(GAME_CONSTANTS.XP_MAGNET_RADIUS);
    });

    it('should start with empty weapons array', () => {
      expect(player.weapons.length).toBe(0);
    });
  });

  describe('weapon management', () => {
    describe('addWeapon', () => {
      it('should add a valid weapon type', () => {
        player.addWeapon('knife');
        expect(player.weapons.length).toBe(1);
        // Use find instead of direct index access for ArraySchema compatibility
        const knife = player.weapons.find(w => w.type === 'knife');
        expect(knife).toBeDefined();
        expect(knife!.type).toBe('knife');
        expect(knife!.level).toBe(1);
      });

      it('should not add invalid weapon type', () => {
        player.addWeapon('invalid_weapon');
        expect(player.weapons.length).toBe(0);
      });

      it('should add multiple weapons', () => {
        player.addWeapon('knife');
        player.addWeapon('wand');
        player.addWeapon('bible');
        expect(player.weapons.length).toBe(3);
      });
    });

    describe('upgradeWeapon', () => {
      it('should increase weapon level', () => {
        player.addWeapon('knife');
        expect(player.getWeaponLevel('knife')).toBe(1);

        player.upgradeWeapon('knife');
        expect(player.getWeaponLevel('knife')).toBe(2);
      });

      it('should not crash when upgrading non-existent weapon', () => {
        player.upgradeWeapon('knife');
        expect(player.weapons.length).toBe(0);
      });
    });

    describe('hasWeapon', () => {
      it('should return true for owned weapon', () => {
        player.addWeapon('knife');
        expect(player.hasWeapon('knife')).toBe(true);
      });

      it('should return false for unowned weapon', () => {
        expect(player.hasWeapon('knife')).toBe(false);
      });
    });

    describe('getWeaponLevel', () => {
      it('should return correct level for owned weapon', () => {
        player.addWeapon('knife');
        player.upgradeWeapon('knife');
        player.upgradeWeapon('knife');
        expect(player.getWeaponLevel('knife')).toBe(3);
      });

      it('should return 0 for unowned weapon', () => {
        expect(player.getWeaponLevel('knife')).toBe(0);
      });
    });
  });

  describe('XP and leveling', () => {
    describe('addXP', () => {
      it('should accumulate XP', () => {
        player.addXP(3);
        expect(player.xp).toBe(3);
        expect(player.level).toBe(1);
      });

      it('should level up when reaching threshold', () => {
        player.addXP(5); // xpToNextLevel is 5 at level 1
        expect(player.level).toBe(2);
        expect(player.xp).toBe(0);
        expect(player.pendingUpgrade).toBe(true);
      });

      it('should handle overflow XP correctly', () => {
        player.addXP(7); // 5 to level up, 2 remaining
        expect(player.level).toBe(2);
        expect(player.xp).toBe(2);
      });

      it('should handle multiple level ups', () => {
        // Level 1: 5 XP, Level 2: more XP needed
        player.addXP(100);
        expect(player.level).toBeGreaterThan(1);
        expect(player.pendingUpgrade).toBe(true);
      });

      it('should apply hostility penalty when hostility is high', () => {
        player.hostility = GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD + 1;
        player.addXP(4); // Use small amount to avoid level up
        expect(player.xp).toBe(2); // 50% penalty: 4 * 0.5 = 2
      });

      it('should not apply penalty when hostility is below threshold', () => {
        player.hostility = GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD - 1;
        player.addXP(4); // Use small amount to avoid level up
        expect(player.xp).toBe(4); // No penalty
      });
    });
  });

  describe('damage and death', () => {
    describe('takeDamage', () => {
      it('should reduce health', () => {
        player.takeDamage(30, 'attacker');
        expect(player.health).toBe(70);
      });

      it('should apply armor reduction', () => {
        player.armor = 10;
        player.takeDamage(30, 'attacker');
        expect(player.health).toBe(80); // 30 - 10 armor = 20 damage
      });

      it('should deal minimum 1 damage even with high armor', () => {
        player.armor = 100;
        player.takeDamage(10, 'attacker');
        expect(player.health).toBe(99); // minimum 1 damage
      });

      it('should apply PvP damage reduction', () => {
        player.takeDamage(100, 'other_player', true);
        // 100 * 0.15 = 15 damage
        expect(player.health).toBe(85);
      });

      it('should kill player when health drops to 0', () => {
        player.takeDamage(100, 'attacker');
        expect(player.dead).toBe(true);
        expect(player.health).toBe(0);
      });

      it('should not damage dead players', () => {
        player.die('attacker');
        player.takeDamage(50, 'another');
        expect(player.health).toBe(0);
      });

      it('should not damage invulnerable players', () => {
        player.invulnerableTime = 1000;
        player.takeDamage(50, 'attacker');
        expect(player.health).toBe(100);
      });
    });

    describe('die', () => {
      it('should set dead state correctly', () => {
        player.die('killer-id');
        expect(player.dead).toBe(true);
        expect(player.health).toBe(0);
        expect(player.killedBy).toBe('killer-id');
        expect(player.deathTime).toBeGreaterThan(0);
      });
    });

    describe('respawn', () => {
      beforeEach(() => {
        // Setup a killed player with some progression
        player.addWeapon('knife');
        player.addWeapon('wand');
        player.addXP(50);
        player.kills = 10;
        player.timeAlive = 120;
        player.hostility = 50;
        player.die('killer');
      });

      it('should reset position', () => {
        player.respawn(50, 75);
        expect(player.x).toBe(50);
        expect(player.y).toBe(75);
      });

      it('should restore health', () => {
        player.respawn(0, 0);
        expect(player.dead).toBe(false);
        expect(player.health).toBe(player.maxHealth);
      });

      it('should grant invulnerability', () => {
        player.respawn(0, 0);
        expect(player.invulnerableTime).toBe(GAME_CONSTANTS.PLAYER_INVULN_TIME);
      });

      it('should reset progression', () => {
        player.respawn(0, 0);
        expect(player.level).toBe(1);
        expect(player.xp).toBe(0);
        expect(player.xpToNextLevel).toBe(getXPForLevel(1));
        expect(player.kills).toBe(0);
        expect(player.timeAlive).toBe(0);
        expect(player.hostility).toBe(0);
      });

      it('should reset to starting weapon only', () => {
        player.respawn(0, 0);
        expect(player.weapons.length).toBe(1);
        const knife = player.weapons.find(w => w.type === 'knife');
        expect(knife).toBeDefined();
        expect(knife!.type).toBe('knife');
      });

      it('should clear killedBy', () => {
        player.respawn(0, 0);
        expect(player.killedBy).toBe('');
      });
    });
  });

  describe('isInvulnerable getter', () => {
    it('should return true when invulnerableTime > 0', () => {
      player.invulnerableTime = 100;
      expect(player.isInvulnerable).toBe(true);
    });

    it('should return false when invulnerableTime is 0', () => {
      player.invulnerableTime = 0;
      expect(player.isInvulnerable).toBe(false);
    });
  });
});
