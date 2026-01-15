import * as THREE from 'three';

/**
 * SpriteLoader - Texture atlas loading and sprite material management system
 *
 * This system provides:
 * - Texture atlas loading with JSON metadata support
 * - Individual texture loading with caching
 * - UV coordinate calculation for sprite atlas regions
 * - Material creation for both Sprite and InstancedMesh rendering
 *
 * Atlas JSON Format (TexturePacker compatible):
 * {
 *   "frames": {
 *     "sprite_name": {
 *       "frame": { "x": 0, "y": 0, "w": 32, "h": 32 },
 *       "sourceSize": { "w": 32, "h": 32 },
 *       "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 }
 *     }
 *   },
 *   "meta": {
 *     "image": "atlas.png",
 *     "size": { "w": 512, "h": 512 }
 *   }
 * }
 */

/**
 * Frame region within a texture atlas
 */
export interface AtlasFrame {
  /** X position in atlas (pixels) */
  x: number;
  /** Y position in atlas (pixels) */
  y: number;
  /** Width of frame (pixels) */
  w: number;
  /** Height of frame (pixels) */
  h: number;
}

/**
 * Metadata for a single sprite in the atlas
 */
export interface AtlasSpriteData {
  /** Frame rectangle in atlas coordinates */
  frame: AtlasFrame;
  /** Original source size before trimming */
  sourceSize: { w: number; h: number };
  /** Trimmed sprite position and size */
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  /** Whether the sprite was rotated 90° in the atlas */
  rotated?: boolean;
  /** Whether the sprite was trimmed */
  trimmed?: boolean;
}

/**
 * Atlas metadata (from JSON meta section)
 */
export interface AtlasMeta {
  /** Atlas image filename */
  image: string;
  /** Atlas dimensions */
  size: { w: number; h: number };
  /** Scale factor (optional) */
  scale?: string;
  /** Format (e.g., "RGBA8888") */
  format?: string;
}

/**
 * Full atlas data structure
 */
export interface AtlasData {
  /** Map of sprite name to sprite data */
  frames: Record<string, AtlasSpriteData>;
  /** Atlas metadata */
  meta: AtlasMeta;
}

/**
 * Loaded atlas with texture and metadata
 */
export interface LoadedAtlas {
  /** THREE.js texture */
  texture: THREE.Texture;
  /** Atlas metadata */
  data: AtlasData;
  /** Atlas name/identifier */
  name: string;
}

/**
 * UV coordinates for a sprite region
 */
export interface SpriteUVs {
  /** Min U (left edge, 0-1) */
  u0: number;
  /** Min V (bottom edge, 0-1) */
  v0: number;
  /** Max U (right edge, 0-1) */
  u1: number;
  /** Max V (top edge, 0-1) */
  v1: number;
  /** Original pixel dimensions */
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * SpriteLoader - Manages texture atlases and sprite materials
 */
export class SpriteLoader {
  private textureLoader: THREE.TextureLoader;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private atlasCache: Map<string, LoadedAtlas> = new Map();
  private basePath: string;
  private loadingPromises: Map<string, Promise<THREE.Texture>> = new Map();

  /**
   * Create a new SpriteLoader
   * @param basePath - Base path for asset loading (default: '/assets/')
   */
  constructor(basePath: string = '/assets/') {
    this.textureLoader = new THREE.TextureLoader();
    this.basePath = basePath.endsWith('/') ? basePath : basePath + '/';
  }

