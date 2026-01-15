import * as THREE from 'three';
import type { SpriteLoader, SpriteUVs } from './SpriteLoader';

/**
 * AnimationController - Frame-based sprite animation system
 *
 * This system provides:
 * - Definition of animation sequences with frame data
 * - Time-based frame advancement
 * - Support for looping and one-shot animations
 * - Direction-based animation selection (for walk cycles)
 * - Integration with both THREE.Sprite and InstancedMesh
 *
 * Animation Naming Convention:
 * - Single animations: "idle", "attack", "death"
 * - Directional animations: "walk_down", "walk_up", "walk_left", "walk_right"
 * - Frame suffix: "idle_0", "idle_1", etc. (for atlas lookup)
 */

/**
 * Single frame in an animation sequence
 */
export interface AnimationFrame {
  /** Sprite name in the atlas (e.g., "player_idle_0") */
  spriteName: string;
  /** Duration of this frame in seconds */
  duration: number;
  /** Optional UV coordinates (cached after first lookup) */
  uvs?: SpriteUVs;
}

/**
 * Complete animation sequence definition
 */
export interface AnimationSequence {
  /** Unique name for this animation */
  name: string;
  /** Array of frames in the sequence */
  frames: AnimationFrame[];
  /** Whether the animation loops (default: true) */
  loop?: boolean;
  /** Callback when animation completes (for non-looping animations) */
  onComplete?: () => void;
}

/**
 * Direction for directional animations (4-way or 8-way)
 */
export type Direction = 'down' | 'up' | 'left' | 'right' | 'down_left' | 'down_right' | 'up_left' | 'up_right';

/**
 * Animation state for a single entity
 */
export interface AnimationState {
  /** Current animation name */
  currentAnimation: string;
  /** Current frame index */
  frameIndex: number;
  /** Time accumulated on current frame */
  frameTime: number;
  /** Current direction (for directional animations) */
  direction: Direction;
  /** Whether the animation is playing */
  playing: boolean;
  /** Speed multiplier (1.0 = normal) */
  speed: number;
}

/**
 * Animation definition for an entity type
 */
export interface EntityAnimations {
  /** Default/idle animation name */
  defaultAnimation: string;
  /** Map of animation name to sequence */
  animations: Map<string, AnimationSequence>;
}

/**
 * AnimationController - Manages frame-based sprite animations
 */
export class AnimationController {
  /** Map of entity type to animation definitions */
  private entityAnimations: Map<string, EntityAnimations> = new Map();

  /** Reference to sprite loader for UV lookups */
  private spriteLoader: SpriteLoader | null = null;

  /** Atlas name for sprite lookups */
  private atlasName: string = '';

  /**
   * Create a new AnimationController
   * @param spriteLoader - Optional SpriteLoader for UV coordinate lookups
   * @param atlasName - Name of the atlas to use for sprite lookups
   */
  constructor(spriteLoader?: SpriteLoader, atlasName?: string) {
    if (spriteLoader) {
      this.spriteLoader = spriteLoader;
      this.atlasName = atlasName || '';
    }
  }

  /**
   * Set the sprite loader for UV lookups
   * @param loader - The SpriteLoader instance
   * @param atlasName - Name of the atlas
   */
  setSpriteLoader(loader: SpriteLoader, atlasName: string): void {
    this.spriteLoader = loader;
    this.atlasName = atlasName;
  }

  /**
   * Register animations for an entity type
   * @param entityType - Type of entity (e.g., "player", "bat", "skeleton")
   * @param animations - Animation definitions
   */
  registerEntityAnimations(entityType: string, animations: EntityAnimations): void {
    this.entityAnimations.set(entityType, animations);
    console.log(`[AnimationController] Registered ${animations.animations.size} animations for "${entityType}"`);
  }

