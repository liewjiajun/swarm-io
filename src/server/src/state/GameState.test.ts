import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from './GameState';
import { GAME_CONSTANTS } from '@swarm-io/shared';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  describe('initial state', () => {
    it('should start with empty collections', () => {
      expect(state.players.size).toBe(0);
      expect(state.enemies.size).toBe(0);
      expect(state.projectiles.size).toBe(0);
      expect(state.xpOrbs.size).toBe(0);
    });

    it('should have pre-allocated object pools', () => {
      const stats = state.getPoolStats();
      expect(stats.projectiles).toBe(500);
      expect(stats.enemies).toBe(200);
      expect(stats.xpOrbs).toBe(500);
    });

    it('should have a world schema', () => {
      expect(state.world).toBeDefined();
    });
  });

  describe('player management', () => {
    describe('addPlayer', () => {
      it('should add player with correct id and position', () => {
        const player = state.addPlayer('player-1', 10, 20);

        expect(player.id).toBe('player-1');
        expect(player.x).toBe(10);
        expect(player.y).toBe(20);
        expect(state.players.size).toBe(1);
      });

      it('should initialize player with game constants', () => {
        const player = state.addPlayer('player-1', 0, 0);

        expect(player.health).toBe(GAME_CONSTANTS.PLAYER_START_HEALTH);
        expect(player.maxHealth).toBe(GAME_CONSTANTS.PLAYER_START_HEALTH);
        expect(player.speed).toBe(GAME_CONSTANTS.PLAYER_BASE_SPEED);
        expect(player.invulnerableTime).toBe(GAME_CONSTANTS.PLAYER_INVULN_TIME);
      });

      it('should give player starting knife weapon', () => {
        const player = state.addPlayer('player-1', 0, 0);

        expect(player.weapons.length).toBe(1);
        expect(player.hasWeapon('knife')).toBe(true);
      });

      it('should store player in map by id', () => {
        state.addPlayer('player-1', 0, 0);

        const retrieved = state.players.get('player-1');
        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe('player-1');
      });
    });

    describe('removePlayer', () => {
      it('should remove player from map', () => {
        state.addPlayer('player-1', 0, 0);
        expect(state.players.size).toBe(1);

        state.removePlayer('player-1');
        expect(state.players.size).toBe(0);
        expect(state.players.get('player-1')).toBeUndefined();
      });

      it('should handle removing non-existent player gracefully', () => {
        expect(() => state.removePlayer('non-existent')).not.toThrow();
      });
    });
  });

  describe('enemy management', () => {
    describe('addEnemy', () => {
      it('should add enemy with type and position', () => {
        const enemy = state.addEnemy('bat', 50, 60);

        expect(enemy.type).toBe('bat');
        expect(enemy.x).toBe(50);
        expect(enemy.y).toBe(60);
        expect(state.enemies.size).toBe(1);
      });

      it('should generate unique id for enemy', () => {
        const enemy1 = state.addEnemy('bat', 0, 0);
        const enemy2 = state.addEnemy('bat', 0, 0);

        expect(enemy1.id).not.toBe(enemy2.id);
        expect(enemy1.id.length).toBeGreaterThan(0);
      });

      it('should use pool for enemy creation', () => {
        const statsBefore = state.getPoolStats();
        state.addEnemy('bat', 0, 0);
        const statsAfter = state.getPoolStats();

        expect(statsAfter.enemies).toBe(statsBefore.enemies - 1);
      });
    });

    describe('removeEnemy', () => {
      it('should remove enemy and return to pool', () => {
        const enemy = state.addEnemy('bat', 0, 0);
        const enemyId = enemy.id;
        const statsAfterAdd = state.getPoolStats();

        state.removeEnemy(enemyId);

        expect(state.enemies.size).toBe(0);
        expect(state.getPoolStats().enemies).toBe(statsAfterAdd.enemies + 1);
      });

      it('should handle removing non-existent enemy gracefully', () => {
        expect(() => state.removeEnemy('non-existent')).not.toThrow();
      });
    });
  });

  describe('projectile management', () => {
    describe('addProjectile', () => {
      it('should add projectile with all properties', () => {
        const proj = state.addProjectile(
          'bullet',
          'player-1',
          10, 20,     // position
          5, 3,       // velocity
          25,         // damage
          1000,       // lifetime
          0.5,        // radius
          3           // piercing
        );

        expect(proj.type).toBe('bullet');
        expect(proj.ownerId).toBe('player-1');
        expect(proj.x).toBe(10);
        expect(proj.y).toBe(20);
        expect(proj.velocityX).toBe(5);
        expect(proj.velocityY).toBe(3);
        expect(proj.damage).toBe(25);
        expect(proj.lifetime).toBe(1000);
        expect(proj.radius).toBe(0.5);
        expect(proj.piercing).toBe(3);
      });

      it('should use pool for projectile creation', () => {
        const statsBefore = state.getPoolStats();
        state.addProjectile('bullet', 'p1', 0, 0, 1, 0, 10, 1000, 0.5);
        const statsAfter = state.getPoolStats();

        expect(statsAfter.projectiles).toBe(statsBefore.projectiles - 1);
      });

      it('should default piercing to 0', () => {
        const proj = state.addProjectile('bullet', 'p1', 0, 0, 1, 0, 10, 1000, 0.5);
        expect(proj.piercing).toBe(0);
      });
    });

    describe('removeProjectile', () => {
      it('should remove projectile and return to pool', () => {
        const proj = state.addProjectile('bullet', 'p1', 0, 0, 1, 0, 10, 1000, 0.5);
        const projId = proj.id;
        const statsAfterAdd = state.getPoolStats();

        state.removeProjectile(projId);

        expect(state.projectiles.size).toBe(0);
        expect(state.getPoolStats().projectiles).toBe(statsAfterAdd.projectiles + 1);
      });
    });
  });

  describe('XP orb management', () => {
    describe('addXPOrb', () => {
      it('should add orb with position and value', () => {
        const orb = state.addXPOrb(30, 40, 10);

        expect(orb.x).toBe(30);
        expect(orb.y).toBe(40);
        expect(orb.value).toBe(10);
        expect(state.xpOrbs.size).toBe(1);
      });

      it('should assign small size for value < 5', () => {
        const orb = state.addXPOrb(0, 0, 4);
        expect(orb.size).toBe('small');
      });

      it('should assign medium size for value 5-24', () => {
        const orb = state.addXPOrb(0, 0, 5);
        expect(orb.size).toBe('medium');

        const orb2 = state.addXPOrb(0, 0, 24);
        expect(orb2.size).toBe('medium');
      });

      it('should assign large size for value >= 25', () => {
        const orb = state.addXPOrb(0, 0, 25);
        expect(orb.size).toBe('large');

        const orb2 = state.addXPOrb(0, 0, 100);
        expect(orb2.size).toBe('large');
      });

      it('should use pool for orb creation', () => {
        const statsBefore = state.getPoolStats();
        state.addXPOrb(0, 0, 10);
        const statsAfter = state.getPoolStats();

        expect(statsAfter.xpOrbs).toBe(statsBefore.xpOrbs - 1);
      });
    });

    describe('removeXPOrb', () => {
      it('should remove orb and return to pool', () => {
        const orb = state.addXPOrb(0, 0, 10);
        const orbId = orb.id;
        const statsAfterAdd = state.getPoolStats();

        state.removeXPOrb(orbId);

        expect(state.xpOrbs.size).toBe(0);
        expect(state.getPoolStats().xpOrbs).toBe(statsAfterAdd.xpOrbs + 1);
      });
    });
  });

  describe('getPoolStats', () => {
    it('should return accurate pool statistics', () => {
      // Add some entities
      state.addEnemy('bat', 0, 0);
      state.addEnemy('skeleton', 0, 0);
      state.addProjectile('bullet', 'p1', 0, 0, 1, 0, 10, 1000, 0.5);
      state.addXPOrb(0, 0, 10);
      state.addXPOrb(0, 0, 5);

      const stats = state.getPoolStats();

      expect(stats.enemies).toBe(200 - 2);
      expect(stats.projectiles).toBe(500 - 1);
      expect(stats.xpOrbs).toBe(500 - 2);
    });
  });

  describe('multiple entity operations', () => {
    it('should handle many entities efficiently', () => {
      // Add many enemies
      const enemies: string[] = [];
      for (let i = 0; i < 50; i++) {
        const enemy = state.addEnemy('bat', i, i);
        enemies.push(enemy.id);
      }
      expect(state.enemies.size).toBe(50);

      // Remove half
      for (let i = 0; i < 25; i++) {
        state.removeEnemy(enemies[i]);
      }
      expect(state.enemies.size).toBe(25);

      // Pool should have reclaimed
      const stats = state.getPoolStats();
      expect(stats.enemies).toBe(200 - 50 + 25);
    });

    it('should handle multiple players', () => {
      state.addPlayer('p1', 0, 0);
      state.addPlayer('p2', 10, 10);
      state.addPlayer('p3', 20, 20);

      expect(state.players.size).toBe(3);

      state.removePlayer('p2');
      expect(state.players.size).toBe(2);
      expect(state.players.get('p2')).toBeUndefined();
      expect(state.players.get('p1')).toBeDefined();
      expect(state.players.get('p3')).toBeDefined();
    });
  });
});