  /**
   * Load a texture with caching
   * @param path - Path to the texture (relative to basePath or absolute)
   * @returns Promise resolving to the loaded texture
   */
  async loadTexture(path: string): Promise<THREE.Texture> {
    const fullPath = path.startsWith('/') || path.startsWith('http')
      ? path
      : this.basePath + path;

    // Return cached texture if available
    if (this.textureCache.has(fullPath)) {
      return this.textureCache.get(fullPath)!;
    }

    // Return existing loading promise if texture is being loaded
    if (this.loadingPromises.has(fullPath)) {
      return this.loadingPromises.get(fullPath)!;
    }

    // Load the texture
    const loadPromise = new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(
        fullPath,
        (texture) => {
          // Configure for pixel art (nearest neighbor filtering, no mipmaps)
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;

          // Cache the texture
          this.textureCache.set(fullPath, texture);
          this.loadingPromises.delete(fullPath);

          resolve(texture);
        },
        undefined, // onProgress
        (error) => {
          this.loadingPromises.delete(fullPath);
          console.warn(`[SpriteLoader] Failed to load texture: ${fullPath}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(fullPath, loadPromise);
    return loadPromise;
  }

  /**
   * Load a texture atlas (sprite sheet with JSON metadata)
   * @param name - Name/identifier for the atlas
   * @param imagePath - Path to the atlas image
   * @param jsonPath - Path to the atlas JSON metadata (optional, defaults to imagePath.json)
   * @returns Promise resolving to the loaded atlas
   */
  async loadAtlas(name: string, imagePath: string, jsonPath?: string): Promise<LoadedAtlas> {
    // Return cached atlas if available
    if (this.atlasCache.has(name)) {
      return this.atlasCache.get(name)!;
    }

    // Determine JSON path
    const metadataPath = jsonPath || imagePath.replace(/\.(png|jpg|jpeg|webp)$/i, '.json');
    const fullJsonPath = metadataPath.startsWith('/') || metadataPath.startsWith('http')
      ? metadataPath
      : this.basePath + metadataPath;

    try {
      // Load both texture and JSON metadata in parallel
      const [texture, response] = await Promise.all([
        this.loadTexture(imagePath),
        fetch(fullJsonPath)
      ]);

      if (!response.ok) {
        throw new Error(`Failed to load atlas metadata: ${response.status} ${response.statusText}`);
      }

      const data: AtlasData = await response.json();

      const atlas: LoadedAtlas = {
        texture,
        data,
        name
      };

      this.atlasCache.set(name, atlas);
      console.log(`[SpriteLoader] Loaded atlas "${name}" with ${Object.keys(data.frames).length} frames`);

      return atlas;
    } catch (error) {
      console.error(`[SpriteLoader] Failed to load atlas "${name}":`, error);
      throw error;
    }
  }

  /**
   * Get UV coordinates for a sprite in an atlas
   * @param atlasName - Name of the loaded atlas
   * @param spriteName - Name of the sprite within the atlas
   * @returns UV coordinates or null if not found
   */
  getSpriteUVs(atlasName: string, spriteName: string): SpriteUVs | null {
    const atlas = this.atlasCache.get(atlasName);
    if (!atlas) {
      console.warn(`[SpriteLoader] Atlas "${atlasName}" not loaded`);
      return null;
    }

    const spriteData = atlas.data.frames[spriteName];
    if (!spriteData) {
      console.warn(`[SpriteLoader] Sprite "${spriteName}" not found in atlas "${atlasName}"`);
      return null;
    }

    const { w: atlasWidth, h: atlasHeight } = atlas.data.meta.size;
    const { x, y, w, h } = spriteData.frame;

    // Calculate UV coordinates (normalized 0-1)
    // Note: V is inverted because THREE.js uses bottom-left origin
    return {
      u0: x / atlasWidth,
      v0: 1 - (y + h) / atlasHeight,
      u1: (x + w) / atlasWidth,
      v1: 1 - y / atlasHeight,
      pixelWidth: w,
      pixelHeight: h
    };
  }

  /**
   * Create a SpriteMaterial for a single texture
   * @param texturePath - Path to the texture
   * @param options - Additional material options
   * @returns Promise resolving to the created material
   */
  async createSpriteMaterial(
    texturePath: string,
    options: Partial<THREE.SpriteMaterialParameters> = {}
  ): Promise<THREE.SpriteMaterial> {
    const texture = await this.loadTexture(texturePath);

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      ...options
    });
  }

  /**
   * Create a SpriteMaterial for a specific sprite in an atlas
   * Uses texture repeat/offset to show only the sprite region
   * @param atlasName - Name of the loaded atlas
   * @param spriteName - Name of the sprite
   * @param options - Additional material options
   * @returns The created material or null if sprite not found
   */
  createAtlasSpriteMaterial(
    atlasName: string,
    spriteName: string,
    options: Partial<THREE.SpriteMaterialParameters> = {}
  ): THREE.SpriteMaterial | null {
    const atlas = this.atlasCache.get(atlasName);
    if (!atlas) {
      console.warn(`[SpriteLoader] Atlas "${atlasName}" not loaded`);
      return null;
    }

    const uvs = this.getSpriteUVs(atlasName, spriteName);
    if (!uvs) {
      return null;
    }

    // Clone the texture so we can set unique repeat/offset
    const texture = atlas.texture.clone();
    texture.needsUpdate = true;

    // Set texture repeat and offset to show only this sprite
    texture.repeat.set(uvs.u1 - uvs.u0, uvs.v1 - uvs.v0);
    texture.offset.set(uvs.u0, uvs.v0);

    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      ...options
    });
  }

  /**
   * Create a MeshBasicMaterial with a texture (for InstancedMesh)
   * @param texturePath - Path to the texture
   * @param options - Additional material options
   * @returns Promise resolving to the created material
   */
  async createMeshMaterial(
    texturePath: string,
    options: Partial<THREE.MeshBasicMaterialParameters> = {}
  ): Promise<THREE.MeshBasicMaterial> {
    const texture = await this.loadTexture(texturePath);

    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1, // Discard nearly transparent pixels
      ...options
    });
  }

  /**
   * Get a loaded atlas by name
   * @param name - Atlas name
   * @returns The loaded atlas or undefined
   */
  getAtlas(name: string): LoadedAtlas | undefined {
    return this.atlasCache.get(name);
  }

  /**
   * Get a cached texture by path
   * @param path - Texture path
   * @returns The cached texture or undefined
   */
  getTexture(path: string): THREE.Texture | undefined {
    const fullPath = path.startsWith('/') || path.startsWith('http')
      ? path
      : this.basePath + path;
    return this.textureCache.get(fullPath);
  }

  /**
   * Check if an atlas is loaded
   * @param name - Atlas name
   * @returns True if atlas is loaded
   */
  hasAtlas(name: string): boolean {
    return this.atlasCache.has(name);
  }

  /**
   * Get all sprite names in an atlas
   * @param atlasName - Name of the atlas
   * @returns Array of sprite names or empty array if atlas not found
   */
  getSpriteNames(atlasName: string): string[] {
    const atlas = this.atlasCache.get(atlasName);
    return atlas ? Object.keys(atlas.data.frames) : [];
  }

  /**
   * Preload multiple textures in parallel
   * @param paths - Array of texture paths to preload
   * @returns Promise that resolves when all textures are loaded
   */
  async preloadTextures(paths: string[]): Promise<THREE.Texture[]> {
    return Promise.all(paths.map(path => this.loadTexture(path)));
  }

  /**
   * Clear all cached textures and atlases
   * Call this when switching levels or to free memory
   */
  clearCache(): void {
    // Dispose all textures
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
    this.atlasCache.clear();
    this.loadingPromises.clear();
    console.log('[SpriteLoader] Cache cleared');
  }

  /**
   * Dispose a specific texture
   * @param path - Path of the texture to dispose
   */
  disposeTexture(path: string): void {
    const fullPath = path.startsWith('/') || path.startsWith('http')
      ? path
      : this.basePath + path;

    const texture = this.textureCache.get(fullPath);
    if (texture) {
      texture.dispose();
      this.textureCache.delete(fullPath);
    }
  }
}

// Export singleton instance for convenience
export const spriteLoader = new SpriteLoader();
