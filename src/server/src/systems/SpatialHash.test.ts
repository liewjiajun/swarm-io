import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash, SpatialEntity } from './SpatialHash';

describe('SpatialHash', () => {
  let spatialHash: SpatialHash;

  beforeEach(() => {
    spatialHash = new SpatialHash(50);
  });

  describe('constructor', () => {
    it('should create an empty spatial hash', () => {
      const hash = new SpatialHash();
      expect(hash.queryRadius(0, 0, 100)).toHaveLength(0);
    });

    it('should accept custom cell size', () => {
      const hash = new SpatialHash(100);
      expect(hash.queryRadius(0, 0, 100)).toHaveLength(0);
    });
  });

  describe('insert', () => {
    it('should insert an entity', () => {
      const entity: SpatialEntity = {
        id: 'test1',
        x: 10,
        y: 10,
        type: 'player',
        entity: {},
      };
      spatialHash.insert(entity);
      const results = spatialHash.queryRadius(10, 10, 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test1');
    });

    it('should insert multiple entities', () => {
      for (let i = 0; i < 10; i++) {
        spatialHash.insert({
          id: `entity${i}`,
          x: i * 5,
          y: i * 5,
          type: 'enemy',
          entity: {},
        });
      }
      const results = spatialHash.queryRadius(25, 25, 100);
      expect(results.length).toBe(10);
    });

    it('should handle negative coordinates', () => {
      spatialHash.insert({
        id: 'negative',
        x: -100,
        y: -100,
        type: 'player',
        entity: {},
      });
      const results = spatialHash.queryRadius(-100, -100, 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all entities', () => {
      spatialHash.insert({ id: 'e1', x: 0, y: 0, type: 'player', entity: {} });
      spatialHash.insert({ id: 'e2', x: 10, y: 10, type: 'enemy', entity: {} });
      spatialHash.clear();
      expect(spatialHash.queryRadius(0, 0, 100)).toHaveLength(0);
    });
  });

  describe('queryRadius', () => {
    beforeEach(() => {
      // Create a grid of entities
      for (let x = -100; x <= 100; x += 20) {
        for (let y = -100; y <= 100; y += 20) {
          spatialHash.insert({
            id: `e_${x}_${y}`,
            x,
            y,
            type: 'enemy',
            entity: {},
          });
        }
      }
    });

    it('should return entities within radius', () => {
      const results = spatialHash.queryRadius(0, 0, 25);
      // Should find entities at (0,0), (0,20), (20,0), (0,-20), (-20,0)
      expect(results.length).toBeGreaterThan(0);
      results.forEach((entity) => {
        const dist = Math.sqrt(entity.x * entity.x + entity.y * entity.y);
        expect(dist).toBeLessThanOrEqual(25);
      });
    });

    it('should return empty array when no entities in range', () => {
      const results = spatialHash.queryRadius(500, 500, 10);
      expect(results).toHaveLength(0);
    });

    it('should filter by type', () => {
      // Add a player
      spatialHash.insert({ id: 'player1', x: 0, y: 0, type: 'player', entity: {} });

      const enemies = spatialHash.queryRadius(0, 0, 50, 'enemy');
      const players = spatialHash.queryRadius(0, 0, 50, 'player');

      expect(enemies.every((e) => e.type === 'enemy')).toBe(true);
      expect(players.every((e) => e.type === 'player')).toBe(true);
    });

    it('should handle large radius queries', () => {
      const results = spatialHash.queryRadius(0, 0, 1000);
      // All 11x11 = 121 entities should be found
      expect(results).toHaveLength(121);
    });

    it('should handle zero radius', () => {
      // Only entities exactly at the query point
      const results = spatialHash.queryRadius(0, 0, 0);
      expect(results).toHaveLength(1);
      expect(results[0].x).toBe(0);
      expect(results[0].y).toBe(0);
    });
  });

  describe('queryNearestOfType', () => {
    beforeEach(() => {
      spatialHash.insert({ id: 'e1', x: 10, y: 0, type: 'enemy', entity: {} });
      spatialHash.insert({ id: 'e2', x: 20, y: 0, type: 'enemy', entity: {} });
      spatialHash.insert({ id: 'e3', x: 5, y: 0, type: 'enemy', entity: {} });
      spatialHash.insert({ id: 'p1', x: 3, y: 0, type: 'player', entity: {} });
    });

    it('should find the nearest entity of a type', () => {
      const nearest = spatialHash.queryNearestOfType(0, 0, 'enemy', 50);
      expect(nearest).not.toBeNull();
      expect(nearest!.id).toBe('e3'); // Closest enemy at x=5
    });

    it('should respect type filter', () => {
      const nearestPlayer = spatialHash.queryNearestOfType(0, 0, 'player', 50);
      expect(nearestPlayer).not.toBeNull();
      expect(nearestPlayer!.id).toBe('p1');
    });

    it('should return null when no entities of type within radius', () => {
      const result = spatialHash.queryNearestOfType(0, 0, 'xp', 50);
      expect(result).toBeNull();
    });

    it('should return null when type exists but outside radius', () => {
      const result = spatialHash.queryNearestOfType(0, 0, 'enemy', 2);
      expect(result).toBeNull();
    });

    it('should handle ties by returning any nearest', () => {
      spatialHash.clear();
      spatialHash.insert({ id: 'a', x: 5, y: 0, type: 'enemy', entity: {} });
      spatialHash.insert({ id: 'b', x: -5, y: 0, type: 'enemy', entity: {} });
      const nearest = spatialHash.queryNearestOfType(0, 0, 'enemy', 10);
      expect(nearest).not.toBeNull();
      expect(['a', 'b']).toContain(nearest!.id);
    });
  });

  describe('cross-cell queries', () => {
    it('should find entities across cell boundaries', () => {
      const hash = new SpatialHash(10); // Small cells
      hash.insert({ id: 'e1', x: 9, y: 9, type: 'enemy', entity: {} });
      hash.insert({ id: 'e2', x: 11, y: 11, type: 'enemy', entity: {} });

      // Query point at boundary should find both
      const results = hash.queryRadius(10, 10, 5);
      expect(results).toHaveLength(2);
    });
  });

  describe('performance characteristics', () => {
    it('should handle thousands of entities', () => {
      const largeHash = new SpatialHash(50);
      for (let i = 0; i < 5000; i++) {
        largeHash.insert({
          id: `e${i}`,
          x: Math.random() * 1000 - 500,
          y: Math.random() * 1000 - 500,
          type: 'enemy',
          entity: {},
        });
      }

      // Should complete quickly even with many entities
      const start = performance.now();
      const results = largeHash.queryRadius(0, 0, 50);
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should be fast
    });
  });
});
