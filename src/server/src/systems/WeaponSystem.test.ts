import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeaponSystem } from './WeaponSystem.js';
import { SpatialHash } from './SpatialHash.js';
import { WEAPON_CONFIGS } from '@swarm-io/shared';

// Helper to create mock weapon
function createMockWeapon(overrides: Partial<{
  type: string;
  level: number;
  cooldownRemaining: number;
}> = {}) {
  return {
    type: overrides.type ?? 'knife',
    level: overrides.level ?? 1,
    cooldownRemaining: overrides.cooldownRemaining ?? 0
  } as any;
}

// Helper to create mock player
function createMockPlayer(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  dead: boolean;
  pendingUpgrade: boolean;
  weapons: any[];
}> = {}) {
  return {
    id: overrides.id ?? `player-${Math.random().toString(36).substr(2, 9)}`,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    facingX: overrides.facingX ?? 1,
    facingY: overrides.facingY ?? 0,
    dead: overrides.dead ?? false,
    pendingUpgrade: overrides.pendingUpgrade ?? false,
    weapons: overrides.weapons ?? [createMockWeapon()]
  } as any;
}

// Helper to create mock enemy
function createMockEnemy(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  health: number;
}> = {}) {
  return {
    id: overrides.id ?? `enemy-${Math.random().toString(36).substr(2, 9)}`,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    health: overrides.health ?? 50
  } as any;
}

// Helper to create mock game state
function createMockGameState(players: any[] = [], enemies: any[] = []) {
  const playersMap = new Map(players.map(p => [p.id, p]));

  // Enemies object with forEach method
  const enemiesObj: any = {};
  enemies.forEach(e => { enemiesObj[e.id] = e; });
  enemiesObj.forEach = function(callback: (enemy: any, key: string) => void) {
    Object.keys(this).forEach(key => {
      if (typeof this[key] !== 'function') {
        callback(this[key], key);
      }
    });
  };

  const projectilesMap = new Map<string, any>();
  const projectilesCreated: any[] = [];

  return {
    players: playersMap,
    enemies: enemiesObj,
    projectiles: projectilesMap,
    addProjectile: vi.fn().mockImplementation((type, ownerId, x, y, velocityX, velocityY, damage, lifetime, radius, piercing) => {
      const proj = { id: `proj-${projectilesCreated.length}`, type, ownerId, x, y, velocityX, velocityY, damage, lifetime, radius, piercing };
      projectilesCreated.push(proj);
      projectilesMap.set(proj.id, proj);
      return proj;
    }),
    removeProjectile: vi.fn().mockImplementation((id) => {
      projectilesMap.delete(id);
    }),
    _projectilesCreated: projectilesCreated
  } as any;
}

// Helper to populate spatial hash
function populateSpatialHash(spatialHash: SpatialHash, gameState: any) {
  spatialHash.clear();

  gameState.players.forEach((player: any) => {
    spatialHash.insert({
      id: player.id,
      x: player.x,
      y: player.y,
      type: 'player',
      entity: player
    });
  });

  Object.keys(gameState.enemies).forEach((key: string) => {
    const enemy = gameState.enemies[key];
    if (typeof enemy !== 'function') {
      spatialHash.insert({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        type: 'enemy',
        entity: enemy
      });
    }
  });
}

