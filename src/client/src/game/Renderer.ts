import * as THREE from 'three';
import type { PlayerState, EnemyState, ProjectileState, XPOrbState } from '@swarm-io/shared';

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

  constructor(canvas: HTMLCanvasElement) {
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

  private createGround() {
    const geometry = new THREE.PlaneGeometry(2000, 2000);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2d2d44,
      roughness: 0.8,
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.scene.add(this.ground);

    // Grid helper for visual reference
    const grid = new THREE.GridHelper(2000, 100, 0x3d3d5c, 0x3d3d5c);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  private createEntityPools() {
    // BUG-022 FIX: More distinct enemy colors for visual differentiation
    // Enemy pools - each type has a unique, distinguishable color
    this.createEnemyPool('bat', 0x8b4513, 500);         // Brown - small flying pest
    this.createEnemyPool('skeleton', 0xffffff, 200);    // White - bone color
    this.createEnemyPool('zombie', 0x228b22, 200);      // Forest green - undead rot
    this.createEnemyPool('ghost', 0x87ceeb, 100);       // Sky blue - ethereal
    this.createEnemyPool('slime', 0x32cd32, 100);       // Lime green - acidic
    this.createEnemyPool('demon', 0xff4500, 50);        // Orange-red - hellfire
    // Boss enemies - larger and more intimidating colors
    this.createEnemyPool('boss_slime', 0x00ff00, 10);   // Bright green - giant slime
    this.createEnemyPool('boss_skeleton', 0xffd700, 10); // Gold - skeleton king
    this.createEnemyPool('boss_demon', 0x8b0000, 10);   // Dark red - demon lord

    // Projectile pool - High detail (8x8 segments = 128 triangles per sphere)
    const projGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Larger for visibility
    const projMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.projectileMesh = new THREE.InstancedMesh(projGeometry, projMaterial, 1000);
    this.projectileMesh.count = 0;
    this.projectileMesh.frustumCulled = false;
    this.scene.add(this.projectileMesh);

    // Projectile pool - LOD (4x4 segments = 32 triangles per sphere, 75% reduction)
    const projGeometryLOD = new THREE.SphereGeometry(0.5, 4, 4);
    this.projectileMeshLOD = new THREE.InstancedMesh(projGeometryLOD, projMaterial, 1000);
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

  private createEnemyPool(type: string, color: number, maxCount: number) {
    // Use larger geometry and BasicMaterial for better visibility
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
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

    // Update particle effects
    this.updateParticles(dt);

    // Update damage number animations
    this.updateDamageNumbers();

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayers(players: Map<string, PlayerState>, localPlayerId: string) {
    // Remove sprites for disconnected players
    const currentIds = new Set(players.keys());
    this.playerSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        this.scene.remove(sprite);
        this.playerSprites.delete(id);
      }
    });

    // Debug: Log player count on first render
    if (this.playerSprites.size === 0 && players.size > 0) {
      console.log('[Renderer] Creating sprites for', players.size, 'players');
    }

    // Update/create player sprites
    players.forEach((player, id) => {
      // For Phase 3, we assume all players are alive
      // Dead player handling will be added in Phase 4 with proper state management

      let sprite = this.playerSprites.get(id);
      if (!sprite) {
        console.log('[Renderer] Creating player sprite at', player.x.toFixed(1), player.y.toFixed(1));
        sprite = this.createPlayerSprite(id === localPlayerId);
        this.playerSprites.set(id, sprite);
        this.scene.add(sprite);
      }

      sprite.visible = true;
      sprite.position.set(player.x, 0.5, player.y);

      // Visual feedback for invulnerability
      if (player.invulnerableTime > 0) {
        sprite.material.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
      } else {
        sprite.material.opacity = 1;
      }
    });
  }

  private createPlayerSprite(isLocal: boolean): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      color: isLocal ? 0x00ff00 : 0x0088ff,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 2, 1); // Larger sprite for better visibility
    return sprite;
  }

  private updateEnemies(enemies: Map<string, EnemyState>) {
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

      typeEnemies.forEach((enemy, index) => {
        // Reset dummy transform
        this.dummy.position.set(enemy.x, 1.0, enemy.y);
        this.dummy.rotation.set(0, 0, 0);
        // BUG-022 FIX: Scale bosses larger for visual distinction
        const isBoss = type.startsWith('boss_');
        const scale = isBoss ? 3.0 : 1.5;
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

  private getProjectileVisualSize(type: string): number {
    return Renderer.PROJECTILE_VISUAL_SIZES[type] || 0.5; // Default 0.5 for unknown types
  }

  private updateProjectiles(projectiles: Map<string, ProjectileState>) {
    // Filter and sort projectiles with frustum culling and LOD
    let indexHi = 0;  // High detail (close to camera)
    let indexLo = 0;  // Low detail (far from camera)

    projectiles.forEach(projectile => {
      // Skip projectiles outside view
      if (!this.isInView(projectile.x, projectile.y, projectile.radius)) return;

      this.dummy.position.set(projectile.x, 1.0, projectile.y);
      this.dummy.rotation.set(0, 0, 0);
      // BUG-017 FIX: Use type-based visual size instead of collision radius
      const visualSize = this.getProjectileVisualSize(projectile.type);
      this.dummy.scale.setScalar(visualSize);
      this.dummy.updateMatrix();

      // Use LOD based on distance from camera center
      if (this.shouldUseLOD(projectile.x, projectile.y)) {
        this.projectileMeshLOD.setMatrixAt(indexLo, this.dummy.matrix);
        indexLo++;
      } else {
        this.projectileMesh.setMatrixAt(indexHi, this.dummy.matrix);
        indexHi++;
      }
    });

    this.projectileMesh.count = indexHi;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
    this.projectileMeshLOD.count = indexLo;
    this.projectileMeshLOD.instanceMatrix.needsUpdate = true;
  }

  private updateXPOrbs(orbs: Map<string, XPOrbState>) {
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

  private onResize(canvas: HTMLCanvasElement) {
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.camera.left = this.frustumSize * aspect / -2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
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
    // Color based on enemy type
    const colors: Record<string, number> = {
      bat: 0xff6b6b,
      skeleton: 0xcccccc,
      zombie: 0x4ecdc4,
      ghost: 0xaaaaff,
      slime: 0x95e1d3,
      demon: 0xff4444,
      boss_slime: 0x00ff88,
      boss_skeleton: 0xffffff,
      boss_demon: 0xff0000,
    };

    const color = colors[enemyType] || 0xff0000;
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
   * Clean up DOM elements on destroy
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
    this.damageNumbers = [];
    this.lastEnemyHealth.clear();
    this.particles = [];
    this.lastXpOrbPositions.clear();
  }
}