# 08 - Client Networking

## Overview
Implement the Colyseus client for connecting to the game server, handling state synchronization, and sending player inputs.

## File: src/client/src/network/NetworkClient.ts

```typescript
import { Client, Room } from 'colyseus.js';
import type { PlayerInput } from '@swarm-io/shared';

export class NetworkClient {
  private client: Client;
  private room: Room | null = null;
  
  private stateChangeCallbacks: ((state: any) => void)[] = [];
  private playerDiedCallbacks: ((data: any) => void)[] = [];
  private levelUpCallbacks: ((data: any) => void)[] = [];

  constructor() {
    // Connect to server - use relative URL in production, localhost in dev
    const serverUrl = import.meta.env.DEV 
      ? 'ws://localhost:2567' 
      : `wss://${window.location.host}`;
    
    this.client = new Client(serverUrl);
  }

  async connect(): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate('game');
      console.log('Connected to room:', this.room.id);
      
      this.setupStateHandlers();
      this.setupMessageHandlers();
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  private setupStateHandlers() {
    if (!this.room) return;
    
    // Convert Colyseus state to plain objects for rendering
    this.room.state.onChange = () => {
      const state = this.serializeState();
      this.stateChangeCallbacks.forEach(cb => cb(state));
    };
  }

  private setupMessageHandlers() {
    if (!this.room) return;
    
    this.room.onMessage('player_died', (data) => {
      this.playerDiedCallbacks.forEach(cb => cb(data));
    });
    
    this.room.onMessage('level_up', (data) => {
      this.levelUpCallbacks.forEach(cb => cb(data));
    });
  }

  private serializeState(): any {
    if (!this.room) return null;
    
    const state = this.room.state as any;
    
    // Convert MapSchema to Map
    const players = new Map();
    state.players.forEach((player: any, id: string) => {
      players.set(id, {
        id: player.id,
        x: player.x,
        y: player.y,
        health: player.health,
        maxHealth: player.maxHealth,
        level: player.level,
        xp: player.xp,
        xpToNextLevel: player.xpToNextLevel,
        speed: player.speed,
        facingX: player.facingX,
        facingY: player.facingY,
        kills: player.kills,
        timeAlive: player.timeAlive,
        invulnerableTime: player.invulnerableTime,
        dead: player.dead,
        pendingUpgrade: player.pendingUpgrade,
        weapons: Array.from(player.weapons).map((w: any) => ({
          type: w.type,
          level: w.level,
        })),
      });
    });
    
    const enemies = new Map();
    state.enemies.forEach((enemy: any, id: string) => {
      enemies.set(id, {
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
      });
    });
    
    const projectiles = new Map();
    state.projectiles.forEach((proj: any, id: string) => {
      projectiles.set(id, {
        id: proj.id,
        type: proj.type,
        x: proj.x,
        y: proj.y,
        radius: proj.radius,
      });
    });
    
    const xpOrbs = new Map();
    state.xpOrbs.forEach((orb: any, id: string) => {
      xpOrbs.set(id, {
        id: orb.id,
        x: orb.x,
        y: orb.y,
        size: orb.size,
        value: orb.value,
        magnetized: orb.magnetized,
      });
    });
    
    return {
      players,
      enemies,
      projectiles,
      xpOrbs,
      world: {
        worldRadius: state.world.worldRadius,
        playerCount: state.world.playerCount,
        gameTime: state.world.gameTime,
        currentWave: state.world.currentWave,
        difficulty: state.world.difficulty,
      },
    };
  }

  sendInput(input: PlayerInput) {
    if (!this.room) return;
    this.room.send('input', { input });
  }

  sendUpgradeChoice(choiceId: string) {
    if (!this.room) return;
    this.room.send('choose_upgrade', { choiceId });
  }

  sendRespawn() {
    if (!this.room) return;
    this.room.send('respawn', {});
  }

  onStateChange(callback: (state: any) => void) {
    this.stateChangeCallbacks.push(callback);
  }

  onPlayerDied(callback: (data: any) => void) {
    this.playerDiedCallbacks.push(callback);
  }

  onLevelUp(callback: (data: any) => void) {
    this.levelUpCallbacks.push(callback);
  }

  get sessionId(): string {
    return this.room?.sessionId || '';
  }

  get connected(): boolean {
    return this.room !== null;
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
  }
}
```

## Connection Flow

```
1. Client creates Colyseus Client with server URL
2. Client calls joinOrCreate('game')
3. Server creates player in GameState
4. Client receives initial state via onChange
5. Client starts game loop
6. Client sends inputs at 30Hz
7. Server broadcasts state at 20Hz
8. Client interpolates between states for smooth rendering
```

## Message Types

### Client → Server

| Message | Payload | Purpose |
|---------|---------|---------|
| `input` | `{ input: PlayerInput }` | Movement input |
| `choose_upgrade` | `{ choiceId: string }` | Level up choice |
| `respawn` | `{}` | Request respawn |

### Server → Client

| Message | Payload | Purpose |
|---------|---------|---------|
| `player_died` | `{ playerId, killedBy, finalScore }` | Death notification |
| `level_up` | `{ newLevel, choices[] }` | Upgrade options |

## State Synchronization

Colyseus automatically handles:
- Delta compression (only sends changed values)
- Schema serialization
- Reliable delivery over WebSocket

The client:
- Receives state updates at ~20Hz
- Stores snapshots for interpolation
- Renders at 60Hz using interpolated positions
- Applies client-side prediction for local player

## Acceptance Criteria

1. Client connects to server on page load
2. Player is created in game world
3. State changes trigger render updates
4. Inputs are sent to server
5. Death message shows death screen
6. Level up message shows upgrade UI
7. Upgrade choice is sent to server
8. Respawn request works after death
9. Disconnect cleans up properly
10. Reconnection is possible
