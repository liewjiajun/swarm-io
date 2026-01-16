import type { PlayerInput, PlayerState } from '@swarm-io/shared';
import { TouchControls } from './TouchControls';

/**
 * Stored pending input for client-side prediction reconciliation.
 * Includes the input, its sequence number, and the delta time when it was applied.
 */
interface PendingInput {
  input: PlayerInput;
  dt: number;  // Actual frame delta time when this input was applied
}

export class InputManager {
  private keys = new Set<string>();
  private pendingInputs: PendingInput[] = [];
  private touchControls: TouchControls;

  constructor() {
    // Initialize touch controls for mobile devices
    this.touchControls = new TouchControls();

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Prevent default for game keys, but not when an input field has focus (BUG-047 fix)
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        const activeElement = document.activeElement;
        const isInputField = activeElement instanceof HTMLInputElement ||
                             activeElement instanceof HTMLTextAreaElement ||
                             (activeElement as HTMLElement)?.isContentEditable;
        if (!isInputField) {
          e.preventDefault();
        }
      }
    });
  }

  /**
   * Gets raw input from keyboard or touch controls.
   * Does NOT store the input - use storePendingInput() when sending to server.
   */
  getRawInput(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;

    // Check touch input first (for mobile)
    const touchInput = this.touchControls.getInput();
    if (touchInput.active) {
      // Use touch joystick input
      dx = touchInput.dx;
      dy = touchInput.dy;
    } else {
      // Fall back to keyboard input
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;

      // Normalize diagonal movement (only for keyboard)
      if (dx !== 0 && dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
      }
    }

    return { dx, dy };
  }

  /**
   * @deprecated Use getRawInput() instead. This method is kept for backward compatibility.
   */
  getInput(): PlayerInput {
    const { dx, dy } = this.getRawInput();
    return { dx, dy, sequence: 0 };  // Sequence is managed by Game.ts
  }

  /**
   * Stores a pending input for reconciliation.
   * Called by Game.ts when an input is actually sent to the server.
   * @param input The input with the correct server sequence
   * @param dt The actual frame delta time when this input was applied
   */
  storePendingInput(input: PlayerInput, dt: number): void {
    this.pendingInputs.push({ input, dt });

    // Limit buffer size to prevent memory issues
    if (this.pendingInputs.length > 60) {
      this.pendingInputs.shift();
    }
  }

  /**
   * Returns true if the device is mobile and touch controls are active
   */
  isMobile(): boolean {
    return this.touchControls.isMobile();
  }

  /**
   * Returns the touch controls instance for direct access if needed
   */
  getTouchControls(): TouchControls {
    return this.touchControls;
  }

  /**
   * Force enable touch controls (for testing on desktop)
   */
  enableTouchControls(): void {
    this.touchControls.forceEnable();
  }

  /**
   * Destroys touch controls when game ends
   */
  destroy(): void {
    this.touchControls.destroy();
  }

  /**
   * Applies client-side prediction to the local player for responsive movement.
   * Called every frame with raw input to make movement feel immediate.
   *
   * @param player The local player state to update
   * @param input Raw input with dx/dy movement direction
   * @param dt Frame delta time in seconds
   */
  applyPrediction(player: PlayerState, input: { dx: number; dy: number }, dt: number): void {
    // Apply input immediately to local player for responsiveness
    player.x += input.dx * player.speed * dt;
    player.y += input.dy * player.speed * dt;
  }

  /**
   * Reconciles client prediction with authoritative server state.
   * Uses fresh server position as starting point and re-applies unacknowledged inputs.
   *
   * @param serverX Fresh authoritative X position from server
   * @param serverY Fresh authoritative Y position from server
   * @param playerSpeed Player's current speed for re-applying inputs
   * @param lastProcessedSequence Last input sequence processed by server
   * @returns The reconciled position after re-applying unacknowledged inputs
   */
  reconcile(
    serverX: number,
    serverY: number,
    playerSpeed: number,
    lastProcessedSequence: number
  ): { x: number; y: number } {
    // Remove acknowledged inputs (server has processed these)
    this.pendingInputs = this.pendingInputs.filter(
      pending => pending.input.sequence > lastProcessedSequence
    );

    // Start from authoritative server position
    let x = serverX;
    let y = serverY;

    // Re-apply unacknowledged inputs using their actual delta times
    for (const pending of this.pendingInputs) {
      x += pending.input.dx * playerSpeed * pending.dt;
      y += pending.input.dy * playerSpeed * pending.dt;
    }

    return { x, y };
  }
}