  /**
   * Create animation definitions from a simple format
   * This is a helper for defining animations easily
   *
   * @param entityType - Type of entity
   * @param defaultAnimation - Name of the default animation
   * @param animationDefs - Object with animation definitions
   *
   * @example
   * controller.defineAnimations('player', 'idle', {
   *   idle: { frames: ['player_idle_0', 'player_idle_1'], frameDuration: 0.5, loop: true },
   *   walk_down: { frames: ['player_walk_down_0', 'player_walk_down_1', ...], frameDuration: 0.15 },
   *   attack: { frames: ['player_attack_0', 'player_attack_1'], frameDuration: 0.1, loop: false }
   * });
   */
  defineAnimations(
    entityType: string,
    defaultAnimation: string,
    animationDefs: Record<string, {
      frames: string[];
      frameDuration: number;
      loop?: boolean;
      onComplete?: () => void;
    }>
  ): void {
    const animations = new Map<string, AnimationSequence>();

    for (const [name, def] of Object.entries(animationDefs)) {
      const sequence: AnimationSequence = {
        name,
        frames: def.frames.map(spriteName => ({
          spriteName,
          duration: def.frameDuration
        })),
        loop: def.loop !== false, // Default to true
        onComplete: def.onComplete
      };
      animations.set(name, sequence);
    }

    this.entityAnimations.set(entityType, {
      defaultAnimation,
      animations
    });
  }

  /**
   * Create a new animation state for an entity
   * @param entityType - Type of entity
   * @returns New animation state
   */
  createState(entityType: string): AnimationState {
    const entityAnims = this.entityAnimations.get(entityType);
    const defaultAnim = entityAnims?.defaultAnimation || 'idle';

    return {
      currentAnimation: defaultAnim,
      frameIndex: 0,
      frameTime: 0,
      direction: 'down',
      playing: true,
      speed: 1.0
    };
  }

  /**
   * Update an animation state by delta time
   * @param state - Animation state to update
   * @param entityType - Type of entity
   * @param dt - Delta time in seconds
   * @returns True if frame changed
   */
  update(state: AnimationState, entityType: string, dt: number): boolean {
    if (!state.playing) return false;

    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) return false;

    const sequence = entityAnims.animations.get(state.currentAnimation);
    if (!sequence || sequence.frames.length === 0) return false;

    const oldFrameIndex = state.frameIndex;

    // Accumulate time on current frame
    state.frameTime += dt * state.speed;

    // Get current frame duration
    const currentFrame = sequence.frames[state.frameIndex];
    if (!currentFrame) return false;

    // Check if frame duration exceeded
    while (state.frameTime >= currentFrame.duration) {
      state.frameTime -= currentFrame.duration;
      state.frameIndex++;

      // Handle animation end
      if (state.frameIndex >= sequence.frames.length) {
        if (sequence.loop !== false) {
          // Loop back to start
          state.frameIndex = 0;
        } else {
          // Stop at last frame
          state.frameIndex = sequence.frames.length - 1;
          state.playing = false;

          // Trigger completion callback
          if (sequence.onComplete) {
            sequence.onComplete();
          }
        }
      }
    }

