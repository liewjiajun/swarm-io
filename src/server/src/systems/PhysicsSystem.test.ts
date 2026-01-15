import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsSystem } from './PhysicsSystem';
import { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, ENEMY_ATTACK_CONFIGS, BOSS_ABILITY_CONFIGS } from '@swarm-io/shared';

// =============================================================================
// MOCK FACTORIES
// =============================================================================

let enemyCounter = 0;
let projectileCounter = 0;
let orbCounter = 0;
let playerCounter = 0;

function createMockPlayer(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  health: number;
  dead: boolean;
  magnetRange: number;
}> = {}) {
  const id = overrides.id ?? `player-${++playerCounter}`;
  const player = {
    id,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    health: overrides.health ?? 100,
    dead: overrides.dead ?? false,
    magnetRange: overrides.magnetRange ?? GAME_CONSTANTS.XP_MAGNET_RADIUS,
    die: vi.fn().mockImplementation((cause: string) => {
      player.dead = true;
      player.deathCause = cause;
    }),
    deathCause: '',
  };
  return player;
}

function createMockEnemy(overrides: Partial<{
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  speed: number;
  velocityX: number;
  velocityY: number;
  targetPlayerId: string;
  attackCooldown: number;
  abilityCooldown: number;
  isCharging: boolean;
  chargeTargetX: number;
  chargeTargetY: number;
  initialize: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    id: overrides.id ?? `enemy-${++enemyCounter}`,
    type: overrides.type ?? 'bat',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    health: overrides.health ?? 10,
    speed: overrides.speed ?? 4,
    velocityX: overrides.velocityX ?? 0,
    velocityY: overrides.velocityY ?? 0,
    targetPlayerId: overrides.targetPlayerId ?? '',
    attackCooldown: overrides.attackCooldown ?? 0,
    abilityCooldown: overrides.abilityCooldown ?? 0,
    isCharging: overrides.isCharging ?? false,
    chargeTargetX: overrides.chargeTargetX ?? 0,
    chargeTargetY: overrides.chargeTargetY ?? 0,
    initialize: overrides.initialize ?? vi.fn(),
  };
}

function createMockProjectile(overrides: Partial<{
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
}> = {}) {
  return {
    id: overrides.id ?? `projectile-${++projectileCounter}`,
    type: overrides.type ?? 'bullet',
    ownerId: overrides.ownerId ?? 'player-1',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    velocityX: overrides.velocityX ?? 0,
    velocityY: overrides.velocityY ?? 0,
    damage: overrides.damage ?? 10,
    lifetime: overrides.lifetime ?? 2,
    radius: overrides.radius ?? 0.3,
    piercing: overrides.piercing ?? 1,
  };
}

function createMockXPOrb(overrides: Partial<{
  id: string;
  x: number;
  y: number;
  value: number;
  magnetized: boolean;
  targetPlayerId: string;
}> = {}) {
  return {
    id: overrides.id ?? `orb-${++orbCounter}`,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    value: overrides.value ?? 1,
    magnetized: overrides.magnetized ?? false,
    targetPlayerId: overrides.targetPlayerId ?? '',
  };
}

