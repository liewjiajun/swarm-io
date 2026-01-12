import type { Vector2 } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Calculate distance between two points
 */
export function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize a vector
 */
export function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Lerp between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Random float between min and max
 */
export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Random point on circle edge
 */
export function randomPointOnCircle(radius: number): Vector2 {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/**
 * Check if point is within radius
 */
export function withinRadius(a: Vector2, b: Vector2, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Direction from a to b (normalized)
 */
export function direction(from: Vector2, to: Vector2): Vector2 {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}