# 03 - Server Game Loop

## Overview
Implement the authoritative server game loop using Colyseus. The server runs at a fixed 60Hz tick rate and owns all game state including physics, combat, and progression.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GameRoom                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   GameState                           │  │
│  │  - players: MapSchema<PlayerSchema>                   │  │
│  │  - enemies: MapSchema<EnemySchema>                    │  │
│  │  - projectiles: MapSchema<ProjectileSchema>           │  │
│  │  - xpOrbs: MapSchema<XPOrbSchema>                     │  │
│  │  - world: WorldSchema                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ InputSystem │ │ PhysicsSystem│ │ CombatSystem│          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ SpawnSystem │ │ WeaponSystem│ │ XPSystem    │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐                                          │
│  │SpatialHash  │                                          │
│  └─────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

## File: src/server/src/rooms/GameRoom.ts

```typescript
import { Room, Client } from '@colyseus/core';
import { GameState } from '../state/GameState';
import { InputSystem } from '../systems/InputSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { XPSystem } from '../systems/XPSystem';
import { SpatialHash } from '../systems/SpatialHash';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import type { PlayerInput } from '@swarm-io/shared';

export class GameRoom extends Room<GameState> {
  maxClients = 150;
  
  // Systems
  private inputSystem!: InputSystem;
  private physicsSystem!: PhysicsSystem;
  private combatSystem!: CombatSystem;
  private spawnSystem!: SpawnSystem;
  private weaponSystem!: WeaponSystem;
  private xpSystem!: XPSystem;
  private spatialHash!: SpatialHash;
  
  // Input buffer per player
  private inputBuffers = new Map<string, PlayerInput[]>();
  
  // Track processed sequences for client prediction
  private lastProcessedSequence = new Map<string, number>();

  onCreate(options: any) {
    this.setState(new GameState());
    
    // Initialize spatial hash
    this.spatialHash = new SpatialHash(50);
    
    // Initialize systems
    this.inputSystem = new InputSystem();
    this.physicsSystem = new PhysicsSystem(this.spatialHash);
    this.combatSystem = new CombatSystem(this.spatialHash);
    this.spawnSystem = new SpawnSystem(this.state, this.spatialHash);
    this.weaponSystem = new WeaponSystem(this.state, this.spatialHash);
    this.xpSystem = new XPSystem(this.state, this.spatialHash);
    
    // Set up fixed timestep simulation
    const tickRate = GAME_CONSTANTS.SERVER_TICK_RATE;
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / tickRate);
    
    // Handle messages
    this.onMessage('input', (client, message: { input: PlayerInput }) => {
      this.handleInput(client.sessionId, message.input);
    });
    
    this.onMessage('choose_upgrade', (client, message: { choiceId: string }) => {
      this.handleUpgradeChoice(client.sessionId, message.choiceId);
    });
    
    this.onMessage('respawn', (client) => {
      this.handleRespawn(client.sessionId);
    });
    
    console.log('GameRoom created');
  }

  onJoin(client: Client, options: any) {
    console.log(`Player ${client.sessionId} joined`);
    
    // Create player at random spawn position
    const spawnPos = this.spawnSystem.getPlayerSpawnPosition();
    this.state.addPlayer(client.sessionId, spawnPos.x, spawnPos.y);
    
    // Initialize input buffer
    this.inputBuffers.set(client.sessionId, []);
    this.lastProcessedSequence.set(client.sessionId, 0);
    
    // Recalculate world size
    this.state.world.recalculateSize(this.state.players.size);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left`);
    
    this.state.removePlayer(client.sessionId);
    this.inputBuffers.delete(client.sessionId);
    this.lastProcessedSequence.delete(client.sessionId);
    
    // Recalculate world size
    this.state.world.recalculateSize(this.state.players.size);
  }

  private handleInput(playerId: string, input: PlayerInput) {
    const buffer = this.inputBuffers.get(playerId);
    if (buffer) {
      // Add to buffer, will be processed on next tick
      buffer.push(input);
      
      // Prevent buffer overflow
      if (buffer.length > 10) {
        buffer.shift();
      }
    }
  }

  private handleUpgradeChoice(playerId: string, choiceId: string) {
    const player = this.state.players.get(playerId);
    if (player && player.pendingUpgrade) {
      this.xpSystem.applyUpgrade(player, choiceId);
    }
  }

  private handleRespawn(playerId: string) {
    const player = this.state.players.get(playerId);
    if (player && player.dead) {
      const spawnPos = this.spawnSystem.getPlayerSpawnPosition();
      player.respawn(spawnPos.x, spawnPos.y);
    }
  }

  private update(deltaTime: number) {
    const dt = deltaTime / 1000; // Convert to seconds
    
    // Update game time
    this.state.world.gameTime += dt;
    
    // Rebuild spatial hash
    this.spatialHash.clear();
    this.state.players.forEach((player, id) => {
      if (!player.dead) {
        this.spatialHash.insert({ id, x: player.x, y: player.y, type: 'player', entity: player });
      }
    });
    this.state.enemies.forEach((enemy, id) => {
      this.spatialHash.insert({ id, x: enemy.x, y: enemy.y, type: 'enemy', entity: enemy });
    });
    this.state.xpOrbs.forEach((orb, id) => {
      this.spatialHash.insert({ id, x: orb.x, y: orb.y, type: 'xp', entity: orb });
    });
    
    // 1. Process inputs
    this.inputBuffers.forEach((buffer, playerId) => {
      const player = this.state.players.get(playerId);
      if (player && buffer.length > 0) {
        const input = buffer.shift()!;
        this.inputSystem.processInput(player, input, dt);
        this.lastProcessedSequence.set(playerId, input.sequence);
      }
    });
    
    // 2. Update physics (player movement, enemy AI, projectiles)
    this.physicsSystem.update(this.state, dt);
    
    // 3. Update weapons (auto-fire)
    this.weaponSystem.update(this.state, dt);
    
    // 4. Update combat (damage, collisions)
    this.combatSystem.update(this.state, dt);
    
    // 5. Update XP system (collection, leveling)
    this.xpSystem.update(this.state, dt);
    
    // 6. Update spawning
    this.spawnSystem.update(dt);
    
    // 7. Update player timers
    this.state.players.forEach((player) => {
      if (!player.dead) {
        player.timeAlive += dt;
        player.invulnerableTime = Math.max(0, player.invulnerableTime - dt);
        player.hostility = Math.max(0, player.hostility - GAME_CONSTANTS.HOSTILITY_DECAY_RATE * dt);
      }
    });
    
    // 8. Cleanup dead entities
    this.cleanup();
  }

  private cleanup() {
    // Remove dead enemies
    this.state.enemies.forEach((enemy, id) => {
      if (enemy.health <= 0) {
        // Spawn XP orbs
        this.xpSystem.spawnXPOrb(enemy.x, enemy.y, enemy.xpValue);
        this.state.enemies.delete(id);
      }
    });
    
    // Remove expired projectiles
    this.state.projectiles.forEach((proj, id) => {
      if (proj.lifetime <= 0) {
        this.state.projectiles.delete(id);
      }
    });
    
    // Remove collected XP orbs
    this.state.xpOrbs.forEach((orb, id) => {
      if (orb.collected) {
        this.state.xpOrbs.delete(id);
      }
    });
  }
}
```

## File: src/server/src/systems/SpatialHash.ts

```typescript
export interface SpatialEntity {
  id: string;
  x: number;
  y: number;
  type: 'player' | 'enemy' | 'projectile' | 'xp';
  entity: any;
}

