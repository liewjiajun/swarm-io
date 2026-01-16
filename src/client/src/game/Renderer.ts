import * as THREE from 'three';
// Post-processing modules are lazily loaded to reduce initial bundle size
// See setupPostProcessing() for dynamic imports when CRT effect is enabled
import type { PlayerState, EnemyState, ProjectileState, XPOrbState, PowerUpState } from '@swarm-io/shared';
import { DEATH_PARTICLE_COLORS } from '@swarm-io/shared';
import { SpriteLoader } from './SpriteLoader';
import { AnimationController, createSimpleAnimation, createWalkAnimations } from './AnimationController';
import type { AnimationState } from './AnimationController';
import { rendererLogger } from '../utils/logger';

// =============================================================================
// CRT SHADER - P1.10: OPTIONAL RETRO CRT/SCANLINE EFFECT
// =============================================================================
// Creates a retro CRT monitor aesthetic with:
// - Horizontal scanlines
// - Screen curvature (barrel distortion)
// - Vignette darkening at edges
// - Subtle RGB separation (chromatic aberration)

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    scanLineIntensity: { value: 0.15 },    // Intensity of scanlines (0-1)
    curvatureAmount: { value: 0.03 },      // Screen curvature (0 = flat)
    vignetteAmount: { value: 0.25 },       // Edge darkening (0-1)
    rgbSeparation: { value: 0.002 },       // Chromatic aberration amount
    flickerIntensity: { value: 0.02 },     // Screen flicker intensity
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float scanLineIntensity;
    uniform float curvatureAmount;
    uniform float vignetteAmount;
    uniform float rgbSeparation;
    uniform float flickerIntensity;
    uniform vec2 resolution;

    varying vec2 vUv;

    // Apply barrel distortion for CRT curvature
    vec2 curveUV(vec2 uv) {
      vec2 centered = uv * 2.0 - 1.0;
      float dist = dot(centered, centered) * curvatureAmount;
      centered *= 1.0 + dist;
      return centered * 0.5 + 0.5;
    }

    void main() {
      // Apply screen curvature
      vec2 uv = curveUV(vUv);

      // Check if outside screen bounds after curvature
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // RGB separation (chromatic aberration)
      vec2 offset = vec2(rgbSeparation, 0.0);
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g, b);

      // Scanlines - horizontal lines that vary with vertical position
      float scanLine = sin(uv.y * resolution.y * 2.0) * 0.5 + 0.5;
      scanLine = pow(scanLine, 1.5);
      color *= 1.0 - scanLineIntensity * (1.0 - scanLine);

      // Screen flicker
      float flicker = 1.0 + sin(time * 15.0) * flickerIntensity;
      color *= flicker;

      // Vignette - darken edges
      vec2 vignetteUV = vUv * (1.0 - vUv);
      float vignette = vignetteUV.x * vignetteUV.y * 15.0;
      vignette = pow(vignette, vignetteAmount);
      color *= vignette;

      // Slight brightness boost to compensate for darkening effects
      color *= 1.1;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * DamageNumber - Floating damage text that animates upward and fades
 * Uses CSS-positioned DOM elements for crisp text rendering
 */
interface DamageNumber {
  element: HTMLDivElement;
  worldX: number;
  worldY: number;
  startTime: number;
  duration: number;
}

