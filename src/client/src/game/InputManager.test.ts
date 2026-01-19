import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputManager } from './InputManager';
import type { PlayerInput, PlayerState } from '@swarm-io/shared';

// Create mock functions that persist across tests
const mockGetInput = vi.fn().mockReturnValue({ dx: 0, dy: 0, active: false });
const mockIsMobile = vi.fn().mockReturnValue(false);
const mockForceEnable = vi.fn();
const mockDestroy = vi.fn();

// Mock TouchControls to avoid DOM manipulation in unit tests
vi.mock('./TouchControls', () => ({
  TouchControls: class MockTouchControls {
    getInput = mockGetInput;
    isMobile = mockIsMobile;
    forceEnable = mockForceEnable;
    destroy = mockDestroy;
  },
}));

// Helper to create a minimal mock player for testing
function createMockPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'test-player',
    x: 0,
    y: 0,
    speed: 10,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    weapons: [],
    nickname: 'Test',
    kills: 0,
    timeAlive: 0,
    hostility: 0,
    invulnerableTime: 0,
    dead: false,
    pendingUpgrade: false,
    armor: 0,
    magnetRange: 50,
    facingX: 1,
    facingY: 0,
    ...overrides,
  };
}

describe('InputManager', () => {
  let inputManager: InputManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values to defaults
    mockGetInput.mockReturnValue({ dx: 0, dy: 0, active: false });
    mockIsMobile.mockReturnValue(false);
    // Reset any DOM state
    document.body.innerHTML = '';
    inputManager = new InputManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an InputManager instance', () => {
      expect(inputManager).toBeDefined();
      expect(inputManager).toBeInstanceOf(InputManager);
    });

    it('should initialize TouchControls', () => {
      const touchControls = inputManager.getTouchControls();
      expect(touchControls).toBeDefined();
    });
  });

  describe('getRawInput', () => {
    it('should return zero input when no keys are pressed', () => {
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(0);
    });

    it('should return correct input for W key (up)', () => {
      // Simulate keydown
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(-1);
    });

    it('should return correct input for S key (down)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(1);
    });

    it('should return correct input for A key (left)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(-1);
      expect(input.dy).toBe(0);
    });

    it('should return correct input for D key (right)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(1);
      expect(input.dy).toBe(0);
    });

    it('should return correct input for ArrowUp key', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(-1);
    });

    it('should return correct input for ArrowDown key', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(1);
    });

    it('should return correct input for ArrowLeft key', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(-1);
      expect(input.dy).toBe(0);
    });

    it('should return correct input for ArrowRight key', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
      const input = inputManager.getRawInput();
      expect(input.dx).toBe(1);
      expect(input.dy).toBe(0);
    });

    it('should normalize diagonal movement', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      const input = inputManager.getRawInput();

      // Normalized diagonal: 1/sqrt(2) ≈ 0.707
      const expectedMagnitude = 1 / Math.sqrt(2);
      expect(input.dx).toBeCloseTo(expectedMagnitude, 5);
      expect(input.dy).toBeCloseTo(-expectedMagnitude, 5);

      // Total magnitude should be 1
      const magnitude = Math.sqrt(input.dx * input.dx + input.dy * input.dy);
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should handle key release correctly', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      let input = inputManager.getRawInput();
      expect(input.dy).toBe(-1);

      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      input = inputManager.getRawInput();
      expect(input.dy).toBe(0);
    });

    it('should handle opposite keys pressed (W and S)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
      const input = inputManager.getRawInput();
      // Both cancel out
      expect(input.dy).toBe(0);
    });

    it('should handle opposite keys pressed (A and D)', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      const input = inputManager.getRawInput();
      // Both cancel out
      expect(input.dy).toBe(0);
      expect(input.dx).toBe(0);
    });

    it('should prioritize touch input over keyboard when touch is active', () => {
      // Set up mock touch input to return active touch
      mockGetInput.mockReturnValue({ dx: 0.5, dy: -0.5, active: true });

      // Press keyboard keys
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

      const input = inputManager.getRawInput();
      // Should use touch input, not keyboard
      expect(input.dx).toBe(0.5);
      expect(input.dy).toBe(-0.5);
    });
  });

  describe('getInput (deprecated)', () => {
    it('should return a PlayerInput with sequence 0', () => {
      const input = inputManager.getInput();
      expect(input).toHaveProperty('dx');
      expect(input).toHaveProperty('dy');
      expect(input).toHaveProperty('sequence');
      expect(input.sequence).toBe(0);
    });

    it('should reflect current keyboard state', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      const input = inputManager.getInput();
      expect(input.dx).toBe(1);
      expect(input.dy).toBe(0);
    });
  });

  describe('storePendingInput', () => {
    it('should store a pending input', () => {
      const input: PlayerInput = { dx: 1, dy: 0, sequence: 1 };
      inputManager.storePendingInput(input, 0.016);

      // Verify by reconciling - should re-apply the input
      const result = inputManager.reconcile(0, 0, 10, 0);
      // With one pending input at sequence 1 (> lastProcessed 0), it should be re-applied
      expect(result.x).toBeCloseTo(10 * 0.016, 5); // dx * speed * dt
    });

    it('should store multiple pending inputs', () => {
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 1 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 2 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 3 }, 0.016);

      const result = inputManager.reconcile(0, 0, 10, 0);
      // All three inputs should be re-applied
      expect(result.x).toBeCloseTo(3 * 10 * 0.016, 5);
    });

    it('should limit buffer size to 60 inputs', () => {
      // Store 65 inputs
      for (let i = 1; i <= 65; i++) {
        inputManager.storePendingInput({ dx: 1, dy: 0, sequence: i }, 0.016);
      }

      // Reconcile with lastProcessed 0 - should only have 60 inputs (6-65, first 5 removed)
      const result = inputManager.reconcile(0, 0, 10, 0);
      // Only 60 inputs remain (sequences 6-65)
      expect(result.x).toBeCloseTo(60 * 10 * 0.016, 5);
    });

    it('should preserve input dt values', () => {
      // Different dt values
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 1 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 2 }, 0.032); // Different dt

      const result = inputManager.reconcile(0, 0, 10, 0);
      // Total: 10 * (0.016 + 0.032) = 0.48
      expect(result.x).toBeCloseTo(10 * 0.048, 5);
    });
  });

  describe('reconcile', () => {
    it('should return server position when no pending inputs', () => {
      const result = inputManager.reconcile(100, 200, 10, 0);
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it('should remove acknowledged inputs', () => {
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 1 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 2 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 3 }, 0.016);

      // Server processed up to sequence 2
      const result = inputManager.reconcile(0, 0, 10, 2);
      // Only sequence 3 remains unacknowledged
      expect(result.x).toBeCloseTo(10 * 0.016, 5);
    });

    it('should re-apply unacknowledged inputs from server position', () => {
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 5 }, 0.016);
      inputManager.storePendingInput({ dx: 0, dy: 1, sequence: 6 }, 0.016);

      // Server at (50, 50), processed up to 4
      const result = inputManager.reconcile(50, 50, 10, 4);
      // Both inputs re-applied: x = 50 + 10*0.016, y = 50 + 10*0.016
      expect(result.x).toBeCloseTo(50 + 10 * 0.016, 5);
      expect(result.y).toBeCloseTo(50 + 10 * 0.016, 5);
    });

    it('should handle diagonal inputs during reconciliation', () => {
      inputManager.storePendingInput({ dx: 0.707, dy: 0.707, sequence: 1 }, 0.016);

      const result = inputManager.reconcile(0, 0, 10, 0);
      expect(result.x).toBeCloseTo(0.707 * 10 * 0.016, 5);
      expect(result.y).toBeCloseTo(0.707 * 10 * 0.016, 5);
    });

    it('should handle varying player speeds', () => {
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 1 }, 0.016);

      const slowResult = inputManager.reconcile(0, 0, 5, 0);
      expect(slowResult.x).toBeCloseTo(5 * 0.016, 5);

      // Store another input for fast test
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 2 }, 0.016);
      const fastResult = inputManager.reconcile(0, 0, 20, 1);
      expect(fastResult.x).toBeCloseTo(20 * 0.016, 5);
    });

    it('should handle negative movement', () => {
      inputManager.storePendingInput({ dx: -1, dy: -1, sequence: 1 }, 0.016);

      const result = inputManager.reconcile(100, 100, 10, 0);
      expect(result.x).toBeCloseTo(100 - 10 * 0.016, 5);
      expect(result.y).toBeCloseTo(100 - 10 * 0.016, 5);
    });

    it('should clear all inputs when server is ahead', () => {
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 1 }, 0.016);
      inputManager.storePendingInput({ dx: 1, dy: 0, sequence: 2 }, 0.016);

      // Server processed up to sequence 10 (ahead of all pending)
      const result = inputManager.reconcile(100, 100, 10, 10);
      // No inputs to re-apply, just return server position
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });
  });

  describe('applyPrediction', () => {
    it('should update player position based on input', () => {
      const player = createMockPlayer({ x: 100, y: 100 });

      inputManager.applyPrediction(player, { dx: 1, dy: 0 }, 0.016);

      expect(player.x).toBeCloseTo(100 + 10 * 0.016, 5);
      expect(player.y).toBe(100);
    });

    it('should handle diagonal movement', () => {
      const player = createMockPlayer();

      inputManager.applyPrediction(player, { dx: 1, dy: -1 }, 0.016);

      expect(player.x).toBeCloseTo(10 * 0.016, 5);
      expect(player.y).toBeCloseTo(-10 * 0.016, 5);
    });

    it('should not move when input is zero', () => {
      const player = createMockPlayer({ x: 50, y: 50 });

      inputManager.applyPrediction(player, { dx: 0, dy: 0 }, 0.016);

      expect(player.x).toBe(50);
      expect(player.y).toBe(50);
    });

    it('should scale movement with dt', () => {
      const player = createMockPlayer();

      // Large dt (lag spike)
      inputManager.applyPrediction(player, { dx: 1, dy: 0 }, 0.1);

      expect(player.x).toBeCloseTo(10 * 0.1, 5);
    });
  });

  describe('isMobile', () => {
    it('should return false when TouchControls reports not mobile', () => {
      mockIsMobile.mockReturnValue(false);
      expect(inputManager.isMobile()).toBe(false);
    });

    it('should return true when TouchControls reports mobile', () => {
      mockIsMobile.mockReturnValue(true);
      expect(inputManager.isMobile()).toBe(true);
    });
  });

  describe('getTouchControls', () => {
    it('should return the TouchControls instance', () => {
      const touchControls = inputManager.getTouchControls();
      expect(touchControls).toBeDefined();
      expect(touchControls.getInput).toBeDefined();
      expect(touchControls.isMobile).toBeDefined();
    });
  });

  describe('enableTouchControls', () => {
    it('should call forceEnable on TouchControls', () => {
      inputManager.enableTouchControls();
      expect(mockForceEnable).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should call destroy on TouchControls', () => {
      inputManager.destroy();
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('keyboard event handling', () => {
    it('should handle multiple simultaneous keys', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));

      // W + A + D: up-left + right = up only (A and D cancel)
      const input = inputManager.getRawInput();
      // Actually: W=-1y, A=-1x, D=+1x → dx=0, dy=-1
      expect(input.dx).toBe(0);
      expect(input.dy).toBe(-1);
    });

    it('should track keys independently', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));

      // Release W only
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

      const input = inputManager.getRawInput();
      expect(input.dx).toBe(1);
      expect(input.dy).toBe(0);
    });
  });

  describe('integration: client-side prediction workflow', () => {
    it('should handle typical prediction cycle', () => {
      const player = createMockPlayer();

      // Frame 1: Player presses D, we predict and store
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      const rawInput1 = inputManager.getRawInput();
      inputManager.applyPrediction(player, rawInput1, 0.016);
      const input1: PlayerInput = { dx: rawInput1.dx, dy: rawInput1.dy, sequence: 1 };
      inputManager.storePendingInput(input1, 0.016);

      // Player should have moved
      expect(player.x).toBeCloseTo(0.16, 5);

      // Frame 2: Same input, predict again
      const rawInput2 = inputManager.getRawInput();
      inputManager.applyPrediction(player, rawInput2, 0.016);
      const input2: PlayerInput = { dx: rawInput2.dx, dy: rawInput2.dy, sequence: 2 };
      inputManager.storePendingInput(input2, 0.016);

      expect(player.x).toBeCloseTo(0.32, 5);

      // Server update arrives: server at x=0.16, processed sequence 1
      const serverX = 0.16;
      const serverY = 0;
      const reconciled = inputManager.reconcile(serverX, serverY, 10, 1);

      // Reconciliation: start from server (0.16), re-apply sequence 2 only
      expect(reconciled.x).toBeCloseTo(0.16 + 0.16, 5);
      expect(reconciled.y).toBe(0);
    });

    it('should handle server correction', () => {
      const player = createMockPlayer();

      // Player moves right for 3 frames
      for (let i = 1; i <= 3; i++) {
        inputManager.applyPrediction(player, { dx: 1, dy: 0 }, 0.016);
        inputManager.storePendingInput({ dx: 1, dy: 0, sequence: i }, 0.016);
      }

      // Player predicted position
      expect(player.x).toBeCloseTo(0.48, 5);

      // Server says: "You actually hit a wall at x=0.1, processed sequence 2"
      // This means server rejected some movement
      const reconciled = inputManager.reconcile(0.1, 0, 10, 2);

      // Only sequence 3 re-applied from server position 0.1
      expect(reconciled.x).toBeCloseTo(0.1 + 0.16, 5);
    });
  });
});
