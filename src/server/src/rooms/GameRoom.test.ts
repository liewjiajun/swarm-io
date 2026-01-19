import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GAME_CONSTANTS, getCharacterClassIds } from '@swarm-io/shared';
import * as fs from 'fs';

// Mock Colyseus Room BEFORE importing GameRoom
const mockClock = {
  setInterval: vi.fn((_callback: () => void, _ms: number) => {
    return { clear: vi.fn() };
  }),
};

const mockOnMessage = vi.fn();

vi.mock('@colyseus/core', () => {
  return {
    Room: class MockRoom {
      maxClients = 150;
      state: any = null;
      clock = mockClock;
      _mockClients: any[] = [];

      get clients() {
        return this._mockClients;
      }

      setState(state: any) {
        this.state = state;
      }

      onMessage(type: string, handler: (client: any, message: any) => void) {
        mockOnMessage(type, handler);
      }
    },
    Client: class MockClient {},
    Delayed: class MockDelayed {},
  };
});

// Mock fs module for ban persistence tests
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock logger to prevent console output during tests
// Need to mock ALL loggers since GameRoom instantiates systems that use them
// Note: Factory function is hoisted, so we can't reference external variables
vi.mock('../utils/logger.js', () => {
  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  });
  const mockLogger = createMockLogger();
  return {
    logger: mockLogger,
    gameRoomLogger: mockLogger,
    securityLogger: mockLogger,
    spawnSystemLogger: mockLogger,
    weaponSystemLogger: mockLogger,
    combatSystemLogger: mockLogger,
    xpSystemLogger: mockLogger,
    physicsSystemLogger: mockLogger,
  };
});

// Mock TelemetryService
vi.mock('../services/TelemetryService.js', () => ({
  getTelemetryService: vi.fn(() => ({
    recordSession: vi.fn(),
    recordUpgradeChoice: vi.fn(),
  })),
}));

// Mock LeaderboardService
vi.mock('../services/LeaderboardService.js', () => ({
  getLeaderboardService: vi.fn(() => ({
    submitScore: vi.fn(() => ({
      accepted: true,
      rank: 1,
      message: 'Score submitted',
      replacedPrevious: false,
    })),
  })),
}));

// Now import GameRoom after mocks are set up
import { GameRoom } from './GameRoom.js';
import { GameState } from '../state/GameState.js';

// Helper to create a testable GameRoom with exposed private methods
class TestableGameRoom extends GameRoom {
  // Expose private methods for direct testing
  public testIsBanned(sessionId: string, ip?: string) {
    return (this as any).isBanned(sessionId, ip);
  }

  public testBanPlayer(sessionId: string, reason: string, ip?: string) {
    return (this as any).banPlayer(sessionId, reason, ip);
  }

  public testKickPlayer(playerId: string, reason: string) {
    return (this as any).kickPlayer(playerId, reason);
  }

  public testGetClientIP(client: MockClient) {
    return (this as any).getClientIP(client);
  }

  public testHandleInputMessage(client: MockClient, message: any) {
    return (this as any).handleInputMessage(client, message);
  }

  public testHandleUpgradeMessage(client: MockClient, message: any) {
    return (this as any).handleUpgradeMessage(client, message);
  }

  public testHandleRespawnMessage(client: MockClient) {
    return (this as any).handleRespawnMessage(client);
  }

  public testProcessPlayerInputs(deltaTime: number) {
    return (this as any).processPlayerInputs(deltaTime);
  }

  public testUpdatePlayerTimers(deltaTime: number) {
    return (this as any).updatePlayerTimers(deltaTime);
  }

  public testRecalculateWorldSize() {
    return (this as any).recalculateWorldSize();
  }

  public getClientData() {
    return (this as any).clientData;
  }

  public getBannedSessions() {
    return (this as any).bannedSessions;
  }

  public getBannedIPs() {
    return (this as any).bannedIPs;
  }

  public getActiveTradeOffers() {
    return (this as any).activeTradeOffers;
  }