export class SpatialHash {
  private cellSize: number;
  private cells = new Map<string, Set<SpatialEntity>>();

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(entity: SpatialEntity) {
    const key = this.getKey(entity.x, entity.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(entity);
  }

  queryRadius(x: number, y: number, radius: number, type?: string): SpatialEntity[] {
    const results: SpatialEntity[] = [];
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);
    
    const radiusSq = radius * radius;
    
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) {
          for (const entity of cell) {
            if (type && entity.type !== type) continue;
            const dx = entity.x - x;
            const dy = entity.y - y;
            if (dx * dx + dy * dy <= radiusSq) {
              results.push(entity);
            }
          }
        }
      }
    }
    
    return results;
  }

  queryNearestOfType(x: number, y: number, type: string, maxRadius: number): SpatialEntity | null {
    const entities = this.queryRadius(x, y, maxRadius, type);
    if (entities.length === 0) return null;
    
    let nearest: SpatialEntity | null = null;
    let nearestDistSq = Infinity;
    
    for (const entity of entities) {
      const dx = entity.x - x;
      const dy = entity.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entity;
      }
    }
    
    return nearest;
  }
}
```

## File: src/server/src/systems/InputSystem.ts

```typescript
import type { PlayerInput } from '@swarm-io/shared';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import type { PlayerSchema } from '../state/PlayerSchema';

