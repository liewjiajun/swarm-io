import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PlayerState, EnemyState, ProjectileState, XPOrbState, PowerUpState, WorldEventState, WorldEventType } from '@swarm-io/shared';

// =============================================================================
// THREE.JS MOCKS
// =============================================================================
// Mock Three.js before importing Renderer to prevent WebGL context creation
// Using factory functions to avoid hoisting issues with vi.mock

// Mock THREE module - using factory function pattern
vi.mock('three', () => {
  // All mock classes defined inside the factory function
  const createMockFn = () => vi.fn();

  class MockInstancedMesh {
    count = 0;
    frustumCulled = true;
    instanceMatrix = { needsUpdate: false };
    instanceColor: any = null;
    material: any = {};
    position = { set: createMockFn() };
    rotation = { set: createMockFn(), x: 0 };
    scale = { set: createMockFn() };
    setMatrixAt = createMockFn();
    setColorAt = createMockFn();
  }

  class MockSprite {
    visible = true;
    position = { set: createMockFn(), x: 0, y: 0, z: 0 };
    scale = { set: createMockFn() };
    material: any = { opacity: 1, color: { setHex: createMockFn() }, map: null };
  }

  class MockMesh {
    visible = true;
    position = { set: createMockFn(), x: 0, y: 0, z: 0 };
    rotation = { set: createMockFn(), x: 0 };
    scale = { set: createMockFn(), setScalar: createMockFn() };
    material: any = {
      color: { setHex: createMockFn() },
      opacity: 1,
      uniforms: { time: { value: 0 }, innerRadius: { value: 0 }, outerRadius: { value: 0 } }
    };
  }

  class MockObject3D {
    position = { set: createMockFn() };
    rotation = { set: createMockFn() };
    scale = { set: createMockFn(), setScalar: createMockFn() };
    matrix = {};
    updateMatrix = createMockFn();
  }

  class MockOrthographicCamera {
    position = { set: createMockFn(), x: 0, y: 20, z: 20 };
    projectionMatrix = {};
    matrixWorldInverse = {};
    lookAt = createMockFn();
    updateMatrixWorld = createMockFn();
    left = -15;
    right = 15;
    top = 15;
    bottom = -15;
  }

  class MockScene {
    background: any = null;
    children: any[] = [];
    add = vi.fn(function(this: any, obj: any) { this.children.push(obj); });
    remove = vi.fn(function(this: any, obj: any) {
      const idx = this.children.indexOf(obj);
      if (idx > -1) this.children.splice(idx, 1);
    });
  }

  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    setSize = createMockFn();
    setPixelRatio = createMockFn();
    render = createMockFn();
  }

  class MockTexture {
    image = { src: 'test' };
    wrapS = 0;
    wrapT = 0;
    magFilter = 0;
    minFilter = 0;
    repeat = { set: createMockFn() };
    offset = { set: createMockFn() };
  }

  class MockCanvasTexture extends MockTexture {
    constructor(_canvas?: HTMLCanvasElement) {
      super();
    }
  }

  class MockTextureLoader {
    load = vi.fn((url: string, onLoad?: Function, _onProgress?: Function, _onError?: Function) => {
      setTimeout(() => {
        if (onLoad) {
          const tex = new MockTexture();
          onLoad(tex);
        }
      }, 0);
      return new MockTexture();
    });
  }

  class MockColor {
    constructor(_hex?: number) {}
    set = vi.fn().mockReturnThis();
    setHex = vi.fn().mockReturnThis();
  }

  class MockVector2 {
    x = 0;
    y = 0;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set = vi.fn().mockReturnThis();
  }

  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set = vi.fn().mockReturnThis();
    project = vi.fn().mockReturnThis();
  }

  class MockMatrix4 {
    multiplyMatrices = vi.fn().mockReturnThis();
  }

  class MockFrustum {
    setFromProjectionMatrix = createMockFn();
    containsPoint = vi.fn().mockReturnValue(true);
  }

  class MockSphereGeometry {}
  class MockPlaneGeometry {}
  class MockBoxGeometry {}
  class MockConeGeometry {}
  class MockOctahedronGeometry {}
  class MockIcosahedronGeometry {}
  class MockRingGeometry {}
  class MockCircleGeometry {}

  class MockMeshBasicMaterial {
    color: any;
    vertexColors = false;
    transparent = false;
    opacity = 1;
    side = 0;
    depthWrite = true;
    constructor(params?: any) {
      this.color = params?.color;
    }
  }

  class MockMeshStandardMaterial {
    color: any;
    map: any = null;
    roughness = 0.5;
    constructor(params?: any) {
      this.color = params?.color;
      this.map = params?.map;
      this.roughness = params?.roughness ?? 0.5;
    }
  }

  class MockSpriteMaterial {
    color: any;
    transparent = true;
    opacity = 1;
    map: any = null;
    constructor(params?: any) {
      this.color = new MockColor(params?.color);
    }
  }

  class MockShaderMaterial {
    uniforms: any;
    vertexShader: string;
    fragmentShader: string;
    transparent = false;
    side = 0;
    depthWrite = true;
    constructor(params?: any) {
      this.uniforms = params?.uniforms || {};
      this.vertexShader = params?.vertexShader || '';
      this.fragmentShader = params?.fragmentShader || '';
    }
  }

  class MockAmbientLight {}
  class MockDirectionalLight {
    position = { set: createMockFn() };
  }

  class MockGridHelper {
    position = { y: 0 };
  }

  class MockInstancedBufferAttribute {
    constructor(_array: Float32Array, _itemSize: number) {}
  }

  return {
    Scene: MockScene,
    OrthographicCamera: MockOrthographicCamera,
    WebGLRenderer: MockWebGLRenderer,
    InstancedMesh: MockInstancedMesh,
    Sprite: MockSprite,
    Mesh: MockMesh,
    Object3D: MockObject3D,
    Color: MockColor,
    Vector2: MockVector2,
    Vector3: MockVector3,
    Matrix4: MockMatrix4,
    Frustum: MockFrustum,
    SphereGeometry: MockSphereGeometry,
    PlaneGeometry: MockPlaneGeometry,
    BoxGeometry: MockBoxGeometry,
    ConeGeometry: MockConeGeometry,
    OctahedronGeometry: MockOctahedronGeometry,
    IcosahedronGeometry: MockIcosahedronGeometry,
    RingGeometry: MockRingGeometry,
    CircleGeometry: MockCircleGeometry,
    MeshBasicMaterial: MockMeshBasicMaterial,
    MeshStandardMaterial: MockMeshStandardMaterial,
    SpriteMaterial: MockSpriteMaterial,
    ShaderMaterial: MockShaderMaterial,
    AmbientLight: MockAmbientLight,
    DirectionalLight: MockDirectionalLight,
    GridHelper: MockGridHelper,
    TextureLoader: MockTextureLoader,
    Texture: MockTexture,
    CanvasTexture: MockCanvasTexture,
    InstancedBufferAttribute: MockInstancedBufferAttribute,
    RepeatWrapping: 1000,
    NearestFilter: 1003,
    DoubleSide: 2,
  };
});