    return state.frameIndex !== oldFrameIndex;
  }

  /**
   * Set the current animation for a state
   * @param state - Animation state
   * @param entityType - Entity type
   * @param animationName - Name of animation to play
   * @param restart - Whether to restart if same animation (default: false)
   */
  setAnimation(
    state: AnimationState,
    entityType: string,
    animationName: string,
    restart: boolean = false
  ): void {
    // Check if animation exists
    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) {
      console.warn(`[AnimationController] No animations for entity type "${entityType}"`);
      return;
    }

    if (!entityAnims.animations.has(animationName)) {
      console.warn(`[AnimationController] Animation "${animationName}" not found for "${entityType}"`);
      return;
    }

    // Don't restart if same animation (unless forced)
    if (state.currentAnimation === animationName && !restart) {
      return;
    }

    state.currentAnimation = animationName;
    state.frameIndex = 0;
    state.frameTime = 0;
    state.playing = true;
  }

  /**
   * Set animation based on movement direction
   * @param state - Animation state
   * @param entityType - Entity type
   * @param baseAnimation - Base animation name (e.g., "walk")
   * @param direction - Direction of movement
   */
  setDirectionalAnimation(
    state: AnimationState,
    entityType: string,
    baseAnimation: string,
    direction: Direction
  ): void {
    state.direction = direction;
    const animationName = `${baseAnimation}_${direction}`;
    this.setAnimation(state, entityType, animationName);
  }

  /**
   * Get direction from velocity vector
   * @param vx - Velocity X
   * @param vy - Velocity Y
   * @param use8Way - Whether to use 8-way directions (default: false = 4-way)
   * @returns Direction
   */
  getDirectionFromVelocity(vx: number, vy: number, use8Way: boolean = false): Direction {
    if (vx === 0 && vy === 0) {
      return 'down'; // Default facing direction
    }

    const angle = Math.atan2(vy, vx) * (180 / Math.PI);

    if (use8Way) {
      // 8-way directions (45° segments)
      if (angle >= -22.5 && angle < 22.5) return 'right';
      if (angle >= 22.5 && angle < 67.5) return 'down_right';
      if (angle >= 67.5 && angle < 112.5) return 'down';
      if (angle >= 112.5 && angle < 157.5) return 'down_left';
      if (angle >= 157.5 || angle < -157.5) return 'left';
      if (angle >= -157.5 && angle < -112.5) return 'up_left';
      if (angle >= -112.5 && angle < -67.5) return 'up';
      return 'up_right';
    } else {
      // 4-way directions (90° segments)
      if (angle >= -45 && angle < 45) return 'right';
      if (angle >= 45 && angle < 135) return 'down';
      if (angle >= 135 || angle < -135) return 'left';
      return 'up';
    }
  }

  /**
   * Get the current sprite name for an animation state
   * @param state - Animation state
   * @param entityType - Entity type
   * @returns Sprite name or null if not found
   */
  getCurrentSpriteName(state: AnimationState, entityType: string): string | null {
    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) return null;

    const sequence = entityAnims.animations.get(state.currentAnimation);
    if (!sequence) return null;

    const frame = sequence.frames[state.frameIndex];
    return frame?.spriteName || null;
  }

  /**
   * Get UV coordinates for the current animation frame
   * @param state - Animation state
   * @param entityType - Entity type
   * @returns UV coordinates or null if not found
   */
  getCurrentFrameUVs(state: AnimationState, entityType: string): SpriteUVs | null {
    if (!this.spriteLoader || !this.atlasName) {
      return null;
    }

    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) return null;

    const sequence = entityAnims.animations.get(state.currentAnimation);
    if (!sequence) return null;

    const frame = sequence.frames[state.frameIndex];
    if (!frame) return null;

    // Check cached UVs first
    if (frame.uvs) {
      return frame.uvs;
    }

    // Look up and cache UVs
    const uvs = this.spriteLoader.getSpriteUVs(this.atlasName, frame.spriteName);
    if (uvs) {
      frame.uvs = uvs;
    }
    return uvs;
  }

  /**
   * Apply animation frame to a THREE.Sprite
   * Updates the sprite's texture offset/repeat to show the current frame
   * @param sprite - THREE.Sprite to update
   * @param state - Animation state
   * @param entityType - Entity type
   * @returns True if sprite was updated
   */
  applyToSprite(sprite: THREE.Sprite, state: AnimationState, entityType: string): boolean {
    const uvs = this.getCurrentFrameUVs(state, entityType);
    if (!uvs) return false;

    const material = sprite.material as THREE.SpriteMaterial;
    if (!material.map) return false;

    // Update texture offset and repeat to show current frame
    material.map.offset.set(uvs.u0, uvs.v0);
    material.map.repeat.set(uvs.u1 - uvs.u0, uvs.v1 - uvs.v0);
    material.map.needsUpdate = true;

    // Update sprite scale based on frame size (maintain aspect ratio)
    const aspectRatio = uvs.pixelWidth / uvs.pixelHeight;
    const baseScale = 2; // Base sprite scale
    sprite.scale.set(baseScale * aspectRatio, baseScale, 1);

    return true;
  }

  /**
   * Get frame count for an animation
   * @param entityType - Entity type
   * @param animationName - Animation name
   * @returns Number of frames or 0 if not found
   */
  getFrameCount(entityType: string, animationName: string): number {
    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) return 0;

    const sequence = entityAnims.animations.get(animationName);
    return sequence?.frames.length || 0;
  }

  /**
   * Get total duration of an animation
   * @param entityType - Entity type
   * @param animationName - Animation name
   * @returns Duration in seconds or 0 if not found
   */
  getAnimationDuration(entityType: string, animationName: string): number {
    const entityAnims = this.entityAnimations.get(entityType);
    if (!entityAnims) return 0;

    const sequence = entityAnims.animations.get(animationName);
    if (!sequence) return 0;

    return sequence.frames.reduce((sum, frame) => sum + frame.duration, 0);
  }

  /**
   * Check if an entity type has animations registered
   * @param entityType - Entity type to check
   * @returns True if animations exist
   */
  hasAnimations(entityType: string): boolean {
    return this.entityAnimations.has(entityType);
  }

  /**
   * Get all animation names for an entity type
   * @param entityType - Entity type
   * @returns Array of animation names
   */
  getAnimationNames(entityType: string): string[] {
    const entityAnims = this.entityAnimations.get(entityType);
    return entityAnims ? Array.from(entityAnims.animations.keys()) : [];
  }

  /**
   * Pause an animation
   * @param state - Animation state
   */
  pause(state: AnimationState): void {
    state.playing = false;
  }

  /**
   * Resume a paused animation
   * @param state - Animation state
   */
  resume(state: AnimationState): void {
    state.playing = true;
  }

  /**
   * Reset animation to the beginning
   * @param state - Animation state
   */
  reset(state: AnimationState): void {
    state.frameIndex = 0;
    state.frameTime = 0;
    state.playing = true;
  }

  /**
   * Set animation playback speed
   * @param state - Animation state
   * @param speed - Speed multiplier (1.0 = normal, 2.0 = double speed)
   */
  setSpeed(state: AnimationState, speed: number): void {
    state.speed = Math.max(0.1, speed); // Minimum 0.1x speed
  }

  /**
   * Clear all registered animations
   */
  clear(): void {
    this.entityAnimations.clear();
    console.log('[AnimationController] All animations cleared');
  }
}