/**
 * Particle - Individual sparkle/particle for visual effects
 */
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: number;
}

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  // Entity pools using InstancedMesh
  private enemyMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private projectileMesh!: THREE.InstancedMesh;
  private xpOrbMesh!: THREE.InstancedMesh;
  private playerSprites: Map<string, THREE.Sprite> = new Map();

  // Ground plane
  private ground!: THREE.Mesh;
  private boundaryRing!: THREE.Mesh;
  private floorTexture: THREE.Texture | null = null;

  // Reusable objects
  private dummy = new THREE.Object3D();
  private tempColor = new THREE.Color();

  // Camera
  private cameraTarget = { x: 0, y: 0 };
  private frustumSize = 30;

  // Damage numbers
  private damageNumbers: DamageNumber[] = [];
  private damageContainer: HTMLDivElement | null = null;
  private lastEnemyHealth: Map<string, number> = new Map();

  // P3.1: Player name labels
  private playerNameLabels: Map<string, HTMLDivElement> = new Map();
  private playerNameContainer: HTMLDivElement | null = null;

  // Particle effects
  private particles: Particle[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private lastXpOrbPositions: Map<string, { x: number; y: number; value: number }> = new Map();

  // Delta time tracking
  private lastRenderTime: number = 0;

  // Screen effects
  private screenFlash: HTMLDivElement | null = null;

  // Frustum culling
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private cullMargin = 5; // Extra margin to prevent pop-in

  // LOD (Level of Detail) - lower poly meshes for distant entities
  // Entities beyond this distance use low-detail geometry
  private lodDistanceThreshold = 15; // Units from camera center
  private projectileMeshLOD!: THREE.InstancedMesh;
  private xpOrbMeshLOD!: THREE.InstancedMesh;
  private enemyMeshesLOD: Map<string, THREE.InstancedMesh> = new Map();

  // Sprite system (P1.1 and P1.2)
  private spriteLoader: SpriteLoader;
  private animationController: AnimationController;
  private spriteMode: boolean = false;
  private spriteModeReady: boolean = false;

  // Animation states for entities
  private playerAnimStates: Map<string, AnimationState> = new Map();
  private enemyAnimStates: Map<string, AnimationState> = new Map();

  // Previous positions for velocity calculation (animation purposes)
  private playerPrevPositions: Map<string, { x: number; y: number }> = new Map();
  private enemyPrevPositions: Map<string, { x: number; y: number }> = new Map();

  // Sprite-based entity rendering (P1.9)
  private xpOrbSprites: Map<string, THREE.Sprite> = new Map();
  private enemySprites: Map<string, THREE.Sprite> = new Map();
  private projectileSprites: Map<string, THREE.Sprite> = new Map();
  private powerUpSprites: Map<string, THREE.Sprite> = new Map(); // P5.2: Power-up sprites

  // Post-processing (P1.10 CRT shader)
  // Types are 'any' because modules are lazily loaded to reduce bundle size
  private composer: any = null;
  private crtPass: any = null;
  private crtEnabled: boolean = false;
  private crtTime: number = 0;
  private postProcessingInitialized: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize sprite system (P1.1 and P1.2)
    this.spriteLoader = new SpriteLoader('/assets/sprites/');
    this.animationController = new AnimationController();

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera - Orthographic for 2.5D
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      this.frustumSize * aspect / -2,
      this.frustumSize * aspect / 2,
      this.frustumSize / 2,
      this.frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(0, 20, 20);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Setup
    this.createGround();
    this.createEntityPools();
    this.createLighting();
    this.createDamageContainer();

    // Handle resize
    window.addEventListener('resize', () => this.onResize(canvas));

    // Post-processing is lazily initialized when CRT effect is enabled
    // This reduces initial bundle size by ~20KB (EffectComposer, RenderPass, ShaderPass)
  }

  /**
   * Setup post-processing pipeline for CRT shader effect (P1.10)
   * Lazily loads EffectComposer, RenderPass, and ShaderPass modules
   * Creates an EffectComposer with RenderPass and optional CRT ShaderPass
   */
  private async setupPostProcessing(): Promise<void> {
    if (this.postProcessingInitialized) return;

    try {
      // Dynamically import post-processing modules to reduce initial bundle size
      const [
        { EffectComposer },
        { RenderPass },
        { ShaderPass }
      ] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/ShaderPass.js')
      ]);

      const canvas = this.renderer.domElement;

      // Create effect composer
      this.composer = new EffectComposer(this.renderer);

      // First pass: render the scene normally
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Second pass: CRT shader effect
      this.crtPass = new ShaderPass(CRTShader);
      this.crtPass.uniforms.resolution.value.set(canvas.clientWidth, canvas.clientHeight);
      this.crtPass.enabled = this.crtEnabled;
      this.composer.addPass(this.crtPass);

      this.postProcessingInitialized = true;
      rendererLogger.info('Post-processing pipeline initialized (lazy-loaded)');
    } catch (error) {
      rendererLogger.error({ error: String(error) }, 'Failed to initialize post-processing');
    }
  }

  /**
   * Enable or disable CRT shader effect (P1.10)
   * Lazily initializes post-processing pipeline on first enable
   * @param enabled - Whether to enable the CRT effect
   */
  async setCRTEnabled(enabled: boolean): Promise<void> {
    this.crtEnabled = enabled;

    // Lazy-load post-processing modules when CRT is first enabled
    if (enabled && !this.postProcessingInitialized) {
      await this.setupPostProcessing();
    }

    if (this.crtPass) {
      this.crtPass.enabled = enabled;
    }
    rendererLogger.info({ enabled }, 'CRT effect toggled');
  }

  /**
   * Check if CRT effect is currently enabled
   */
  isCRTEnabled(): boolean {
    return this.crtEnabled;
  }

  /**
   * Toggle CRT effect on/off
   * Lazily initializes post-processing pipeline on first enable
   * @returns Promise resolving to the new state of the CRT effect
   */
  async toggleCRT(): Promise<boolean> {
    await this.setCRTEnabled(!this.crtEnabled);
    return this.crtEnabled;
  }

  /**
   * Configure CRT shader parameters
   * @param params - Object with optional CRT parameters to adjust
   */
  configureCRT(params: {
    scanLineIntensity?: number;
    curvatureAmount?: number;
    vignetteAmount?: number;
    rgbSeparation?: number;
    flickerIntensity?: number;
  }): void {
    if (!this.crtPass) return;

    if (params.scanLineIntensity !== undefined) {
      this.crtPass.uniforms.scanLineIntensity.value = params.scanLineIntensity;
    }
    if (params.curvatureAmount !== undefined) {
      this.crtPass.uniforms.curvatureAmount.value = params.curvatureAmount;
    }
    if (params.vignetteAmount !== undefined) {
      this.crtPass.uniforms.vignetteAmount.value = params.vignetteAmount;
    }
    if (params.rgbSeparation !== undefined) {
      this.crtPass.uniforms.rgbSeparation.value = params.rgbSeparation;
    }
    if (params.flickerIntensity !== undefined) {
      this.crtPass.uniforms.flickerIntensity.value = params.flickerIntensity;
    }
  }

  /**
   * Create DOM container for damage number overlays
   * Uses DOM elements for crisp text that scales well
   */
  private createDamageContainer(): void {
    this.damageContainer = document.createElement('div');
    this.damageContainer.id = 'damage-numbers';
    this.damageContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
      z-index: 100;
    `;
    document.body.appendChild(this.damageContainer);

    // P3.1: Create container for player name labels
    this.playerNameContainer = document.createElement('div');
    this.playerNameContainer.id = 'player-name-labels';
    this.playerNameContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
      z-index: 95;
    `;
    document.body.appendChild(this.playerNameContainer);

    // Create screen flash overlay for level up effect
    this.screenFlash = document.createElement('div');
    this.screenFlash.id = 'screen-flash';
    this.screenFlash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background: radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,215,0,0) 70%);
      opacity: 0;
      z-index: 99;
      transition: opacity 0.15s ease-out;
    `;
    document.body.appendChild(this.screenFlash);
  }

  /**
   * Creates the ground plane with tiled floor texture (P1.7)
   * Uses floor_tile sprite from atlas for pixel art aesthetic
   * Falls back to solid color if texture loading fails
   */
  private createGround() {
    const geometry = new THREE.PlaneGeometry(2000, 2000, 1, 1);

    // Default material (fallback while texture loads or if loading fails)
    const defaultMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d44,
      roughness: 0.8,
    });
    this.ground = new THREE.Mesh(geometry, defaultMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.scene.add(this.ground);

    // Try to load the floor tile texture from atlas (P1.7)
    this.loadFloorTexture();

    // Grid helper for visual reference (subtle grid overlay)
    const grid = new THREE.GridHelper(2000, 100, 0x3d3d5c, 0x3d3d5c);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Create boundary warning ring (P1.7)
    this.createBoundaryRing(500); // Default world radius
  }

  /**
   * Loads the floor tile texture and applies it to the ground (P1.7)
   * Extracts the floor tile region from the sprite atlas
   */
  private loadFloorTexture(): void {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      '/assets/sprites/atlas.png',
      (texture) => {
        // Create a canvas to extract just the floor tile from atlas
        const canvas = document.createElement('canvas');
        const tileSize = 32;
        canvas.width = tileSize;
        canvas.height = tileSize;
        const ctx = canvas.getContext('2d')!;

        // Create an image from the texture to draw on canvas
        const img = new Image();
        img.onload = () => {
          // Extract floor_tile from atlas (x: 0, y: 160, w: 32, h: 32)
          ctx.drawImage(img, 0, 160, tileSize, tileSize, 0, 0, tileSize, tileSize);

          // Create texture from the extracted tile
          const floorTexture = new THREE.CanvasTexture(canvas);
          floorTexture.wrapS = THREE.RepeatWrapping;
          floorTexture.wrapT = THREE.RepeatWrapping;
          floorTexture.magFilter = THREE.NearestFilter; // Pixel art - no smoothing
          floorTexture.minFilter = THREE.NearestFilter;

          // Calculate repeat based on world size and tile size
          // Each tile is 32 pixels, we want each tile to cover ~2 world units
          const tileWorldSize = 2;
          const repeatCount = 2000 / tileWorldSize;
          floorTexture.repeat.set(repeatCount, repeatCount);

          this.floorTexture = floorTexture;

          // Update ground material with texture
          const material = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.9,
          });

          this.ground.material = material;
          rendererLogger.info('Floor tile texture loaded successfully (P1.7)');
        };
        img.src = texture.image.src;
      },
      undefined,
      (error) => {
        rendererLogger.warn({ error: String(error) }, 'Failed to load floor texture, using fallback color');
      }
    );
  }

  /**
   * Creates a boundary warning ring around the arena edge (P1.7)
   * Visual indicator that pulses to warn players of the danger zone
   */
  private createBoundaryRing(worldRadius: number): void {
    // Create a ring geometry at the world edge
    const innerRadius = worldRadius - 15; // Start warning 15 units from edge
    const outerRadius = worldRadius + 5;  // Extend slightly beyond

    const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 64, 1);

    // Create material with red danger gradient
    const ringMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        innerRadius: { value: innerRadius },
        outerRadius: { value: outerRadius },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vRadius;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vRadius = length(worldPos.xz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float innerRadius;
        uniform float outerRadius;
        varying float vRadius;

        void main() {
          // Calculate progress from inner to outer (0 = inner/safe, 1 = outer/danger)
          float progress = (vRadius - innerRadius) / (outerRadius - innerRadius);
          progress = clamp(progress, 0.0, 1.0);

          // Pulsing effect
          float pulse = sin(time * 3.0) * 0.3 + 0.7;

          // Red danger color with gradient alpha
          float alpha = progress * 0.6 * pulse;

          // Warning stripes pattern
          float stripeFreq = 0.3;
          float stripe = step(0.5, fract((vRadius + time * 5.0) * stripeFreq));
          float stripeAlpha = stripe * 0.2 * progress;

          vec3 dangerColor = vec3(1.0, 0.2, 0.1);
          vec3 stripeColor = vec3(1.0, 0.8, 0.0);

          vec3 finalColor = mix(dangerColor, stripeColor, stripeAlpha);
          float finalAlpha = alpha + stripeAlpha;

          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.boundaryRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.boundaryRing.rotation.x = -Math.PI / 2;
    this.boundaryRing.position.y = 0.02; // Slightly above ground
    this.scene.add(this.boundaryRing);
  }

  /**
   * Updates the boundary ring animation and size (P1.7)
   * Called each frame to animate the pulsing effect
   */
  private updateBoundaryRing(time: number, worldRadius?: number): void {
    if (!this.boundaryRing) return;

    const material = this.boundaryRing.material as THREE.ShaderMaterial;
    if (material.uniforms) {
      material.uniforms.time.value = time;
    }

    // Update ring size if world radius changed
    if (worldRadius && material.uniforms) {
      const currentInner = material.uniforms.innerRadius.value;
      const expectedInner = worldRadius - 15;
      if (Math.abs(currentInner - expectedInner) > 1) {
        // Recreate ring with new size
        this.scene.remove(this.boundaryRing);
        this.createBoundaryRing(worldRadius);
      }
    }
  }

  private createEntityPools() {
    // BUG-022 FIX: More distinct enemy colors for visual differentiation
    // Enemy pools - each type has a unique, distinguishable color
    this.createEnemyPool('bat', 0x8b4513, 500);         // Brown - small flying pest
    this.createEnemyPool('skeleton', 0xffffff, 200);    // White - bone color
    this.createEnemyPool('zombie', 0x228b22, 200);      // Forest green - undead rot
    this.createEnemyPool('ghost', 0x87ceeb, 100);       // Sky blue - ethereal
    this.createEnemyPool('slime', 0x32cd32, 100);       // Lime green - acidic
    this.createEnemyPool('mini_slime', 0x90ee90, 200); // Light green - smaller slime
    this.createEnemyPool('demon', 0xff4500, 50);        // Orange-red - hellfire
    // Boss enemies - larger and more intimidating colors
    this.createEnemyPool('boss_slime', 0x00ff00, 10);   // Bright green - giant slime
    this.createEnemyPool('boss_skeleton', 0xffd700, 10); // Gold - skeleton king
    this.createEnemyPool('boss_demon', 0x8b0000, 10);   // Dark red - demon lord

    // Projectile pool - High detail (8x8 segments = 128 triangles per sphere)
    // Uses per-instance colors for weapon-specific projectile colors
    const projGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Larger for visibility
    const projMaterial = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.projectileMesh = new THREE.InstancedMesh(projGeometry, projMaterial, 1000);
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);

    // Projectile pool - LOD (4x4 segments = 32 triangles per sphere, 75% reduction)
    const projGeometryLOD = new THREE.SphereGeometry(0.5, 4, 4);
    const projMaterialLOD = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.projectileMeshLOD = new THREE.InstancedMesh(projGeometryLOD, projMaterialLOD, 1000);
    this.projectileMeshLOD.count = 0;
    this.projectileMeshLOD.frustumCulled = false;
    this.scene.add(this.projectileMeshLOD);

    // XP orb pool - High detail
    const xpGeometry = new THREE.SphereGeometry(0.4, 8, 8); // Larger for visibility
    const xpMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.xpOrbMesh = new THREE.InstancedMesh(xpGeometry, xpMaterial, 2000);
    this.xpOrbMesh.count = 0;
    this.xpOrbMesh.frustumCulled = false;
    this.scene.add(this.xpOrbMesh);

    // XP orb pool - LOD
    const xpGeometryLOD = new THREE.SphereGeometry(0.4, 4, 4);
    this.xpOrbMeshLOD = new THREE.InstancedMesh(xpGeometryLOD, xpMaterial, 2000);
    this.xpOrbMeshLOD.count = 0;
    this.xpOrbMeshLOD.frustumCulled = false;
    this.scene.add(this.xpOrbMeshLOD);

    // Particle pool for sparkle effects
    const particleGeometry = new THREE.SphereGeometry(0.15, 4, 4);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
    });
    this.particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, 500);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
  }

  /**
   * Get distinct geometry for each enemy type
   * Different shapes help players quickly identify enemy types
   */
  private getEnemyGeometry(type: string): THREE.BufferGeometry {
    const baseType = type.replace('boss_', ''); // Bosses use same shape as regular enemies

    switch (baseType) {
      case 'bat':
        // Small pyramid shape - fast, agile flying pest
        return new THREE.ConeGeometry(0.8, 1.2, 4);
      case 'skeleton':
        // Tall narrow box - humanoid skeletal form
        return new THREE.BoxGeometry(1.0, 2.0, 1.0);
      case 'zombie':
        // Wide bulky box - slow shambling tank
        return new THREE.BoxGeometry(1.8, 1.5, 1.4);
      case 'ghost':
        // Octahedron - ethereal floating diamond shape
        return new THREE.OctahedronGeometry(1.0);
      case 'slime':
        // Low-poly sphere - blobby bouncy creature
        return new THREE.IcosahedronGeometry(0.9, 0);
      case 'mini_slime':
        // Smaller low-poly sphere - baby slime from split
        return new THREE.IcosahedronGeometry(0.5, 0);
      case 'demon':
        // Inverted cone - menacing horned appearance
        return new THREE.ConeGeometry(1.0, 1.8, 6);
      default:
        // Fallback to basic cube
        return new THREE.BoxGeometry(1.5, 1.5, 1.5);
    }
  }

  private createEnemyPool(type: string, color: number, maxCount: number) {
    // Use type-specific geometry for visual variety
    const geometry = this.getEnemyGeometry(type);
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
    mesh.count = 0;
    mesh.frustumCulled = false; // Disable THREE.js frustum culling - we do our own
    this.scene.add(mesh);
    this.enemyMeshes.set(type, mesh);
  }

  private createLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);
  }

  setCameraTarget(x: number, y: number) {
    this.cameraTarget.x = x;
    this.cameraTarget.y = y;
  }

  /**
   * Initialize sprite-based rendering mode
   * Loads the sprite atlas and sets up animations
   * Falls back to procedural rendering if assets fail to load
   *
   * @returns Promise that resolves to true if sprite mode is ready
   */
  async initSpriteMode(): Promise<boolean> {
    try {
      rendererLogger.info('Initializing sprite mode...');

      // Try to load the main sprite atlas
      await this.spriteLoader.loadAtlas('main', 'atlas.png', 'atlas.json');

      // Configure animation controller with sprite loader
      this.animationController.setSpriteLoader(this.spriteLoader, 'main');

      // Define player animations
      this.animationController.defineAnimations('player', 'idle', {
        idle: createSimpleAnimation('player_idle', 4, 0.5, true),
        ...createWalkAnimations('player', 4, 0.15),
        attack: createSimpleAnimation('player_attack', 2, 0.1, false),
        death: createSimpleAnimation('player_death', 4, 0.15, false),
      });

      // Define enemy animations (7 types + bosses)
      const enemyTypes = ['bat', 'skeleton', 'zombie', 'ghost', 'slime', 'mini_slime', 'demon'];
      for (const type of enemyTypes) {
        this.animationController.defineAnimations(type, 'idle', {
          idle: createSimpleAnimation(`${type}_idle`, 2, 0.4, true),
          move: createSimpleAnimation(`${type}_move`, 2, 0.2, true),
          death: createSimpleAnimation(`${type}_death`, 4, 0.1, false),
        });
        // Boss variants use same animations but scaled up
        this.animationController.defineAnimations(`boss_${type}`, 'idle', {
          idle: createSimpleAnimation(`${type}_idle`, 2, 0.3, true),
          move: createSimpleAnimation(`${type}_move`, 2, 0.15, true),
          death: createSimpleAnimation(`${type}_death`, 4, 0.1, false),
        });
      }

      this.spriteMode = true;
      this.spriteModeReady = true;
      rendererLogger.info('Sprite mode initialized successfully');
      return true;
    } catch (error) {
      rendererLogger.warn({ error: String(error) }, 'Failed to initialize sprite mode, using procedural rendering');
      this.spriteMode = false;
      this.spriteModeReady = false;
      return false;
    }
  }

  /**
   * Check if sprite mode is active and ready
   */
  isSpriteMode(): boolean {
    return this.spriteMode && this.spriteModeReady;
  }

  /**
   * Force disable sprite mode (use procedural rendering)
   */
  disableSpriteMode(): void {
    this.spriteMode = false;
    rendererLogger.info('Sprite mode disabled, using procedural rendering');
  }

  /**
   * Get the sprite loader instance
   * Useful for loading additional textures
   */
  getSpriteLoader(): SpriteLoader {
    return this.spriteLoader;
  }

  /**
   * Get the animation controller instance
   * Useful for defining custom animations
   */
  getAnimationController(): AnimationController {
    return this.animationController;
  }

  /**
   * Check if a point is within the camera frustum (with margin)
   * Used for culling off-screen entities from InstancedMesh rendering
   */
  private isInView(x: number, z: number, radius: number = 1): boolean {
    // Create a bounding sphere for the point with some margin
    const margin = this.cullMargin + radius;
    const point = new THREE.Vector3(x, 0.5, z);

    // Simple distance-based check from camera target (faster than frustum containment)
    const dx = point.x - this.camera.position.x;
    const dz = point.z - (this.camera.position.z - 20); // Look-at point

    // Use squared distance for performance
    const distSq = dx * dx + dz * dz;

    // Cull entities beyond visible range (based on frustum size + margin)
    const viewRange = this.frustumSize + margin;
    return distSq <= viewRange * viewRange;
  }

  /**
   * Get squared distance from entity to camera target (center of view)
   * Used for LOD selection - entities further from center use lower detail
   */
  private getDistanceSqFromCamera(x: number, z: number): number {
    const dx = x - this.cameraTarget.x;
    const dz = z - this.cameraTarget.y; // Note: cameraTarget.y maps to world z
    return dx * dx + dz * dz;
  }

  /**
   * Determine if an entity should use LOD (lower detail) geometry
   * Returns true if entity is beyond the LOD threshold distance
   */
  private shouldUseLOD(x: number, z: number): boolean {
    const distSq = this.getDistanceSqFromCamera(x, z);
    return distSq > this.lodDistanceThreshold * this.lodDistanceThreshold;
  }

  render(state: any, localPlayerId: string) {
    // Calculate delta time for physics
    const now = performance.now();
    const dt = this.lastRenderTime > 0 ? Math.min((now - this.lastRenderTime) / 1000, 0.1) : 0.016;
    this.lastRenderTime = now;

    // Smooth camera follow - use faster lerp initially to snap to player
    const distanceToTarget = Math.sqrt(
      Math.pow(this.cameraTarget.x - this.camera.position.x, 2) +
      Math.pow(this.cameraTarget.y + 20 - this.camera.position.z, 2)
    );
    // Use faster lerp if camera is far from target (initial positioning)
    const lerpFactor = distanceToTarget > 50 ? 0.5 : 0.1;
    this.camera.position.x += (this.cameraTarget.x - this.camera.position.x) * lerpFactor;
    this.camera.position.z += (this.cameraTarget.y + 20 - this.camera.position.z) * lerpFactor;
    this.camera.lookAt(
      this.camera.position.x,
      0,
      this.camera.position.z - 20
    );

    // Update frustum for culling
    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    // Update players
    this.updatePlayers(state.players, localPlayerId);

    // P3.1: Update player name labels above sprites
    this.updatePlayerNameLabels(state.players, localPlayerId);

    // Detect damage before updating enemies (to track health changes)
    this.detectDamage(state.enemies);

    // Update enemies
    this.updateEnemies(state.enemies);

    // Update projectiles
    this.updateProjectiles(state.projectiles);

    // Detect XP collection before updating (to track removed orbs)
    this.detectXPCollection(state.xpOrbs);

    // Update XP orbs
    this.updateXPOrbs(state.xpOrbs);

    // P5.2: Update power-ups
    if (state.powerUps) {
      this.updatePowerUps(state.powerUps);
    }

    // Update particle effects
    this.updateParticles(dt);

    // Update damage number animations
    this.updateDamageNumbers();

    // Update boundary ring animation (P1.7)
    const gameTime = performance.now() / 1000;
    const worldRadius = state.worldRadius || 500;
    this.updateBoundaryRing(gameTime, worldRadius);

    // Update CRT time uniform for animation effects
    if (this.crtEnabled && this.crtPass) {
      this.crtTime += dt;
      this.crtPass.uniforms.time.value = this.crtTime;
    }

    // Render using post-processing composer or direct render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private updatePlayers(players: Map<string, PlayerState>, localPlayerId: string) {
    // Remove sprites for disconnected players
    const currentIds = new Set(players.keys());
    this.playerSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.playerSprites.delete(id);
        this.playerAnimStates.delete(id);
        this.playerPrevPositions.delete(id);
      }
    });

    // Debug: Log player count on first render
    if (this.playerSprites.size === 0 && players.size > 0) {
      rendererLogger.debug({ playerCount: players.size }, 'Creating sprites for players');
    }

    // Calculate delta time for animation updates
    const dt = 1 / 60; // Approximate frame time

    // Update/create player sprites
    players.forEach((player, id) => {
      let sprite = this.playerSprites.get(id);
      if (!sprite) {
        rendererLogger.debug({ x: player.x.toFixed(1), y: player.y.toFixed(1) }, 'Creating player sprite');
        sprite = this.createPlayerSprite(id === localPlayerId);
        this.playerSprites.set(id, sprite);
        this.scene.add(sprite);

        // Initialize animation state for sprite mode
        if (this.isSpriteMode()) {
          const animState = this.animationController.createState('player');
          this.playerAnimStates.set(id, animState);
        }
        // Initialize previous position
        this.playerPrevPositions.set(id, { x: player.x, y: player.y });
      }

      sprite.visible = true;
      sprite.position.set(player.x, 0.5, player.y);

      // Update animation if in sprite mode
      if (this.isSpriteMode()) {
        const animState = this.playerAnimStates.get(id);
        if (animState) {
          // Calculate velocity from position change (for animation direction)
          const prevPos = this.playerPrevPositions.get(id);
          const velocityX = prevPos ? (player.x - prevPos.x) / dt : 0;
          const velocityY = prevPos ? (player.y - prevPos.y) / dt : 0;

          // Determine animation based on velocity
          const isMoving = Math.abs(velocityX) > 0.1 || Math.abs(velocityY) > 0.1;
          if (isMoving) {
            const direction = this.animationController.getDirectionFromVelocity(velocityX, velocityY);
            this.animationController.setAnimation(animState, 'player', `walk_${direction}`);
          } else {
            this.animationController.setAnimation(animState, 'player', 'idle');
          }
          this.animationController.update(animState, 'player', dt);

          // Apply animation frame to sprite
          this.animationController.applyToSprite(sprite, animState, 'player');
        }
      }

      // Store current position for next frame's velocity calculation
      this.playerPrevPositions.set(id, { x: player.x, y: player.y });

      // Visual feedback for invulnerability
      if (player.invulnerableTime > 0) {
        sprite.material.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
      } else {
        sprite.material.opacity = 1;
      }
    });
  }

  private createPlayerSprite(isLocal: boolean): THREE.Sprite {
    let material: THREE.SpriteMaterial;

    if (this.isSpriteMode()) {
      // Use atlas sprite texture
      const atlasMaterial = this.spriteLoader.createAtlasSpriteMaterial('main', 'player_idle_0');
      if (atlasMaterial) {
        material = atlasMaterial;
        material.transparent = true;
        // Tint based on local/other player
        material.color.setHex(isLocal ? 0xffffff : 0x88ccff);
      } else {
        // Fallback to colored sprite
        material = new THREE.SpriteMaterial({
          color: isLocal ? 0x00ff00 : 0x0088ff,
          transparent: true,
        });
      }
    } else {
      // Procedural colored sprite
      material = new THREE.SpriteMaterial({
        color: isLocal ? 0x00ff00 : 0x0088ff,
        transparent: true,
      });
    }

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 2, 1); // Larger sprite for better visibility
    return sprite;
  }

  /**
   * P3.1: Update player name labels above sprites
   * Creates/updates/removes DOM elements for each player's nickname
   */
  private updatePlayerNameLabels(players: Map<string, PlayerState>, localPlayerId: string): void {
    if (!this.playerNameContainer) return;

    const canvas = this.renderer.domElement;
    const halfWidth = canvas.clientWidth / 2;
    const halfHeight = canvas.clientHeight / 2;

    // Remove labels for disconnected players
    const currentIds = new Set(players.keys());
    this.playerNameLabels.forEach((label, id) => {
      if (!currentIds.has(id)) {
        label.remove();
        this.playerNameLabels.delete(id);
      }
    });

    // Update/create labels for each player
    players.forEach((player, id) => {
      // Skip players without nicknames or dead players
      if (!player.nickname || player.dead) {
        const existingLabel = this.playerNameLabels.get(id);
        if (existingLabel) {
          existingLabel.style.display = 'none';
        }
        return;
      }

      let label = this.playerNameLabels.get(id);
      if (!label) {
        // Create new label
        label = document.createElement('div');
        label.style.cssText = `
          position: absolute;
          font-family: 'Press Start 2P', monospace;
          font-size: 8px;
          color: ${id === localPlayerId ? '#4ecdc4' : '#ffffff'};
          text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
          pointer-events: none;
          white-space: nowrap;
          transform: translate(-50%, -50%);
        `;
        // We already checked this.playerNameContainer exists at function start
        this.playerNameContainer!.appendChild(label);
        this.playerNameLabels.set(id, label);
      }

      // Update label text if changed
      if (label.textContent !== player.nickname) {
        label.textContent = player.nickname;
      }

      // Make label visible
      label.style.display = 'block';

      // Convert world position to screen position (above player sprite)
      const worldPos = new THREE.Vector3(player.x, 2.5, player.y); // Higher than sprite
      worldPos.project(this.camera);

      const screenX = (worldPos.x * halfWidth) + halfWidth;
      const screenY = -(worldPos.y * halfHeight) + halfHeight;

      // Update position
      label.style.left = `${screenX}px`;
      label.style.top = `${screenY}px`;

      // Highlight local player's name
      if (id === localPlayerId) {
        label.style.color = '#4ecdc4';
      } else {
        label.style.color = '#ffffff';
      }
    });
  }

  private updateEnemies(enemies: Map<string, EnemyState>) {
    if (this.isSpriteMode()) {
      this.updateEnemiesSprite(enemies);
    } else {
      this.updateEnemiesProcedural(enemies);
    }
  }

  /**
   * Get the base sprite name for an enemy type (handles boss_ prefix and mini_slime)
   */
  private getEnemySpriteBaseName(type: string): string {
    // Remove boss_ prefix for sprite lookup
    let baseName = type.replace('boss_', '');
    // mini_slime uses slime sprites (scaled down)
    if (baseName === 'mini_slime') {
      baseName = 'slime';
    }
    return baseName;
  }

  /**
   * Update enemies using sprite-based rendering (P1.9)
   * Uses enemy type sprites with idle animation
   */
  private updateEnemiesSprite(enemies: Map<string, EnemyState>) {
    const dt = 1 / 60; // Approximate frame time

    // Remove sprites for dead enemies
    const currentIds = new Set(enemies.keys());
    this.enemySprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.enemySprites.delete(id);
        this.enemyAnimStates.delete(id);
        this.enemyPrevPositions.delete(id);
      }
    });

    const time = Date.now() / 1000;

    // Update/create enemy sprites
    enemies.forEach((enemy, id) => {
      // Skip enemies outside view (frustum culling)
      if (!this.isInView(enemy.x, enemy.y)) {
        const existingSprite = this.enemySprites.get(id);
        if (existingSprite) {
          existingSprite.visible = false;
        }
        return;
      }

      let sprite = this.enemySprites.get(id);
      const baseName = this.getEnemySpriteBaseName(enemy.type);
      const isBoss = enemy.type.startsWith('boss_');
      const isMiniSlime = enemy.type === 'mini_slime';

      if (!sprite) {
        // Create new sprite for this enemy
        const spriteName = `${baseName}_idle_0`;
        const material = this.spriteLoader.createAtlasSpriteMaterial('main', spriteName);
        if (material) {
          material.transparent = true;
          sprite = new THREE.Sprite(material);
          this.enemySprites.set(id, sprite);
          this.scene.add(sprite);

          // Initialize animation state
          const animState = this.animationController.createState(enemy.type);
          this.enemyAnimStates.set(id, animState);
          // Initialize previous position
          this.enemyPrevPositions.set(id, { x: enemy.x, y: enemy.y });
        } else {
          // Fallback handled by procedural rendering
          return;
        }
      }

      sprite.visible = true;

      // Calculate velocity for animation direction
      const prevPos = this.enemyPrevPositions.get(id);
      const velocityX = prevPos ? (enemy.x - prevPos.x) / dt : 0;
      const velocityY = prevPos ? (enemy.y - prevPos.y) / dt : 0;
      const isMoving = Math.abs(velocityX) > 0.1 || Math.abs(velocityY) > 0.1;

      // Update animation state
      const animState = this.enemyAnimStates.get(id);
      if (animState) {
        this.animationController.setAnimation(animState, enemy.type, isMoving ? 'move' : 'idle');
        this.animationController.update(animState, enemy.type, dt);

        // Apply animation frame - manually handle since we're using simple 2-frame animation
        const frameIndex = Math.floor(time * 3) % 2; // 3 fps animation, 2 frames
        const spriteName = `${baseName}_idle_${frameIndex}`;
        const uvs = this.spriteLoader.getSpriteUVs('main', spriteName);
        if (uvs && sprite.material instanceof THREE.SpriteMaterial && sprite.material.map) {
          sprite.material.map.offset.set(uvs.u0, uvs.v0);
          sprite.material.map.repeat.set(uvs.u1 - uvs.u0, uvs.v1 - uvs.v0);
        }
      }

      // Store current position for next frame
      this.enemyPrevPositions.set(id, { x: enemy.x, y: enemy.y });

      // Scale based on enemy type
      let scale = 2.0; // Base scale
      if (isBoss) {
        scale = 6.0; // Bosses are much larger
        // Boss pulsing animation
        const pulseOffset = enemy.x * 0.1 + enemy.y * 0.1;
        const pulse = 1 + Math.sin((time + pulseOffset) * 2) * 0.08;
        scale *= pulse;
      } else if (isMiniSlime) {
        scale = 1.2; // Mini slimes are smaller
      }

      sprite.scale.set(scale, scale, 1);
      sprite.position.set(enemy.x, 1.0, enemy.y);
    });

    // Hide procedural meshes when using sprites
    this.enemyMeshes.forEach(mesh => mesh.count = 0);
  }

  /**
   * Update enemies using procedural InstancedMesh rendering (fallback)
   */
  private updateEnemiesProcedural(enemies: Map<string, EnemyState>) {
    // Reset all counts
    this.enemyMeshes.forEach(mesh => mesh.count = 0);

    // Group enemies by type (with frustum culling)
    const enemiesByType = new Map<string, EnemyState[]>();
    // Debug counters for performance monitoring (prefixed with _ as not currently used)
    let _totalEnemies = 0;
    let _visibleEnemies = 0;

    enemies.forEach(enemy => {
      _totalEnemies++;
      // Skip enemies outside view frustum
      if (!this.isInView(enemy.x, enemy.y)) return;
      _visibleEnemies++;

      if (!enemiesByType.has(enemy.type)) {
        enemiesByType.set(enemy.type, []);
      }
      enemiesByType.get(enemy.type)!.push(enemy);
    });


    // Update each type's InstancedMesh
    enemiesByType.forEach((typeEnemies, type) => {
      let mesh = this.enemyMeshes.get(type);
      if (!mesh) {
        // Create pool for new enemy type
        this.createEnemyPool(type, 0xff0000, 200);
        mesh = this.enemyMeshes.get(type)!;
      }

      mesh.count = typeEnemies.length;

      const time = Date.now() / 1000; // Current time for animations

      typeEnemies.forEach((enemy, index) => {
        // Reset dummy transform
        this.dummy.position.set(enemy.x, 1.0, enemy.y);
        this.dummy.rotation.set(0, 0, 0);

        // BUG-022 FIX: Scale bosses larger for visual distinction
        const isBoss = type.startsWith('boss_');
        let scale = isBoss ? 3.0 : 1.5;

        // Boss pulsing animation - breathing effect for intimidating presence
        if (isBoss) {
          // Use enemy position for unique phase offset
          const pulseOffset = enemy.x * 0.1 + enemy.y * 0.1;
          const pulse = 1 + Math.sin((time + pulseOffset) * 2) * 0.08;
          scale *= pulse;
        }

        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();
        mesh!.setMatrixAt(index, this.dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false; // Disable frustum culling on mesh itself
    });
  }

  // BUG-017 FIX: Visual sizes for projectiles (independent of collision radius)
  // The collision radius can be large for hit detection, but visual should be small
  private static readonly PROJECTILE_VISUAL_SIZES: Record<string, number> = {
    slash: 0.8,           // Knife slash - small quick arc
    bullet: 0.5,          // Wand bullet - small projectile
    orb: 0.7,             // Bible orb - medium orbiting orb
    lightning_bolt: 0.4,  // Lightning - thin bolt
    axe_spin: 0.9,        // Axe - spinning axe head
    fireball: 0.8,        // Fireball - medium fire projectile
    explosion: 2.0,       // Explosion - larger effect
    whip_strike: 0.6,     // Whip - arc effect
    garlic_aura: 0.7,     // Garlic - medium aura
    demon_fireball: 0.6,  // Enemy fireball - medium projectile
  };

  // Per-weapon projectile colors for visual distinction
  private static readonly PROJECTILE_COLORS: Record<string, number> = {
    slash: 0xc0c0c0,      // Silver - knife slashes
    bullet: 0x9b59b6,     // Purple - magic wand
    orb: 0xffd700,        // Gold - bible orbs
    lightning_bolt: 0x00ffff, // Cyan - lightning bolts
    axe_spin: 0x8b4513,   // Brown - wooden axe handle
    fireball: 0xff4500,   // Orange-red - fireball
    explosion: 0xff6600,  // Orange - explosion
    whip_strike: 0xa52a2a, // Dark red - whip
    garlic_aura: 0x90ee90, // Light green - garlic
    demon_fireball: 0xff0000, // Red - enemy fireball
  };

  // Projectile rotation speeds (radians per second) - 0 means no rotation
  private static readonly PROJECTILE_ROTATION_SPEEDS: Record<string, number> = {
    slash: 0,             // No rotation - quick arc
    bullet: 0,            // No rotation - flies straight
    orb: 2.0,             // Slow spin - bible orb
    lightning_bolt: 0,    // No rotation - bolt shape
    axe_spin: 15.0,       // Fast spin - spinning axe
    fireball: 3.0,        // Medium spin - tumbling fireball
    explosion: 0,         // No rotation - expanding
    whip_strike: 0,       // No rotation - arc
    garlic_aura: 1.0,     // Slow spin - aura effect
    demon_fireball: 5.0,  // Medium-fast spin - tumbling
  };

  private getProjectileVisualSize(type: string): number {
    return Renderer.PROJECTILE_VISUAL_SIZES[type] || 0.5; // Default 0.5 for unknown types
  }

  private getProjectileColor(type: string): number {
    return Renderer.PROJECTILE_COLORS[type] || 0xffff00; // Default yellow for unknown types
  }

  private getProjectileRotationSpeed(type: string): number {
    return Renderer.PROJECTILE_ROTATION_SPEEDS[type] || 0; // Default no rotation
  }

  private updateProjectiles(projectiles: Map<string, ProjectileState>) {
    if (this.isSpriteMode()) {
      this.updateProjectilesSprite(projectiles);
    } else {
      this.updateProjectilesProcedural(projectiles);
    }
  }

  // Map server projectile types to atlas sprite names
  private static readonly PROJECTILE_SPRITE_NAMES: Record<string, string> = {
    slash: 'projectile_slash',
    bullet: 'projectile_bullet',
    orb: 'projectile_orb',
    lightning_bolt: 'projectile_lightning',
    axe_spin: 'projectile_axe',      // Has animation frames _0, _1
    fireball: 'projectile_fireball', // Has animation frames _0, _1
    explosion: 'projectile_fireball', // Reuse fireball sprite
    whip_strike: 'projectile_whip',
    garlic_aura: 'projectile_garlic',
    demon_fireball: 'projectile_fireball', // Reuse fireball sprite for enemy attacks
  };

  // Projectiles with animation frames
  private static readonly PROJECTILE_HAS_ANIMATION: Set<string> = new Set([
    'axe_spin', 'fireball', 'demon_fireball', 'explosion'
  ]);

  /**
   * Get the sprite name for a projectile type
   */
  private getProjectileSpriteName(type: string): string {
    const baseName = Renderer.PROJECTILE_SPRITE_NAMES[type] || 'projectile_bullet';

    // Add animation frame for projectiles that have multiple frames
    if (Renderer.PROJECTILE_HAS_ANIMATION.has(type)) {
      const frameIndex = Math.floor(Date.now() / 100) % 2; // 10 fps animation
      return `${baseName}_${frameIndex}`;
    }

    return baseName;
  }

  /**
   * Update projectiles using sprite-based rendering (P1.9)
   */
  private updateProjectilesSprite(projectiles: Map<string, ProjectileState>) {
    // Remove sprites for destroyed projectiles
    const currentIds = new Set(projectiles.keys());
    this.projectileSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.projectileSprites.delete(id);
      }
    });

    // Update/create projectile sprites
    projectiles.forEach((projectile, id) => {
      // Skip projectiles outside view (frustum culling)
      if (!this.isInView(projectile.x, projectile.y, projectile.radius)) {
        const existingSprite = this.projectileSprites.get(id);
        if (existingSprite) {
          existingSprite.visible = false;
        }
        return;
      }

      let sprite = this.projectileSprites.get(id);
      const spriteName = this.getProjectileSpriteName(projectile.type);

      if (!sprite) {
        // Create new sprite for this projectile
        const material = this.spriteLoader.createAtlasSpriteMaterial('main', spriteName);
        if (material) {
          material.transparent = true;
          sprite = new THREE.Sprite(material);
          this.projectileSprites.set(id, sprite);
          this.scene.add(sprite);
        } else {
          // Fallback handled by procedural rendering
          return;
        }
      }

      sprite.visible = true;

      // Update sprite texture for animated projectiles
      if (Renderer.PROJECTILE_HAS_ANIMATION.has(projectile.type)) {
        const uvs = this.spriteLoader.getSpriteUVs('main', spriteName);
        if (uvs && sprite.material instanceof THREE.SpriteMaterial && sprite.material.map) {
          sprite.material.map.offset.set(uvs.u0, uvs.v0);
          sprite.material.map.repeat.set(uvs.u1 - uvs.u0, uvs.v1 - uvs.v0);
        }
      }

      // Scale based on projectile type
      const visualSize = this.getProjectileVisualSize(projectile.type);
      const scale = visualSize * 2.5; // Slightly larger for visibility
      sprite.scale.set(scale, scale, 1);

      sprite.position.set(projectile.x, 1.0, projectile.y);
    });

    // Hide procedural meshes when using sprites
    this.projectileMesh.count = 0;
    this.projectileMeshLOD.count = 0;
  }

  /**
   * Update projectiles using procedural InstancedMesh rendering (fallback)
   */
  private updateProjectilesProcedural(projectiles: Map<string, ProjectileState>) {
    // Filter and sort projectiles with frustum culling and LOD
    let indexHi = 0;  // High detail (close to camera)
    let indexLo = 0;  // Low detail (far from camera)
    const time = Date.now() / 1000; // Current time in seconds for animation

    projectiles.forEach(projectile => {
      // Skip projectiles outside view
      if (!this.isInView(projectile.x, projectile.y, projectile.radius)) return;

      this.dummy.position.set(projectile.x, 1.0, projectile.y);

      // Apply rotation animation based on projectile type
      const rotationSpeed = this.getProjectileRotationSpeed(projectile.type);
      if (rotationSpeed > 0) {
        // Use position-based offset for unique rotation per projectile
        const rotationOffset = (projectile.x + projectile.y) * 0.5;
        const rotation = (time + rotationOffset) * rotationSpeed;
        // Spin around Y axis (vertical) for top-down view
        this.dummy.rotation.set(0, rotation, rotation * 0.3);
      } else {
        this.dummy.rotation.set(0, 0, 0);
      }

      // BUG-017 FIX: Use type-based visual size instead of collision radius
      const visualSize = this.getProjectileVisualSize(projectile.type);
      this.dummy.scale.setScalar(visualSize);
      this.dummy.updateMatrix();

      // Get per-weapon color
      const color = this.getProjectileColor(projectile.type);
      this.tempColor.setHex(color);

      // Use LOD based on distance from camera center
      if (this.shouldUseLOD(projectile.x, projectile.y)) {
        this.projectileMeshLOD.setMatrixAt(indexLo, this.dummy.matrix);
        this.projectileMeshLOD.setColorAt(indexLo, this.tempColor);
        indexLo++;
      } else {
        this.projectileMesh.setMatrixAt(indexHi, this.dummy.matrix);
        this.projectileMesh.setColorAt(indexHi, this.tempColor);
        indexHi++;
      }
    });

    this.projectileMesh.count = indexHi;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    if (this.projectileMesh.instanceColor) {
      this.projectileMesh.instanceColor.needsUpdate = true;
    }

    this.projectileMeshLOD.count = indexLo;
    this.projectileMeshLOD.instanceMatrix.needsUpdate = true;
    if (this.projectileMeshLOD.instanceColor) {
      this.projectileMeshLOD.instanceColor.needsUpdate = true;
    }
  }

  private updateXPOrbs(orbs: Map<string, XPOrbState>) {
    if (this.isSpriteMode()) {
      this.updateXPOrbsSprite(orbs);
    } else {
      this.updateXPOrbsProcedural(orbs);
    }
  }

  /**
   * Update XP orbs using sprite-based rendering (P1.9)
   * Uses xp_orb_small/medium/large sprites from atlas
   */
  private updateXPOrbsSprite(orbs: Map<string, XPOrbState>) {
    // Remove sprites for collected orbs
    const currentIds = new Set(orbs.keys());
    this.xpOrbSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.xpOrbSprites.delete(id);
      }
    });

    // Update/create orb sprites
    orbs.forEach((orb, id) => {
      // Skip orbs outside view (frustum culling)
      if (!this.isInView(orb.x, orb.y, 0.5)) {
        const existingSprite = this.xpOrbSprites.get(id);
        if (existingSprite) {
          existingSprite.visible = false;
        }
        return;
      }

      let sprite = this.xpOrbSprites.get(id);
      const spriteName = `xp_orb_${orb.size}`;

      if (!sprite) {
        // Create new sprite for this orb
        const material = this.spriteLoader.createAtlasSpriteMaterial('main', spriteName);
        if (material) {
          material.transparent = true;
          sprite = new THREE.Sprite(material);
          this.xpOrbSprites.set(id, sprite);
          this.scene.add(sprite);
        } else {
          // Fallback to procedural if sprite not available
          return;
        }
      }

      sprite.visible = true;

      // Scale based on orb size
      const scale = orb.size === 'large' ? 2.0 : orb.size === 'medium' ? 1.5 : 1.0;
      sprite.scale.set(scale, scale, 1);

      // Bob up and down animation
      const bobOffset = Math.sin(Date.now() * 0.005 + orb.x) * 0.2;
      sprite.position.set(orb.x, 0.5 + bobOffset, orb.y);
    });

    // Hide procedural meshes when using sprites
    this.xpOrbMesh.count = 0;
    this.xpOrbMeshLOD.count = 0;
  }

  /**
   * Update XP orbs using procedural InstancedMesh rendering (fallback)
   */
  private updateXPOrbsProcedural(orbs: Map<string, XPOrbState>) {
    // Filter and sort XP orbs with frustum culling and LOD
    let indexHi = 0;  // High detail
    let indexLo = 0;  // Low detail

    orbs.forEach(orb => {
      // Skip orbs outside view
      if (!this.isInView(orb.x, orb.y, 0.5)) return;

      const scale = orb.size === 'large' ? 1.0 : orb.size === 'medium' ? 0.7 : 0.5; // Larger for visibility

      // Bob up and down
      const bobOffset = Math.sin(Date.now() * 0.005 + orb.x) * 0.2;

      this.dummy.position.set(orb.x, 0.5 + bobOffset, orb.y);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();

      // Use LOD based on distance from camera center
      if (this.shouldUseLOD(orb.x, orb.y)) {
        this.xpOrbMeshLOD.setMatrixAt(indexLo, this.dummy.matrix);
        indexLo++;
      } else {
        this.xpOrbMesh.setMatrixAt(indexHi, this.dummy.matrix);
        indexHi++;
      }
    });

    this.xpOrbMesh.count = indexHi;
    this.xpOrbMesh.instanceMatrix.needsUpdate = true;
    this.xpOrbMeshLOD.count = indexLo;
    this.xpOrbMeshLOD.instanceMatrix.needsUpdate = true;
  }

  /**
   * P5.2: Update power-up rendering
   * Power-ups are rendered as glowing sprites with bobbing animation
   */
  private updatePowerUps(powerUps: Map<string, PowerUpState>) {
    // Remove sprites for collected/despawned power-ups
    const currentIds = new Set(powerUps.keys());
    this.powerUpSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.powerUpSprites.delete(id);
      }
    });

    // Update/create sprites for each power-up
    powerUps.forEach((powerUp, id) => {
      // Skip if outside view frustum
      if (!this.isInView(powerUp.x, powerUp.y, 2)) {
        const existingSprite = this.powerUpSprites.get(id);
        if (existingSprite) {
          existingSprite.visible = false;
        }
        return;
      }

      let sprite = this.powerUpSprites.get(id);

      if (!sprite) {
        // Create new sprite with power-up-specific color
        const color = this.getPowerUpColor(powerUp.type);
        const geometry = new THREE.PlaneGeometry(1.5, 1.5);
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.9 }));
        sprite.scale.set(1.5, 1.5, 1);
        this.powerUpSprites.set(id, sprite);
        this.scene.add(sprite);
      }

      sprite.visible = true;

      // Bobbing animation (faster than XP orbs to make them more noticeable)
      const bobOffset = Math.sin(Date.now() * 0.008 + powerUp.x * 0.5) * 0.3;
      // Pulse scale for visibility
      const pulseScale = 1.5 + Math.sin(Date.now() * 0.005) * 0.2;
      sprite.scale.set(pulseScale, pulseScale, 1);

      sprite.position.set(powerUp.x, 0.8 + bobOffset, powerUp.y);
    });
  }

  /**
   * P5.2: Get color for power-up type
   */
  private getPowerUpColor(type: string): number {
    switch (type) {
      case 'health_restore':
        return 0xff4444; // Red - health
      case 'damage_boost':
        return 0xff8800; // Orange - damage
      case 'speed_boost':
        return 0x44ff44; // Green - speed
      case 'shield':
        return 0x4488ff; // Blue - shield
      case 'magnet_boost':
        return 0xaa44ff; // Purple - magnet
      default:
        return 0xffffff; // White - unknown
    }
  }

  private onResize(canvas: HTMLCanvasElement) {
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.camera.left = this.frustumSize * aspect / -2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    // Update post-processing composer size (P1.10)
    // Only update if post-processing has been initialized (lazy-loaded)
    if (this.postProcessingInitialized && this.composer) {
      this.composer.setSize(canvas.clientWidth, canvas.clientHeight);
    }
    if (this.postProcessingInitialized && this.crtPass) {
      this.crtPass.uniforms.resolution.value.set(canvas.clientWidth, canvas.clientHeight);
    }
  }

  /**
   * Spawn a floating damage number at the given world position
   * @param damage - The damage amount to display
   * @param worldX - World X coordinate
   * @param worldY - World Y coordinate (Z in 3D space)
   * @param isCritical - Whether to show as critical hit (larger, different color)
   */
  spawnDamageNumber(damage: number, worldX: number, worldY: number, isCritical: boolean = false): void {
    if (!this.damageContainer) return;

    const element = document.createElement('div');
    element.textContent = Math.round(damage).toString();
    element.style.cssText = `
      position: absolute;
      font-family: 'Press Start 2P', monospace;
      font-size: ${isCritical ? '16px' : '12px'};
      font-weight: bold;
      color: ${isCritical ? '#ffff00' : '#ff6b6b'};
      text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
      pointer-events: none;
      white-space: nowrap;
      transform: translate(-50%, -50%);
      transition: none;
    `;

    this.damageContainer.appendChild(element);

    this.damageNumbers.push({
      element,
      worldX,
      worldY,
      startTime: performance.now(),
      duration: 800, // milliseconds
    });
  }

  /**
   * Update and animate all active damage numbers
   * Removes expired numbers and updates screen positions
   */
  private updateDamageNumbers(): void {
    const now = performance.now();
    const canvas = this.renderer.domElement;
    const halfWidth = canvas.clientWidth / 2;
    const halfHeight = canvas.clientHeight / 2;

    // Process damage numbers in reverse to safely remove during iteration
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      const elapsed = now - dn.startTime;
      const progress = elapsed / dn.duration;

      if (progress >= 1) {
        // Remove expired damage number
        dn.element.remove();
        this.damageNumbers.splice(i, 1);
        continue;
      }

      // Calculate vertical offset (float upward)
      const floatOffset = progress * 2; // Rise 2 units over duration

      // Convert world position to screen position
      const worldPos = new THREE.Vector3(dn.worldX, 0.5 + floatOffset, dn.worldY);
      worldPos.project(this.camera);

      const screenX = (worldPos.x * halfWidth) + halfWidth;
      const screenY = -(worldPos.y * halfHeight) + halfHeight;

      // Update element position
      dn.element.style.left = `${screenX}px`;
      dn.element.style.top = `${screenY}px`;

      // Fade out
      const opacity = 1 - progress;
      dn.element.style.opacity = opacity.toString();

      // Scale up slightly at start, then shrink
      const scale = progress < 0.2 ? 1 + progress : 1.2 - (progress - 0.2) * 0.3;
      dn.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  /**
   * Detect enemy health changes and spawn damage numbers
   */
  private detectDamage(enemies: Map<string, EnemyState>): void {
    enemies.forEach((enemy, id) => {
      const lastHealth = this.lastEnemyHealth.get(id);

      if (lastHealth !== undefined && enemy.health < lastHealth) {
        const damage = lastHealth - enemy.health;
        // Spawn damage number with slight random offset for visual variety
        const offsetX = (Math.random() - 0.5) * 0.5;
        const offsetY = (Math.random() - 0.5) * 0.5;
        const isCritical = damage >= 25; // Consider high damage as critical
        this.spawnDamageNumber(damage, enemy.x + offsetX, enemy.y + offsetY, isCritical);
      }

      this.lastEnemyHealth.set(id, enemy.health);
    });

    // Clean up tracking for removed enemies
    const currentIds = new Set(enemies.keys());
    this.lastEnemyHealth.forEach((_, id) => {
      if (!currentIds.has(id)) {
        this.lastEnemyHealth.delete(id);
      }
    });
  }

  /**
   * Spawn sparkle particles when XP orbs are collected
   * Creates a burst of particles at the collection point
   */
  spawnXPSparkle(x: number, z: number, orbValue: number): void {
    // Number of particles scales with orb value
    const particleCount = Math.min(8 + Math.floor(orbValue / 5), 20);

    // Color based on orb size (value)
    let color: number;
    if (orbValue >= 25) {
      color = 0xffff00; // Gold for large orbs
    } else if (orbValue >= 5) {
      color = 0x00ffff; // Cyan for medium orbs
    } else {
      color = 0x00ff88; // Green for small orbs
    }

    for (let i = 0; i < particleCount; i++) {
      // Random direction in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2 + Math.random() * 3;

      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.sin(phi) * Math.sin(theta)) * speed + 2; // Bias upward
      const vz = Math.cos(phi) * speed;

      this.particles.push({
        x,
        y: 0.3, // Start at orb height
        z,
        vx,
        vy,
        vz,
        life: 0.5 + Math.random() * 0.3, // 0.5-0.8 seconds
        maxLife: 0.5 + Math.random() * 0.3,
        scale: 0.5 + Math.random() * 0.5,
        color,
      });
    }
  }

  /**
   * Update particle physics and render them
   */
  private updateParticles(dt: number): void {
    // Update particle physics
    const gravity = -15;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Apply gravity
      p.vy += gravity * dt;

      // Reduce life
      p.life -= dt;

      // Remove dead particles
      if (p.life <= 0 || p.y < 0) {
        this.particles.splice(i, 1);
      }
    }

    // Render particles
    this.particleMesh.count = Math.min(this.particles.length, 500);

    this.particles.slice(0, 500).forEach((p, index) => {
      const lifeRatio = p.life / p.maxLife;

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.scale * lifeRatio);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(index, this.dummy.matrix);

      // Update color with fade
      this.tempColor.setHex(p.color);
      this.particleMesh.setColorAt(index, this.tempColor);
    });

    if (this.particles.length > 0) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * Detect XP orb collection and spawn sparkles
   */
  private detectXPCollection(orbs: Map<string, XPOrbState>): void {
    // Track current orbs
    const currentOrbIds = new Set<string>();
    orbs.forEach((orb, id) => {
      currentOrbIds.add(id);
      // Store position for when orb is collected
      this.lastXpOrbPositions.set(id, { x: orb.x, y: orb.y, value: orb.value });
    });

    // Check for collected orbs (orbs that disappeared)
    this.lastXpOrbPositions.forEach((pos, id) => {
      if (!currentOrbIds.has(id)) {
        // Orb was collected - spawn sparkle effect
        this.spawnXPSparkle(pos.x, pos.y, pos.value);
        this.lastXpOrbPositions.delete(id);
      }
    });
  }

  /**
   * Spawn weapon impact particles at hit location
   * Creates a small burst of colored particles when weapons hit enemies
   */
  spawnWeaponImpact(x: number, z: number, weaponColor: number = 0xffff00): void {
    const particleCount = 5;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 1.5 + Math.random() * 1.5;

      this.particles.push({
        x,
        y: 0.5,
        z,
        vx: Math.cos(angle) * speed,
        vy: 1 + Math.random() * 2,
        vz: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.15,
        maxLife: 0.2 + Math.random() * 0.15,
        scale: 0.3 + Math.random() * 0.2,
        color: weaponColor,
      });
    }
  }

  /**
   * Spawn death explosion particles when enemy dies
   * Creates a larger burst with more particles
   */
  spawnDeathExplosion(x: number, z: number, enemyType: string): void {
    // Use shared color palette for consistency (P1.11)
    const color = DEATH_PARTICLE_COLORS[enemyType] || 0xff0000;
    const isBoss = enemyType.startsWith('boss_');
    const particleCount = isBoss ? 30 : 12;

    for (let i = 0; i < particleCount; i++) {
      // Random direction in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (isBoss ? 4 : 2) + Math.random() * 3;

      this.particles.push({
        x,
        y: 0.4 + Math.random() * 0.3,
        z,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.abs(Math.cos(phi)) * speed + 1,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.4 + Math.random() * 0.3,
        scale: (isBoss ? 0.6 : 0.4) + Math.random() * 0.3,
        color,
      });
    }
  }

  /**
   * Trigger screen flash effect for level up
   * Creates a golden radial flash that fades quickly
   */
  triggerLevelUpFlash(): void {
    if (!this.screenFlash) return;

    // Flash in
    this.screenFlash.style.opacity = '1';

    // Fade out after delay
    setTimeout(() => {
      if (this.screenFlash) {
        this.screenFlash.style.opacity = '0';
      }
    }, 150);
  }

  /**
   * Clean up DOM elements and resources on destroy
   */
  destroy(): void {
    if (this.damageContainer) {
      this.damageContainer.remove();
      this.damageContainer = null;
    }
    if (this.screenFlash) {
      this.screenFlash.remove();
      this.screenFlash = null;
    }
    // P3.1: Clean up player name labels
    if (this.playerNameContainer) {
      this.playerNameContainer.remove();
      this.playerNameContainer = null;
    }
    this.playerNameLabels.clear();
    this.damageNumbers = [];
    this.lastEnemyHealth.clear();
    this.particles = [];
    this.lastXpOrbPositions.clear();

    // Clean up sprite system
    this.spriteLoader.clearCache();
    this.animationController.clear();
    this.playerAnimStates.clear();
    this.enemyAnimStates.clear();
    this.playerPrevPositions.clear();
    this.enemyPrevPositions.clear();

    // Clean up entity sprites (P1.9)
    this.xpOrbSprites.forEach(sprite => this.scene.remove(sprite));
    this.xpOrbSprites.clear();
    this.enemySprites.forEach(sprite => this.scene.remove(sprite));
    this.enemySprites.clear();
    this.projectileSprites.forEach(sprite => this.scene.remove(sprite));
    this.projectileSprites.clear();
    // P5.2: Clean up power-up sprites
    this.powerUpSprites.forEach(sprite => this.scene.remove(sprite));
    this.powerUpSprites.clear();

    // Clean up post-processing (P1.10)
    this.composer = null;
    this.crtPass = null;
  }
}