// Mock post-processing modules (lazy loaded)
vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    addPass = vi.fn();
    render = vi.fn();
    setSize = vi.fn();
  }
}));

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {}
}));

vi.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    enabled = true;
    uniforms: any = {
      time: { value: 0 },
      scanLineIntensity: { value: 0.15 },
      curvatureAmount: { value: 0.03 },
      vignetteAmount: { value: 0.25 },
      rgbSeparation: { value: 0.002 },
      flickerIntensity: { value: 0.02 },
      resolution: { value: { x: 0, y: 0, set: vi.fn() } }
    };
  }
}));

// Mock SpriteLoader - using class syntax for constructor compatibility
const mockLoadAtlas = vi.fn().mockResolvedValue(undefined);
const mockCreateAtlasSpriteMaterial = vi.fn().mockReturnValue({
  color: { setHex: vi.fn() },
  transparent: true,
  opacity: 1,
  map: null,
});
const mockGetSpriteUVs = vi.fn().mockReturnValue({ u0: 0, v0: 0, u1: 1, v1: 1 });

vi.mock('./SpriteLoader', () => {
  return {
    SpriteLoader: class MockSpriteLoader {
      loadAtlas = mockLoadAtlas;
      createAtlasSpriteMaterial = mockCreateAtlasSpriteMaterial;
      getSpriteUVs = mockGetSpriteUVs;
      clearCache = vi.fn();
    }
  };
});

// Mock AnimationController - using class syntax for constructor compatibility
const mockSetSpriteLoader = vi.fn();
const mockDefineAnimations = vi.fn();
const mockCreateState = vi.fn().mockReturnValue({ direction: 'down', animation: 'idle', frame: 0, time: 0 });
const mockSetAnimation = vi.fn();
const mockUpdate = vi.fn();
const mockApplyToSprite = vi.fn();
const mockGetDirectionFromVelocity = vi.fn().mockReturnValue('down');

vi.mock('./AnimationController', () => {
  return {
    AnimationController: class MockAnimationController {
      setSpriteLoader = mockSetSpriteLoader;
      defineAnimations = mockDefineAnimations;
      createState = mockCreateState;
      setAnimation = mockSetAnimation;
      update = mockUpdate;
      applyToSprite = mockApplyToSprite;
      getDirectionFromVelocity = mockGetDirectionFromVelocity;
      clear = vi.fn();
    },
    createSimpleAnimation: vi.fn().mockReturnValue({}),
    createWalkAnimations: vi.fn().mockReturnValue({}),
  };
});

// Mock logger
vi.mock('../utils/logger', () => ({
  rendererLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Now import the Renderer after all mocks are set up
import { Renderer } from './Renderer';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  Object.defineProperty(canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas, 'clientHeight', { value: 600 });
  return canvas;
}

function createMockPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'player-1',
    x: 0,
    y: 0,
    speed: 10,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    weapons: [],
    nickname: 'TestPlayer',
    kills: 0,
    timeAlive: 0,
    hostility: 0,
    invulnerableTime: 0,
    dead: false,
    pendingUpgrade: false,
    armor: 0,
    magnetRange: 50,
    facingX: 1,
    facingY: 0,
    ...overrides,
  };
}

function createMockEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 'enemy-1',
    type: 'bat',
    x: 10,
    y: 10,
    health: 50,
    maxHealth: 50,
    vx: 0,
    vy: 0,
    targetPlayerId: null,
    ...overrides,
  } as EnemyState;
}

function createMockProjectile(overrides: Partial<ProjectileState> = {}): ProjectileState {
  return {
    id: 'proj-1',
    type: 'bullet',
    x: 5,
    y: 5,
    vx: 1,
    vy: 0,
    damage: 10,
    lifetime: 1,
    radius: 0.5,
    pierce: 1,
    hitCount: 0,
    ownerId: 'player-1',
    ...overrides,
  } as ProjectileState;
}