// Export singleton instance for convenience
export const animationController = new AnimationController();

/**
 * Helper function to create a simple animation sequence
 * @param baseName - Base sprite name (e.g., "player_idle")
 * @param frameCount - Number of frames
 * @param frameDuration - Duration of each frame in seconds
 * @param loop - Whether to loop
 * @returns Animation definition object
 */
export function createSimpleAnimation(
  baseName: string,
  frameCount: number,
  frameDuration: number,
  loop: boolean = true
): { frames: string[]; frameDuration: number; loop: boolean } {
  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(`${baseName}_${i}`);
  }
  return { frames, frameDuration, loop };
}

/**
 * Helper function to create a 4-direction walk animation set
 * @param entityName - Entity name prefix (e.g., "player")
 * @param frameCount - Frames per direction
 * @param frameDuration - Duration of each frame
 * @returns Object with walk_down, walk_up, walk_left, walk_right animations
 */
export function createWalkAnimations(
  entityName: string,
  frameCount: number,
  frameDuration: number
): Record<string, { frames: string[]; frameDuration: number; loop: boolean }> {
  const directions: Direction[] = ['down', 'up', 'left', 'right'];
  const result: Record<string, { frames: string[]; frameDuration: number; loop: boolean }> = {};

  for (const dir of directions) {
    result[`walk_${dir}`] = createSimpleAnimation(
      `${entityName}_walk_${dir}`,
      frameCount,
      frameDuration,
      true
    );
  }

  return result;
}