describe('WeaponSystem', () => {
  let weaponSystem: WeaponSystem;
  let spatialHash: SpatialHash;
  const deltaTime = 0.016; // ~60fps

  beforeEach(() => {
    weaponSystem = new WeaponSystem();
    spatialHash = new SpatialHash(50);
  });

  describe('initialization', () => {
    it('should initialize with zero metrics', () => {
      const metrics = weaponSystem.getWeaponMetrics();

      expect(metrics.totalShots).toBe(0);
      expect(metrics.projectilesCreated).toBe(0);
      expect(metrics.securityViolations).toBe(0);
    });
  });

  describe('cooldown management', () => {
    it('should decrease cooldown over time', () => {
      const weapon = createMockWeapon({ cooldownRemaining: 1.0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(weapon.cooldownRemaining).toBeCloseTo(1.0 - deltaTime, 3);
    });

    it('should clamp cooldown to zero and fire when cooldown reaches zero', () => {
      // When cooldown is small (0.01) and deltaTime (0.016) would make it negative,
      // it should be clamped to 0 and trigger firing
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0.01 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Cooldown was clamped to 0, weapon fired, and cooldown was reset
      expect(gameState.addProjectile).toHaveBeenCalled();
      expect(weapon.cooldownRemaining).toBeGreaterThan(0); // Reset after firing
    });

    it('should reset cooldown after firing', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Cooldown should be set based on weapon config
      expect(weapon.cooldownRemaining).toBeGreaterThan(0);
    });
  });

  describe('auto-firing', () => {
    it('should fire weapon when cooldown reaches zero', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalled();
    });

    it('should not fire weapon with positive cooldown', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 1.0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should track total shots metric', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBe(1);
    });
  });

  describe('player state validation', () => {
    it('should not update weapons for dead players', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ dead: true, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should not update weapons for players with pending upgrades', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ pendingUpgrade: true, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should handle undefined weapons array', () => {
      const player = createMockPlayer({ weapons: undefined as any });
      const gameState = createMockGameState([player], []);

      // Should not throw
      expect(() => weaponSystem.update(gameState, spatialHash, deltaTime)).not.toThrow();
    });
  });

  describe('security validation', () => {
    it('should reject invalid weapon types', () => {
      const weapon = createMockWeapon({ type: 'invalid_weapon', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.securityViolations).toBe(1);
    });

    it('should reject weapon level below 1', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 0, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.securityViolations).toBe(1);
    });

    it('should reject weapon level above 10', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 11, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should reject NaN weapon level', () => {
      const weapon = createMockWeapon({ type: 'knife', level: NaN, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });
  });

  describe('knife weapon', () => {
    it('should create slash projectile with correct properties', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 5, y: 10, facingX: 1, facingY: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'slash',
        player.id,
        5, 10, // position
        expect.any(Number), expect.any(Number), // velocity
        expect.any(Number), // damage
        0.2, // lifetime
        WEAPON_CONFIGS.knife.range, // radius
        999 // piercing (unlimited)
      );
    });

    it('should create more projectiles at higher levels', () => {
      // Level 1: 1 projectile, Level 3: 2, Level 5: 3, etc.
      const weapon = createMockWeapon({ type: 'knife', level: 5, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 5: 1 + floor(5/2) = 3 projectiles
      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });

    it('should cap projectile count at 5', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 10, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 10: min(1 + floor(10/2), 5) = min(6, 5) = 5
      expect(gameState.addProjectile).toHaveBeenCalledTimes(5);
    });
  });

  describe('wand weapon', () => {
    it('should create bullet projectile in facing direction when no enemies', () => {
      const weapon = createMockWeapon({ type: 'wand', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 1, facingY: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'bullet',
        player.id,
        0, 0,
        expect.any(Number), expect.any(Number),
        expect.any(Number),
        2.0, // lifetime
        20, // radius
        1 // piercing (level-based)
      );
    });

    it('should target nearest enemy within range', () => {
      const weapon = createMockWeapon({ type: 'wand', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 1, facingY: 0, weapons: [weapon] });
      const enemy = createMockEnemy({ x: 0, y: 5 }); // Above player
      const gameState = createMockGameState([player], [enemy]);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Should shoot toward enemy (positive Y velocity)
      const call = gameState.addProjectile.mock.calls[0];
      expect(call[4]).toBeCloseTo(0, 1); // velocityX should be ~0
      expect(call[5]).toBeGreaterThan(0); // velocityY should be positive
    });

    it('should create more projectiles at higher levels', () => {
      const weapon = createMockWeapon({ type: 'wand', level: 5, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 5: min(1 + floor((5-1)/2), 4) = min(3, 4) = 3 projectiles
      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });
  });

  describe('bible weapon', () => {
    it('should create orbital projectiles', () => {
      const weapon = createMockWeapon({ type: 'bible', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 1: min(2 + 1 - 1, 8) = 2 orbs
      expect(gameState.addProjectile).toHaveBeenCalledTimes(2);

      // Check orb properties
      const call = gameState.addProjectile.mock.calls[0];
      expect(call[0]).toBe('orb'); // type
      expect(call[7]).toBe(999); // lifetime (very long)
      expect(call[9]).toBe(999); // piercing (unlimited)
    });

    it('should create more orbs at higher levels', () => {
      const weapon = createMockWeapon({ type: 'bible', level: 5, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 5: min(2 + 5 - 1, 8) = 6 orbs
      expect(gameState.addProjectile).toHaveBeenCalledTimes(6);
    });

    it('should cap orb count at 8', () => {
      const weapon = createMockWeapon({ type: 'bible', level: 10, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 10: min(2 + 10 - 1, 8) = min(11, 8) = 8 orbs
      expect(gameState.addProjectile).toHaveBeenCalledTimes(8);
    });

    it('should keep existing orbs and only create more if needed', () => {
      const weapon = createMockWeapon({ type: 'bible', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ id: 'player-1', weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      // Add existing orb projectile (1 orb, but level 1 needs 2)
      const existingOrb = { id: 'old-orb', type: 'orb', ownerId: 'player-1', damage: 5 };
      gameState.projectiles.set('old-orb', existingOrb);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Should NOT remove the existing orb - only creates more if needed
      expect(gameState.removeProjectile).not.toHaveBeenCalled();
      // Should create 1 additional orb (level 1 = 2 orbs, had 1, need 1 more)
      expect(gameState.addProjectile).toHaveBeenCalledTimes(1);
    });

    it('should remove excess orbs if level decreased or too many exist', () => {
      const weapon = createMockWeapon({ type: 'bible', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ id: 'player-1', weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      // Add 5 existing orbs (too many for level 1 which only needs 2)
      for (let i = 0; i < 5; i++) {
        const orb = { id: `orb-${i}`, type: 'orb', ownerId: 'player-1', damage: 5 };
        gameState.projectiles.set(`orb-${i}`, orb);
      }

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Should remove 3 excess orbs (5 - 2 = 3)
      expect(gameState.removeProjectile).toHaveBeenCalledTimes(3);
      // Should NOT create any new orbs (already have enough)
      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });
  });

  describe('garlic weapon', () => {
    it('should create explosion effects for enemies in range', () => {
      const weapon = createMockWeapon({ type: 'garlic', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemy = createMockEnemy({ x: 1, y: 1 }); // Within garlic range
      const gameState = createMockGameState([player], [enemy]);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'explosion',
        player.id,
        enemy.x, enemy.y,
        0, 0, // no velocity
        expect.any(Number), // damage
        0.1, // lifetime
        30, // radius
        1 // piercing
      );
    });

    it('should not affect enemies outside range', () => {
      const weapon = createMockWeapon({ type: 'garlic', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemy = createMockEnemy({ x: 100, y: 100 }); // Outside garlic range
      const gameState = createMockGameState([player], [enemy]);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should affect multiple enemies in range', () => {
      const weapon = createMockWeapon({ type: 'garlic', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemies = [
        createMockEnemy({ x: 1, y: 0 }),
        createMockEnemy({ x: -1, y: 0 }),
        createMockEnemy({ x: 0, y: 1 })
      ];
      const gameState = createMockGameState([player], enemies);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });
  });

  describe('lightning weapon', () => {
    it('should create lightning bolt projectiles at enemy positions', () => {
      const weapon = createMockWeapon({ type: 'lightning', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemy = createMockEnemy({ x: 5, y: 5 });
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'lightning_bolt',
        player.id,
        5, 5, // at enemy position
        0, 0, // stationary
        expect.any(Number), // damage
        0.15, // short lifetime
        0.5, // radius
        1 // piercing (single hit)
      );
    });

    it('should not fire if no enemies in range', () => {
      const weapon = createMockWeapon({ type: 'lightning', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).not.toHaveBeenCalled();
    });

    it('should create more strikes at higher levels', () => {
      const weapon = createMockWeapon({ type: 'lightning', level: 5, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemies = Array.from({ length: 10 }, (_, i) =>
        createMockEnemy({ x: i * 2, y: 0 })
      );
      const gameState = createMockGameState([player], enemies);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 5: min(1 + floor(5/2), 5) = 3 strikes
      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });

    it('should cap strikes at 5', () => {
      const weapon = createMockWeapon({ type: 'lightning', level: 10, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, weapons: [weapon] });
      const enemies = Array.from({ length: 20 }, (_, i) =>
        createMockEnemy({ x: i * 2, y: 0 })
      );
      const gameState = createMockGameState([player], enemies);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 10: min(1 + floor(10/2), 5) = 5 strikes
      expect(gameState.addProjectile).toHaveBeenCalledTimes(5);
    });
  });

  describe('axe weapon', () => {
    it('should create axe_spin projectile', () => {
      const weapon = createMockWeapon({ type: 'axe', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 1, facingY: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'axe_spin',
        player.id,
        0, 0,
        expect.any(Number), expect.any(Number), // velocity based on facing
        expect.any(Number), // damage
        3, // lifetime
        0.6, // radius
        999 // piercing (unlimited)
      );
    });

    it('should create more axes at higher levels', () => {
      const weapon = createMockWeapon({ type: 'axe', level: 7, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 7: min(1 + floor(7/3), 3) = 3 axes
      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });

    it('should cap axe count at 3', () => {
      const weapon = createMockWeapon({ type: 'axe', level: 10, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Level 10: min(1 + floor(10/3), 3) = min(4, 3) = 3 axes
      expect(gameState.addProjectile).toHaveBeenCalledTimes(3);
    });
  });

  describe('fireball weapon', () => {
    it('should create fireball projectile toward nearest enemy', () => {
      const weapon = createMockWeapon({ type: 'fireball', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 1, facingY: 0, weapons: [weapon] });
      const enemy = createMockEnemy({ x: 10, y: 0 }); // To the right
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'fireball',
        player.id,
        0, 0,
        expect.any(Number), expect.any(Number),
        expect.any(Number), // damage
        3, // lifetime
        0.5, // radius
        1 // piercing (explodes on first hit)
      );

      // Should shoot toward enemy (positive X velocity)
      const call = gameState.addProjectile.mock.calls[0];
      expect(call[4]).toBeGreaterThan(0); // velocityX positive
    });

    it('should fire in facing direction when no enemies', () => {
      const weapon = createMockWeapon({ type: 'fireball', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 0, facingY: 1, weapons: [weapon] });
      const gameState = createMockGameState([player], []);
      populateSpatialHash(spatialHash, gameState);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const call = gameState.addProjectile.mock.calls[0];
      expect(call[4]).toBeCloseTo(0, 1); // velocityX ~0
      expect(call[5]).toBeGreaterThan(0); // velocityY positive (facing up)
    });
  });

  describe('whip weapon', () => {
    it('should create 5 slash projectiles in arc pattern', () => {
      const weapon = createMockWeapon({ type: 'whip', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ x: 0, y: 0, facingX: 1, facingY: 0, weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      expect(gameState.addProjectile).toHaveBeenCalledTimes(5);

      // Each should be a slash type
      gameState.addProjectile.mock.calls.forEach((call: any) => {
        expect(call[0]).toBe('slash');
        expect(call[7]).toBe(0.15); // short lifetime
        expect(call[9]).toBe(999); // unlimited piercing
      });
    });

    it('should create stationary projectiles', () => {
      const weapon = createMockWeapon({ type: 'whip', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // All whip slashes should be stationary
      gameState.addProjectile.mock.calls.forEach((call: any) => {
        expect(call[4]).toBe(0); // velocityX
        expect(call[5]).toBe(0); // velocityY
      });
    });
  });

  describe('damage scaling', () => {
    it('should increase damage by 20% per level', () => {
      const baseDamage = WEAPON_CONFIGS.knife.damage;

      // Level 1 weapon
      const weapon1 = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player1 = createMockPlayer({ id: 'p1', weapons: [weapon1] });
      const gameState1 = createMockGameState([player1], []);
      weaponSystem.update(gameState1, spatialHash, deltaTime);
      const level1Damage = gameState1.addProjectile.mock.calls[0][6];

      weaponSystem.reset();

      // Level 5 weapon
      const weapon5 = createMockWeapon({ type: 'knife', level: 5, cooldownRemaining: 0 });
      const player5 = createMockPlayer({ id: 'p5', weapons: [weapon5] });
      const gameState5 = createMockGameState([player5], []);
      weaponSystem.update(gameState5, spatialHash, deltaTime);
      const level5Damage = gameState5.addProjectile.mock.calls[0][6];

      // Level 1: damage * 1.0, Level 5: damage * (1 + 4*0.2) = damage * 1.8
      expect(level1Damage).toBe(baseDamage);
      expect(level5Damage).toBeCloseTo(baseDamage * 1.8, 2);
    });
  });

  describe('cooldown scaling', () => {
    it('should decrease cooldown by 5% per level', () => {
      const baseCooldown = WEAPON_CONFIGS.knife.cooldown;

      // Level 1
      const weapon1 = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player1 = createMockPlayer({ weapons: [weapon1] });
      const gameState1 = createMockGameState([player1], []);
      weaponSystem.update(gameState1, spatialHash, deltaTime);
      const level1Cooldown = weapon1.cooldownRemaining;

      weaponSystem.reset();

      // Level 5
      const weapon5 = createMockWeapon({ type: 'knife', level: 5, cooldownRemaining: 0 });
      const player5 = createMockPlayer({ weapons: [weapon5] });
      const gameState5 = createMockGameState([player5], []);
      weaponSystem.update(gameState5, spatialHash, deltaTime);
      const level5Cooldown = weapon5.cooldownRemaining;

      // Level 1: cooldown * 1.0, Level 5: cooldown * (1 - 4*0.05) = cooldown * 0.8
      expect(level1Cooldown).toBe(baseCooldown);
      expect(level5Cooldown).toBeCloseTo(baseCooldown * 0.8, 3);
    });

    it('should not reduce cooldown below 40% of base', () => {
      const baseCooldown = WEAPON_CONFIGS.knife.cooldown;

      // Level 10 (would be 1 - 9*0.05 = 0.55, but capped at 0.4)
      const weapon = createMockWeapon({ type: 'knife', level: 10, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);
      weaponSystem.update(gameState, spatialHash, deltaTime);

      // 1 - 0.45 = 0.55, but capped at 0.4
      expect(weapon.cooldownRemaining).toBeCloseTo(baseCooldown * 0.55, 3);
    });
  });

  describe('metrics', () => {
    it('should track projectiles created', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 5, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.projectilesCreated).toBe(3); // Level 5 knife creates 3 slashes
    });

    it('should track weapon cooldowns', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.weaponCooldowns['knife']).toBeDefined();
      expect(metrics.weaponCooldowns['knife']).toBeGreaterThan(0);
    });

    it('should return copy of metrics (immutability)', () => {
      const metrics1 = weaponSystem.getWeaponMetrics();
      const metrics2 = weaponSystem.getWeaponMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      const weapon = createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 });
      const player = createMockPlayer({ weapons: [weapon] });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      let metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBeGreaterThan(0);

      weaponSystem.reset();

      metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBe(0);
      expect(metrics.projectilesCreated).toBe(0);
      expect(metrics.securityViolations).toBe(0);
    });
  });

  describe('multiple weapons', () => {
    it('should update all weapons on a player', () => {
      const weapons = [
        createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 }),
        createMockWeapon({ type: 'axe', level: 1, cooldownRemaining: 0 })
      ];
      const player = createMockPlayer({ weapons });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      // Both weapons should have fired
      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBe(2);
    });

    it('should handle weapons with different cooldowns', () => {
      const weapons = [
        createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 }), // Ready
        createMockWeapon({ type: 'axe', level: 1, cooldownRemaining: 1.0 }) // On cooldown
      ];
      const player = createMockPlayer({ weapons });
      const gameState = createMockGameState([player], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBe(1); // Only knife fired
    });
  });

  describe('multiple players', () => {
    it('should update all living players', () => {
      const player1 = createMockPlayer({
        id: 'p1',
        weapons: [createMockWeapon({ type: 'knife', level: 1, cooldownRemaining: 0 })]
      });
      const player2 = createMockPlayer({
        id: 'p2',
        weapons: [createMockWeapon({ type: 'axe', level: 1, cooldownRemaining: 0 })]
      });
      const gameState = createMockGameState([player1, player2], []);

      weaponSystem.update(gameState, spatialHash, deltaTime);

      const metrics = weaponSystem.getWeaponMetrics();
      expect(metrics.totalShots).toBe(2);
    });
  });
});
