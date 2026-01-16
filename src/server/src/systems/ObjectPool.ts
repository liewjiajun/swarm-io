/**
 * ObjectPool - Generic object pooling system for server-side entity reuse.
 *
 * Reduces garbage collection pressure by reusing schema objects instead of
 * allocating new ones for every entity creation. This is especially important
 * for high-frequency entities like projectiles.
 *
 * Usage:
 *   const pool = new ObjectPool(() => new ProjectileSchema(), 1000);
 *   const projectile = pool.acquire();  // Get from pool or create new
 *   pool.release(projectile);           // Return to pool for reuse
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: ((obj: T) => void) | undefined;
  private maxSize: number;

  /**
   * Create a new object pool.
   * @param factory Function that creates a new instance of T
   * @param initialSize Number of objects to pre-allocate
   * @param maxSize Maximum pool size (prevents memory bloat)
   * @param reset Optional function to reset object state before reuse
   */
  constructor(
    factory: () => T,
    initialSize: number = 100,
    maxSize: number = 2000,
    reset?: (obj: T) => void
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.reset = reset;

    // Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  /**
   * Acquire an object from the pool (or create new if empty).
   * @returns A pooled or new object instance
   */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  /**
   * Release an object back to the pool for reuse.
   * @param obj Object to return to the pool
   */
  release(obj: T): void {
    // Don't exceed max pool size (prevents memory bloat after bursts)
    if (this.pool.length >= this.maxSize) {
      return; // Let it be garbage collected
    }

    // Reset object state if reset function provided
    if (this.reset) {
      this.reset(obj);
    }

    this.pool.push(obj);
  }

  /**
   * Get current pool size (available objects).
   */
  get available(): number {
    return this.pool.length;
  }

  /**
   * Pre-warm the pool by creating more objects.
   * @param count Number of objects to add to pool
   */
  prewarm(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.pool.length);
    for (let i = 0; i < toCreate; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Clear all pooled objects (for cleanup/shutdown).
   */
  clear(): void {
    this.pool.length = 0;
  }
}

/**
 * Reset function for ProjectileSchema objects.
 * Clears all state to defaults for clean reuse.
 */
export function resetProjectile(p: {
  id: string;
  type: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  radius: number;
  piercing: number;
  hitEnemies: Set<string>;
}): void {
  p.id = '';
  p.type = '';
  p.ownerId = '';
  p.x = 0;
  p.y = 0;
  p.velocityX = 0;
  p.velocityY = 0;
  p.damage = 0;
  p.lifetime = 0;
  p.radius = 0.5;
  p.piercing = 0;
  p.hitEnemies.clear();
}

/**
 * Reset function for EnemySchema objects.
 * Clears all state to defaults for clean reuse.
 * BUG-007 FIX: Added missing fields (attackCooldown, abilityCooldown, isCharging,
 * chargeTargetX, chargeTargetY) to prevent state leak from boss enemies.
 * BUG-039 FIX: Added missing combo fields (comboCount, comboLastHitTime, comboLastPlayerId)
 * and lastDamagedBy to prevent state leak causing enemies to stop spawning.
 */
export function resetEnemy(e: {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  velocityX: number;
  velocityY: number;
  targetPlayerId: string;
  // Server-only fields that must be reset to prevent state leak
  attackCooldown: number;
  abilityCooldown: number;
  isCharging: boolean;
  chargeTargetX: number;
  chargeTargetY: number;
  // BUG-018 FIX: Kill credit tracking
  lastDamagedBy: string;
  // P4.4: Combo system fields
  comboCount: number;
  comboLastHitTime: number;
  comboLastPlayerId: string;
}): void {
  e.id = '';
  e.type = '';
  e.x = 0;
  e.y = 0;
  e.health = 10;
  e.maxHealth = 10;
  e.velocityX = 0;
  e.velocityY = 0;
  e.targetPlayerId = '';
  // BUG-007 FIX: Reset server-only fields to prevent boss state leaking to regular enemies
  e.attackCooldown = 0;
  e.abilityCooldown = 0;
  e.isCharging = false;
  e.chargeTargetX = 0;
  e.chargeTargetY = 0;
  // BUG-039 FIX: Reset combo and kill credit fields to prevent state leak
  e.lastDamagedBy = '';
  e.comboCount = 0;
  e.comboLastHitTime = 0;
  e.comboLastPlayerId = '';
}

/**
 * Reset function for XPOrbSchema objects.
 * Clears all state to defaults for clean reuse.
 */
export function resetXPOrb(o: {
  id: string;
  x: number;
  y: number;
  size: string;
  value: number;
  magnetized: boolean;
  targetPlayerId: string;
  collected: boolean;
}): void {
  o.id = '';
  o.x = 0;
  o.y = 0;
  o.size = 'small';
  o.value = 1;
  o.magnetized = false;
  o.targetPlayerId = '';
  o.collected = false;
}

/**
 * P5.2: Reset function for PowerUpSchema objects.
 * Clears all state to defaults for clean reuse.
 */
export function resetPowerUp(p: {
  id: string;
  type: string;
  x: number;
  y: number;
  spawnTime: number;
  lifetime: number;
  collected: boolean;
}): void {
  p.id = '';
  p.type = '';
  p.x = 0;
  p.y = 0;
  p.spawnTime = 0;
  p.lifetime = 60;
  p.collected = false;
}
