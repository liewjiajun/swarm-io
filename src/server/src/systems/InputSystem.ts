import type { PlayerInput } from '@swarm-io/shared';
import type { PlayerSchema } from '../state/PlayerSchema';

interface PlayerInputRate {
  count: number;
  resetTime: number;
  violations: number;
  lastInputTime: number;
}

interface SecurityMetrics {
  totalInputsProcessed: number;
  totalInvalidInputs: number;
  rateLimitViolations: number;
  maliciousInputAttempts: number;
  playersKicked: number;
}

// Callback type for kicking players due to security violations
type KickCallback = (playerId: string, reason: string) => void;

export class InputSystem {
  // Rate limiting - CRITICAL for DoS prevention
  private inputCounts = new Map<string, PlayerInputRate>();
  private readonly MAX_INPUTS_PER_SECOND = 30;
  private readonly RATE_LIMIT_WINDOW = 1000; // 1 second in milliseconds
  private readonly MAX_VIOLATIONS_BEFORE_KICK = 5;

  // Input validation bounds - CRITICAL for security
  private readonly INPUT_BOUND_MIN = -1;
  private readonly INPUT_BOUND_MAX = 1;
  private readonly MAX_SEQUENCE_JUMP = 100; // Prevent sequence manipulation

  // Security metrics for monitoring
  private securityMetrics: SecurityMetrics = {
    totalInputsProcessed: 0,
    totalInvalidInputs: 0,
    rateLimitViolations: 0,
    maliciousInputAttempts: 0,
    playersKicked: 0
  };

  // Player sequence tracking for reconciliation
  private lastProcessedSequences = new Map<string, number>();

  // Callback to kick players when they exceed violation threshold
  private onKickPlayer: KickCallback | null = null;

  /**
   * Set the callback function for kicking players
   * Called when a player exceeds the violation threshold
   */
  setKickCallback(callback: KickCallback): void {
    this.onKickPlayer = callback;
  }

  /**
   * Process player input with comprehensive security validation
   * Returns true if input was processed, false if rejected
   */
  processInput(player: PlayerSchema, input: PlayerInput, dt: number): boolean {
    const playerId = player.id;

    // Skip processing for dead or upgrading players
    if (player.dead || player.pendingUpgrade) {
      return false;
    }

    // CRITICAL SECURITY: Validate input structure and types
    if (!this.validateInputStructure(playerId, input)) {
      return false;
    }

    // CRITICAL SECURITY: Rate limiting check
    if (!this.checkRateLimit(playerId)) {
      return false;
    }

    // CRITICAL SECURITY: Input bounds validation
    if (!this.validateInputBounds(playerId, input)) {
      return false;
    }

    // CRITICAL SECURITY: Sequence validation (prevent replay attacks)
    if (!this.validateInputSequence(playerId, input)) {
      return false;
    }

    // If all security checks pass, process the input
    return this.applyMovement(player, input, dt);
  }

