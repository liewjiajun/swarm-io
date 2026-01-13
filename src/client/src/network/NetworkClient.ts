import { Client, Room } from 'colyseus.js';
import type { PlayerInput } from '@swarm-io/shared';

interface StateChangeCallback {
  (state: SerializedGameState): void;
}

interface PlayerDiedCallback {
  (data: { playerId: string; killedBy: string; finalScore: number }): void;
}

interface LevelUpCallback {
  (data: { newLevel: number; choices: UpgradeChoice[] }): void;
}

interface UpgradeChoice {
  id: string;
  type: 'weapon' | 'stat';
  weaponType?: string;
  statType?: string;
  description: string;
  weight: number;
}

interface SerializedPlayer {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  speed: number;
  facingX: number;
  facingY: number;
  kills: number;
  timeAlive: number;
  invulnerableTime: number;
  dead: boolean;
  pendingUpgrade: boolean;
  weapons: { type: string; level: number }[];
}

interface SerializedEnemy {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

interface SerializedProjectile {
  id: string;
  type: string;
  x: number;
  y: number;
  radius: number;
}

interface SerializedXPOrb {
  id: string;
  x: number;
  y: number;
  size: string;
  value: number;
  magnetized: boolean;
}

interface SerializedWorld {
  worldRadius: number;
  playerCount: number;
  gameTime: number;
  currentWave: number;
  difficulty: number;
}

export interface SerializedGameState {
  players: Map<string, SerializedPlayer>;
  enemies: Map<string, SerializedEnemy>;
  projectiles: Map<string, SerializedProjectile>;
  xpOrbs: Map<string, SerializedXPOrb>;
  world: SerializedWorld;
}

export class NetworkClient {
  private client: Client;
  private room: Room | null = null;

  private stateChangeCallbacks: StateChangeCallback[] = [];
  private playerDiedCallbacks: PlayerDiedCallback[] = [];
  private levelUpCallbacks: LevelUpCallback[] = [];

  // Reconnection logic
  private reconnectAttempts = 0;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 30000];
  private isReconnecting = false;

  constructor() {
    // Connect to server - use relative URL in production, localhost in dev
    const serverUrl = import.meta.env.DEV
      ? 'ws://localhost:2567'
      : `wss://${window.location.host}`;

    this.client = new Client(serverUrl);
    console.log('[NetworkClient] Initialized with server URL:', serverUrl);
  }

  async connect(): Promise<void> {
    if (this.isReconnecting) {
      console.log('[NetworkClient] Already reconnecting, skipping...');
      return;
    }

    try {
      // Try to reconnect with stored session first
      const storedSession = localStorage.getItem('swarm_session');
      if (storedSession) {
        try {
          console.log('[NetworkClient] Attempting to reconnect with stored session...');
          this.room = await this.client.reconnect(storedSession);
          console.log('[NetworkClient] Reconnected to room:', this.room.id);
        } catch (reconnectError) {
          console.log('[NetworkClient] Reconnection failed, joining fresh:', reconnectError);
          this.room = await this.client.joinOrCreate('game');
        }
      } else {
        this.room = await this.client.joinOrCreate('game');
      }

      console.log('[NetworkClient] Connected to room:', this.room.id);

      // Store session for reconnection
      if (this.room.reconnectionToken) {
        localStorage.setItem('swarm_session', this.room.reconnectionToken);
      }

      this.reconnectAttempts = 0;
      this.setupStateHandlers();
      this.setupMessageHandlers();
      this.setupDisconnectHandler();

    } catch (error) {
      console.error('[NetworkClient] Failed to connect:', error);
      await this.handleReconnect();
    }
  }

  private setupStateHandlers() {
    if (!this.room) return;

    // Listen for state changes
    this.room.onStateChange((state) => {
      const serializedState = this.serializeState(state);
      this.stateChangeCallbacks.forEach(cb => cb(serializedState));
    });

    console.log('[NetworkClient] State handlers setup complete');
  }

  private setupMessageHandlers() {
    if (!this.room) return;

    this.room.onMessage('player_died', (data) => {
      console.log('[NetworkClient] Player died:', data);
      this.playerDiedCallbacks.forEach(cb => cb(data));
    });

    this.room.onMessage('level_up', (data) => {
      console.log('[NetworkClient] Level up:', data);
      this.levelUpCallbacks.forEach(cb => cb(data));
    });

    this.room.onMessage('game_info', (data) => {
      console.log('[NetworkClient] Game info received:', data);
    });

    this.room.onMessage('upgrade_applied', (data) => {
      console.log('[NetworkClient] Upgrade applied:', data);
    });

    this.room.onMessage('respawn_complete', (data) => {
      console.log('[NetworkClient] Respawn complete:', data);
    });

    console.log('[NetworkClient] Message handlers setup complete');
  }

  private setupDisconnectHandler() {
    if (!this.room) return;

    this.room.onLeave((code) => {
      console.log('[NetworkClient] Disconnected from room, code:', code);

      // Only attempt reconnection for unexpected disconnects
      if (code !== 1000 && code !== 4000) {
        this.handleReconnect();
      }
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;

    const delay = this.reconnectDelays[
      Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)
    ];

    this.reconnectAttempts++;
    console.log(`[NetworkClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    this.isReconnecting = false;
    await this.connect();
  }

  private serializeState(state: any): SerializedGameState {
    // Convert Colyseus MapSchema to plain JavaScript Maps
    const players = new Map<string, SerializedPlayer>();
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
        weapons: Array.from(player.weapons || []).map((w: any) => ({
          type: w.type,
          level: w.level,
        })),
      });
    });

    const enemies = new Map<string, SerializedEnemy>();
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

    const projectiles = new Map<string, SerializedProjectile>();
    state.projectiles.forEach((proj: any, id: string) => {
      projectiles.set(id, {
        id: proj.id,
        type: proj.type,
        x: proj.x,
        y: proj.y,
        radius: proj.radius,
      });
    });

    const xpOrbs = new Map<string, SerializedXPOrb>();
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
    this.room.send('input', { type: 'input', input });
  }

  sendUpgradeChoice(choice: UpgradeChoice) {
    if (!this.room) return;
    this.room.send('choose_upgrade', { type: 'choose_upgrade', choice });
  }

  sendRespawn() {
    if (!this.room) return;
    this.room.send('respawn', { type: 'respawn' });
  }

  onStateChange(callback: StateChangeCallback) {
    this.stateChangeCallbacks.push(callback);
  }

  onPlayerDied(callback: PlayerDiedCallback) {
    this.playerDiedCallbacks.push(callback);
  }

  onLevelUp(callback: LevelUpCallback) {
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
      localStorage.removeItem('swarm_session');
      console.log('[NetworkClient] Disconnected');
    }
  }
}
