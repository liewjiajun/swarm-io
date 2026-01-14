import { Client, Room } from 'colyseus.js';
import type { PlayerInput } from '@swarm-io/shared';

// P3.3: WebSocket URL validation error
class URLValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'URLValidationError';
  }
}

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

  // P3.4: Client-side rate limiting (match server's 30 inputs/sec limit)
  private readonly MAX_INPUTS_PER_SECOND = 30;
  private readonly RATE_LIMIT_WINDOW = 1000; // 1 second window
  private inputTimestamps: number[] = [];
  private inputsDropped = 0;

  constructor() {
    // Connect to server - use relative URL in production, localhost in dev
    const serverUrl = import.meta.env.DEV
      ? 'ws://localhost:2567'
      : `wss://${window.location.host}`;

    // P3.3: Validate WebSocket URL before connecting
    this.validateServerUrl(serverUrl);

    this.client = new Client(serverUrl);
    console.log('[NetworkClient] Initialized with server URL:', serverUrl);
  }

  /**
   * P3.3: Validate WebSocket URL for security
   * - Ensures correct protocol (ws:// in dev, wss:// in prod)
   * - Validates hostname matches current origin in production
   * - Prevents connection to arbitrary servers
   */
  private validateServerUrl(url: string): void {
    const isDev = import.meta.env.DEV;

    // Parse the URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new URLValidationError(`Invalid WebSocket URL: ${url}`);
    }

    // Validate protocol
    const validProtocols = isDev ? ['ws:', 'wss:'] : ['wss:'];
    if (!validProtocols.includes(parsedUrl.protocol)) {
      throw new URLValidationError(
        `Invalid WebSocket protocol: ${parsedUrl.protocol}. ` +
        `Expected: ${validProtocols.join(' or ')}`
      );
    }

    // In development, only allow localhost connections
    if (isDev) {
      const allowedDevHosts = ['localhost', '127.0.0.1', '::1'];
      if (!allowedDevHosts.includes(parsedUrl.hostname)) {
        throw new URLValidationError(
          `Invalid dev server hostname: ${parsedUrl.hostname}. ` +
          `Only localhost connections allowed in development.`
        );
      }
    } else {
      // In production, validate hostname matches current origin
      if (parsedUrl.hostname !== window.location.hostname) {
        throw new URLValidationError(
          `WebSocket hostname mismatch: ${parsedUrl.hostname} !== ${window.location.hostname}. ` +
          `Cross-origin WebSocket connections are not allowed.`
        );
      }
    }

    console.log('[NetworkClient] URL validation passed:', url);
  }

  /**
   * P3.4: Check if we can send an input (client-side rate limiting)
   * Returns true if input can be sent, false if rate limited
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // Remove timestamps outside the rate limit window
    this.inputTimestamps = this.inputTimestamps.filter(
      ts => now - ts < this.RATE_LIMIT_WINDOW
    );

    // Check if we're within limits
    if (this.inputTimestamps.length >= this.MAX_INPUTS_PER_SECOND) {
      this.inputsDropped++;
      if (this.inputsDropped % 10 === 1) {
        console.warn(
          `[NetworkClient] Rate limited: ${this.inputsDropped} inputs dropped ` +
          `(limit: ${this.MAX_INPUTS_PER_SECOND}/sec)`
        );
      }
      return false;
    }

    // Record this input
    this.inputTimestamps.push(now);
    return true;
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
          console.log('[NetworkClient] Reconnection failed, clearing stale session and joining fresh:', reconnectError);
          localStorage.removeItem('swarm_session');
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

  private statePollingInterval: ReturnType<typeof setInterval> | null = null;

  private setupStateHandlers() {
    if (!this.room) return;

    const state = this.room.state;

    // Trigger initial update with current state
    this.triggerStateUpdate(state);

    // Listen for state changes (fires on every server tick with changes)
    this.room.onStateChange(() => {
      this.triggerStateUpdate(state);
    });

    // Set up onAdd/onRemove handlers for state collections
    state.players.onAdd(() => this.triggerStateUpdate(state));
    state.players.onRemove(() => this.triggerStateUpdate(state));
    state.enemies.onAdd(() => this.triggerStateUpdate(state));
    state.enemies.onRemove(() => this.triggerStateUpdate(state));
    state.projectiles.onAdd(() => this.triggerStateUpdate(state));
    state.projectiles.onRemove(() => this.triggerStateUpdate(state));
    state.xpOrbs.onAdd(() => this.triggerStateUpdate(state));
    state.xpOrbs.onRemove(() => this.triggerStateUpdate(state));

    // Fallback: Poll state periodically in case onAdd/onStateChange doesn't fire
    // This ensures we eventually get the player data even if there's a timing issue
    this.startStatePolling(state);

    console.log('[NetworkClient] State handlers setup complete');
  }

  private startStatePolling(state: any) {
    // Stop any existing polling
    if (this.statePollingInterval) {
      clearInterval(this.statePollingInterval);
    }

    // Poll every 100ms for the first 5 seconds after connection
    let pollCount = 0;
    const maxPolls = 50; // 5 seconds at 100ms intervals

    this.statePollingInterval = setInterval(() => {
      pollCount++;

      // Check if we have players now
      const playerCount = this.getPlayerCount(state);
      if (playerCount > 0) {
        this.triggerStateUpdate(state);
        // Stop polling once we have players
        if (this.statePollingInterval) {
          clearInterval(this.statePollingInterval);
          this.statePollingInterval = null;
        }
        return;
      }

      // Stop polling after max attempts
      if (pollCount >= maxPolls) {
        if (this.statePollingInterval) {
          clearInterval(this.statePollingInterval);
          this.statePollingInterval = null;
        }
      }
    }, 100);
  }

  private getPlayerCount(state: any): number {
    // Try multiple methods to get player count
    if (state.players?.$items instanceof Map) {
      return state.players.$items.size;
    }
    if (typeof state.players?.size === 'number') {
      return state.players.size;
    }
    // Try forEach to count
    let count = 0;
    try {
      state.players?.forEach(() => count++);
    } catch {
      // Ignore errors
    }
    return count;
  }

  private triggerStateUpdate(state: any) {
    const serializedState = this.serializeState(state);
    this.stateChangeCallbacks.forEach(cb => cb(serializedState));
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

    // P3.2: Handle kick/ban notifications from server
    this.room.onMessage('kicked', (data) => {
      console.error('[NetworkClient] Kicked from server:', data.reason);
      localStorage.removeItem('swarm_session'); // Clear session to prevent auto-reconnect
    });

    this.room.onMessage('banned', (data) => {
      const remaining = data.remaining
        ? ` Time remaining: ${Math.ceil(data.remaining / 1000)}s`
        : '';
      console.error(`[NetworkClient] Banned from server: ${data.reason}.${remaining}`);
      localStorage.removeItem('swarm_session'); // Clear session to prevent auto-reconnect
    });

    console.log('[NetworkClient] Message handlers setup complete');
  }

  private setupDisconnectHandler() {
    if (!this.room) return;

    this.room.onLeave((code) => {
      console.log('[NetworkClient] Disconnected from room, code:', code);

      // Only attempt reconnection for unexpected disconnects
      // 1000 = normal close, 4000 = kicked, 4001 = banned
      if (code !== 1000 && code !== 4000 && code !== 4001) {
        this.handleReconnect();
      }
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.isReconnecting) return;

    // Max reconnection attempts before giving up
    const MAX_RECONNECT_ATTEMPTS = 5;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[NetworkClient] Max reconnection attempts reached, giving up');
      localStorage.removeItem('swarm_session');
      throw new Error('Failed to connect after multiple attempts');
    }

    this.isReconnecting = true;

    const delay = this.reconnectDelays[
      Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)
    ];

    this.reconnectAttempts++;
    console.log(`[NetworkClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    this.isReconnecting = false;
    await this.connect();
  }

  /**
   * Helper to iterate Colyseus MapSchema on client side
   * Tries multiple methods for compatibility with Schema 2.0
   */
  private forEachInMap<T>(mapSchema: any, callback: (item: T, id: string) => void): void {
    if (!mapSchema) return;

    // Method 1: Try forEach - common MapSchema method
    if (typeof mapSchema.forEach === 'function') {
      try {
        mapSchema.forEach((item: T, id: string) => callback(item, id));
        return;
      } catch {
        // Fall through to next method
      }
    }

    // Method 2: Fallback to $items internal Map
    const items = mapSchema.$items;
    if (items instanceof Map) {
      items.forEach((item: T, id: string) => callback(item, id));
    }
  }

  private serializeState(state: any): SerializedGameState {
    // Convert Colyseus MapSchema to plain JavaScript Maps
    const players = new Map<string, SerializedPlayer>();
    this.forEachInMap(state.players, (player: any, id: string) => {
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
        weapons: Array.from(player.weapons?.$items?.values() || player.weapons || []).map((w: any) => ({
          type: w.type,
          level: w.level,
        })),
      });
    });

    const enemies = new Map<string, SerializedEnemy>();
    this.forEachInMap(state.enemies, (enemy: any, id: string) => {
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
    this.forEachInMap(state.projectiles, (proj: any, id: string) => {
      projectiles.set(id, {
        id: proj.id,
        type: proj.type,
        x: proj.x,
        y: proj.y,
        radius: proj.radius,
      });
    });

    const xpOrbs = new Map<string, SerializedXPOrb>();
    this.forEachInMap(state.xpOrbs, (orb: any, id: string) => {
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

    // P3.4: Apply client-side rate limiting
    if (!this.checkRateLimit()) {
      return; // Input dropped due to rate limit
    }

    this.room.send('input', { type: 'input', input });
  }

  sendUpgradeChoice(choice: UpgradeChoice) {
    if (!this.room) return;
    this.room.send('choose_upgrade', { type: 'choose_upgrade', choice });
  }

  sendRespawn() {
    console.log('[NetworkClient] sendRespawn called, room:', !!this.room);
    if (!this.room) return;
    this.room.send('respawn', { type: 'respawn' });
    console.log('[NetworkClient] Respawn message sent to server');
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