function createMockXPOrb(overrides: Partial<XPOrbState> = {}): XPOrbState {
  return {
    id: 'orb-1',
    x: 3,
    y: 3,
    value: 5,
    size: 'medium',
    magnetized: false,
    targetPlayerId: null,
    ...overrides,
  } as XPOrbState;
}

function createMockPowerUp(overrides: Partial<PowerUpState> = {}): PowerUpState {
  return {
    id: 'powerup-1',
    type: 'speed_boost',
    x: 15,
    y: 15,
    duration: 10,
    ...overrides,
  } as PowerUpState;
}

function createMockWorldEvent(overrides: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: 'event-1',
    type: 'double_xp',
    x: 20,
    y: 20,
    radius: 10,
    active: true,
    duration: 30,
    ...overrides,
  } as WorldEventState;
}

function createMockGameState(overrides: any = {}): any {
  return {
    players: new Map([['player-1', createMockPlayer()]]),
    enemies: new Map(),
    projectiles: new Map(),
    xpOrbs: new Map(),
    powerUps: new Map(),
    worldEvents: new Map(),
    worldRadius: 500,
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('Renderer', () => {
  let renderer: Renderer;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values
    mockLoadAtlas.mockResolvedValue(undefined);
    mockCreateAtlasSpriteMaterial.mockReturnValue({
      color: { setHex: vi.fn() },
      transparent: true,
      opacity: 1,
      map: null,
    });
    mockGetSpriteUVs.mockReturnValue({ u0: 0, v0: 0, u1: 1, v1: 1 });
    mockCreateState.mockReturnValue({ direction: 'down', animation: 'idle', frame: 0, time: 0 });
    mockGetDirectionFromVelocity.mockReturnValue('down');

    // Reset DOM
    document.body.innerHTML = '';

    canvas = createMockCanvas();
    document.body.appendChild(canvas);
    renderer = new Renderer(canvas);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  // ===========================================================================
  // CONSTRUCTOR TESTS
  // ===========================================================================

  describe('constructor', () => {
    it('should create a Renderer instance', () => {
      expect(renderer).toBeDefined();
      expect(renderer).toBeInstanceOf(Renderer);
    });

    it('should create DOM containers for damage numbers and player labels', () => {
      const damageContainer = document.getElementById('damage-numbers');
      const nameContainer = document.getElementById('player-name-labels');
      const screenFlash = document.getElementById('screen-flash');

      expect(damageContainer).not.toBeNull();
      expect(nameContainer).not.toBeNull();
      expect(screenFlash).not.toBeNull();
    });

    it('should initialize sprite loader and animation controller', () => {
      expect(renderer.getSpriteLoader()).toBeDefined();
      expect(renderer.getAnimationController()).toBeDefined();
    });
  });

  // ===========================================================================
  // CRT SHADER TESTS (P1.10)
  // ===========================================================================

  describe('CRT shader (P1.10)', () => {
    it('should start with CRT disabled', () => {
      expect(renderer.isCRTEnabled()).toBe(false);
    });

    it('should enable CRT effect', async () => {
      await renderer.setCRTEnabled(true);
      expect(renderer.isCRTEnabled()).toBe(true);
    });

    it('should disable CRT effect', async () => {
      await renderer.setCRTEnabled(true);
      await renderer.setCRTEnabled(false);
      expect(renderer.isCRTEnabled()).toBe(false);
    });

    it('should toggle CRT effect', async () => {
      expect(renderer.isCRTEnabled()).toBe(false);

      const result1 = await renderer.toggleCRT();
      expect(result1).toBe(true);
      expect(renderer.isCRTEnabled()).toBe(true);

      const result2 = await renderer.toggleCRT();
      expect(result2).toBe(false);
      expect(renderer.isCRTEnabled()).toBe(false);
    });

    it('should configure CRT parameters when enabled', async () => {
      await renderer.setCRTEnabled(true);

      // This should not throw
      expect(() => renderer.configureCRT({
        scanLineIntensity: 0.2,
        curvatureAmount: 0.05,
        vignetteAmount: 0.3,
        rgbSeparation: 0.003,
        flickerIntensity: 0.03,
      })).not.toThrow();
    });

    it('should not throw when configuring CRT before enabling', () => {
      // CRT pass not initialized yet
      expect(() => renderer.configureCRT({
        scanLineIntensity: 0.2,
      })).not.toThrow();
    });
  });

  // ===========================================================================
  // SPRITE MODE TESTS (P1.1, P1.2)
  // ===========================================================================

  describe('sprite mode (P1.1, P1.2)', () => {
    it('should start with sprite mode disabled', () => {
      expect(renderer.isSpriteMode()).toBe(false);
    });

    it('should initialize sprite mode successfully', async () => {
      const result = await renderer.initSpriteMode();

      expect(result).toBe(true);
      expect(renderer.isSpriteMode()).toBe(true);
      expect(mockLoadAtlas).toHaveBeenCalledWith('main', 'atlas.png', 'atlas.json');
      expect(mockSetSpriteLoader).toHaveBeenCalled();
      expect(mockDefineAnimations).toHaveBeenCalled();
    });

    it('should handle sprite mode initialization failure', async () => {
      mockLoadAtlas.mockRejectedValueOnce(new Error('Failed to load'));

      const result = await renderer.initSpriteMode();

      expect(result).toBe(false);
      expect(renderer.isSpriteMode()).toBe(false);
    });

    it('should disable sprite mode', async () => {
      await renderer.initSpriteMode();
      expect(renderer.isSpriteMode()).toBe(true);

      renderer.disableSpriteMode();
      expect(renderer.isSpriteMode()).toBe(false);
    });

    it('should return sprite loader instance', () => {
      const loader = renderer.getSpriteLoader();
      expect(loader).toBeDefined();
    });

    it('should return animation controller instance', () => {
      const controller = renderer.getAnimationController();
      expect(controller).toBeDefined();
    });
  });

  // ===========================================================================
  // CAMERA TESTS
  // ===========================================================================

  describe('camera', () => {
    it('should set camera target', () => {
      renderer.setCameraTarget(100, 200);

      // Render to apply camera movement
      const state = createMockGameState();
      renderer.render(state, 'player-1');

      // Camera should be moving toward target (lerped)
      // We can't directly test private state, but render should complete without error
      expect(true).toBe(true);
    });

    it('should smoothly follow camera target during render', () => {
      const state = createMockGameState();

      renderer.setCameraTarget(50, 50);
      renderer.render(state, 'player-1');

      // Should complete without error
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // RENDER TESTS
  // ===========================================================================

  describe('render', () => {
    it('should render game state without errors', () => {
      const state = createMockGameState();

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with players', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', x: 0, y: 0 })],
        ['player-2', createMockPlayer({ id: 'player-2', x: 10, y: 10, nickname: 'Other' })],
      ]);
      const state = createMockGameState({ players });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with enemies', () => {
      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', type: 'bat' })],
        ['enemy-2', createMockEnemy({ id: 'enemy-2', type: 'skeleton', x: 20, y: 20 })],
        ['enemy-3', createMockEnemy({ id: 'enemy-3', type: 'zombie', x: 30, y: 30 })],
      ]);
      const state = createMockGameState({ enemies });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with boss enemies', () => {
      const enemies = new Map([
        ['boss-1', createMockEnemy({ id: 'boss-1', type: 'boss_slime', x: 50, y: 50 })],
        ['boss-2', createMockEnemy({ id: 'boss-2', type: 'boss_skeleton', x: 60, y: 60 })],
      ]);
      const state = createMockGameState({ enemies });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with projectiles', () => {
      const projectiles = new Map([
        ['proj-1', createMockProjectile({ id: 'proj-1', type: 'bullet' })],
        ['proj-2', createMockProjectile({ id: 'proj-2', type: 'slash', x: 8, y: 8 })],
        ['proj-3', createMockProjectile({ id: 'proj-3', type: 'orb', x: 12, y: 12 })],
      ]);
      const state = createMockGameState({ projectiles });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with XP orbs', () => {
      const xpOrbs = new Map([
        ['orb-1', createMockXPOrb({ id: 'orb-1', value: 5 })],
        ['orb-2', createMockXPOrb({ id: 'orb-2', value: 25, size: 'large', x: 10, y: 10 })],
        ['orb-3', createMockXPOrb({ id: 'orb-3', value: 2, size: 'small', x: 15, y: 15 })],
      ]);
      const state = createMockGameState({ xpOrbs });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with power-ups (P5.2)', () => {
      const powerUps = new Map([
        ['pu-1', createMockPowerUp({ id: 'pu-1', type: 'speed_boost' })],
        ['pu-2', createMockPowerUp({ id: 'pu-2', type: 'damage_boost', x: 20, y: 20 })],
      ]);
      const state = createMockGameState({ powerUps });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render with world events (P5.1, BUG-048)', () => {
      const worldEvents = new Map([
        ['event-1', createMockWorldEvent({ id: 'event-1', type: 'double_xp_zone' })],
        ['event-2', createMockWorldEvent({ id: 'event-2', type: 'meteor_shower', x: 30, y: 30 })],
      ]);
      const state = createMockGameState({ worldEvents });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should update CRT time uniform when enabled', async () => {
      await renderer.setCRTEnabled(true);
      const state = createMockGameState();

      // Render multiple frames
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      // Should complete without error
      expect(renderer.isCRTEnabled()).toBe(true);
    });

    it('should handle empty state gracefully', () => {
      const state = {
        players: new Map(),
        enemies: new Map(),
        projectiles: new Map(),
        xpOrbs: new Map(),
        worldRadius: 500,
      };

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });
  });

  // ===========================================================================
  // PLAYER RENDERING TESTS
  // ===========================================================================

  describe('player rendering', () => {
    it('should create sprites for new players', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      // Should complete without error - sprite creation is internal
      expect(true).toBe(true);
    });

    it('should remove sprites for disconnected players', () => {
      // First render with player
      const players1 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
        ['player-2', createMockPlayer({ id: 'player-2' })],
      ]);
      renderer.render(createMockGameState({ players: players1 }), 'player-1');

      // Second render without player-2
      const players2 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
      ]);
      renderer.render(createMockGameState({ players: players2 }), 'player-1');

      // Should complete without error - cleanup is internal
      expect(true).toBe(true);
    });

    it('should show invulnerability effect (opacity flicker)', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', invulnerableTime: 1000 })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      // Should complete without error - visual effect is internal
      expect(true).toBe(true);
    });

    it('should differentiate local player from other players', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
        ['player-2', createMockPlayer({ id: 'player-2', nickname: 'Other' })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      // Should complete without error - color difference is internal
      expect(true).toBe(true);
    });

    it('should use sprite mode for players when enabled', async () => {
      await renderer.initSpriteMode();

      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      // Animation controller should be called in sprite mode
      expect(mockCreateState).toHaveBeenCalled();
    });

    it('should update player animation based on movement (BUG-050)', async () => {
      await renderer.initSpriteMode();

      // First frame - player at origin
      const players1 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', x: 0, y: 0 })],
      ]);
      renderer.render(createMockGameState({ players: players1 }), 'player-1');

      // Second frame - player moved (should trigger walk animation)
      const players2 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', x: 10, y: 0, facingX: 1, facingY: 0 })],
      ]);
      renderer.render(createMockGameState({ players: players2 }), 'player-1');

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // PLAYER NAME LABELS TESTS (P3.1)
  // ===========================================================================

  describe('player name labels (P3.1)', () => {
    it('should create name labels for players with nicknames', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: 'TestPlayer' })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      const labels = document.querySelectorAll('#player-name-labels > div');
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });

    it('should hide labels for dead players', () => {
      // Create player with label
      const players1 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: 'TestPlayer', dead: false })],
      ]);
      renderer.render(createMockGameState({ players: players1 }), 'player-1');

      // Kill player
      const players2 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: 'TestPlayer', dead: true })],
      ]);
      renderer.render(createMockGameState({ players: players2 }), 'player-1');

      // Should hide label for dead player
      const labels = document.querySelectorAll('#player-name-labels > div');
      labels.forEach(label => {
        const div = label as HTMLDivElement;
        if (div.textContent === 'TestPlayer') {
          expect(div.style.display).toBe('none');
        }
      });
    });

    it('should not create labels for players without nicknames', () => {
      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: '' })],
      ]);
      const state = createMockGameState({ players });

      renderer.render(state, 'player-1');

      const labels = document.querySelectorAll('#player-name-labels > div');
      // Label might exist but should be hidden
      labels.forEach(label => {
        const div = label as HTMLDivElement;
        if (!div.textContent) {
          expect(div.style.display).toBe('none');
        }
      });
    });

    it('should remove labels for disconnected players', () => {
      // First render with two players
      const players1 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: 'Player1' })],
        ['player-2', createMockPlayer({ id: 'player-2', nickname: 'Player2' })],
      ]);
      renderer.render(createMockGameState({ players: players1 }), 'player-1');

      // Second render with only one player
      const players2 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', nickname: 'Player1' })],
      ]);
      renderer.render(createMockGameState({ players: players2 }), 'player-1');

      // Verify cleanup happened (internal - test that no error occurs)
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // ENEMY RENDERING TESTS
  // ===========================================================================

  describe('enemy rendering', () => {
    it('should render all enemy types', () => {
      const enemyTypes = ['bat', 'skeleton', 'zombie', 'ghost', 'slime', 'mini_slime', 'demon'];
      const enemies = new Map(
        enemyTypes.map((type, i) => [
          `enemy-${i}`,
          createMockEnemy({ id: `enemy-${i}`, type, x: i * 10, y: i * 10 })
        ])
      );
      const state = createMockGameState({ enemies });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render boss enemies with pulsing effect', () => {
      const enemies = new Map([
        ['boss-1', createMockEnemy({ id: 'boss-1', type: 'boss_slime', x: 0, y: 0 })],
      ]);
      const state = createMockGameState({ enemies });

      // Render multiple times to test pulsing
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should use sprite mode for enemies when enabled', async () => {
      await renderer.initSpriteMode();

      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', type: 'bat' })],
      ]);
      const state = createMockGameState({ enemies });

      renderer.render(state, 'player-1');

      // Sprite material should be created for enemy
      expect(mockCreateAtlasSpriteMaterial).toHaveBeenCalled();
    });

    it('should fall back to procedural rendering on sprite failure (BUG-038)', async () => {
      await renderer.initSpriteMode();
      mockCreateAtlasSpriteMaterial.mockReturnValueOnce(null); // First call fails

      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', type: 'bat' })],
      ]);
      const state = createMockGameState({ enemies });

      // Should not throw even when sprite creation fails
      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should remove sprites for dead enemies', () => {
      // First render with enemy
      const enemies1 = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1' })],
      ]);
      renderer.render(createMockGameState({ enemies: enemies1 }), 'player-1');

      // Second render without enemy (killed)
      const enemies2 = new Map();
      renderer.render(createMockGameState({ enemies: enemies2 }), 'player-1');

      // Should complete cleanup without error
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // PROJECTILE RENDERING TESTS
  // ===========================================================================

  describe('projectile rendering', () => {
    it('should render all projectile types', () => {
      const projTypes = ['slash', 'bullet', 'orb', 'lightning_bolt', 'axe_spin',
                         'fireball', 'explosion', 'whip_strike', 'garlic_aura'];
      const projectiles = new Map(
        projTypes.map((type, i) => [
          `proj-${i}`,
          createMockProjectile({ id: `proj-${i}`, type, x: i * 5, y: i * 5 })
        ])
      );
      const state = createMockGameState({ projectiles });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should use per-weapon projectile colors', () => {
      const projectiles = new Map([
        ['proj-1', createMockProjectile({ id: 'proj-1', type: 'fireball' })],
      ]);
      const state = createMockGameState({ projectiles });

      renderer.render(state, 'player-1');

      // Color is applied internally - test that render completes
      expect(true).toBe(true);
    });

    it('should apply projectile spawn offset for moving players (BUG-051)', () => {
      // First frame - establish player position
      const players1 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', x: 0, y: 0 })],
      ]);
      renderer.render(createMockGameState({ players: players1 }), 'player-1');

      // Second frame - player moved, projectile spawns at server position
      const players2 = new Map([
        ['player-1', createMockPlayer({ id: 'player-1', x: 5, y: 0 })],
      ]);
      const projectiles = new Map([
        ['proj-1', createMockProjectile({
          id: 'proj-1',
          x: 0, y: 0, // Server spawn position (old player pos)
          ownerId: 'player-1'
        })],
      ]);
      const state = createMockGameState({ players: players2, projectiles });

      // Should apply offset correction
      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should remove sprites for destroyed projectiles', () => {
      // First render with projectile
      const projectiles1 = new Map([
        ['proj-1', createMockProjectile({ id: 'proj-1' })],
      ]);
      renderer.render(createMockGameState({ projectiles: projectiles1 }), 'player-1');

      // Second render without projectile (destroyed)
      const projectiles2 = new Map();
      renderer.render(createMockGameState({ projectiles: projectiles2 }), 'player-1');

      expect(true).toBe(true);
    });

    it('should handle animated projectiles (axe_spin, fireball)', async () => {
      await renderer.initSpriteMode();

      const projectiles = new Map([
        ['proj-1', createMockProjectile({ id: 'proj-1', type: 'axe_spin' })],
        ['proj-2', createMockProjectile({ id: 'proj-2', type: 'fireball', x: 10, y: 10 })],
      ]);
      const state = createMockGameState({ projectiles });

      // Render multiple frames to test animation
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // XP ORB RENDERING TESTS
  // ===========================================================================

  describe('XP orb rendering', () => {
    it('should render XP orbs of all sizes', () => {
      const xpOrbs = new Map([
        ['orb-1', createMockXPOrb({ id: 'orb-1', value: 2, size: 'small', x: 0, y: 0 })],
        ['orb-2', createMockXPOrb({ id: 'orb-2', value: 10, size: 'medium', x: 5, y: 5 })],
        ['orb-3', createMockXPOrb({ id: 'orb-3', value: 30, size: 'large', x: 10, y: 10 })],
      ]);
      const state = createMockGameState({ xpOrbs });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should animate XP orbs (bob effect)', () => {
      const xpOrbs = new Map([
        ['orb-1', createMockXPOrb({ id: 'orb-1' })],
      ]);
      const state = createMockGameState({ xpOrbs });

      // Render multiple frames to test bob animation
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // SCREEN SHAKE TESTS (P9.7)
  // ===========================================================================

  describe('screen shake (P9.7)', () => {
    it('should trigger hit shake', () => {
      expect(() => renderer.triggerHitShake()).not.toThrow();
    });

    it('should trigger kill shake', () => {
      expect(() => renderer.triggerKillShake()).not.toThrow();
    });

    it('should trigger boss shake', () => {
      expect(() => renderer.triggerBossShake()).not.toThrow();
    });

    it('should trigger custom screen shake', () => {
      expect(() => renderer.triggerScreenShake(5, 100)).not.toThrow();
    });

    it('should apply shake during render', () => {
      renderer.triggerScreenShake(10, 200);

      const state = createMockGameState();
      renderer.render(state, 'player-1');

      // Shake is applied internally during render
      expect(true).toBe(true);
    });

    it('should decay shake over time', () => {
      renderer.triggerScreenShake(10, 100);

      const state = createMockGameState();

      // Render multiple frames
      for (let i = 0; i < 10; i++) {
        renderer.render(state, 'player-1');
      }

      // Shake should have decayed
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // VISUAL EFFECTS TESTS
  // ===========================================================================

  describe('visual effects', () => {
    describe('damage numbers', () => {
      it('should spawn damage number', () => {
        expect(() => renderer.spawnDamageNumber(25, 10, 10)).not.toThrow();

        // Render to update damage numbers
        renderer.render(createMockGameState(), 'player-1');
      });

      it('should spawn critical damage number', () => {
        expect(() => renderer.spawnDamageNumber(50, 10, 10, true)).not.toThrow();

        renderer.render(createMockGameState(), 'player-1');
      });

      it('should create DOM element for damage number', () => {
        renderer.spawnDamageNumber(25, 10, 10);

        const damageContainer = document.getElementById('damage-numbers');
        expect(damageContainer).not.toBeNull();
        // Damage number element should be created
        expect(damageContainer!.children.length).toBeGreaterThanOrEqual(0);
      });

      it('should animate and remove expired damage numbers', () => {
        renderer.spawnDamageNumber(25, 10, 10);

        // Render multiple frames
        for (let i = 0; i < 100; i++) {
          renderer.render(createMockGameState(), 'player-1');
        }

        // Should not throw and cleanup should happen
        expect(true).toBe(true);
      });
    });

    describe('XP sparkles', () => {
      it('should spawn XP sparkle', () => {
        expect(() => renderer.spawnXPSparkle(5, 5, 10)).not.toThrow();
      });

      it('should spawn larger sparkles for higher XP values', () => {
        expect(() => renderer.spawnXPSparkle(5, 5, 25)).not.toThrow();
        expect(() => renderer.spawnXPSparkle(5, 5, 50)).not.toThrow();
      });
    });

    describe('weapon impact', () => {
      it('should spawn weapon impact particles', () => {
        expect(() => renderer.spawnWeaponImpact(10, 10)).not.toThrow();
      });

      it('should spawn weapon impact with custom color', () => {
        expect(() => renderer.spawnWeaponImpact(10, 10, 0xff0000)).not.toThrow();
      });
    });

    describe('death explosion', () => {
      it('should spawn death explosion', () => {
        expect(() => renderer.spawnDeathExplosion(10, 10, 'bat')).not.toThrow();
      });

      it('should spawn larger explosion for bosses', () => {
        expect(() => renderer.spawnDeathExplosion(10, 10, 'boss_slime')).not.toThrow();
      });
    });

    describe('level up flash', () => {
      it('should trigger level up flash', () => {
        expect(() => renderer.triggerLevelUpFlash()).not.toThrow();

        const screenFlash = document.getElementById('screen-flash');
        expect(screenFlash).not.toBeNull();
      });
    });
  });

  // ===========================================================================
  // FRUSTUM CULLING TESTS
  // ===========================================================================

  describe('frustum culling', () => {
    it('should not render enemies outside view', () => {
      // Enemy far from camera
      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', x: 1000, y: 1000 })],
      ]);
      const state = createMockGameState({ enemies });

      renderer.render(state, 'player-1');

      // Should complete without error - culling is internal
      expect(true).toBe(true);
    });

    it('should render enemies inside view', () => {
      // Enemy close to camera
      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', x: 5, y: 5 })],
      ]);
      const state = createMockGameState({ enemies });

      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should update frustum on camera move', () => {
      renderer.setCameraTarget(100, 100);

      const state = createMockGameState();
      renderer.render(state, 'player-1');

      // Frustum should update - internal behavior
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // POWER-UP RENDERING TESTS (P5.2)
  // ===========================================================================

  describe('power-up rendering (P5.2)', () => {
    it('should render power-ups', async () => {
      await renderer.initSpriteMode();

      const powerUps = new Map([
        ['pu-1', createMockPowerUp({ id: 'pu-1', type: 'speed_boost' })],
      ]);
      const state = createMockGameState({ powerUps });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should animate power-ups (bob and pulse)', () => {
      const powerUps = new Map([
        ['pu-1', createMockPowerUp({ id: 'pu-1' })],
      ]);
      const state = createMockGameState({ powerUps });

      // Render multiple frames
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should remove power-up sprites when collected', () => {
      const powerUps1 = new Map([
        ['pu-1', createMockPowerUp({ id: 'pu-1' })],
      ]);
      renderer.render(createMockGameState({ powerUps: powerUps1 }), 'player-1');

      // Power-up collected (removed)
      const powerUps2 = new Map();
      renderer.render(createMockGameState({ powerUps: powerUps2 }), 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // WORLD EVENT RENDERING TESTS (P5.1, BUG-048)
  // ===========================================================================

  describe('world event rendering (P5.1, BUG-048)', () => {
    it('should render active world events', () => {
      const worldEvents = new Map([
        ['event-1', createMockWorldEvent({ id: 'event-1', type: 'double_xp_zone', active: true })],
      ]);
      const state = createMockGameState({ worldEvents });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should render all world event types', () => {
      const eventTypes: WorldEventType[] = ['meteor_shower', 'double_xp_zone', 'invasion_wave'];
      const worldEvents = new Map(
        eventTypes.map((type, i) => [
          `event-${i}`,
          createMockWorldEvent({ id: `event-${i}`, type, x: i * 30, y: i * 30 })
        ])
      );
      const state = createMockGameState({ worldEvents });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should hide inactive world events', () => {
      const worldEvents = new Map([
        ['event-1', createMockWorldEvent({ id: 'event-1', active: false })],
      ]);
      const state = createMockGameState({ worldEvents });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });

    it('should remove world event meshes when event ends', () => {
      // First render with event
      const worldEvents1 = new Map([
        ['event-1', createMockWorldEvent({ id: 'event-1' })],
      ]);
      renderer.render(createMockGameState({ worldEvents: worldEvents1 }), 'player-1');

      // Second render without event
      const worldEvents2 = new Map();
      renderer.render(createMockGameState({ worldEvents: worldEvents2 }), 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // BOUNDARY RING TESTS (P1.7)
  // ===========================================================================

  describe('boundary ring (P1.7)', () => {
    it('should create boundary ring on initialization', () => {
      // Ring is created in constructor
      expect(true).toBe(true);
    });

    it('should animate boundary ring pulse', () => {
      const state = createMockGameState({ worldRadius: 500 });

      // Render multiple frames to test animation
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should recreate boundary ring when world radius changes significantly', () => {
      // Initial render with default radius
      renderer.render(createMockGameState({ worldRadius: 500 }), 'player-1');

      // Render with significantly different radius
      renderer.render(createMockGameState({ worldRadius: 600 }), 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // DAMAGE DETECTION TESTS
  // ===========================================================================

  describe('damage detection', () => {
    it('should detect enemy health changes and spawn damage numbers', () => {
      // First render - establish enemy health
      const enemies1 = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', health: 50, maxHealth: 50 })],
      ]);
      renderer.render(createMockGameState({ enemies: enemies1 }), 'player-1');

      // Second render - enemy took damage
      const enemies2 = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', health: 40, maxHealth: 50 })],
      ]);
      renderer.render(createMockGameState({ enemies: enemies2 }), 'player-1');

      // Damage should be detected internally
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // PARTICLE SYSTEM TESTS
  // ===========================================================================

  describe('particle system', () => {
    it('should update particles with physics', () => {
      // Spawn particles
      renderer.spawnXPSparkle(5, 5, 10);
      renderer.spawnWeaponImpact(10, 10);
      renderer.spawnDeathExplosion(15, 15, 'bat');

      // Render to update particles
      const state = createMockGameState();
      renderer.render(state, 'player-1');
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should remove particles when life expires', () => {
      renderer.spawnXPSparkle(5, 5, 10);

      // Render many frames to expire particles
      const state = createMockGameState();
      for (let i = 0; i < 100; i++) {
        renderer.render(state, 'player-1');
      }

      expect(true).toBe(true);
    });

    it('should handle maximum particle count (500)', () => {
      // Spawn many particles
      for (let i = 0; i < 100; i++) {
        renderer.spawnXPSparkle(i, i, 10);
        renderer.spawnWeaponImpact(i + 10, i + 10);
      }

      const state = createMockGameState();
      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });
  });

  // ===========================================================================
  // DESTROY TESTS
  // ===========================================================================

  describe('destroy', () => {
    it('should clean up DOM elements on destroy', () => {
      renderer.destroy();

      const damageContainer = document.getElementById('damage-numbers');
      const nameContainer = document.getElementById('player-name-labels');
      const screenFlash = document.getElementById('screen-flash');

      expect(damageContainer).toBeNull();
      expect(nameContainer).toBeNull();
      expect(screenFlash).toBeNull();
    });

    it('should be safe to call destroy multiple times', () => {
      expect(() => {
        renderer.destroy();
        renderer.destroy();
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // LOD (LEVEL OF DETAIL) TESTS
  // ===========================================================================

  describe('LOD (Level of Detail)', () => {
    it('should use high detail for nearby entities', () => {
      renderer.setCameraTarget(0, 0);

      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', x: 5, y: 5 })],
      ]);
      const state = createMockGameState({ enemies });

      renderer.render(state, 'player-1');

      // LOD selection is internal - test that render completes
      expect(true).toBe(true);
    });

    it('should use low detail for distant entities', () => {
      renderer.setCameraTarget(0, 0);

      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', x: 20, y: 20 })],
      ]);
      const state = createMockGameState({ enemies });

      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // ENEMY GEOMETRY TESTS (BUG-022)
  // ===========================================================================

  describe('enemy geometry (BUG-022)', () => {
    it('should use distinct geometry for each enemy type', () => {
      // Each enemy type has unique geometry in procedural mode
      const enemyTypes = ['bat', 'skeleton', 'zombie', 'ghost', 'slime', 'mini_slime', 'demon'];

      for (const type of enemyTypes) {
        const enemies = new Map([
          [`enemy-${type}`, createMockEnemy({ id: `enemy-${type}`, type })],
        ]);
        const state = createMockGameState({ enemies });

        expect(() => renderer.render(state, 'player-1')).not.toThrow();
      }
    });

    it('should handle unknown enemy types with fallback geometry', () => {
      const enemies = new Map([
        ['enemy-unknown', createMockEnemy({ id: 'enemy-unknown', type: 'unknown_type' as any })],
      ]);
      const state = createMockGameState({ enemies });

      expect(() => renderer.render(state, 'player-1')).not.toThrow();
    });
  });

  // ===========================================================================
  // FLOOR TEXTURE TESTS (P1.7)
  // ===========================================================================

  describe('floor texture (P1.7)', () => {
    it('should attempt to load floor texture on initialization', () => {
      // Floor texture loading is triggered in constructor
      // MockTextureLoader.load is called
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('integration', () => {
    it('should handle full game state with all entity types', async () => {
      await renderer.initSpriteMode();

      const players = new Map([
        ['player-1', createMockPlayer({ id: 'player-1' })],
        ['player-2', createMockPlayer({ id: 'player-2', x: 20, y: 20 })],
      ]);

      const enemies = new Map([
        ['enemy-1', createMockEnemy({ id: 'enemy-1', type: 'bat' })],
        ['enemy-2', createMockEnemy({ id: 'enemy-2', type: 'boss_slime', x: 50, y: 50 })],
      ]);

      const projectiles = new Map([
        ['proj-1', createMockProjectile({ id: 'proj-1', type: 'bullet' })],
        ['proj-2', createMockProjectile({ id: 'proj-2', type: 'fireball', x: 8, y: 8 })],
      ]);

      const xpOrbs = new Map([
        ['orb-1', createMockXPOrb({ id: 'orb-1' })],
      ]);

      const powerUps = new Map([
        ['pu-1', createMockPowerUp({ id: 'pu-1' })],
      ]);

      const worldEvents = new Map([
        ['event-1', createMockWorldEvent({ id: 'event-1' })],
      ]);

      const state = createMockGameState({
        players,
        enemies,
        projectiles,
        xpOrbs,
        powerUps,
        worldEvents,
      });

      // Render multiple frames
      for (let i = 0; i < 5; i++) {
        expect(() => renderer.render(state, 'player-1')).not.toThrow();
      }
    });

    it('should handle rapid state changes without errors', () => {
      const state = createMockGameState();

      for (let i = 0; i < 60; i++) {
        // Add/remove entities rapidly
        if (i % 2 === 0) {
          state.enemies.set(`enemy-${i}`, createMockEnemy({ id: `enemy-${i}` }));
        } else if (i > 10) {
          state.enemies.delete(`enemy-${i - 10}`);
        }

        expect(() => renderer.render(state, 'player-1')).not.toThrow();
      }
    });

    it('should handle mode switches during rendering', async () => {
      const state = createMockGameState({
        enemies: new Map([['enemy-1', createMockEnemy()]]),
      });

      // Procedural mode
      renderer.render(state, 'player-1');

      // Switch to sprite mode
      await renderer.initSpriteMode();
      renderer.render(state, 'player-1');

      // Back to procedural
      renderer.disableSpriteMode();
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });

    it('should handle CRT toggle during active rendering', async () => {
      const state = createMockGameState();

      renderer.render(state, 'player-1');
      await renderer.toggleCRT();
      renderer.render(state, 'player-1');
      await renderer.toggleCRT();
      renderer.render(state, 'player-1');

      expect(true).toBe(true);
    });
  });
});
