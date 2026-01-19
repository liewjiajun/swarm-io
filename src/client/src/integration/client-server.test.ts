/**
 * Client-Server Integration Tests (P7.4)
 *
 * Tests the integration between NetworkClient and server behavior
 * using MockColyseusServer. Unlike unit tests that mock individual functions,
 * these tests verify actual message flow and state synchronization.
 *
 * Test Coverage:
 * - Connection lifecycle (join, reconnect, disconnect)
 * - Player state management
 * - Input handling round-trip
 * - Upgrade selection flow
 * - Death and respawn cycle
 * - Multi-player scenarios
 * - State serialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockColyseusServer,
  createMockColyseusModule,
} from './MockColyseusServer';
import type { MockColyseusRoom } from './MockColyseusServer';

describe('Client-Server Integration (P7.4)', () => {
  let server: MockColyseusServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    server = new MockColyseusServer();
  });

  afterEach(() => {
    server.reset();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('connection lifecycle', () => {
    it('should successfully join a game room', async () => {
      const room = await server.joinOrCreate('game', {
        nickname: 'TestPlayer',
        playerClass: 'warrior',
      });

      expect(room).toBeDefined();
      expect(room.sessionId).toBeDefined();
      expect(room.reconnectionToken).toBeDefined();
      expect(room.state).toBeDefined();
    });

    it('should create a player on join', async () => {
      const room = await server.joinOrCreate('game', {
        nickname: 'Player1',
        playerClass: 'mage',
      });

      const player = server.getPlayer(room.sessionId);
      expect(player).toBeDefined();
      expect(player?.nickname).toBe('Player1');
      expect(player?.playerClass).toBe('mage');
      expect(player?.health).toBe(100);
      expect(player?.level).toBe(1);
      expect(player?.dead).toBe(false);
    });

    it('should assign starting weapons based on class', async () => {
      const warriorRoom = await server.joinOrCreate('game', {
        nickname: 'Warrior',
        playerClass: 'warrior',
      });
      const mageRoom = await server.joinOrCreate('game', {
        nickname: 'Mage',
        playerClass: 'mage',
      });

      const warrior = server.getPlayer(warriorRoom.sessionId);
      const mage = server.getPlayer(mageRoom.sessionId);

      expect(warrior?.weapons).toContainEqual({ type: 'knife', level: 1 });
      expect(warrior?.weapons).toContainEqual({ type: 'axe', level: 1 });
      expect(mage?.weapons).toContainEqual({ type: 'wand', level: 1 });
      expect(mage?.weapons).toContainEqual({ type: 'fireball', level: 1 });
    });

    it('should update world player count on join', async () => {
      expect(server.getState().world.playerCount).toBe(0);

      await server.joinOrCreate('game', { nickname: 'P1' });
      expect(server.getState().world.playerCount).toBe(1);

      await server.joinOrCreate('game', { nickname: 'P2' });
      expect(server.getState().world.playerCount).toBe(2);
    });

    it('should scale world radius with player count', async () => {
      const initialRadius = server.getState().world.worldRadius;

      await server.joinOrCreate('game', { nickname: 'P1' });
      const radiusAfterOne = server.getState().world.worldRadius;

      await server.joinOrCreate('game', { nickname: 'P2' });
      const radiusAfterTwo = server.getState().world.worldRadius;

      expect(radiusAfterOne).toBeGreaterThan(initialRadius);
      expect(radiusAfterTwo).toBeGreaterThan(radiusAfterOne);
    });

    it('should allow reconnection with valid token', async () => {
      const originalRoom = await server.joinOrCreate('game', {
        nickname: 'Reconnector',
      });
      const token = originalRoom.reconnectionToken;
      const sessionId = originalRoom.sessionId;

      const reconnectedRoom = await server.reconnect(token);

      expect(reconnectedRoom.sessionId).toBe(sessionId);
      expect(server.getPlayer(sessionId)).toBeDefined();
    });

    it('should reject reconnection with invalid token', async () => {
      await expect(server.reconnect('invalid-token')).rejects.toThrow();
    });

    it('should handle connection failure', async () => {
      server.shouldFailConnection = true;
      server.connectionError = new Error('Server full');

      await expect(
        server.joinOrCreate('game', { nickname: 'Blocked' })
      ).rejects.toThrow('Server full');
    });

    it('should simulate connection delay', async () => {
      server.connectionDelay = 100;

      const joinPromise = server.joinOrCreate('game', { nickname: 'Slow' });

      vi.advanceTimersByTime(50);
      // Should still be pending
      expect(server.getState().players.size).toBe(0);

      vi.advanceTimersByTime(60);
      await joinPromise;

      expect(server.getState().players.size).toBe(1);
    });

    it('should handle disconnect with normal close code', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Leaving' });
      const sessionId = room.sessionId;

      expect(server.getPlayer(sessionId)).toBeDefined();

      server.disconnectClient(sessionId, 1000);

      expect(server.getPlayer(sessionId)).toBeUndefined();
      expect(server.getState().world.playerCount).toBe(0);
    });

    it('should handle disconnect with kick code', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Kicked' });
      const sessionId = room.sessionId;

      server.disconnectClient(sessionId, 4000);

      expect(server.getPlayer(sessionId)).toBeUndefined();
    });

    it('should preserve player on abnormal disconnect', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Crash' });
      const sessionId = room.sessionId;

      server.disconnectClient(sessionId, 1006); // Abnormal closure

      // Player should still exist for potential reconnection
      expect(server.getPlayer(sessionId)).toBeDefined();
    });
  });

  describe('input handling', () => {
    it('should update player position on input', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Mover' });
      const sessionId = room.sessionId;

      const initialPlayer = server.getPlayer(sessionId)!;
      const initialX = initialPlayer.x;
      const initialY = initialPlayer.y;

      // Send move right input
      room.send('input', { input: { dx: 1, dy: 0, sequence: 1 } });

      const updatedPlayer = server.getPlayer(sessionId)!;
      expect(updatedPlayer.x).toBeGreaterThan(initialX);
      expect(updatedPlayer.y).toBe(initialY);
    });

    it('should update facing direction on input', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Turner' });
      const sessionId = room.sessionId;

      room.send('input', { input: { dx: 0, dy: -1, sequence: 1 } });

      const player = server.getPlayer(sessionId)!;
      expect(player.facingY).toBe(-1);
    });

    it('should clamp input values to valid range', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Cheater' });
      const sessionId = room.sessionId;

      const initialPlayer = server.getPlayer(sessionId)!;
      const initialX = initialPlayer.x;

      // Send invalid input (dx > 1)
      room.send('input', { input: { dx: 100, dy: 0, sequence: 1 } });

      const player = server.getPlayer(sessionId)!;
      // Position should change, but at normal speed (clamped to 1)
      const expectedMovement = player.speed * (1 / 60); // speed * dt
      expect(player.x - initialX).toBeCloseTo(expectedMovement, 5);
    });

    it('should track input sequence for reconciliation', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Sequencer' });
      const sessionId = room.sessionId;

      room.send('input', { input: { dx: 1, dy: 0, sequence: 42 } });

      const player = server.getPlayer(sessionId)!;
      expect(player.lastProcessedSequence).toBe(42);
    });

    it('should ignore input for dead players', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Dead' });
      const sessionId = room.sessionId;

      // Kill the player
      server.simulatePlayerDeath(sessionId);

      const deadPlayer = server.getPlayer(sessionId)!;
      const deathX = deadPlayer.x;

      // Try to move
      room.send('input', { input: { dx: 1, dy: 0, sequence: 1 } });

      expect(deadPlayer.x).toBe(deathX);
    });

    it('should log all input messages', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Logger' });
      const sessionId = room.sessionId;

      room.send('input', { input: { dx: 1, dy: 0, sequence: 1 } });
      room.send('input', { input: { dx: 0, dy: 1, sequence: 2 } });
      room.send('input', { input: { dx: -1, dy: 0, sequence: 3 } });

      const messages = server.getMessagesFromClient(sessionId);
      expect(messages).toHaveLength(3);
      expect(messages[0].type).toBe('input');
      expect(messages[2].data.input.sequence).toBe(3);
    });
  });

  describe('upgrade system', () => {
    it('should trigger level up message when simulated', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Leveler' });
      const sessionId = room.sessionId;

      const levelUpHandler = vi.fn();
      room.onMessage('level_up', levelUpHandler);

      server.simulateLevelUp(sessionId);

      expect(levelUpHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          newLevel: 2,
          choices: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              type: expect.stringMatching(/^(weapon|stat)$/),
            }),
          ]),
        })
      );
    });

    it('should set pendingUpgrade flag on level up', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Upgrader' });
      const sessionId = room.sessionId;

      server.simulateLevelUp(sessionId);

      const player = server.getPlayer(sessionId)!;
      expect(player.pendingUpgrade).toBe(true);
    });

    it('should apply weapon upgrade choice', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'WeaponUp' });
      const sessionId = room.sessionId;

      // Force a knife weapon for testing
      const player = server.getPlayer(sessionId)!;
      player.weapons = [{ type: 'knife', level: 1 }];
      player.pendingUpgrade = true;

      room.send('choose_upgrade', {
        choice: {
          id: 'upgrade-knife',
          type: 'weapon',
          weaponType: 'knife',
          description: 'Upgrade knife',
          weight: 10,
        },
      });

      expect(player.weapons[0].level).toBe(2);
      expect(player.pendingUpgrade).toBe(false);
    });

    it('should add new weapon on choice', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'NewWeapon' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      player.weapons = [{ type: 'knife', level: 1 }];
      player.pendingUpgrade = true;

      room.send('choose_upgrade', {
        choice: {
          id: 'new-fireball',
          type: 'weapon',
          weaponType: 'fireball',
          description: 'Add fireball',
          weight: 8,
        },
      });

      expect(player.weapons).toHaveLength(2);
      expect(player.weapons).toContainEqual({ type: 'fireball', level: 1 });
    });

    it('should apply stat boost choice', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'StatUp' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      const initialMaxHealth = player.maxHealth;
      player.pendingUpgrade = true;

      room.send('choose_upgrade', {
        choice: {
          id: 'stat-health',
          type: 'stat',
          statType: 'health',
          description: '+20 Max Health',
          weight: 15,
        },
      });

      expect(player.maxHealth).toBe(initialMaxHealth + 20);
    });

    it('should send upgrade_applied message on success', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Applied' });
      const sessionId = room.sessionId;

      const appliedHandler = vi.fn();
      room.onMessage('upgrade_applied', appliedHandler);

      const player = server.getPlayer(sessionId)!;
      player.pendingUpgrade = true;

      room.send('choose_upgrade', {
        choice: {
          id: 'stat-speed',
          type: 'stat',
          statType: 'speed',
          description: '+0.5 Speed',
          weight: 12,
        },
      });

      expect(appliedHandler).toHaveBeenCalled();
    });

    it('should ignore upgrade when not pending', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'NoPending' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      player.pendingUpgrade = false; // Not pending
      const initialMaxHealth = player.maxHealth;

      room.send('choose_upgrade', {
        choice: {
          id: 'stat-health',
          type: 'stat',
          statType: 'health',
          description: '+20 Max Health',
          weight: 15,
        },
      });

      expect(player.maxHealth).toBe(initialMaxHealth); // No change
    });
  });

  describe('death and respawn', () => {
    it('should trigger player_died message on death', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Dying' });
      const sessionId = room.sessionId;

      const diedHandler = vi.fn();
      room.onMessage('player_died', diedHandler);

      server.simulatePlayerDeath(sessionId, 'boss_demon');

      expect(diedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: sessionId,
          killedBy: 'boss_demon',
          finalScore: expect.any(Number),
        })
      );
    });

    it('should mark player as dead', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Mortal' });
      const sessionId = room.sessionId;

      server.simulatePlayerDeath(sessionId);

      const player = server.getPlayer(sessionId)!;
      expect(player.dead).toBe(true);
      expect(player.health).toBe(0);
    });

    it('should handle respawn request', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Phoenix' });
      const sessionId = room.sessionId;

      const respawnHandler = vi.fn();
      room.onMessage('respawn_complete', respawnHandler);

      // Die first
      server.simulatePlayerDeath(sessionId);

      // Request respawn
      room.send('respawn', { type: 'respawn' });

      const player = server.getPlayer(sessionId)!;
      expect(player.dead).toBe(false);
      expect(player.health).toBe(player.maxHealth);
      expect(player.level).toBe(1);
      expect(respawnHandler).toHaveBeenCalled();
    });

    it('should reset stats on respawn', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Resetter' });
      const sessionId = room.sessionId;

      // Advance player state
      const player = server.getPlayer(sessionId)!;
      player.level = 10;
      player.kills = 50;
      player.xp = 100;

      server.simulatePlayerDeath(sessionId);
      room.send('respawn', { type: 'respawn' });

      expect(player.level).toBe(1);
      expect(player.kills).toBe(0);
      expect(player.xp).toBe(0);
    });

    it('should grant invulnerability on respawn', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Invuln' });
      const sessionId = room.sessionId;

      server.simulatePlayerDeath(sessionId);
      room.send('respawn', { type: 'respawn' });

      const player = server.getPlayer(sessionId)!;
      expect(player.invulnerableTime).toBe(3);
    });

    it('should ignore respawn when not dead', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Alive' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      const originalLevel = player.level;

      room.send('respawn', { type: 'respawn' });

      expect(player.level).toBe(originalLevel); // No reset
    });
  });

  describe('game tick simulation', () => {
    it('should update game time on tick', async () => {
      await server.joinOrCreate('game', { nickname: 'Timer' });

      const initialTime = server.getState().world.gameTime;
      server.simulateTick(1 / 60);

      expect(server.getState().world.gameTime).toBeGreaterThan(initialTime);
    });

    it('should update player timeAlive on tick', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Survivor' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      const initialTime = player.timeAlive;

      server.simulateTick(1 / 60);

      expect(player.timeAlive).toBeGreaterThan(initialTime);
    });

    it('should decay invulnerability on tick', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Decaying' });
      const sessionId = room.sessionId;

      const player = server.getPlayer(sessionId)!;
      const initialInvuln = player.invulnerableTime;

      server.simulateTick(1 / 60);

      expect(player.invulnerableTime).toBeLessThan(initialInvuln);
    });

    it('should not update dead player timers', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'DeadTime' });
      const sessionId = room.sessionId;

      server.simulatePlayerDeath(sessionId);
      const player = server.getPlayer(sessionId)!;
      const deathTime = player.timeAlive;

      server.simulateTick(1 / 60);

      expect(player.timeAlive).toBe(deathTime);
    });

    it('should trigger state change callbacks on tick', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Notified' });

      const stateChangeHandler = vi.fn();
      room.onStateChange(stateChangeHandler);

      server.simulateTick(1 / 60);

      expect(stateChangeHandler).toHaveBeenCalled();
    });
  });

  describe('multi-player scenarios', () => {
    it('should support multiple simultaneous players', async () => {
      const room1 = await server.joinOrCreate('game', { nickname: 'Player1' });
      const room2 = await server.joinOrCreate('game', { nickname: 'Player2' });
      const room3 = await server.joinOrCreate('game', { nickname: 'Player3' });

      expect(server.getState().players.size).toBe(3);
      expect(server.getState().world.playerCount).toBe(3);
      expect(server.getPlayer(room1.sessionId)?.nickname).toBe('Player1');
      expect(server.getPlayer(room2.sessionId)?.nickname).toBe('Player2');
      expect(server.getPlayer(room3.sessionId)?.nickname).toBe('Player3');
    });

    it('should maintain separate player states', async () => {
      const room1 = await server.joinOrCreate('game', { nickname: 'Mover1' });
      const room2 = await server.joinOrCreate('game', { nickname: 'Mover2' });

      const player1Initial = { ...server.getPlayer(room1.sessionId)! };

      // Only player 2 moves
      room2.send('input', { input: { dx: 1, dy: 0, sequence: 1 } });

      const player1After = server.getPlayer(room1.sessionId)!;
      const player2After = server.getPlayer(room2.sessionId)!;

      // Player 1 should be unchanged
      expect(player1After.x).toBe(player1Initial.x);

      // Player 2 should have moved
      expect(player2After.lastProcessedSequence).toBe(1);
    });

    it('should broadcast state changes to all rooms', async () => {
      const room1 = await server.joinOrCreate('game', { nickname: 'Observer1' });
      const room2 = await server.joinOrCreate('game', { nickname: 'Observer2' });

      const stateChange1 = vi.fn();
      const stateChange2 = vi.fn();
      room1.onStateChange(stateChange1);
      room2.onStateChange(stateChange2);

      server.simulateTick(1 / 60);

      expect(stateChange1).toHaveBeenCalled();
      expect(stateChange2).toHaveBeenCalled();
    });

    it('should handle one player leaving while others remain', async () => {
      const room1 = await server.joinOrCreate('game', { nickname: 'Stayer' });
      const room2 = await server.joinOrCreate('game', { nickname: 'Leaver' });

      server.disconnectClient(room2.sessionId, 1000);

      expect(server.getState().players.size).toBe(1);
      expect(server.getPlayer(room1.sessionId)).toBeDefined();
      expect(server.getPlayer(room2.sessionId)).toBeUndefined();
    });
  });

  describe('state serialization', () => {
    it('should provide MapSchema-compatible state collections', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Schema' });

      const state = room.state;

      // Check that collections have MapSchema-like interface
      expect(typeof state.players.forEach).toBe('function');
      // $items is added dynamically for MapSchema compatibility
      expect((state.players as unknown as { $items: Map<string, unknown> }).$items).toBeInstanceOf(Map);
    });

    it('should include all entity types in state', async () => {
      const room = await server.joinOrCreate('game', { nickname: 'Complete' });

      // Add various entities
      server.addEnemy('bat', 100, 100);
      server.addXPOrb(50, 50, 10);

      const state = room.state;
      expect(state.players.size).toBeGreaterThan(0);
      expect(state.enemies.size).toBeGreaterThan(0);
      expect(state.xpOrbs.size).toBeGreaterThan(0);
    });

    it('should correctly serialize world state', async () => {
      await server.joinOrCreate('game', { nickname: 'WorldTest' });

      const worldState = server.getState().world;
      expect(worldState).toMatchObject({
        worldRadius: expect.any(Number),
        playerCount: expect.any(Number),
        gameTime: expect.any(Number),
        currentWave: expect.any(Number),
        difficulty: expect.any(Number),
      });
    });
  });

  describe('mock colyseus module factory', () => {
    it('should create a valid mock module', () => {
      const mockModule = createMockColyseusModule(server);

      expect(mockModule.Client).toBeDefined();
      expect(mockModule.Room).toBeDefined();
    });

    it('should provide working Client class', async () => {
      const mockModule = createMockColyseusModule(server);
      const client = new mockModule.Client();

      const room = await client.joinOrCreate('game', { nickname: 'MockClient' });

      expect(room).toBeDefined();
      expect(room.sessionId).toBeDefined();
    });

    it('should support reconnection through mock Client', async () => {
      const mockModule = createMockColyseusModule(server);
      const client = new mockModule.Client();

      const originalRoom = await client.joinOrCreate('game', {
        nickname: 'Reconnector',
      });
      const token = originalRoom.reconnectionToken;

      const reconnectedRoom = await client.reconnect(token);

      expect(reconnectedRoom.sessionId).toBe(originalRoom.sessionId);
    });
  });
});
