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
      // Note: addXP() only accumulates XP. Level-up logic is handled by XPSystem.processLevelUps()
      // This ensures pendingChoices are generated properly when leveling up.

      it('should accumulate XP', () => {
        player.addXP(3);
        expect(player.xp).toBe(3);
        expect(player.level).toBe(1);
      });

      it('should accumulate XP beyond threshold without leveling (level-up handled by XPSystem)', () => {
        player.addXP(5); // xpToNextLevel is 5 at level 1
        expect(player.level).toBe(1); // addXP no longer handles level-ups
        expect(player.xp).toBe(5); // XP accumulates
      });

      it('should accumulate large amounts of XP (level-up handled by XPSystem)', () => {
        player.addXP(100);
        expect(player.level).toBe(1); // addXP no longer handles level-ups
        expect(player.xp).toBe(100); // XP accumulates
      });

      it('should apply hostility penalty when hostility is high', () => {
        player.hostility = GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD + 1;
        player.addXP(4);
        expect(player.xp).toBe(2); // 50% penalty: 4 * 0.5 = 2
      });

      it('should not apply penalty when hostility is below threshold', () => {
        player.hostility = GAME_CONSTANTS.HOSTILITY_XP_PENALTY_THRESHOLD - 1;
        player.addXP(4);
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

  // P4.6: Trading functionality tests
  describe('trading functionality (P4.6)', () => {
    describe('initial trade state', () => {
      it('should have empty trade state on creation', () => {
        expect(player.pendingTradeOfferId).toBe('');
        expect(player.pendingTradeFromId).toBe('');
        expect(player.pendingTradeWeapon).toBe('');
        expect(player.pendingTradeLevel).toBe(0);
        expect(player.tradeCooldown).toBe(0);
        expect(player.outgoingTradeOfferId).toBe('');
      });
    });

    describe('removeWeapon', () => {
      it('should remove existing weapon and return its level', () => {
        player.addWeapon('knife');
        player.upgradeWeapon('knife');
        player.upgradeWeapon('knife'); // level 3

        const removedLevel = player.removeWeapon('knife');
        expect(removedLevel).toBe(3);
        expect(player.hasWeapon('knife')).toBe(false);
        expect(player.weapons.length).toBe(0);
      });

      it('should return 0 when removing non-existent weapon', () => {
        const removedLevel = player.removeWeapon('knife');
        expect(removedLevel).toBe(0);
      });

      it('should only remove the specified weapon', () => {
        player.addWeapon('knife');
        player.addWeapon('wand');
        player.addWeapon('bible');

        player.removeWeapon('wand');

        expect(player.weapons.length).toBe(2);
        expect(player.hasWeapon('knife')).toBe(true);
        expect(player.hasWeapon('wand')).toBe(false);
        expect(player.hasWeapon('bible')).toBe(true);
      });
    });

    describe('addWeaponAtLevel', () => {
      it('should add weapon at specified level', () => {
        player.addWeaponAtLevel('wand', 5);

        expect(player.hasWeapon('wand')).toBe(true);
        expect(player.getWeaponLevel('wand')).toBe(5);
      });

      it('should not add invalid weapon type', () => {
        player.addWeaponAtLevel('invalid_weapon', 3);
        expect(player.weapons.length).toBe(0);
      });

      it('should take higher level when adding duplicate weapon', () => {
        player.addWeapon('knife'); // level 1
        player.addWeaponAtLevel('knife', 5);

        // Should not create duplicate, just upgrade to higher level
        expect(player.weapons.length).toBe(1);
        expect(player.getWeaponLevel('knife')).toBe(5);
      });

      it('should keep existing level if higher than new level', () => {
        player.addWeapon('knife');
        player.upgradeWeapon('knife');
        player.upgradeWeapon('knife');
        player.upgradeWeapon('knife'); // level 4

        player.addWeaponAtLevel('knife', 2); // try to add at lower level

        expect(player.weapons.length).toBe(1);
        expect(player.getWeaponLevel('knife')).toBe(4); // keeps higher level
      });
    });

    describe('trade state reset on respawn', () => {
      it('should clear trade state when respawning', () => {
        // Set up trade state
        player.pendingTradeOfferId = 'trade_123';
        player.pendingTradeFromId = 'other-player';
        player.pendingTradeWeapon = 'wand';
        player.pendingTradeLevel = 3;
        player.tradeCooldown = 5;
        player.outgoingTradeOfferId = 'trade_456';

        player.addWeapon('knife');
        player.die('killer');
        player.respawn(0, 0);

        // All trade state should be cleared
        expect(player.pendingTradeOfferId).toBe('');
        expect(player.pendingTradeFromId).toBe('');
        expect(player.pendingTradeWeapon).toBe('');
        expect(player.pendingTradeLevel).toBe(0);
        expect(player.tradeCooldown).toBe(0);
        expect(player.outgoingTradeOfferId).toBe('');
      });
    });
  });
});
