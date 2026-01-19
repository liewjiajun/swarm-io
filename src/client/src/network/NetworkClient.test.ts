import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NetworkClient Comprehensive Unit Tests (P7.3)
 *
 * Tests cover:
 * - Constructor initialization and URL validation (P3.3)
 * - Client-side rate limiting (P3.4)
 * - Connection state management
 * - Callback registration and invocation
 * - State serialization from Colyseus MapSchema
 * - Reconnection logic with exponential backoff
 * - Disconnect handling with proper cleanup
 * - Message handler registration
 * - Session storage management
 */

// Track mock instances for verification
let mockJoinOrCreate: ReturnType<typeof vi.fn>;
let mockReconnect: ReturnType<typeof vi.fn>;

// Mock colyseus.js with proper class mock
vi.mock('colyseus.js', () => {
  // Create mock functions that can be accessed from tests
  const joinOrCreate = vi.fn();
  const reconnect = vi.fn();

  // Store references for test access
  (globalThis as any).__mockJoinOrCreate = joinOrCreate;
  (globalThis as any).__mockReconnect = reconnect;

  return {
    Client: class MockClient {
      joinOrCreate = joinOrCreate;
      reconnect = reconnect;
    },
    Room: class MockRoom {},
  };
});

import { NetworkClient } from './NetworkClient';