  /**
   * CRITICAL SECURITY: Validate input structure and data types
   */
  private validateInputStructure(playerId: string, input: PlayerInput): boolean {
    // Check if input exists and has required properties
    if (!input || typeof input !== 'object') {
      this.logSecurityViolation(playerId, 'Invalid input structure - null or non-object');
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Validate dx property
    if (typeof input.dx !== 'number') {
      this.logSecurityViolation(playerId, `Invalid dx type: ${typeof input.dx}`);
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Validate dy property
    if (typeof input.dy !== 'number') {
      this.logSecurityViolation(playerId, `Invalid dy type: ${typeof input.dy}`);
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Validate sequence property
    if (typeof input.sequence !== 'number' || !Number.isInteger(input.sequence)) {
      this.logSecurityViolation(playerId, `Invalid sequence: ${input.sequence}`);
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Check for non-finite values (NaN, Infinity)
    if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) {
      this.logSecurityViolation(playerId, `Non-finite input values: dx=${input.dx}, dy=${input.dy}`);
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    return true;
  }

  /**
   * CRITICAL SECURITY: Rate limiting to prevent DoS attacks
   */
  private checkRateLimit(playerId: string): boolean {
    const now = Date.now();
    let playerRate = this.inputCounts.get(playerId);

    // Initialize rate tracking for new player
    if (!playerRate) {
      playerRate = {
        count: 0,
        resetTime: now + this.RATE_LIMIT_WINDOW,
        violations: 0,
        lastInputTime: now
      };
      this.inputCounts.set(playerId, playerRate);
    }

    // Reset counter if window has passed
    if (now >= playerRate.resetTime) {
      playerRate.count = 0;
      playerRate.resetTime = now + this.RATE_LIMIT_WINDOW;
      // Don't reset violations - they persist to detect persistent abuse
    }

    // Check for input spam (multiple inputs in same millisecond)
    if (now === playerRate.lastInputTime) {
      this.logSecurityViolation(playerId, 'Input spam detected - multiple inputs in same millisecond');
      playerRate.violations++;
      this.securityMetrics.rateLimitViolations++;
      return false;
    }

    // Increment input count
    playerRate.count++;
    playerRate.lastInputTime = now;

    // Check rate limit
    if (playerRate.count > this.MAX_INPUTS_PER_SECOND) {
      playerRate.violations++;
      this.securityMetrics.rateLimitViolations++;

      this.logSecurityViolation(
        playerId,
        `Rate limit exceeded: ${playerRate.count}/${this.MAX_INPUTS_PER_SECOND} inputs/sec`
      );

      // SECURITY: Kick player when violations exceed threshold
      if (playerRate.violations >= this.MAX_VIOLATIONS_BEFORE_KICK) {
        const reason = `Rate limit violations exceeded (${playerRate.violations}/${this.MAX_VIOLATIONS_BEFORE_KICK})`;
        console.warn(`[SECURITY] Kicking player ${playerId}: ${reason}`);

        if (this.onKickPlayer) {
          this.onKickPlayer(playerId, reason);
          this.securityMetrics.playersKicked++;
        }
      }

      return false;
    }

    return true;
  }

  /**
   * CRITICAL SECURITY: Input bounds validation
   */
  private validateInputBounds(playerId: string, input: PlayerInput): boolean {
    // Validate dx bounds
    if (input.dx < this.INPUT_BOUND_MIN || input.dx > this.INPUT_BOUND_MAX) {
      this.logSecurityViolation(
        playerId,
        `dx out of bounds: ${input.dx} (valid range: ${this.INPUT_BOUND_MIN} to ${this.INPUT_BOUND_MAX})`
      );
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Validate dy bounds
    if (input.dy < this.INPUT_BOUND_MIN || input.dy > this.INPUT_BOUND_MAX) {
      this.logSecurityViolation(
        playerId,
        `dy out of bounds: ${input.dy} (valid range: ${this.INPUT_BOUND_MIN} to ${this.INPUT_BOUND_MAX})`
      );
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    return true;
  }

  /**
   * CRITICAL SECURITY: Sequence validation to prevent replay attacks
   */
  private validateInputSequence(playerId: string, input: PlayerInput): boolean {
    const lastSequence = this.lastProcessedSequences.get(playerId) || 0;

    // Prevent negative sequences
    if (input.sequence < 0) {
      this.logSecurityViolation(playerId, `Negative sequence number: ${input.sequence}`);
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Prevent sequence going backwards (replay attack)
    if (input.sequence <= lastSequence) {
      this.logSecurityViolation(
        playerId,
        `Sequence replay attack: ${input.sequence} <= ${lastSequence}`
      );
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Prevent huge sequence jumps (potential exploitation)
    if (input.sequence > lastSequence + this.MAX_SEQUENCE_JUMP) {
      this.logSecurityViolation(
        playerId,
        `Suspicious sequence jump: ${input.sequence} > ${lastSequence + this.MAX_SEQUENCE_JUMP}`
      );
      this.securityMetrics.maliciousInputAttempts++;
      return false;
    }

    // Update last processed sequence
    this.lastProcessedSequences.set(playerId, input.sequence);
    return true;
  }

  /**
   * Apply validated movement to player
   */
  private applyMovement(player: PlayerSchema, input: PlayerInput, dt: number): boolean {
    // Sanitize input values (additional safety layer)
    const dx = Math.max(this.INPUT_BOUND_MIN, Math.min(this.INPUT_BOUND_MAX, input.dx));
    const dy = Math.max(this.INPUT_BOUND_MIN, Math.min(this.INPUT_BOUND_MAX, input.dy));

    // Calculate movement
    const speed = player.speed;
    const deltaX = dx * speed * dt;
    const deltaY = dy * speed * dt;

    // Apply movement
    player.x += deltaX;
    player.y += deltaY;

    // Update facing direction if moving
    if (dx !== 0 || dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0) {
        player.facingX = dx / length;
        player.facingY = dy / length;
      }
    }

    // Update metrics
    this.securityMetrics.totalInputsProcessed++;
    return true;
  }

  /**
   * Clean up player data when they leave
   */
  cleanupPlayer(playerId: string): void {
    this.inputCounts.delete(playerId);
    this.lastProcessedSequences.delete(playerId);
  }

  /**
   * Get security metrics for monitoring
   */
  getSecurityMetrics(): Readonly<SecurityMetrics> {
    return { ...this.securityMetrics };
  }

  /**
   * Reset security metrics (call periodically for fresh monitoring)
   */
  resetSecurityMetrics(): void {
    this.securityMetrics = {
      totalInputsProcessed: 0,
      totalInvalidInputs: 0,
      rateLimitViolations: 0,
      maliciousInputAttempts: 0,
      playersKicked: 0
    };
  }

  /**
   * Get player input rate information (for debugging/monitoring)
   */
  getPlayerRateInfo(playerId: string): PlayerInputRate | null {
    return this.inputCounts.get(playerId) || null;
  }

  /**
   * Log security violations with detailed information
   */
  private logSecurityViolation(playerId: string, reason: string): void {
    const timestamp = new Date().toISOString();
    const playerRate = this.inputCounts.get(playerId);

    console.warn(
      `[SECURITY] ${timestamp} Player ${playerId}: ${reason}` +
      (playerRate ? ` (violations: ${playerRate.violations})` : '')
    );

    this.securityMetrics.totalInvalidInputs++;
  }

  /**
   * Get last processed sequence for a player (for client reconciliation)
   */
  getLastProcessedSequence(playerId: string): number {
    return this.lastProcessedSequences.get(playerId) || 0;
  }
}