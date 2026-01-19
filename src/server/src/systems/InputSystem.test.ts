import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InputSystem } from './InputSystem.js';
import type { PlayerInput } from '@swarm-io/shared';

// Unique player ID counter for test isolation
let playerIdCounter = 0;
let currentTime = 0;

// Helper to advance time and update Date.now mock
function advanceTime(ms: number) {
  currentTime += ms;
  vi.setSystemTime(new Date(currentTime));
}

// Mock PlayerSchema for testing
function createMockPlayer(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  speed: number;
  dead: boolean;
  pendingUpgrade: boolean;
  facingX: number;
  facingY: number;
}> = {}) {
  return {
    id: overrides.id ?? `player-${++playerIdCounter}`,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    speed: overrides.speed ?? 5,
    dead: overrides.dead ?? false,
    pendingUpgrade: overrides.pendingUpgrade ?? false,
    facingX: overrides.facingX ?? 1,
    facingY: overrides.facingY ?? 0,
  } as any;
}

function createValidInput(sequence: number, dx = 1, dy = 0): PlayerInput {
  return { dx, dy, sequence };
}

describe('InputSystem', () => {
  let inputSystem: InputSystem;
  const dt = 0.016; // ~60fps delta time

  beforeEach(() => {
    inputSystem = new InputSystem();
    vi.useFakeTimers();
    // Reset time to a known value
    currentTime = Date.parse('2026-01-13T00:00:00.000Z');
    vi.setSystemTime(new Date(currentTime));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processInput', () => {
    it('should process valid input and update player position', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, 1, 0);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(true);
      expect(player.x).toBeGreaterThan(0);
    });

    it('should reject input for dead players', () => {
      const player = createMockPlayer({ dead: true });
      const input = createValidInput(1);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    // BUG-050 FIX: Players should be able to move during pending upgrades
    // Per Game Design Principles: Player has FULL movement control during upgrade modal
    it('should ACCEPT input for players with pending upgrades (BUG-050 fix)', () => {
      const player = createMockPlayer({ pendingUpgrade: true });
      const input = createValidInput(1, 1, 0); // Moving right

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(true); // Input should be processed
      expect(player.x).toBeGreaterThan(0); // Player should have moved
    });

    it('should update facing direction when moving', () => {
      const player = createMockPlayer({ facingX: 1, facingY: 0 });
      const input = createValidInput(1, 0, 1); // Moving down

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      expect(player.facingX).toBe(0);
      expect(player.facingY).toBe(1);
    });

    it('should not update facing when not moving', () => {
      const player = createMockPlayer({ facingX: 1, facingY: 0 });
      const input = createValidInput(1, 0, 0); // Not moving

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      expect(player.facingX).toBe(1);
      expect(player.facingY).toBe(0);
    });

    it('should normalize facing direction', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, 1, 1); // Diagonal movement

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      const length = Math.sqrt(player.facingX ** 2 + player.facingY ** 2);
      expect(length).toBeCloseTo(1, 5);
    });
  });

  describe('input structure validation', () => {
    it('should reject null input', () => {
      const player = createMockPlayer();

      advanceTime(50);
      const result = inputSystem.processInput(player, null as any, dt);

      expect(result).toBe(false);
    });

    it('should reject non-object input', () => {
      const player = createMockPlayer();

      advanceTime(50);
      const result = inputSystem.processInput(player, 'invalid' as any, dt);

      expect(result).toBe(false);
    });

    it('should reject input with non-number dx', () => {
      const player = createMockPlayer();
      const input = { dx: 'invalid', dy: 0, sequence: 1 } as any;

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject input with non-number dy', () => {
      const player = createMockPlayer();
      const input = { dx: 0, dy: 'invalid', sequence: 1 } as any;

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject input with non-integer sequence', () => {
      const player = createMockPlayer();
      const input = { dx: 0, dy: 0, sequence: 1.5 } as any;

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject input with NaN values', () => {
      const player = createMockPlayer();
      const input = { dx: NaN, dy: 0, sequence: 1 };

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject input with Infinity values', () => {
      const player = createMockPlayer();
      const input = { dx: Infinity, dy: 0, sequence: 1 };

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });
  });

  describe('input bounds validation', () => {
    it('should reject dx below -1', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, -1.1, 0);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject dx above 1', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, 1.1, 0);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject dy below -1', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, 0, -1.1);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject dy above 1', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, 0, 1.1);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should accept values at boundaries', () => {
      const player = createMockPlayer();
      const input = createValidInput(1, -1, 1);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(true);
    });
  });

  describe('sequence validation (replay attack prevention)', () => {
    it('should reject negative sequence numbers', () => {
      const player = createMockPlayer();
      const input = createValidInput(-1, 0, 0);

      advanceTime(50);
      const result = inputSystem.processInput(player, input, dt);

      expect(result).toBe(false);
    });

    it('should reject repeated sequence numbers (replay attack)', () => {
      const player = createMockPlayer();
      const input1 = createValidInput(1);
      const input2 = createValidInput(1); // Same sequence

      advanceTime(50);
      inputSystem.processInput(player, input1, dt);
      advanceTime(50);
      const result = inputSystem.processInput(player, input2, dt);

      expect(result).toBe(false);
    });

    it('should reject lower sequence numbers (replay attack)', () => {
      const player = createMockPlayer();
      const input1 = createValidInput(10);
      const input2 = createValidInput(5); // Lower sequence

      advanceTime(50);
      inputSystem.processInput(player, input1, dt);
      advanceTime(50);
      const result = inputSystem.processInput(player, input2, dt);

      expect(result).toBe(false);
    });

    it('should reject huge sequence jumps', () => {
      const player = createMockPlayer();
      const input1 = createValidInput(1);
      const input2 = createValidInput(200); // Jump > MAX_SEQUENCE_JUMP (100)

      advanceTime(50);
      inputSystem.processInput(player, input1, dt);
      advanceTime(50);
      const result = inputSystem.processInput(player, input2, dt);

      expect(result).toBe(false);
    });

    it('should accept incrementing sequence numbers', () => {
      const player = createMockPlayer();

      for (let i = 1; i <= 30; i++) {  // Reduced to stay within rate limit
        advanceTime(50);
        const result = inputSystem.processInput(player, createValidInput(i), dt);
        expect(result).toBe(true);
      }
    });

    it('should track last processed sequence', () => {
      const player = createMockPlayer();

      advanceTime(50);
      inputSystem.processInput(player, createValidInput(5), dt);

      expect(inputSystem.getLastProcessedSequence(player.id)).toBe(5);
    });
  });

  describe('rate limiting', () => {
    it('should allow inputs within rate limit', () => {
      const player = createMockPlayer();

      // 30 inputs in 1 second should be allowed
      for (let i = 1; i <= 30; i++) {
        advanceTime(33); // ~33ms apart
        const result = inputSystem.processInput(player, createValidInput(i), dt);
        expect(result).toBe(true);
      }
    });

    it('should reject inputs exceeding rate limit', () => {
      const player = createMockPlayer();

      // Send 31+ inputs rapidly
      for (let i = 1; i <= 35; i++) {
        advanceTime(10);
        inputSystem.processInput(player, createValidInput(i), dt);
      }

      // Check metrics show rate limit violations
      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.rateLimitViolations).toBeGreaterThan(0);
    });

    it('should reset rate limit after window expires', () => {
      const player = createMockPlayer();

      // Exceed rate limit
      for (let i = 1; i <= 40; i++) {
        advanceTime(10);
        inputSystem.processInput(player, createValidInput(i), dt);
      }

      // Wait for rate limit window to reset
      advanceTime(1000);

      // New inputs should be accepted
      const result = inputSystem.processInput(player, createValidInput(41), dt);
      expect(result).toBe(true);
    });

    it('should reject multiple inputs in same millisecond (spam detection)', () => {
      const player = createMockPlayer();

      // Send two inputs at exact same time
      inputSystem.processInput(player, createValidInput(1), dt);
      const result = inputSystem.processInput(player, createValidInput(2), dt);

      expect(result).toBe(false);
    });
  });

  describe('kick mechanism', () => {
    it('should call kick callback after MAX_VIOLATIONS_BEFORE_KICK', () => {
      const player = createMockPlayer();
      const kickCallback = vi.fn();
      inputSystem.setKickCallback(kickCallback);

      // Trigger 5+ violations by exceeding rate limit repeatedly
      for (let window = 0; window < 6; window++) {
        for (let i = 0; i < 40; i++) {
          advanceTime(10);
          inputSystem.processInput(player, createValidInput(window * 40 + i + 1), dt);
        }
        // Reset rate limit window but keep violations
        advanceTime(1000);
      }

      expect(kickCallback).toHaveBeenCalledWith(
        player.id,
        expect.stringContaining('Rate limit violations exceeded')
      );
    });

    it('should increment playersKicked metric when kick is triggered', () => {
      const player = createMockPlayer();
      const kickCallback = vi.fn();
      inputSystem.setKickCallback(kickCallback);

      // Trigger multiple violations
      for (let window = 0; window < 6; window++) {
        for (let i = 0; i < 40; i++) {
          advanceTime(10);
          inputSystem.processInput(player, createValidInput(window * 40 + i + 1), dt);
        }
        advanceTime(1000);
      }

      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.playersKicked).toBeGreaterThan(0);
    });
  });

  describe('cleanupPlayer', () => {
    it('should remove player rate tracking data', () => {
      const player = createMockPlayer();

      // Process some input to create rate tracking
      advanceTime(50);
      inputSystem.processInput(player, createValidInput(1), dt);
      expect(inputSystem.getPlayerRateInfo(player.id)).not.toBeNull();

      // Cleanup
      inputSystem.cleanupPlayer(player.id);

      expect(inputSystem.getPlayerRateInfo(player.id)).toBeNull();
    });

    it('should remove player sequence tracking', () => {
      const player = createMockPlayer();

      advanceTime(50);
      inputSystem.processInput(player, createValidInput(5), dt);
      expect(inputSystem.getLastProcessedSequence(player.id)).toBe(5);

      inputSystem.cleanupPlayer(player.id);

      expect(inputSystem.getLastProcessedSequence(player.id)).toBe(0);
    });
  });

  describe('security metrics', () => {
    it('should track total inputs processed', () => {
      const player = createMockPlayer();

      for (let i = 1; i <= 5; i++) {
        advanceTime(100);
        inputSystem.processInput(player, createValidInput(i), dt);
      }

      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.totalInputsProcessed).toBe(5);
    });

    it('should track invalid inputs', () => {
      const player = createMockPlayer();

      // Send invalid inputs with time advancement
      advanceTime(50);
      inputSystem.processInput(player, null as any, dt);
      advanceTime(50);
      inputSystem.processInput(player, { dx: 'bad' } as any, dt);

      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.totalInvalidInputs).toBeGreaterThan(0);
    });

    it('should track malicious input attempts', () => {
      const player = createMockPlayer();

      // Send out-of-bounds inputs
      advanceTime(100);
      inputSystem.processInput(player, createValidInput(1, 5, 0), dt);
      advanceTime(100);
      inputSystem.processInput(player, createValidInput(2, 0, -5), dt);

      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.maliciousInputAttempts).toBe(2);
    });

    it('should reset metrics when requested', () => {
      const player = createMockPlayer();

      advanceTime(50);
      inputSystem.processInput(player, createValidInput(1), dt);
      advanceTime(50);
      inputSystem.processInput(player, null as any, dt);

      inputSystem.resetSecurityMetrics();

      const metrics = inputSystem.getSecurityMetrics();
      expect(metrics.totalInputsProcessed).toBe(0);
      expect(metrics.totalInvalidInputs).toBe(0);
    });

    it('should return copy of metrics (immutability)', () => {
      const metrics1 = inputSystem.getSecurityMetrics();
      const metrics2 = inputSystem.getSecurityMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('movement calculations', () => {
    it('should apply correct speed-based movement', () => {
      const player = createMockPlayer({ x: 0, y: 0, speed: 10 });
      const input = createValidInput(1, 1, 0);

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      // Expected: x += dx * speed * dt = 1 * 10 * 0.016 = 0.16
      expect(player.x).toBeCloseTo(0.16, 2);
      expect(player.y).toBe(0);
    });

    it('should handle diagonal movement correctly', () => {
      const player = createMockPlayer({ x: 0, y: 0, speed: 10 });
      const input = createValidInput(1, 1, 1);

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      // Both x and y should change
      expect(player.x).toBeCloseTo(0.16, 2);
      expect(player.y).toBeCloseTo(0.16, 2);
    });

    it('should handle negative movement', () => {
      const player = createMockPlayer({ x: 10, y: 10, speed: 10 });
      const input = createValidInput(1, -1, -1);

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      expect(player.x).toBeLessThan(10);
      expect(player.y).toBeLessThan(10);
    });

    it('should clamp movement input to bounds even after validation', () => {
      // This tests the sanitization layer in applyMovement
      const player = createMockPlayer({ x: 0, y: 0, speed: 10 });
      const input = createValidInput(1, 0.5, -0.5);

      advanceTime(50);
      inputSystem.processInput(player, input, dt);

      // Expected: x += 0.5 * 10 * 0.016 = 0.08
      expect(player.x).toBeCloseTo(0.08, 2);
      expect(player.y).toBeCloseTo(-0.08, 2);
    });
  });
});