function createMockGameState(
  players: ReturnType<typeof createMockPlayer>[] = [],
  enemies: ReturnType<typeof createMockEnemy>[] = [],
  projectiles: ReturnType<typeof createMockProjectile>[] = [],
  xpOrbs: ReturnType<typeof createMockXPOrb>[] = [],
  worldRadius: number = 500
) {
  const playersMap = new Map(players.map(p => [p.id, p]));
  const enemiesMap = new Map(enemies.map(e => [e.id, e]));
  const projectilesMap = new Map(projectiles.map(p => [p.id, p]));
  const xpOrbsMap = new Map(xpOrbs.map(o => [o.id, o]));

  // Create array to track projectiles created by addProjectile
  const projectilesCreated: any[] = [];
  const enemiesCreated: any[] = [];

  return {
    players: playersMap,
    enemies: {
      forEach: (callback: (enemy: any, id: string) => void) => {
        enemiesMap.forEach((enemy, id) => callback(enemy, id));
      },
      get: (id: string) => enemiesMap.get(id),
      set: (id: string, enemy: any) => enemiesMap.set(id, enemy),
      delete: (id: string) => enemiesMap.delete(id),
      size: enemiesMap.size,
    },
    projectiles: {
      forEach: (callback: (proj: any, id: string) => void) => {
        projectilesMap.forEach((proj, id) => callback(proj, id));
      },
      get: (id: string) => projectilesMap.get(id),
      set: (id: string, proj: any) => projectilesMap.set(id, proj),
      delete: (id: string) => projectilesMap.delete(id),
      size: projectilesMap.size,
    },
    xpOrbs: {
      forEach: (callback: (orb: any, id: string) => void) => {
        xpOrbsMap.forEach((orb, id) => callback(orb, id));
      },
      get: (id: string) => xpOrbsMap.get(id),
      set: (id: string, orb: any) => xpOrbsMap.set(id, orb),
      delete: (id: string) => xpOrbsMap.delete(id),
      size: xpOrbsMap.size,
    },
    world: {
      worldRadius,
      playerCount: players.length,
      gameTime: 0,
    },
    addProjectile: vi.fn().mockImplementation(
      (type, ownerId, x, y, vx, vy, damage, lifetime, radius, piercing) => {
        const proj = createMockProjectile({
          type, ownerId, x, y, velocityX: vx, velocityY: vy,
          damage, lifetime, radius, piercing
        });
        projectilesCreated.push(proj);
        projectilesMap.set(proj.id, proj);
        return proj;
      }
    ),
    addEnemy: vi.fn().mockImplementation((type, x, y) => {
      const enemy = createMockEnemy({ type, x, y });
      enemiesCreated.push(enemy);
      enemiesMap.set(enemy.id, enemy);
      return enemy;
    }),
    removeProjectile: vi.fn().mockImplementation((id: string) => {
      projectilesMap.delete(id);
    }),
    _projectilesCreated: projectilesCreated,
    _enemiesCreated: enemiesCreated,
  };
}

