import * as THREE from 'three';
import type { GameState, PlayerState, EnemyState, ProjectileState, XPOrbState } from '@swarm-io/shared';

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

    // Handle resize
    window.addEventListener('resize', () => this.onResize(canvas));
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
    // Enemy pool (start with bat type, will create others as needed)
    this.createEnemyPool('bat', 0xff6b6b, 500);
    this.createEnemyPool('skeleton', 0xcccccc, 200);
    this.createEnemyPool('zombie', 0x4ecdc4, 200);
    this.createEnemyPool('ghost', 0xaaaaff, 100);
    this.createEnemyPool('slime', 0x95e1d3, 100);
    this.createEnemyPool('demon', 0xff0000, 50);

    // Projectile pool
    const projGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const projMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.projectileMesh = new THREE.InstancedMesh(projGeometry, projMaterial, 1000);
    this.projectileMesh.count = 0;
    this.scene.add(this.projectileMesh);

    // XP orb pool
    const xpGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const xpMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.xpOrbMesh = new THREE.InstancedMesh(xpGeometry, xpMaterial, 2000);
    this.xpOrbMesh.count = 0;
    this.scene.add(this.xpOrbMesh);
  }

  private createEnemyPool(type: string, color: number, maxCount: number) {
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
    mesh.count = 0;
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

  render(state: any, localPlayerId: string) {
    // Smooth camera follow
    const lerpFactor = 0.1;
    this.camera.position.x += (this.cameraTarget.x - this.camera.position.x) * lerpFactor;
    this.camera.position.z += (this.cameraTarget.y + 20 - this.camera.position.z) * lerpFactor;
    this.camera.lookAt(
      this.camera.position.x,
      0,
      this.camera.position.z - 20
    );

    // Update players
    this.updatePlayers(state.players, localPlayerId);

    // Update enemies
    this.updateEnemies(state.enemies);

    // Update projectiles
    this.updateProjectiles(state.projectiles);

    // Update XP orbs
    this.updateXPOrbs(state.xpOrbs);

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

    // Update/create player sprites
    players.forEach((player, id) => {
      // For Phase 3, we assume all players are alive
      // Dead player handling will be added in Phase 4 with proper state management

      let sprite = this.playerSprites.get(id);
      if (!sprite) {
        sprite = this.createPlayerSprite(id === localPlayerId);
        this.playerSprites.set(id, sprite);
        this.scene.add(sprite);
      }

      sprite.visible = true;
      sprite.position.set(player.x, 0.5, player.y);

      // Visual feedback for invulnerability
      if (player.invulnerable) {
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
    sprite.scale.set(1, 1, 1);
    return sprite;
  }

  private updateEnemies(enemies: Map<string, EnemyState>) {
    // Reset all counts
    this.enemyMeshes.forEach(mesh => mesh.count = 0);

    // Group enemies by type
    const enemiesByType = new Map<string, EnemyState[]>();
    enemies.forEach(enemy => {
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
        this.dummy.position.set(enemy.x, 0.4, enemy.y);
        this.dummy.scale.setScalar(enemy.health / enemy.maxHealth * 0.5 + 0.5);
        this.dummy.updateMatrix();
        mesh!.setMatrixAt(index, this.dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private updateProjectiles(projectiles: Map<string, ProjectileState>) {
    this.projectileMesh.count = projectiles.size;

    let index = 0;
    projectiles.forEach(projectile => {
      this.dummy.position.set(projectile.x, 0.5, projectile.y);
      this.dummy.scale.setScalar(projectile.radius * 2);
      this.dummy.updateMatrix();
      this.projectileMesh.setMatrixAt(index, this.dummy.matrix);
      index++;
    });

    this.projectileMesh.instanceMatrix.needsUpdate = true;
  }

  private updateXPOrbs(orbs: Map<string, XPOrbState>) {
    this.xpOrbMesh.count = orbs.size;

    let index = 0;
    orbs.forEach(orb => {
      const scale = orb.size === 'large' ? 0.5 : orb.size === 'medium' ? 0.3 : 0.15;

      // Bob up and down
      const bobOffset = Math.sin(Date.now() * 0.005 + orb.x) * 0.1;

      this.dummy.position.set(orb.x, 0.3 + bobOffset, orb.y);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.xpOrbMesh.setMatrixAt(index, this.dummy.matrix);
      index++;
    });

    this.xpOrbMesh.instanceMatrix.needsUpdate = true;
  }

  private onResize(canvas: HTMLCanvasElement) {
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.camera.left = this.frustumSize * aspect / -2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  }

  showDeathScreen(finalScore: number) {
    // Implementation: Show overlay with score and respawn button
    console.log('Death screen:', finalScore);
  }

  showUpgradeUI(choices: any[], onSelect: (id: string) => void) {
    // Implementation: Show upgrade selection UI
    console.log('Upgrade choices:', choices);
  }
}