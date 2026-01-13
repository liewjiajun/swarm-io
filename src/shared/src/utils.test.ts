import { describe, it, expect } from 'vitest';
import {
  generateId,
  distance,
  normalize,
  lerp,
  clamp,
  randomRange,
  randomPointOnCircle,
  withinRadius,
  direction,
} from './utils';

describe('generateId', () => {
  it('should generate a non-empty string', () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('distance', () => {
  it('should return 0 for same point', () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('should calculate horizontal distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    expect(distance({ x: 0, y: 0 }, { x: -3, y: 0 })).toBe(3);
  });

  it('should calculate vertical distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
    expect(distance({ x: 0, y: 0 }, { x: 0, y: -4 })).toBe(4);
  });

  it('should calculate diagonal distance (3-4-5 triangle)', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('normalize', () => {
  it('should return zero vector for zero input', () => {
    const result = normalize({ x: 0, y: 0 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('should normalize horizontal vector', () => {
    const result = normalize({ x: 5, y: 0 });
    expect(result.x).toBe(1);
    expect(result.y).toBe(0);
  });

  it('should normalize vertical vector', () => {
    const result = normalize({ x: 0, y: -5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(-1);
  });

  it('should normalize diagonal vector to unit length', () => {
    const result = normalize({ x: 3, y: 4 });
    const length = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(length).toBeCloseTo(1);
  });

  it('should preserve direction', () => {
    const result = normalize({ x: 3, y: 4 });
    expect(result.x).toBeCloseTo(0.6);
    expect(result.y).toBeCloseTo(0.8);
  });
});

describe('lerp', () => {
  it('should return a when t=0', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(50, 100, 0)).toBe(50);
  });

  it('should return b when t=1', () => {
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(50, 100, 1)).toBe(100);
  });

  it('should return midpoint when t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(20, 80, 0.5)).toBe(50);
  });

  it('should work with negative values', () => {
    expect(lerp(-100, 100, 0.5)).toBe(0);
  });

  it('should extrapolate beyond 0-1 range', () => {
    expect(lerp(0, 100, 2)).toBe(200);
    expect(lerp(0, 100, -1)).toBe(-100);
  });
});

describe('clamp', () => {
  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('should return min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should work with negative ranges', () => {
    expect(clamp(0, -10, -5)).toBe(-5);
    expect(clamp(-20, -10, -5)).toBe(-10);
  });
});

describe('randomRange', () => {
  it('should return values within range', () => {
    for (let i = 0; i < 100; i++) {
      const value = randomRange(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('should return min when range is zero', () => {
    const value = randomRange(5, 5);
    expect(value).toBe(5);
  });

  it('should work with negative ranges', () => {
    for (let i = 0; i < 100; i++) {
      const value = randomRange(-10, -5);
      expect(value).toBeGreaterThanOrEqual(-10);
      expect(value).toBeLessThanOrEqual(-5);
    }
  });
});

describe('randomPointOnCircle', () => {
  it('should return points on circle edge', () => {
    for (let i = 0; i < 100; i++) {
      const point = randomPointOnCircle(10);
      const dist = Math.sqrt(point.x * point.x + point.y * point.y);
      expect(dist).toBeCloseTo(10, 5);
    }
  });

  it('should return origin for zero radius', () => {
    const point = randomPointOnCircle(0);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
  });
});

describe('withinRadius', () => {
  it('should return true for same point', () => {
    expect(withinRadius({ x: 0, y: 0 }, { x: 0, y: 0 }, 5)).toBe(true);
  });

  it('should return true for point within radius', () => {
    expect(withinRadius({ x: 0, y: 0 }, { x: 3, y: 0 }, 5)).toBe(true);
    expect(withinRadius({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
  });

  it('should return true for point exactly at radius', () => {
    expect(withinRadius({ x: 0, y: 0 }, { x: 5, y: 0 }, 5)).toBe(true);
  });

  it('should return false for point outside radius', () => {
    expect(withinRadius({ x: 0, y: 0 }, { x: 6, y: 0 }, 5)).toBe(false);
    expect(withinRadius({ x: 0, y: 0 }, { x: 4, y: 4 }, 5)).toBe(false);
  });
});

describe('direction', () => {
  it('should return zero vector for same point', () => {
    const result = direction({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('should return normalized direction right', () => {
    const result = direction({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBe(1);
    expect(result.y).toBe(0);
  });

  it('should return normalized direction up', () => {
    const result = direction({ x: 0, y: 0 }, { x: 0, y: 10 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(1);
  });

  it('should return normalized diagonal direction', () => {
    const result = direction({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(result.x).toBeCloseTo(0.6);
    expect(result.y).toBeCloseTo(0.8);
  });
});