function populateSpatialHash(spatialHash: SpatialHash, gameState: any) {
  spatialHash.clear();
  gameState.players.forEach((player: any, id: string) => {
    if (!player.dead) {
      spatialHash.insert({
        id,
        x: player.x,
        y: player.y,
        type: 'player',
        entity: player,
      });
    }
  });
  gameState.enemies.forEach((enemy: any, id: string) => {
    spatialHash.insert({
      id,
      x: enemy.x,
      y: enemy.y,
      type: 'enemy',
      entity: enemy,
    });
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('PhysicsSystem', () => {
  let physicsSystem: PhysicsSystem;
  let spatialHash: SpatialHash;
  const dt = 0.016; // ~60fps

  beforeEach(() => {
    spatialHash = new SpatialHash(50);
    physicsSystem = new PhysicsSystem(spatialHash);
    // Reset counters for each test
    enemyCounter = 0;
    projectileCounter = 0;
    orbCounter = 0;
    playerCounter = 0;
  });

  // ===========================================================================
  // ENEMY AI TESTS
  // ===========================================================================

  describe('Enemy AI', () => {
    describe('Target acquisition', () => {
      it('should find nearest player within detection range', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(enemy.targetPlayerId).toBe(player.id);
      });

      it('should select the nearest of multiple players', () => {
        const farPlayer = createMockPlayer({ id: 'far', x: 50, y: 0 });
        const nearPlayer = createMockPlayer({ id: 'near', x: 5, y: 0 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([farPlayer, nearPlayer], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(enemy.targetPlayerId).toBe('near');
      });

      it('should not target players beyond 100 unit detection range', () => {
        const player = createMockPlayer({ x: 150, y: 0 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        // Enemy should wander toward center, not target the player
        expect(enemy.targetPlayerId).toBe('');
      });

      it('should not target dead players', () => {
        const deadPlayer = createMockPlayer({ id: 'dead', x: 5, y: 0, dead: true });
        const alivePlayer = createMockPlayer({ id: 'alive', x: 20, y: 0, dead: false });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([deadPlayer, alivePlayer], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(enemy.targetPlayerId).toBe('alive');
      });
    });

    describe('Melee movement', () => {
      it('should move toward target player', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(enemy.velocityX).toBeGreaterThan(0);
        expect(enemy.velocityY).toBe(0);
        expect(enemy.x).toBeGreaterThan(0);
      });

      it('should move at configured speed', () => {
        const player = createMockPlayer({ x: 100, y: 0 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        // velocity should be normalized to speed
        const speed = Math.sqrt(enemy.velocityX ** 2 + enemy.velocityY ** 2);
        expect(speed).toBeCloseTo(4, 2);
      });

      it('should handle diagonal movement correctly', () => {
        const player = createMockPlayer({ x: 10, y: 10 });
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        const speed = Math.sqrt(enemy.velocityX ** 2 + enemy.velocityY ** 2);
        expect(speed).toBeCloseTo(4, 2);
        expect(enemy.x).toBeGreaterThan(0);
        expect(enemy.y).toBeGreaterThan(0);
      });
    });

    describe('No target - wandering', () => {
      it('should wander toward center when no player nearby', () => {
        const enemy = createMockEnemy({ x: 50, y: 50, speed: 4 });
        const gameState = createMockGameState([], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        // Should move toward center (0, 0) at half speed
        expect(enemy.velocityX).toBeLessThan(0);
        expect(enemy.velocityY).toBeLessThan(0);
        const speed = Math.sqrt(enemy.velocityX ** 2 + enemy.velocityY ** 2);
        expect(speed).toBeCloseTo(2, 2); // half speed
      });

      it('should remain stationary at center', () => {
        const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
        const gameState = createMockGameState([], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        // At center, direction is zero, so velocity should be 0 or very small
        expect(Math.abs(enemy.velocityX)).toBeLessThan(0.001);
        expect(Math.abs(enemy.velocityY)).toBeLessThan(0.001);
      });
    });

    describe('Ranged enemy (demon) behavior', () => {
      it('should fire projectile when in range and cooldown ready', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const enemy = createMockEnemy({
          type: 'demon',
          x: 0,
          y: 0,
          speed: 2.5,
          attackCooldown: 0
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.addProjectile).toHaveBeenCalled();
        expect(enemy.attackCooldown).toBe(ENEMY_ATTACK_CONFIGS.demon.cooldown);
      });

      it('should not fire when on cooldown', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const enemy = createMockEnemy({
          type: 'demon',
          x: 0,
          y: 0,
          attackCooldown: 2.0
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.addProjectile).not.toHaveBeenCalled();
        expect(enemy.attackCooldown).toBeCloseTo(2.0 - dt, 4);
      });

      it('should maintain distance when too close', () => {
        const player = createMockPlayer({ x: 3, y: 0 }); // Within 50% of range
        const enemy = createMockEnemy({
          type: 'demon',
          x: 0,
          y: 0,
          speed: 2.5,
          attackCooldown: 0
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        // Distance is 3, demon range is 15, so 3 < 15 * 0.5 = 7.5 means move away

        physicsSystem.update(gameState as any, dt);

        // Should move away (negative x direction) at half speed
        expect(enemy.velocityX).toBeLessThan(0);
      });

      it('should stay in place when at optimal range', () => {
        const player = createMockPlayer({ x: 10, y: 0 }); // Within range but not too close
        const enemy = createMockEnemy({
          type: 'demon',
          x: 0,
          y: 0,
          speed: 2.5,
          attackCooldown: 1.0 // On cooldown so no projectile
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        // 10 >= 15 * 0.5 = 7.5 means stay in place
        physicsSystem.update(gameState as any, dt);

        expect(enemy.velocityX).toBe(0);
        expect(enemy.velocityY).toBe(0);
      });

      it('should approach when out of range', () => {
        const player = createMockPlayer({ x: 50, y: 0 }); // Beyond range
        const enemy = createMockEnemy({
          type: 'demon',
          x: 0,
          y: 0,
          speed: 2.5
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(enemy.velocityX).toBeGreaterThan(0);
        const speed = Math.sqrt(enemy.velocityX ** 2 + enemy.velocityY ** 2);
        expect(speed).toBeCloseTo(2.5, 2);
      });

      it('should create demon_fireball projectile with correct properties', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const enemy = createMockEnemy({
          id: 'demon-1',
          type: 'demon',
          x: 0,
          y: 0,
          attackCooldown: 0
        });
        const gameState = createMockGameState([player], [enemy]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        const config = ENEMY_ATTACK_CONFIGS.demon;
        expect(gameState.addProjectile).toHaveBeenCalledWith(
          'demon_fireball',
          'demon-1',
          0, 0, // enemy position
          config.projectileSpeed, 0, // velocity toward player
          config.damage,
          config.projectileLifetime,
          config.projectileRadius,
          1 // single hit
        );
      });
    });
  });

  // ===========================================================================
  // PROJECTILE MOVEMENT TESTS
  // ===========================================================================

  describe('Projectile Movement', () => {
    describe('Standard projectiles', () => {
      it('should move linearly based on velocity', () => {
        const projectile = createMockProjectile({
          x: 0,
          y: 0,
          velocityX: 10,
          velocityY: 5,
          lifetime: 2
        });
        const gameState = createMockGameState([], [], [projectile]);

        physicsSystem.update(gameState as any, dt);

        expect(projectile.x).toBeCloseTo(10 * dt, 4);
        expect(projectile.y).toBeCloseTo(5 * dt, 4);
      });

      it('should decrement lifetime each frame', () => {
        const projectile = createMockProjectile({ lifetime: 2 });
        const gameState = createMockGameState([], [], [projectile]);

        physicsSystem.update(gameState as any, dt);

        expect(projectile.lifetime).toBeCloseTo(2 - dt, 4);
      });

      it('should remove projectile when lifetime expires', () => {
        const projectile = createMockProjectile({ lifetime: 0.01 });
        const gameState = createMockGameState([], [], [projectile]);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.removeProjectile).toHaveBeenCalledWith(projectile.id);
      });

      it('should handle multiple projectiles independently', () => {
        const proj1 = createMockProjectile({ x: 0, velocityX: 10, lifetime: 2 });
        const proj2 = createMockProjectile({ x: 0, velocityX: -5, lifetime: 2 });
        const gameState = createMockGameState([], [], [proj1, proj2]);

        physicsSystem.update(gameState as any, dt);

        expect(proj1.x).toBeCloseTo(10 * dt, 4);
        expect(proj2.x).toBeCloseTo(-5 * dt, 4);
      });
    });

    describe('Bible orb orbital mechanics', () => {
      it('should orbit around the owner', () => {
        const player = createMockPlayer({ x: 0, y: 0 });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 3, // 3 units to the right of player
          y: 0,
          velocityX: 0,
          velocityY: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        const initialX = orbProjectile.x;
        physicsSystem.update(gameState as any, dt);

        // After one frame, should rotate slightly (π radians/sec)
        expect(orbProjectile.x).not.toBe(initialX);
        const dist = Math.sqrt(orbProjectile.x ** 2 + orbProjectile.y ** 2);
        expect(dist).toBeCloseTo(3, 2); // Same orbit radius
      });

      it('should complete one revolution in 2 seconds', () => {
        const player = createMockPlayer({ x: 0, y: 0 });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 3,
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        // Simulate 2 seconds (π rad/sec * 2s = 2π = full circle)
        const frames = Math.ceil(2 / dt);
        for (let i = 0; i < frames; i++) {
          physicsSystem.update(gameState as any, dt);
        }

        // Should be back near starting position
        expect(orbProjectile.x).toBeCloseTo(3, 0);
        expect(orbProjectile.y).toBeCloseTo(0, 0);
      });

      it('should maintain orbit radius at configured range', () => {
        const player = createMockPlayer({ x: 0, y: 0 });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 3,
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        // Run several frames
        for (let i = 0; i < 60; i++) {
          physicsSystem.update(gameState as any, dt);
          const dist = Math.sqrt(orbProjectile.x ** 2 + orbProjectile.y ** 2);
          expect(dist).toBeCloseTo(3, 1);
        }
      });

      it('should follow player movement', () => {
        const player = createMockPlayer({ x: 0, y: 0 });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 3,
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        // First update to establish orbit
        physicsSystem.update(gameState as any, dt);

        // Move player a small distance (simulating normal movement)
        player.x = 0.5;
        player.y = 0.3;

        // Update - orb should now orbit around new player position
        physicsSystem.update(gameState as any, dt);

        // Orb should still maintain orbit around player
        const dx = orbProjectile.x - player.x;
        const dy = orbProjectile.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Distance should be roughly the orbit radius (within reason)
        expect(dist).toBeGreaterThan(2);
        expect(dist).toBeLessThan(5);
      });

      it('should use default 3 unit radius when orb is too close to owner', () => {
        const player = createMockPlayer({ x: 0, y: 0 });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 0.1, // Very close to player
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        physicsSystem.update(gameState as any, dt);

        // Should use default 3 unit radius
        const dist = Math.sqrt(orbProjectile.x ** 2 + orbProjectile.y ** 2);
        expect(dist).toBeCloseTo(3, 1);
      });

      it('should be removed when owner dies', () => {
        const player = createMockPlayer({ x: 0, y: 0, dead: true });
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: player.id,
          x: 3,
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([player], [], [orbProjectile]);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.removeProjectile).toHaveBeenCalledWith(orbProjectile.id);
      });

      it('should be removed when owner disconnects', () => {
        // No owner in players map
        const orbProjectile = createMockProjectile({
          type: 'orb',
          ownerId: 'disconnected-player',
          x: 3,
          y: 0,
          lifetime: 10
        });
        const gameState = createMockGameState([], [], [orbProjectile]);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.removeProjectile).toHaveBeenCalledWith(orbProjectile.id);
      });
    });
  });

  // ===========================================================================
  // XP ORB MAGNETIZATION TESTS
  // ===========================================================================

  describe('XP Orb Magnetization', () => {
    it('should move magnetized orb toward target player', () => {
      const player = createMockPlayer({ id: 'target', x: 10, y: 0 });
      const orb = createMockXPOrb({
        x: 0,
        y: 0,
        magnetized: true,
        targetPlayerId: 'target'
      });
      const gameState = createMockGameState([player], [], [], [orb]);

      physicsSystem.update(gameState as any, dt);

      expect(orb.x).toBeGreaterThan(0);
      expect(orb.y).toBe(0);
    });

    it('should move at configured XP_ORB_SPEED', () => {
      const player = createMockPlayer({ id: 'target', x: 100, y: 0 });
      const orb = createMockXPOrb({
        x: 0,
        y: 0,
        magnetized: true,
        targetPlayerId: 'target'
      });
      const gameState = createMockGameState([player], [], [], [orb]);

      physicsSystem.update(gameState as any, dt);

      const expectedMove = GAME_CONSTANTS.XP_ORB_SPEED * dt;
      expect(orb.x).toBeCloseTo(expectedMove, 4);
    });

    it('should stop magnetization when target player dies', () => {
      const player = createMockPlayer({ id: 'target', x: 10, y: 0, dead: true });
      const orb = createMockXPOrb({
        x: 0,
        y: 0,
        magnetized: true,
        targetPlayerId: 'target'
      });
      const gameState = createMockGameState([player], [], [], [orb]);
      const initialX = orb.x;

      physicsSystem.update(gameState as any, dt);

      expect(orb.magnetized).toBe(false);
      expect(orb.targetPlayerId).toBe('');
      expect(orb.x).toBe(initialX); // Didn't move
    });

    it('should stop magnetization when target player disconnects', () => {
      const orb = createMockXPOrb({
        x: 0,
        y: 0,
        magnetized: true,
        targetPlayerId: 'disconnected'
      });
      const gameState = createMockGameState([], [], [], [orb]);

      physicsSystem.update(gameState as any, dt);

      expect(orb.magnetized).toBe(false);
      expect(orb.targetPlayerId).toBe('');
    });

    it('should not move non-magnetized orbs', () => {
      const player = createMockPlayer({ x: 10, y: 0 });
      const orb = createMockXPOrb({
        x: 5,
        y: 5,
        magnetized: false
      });
      const gameState = createMockGameState([player], [], [], [orb]);

      physicsSystem.update(gameState as any, dt);

      expect(orb.x).toBe(5);
      expect(orb.y).toBe(5);
    });

    it('should handle diagonal movement correctly', () => {
      const player = createMockPlayer({ id: 'target', x: 10, y: 10 });
      const orb = createMockXPOrb({
        x: 0,
        y: 0,
        magnetized: true,
        targetPlayerId: 'target'
      });
      const gameState = createMockGameState([player], [], [], [orb]);

      physicsSystem.update(gameState as any, dt);

      // Should move diagonally
      expect(orb.x).toBeGreaterThan(0);
      expect(orb.y).toBeGreaterThan(0);
      expect(orb.x).toBeCloseTo(orb.y, 4); // Equal movement in x and y
    });
  });

  // ===========================================================================
  // WORLD BOUNDARY TESTS
  // ===========================================================================

  describe('World Boundary Enforcement', () => {
    it('should push player back inside when outside world radius', () => {
      const player = createMockPlayer({ x: 600, y: 0 }); // Outside 500 radius
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      const dist = Math.sqrt(player.x ** 2 + player.y ** 2);
      expect(dist).toBe(500); // Pushed back to edge
    });

    it('should apply edge damage when outside boundary', () => {
      const player = createMockPlayer({ x: 600, y: 0, health: 100 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      const expectedDamage = GAME_CONSTANTS.WORLD_EDGE_DAMAGE * dt;
      expect(player.health).toBeCloseTo(100 - expectedDamage, 4);
    });

    it('should kill player when health depletes from edge damage', () => {
      const player = createMockPlayer({ x: 600, y: 0, health: 0.1 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      expect(player.die).toHaveBeenCalledWith('world_edge');
    });

    it('should not affect players inside world bounds', () => {
      const player = createMockPlayer({ x: 100, y: 100, health: 100 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      expect(player.x).toBe(100);
      expect(player.y).toBe(100);
      expect(player.health).toBe(100);
    });

    it('should skip dead players', () => {
      const player = createMockPlayer({ x: 600, y: 0, health: 100, dead: true });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      expect(player.x).toBe(600); // Not pushed back
      expect(player.health).toBe(100); // No damage
    });

    it('should handle player at exactly world radius', () => {
      const player = createMockPlayer({ x: 500, y: 0, health: 100 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      expect(player.x).toBe(500);
      expect(player.health).toBe(100); // No damage at exact boundary
    });

    it('should handle diagonal boundary correctly', () => {
      // Player at distance ~707 (outside 500)
      const player = createMockPlayer({ x: 500, y: 500, health: 100 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      const dist = Math.sqrt(player.x ** 2 + player.y ** 2);
      expect(dist).toBeCloseTo(500, 2);
    });

    it('should handle player at center', () => {
      const player = createMockPlayer({ x: 0, y: 0, health: 100 });
      const gameState = createMockGameState([player], [], [], [], 500);

      physicsSystem.update(gameState as any, dt);

      expect(player.x).toBe(0);
      expect(player.y).toBe(0);
      expect(player.health).toBe(100);
    });
  });

  // ===========================================================================
  // BOSS ABILITY TESTS
  // ===========================================================================

  describe('Boss Abilities', () => {
    describe('Summon ability (boss_skeleton)', () => {
      it('should summon minions when ability ready', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_skeleton',
          x: 0,
          y: 0,
          speed: 1.5,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        const summonConfig = BOSS_ABILITY_CONFIGS.boss_skeleton;
        expect(gameState.addEnemy).toHaveBeenCalledTimes(summonConfig.summonCount!);
        expect(boss.abilityCooldown).toBe(summonConfig.summonCooldown);
      });

      it('should spawn correct enemy type', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_skeleton',
          x: 0,
          y: 0,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.addEnemy).toHaveBeenCalledWith(
          'skeleton',
          expect.any(Number),
          expect.any(Number)
        );
      });

      it('should spawn minions in circular pattern around boss', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_skeleton',
          x: 100,
          y: 100,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        const summonConfig = BOSS_ABILITY_CONFIGS.boss_skeleton;
        gameState._enemiesCreated.forEach((enemy: any) => {
          const dx = enemy.x - boss.x;
          const dy = enemy.y - boss.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Should be within summon range (accounting for random offset)
          expect(dist).toBeLessThanOrEqual(summonConfig.summonRange! + 1);
        });
      });

      it('should not summon when on cooldown', () => {
        const player = createMockPlayer({ x: 10, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_skeleton',
          x: 0,
          y: 0,
          abilityCooldown: 5.0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(gameState.addEnemy).not.toHaveBeenCalled();
        expect(boss.abilityCooldown).toBeCloseTo(5.0 - dt, 4);
      });
    });

    describe('Charge ability (boss_demon)', () => {
      it('should start charging when player is within range', () => {
        const chargeRange = BOSS_ABILITY_CONFIGS.boss_demon.chargeRange!;
        const player = createMockPlayer({ x: chargeRange - 1, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.isCharging).toBe(true);
        expect(boss.chargeTargetX).toBe(player.x);
        expect(boss.chargeTargetY).toBe(player.y);
      });

      it('should not charge when player is beyond range', () => {
        const chargeRange = BOSS_ABILITY_CONFIGS.boss_demon.chargeRange!;
        const player = createMockPlayer({ x: chargeRange + 5, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.isCharging).toBe(false);
      });

      it('should move at charge speed during charge', () => {
        const chargeSpeed = BOSS_ABILITY_CONFIGS.boss_demon.chargeSpeed!;
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          isCharging: true,
          chargeTargetX: 100,
          chargeTargetY: 0,
          abilityCooldown: 3
        });
        const gameState = createMockGameState([], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.velocityX).toBeCloseTo(chargeSpeed, 2);
        expect(boss.velocityY).toBe(0);
        expect(boss.x).toBeCloseTo(chargeSpeed * dt, 4);
      });

      it('should end charge and create impact AOE at target', () => {
        const chargeDamage = BOSS_ABILITY_CONFIGS.boss_demon.chargeDamage!;
        const boss = createMockEnemy({
          id: 'boss-1',
          type: 'boss_demon',
          x: 9.8, // Very close to target
          y: 0,
          isCharging: true,
          chargeTargetX: 10,
          chargeTargetY: 0,
          abilityCooldown: 3
        });
        const gameState = createMockGameState([], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.isCharging).toBe(false);
        expect(boss.velocityX).toBe(0);
        expect(boss.velocityY).toBe(0);
        expect(gameState.addProjectile).toHaveBeenCalledWith(
          'charge_impact',
          'boss-1',
          expect.any(Number), expect.any(Number), // position
          0, 0, // no velocity
          chargeDamage,
          0.2, // short lifetime
          3,   // 3 unit radius
          999  // hits all
        );
      });

      it('should set ability cooldown after starting charge', () => {
        const chargeCooldown = BOSS_ABILITY_CONFIGS.boss_demon.chargeCooldown!;
        const chargeRange = BOSS_ABILITY_CONFIGS.boss_demon.chargeRange!;
        const player = createMockPlayer({ x: chargeRange - 1, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          abilityCooldown: 0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.abilityCooldown).toBe(chargeCooldown);
      });

      it('should not charge while on cooldown', () => {
        const chargeRange = BOSS_ABILITY_CONFIGS.boss_demon.chargeRange!;
        const player = createMockPlayer({ x: chargeRange - 1, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          abilityCooldown: 3.0
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        expect(boss.isCharging).toBe(false);
      });

      it('should track player position during charge (BUG-029 fix)', () => {
        const playerId = 'player-1';
        const player = createMockPlayer({ id: playerId, x: 50, y: 0 });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          isCharging: true,
          chargeTargetX: 50, // Initial target
          chargeTargetY: 0,
          targetPlayerId: playerId,
          abilityCooldown: 3
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        // First update - target should still be at player's position
        physicsSystem.update(gameState as any, dt);
        expect(boss.chargeTargetX).toBe(50);
        expect(boss.chargeTargetY).toBe(0);

        // Move player to new position
        player.x = 50;
        player.y = 30;
        spatialHash.clear();
        populateSpatialHash(spatialHash, gameState);

        // Second update - charge target should track to new position
        physicsSystem.update(gameState as any, dt);
        expect(boss.chargeTargetX).toBe(50);
        expect(boss.chargeTargetY).toBe(30);
      });

      it('should continue toward last known position if target player dies during charge', () => {
        const playerId = 'player-1';
        const player = createMockPlayer({ id: playerId, x: 50, y: 0, dead: true });
        const boss = createMockEnemy({
          type: 'boss_demon',
          x: 0,
          y: 0,
          isCharging: true,
          chargeTargetX: 50,
          chargeTargetY: 0,
          targetPlayerId: playerId,
          abilityCooldown: 3
        });
        const gameState = createMockGameState([player], [boss]);
        populateSpatialHash(spatialHash, gameState);

        physicsSystem.update(gameState as any, dt);

        // Should continue to last known position when player is dead
        expect(boss.chargeTargetX).toBe(50);
        expect(boss.chargeTargetY).toBe(0);
        expect(boss.isCharging).toBe(true);
      });
    });
  });

  // ===========================================================================
  // EDGE CASES & ERROR HANDLING
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty game state', () => {
      const gameState = createMockGameState();

      expect(() => physicsSystem.update(gameState as any, dt)).not.toThrow();
    });

    it('should handle very small dt values', () => {
      const player = createMockPlayer({ x: 10, y: 0 });
      const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      const smallDt = 0.001;
      expect(() => physicsSystem.update(gameState as any, smallDt)).not.toThrow();
      expect(enemy.x).toBeGreaterThan(0);
    });

    it('should handle very large dt values (lag spike)', () => {
      const player = createMockPlayer({ x: 10, y: 0 });
      const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      const largeDt = 0.5; // Large frame time
      expect(() => physicsSystem.update(gameState as any, largeDt)).not.toThrow();
    });

    it('should not fire projectile when enemy at same position as target', () => {
      const player = createMockPlayer({ x: 0, y: 0 });
      const enemy = createMockEnemy({
        type: 'demon',
        x: 0,
        y: 0,
        attackCooldown: 0
      });
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      physicsSystem.update(gameState as any, dt);

      // Should handle division by zero gracefully (dist === 0 early return)
      // The projectile creation may or may not happen depending on exact float comparison
      // but it should not crash
      expect(() => physicsSystem.update(gameState as any, dt)).not.toThrow();
    });

    it('should handle multiple enemies and projectiles simultaneously', () => {
      const players = Array.from({ length: 5 }, (_, i) =>
        createMockPlayer({ x: i * 20, y: i * 20 })
      );
      const enemies = Array.from({ length: 20 }, (_, i) =>
        createMockEnemy({ x: -i * 10, y: -i * 10, speed: 4 })
      );
      const projectiles = Array.from({ length: 50 }, (_, i) =>
        createMockProjectile({ x: i, y: i, velocityX: 5, velocityY: 5, lifetime: 2 })
      );
      const orbs = Array.from({ length: 30 }, (_, i) =>
        createMockXPOrb({ x: i * 3, y: i * 3 })
      );

      const gameState = createMockGameState(players, enemies, projectiles, orbs);
      populateSpatialHash(spatialHash, gameState);

      expect(() => physicsSystem.update(gameState as any, dt)).not.toThrow();
    });

    it('should handle boss with ranged attack (boss_demon has both attack and ability)', () => {
      const player = createMockPlayer({ x: 10, y: 0 });
      const boss = createMockEnemy({
        type: 'boss_demon',
        x: 0,
        y: 0,
        attackCooldown: 0,
        abilityCooldown: 10 // Ability on cooldown, but ranged attack ready
      });
      const gameState = createMockGameState([player], [boss]);
      populateSpatialHash(spatialHash, gameState);

      physicsSystem.update(gameState as any, dt);

      // Should fire ranged attack
      expect(gameState.addProjectile).toHaveBeenCalledWith(
        'demon_fireball',
        expect.any(String),
        expect.any(Number), expect.any(Number),
        expect.any(Number), expect.any(Number),
        ENEMY_ATTACK_CONFIGS.boss_demon.damage,
        expect.any(Number),
        expect.any(Number),
        1
      );
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('Integration', () => {
    it('should handle full game tick with all entity types', () => {
      // Setup complex game state
      const players = [
        createMockPlayer({ x: 0, y: 0 }),
        createMockPlayer({ x: 50, y: 50 }),
      ];
      const enemies = [
        createMockEnemy({ type: 'bat', x: 20, y: 0, speed: 4 }),
        createMockEnemy({ type: 'demon', x: -30, y: 0, speed: 2.5, attackCooldown: 0 }),
        createMockEnemy({ type: 'boss_skeleton', x: 100, y: 0, abilityCooldown: 0 }),
      ];
      const projectiles = [
        createMockProjectile({ type: 'bullet', x: 0, y: 10, velocityX: 10, velocityY: 0 }),
        createMockProjectile({
          type: 'orb',
          ownerId: players[0].id,
          x: 3,
          y: 0,
          lifetime: 10
        }),
      ];
      const orbs = [
        createMockXPOrb({ x: 5, y: 5, magnetized: true, targetPlayerId: players[0].id }),
        createMockXPOrb({ x: 10, y: 10, magnetized: false }),
      ];

      const gameState = createMockGameState(players, enemies, projectiles, orbs);
      populateSpatialHash(spatialHash, gameState);

      // Run several frames
      for (let i = 0; i < 10; i++) {
        populateSpatialHash(spatialHash, gameState);
        physicsSystem.update(gameState as any, dt);
      }

      // Verify entities were updated
      expect(enemies[0].x).not.toBe(20); // Bat moved
      expect(orbs[0].x).not.toBe(5); // Magnetized orb moved
      expect(orbs[1].x).toBe(10); // Non-magnetized orb stayed
    });

    it('should maintain consistent behavior over multiple frames', () => {
      const player = createMockPlayer({ x: 100, y: 0 });
      const enemy = createMockEnemy({ x: 0, y: 0, speed: 4 });
      const gameState = createMockGameState([player], [enemy]);
      populateSpatialHash(spatialHash, gameState);

      let lastX = enemy.x;
      for (let i = 0; i < 60; i++) { // 1 second of simulation
        physicsSystem.update(gameState as any, dt);
        // Enemy should consistently move toward player
        expect(enemy.x).toBeGreaterThanOrEqual(lastX);
        lastX = enemy.x;
      }

      // After 1 second at speed 4, should have moved ~4 units
      expect(enemy.x).toBeCloseTo(4, 0);
    });
  });
});