  public addMockClient(client: MockClient) {
    (this as any)._mockClients.push(client);
  }
}

// Mock Client interface
interface MockClient {
  sessionId: string;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  req?: {
    headers?: Record<string, string | string[]>;
    socket?: { remoteAddress?: string };
    connection?: { remoteAddress?: string };
  };
}

// Counter for unique client IDs
let clientIdCounter = 0;

function createMockClient(overrides: Partial<MockClient> = {}): any {
  return {
    sessionId: overrides.sessionId ?? `client-${++clientIdCounter}`,
    send: vi.fn(),
    leave: vi.fn(),
    error: vi.fn(),
    req: overrides.req ?? {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    },
    ...overrides,
  };
}

describe('GameRoom', () => {
  let room: TestableGameRoom;
  let currentTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = Date.parse('2026-01-19T00:00:00.000Z');
    vi.setSystemTime(new Date(currentTime));

    room = new TestableGameRoom();
    // Initialize state manually for testing
    room.setState(new GameState());
    // Reset client counter
    clientIdCounter = 0;
    // Initialize clientData map
    (room as any).clientData = new Map();

    // Reset fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    // Reset Colyseus mocks
    mockClock.setInterval.mockClear();
    mockOnMessage.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function advanceTime(ms: number) {
    currentTime += ms;
    vi.setSystemTime(new Date(currentTime));
  }

  describe('initialization', () => {
    it('should have maxClients set to 150', () => {
      expect(room.maxClients).toBe(150);
    });

    it('should call loadBans during onCreate', () => {
      // Call onCreate which should try to load bans
      room.onCreate({});

      // Since file doesn't exist, existsSync should have been called
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should setup message handlers during onCreate', () => {
      // The room should setup handlers without throwing
      expect(() => room.onCreate({})).not.toThrow();
    });

    it('should start game loop at 60Hz during onCreate', () => {
      room.onCreate({});

      expect(mockClock.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        GAME_CONSTANTS.SERVER_TICK_RATE
      );
    });
  });

  describe('ban system (P3.2)', () => {
    describe('isBanned', () => {
      it('should return false for non-banned session', () => {
        const result = room.testIsBanned('new-session');
        expect(result.banned).toBe(false);
      });

      it('should return true for banned session', () => {
        room.testBanPlayer('banned-session', 'test reason');

        const result = room.testIsBanned('banned-session');
        expect(result.banned).toBe(true);
        expect(result.reason).toBe('test reason');
      });

      it('should return true for banned IP', () => {
        room.testBanPlayer('any-session', 'test reason', '192.168.1.100');

        const result = room.testIsBanned('different-session', '192.168.1.100');
        expect(result.banned).toBe(true);
      });

      it('should return remaining time for timed bans', () => {
        room.testBanPlayer('temp-banned', 'test reason');

        const result = room.testIsBanned('temp-banned');
        expect(result.banned).toBe(true);
        expect(result.remaining).toBeDefined();
        expect(result.remaining).toBeGreaterThan(0);
      });

      it('should return false after ban expires', () => {
        room.testBanPlayer('temp-banned', 'test reason');

        // Advance time past ban duration (default 30 minutes)
        advanceTime(31 * 60 * 1000);

        const result = room.testIsBanned('temp-banned');
        expect(result.banned).toBe(false);
      });

      it('should clean up expired bans when checking', () => {
        room.testBanPlayer('expired-ban', 'test reason');

        // Advance time past ban duration
        advanceTime(31 * 60 * 1000);

        // Check ban status (should clean up expired)
        room.testIsBanned('expired-ban');

        // Ban should be removed from map
        expect(room.getBannedSessions().has('expired-ban')).toBe(false);
      });
    });

    describe('banPlayer', () => {
      it('should add session to banned list', () => {
        room.testBanPlayer('test-session', 'security violation');

        expect(room.getBannedSessions().has('test-session')).toBe(true);
      });

      it('should add IP to banned list when provided', () => {
        room.testBanPlayer('test-session', 'security violation', '10.0.0.1');

        expect(room.getBannedIPs().has('10.0.0.1')).toBe(true);
      });

      it('should not add unknown IP to banned list', () => {
        room.testBanPlayer('test-session', 'security violation', 'unknown');

        expect(room.getBannedIPs().has('unknown')).toBe(false);
      });

      it('should escalate ban duration for repeat offenders', () => {
        room.testBanPlayer('repeat-offender', 'first offense');
        const firstBan = room.getBannedSessions().get('repeat-offender');

        room.testBanPlayer('repeat-offender', 'second offense');
        const secondBan = room.getBannedSessions().get('repeat-offender');

        expect(secondBan!.violations).toBe(2);
        expect(secondBan!.duration).toBeGreaterThan(firstBan!.duration);
      });

      it('should cap ban duration at 24 hours', () => {
        // Create many repeat offenses
        for (let i = 0; i < 20; i++) {
          room.testBanPlayer('chronic-offender', `offense ${i + 1}`);
        }

        const ban = room.getBannedSessions().get('chronic-offender');
        expect(ban!.duration).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      });

      it('should save bans to file after banning', () => {
        room.testBanPlayer('save-test', 'test reason');

        expect(fs.writeFileSync).toHaveBeenCalled();
      });
    });

    describe('getClientIP', () => {
      it('should extract IP from socket remoteAddress', () => {
        const client = createMockClient({
          req: {
            socket: { remoteAddress: '192.168.1.50' },
          },
        });

        const ip = room.testGetClientIP(client);
        expect(ip).toBe('192.168.1.50');
      });

      it('should use x-forwarded-for header when present', () => {
        const client = createMockClient({
          req: {
            headers: { 'x-forwarded-for': '10.0.0.5, 10.0.0.1' },
            socket: { remoteAddress: '127.0.0.1' },
          },
        });

        const ip = room.testGetClientIP(client);
        expect(ip).toBe('10.0.0.5');
      });

      it('should handle array x-forwarded-for header', () => {
        const client = createMockClient({
          req: {
            headers: { 'x-forwarded-for': ['203.0.113.5', '10.0.0.1'] },
            socket: { remoteAddress: '127.0.0.1' },
          },
        });

        const ip = room.testGetClientIP(client);
        expect(ip).toBe('203.0.113.5');
      });

      it('should return unknown when no IP available', () => {
        const client = createMockClient({
          req: undefined,
        });

        const ip = room.testGetClientIP(client);
        expect(ip).toBe('unknown');
      });
    });

    describe('kickPlayer', () => {
      it('should send kicked message to client', () => {
        const client = createMockClient({ sessionId: 'kick-me' });
        room.addMockClient(client);

        room.testKickPlayer('kick-me', 'rate limit exceeded');

        expect(client.send).toHaveBeenCalledWith('kicked', { reason: 'rate limit exceeded' });
      });

      it('should disconnect client with code 4000', () => {
        const client = createMockClient({ sessionId: 'kick-me' });
        room.addMockClient(client);

        room.testKickPlayer('kick-me', 'rate limit exceeded');

        expect(client.leave).toHaveBeenCalledWith(4000);
      });

      it('should ban the player when kicking', () => {
        const client = createMockClient({ sessionId: 'kick-and-ban' });
        room.addMockClient(client);

        room.testKickPlayer('kick-and-ban', 'cheating');

        expect(room.getBannedSessions().has('kick-and-ban')).toBe(true);
      });

      it('should not throw when client not found', () => {
        expect(() => room.testKickPlayer('non-existent', 'test')).not.toThrow();
      });
    });
  });

  describe('onJoin', () => {
    it('should reject banned players', () => {
      const client = createMockClient({ sessionId: 'banned-player' });
      room.testBanPlayer('banned-player', 'previous offense');

      room.onJoin(client, {});

      expect(client.send).toHaveBeenCalledWith('banned', expect.objectContaining({
        reason: 'previous offense',
      }));
      expect(client.leave).toHaveBeenCalledWith(4001);
    });

    it('should add player to game state', () => {
      const client = createMockClient();

      room.onJoin(client, {});

      expect(room.state.players.has(client.sessionId)).toBe(true);
    });

    it('should sanitize nickname from options', () => {
      const client = createMockClient();

      room.onJoin(client, { nickname: '  <script>alert("xss")</script>TestName  ' });

      const player = room.state.players.get(client.sessionId);
      expect(player!.nickname).not.toContain('<');
      expect(player!.nickname).not.toContain('>');
      expect(player!.nickname).not.toContain('"');
    });

    it('should limit nickname to 16 characters', () => {
      const client = createMockClient();

      room.onJoin(client, { nickname: 'ThisIsAVeryLongNicknameThatExceedsSixteenCharacters' });

      const player = room.state.players.get(client.sessionId);
      expect(player!.nickname.length).toBeLessThanOrEqual(16);
    });

    it('should validate and use valid playerClass', () => {
      const client = createMockClient();
      const validClasses = getCharacterClassIds();

      room.onJoin(client, { playerClass: validClasses[0] });

      const player = room.state.players.get(client.sessionId);
      expect(player!.playerClass).toBe(validClasses[0]);
    });

    it('should default to survivor for invalid playerClass', () => {
      const client = createMockClient();

      room.onJoin(client, { playerClass: 'invalid_class' });

      const player = room.state.players.get(client.sessionId);
      expect(player!.playerClass).toBe('survivor');
    });

    it('should initialize client data', () => {
      const client = createMockClient();

      room.onJoin(client, {});

      const clientData = room.getClientData().get(client.sessionId);
      expect(clientData).toBeDefined();
      expect(clientData.inputBuffer).toEqual([]);
      expect(clientData.lastProcessedSequence).toBe(0);
      expect(clientData.joinTime).toBeGreaterThan(0);
    });

    it('should recalculate world size after join', () => {
      const client = createMockClient();

      room.onJoin(client, {});

      expect(room.state.world.playerCount).toBe(1);
    });

    it('should spawn player within valid radius', () => {
      const client = createMockClient();

      room.onJoin(client, {});

      const player = room.state.players.get(client.sessionId);
      const spawnRadius = Math.min(100, room.state.world.worldRadius * 0.2);
      const distance = Math.sqrt(player!.x ** 2 + player!.y ** 2);
      // Add small tolerance for floating point errors
      expect(distance).toBeLessThanOrEqual(spawnRadius + 0.001);
    });
  });

  describe('onLeave', () => {
    it('should remove player from game state', () => {
      const client = createMockClient();
      room.onJoin(client, {});
      expect(room.state.players.has(client.sessionId)).toBe(true);

      room.onLeave(client, true);

      expect(room.state.players.has(client.sessionId)).toBe(false);
    });

    it('should clean up client data', () => {
      const client = createMockClient();
      room.onJoin(client, {});

      room.onLeave(client, true);

      expect(room.getClientData().has(client.sessionId)).toBe(false);
    });

    it('should recalculate world size after leave', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      room.onJoin(client1, {});
      room.onJoin(client2, {});
      expect(room.state.world.playerCount).toBe(2);

      room.onLeave(client1, true);

      expect(room.state.world.playerCount).toBe(1);
    });

    it('should cleanup trade offers when player leaves', () => {
      // Setup players and trade offer
      const sender = createMockClient();
      const receiver = createMockClient();
      room.onJoin(sender, {});
      room.onJoin(receiver, {});
      room.addMockClient(sender);
      room.addMockClient(receiver);

      // Give sender an extra weapon so they can trade
      const senderPlayer = room.state.players.get(sender.sessionId);
      const receiverPlayer = room.state.players.get(receiver.sessionId);
      senderPlayer!.addWeapon('fireball');

      // Ensure players are within TRADE_RADIUS
      senderPlayer!.x = 0;
      senderPlayer!.y = 0;
      receiverPlayer!.x = 1;
      receiverPlayer!.y = 0;

      // Create a trade offer by simulating the message
      (room as any).handleTradeOfferMessage(sender, {
        targetPlayerId: receiver.sessionId,
        weaponType: 'fireball',
      });

      expect(room.getActiveTradeOffers().size).toBe(1);

      // Sender leaves
      room.onLeave(sender, true);

      expect(room.getActiveTradeOffers().size).toBe(0);
    });
  });

  describe('onDispose', () => {
    it('should stop game loop', () => {
      room.onCreate({});
      const mockInterval = { clear: vi.fn() };
      (room as any).gameLoopInterval = mockInterval;

      room.onDispose();

      expect(mockInterval.clear).toHaveBeenCalled();
    });

    it('should reset all systems', () => {
      room.onCreate({});

      // Should not throw
      expect(() => room.onDispose()).not.toThrow();
    });
  });

  describe('input handling', () => {
    describe('handleInputMessage', () => {
      it('should reject input when no client data exists', () => {
        const client = createMockClient();
        // Don't call onJoin, so no client data

        room.testHandleInputMessage(client, { input: { dx: 1, dy: 0, sequence: 1 } });

        // Should not throw, just log warning
      });

      it('should reject invalid input structure', () => {
        const client = createMockClient();
        room.onJoin(client, {});

        room.testHandleInputMessage(client, null);
        room.testHandleInputMessage(client, {});
        room.testHandleInputMessage(client, { input: null });
        room.testHandleInputMessage(client, { input: { dx: 'invalid', dy: 0 } });

        // Input buffer should remain empty
        const clientData = room.getClientData().get(client.sessionId);
        expect(clientData.inputBuffer.length).toBe(0);
      });

      it('should add valid input to buffer', () => {
        const client = createMockClient();
        room.onJoin(client, {});

        room.testHandleInputMessage(client, { input: { dx: 1, dy: 0, sequence: 1 } });

        const clientData = room.getClientData().get(client.sessionId);
        expect(clientData.inputBuffer.length).toBe(1);
        expect(clientData.inputBuffer[0].dx).toBe(1);
        expect(clientData.inputBuffer[0].dy).toBe(0);
      });

      it('should prevent input buffer overflow', () => {
        const client = createMockClient();
        room.onJoin(client, {});

        // Add 15 inputs (exceeds max of 10)
        for (let i = 0; i < 15; i++) {
          room.testHandleInputMessage(client, { input: { dx: 1, dy: 0, sequence: i } });
        }

        const clientData = room.getClientData().get(client.sessionId);
        expect(clientData.inputBuffer.length).toBe(10);
        // First inputs should have been dropped
        expect(clientData.inputBuffer[0].sequence).toBe(5);
      });

      it('should default sequence to 0 if not provided', () => {
        const client = createMockClient();
        room.onJoin(client, {});

        room.testHandleInputMessage(client, { input: { dx: 1, dy: 0 } });

        const clientData = room.getClientData().get(client.sessionId);
        expect(clientData.inputBuffer[0].sequence).toBe(0);
      });
    });

    describe('processPlayerInputs', () => {
      it('should skip dead players', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.dead = true;

        const clientData = room.getClientData().get(client.sessionId);
        clientData.inputBuffer.push({ dx: 1, dy: 0, sequence: 1, timestamp: Date.now() });

        room.testProcessPlayerInputs(0.016);

        // Input should remain in buffer (not processed)
        expect(clientData.inputBuffer.length).toBe(1);
      });

      it('should process one input per tick', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        const _initialX = player!.x;

        // Add multiple inputs
        const clientData = room.getClientData().get(client.sessionId);
        clientData.inputBuffer.push(
          { dx: 1, dy: 0, sequence: 1, timestamp: Date.now() },
          { dx: 1, dy: 0, sequence: 2, timestamp: Date.now() },
        );

        room.testProcessPlayerInputs(0.016);

        // Only one input should be processed
        expect(clientData.inputBuffer.length).toBe(1);
      });

      it('should update sequence tracking (BUG-027 fix)', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);

        const clientData = room.getClientData().get(client.sessionId);
        clientData.inputBuffer.push({ dx: 1, dy: 0, sequence: 5, timestamp: Date.now() });

        room.testProcessPlayerInputs(0.016);

        expect(clientData.lastProcessedSequence).toBe(5);
        expect(player!.lastProcessedSequence).toBe(5);
      });

      it('should allow input during pending upgrade (BUG-050 fix)', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.pendingUpgrade = true;
        const initialX = player!.x;

        const clientData = room.getClientData().get(client.sessionId);
        clientData.inputBuffer.push({ dx: 1, dy: 0, sequence: 1, timestamp: Date.now() });

        room.testProcessPlayerInputs(0.016);

        // Input should be processed even with pending upgrade
        expect(clientData.inputBuffer.length).toBe(0);
        // Player should have moved
        expect(player!.x).not.toBe(initialX);
      });
    });
  });

  describe('upgrade handling', () => {
    describe('handleUpgradeMessage', () => {
      it('should reject when player has no pending upgrade', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.pendingUpgrade = false;

        room.testHandleUpgradeMessage(client, { choice: { type: 'upgrade_weapon', weaponType: 'knife' } });

        // Should not apply the upgrade
      });

      it('should reject invalid upgrade choice structure', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.pendingUpgrade = true;

        // Test with empty object (no choice field) - should handle gracefully
        room.testHandleUpgradeMessage(client, {});
        // Test with choice but no type field
        room.testHandleUpgradeMessage(client, { choice: {} });

        // Player should still have pending upgrade since invalid choices are rejected
        expect(player!.pendingUpgrade).toBe(true);
      });
    });
  });

  describe('respawn handling', () => {
    describe('handleRespawnMessage', () => {
      it('should reject when player is not dead', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.dead = false;

        room.testHandleRespawnMessage(client);

        // Nothing should happen
        expect(player!.dead).toBe(false);
      });

      it('should respawn dead player', () => {
        const client = createMockClient();
        room.addMockClient(client);
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.die('enemy');

        room.testHandleRespawnMessage(client);

        expect(player!.dead).toBe(false);
        expect(player!.health).toBe(GAME_CONSTANTS.PLAYER_START_HEALTH);
      });

      it('should send respawn_complete message', () => {
        const client = createMockClient();
        room.addMockClient(client);
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.die('enemy');

        room.testHandleRespawnMessage(client);

        expect(client.send).toHaveBeenCalledWith('respawn_complete', expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }));
      });

      it('should clean up player projectiles on respawn', () => {
        const client = createMockClient();
        room.addMockClient(client);
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);

        // Add some projectiles owned by this player
        room.state.addProjectile('orb', client.sessionId, 0, 0, 0, 0, 10, 1000, 1, 0);
        room.state.addProjectile('orb', client.sessionId, 5, 5, 0, 0, 10, 1000, 1, 0);
        expect(room.state.projectiles.size).toBe(2);

        player!.die('enemy');
        room.testHandleRespawnMessage(client);

        // Projectiles should be cleaned up
        expect(room.state.projectiles.size).toBe(0);
      });
    });
  });

  describe('player timers', () => {
    describe('updatePlayerTimers', () => {
      it('should update timeAlive for living players', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        const initialTime = player!.timeAlive;

        room.testUpdatePlayerTimers(0.5);

        expect(player!.timeAlive).toBeCloseTo(initialTime + 0.5, 2);
      });

      it('should decay invulnerableTime', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.invulnerableTime = 2;

        room.testUpdatePlayerTimers(0.5);

        expect(player!.invulnerableTime).toBeCloseTo(1.5, 2);
      });

      it('should not let invulnerableTime go negative', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.invulnerableTime = 0.3;

        room.testUpdatePlayerTimers(0.5);

        expect(player!.invulnerableTime).toBe(0);
      });

      it('should decay hostility over time (BUG-008 fix)', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.hostility = 5;

        room.testUpdatePlayerTimers(1); // 1 second

        expect(player!.hostility).toBeLessThan(5);
        expect(player!.hostility).toBeCloseTo(5 - GAME_CONSTANTS.HOSTILITY_DECAY_RATE, 2);
      });

      it('should decay tradeCooldown (P4.6)', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.tradeCooldown = 5;

        room.testUpdatePlayerTimers(1);

        expect(player!.tradeCooldown).toBe(4);
      });

      it('should not update timers for dead players', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.dead = true;
        player!.timeAlive = 10;

        room.testUpdatePlayerTimers(1);

        expect(player!.timeAlive).toBe(10);
      });

      it('should decay revivalCooldown for dead players (P4.2)', () => {
        const client = createMockClient();
        room.onJoin(client, {});
        const player = room.state.players.get(client.sessionId);
        player!.dead = true;
        player!.revivalCooldown = 5;

        room.testUpdatePlayerTimers(1);

        expect(player!.revivalCooldown).toBe(4);
      });
    });
  });

  describe('world size calculation', () => {
    it('should update playerCount', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      room.onJoin(client1, {});
      room.onJoin(client2, {});

      room.testRecalculateWorldSize();

      expect(room.state.world.playerCount).toBe(2);
    });

    it('should call world.recalculateSize with player count', () => {
      const client = createMockClient();
      room.onJoin(client, {});

      const _initialRadius = room.state.world.worldRadius;
      room.testRecalculateWorldSize();

      // World radius should be recalculated based on player count
      expect(room.state.world.worldRadius).toBeDefined();
    });
  });

  describe('getRoomStats', () => {
    it('should return comprehensive room statistics', () => {
      room.onCreate({});
      const client = createMockClient();
      room.onJoin(client, {});

      const stats = room.getRoomStats();

      expect(stats).toHaveProperty('playerCount');
      expect(stats).toHaveProperty('enemyCount');
      expect(stats).toHaveProperty('projectileCount');
      expect(stats).toHaveProperty('xpOrbCount');
      expect(stats).toHaveProperty('worldEventCount');
      expect(stats).toHaveProperty('powerUpCount');
      expect(stats).toHaveProperty('gameTime');
      expect(stats).toHaveProperty('currentWave');
      expect(stats).toHaveProperty('worldRadius');
      expect(stats).toHaveProperty('inputMetrics');
      expect(stats).toHaveProperty('spawnMetrics');
      expect(stats).toHaveProperty('combatMetrics');
      expect(stats).toHaveProperty('xpMetrics');
      expect(stats).toHaveProperty('worldEventMetrics');
      expect(stats).toHaveProperty('powerUpMetrics');
    });

    it('should reflect actual entity counts', () => {
      room.onCreate({});
      const client = createMockClient();
      room.onJoin(client, {});

      // Add some entities
      room.state.addEnemy('bat', 0, 0);
      room.state.addEnemy('skeleton', 10, 10);
      room.state.addXPOrb(5, 5, 5);

      const stats = room.getRoomStats();

      expect(stats.playerCount).toBe(1);
      expect(stats.enemyCount).toBe(2);
      expect(stats.xpOrbCount).toBe(1);
    });
  });

  describe('trade system (P4.6)', () => {
    describe('trade offer validation', () => {
      it('should reject trade when sender is dead', () => {
        const sender = createMockClient();
        const receiver = createMockClient();
        room.onJoin(sender, {});
        room.onJoin(receiver, {});
        room.addMockClient(sender);
      room.addMockClient(receiver);

        const senderPlayer = room.state.players.get(sender.sessionId);
        senderPlayer!.dead = true;
        senderPlayer!.addWeapon('fireball');

        (room as any).handleTradeOfferMessage(sender, {
          targetPlayerId: receiver.sessionId,
          weaponType: 'fireball',
        });

        expect(sender.send).toHaveBeenCalledWith('trade_failed', { reason: 'sender_invalid' });
      });

      it('should reject trade when sender is on cooldown', () => {
        const sender = createMockClient();
        const receiver = createMockClient();
        room.onJoin(sender, {});
        room.onJoin(receiver, {});
        room.addMockClient(sender);
      room.addMockClient(receiver);

        const senderPlayer = room.state.players.get(sender.sessionId);
        senderPlayer!.tradeCooldown = 5;
        senderPlayer!.addWeapon('fireball');

        (room as any).handleTradeOfferMessage(sender, {
          targetPlayerId: receiver.sessionId,
          weaponType: 'fireball',
        });

        expect(sender.send).toHaveBeenCalledWith('trade_failed', expect.objectContaining({
          reason: 'cooldown',
        }));
      });

      it('should reject trade when players are out of range', () => {
        const sender = createMockClient();
        const receiver = createMockClient();
        room.onJoin(sender, {});
        room.onJoin(receiver, {});
        room.addMockClient(sender);
      room.addMockClient(receiver);

        const senderPlayer = room.state.players.get(sender.sessionId);
        const receiverPlayer = room.state.players.get(receiver.sessionId);
        senderPlayer!.addWeapon('fireball');
        senderPlayer!.x = 0;
        senderPlayer!.y = 0;
        receiverPlayer!.x = GAME_CONSTANTS.TRADE_RADIUS + 10;
        receiverPlayer!.y = 0;

        (room as any).handleTradeOfferMessage(sender, {
          targetPlayerId: receiver.sessionId,
          weaponType: 'fireball',
        });

        expect(sender.send).toHaveBeenCalledWith('trade_failed', expect.objectContaining({
          reason: 'out_of_range',
        }));
      });

      it('should reject trade when sender doesnt own weapon', () => {
        const sender = createMockClient();
        const receiver = createMockClient();
        room.onJoin(sender, {});
        room.onJoin(receiver, {});
        room.addMockClient(sender);
        room.addMockClient(receiver);

        const senderPlayer = room.state.players.get(sender.sessionId);
        const receiverPlayer = room.state.players.get(receiver.sessionId);
        senderPlayer!.x = 0;
        senderPlayer!.y = 0;
        receiverPlayer!.x = 1;
        receiverPlayer!.y = 0;

        // Clear all weapons and add specific ones (knife and wand) so we know fireball isn't owned
        while (senderPlayer!.weapons.length > 0) {
          senderPlayer!.weapons.pop();
        }
        senderPlayer!.addWeapon('knife');
        senderPlayer!.addWeapon('wand');

        (room as any).handleTradeOfferMessage(sender, {
          targetPlayerId: receiver.sessionId,
          weaponType: 'fireball', // Sender definitely doesn't have this now
        });

        expect(sender.send).toHaveBeenCalledWith('trade_failed', { reason: 'weapon_not_owned' });
      });

      it('should reject trade of last weapon', () => {
        const sender = createMockClient();
        const receiver = createMockClient();
        room.onJoin(sender, {});
        room.onJoin(receiver, {});
        room.addMockClient(sender);
        room.addMockClient(receiver);

        const senderPlayer = room.state.players.get(sender.sessionId);
        const receiverPlayer = room.state.players.get(receiver.sessionId);
        senderPlayer!.x = 0;
        senderPlayer!.y = 0;
        receiverPlayer!.x = 1;
        receiverPlayer!.y = 0;

        // Remove all weapons except one (use a specific weapon we know exists)
        // Clear weapons and add just one
        while (senderPlayer!.weapons.length > 0) {
          senderPlayer!.weapons.pop();
        }
        senderPlayer!.addWeapon('knife');
        const lastWeaponType = 'knife';

        (room as any).handleTradeOfferMessage(sender, {
          targetPlayerId: receiver.sessionId,
          weaponType: lastWeaponType,
        });

        expect(sender.send).toHaveBeenCalledWith('trade_failed', { reason: 'cannot_trade_last_weapon' });
      });
    });
  });
});
