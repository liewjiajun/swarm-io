# 07 - Client Three.js Renderer

## Overview
Implement the 2.5D game renderer using Three.js. Use OrthographicCamera for top-down view with 3D depth, InstancedMesh for efficient entity rendering, and sprite-based visuals with pixel art aesthetic.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Game                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Renderer   │ │ InputManager│ │NetworkClient│           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│         │                                                    │
│  ┌──────┴──────────────────────────────────────────────┐   │
│  │                     Renderer                         │   │
│  │  ┌───────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │   Scene   │ │   Camera   │ │ EntityPools│        │   │
│  │  └───────────┘ └────────────┘ └────────────┘        │   │
│  │  ┌───────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │PlayerSprite│ │EnemyInstances│ │XPOrbInstances│    │   │
│  │  └───────────┘ └────────────┘ └────────────┘        │   │
│  │  ┌───────────┐ ┌────────────┐                        │   │
│  │  │Projectiles│ │  Particles │                        │   │
│  │  └───────────┘ └────────────┘                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## File: src/client/src/game/Game.ts

```typescript
import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { NetworkClient } from '../network/NetworkClient';
import { Interpolator } from './Interpolator';
import type { PlayerState, EnemyState, ProjectileState, XPOrbState } from '@swarm-io/shared';

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private network: NetworkClient;
  private interpolator: Interpolator;
  
  private localPlayerId: string = '';
  private lastUpdateTime: number = 0;
  private running: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkClient();
    this.interpolator = new Interpolator();
    
    this.setupNetworkHandlers();
  }

  async start() {
    // Connect to server
    await this.network.connect();
    this.localPlayerId = this.network.sessionId;
    
    this.running = true;
    this.lastUpdateTime = performance.now();
    this.gameLoop();
  }

  private setupNetworkHandlers() {
    this.network.onStateChange((state) => {
      this.interpolator.pushState(state, performance.now());
    });
    
    this.network.onPlayerDied((data) => {
      if (data.playerId === this.localPlayerId) {
        this.renderer.showDeathScreen(data.finalScore);
      }
    });
    
    this.network.onLevelUp((data) => {
      this.renderer.showUpgradeUI(data.choices, (choiceId) => {
        this.network.sendUpgradeChoice(choiceId);
      });
    });
  }

  private gameLoop() {
    if (!this.running) return;
    
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    this.update(dt);
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }

  private update(dt: number) {
    // Process input
    const input = this.input.getInput();
    
    // Send input to server
    if (input.dx !== 0 || input.dy !== 0) {
      this.network.sendInput(input);
    }
    
    // Apply client-side prediction for local player
    const localPlayer = this.interpolator.getLocalPlayer(this.localPlayerId);
    if (localPlayer) {
      this.input.applyPrediction(localPlayer, input, dt);
    }
  }

  private render() {
    const renderTime = performance.now() - 100; // 100ms interpolation delay
    const state = this.interpolator.getInterpolatedState(renderTime);
    
    // Update camera to follow local player
    const localPlayer = state.players.get(this.localPlayerId);
    if (localPlayer) {
      this.renderer.setCameraTarget(localPlayer.x, localPlayer.y);
    }
    
    // Render all entities
    this.renderer.render(state, this.localPlayerId);
  }

  stop() {
    this.running = false;
    this.network.disconnect();
  }
}
```

## File: src/client/src/game/Renderer.ts

```typescript
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
      if (player.dead) {
        const sprite = this.playerSprites.get(id);
        if (sprite) sprite.visible = false;
        return;
      }
      
      let sprite = this.playerSprites.get(id);
      if (!sprite) {
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
```

## File: src/client/src/game/InputManager.ts

```typescript
import type { PlayerInput, PlayerState } from '@swarm-io/shared';

export class InputManager {
  private keys = new Set<string>();
  private sequence = 0;
  private pendingInputs: { input: PlayerInput; time: number }[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    // Prevent default for game keys
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
  }

  getInput(): PlayerInput {
    let dx = 0;
    let dy = 0;
    
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    
    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }
    
    const input: PlayerInput = {
      dx,
      dy,
      sequence: this.sequence++,
    };
    
    // Store for reconciliation
    this.pendingInputs.push({ input, time: performance.now() });
    
    // Limit buffer size
    if (this.pendingInputs.length > 60) {
      this.pendingInputs.shift();
    }
    
    return input;
  }

  applyPrediction(player: PlayerState, input: PlayerInput, dt: number) {
    // Apply input immediately to local player for responsiveness
    player.x += input.dx * player.speed * dt;
    player.y += input.dy * player.speed * dt;
  }

  reconcile(serverPlayer: PlayerState, lastProcessedSequence: number) {
    // Remove acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(
      pending => pending.input.sequence > lastProcessedSequence
    );
    
    // Server position is authoritative
    let x = serverPlayer.x;
    let y = serverPlayer.y;
    
    // Re-apply unacknowledged inputs
    for (const pending of this.pendingInputs) {
      const dt = 1 / 60; // Assume 60fps
      x += pending.input.dx * serverPlayer.speed * dt;
      y += pending.input.dy * serverPlayer.speed * dt;
    }
    
    // Update local prediction
    serverPlayer.x = x;
    serverPlayer.y = y;
  }
}
```

