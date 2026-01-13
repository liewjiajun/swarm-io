import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NetworkClient Unit Tests
 *
 * Note: The NetworkClient is tightly coupled with Colyseus and has complex async
 * state management (polling intervals, MapSchema iterations, WebSocket connections).
 * Full testing of connection, state synchronization, and message handling requires
 * integration tests with a real Colyseus server.
 *
 * These unit tests focus on behavior that can be reliably tested without a server:
 * - Constructor initialization
 * - Initial state (not connected, no session)
 * - Methods that check connection state before acting
 */

// Mock colyseus.js
vi.mock('colyseus.js', () => ({
  Client: class MockClient {
    joinOrCreate = vi.fn();
    reconnect = vi.fn();
  },
  Room: class MockRoom {},
}));

import { NetworkClient } from './NetworkClient';

describe('NetworkClient', () => {
  let networkClient: NetworkClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    networkClient = new NetworkClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
  });

  describe('sendRespawn (not connected)', () => {
    it('should not send respawn when not connected', () => {
      expect(() => networkClient.sendRespawn()).not.toThrow();
    });
  });

  describe('disconnect (not connected)', () => {
    it('should handle disconnect when not connected', () => {
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
  });
});
