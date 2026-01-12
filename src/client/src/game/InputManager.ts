import type { PlayerInput, PlayerState } from '@swarm-io/shared';

export class InputManager {
  private keys = new Set<string>();
  private sequence = 0;
  private pendingInputs: { input: PlayerInput; time: number }[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Prevent default for game keys
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
  }

  getInput(): PlayerInput {
    let dx = 0;
    let dy = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    const input: PlayerInput = {
      dx,
      dy,
      sequence: this.sequence++,
    };

    // Store for reconciliation
    this.pendingInputs.push({ input, time: performance.now() });

    // Limit buffer size
    if (this.pendingInputs.length > 60) {
      this.pendingInputs.shift();
    }

    return input;
  }

  applyPrediction(player: PlayerState, input: PlayerInput, dt: number) {
    // Apply input immediately to local player for responsiveness
    player.x += input.dx * player.speed * dt;
    player.y += input.dy * player.speed * dt;
  }

  reconcile(serverPlayer: PlayerState, lastProcessedSequence: number) {
    // Remove acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(
      pending => pending.input.sequence > lastProcessedSequence
    );

    // Server position is authoritative
    let x = serverPlayer.x;
    let y = serverPlayer.y;

    // Re-apply unacknowledged inputs
    for (const pending of this.pendingInputs) {
      const dt = 1 / 60; // Assume 60fps
      x += pending.input.dx * serverPlayer.speed * dt;
      y += pending.input.dy * serverPlayer.speed * dt;
    }

    // Update local prediction
    serverPlayer.x = x;
    serverPlayer.y = y;
  }
}