## File: src/client/src/game/Interpolator.ts

```typescript
import { lerp } from '@swarm-io/shared';

interface StateSnapshot {
  timestamp: number;
  state: any;
}

export class Interpolator {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots = 10;

  pushState(state: any, timestamp: number) {
    this.snapshots.push({ timestamp, state: this.cloneState(state) });
    
    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getInterpolatedState(renderTime: number): any {
    // Find the two snapshots to interpolate between
    let before: StateSnapshot | null = null;
    let after: StateSnapshot | null = null;
    
    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].timestamp <= renderTime && 
          this.snapshots[i + 1].timestamp >= renderTime) {
        before = this.snapshots[i];
        after = this.snapshots[i + 1];
        break;
      }
    }
    
    // If no valid range, return latest state
    if (!before || !after) {
      return this.snapshots[this.snapshots.length - 1]?.state || this.emptyState();
    }
    
    // Calculate interpolation factor
    const range = after.timestamp - before.timestamp;
    const t = range > 0 ? (renderTime - before.timestamp) / range : 0;
    
    return this.interpolateStates(before.state, after.state, t);
  }

  getLocalPlayer(playerId: string): any | null {
    const latest = this.snapshots[this.snapshots.length - 1];
    return latest?.state.players.get(playerId) || null;
  }

  private interpolateStates(from: any, to: any, t: number): any {
    const result = {
      players: new Map(),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: to.world,
    };
    
    // Interpolate players
    to.players.forEach((toPlayer: any, id: string) => {
      const fromPlayer = from.players.get(id);
      if (fromPlayer) {
        result.players.set(id, {
          ...toPlayer,
          x: lerp(fromPlayer.x, toPlayer.x, t),
          y: lerp(fromPlayer.y, toPlayer.y, t),
        });
      } else {
        result.players.set(id, toPlayer);
      }
    });
    
    // Interpolate enemies
    to.enemies.forEach((toEnemy: any, id: string) => {
      const fromEnemy = from.enemies.get(id);
      if (fromEnemy) {
        result.enemies.set(id, {
          ...toEnemy,
          x: lerp(fromEnemy.x, toEnemy.x, t),
          y: lerp(fromEnemy.y, toEnemy.y, t),
        });
      } else {
        result.enemies.set(id, toEnemy);
      }
    });
    
    // Interpolate projectiles
    to.projectiles.forEach((toProj: any, id: string) => {
      const fromProj = from.projectiles.get(id);
      if (fromProj) {
        result.projectiles.set(id, {
          ...toProj,
          x: lerp(fromProj.x, toProj.x, t),
          y: lerp(fromProj.y, toProj.y, t),
        });
      } else {
        result.projectiles.set(id, toProj);
      }
    });
    
    // Interpolate XP orbs
    to.xpOrbs.forEach((toOrb: any, id: string) => {
      const fromOrb = from.xpOrbs.get(id);
      if (fromOrb) {
        result.xpOrbs.set(id, {
          ...toOrb,
          x: lerp(fromOrb.x, toOrb.x, t),
          y: lerp(fromOrb.y, toOrb.y, t),
        });
      } else {
        result.xpOrbs.set(id, toOrb);
      }
    });
    
    return result;
  }

  private cloneState(state: any): any {
    // Deep clone state for snapshot storage
    return {
      players: new Map(Array.from(state.players).map(([k, v]: [string, any]) => [k, { ...v }])),
      enemies: new Map(Array.from(state.enemies).map(([k, v]: [string, any]) => [k, { ...v }])),
      projectiles: new Map(Array.from(state.projectiles).map(([k, v]: [string, any]) => [k, { ...v }])),
      xpOrbs: new Map(Array.from(state.xpOrbs).map(([k, v]: [string, any]) => [k, { ...v }])),
      world: { ...state.world },
    };
  }

  private emptyState(): any {
    return {
      players: new Map(),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: { worldRadius: 500, playerCount: 0, gameTime: 0 },
    };
  }
}
```

## Acceptance Criteria

1. Three.js scene renders with OrthographicCamera
2. Ground plane and grid are visible
3. Local player sprite follows camera
4. Other players rendered as different color sprites
5. Enemies rendered using InstancedMesh (efficient for hundreds)
6. Projectiles rendered using InstancedMesh
7. XP orbs bob up and down with animation
8. Camera smoothly follows local player
9. Entity positions interpolated between server updates
10. WASD/Arrow keys control movement
11. Client-side prediction makes movement feel responsive