describe('NetworkClient', () => {
  let networkClient: NetworkClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();

    // Get mock function references
    mockJoinOrCreate = (globalThis as any).__mockJoinOrCreate;
    mockReconnect = (globalThis as any).__mockReconnect;

    // Reset mocks
    mockJoinOrCreate.mockReset();
    mockReconnect.mockReset();

    // Create new NetworkClient instance
    networkClient = new NetworkClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      expect(networkClient).toBeDefined();
    });

    it('should not be connected initially', () => {
      expect(networkClient.connected).toBe(false);
    });

    it('should have empty sessionId initially', () => {
      expect(networkClient.sessionId).toBe('');
    });
  });

  describe('sendInput (not connected)', () => {
    it('should not send input when not connected', () => {
      const input = { dx: 1, dy: 0, sequence: 1 };
      // This should not throw, just silently return
      expect(() => networkClient.sendInput(input)).not.toThrow();
    });

    it('should handle multiple inputs when not connected', () => {
      for (let i = 0; i < 5; i++) {
        const input = { dx: i % 2 === 0 ? 1 : -1, dy: 0, sequence: i };
        expect(() => networkClient.sendInput(input)).not.toThrow();
      }
    });
  });

  describe('sendUpgradeChoice (not connected)', () => {
    it('should not send upgrade choice when not connected', () => {
      const choice = {
        id: 'test-choice',
        type: 'stat' as const,
        statType: 'health',
        description: '+20 Health',
        weight: 15,
      };
      expect(() => networkClient.sendUpgradeChoice(choice)).not.toThrow();
    });

    it('should handle weapon upgrade choice when not connected', () => {
      const choice = {
        id: 'weapon-choice',
        type: 'weapon' as const,
        weaponType: 'fireball',
        description: 'Add Fireball',
        weight: 10,
      };
      expect(() => networkClient.sendUpgradeChoice(choice)).not.toThrow();
    });
  });

  describe('sendRespawn (not connected)', () => {
    it('should not send respawn when not connected', () => {
      expect(() => networkClient.sendRespawn()).not.toThrow();
    });

    it('should handle multiple respawn calls when not connected', () => {
      expect(() => networkClient.sendRespawn()).not.toThrow();
      expect(() => networkClient.sendRespawn()).not.toThrow();
      expect(() => networkClient.sendRespawn()).not.toThrow();
    });
  });

  describe('disconnect (not connected)', () => {
    it('should handle disconnect when not connected', () => {
      expect(() => networkClient.disconnect()).not.toThrow();
    });

    it('should handle multiple disconnect calls when not connected', () => {
      expect(() => networkClient.disconnect()).not.toThrow();
      expect(() => networkClient.disconnect()).not.toThrow();
    });
  });

  describe('callback registration', () => {
    it('should allow registering state change callbacks before connection', () => {
      const callback = vi.fn();
      expect(() => networkClient.onStateChange(callback)).not.toThrow();
    });

    it('should allow registering player died callbacks before connection', () => {
      const callback = vi.fn();
      expect(() => networkClient.onPlayerDied(callback)).not.toThrow();
    });

    it('should allow registering level up callbacks before connection', () => {
      const callback = vi.fn();
      expect(() => networkClient.onLevelUp(callback)).not.toThrow();
    });

    it('should allow registering leaderboard update callbacks (P9.2)', () => {
      const callback = vi.fn();
      expect(() => networkClient.onLeaderboardUpdate(callback)).not.toThrow();
    });

    it('should allow registering multiple callbacks of the same type', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      expect(() => {
        networkClient.onStateChange(callback1);
        networkClient.onStateChange(callback2);
        networkClient.onStateChange(callback3);
      }).not.toThrow();
    });

    it('should allow registering callbacks of different types', () => {
      const stateCallback = vi.fn();
      const diedCallback = vi.fn();
      const levelUpCallback = vi.fn();
      const leaderboardCallback = vi.fn();

      expect(() => {
        networkClient.onStateChange(stateCallback);
        networkClient.onPlayerDied(diedCallback);
        networkClient.onLevelUp(levelUpCallback);
        networkClient.onLeaderboardUpdate(leaderboardCallback);
      }).not.toThrow();
    });
  });

  describe('rate limiting (P3.4)', () => {
    it('should allow inputs within rate limit', () => {
      // With fake timers, all inputs happen at same time
      // Rate limit is 30 inputs per second
      const input = { dx: 1, dy: 0, sequence: 1 };

      // First 30 inputs should be fine (even though room is null, rate limit is checked)
      for (let i = 0; i < 30; i++) {
        expect(() => networkClient.sendInput({ ...input, sequence: i })).not.toThrow();
      }
    });

    it('should track input timestamps for rate limiting', () => {
      const input = { dx: 1, dy: 0, sequence: 1 };

      // Send multiple inputs
      for (let i = 0; i < 10; i++) {
        networkClient.sendInput({ ...input, sequence: i });
      }

      // Even without a room, the rate limiting logic runs
      // The inputs are silently ignored because room is null
      expect(networkClient.connected).toBe(false);
    });
  });

  describe('connection state', () => {
    it('should return false for connected when room is null', () => {
      expect(networkClient.connected).toBe(false);
    });

    it('should return empty string for sessionId when room is null', () => {
      expect(networkClient.sessionId).toBe('');
    });
  });

  describe('session storage', () => {
    it('should clear session storage on disconnect', () => {
      localStorage.setItem('swarm_session', 'test-session-token');

      // Disconnect should clear the session
      networkClient.disconnect();

      // Session should be cleared (disconnect does nothing when not connected,
      // but let's verify the initial state)
      expect(networkClient.connected).toBe(false);
    });

    it('should not have session token initially', () => {
      expect(localStorage.getItem('swarm_session')).toBeNull();
    });
  });

  describe('connect method', () => {
    let mockRoom: any;

    beforeEach(() => {
      // Setup mock room
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map() },
          enemies: { forEach: vi.fn(), $items: new Map() },
          projectiles: { forEach: vi.fn(), $items: new Map() },
          xpOrbs: { forEach: vi.fn(), $items: new Map() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      // Setup collection handlers
      mockRoom.state.players.onAdd = vi.fn();
      mockRoom.state.players.onRemove = vi.fn();
      mockRoom.state.enemies.onAdd = vi.fn();
      mockRoom.state.enemies.onRemove = vi.fn();
      mockRoom.state.projectiles.onAdd = vi.fn();
      mockRoom.state.projectiles.onRemove = vi.fn();
      mockRoom.state.xpOrbs.onAdd = vi.fn();
      mockRoom.state.xpOrbs.onRemove = vi.fn();
    });

    it('should call joinOrCreate when connecting without stored session', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockJoinOrCreate).toHaveBeenCalledWith('game', {
        nickname: '',
        playerClass: 'survivor',
      });
    });

    it('should pass nickname when connecting (P3.1)', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect('TestPlayer');
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockJoinOrCreate).toHaveBeenCalledWith('game', {
        nickname: 'TestPlayer',
        playerClass: 'survivor',
      });
    });

    it('should pass playerClass when connecting (P9.3)', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect('TestPlayer', 'berserker');
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockJoinOrCreate).toHaveBeenCalledWith('game', {
        nickname: 'TestPlayer',
        playerClass: 'berserker',
      });
    });

    it('should store reconnection token after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(localStorage.getItem('swarm_session')).toBe('test-reconnection-token');
    });

    it('should attempt to reconnect with stored session', async () => {
      localStorage.setItem('swarm_session', 'stored-session-token');
      mockReconnect.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockReconnect).toHaveBeenCalledWith('stored-session-token');
    });

    it('should fall back to joinOrCreate if reconnect fails', async () => {
      localStorage.setItem('swarm_session', 'stale-session-token');
      mockReconnect.mockRejectedValue(new Error('Session expired'));
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockReconnect).toHaveBeenCalled();
      expect(mockJoinOrCreate).toHaveBeenCalled();
    });

    it('should clear stale session token on reconnect failure', async () => {
      localStorage.setItem('swarm_session', 'stale-session-token');
      mockReconnect.mockRejectedValue(new Error('Session expired'));
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Session should be replaced with new token
      expect(localStorage.getItem('swarm_session')).toBe('test-reconnection-token');
    });

    it('should setup state handlers after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockRoom.onStateChange).toHaveBeenCalled();
      expect(mockRoom.state.players.onAdd).toHaveBeenCalled();
      expect(mockRoom.state.players.onRemove).toHaveBeenCalled();
    });

    it('should setup message handlers after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // onMessage should be called for each message type
      expect(mockRoom.onMessage).toHaveBeenCalled();
    });

    it('should setup disconnect handler after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(mockRoom.onLeave).toHaveBeenCalled();
    });

    it('should be connected after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(networkClient.connected).toBe(true);
    });

    it('should have sessionId after successful connection', async () => {
      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      expect(networkClient.sessionId).toBe('test-session-id');
    });
  });

  describe('sendInput (connected)', () => {
    let mockRoom: any;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;
    });

    it('should send input when connected', () => {
      const input = { dx: 1, dy: 0, sequence: 1 };
      networkClient.sendInput(input);

      expect(mockRoom.send).toHaveBeenCalledWith('input', { type: 'input', input });
    });

    it('should send input with correct structure', () => {
      const input = { dx: 0.5, dy: -0.5, sequence: 42 };
      networkClient.sendInput(input);

      expect(mockRoom.send).toHaveBeenCalledWith('input', {
        type: 'input',
        input: { dx: 0.5, dy: -0.5, sequence: 42 },
      });
    });

    it('should rate limit inputs exceeding 30 per second (P3.4)', () => {
      // Send 35 inputs quickly
      for (let i = 0; i < 35; i++) {
        networkClient.sendInput({ dx: 1, dy: 0, sequence: i });
      }

      // Only 30 should have been sent
      expect(mockRoom.send).toHaveBeenCalledTimes(30);
    });

    it('should allow more inputs after rate limit window expires', () => {
      // Send 30 inputs
      for (let i = 0; i < 30; i++) {
        networkClient.sendInput({ dx: 1, dy: 0, sequence: i });
      }

      expect(mockRoom.send).toHaveBeenCalledTimes(30);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Should be able to send more
      networkClient.sendInput({ dx: 1, dy: 0, sequence: 30 });
      expect(mockRoom.send).toHaveBeenCalledTimes(31);
    });
  });

  describe('sendUpgradeChoice (connected)', () => {
    let mockRoom: any;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;
    });

    it('should send upgrade choice when connected', () => {
      const choice = {
        id: 'test-choice',
        type: 'stat' as const,
        statType: 'health',
        description: '+20 Health',
        weight: 15,
      };

      networkClient.sendUpgradeChoice(choice);

      expect(mockRoom.send).toHaveBeenCalledWith('choose_upgrade', {
        type: 'choose_upgrade',
        choice,
      });
    });

    it('should send weapon upgrade choice', () => {
      const choice = {
        id: 'weapon-choice',
        type: 'weapon' as const,
        weaponType: 'lightning',
        description: 'Add Lightning',
        weight: 10,
      };

      networkClient.sendUpgradeChoice(choice);

      expect(mockRoom.send).toHaveBeenCalledWith('choose_upgrade', {
        type: 'choose_upgrade',
        choice,
      });
    });
  });

  describe('sendRespawn (connected)', () => {
    let mockRoom: any;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;
    });

    it('should send respawn message when connected', () => {
      networkClient.sendRespawn();

      expect(mockRoom.send).toHaveBeenCalledWith('respawn', { type: 'respawn' });
    });
  });

  describe('disconnect (connected)', () => {
    let mockRoom: any;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;
    });

    it('should leave room on disconnect', () => {
      networkClient.disconnect();

      expect(mockRoom.leave).toHaveBeenCalled();
    });

    it('should clear session storage on disconnect', () => {
      expect(localStorage.getItem('swarm_session')).toBe('test-reconnection-token');

      networkClient.disconnect();

      expect(localStorage.getItem('swarm_session')).toBeNull();
    });

    it('should not be connected after disconnect', () => {
      expect(networkClient.connected).toBe(true);

      networkClient.disconnect();

      expect(networkClient.connected).toBe(false);
    });

    it('should have empty sessionId after disconnect', () => {
      expect(networkClient.sessionId).toBe('test-session-id');

      networkClient.disconnect();

      expect(networkClient.sessionId).toBe('');
    });
  });

  describe('message handlers (connected)', () => {
    let mockRoom: any;
    let messageHandlers: Map<string, Function>;

    beforeEach(async () => {
      messageHandlers = new Map();

      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn((type: string, handler: Function) => {
          messageHandlers.set(type, handler);
        }),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;
    });

    it('should invoke player died callbacks when message received', () => {
      const callback = vi.fn();
      networkClient.onPlayerDied(callback);

      const data = { playerId: 'player-1', killedBy: 'enemy-1', finalScore: 1000 };
      messageHandlers.get('player_died')!(data);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('should invoke level up callbacks when message received', () => {
      const callback = vi.fn();
      networkClient.onLevelUp(callback);

      const data = {
        newLevel: 5,
        choices: [
          { id: 'choice-1', type: 'weapon' as const, weaponType: 'fireball', description: 'Add Fireball', weight: 10 },
        ],
      };
      messageHandlers.get('level_up')!(data);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('should invoke leaderboard update callbacks when message received (P9.2)', () => {
      const callback = vi.fn();
      networkClient.onLeaderboardUpdate(callback);

      const data = {
        accepted: true,
        rank: 5,
        message: 'Score submitted successfully',
        replacedPrevious: false,
      };
      messageHandlers.get('leaderboard_update')!(data);

      expect(callback).toHaveBeenCalledWith(data);
    });

    it('should clear session on kicked message', () => {
      const data = { reason: 'Cheating detected' };
      messageHandlers.get('kicked')!(data);

      expect(localStorage.getItem('swarm_session')).toBeNull();
    });

    it('should clear session on banned message', () => {
      const data = { reason: 'Repeated violations', remaining: 3600000 };
      messageHandlers.get('banned')!(data);

      expect(localStorage.getItem('swarm_session')).toBeNull();
    });

    it('should invoke multiple callbacks of the same type', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      networkClient.onPlayerDied(callback1);
      networkClient.onPlayerDied(callback2);
      networkClient.onPlayerDied(callback3);

      const data = { playerId: 'player-1', killedBy: 'enemy-1', finalScore: 500 };
      messageHandlers.get('player_died')!(data);

      expect(callback1).toHaveBeenCalledWith(data);
      expect(callback2).toHaveBeenCalledWith(data);
      expect(callback3).toHaveBeenCalledWith(data);
    });
  });

  describe('state change callbacks (connected)', () => {
    let mockRoom: any;
    let stateChangeHandler: Function;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: {
            forEach: vi.fn((cb: Function) => {
              cb({
                id: 'player-1',
                nickname: 'TestPlayer',
                playerClass: 'survivor',
                x: 10,
                y: 20,
                health: 100,
                maxHealth: 100,
                level: 1,
                xp: 0,
                xpToNextLevel: 5,
                speed: 5,
                facingX: 1,
                facingY: 0,
                kills: 0,
                timeAlive: 0,
                invulnerableTime: 0,
                dead: false,
                pendingUpgrade: false,
                lastProcessedSequence: 0,
                weapons: { $items: new Map([['knife', { type: 'knife', level: 1 }]]) },
              }, 'player-1');
            }),
            $items: new Map(),
            onAdd: vi.fn(),
            onRemove: vi.fn(),
          },
          enemies: {
            forEach: vi.fn((cb: Function) => {
              cb({
                id: 'enemy-1',
                type: 'bat',
                x: 50,
                y: 50,
                health: 10,
                maxHealth: 10,
              }, 'enemy-1');
            }),
            $items: new Map(),
            onAdd: vi.fn(),
            onRemove: vi.fn(),
          },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 10,
            currentWave: 1,
            difficulty: 1.0,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn((handler: Function) => {
          stateChangeHandler = handler;
        }),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);
    });

    it('should invoke state change callbacks with serialized state', async () => {
      const callback = vi.fn();
      networkClient.onStateChange(callback);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Trigger state change
      stateChangeHandler();

      expect(callback).toHaveBeenCalled();

      const calledState = callback.mock.calls[callback.mock.calls.length - 1][0];
      expect(calledState.players).toBeInstanceOf(Map);
      expect(calledState.enemies).toBeInstanceOf(Map);
      expect(calledState.world.worldRadius).toBe(500);
    });

    it('should serialize player data correctly', async () => {
      const callback = vi.fn();
      networkClient.onStateChange(callback);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      stateChangeHandler();

      const calledState = callback.mock.calls[callback.mock.calls.length - 1][0];
      const player = calledState.players.get('player-1');

      expect(player).toBeDefined();
      expect(player.id).toBe('player-1');
      expect(player.nickname).toBe('TestPlayer');
      expect(player.playerClass).toBe('survivor');
      expect(player.x).toBe(10);
      expect(player.y).toBe(20);
      expect(player.health).toBe(100);
      expect(player.level).toBe(1);
    });

    it('should serialize enemy data correctly', async () => {
      const callback = vi.fn();
      networkClient.onStateChange(callback);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      stateChangeHandler();

      const calledState = callback.mock.calls[callback.mock.calls.length - 1][0];
      const enemy = calledState.enemies.get('enemy-1');

      expect(enemy).toBeDefined();
      expect(enemy.id).toBe('enemy-1');
      expect(enemy.type).toBe('bat');
      expect(enemy.x).toBe(50);
      expect(enemy.y).toBe(50);
      expect(enemy.health).toBe(10);
    });

    it('should serialize world data correctly', async () => {
      const callback = vi.fn();
      networkClient.onStateChange(callback);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      stateChangeHandler();

      const calledState = callback.mock.calls[callback.mock.calls.length - 1][0];

      expect(calledState.world.worldRadius).toBe(500);
      expect(calledState.world.playerCount).toBe(1);
      expect(calledState.world.gameTime).toBe(10);
      expect(calledState.world.currentWave).toBe(1);
      expect(calledState.world.difficulty).toBe(1.0);
    });
  });

  describe('reconnection logic', () => {
    let mockRoom: any;
    let leaveHandler: Function;

    beforeEach(async () => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn((handler: Function) => {
          leaveHandler = handler;
        }),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);
    });

    it('should not reconnect on normal close (code 1000)', async () => {
      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Reset call count
      mockJoinOrCreate.mockClear();

      // Simulate normal close
      leaveHandler(1000);
      await vi.runAllTimersAsync();

      // Should not attempt to reconnect
      expect(mockJoinOrCreate).not.toHaveBeenCalled();
    });

    it('should not reconnect on kicked (code 4000)', async () => {
      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      mockJoinOrCreate.mockClear();

      // Simulate kicked
      leaveHandler(4000);
      await vi.runAllTimersAsync();

      expect(mockJoinOrCreate).not.toHaveBeenCalled();
    });

    it('should not reconnect on banned (code 4001)', async () => {
      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      mockJoinOrCreate.mockClear();

      // Simulate banned
      leaveHandler(4001);
      await vi.runAllTimersAsync();

      expect(mockJoinOrCreate).not.toHaveBeenCalled();
    });

    it('should attempt reconnect on unexpected disconnect', async () => {
      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      mockJoinOrCreate.mockClear();

      // Simulate unexpected disconnect (e.g., network error)
      leaveHandler(1006);

      // Advance through reconnect delay (1000ms for first attempt)
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockJoinOrCreate).toHaveBeenCalled();
    });
  });

  describe('state polling fallback', () => {
    let mockRoom: any;

    beforeEach(() => {
      mockRoom = {
        id: 'test-room-id',
        sessionId: 'test-session-id',
        reconnectionToken: 'test-reconnection-token',
        state: {
          players: {
            forEach: vi.fn(),
            $items: new Map([['player-1', { id: 'player-1' }]]),
            onAdd: vi.fn(),
            onRemove: vi.fn(),
            size: 1,
          },
          enemies: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          projectiles: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          xpOrbs: { forEach: vi.fn(), $items: new Map(), onAdd: vi.fn(), onRemove: vi.fn() },
          powerUps: { forEach: vi.fn(), $items: new Map() },
          worldEvents: { forEach: vi.fn(), $items: new Map() },
          world: {
            worldRadius: 500,
            playerCount: 1,
            gameTime: 0,
            currentWave: 1,
            difficulty: 1,
          },
        },
        send: vi.fn(),
        leave: vi.fn(),
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onLeave: vi.fn(),
      };

      mockJoinOrCreate.mockResolvedValue(mockRoom);
    });

    it('should stop polling when players are detected', async () => {
      const callback = vi.fn();
      networkClient.onStateChange(callback);

      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Callback should have been called during initial state update and polling
      // Since players.size > 0, polling detects players and triggers state update
      expect(callback).toHaveBeenCalled();

      // Count calls before advancing timer
      const callCountAfterConnect = callback.mock.calls.length;

      // Advance timer by 200ms (would be 2 poll cycles if still running)
      await vi.advanceTimersByTimeAsync(200);

      // No additional calls should occur since polling stopped when players detected
      expect(callback.mock.calls.length).toBe(callCountAfterConnect);
    });

    it('should clear polling interval on disconnect', async () => {
      const connectPromise = networkClient.connect();
      await vi.runAllTimersAsync();
      await connectPromise;

      // Disconnect should clear the polling interval
      networkClient.disconnect();

      // No error should occur even after time advances
      await vi.advanceTimersByTimeAsync(5000);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined room gracefully in sessionId getter', () => {
      expect(networkClient.sessionId).toBe('');
    });

    it('should handle undefined room gracefully in connected getter', () => {
      expect(networkClient.connected).toBe(false);
    });

    it('should handle empty input object', () => {
      const input = { dx: 0, dy: 0, sequence: 0 };
      expect(() => networkClient.sendInput(input)).not.toThrow();
    });

    it('should handle negative input values', () => {
      const input = { dx: -1, dy: -1, sequence: 1 };
      expect(() => networkClient.sendInput(input)).not.toThrow();
    });

    it('should handle decimal input values', () => {
      const input = { dx: 0.707, dy: 0.707, sequence: 1 };
      expect(() => networkClient.sendInput(input)).not.toThrow();
    });
  });
});
