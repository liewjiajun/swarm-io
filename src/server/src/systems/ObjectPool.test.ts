import { describe, it, expect, vi } from 'vitest';
import { ObjectPool, resetProjectile, resetEnemy, resetXPOrb } from './ObjectPool';

describe('ObjectPool', () => {
  describe('basic operations', () => {
    it('should create pool with pre-allocated objects', () => {
      const factory = vi.fn(() => ({ value: 0 }));
      const pool = new ObjectPool(factory, 10, 100);

      expect(factory).toHaveBeenCalledTimes(10);
      expect(pool.available).toBe(10);
    });

    it('should acquire objects from pool', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 5, 100);

      const obj1 = pool.acquire();
      expect(obj1).toBeDefined();
      expect(pool.available).toBe(4);

      const obj2 = pool.acquire();
      expect(obj2).toBeDefined();
      expect(pool.available).toBe(3);
    });

    it('should create new objects when pool is empty', () => {
      const factory = vi.fn(() => ({ value: Math.random() }));
      const pool = new ObjectPool(factory, 0, 100);

      expect(pool.available).toBe(0);
      const obj = pool.acquire();
      expect(obj).toBeDefined();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should release objects back to pool', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 5, 100);

      const obj = pool.acquire();
      expect(pool.available).toBe(4);

      pool.release(obj);
      expect(pool.available).toBe(5);
    });

    it('should reuse released objects', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 1, 100);

      const obj1 = pool.acquire();
      obj1.value = 42;
      pool.release(obj1);

      const obj2 = pool.acquire();
      expect(obj2).toBe(obj1);
      expect(obj2.value).toBe(42); // Without reset, value persists
    });
  });

  describe('reset function', () => {
    it('should call reset function on release', () => {
      const reset = vi.fn((obj: { value: number }) => {
        obj.value = 0;
      });
      const pool = new ObjectPool(() => ({ value: 0 }), 1, 100, reset);

      const obj = pool.acquire();
      obj.value = 999;
      pool.release(obj);

      expect(reset).toHaveBeenCalledWith(obj);
      expect(obj.value).toBe(0);
    });

    it('should return clean objects after release with reset', () => {
      const pool = new ObjectPool(
        () => ({ value: 0 }),
        1,
        100,
        (obj) => {
          obj.value = 0;
        }
      );

      const obj1 = pool.acquire();
      obj1.value = 42;
      pool.release(obj1);

      const obj2 = pool.acquire();
      expect(obj2.value).toBe(0);
    });
  });

  describe('max size limit', () => {
    it('should not exceed max pool size', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 0, 3);

      // Create and release more than max
      const objects = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];

      objects.forEach((obj) => pool.release(obj));

      expect(pool.available).toBe(3); // Max size is 3
    });

    it('should discard objects when pool is full', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 3, 3);
      expect(pool.available).toBe(3);

      const obj = { value: 999 };
      pool.release(obj as any);

      expect(pool.available).toBe(3); // Still 3, not 4
    });
  });

  describe('prewarm', () => {
    it('should add objects to pool', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 5, 100);
      expect(pool.available).toBe(5);

      pool.prewarm(10);
      expect(pool.available).toBe(15);
    });

    it('should respect max size during prewarm', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 0, 10);

      pool.prewarm(20);
      expect(pool.available).toBe(10);
    });

    it('should not exceed max when partially filled', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 8, 10);

      pool.prewarm(5);
      expect(pool.available).toBe(10); // 8 + min(5, 2) = 10
    });
  });

  describe('clear', () => {
    it('should remove all pooled objects', () => {
      const pool = new ObjectPool(() => ({ value: 0 }), 10, 100);
      expect(pool.available).toBe(10);

      pool.clear();
      expect(pool.available).toBe(0);
    });
  });

  describe('LIFO behavior', () => {
    it('should return most recently released object first', () => {
      const pool = new ObjectPool(() => ({ id: Math.random() }), 0, 100);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      const obj3 = pool.acquire();

      pool.release(obj1);
      pool.release(obj2);
      pool.release(obj3);

      // Should return in LIFO order: obj3, obj2, obj1
      expect(pool.acquire()).toBe(obj3);
      expect(pool.acquire()).toBe(obj2);
      expect(pool.acquire()).toBe(obj1);
    });
  });
});