export class InputSystem {
  processInput(player: PlayerSchema, input: PlayerInput, dt: number) {
    if (player.dead || player.pendingUpgrade) return;
    
    // Normalize input
    const dx = Math.max(-1, Math.min(1, input.dx));
    const dy = Math.max(-1, Math.min(1, input.dy));
    
    // Calculate movement
    const speed = player.speed;
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    
    // Update facing direction if moving
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      player.facingX = dx / len;
      player.facingY = dy / len;
    }
  }
}
```

## File: src/server/src/systems/PhysicsSystem.ts

```typescript
import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS } from '@swarm-io/shared';
import { direction, distance } from '@swarm-io/shared';

export class PhysicsSystem {
  constructor(private spatialHash: SpatialHash) {}

  update(state: GameState, dt: number) {
    // Update enemy movement (AI)
    state.enemies.forEach((enemy) => {
      this.updateEnemyAI(state, enemy, dt);
    });
    
    // Update projectile movement
    state.projectiles.forEach((projectile) => {
      projectile.x += projectile.velocityX * dt;
      projectile.y += projectile.velocityY * dt;
      projectile.lifetime -= dt;
    });
    
    // Update XP orb magnetization
    state.xpOrbs.forEach((orb) => {
      if (orb.magnetized && orb.targetPlayerId) {
        const player = state.players.get(orb.targetPlayerId);
        if (player && !player.dead) {
          const dir = direction({ x: orb.x, y: orb.y }, { x: player.x, y: player.y });
          orb.x += dir.x * GAME_CONSTANTS.XP_ORB_SPEED * dt;
          orb.y += dir.y * GAME_CONSTANTS.XP_ORB_SPEED * dt;
        } else {
          orb.magnetized = false;
          orb.targetPlayerId = '';
        }
      }
    });
    
    // World boundary enforcement
    const worldRadius = state.world.worldRadius;
    state.players.forEach((player) => {
      if (player.dead) return;
      
      const dist = Math.sqrt(player.x * player.x + player.y * player.y);
      if (dist > worldRadius) {
        // Push back inside
        const ratio = worldRadius / dist;
        player.x *= ratio;
        player.y *= ratio;
        
        // Apply edge damage
        player.health -= GAME_CONSTANTS.WORLD_EDGE_DAMAGE * dt;
        if (player.health <= 0) {
          player.die('world_edge');
        }
      }
    });
  }

  private updateEnemyAI(state: GameState, enemy: any, dt: number) {
    // Find nearest player
    const nearestPlayer = this.spatialHash.queryNearestOfType(
      enemy.x, enemy.y, 'player', 100
    );
    
    if (nearestPlayer) {
      enemy.targetPlayerId = nearestPlayer.id;
      
      // Move toward player
      const dir = direction(
        { x: enemy.x, y: enemy.y },
        { x: nearestPlayer.x, y: nearestPlayer.y }
      );
      
      enemy.velocityX = dir.x * enemy.speed;
      enemy.velocityY = dir.y * enemy.speed;
    } else {
      // Wander toward center
      const dir = direction({ x: enemy.x, y: enemy.y }, { x: 0, y: 0 });
      enemy.velocityX = dir.x * enemy.speed * 0.5;
      enemy.velocityY = dir.y * enemy.speed * 0.5;
    }
    
    enemy.x += enemy.velocityX * dt;
    enemy.y += enemy.velocityY * dt;
  }
}
```

## Acceptance Criteria

1. Server starts and creates GameRoom on `/game`
2. Players can join and are spawned at random positions
3. Game loop runs at fixed 60Hz
4. Input is buffered and processed once per tick
5. Spatial hash enables efficient radius queries
6. Enemies move toward nearest player
7. Projectiles move according to velocity
8. XP orbs are magnetized toward nearby players
9. World boundary is enforced with edge damage
10. Dead players can respawn after delay