describe('resetProjectile', () => {
  it('should reset all projectile fields', () => {
    const projectile = {
      id: 'test-id',
      type: 'fireball',
      ownerId: 'player-1',
      x: 100,
      y: 200,
      velocityX: 5,
      velocityY: 10,
      damage: 50,
      lifetime: 3,
      radius: 1.5,
      piercing: 3,
      hitEnemies: new Set(['e1', 'e2']),
    };

    resetProjectile(projectile);

    expect(projectile.id).toBe('');
    expect(projectile.type).toBe('');
    expect(projectile.ownerId).toBe('');
    expect(projectile.x).toBe(0);
    expect(projectile.y).toBe(0);
    expect(projectile.velocityX).toBe(0);
    expect(projectile.velocityY).toBe(0);
    expect(projectile.damage).toBe(0);
    expect(projectile.lifetime).toBe(0);
    expect(projectile.radius).toBe(0.5);
    expect(projectile.piercing).toBe(0);
    expect(projectile.hitEnemies.size).toBe(0);
  });
});

describe('resetEnemy', () => {
  it('should reset all enemy fields including boss state and combo fields', () => {
    const enemy = {
      id: 'enemy-123',
      type: 'zombie',
      x: 50,
      y: 75,
      health: 25,
      maxHealth: 100,
      velocityX: 2,
      velocityY: -1,
      targetPlayerId: 'player-1',
      // Boss state fields (BUG-007 fix)
      attackCooldown: 2.5,
      abilityCooldown: 5.0,
      isCharging: true,
      chargeTargetX: 100,
      chargeTargetY: 200,
      // Kill credit tracking (BUG-018 fix)
      lastDamagedBy: 'player-2',
      // Combo system fields (BUG-039 fix)
      comboCount: 5,
      comboLastHitTime: 12345,
      comboLastPlayerId: 'player-3',
    };

    resetEnemy(enemy);

    expect(enemy.id).toBe('');
    expect(enemy.type).toBe('');
    expect(enemy.x).toBe(0);
    expect(enemy.y).toBe(0);
    expect(enemy.health).toBe(10);
    expect(enemy.maxHealth).toBe(10);
    expect(enemy.velocityX).toBe(0);
    expect(enemy.velocityY).toBe(0);
    expect(enemy.targetPlayerId).toBe('');
    // Verify boss state is properly reset (BUG-007 fix)
    expect(enemy.attackCooldown).toBe(0);
    expect(enemy.abilityCooldown).toBe(0);
    expect(enemy.isCharging).toBe(false);
    expect(enemy.chargeTargetX).toBe(0);
    expect(enemy.chargeTargetY).toBe(0);
    // Verify kill credit is properly reset (BUG-018 fix)
    expect(enemy.lastDamagedBy).toBe('');
    // Verify combo fields are properly reset (BUG-039 fix)
    expect(enemy.comboCount).toBe(0);
    expect(enemy.comboLastHitTime).toBe(0);
    expect(enemy.comboLastPlayerId).toBe('');
  });
});

describe('resetXPOrb', () => {
  it('should reset all XP orb fields', () => {
    const orb = {
      id: 'orb-456',
      x: 30,
      y: 40,
      size: 'large' as const,
      value: 25,
      magnetized: true,
      targetPlayerId: 'player-2',
      collected: true,
    };

    resetXPOrb(orb);

    expect(orb.id).toBe('');
    expect(orb.x).toBe(0);
    expect(orb.y).toBe(0);
    expect(orb.size).toBe('small');
    expect(orb.value).toBe(1);
    expect(orb.magnetized).toBe(false);
    expect(orb.targetPlayerId).toBe('');
    expect(orb.collected).toBe(false);
  });
});
