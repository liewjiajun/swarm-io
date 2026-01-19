import { Client, Room } from 'colyseus.js';
import type { PlayerInput } from '@swarm-io/shared';
import { networkLogger as logger } from '../utils/logger';

// Type definitions for Colyseus schema objects received from server
// These represent the schema structure without importing server-side code

/**
 * Generic MapSchema interface for Colyseus collections.
 * Supports both forEach method and direct $items Map access for Schema 2.0 compatibility.
 */
interface ColyseusMapSchema<T> {
  forEach?: (callback: (item: T, id: string) => void) => void;
  $items?: Map<string, T>;
  size?: number;
}

/**
 * Represents a Colyseus ArraySchema with internal $items Map
 */
interface ColyseusArraySchema<T> {
  $items?: Map<number, T>;
  [Symbol.iterator]?: () => IterableIterator<T>;
}

/**
 * Schema representation of a player's weapon from the server
 */
interface ColyseusWeaponSchema {
  type: string;
  level: number;
}

/**
 * Schema representation of a player from the server
 */
interface ColyseusPlayerSchema {
  id: string;
  nickname: string;
  playerClass: string;
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
  lastProcessedSequence: number;
  weapons: ColyseusArraySchema<ColyseusWeaponSchema>;
}

/**
 * Schema representation of an enemy from the server
 */
interface ColyseusEnemySchema {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

/**
 * Schema representation of a projectile from the server
 */
interface ColyseusProjectileSchema {
  id: string;
  type: string;
  x: number;
  y: number;
  radius: number;
}

/**
 * Schema representation of an XP orb from the server
 */
interface ColyseusXPOrbSchema {
  id: string;
  x: number;
  y: number;
  size: string;
  value: number;
  magnetized: boolean;
}

/**
 * Schema representation of a power-up from the server
 */
interface ColyseusPowerUpSchema {
  id: string;
  type: string;
  x: number;
  y: number;
  spawnTime: number;
  lifetime: number;
}

/**
 * Schema representation of a world event from the server
 */
interface ColyseusWorldEventSchema {
  id: string;
  type: string;
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
  active: boolean;
  intensity?: number;
  spawnedCount?: number;
  xpMultiplier?: number;
}

/**
 * Schema representation of world state from the server
 */
interface ColyseusWorldSchema {
  worldRadius: number;
  playerCount: number;
  gameTime: number;
  currentWave: number;
  difficulty: number;
}

/**
 * Root game state schema from the server
 */
interface ColyseusGameState {
  players: ColyseusMapSchema<ColyseusPlayerSchema>;
  enemies: ColyseusMapSchema<ColyseusEnemySchema>;
  projectiles: ColyseusMapSchema<ColyseusProjectileSchema>;
  xpOrbs: ColyseusMapSchema<ColyseusXPOrbSchema>;
  powerUps: ColyseusMapSchema<ColyseusPowerUpSchema>;
  worldEvents: ColyseusMapSchema<ColyseusWorldEventSchema>;
  world: ColyseusWorldSchema;
}

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

// P9.2: Leaderboard update callback
interface LeaderboardUpdateCallback {
  (data: {
    accepted: boolean;
    rank: number | null;
    message: string;
    replacedPrevious: boolean;
    previousScore?: number;
  }): void;
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
  nickname: string; // P3.1: Player display name
  playerClass: string; // P9.3: Character class
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
  lastProcessedSequence: number; // BUG-027 FIX: For client-side prediction reconciliation
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

// P5.2: Power-up serialized state
interface SerializedPowerUp {
  id: string;
  type: string;
  x: number;
  y: number;
  spawnTime: number;
  lifetime: number;
}

// BUG-048 FIX: P5.1 World event serialized state
interface SerializedWorldEvent {
  id: string;
  type: string;
  x: number;
  y: number;
  radius: number;
  startTime: number;
  duration: number;
  active: boolean;
  intensity: number;
  spawnedCount: number;
  xpMultiplier: number;
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
  powerUps: Map<string, SerializedPowerUp>; // P5.2: Power-ups
  worldEvents: Map<string, SerializedWorldEvent>; // BUG-048 FIX: P5.1 World events
  world: SerializedWorld;
}

export class NetworkClient {
  private client: Client;
  private room: Room | null = null;

  private stateChangeCallbacks: StateChangeCallback[] = [];
  private playerDiedCallbacks: PlayerDiedCallback[] = [];
  private levelUpCallbacks: LevelUpCallback[] = [];
  private leaderboardUpdateCallbacks: LeaderboardUpdateCallback[] = []; // P9.2

  // Reconnection logic
  private reconnectAttempts = 0;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 30000];
  private isReconnecting = false;

  // P3.1: Player nickname (stored for reconnection)
  private playerNickname: string = '';

  // P9.3: Player class (stored for reconnection)
  private playerClass: string = 'survivor';

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
    logger.info({ serverUrl }, 'Initialized');
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

    logger.debug({ url }, 'URL validation passed');
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
        logger.warn(
          { inputsDropped: this.inputsDropped, limit: this.MAX_INPUTS_PER_SECOND },
          'Rate limited - inputs dropped'
        );
      }
      return false;
    }

    // Record this input
    this.inputTimestamps.push(now);
    return true;
  }

  async connect(nickname?: string, playerClass?: string): Promise<void> {
    if (this.isReconnecting) {
      logger.debug('Already reconnecting, skipping');
      return;
    }

    // P3.1: Store nickname for potential reconnection
    if (nickname) {
      this.playerNickname = nickname;
    }

    // P9.3: Store playerClass for potential reconnection
    if (playerClass) {
      this.playerClass = playerClass;
    }

    try {
      // Try to reconnect with stored session first
      const storedSession = localStorage.getItem('swarm_session');
      if (storedSession) {
        try {
          logger.info('Attempting to reconnect with stored session');
          this.room = await this.client.reconnect(storedSession);
          logger.info({ roomId: this.room.id }, 'Reconnected to room');
        } catch (reconnectError) {
          logger.info({ error: String(reconnectError) }, 'Reconnection failed, clearing stale session and joining fresh');
          localStorage.removeItem('swarm_session');
          // P3.1 + P9.3: Send nickname and class when joining fresh
          this.room = await this.client.joinOrCreate('game', { nickname: this.playerNickname, playerClass: this.playerClass });
        }
      } else {
        // P3.1 + P9.3: Send nickname and class when joining
        this.room = await this.client.joinOrCreate('game', { nickname: this.playerNickname, playerClass: this.playerClass });
      }

      logger.info({ roomId: this.room.id, nickname: this.playerNickname, playerClass: this.playerClass }, 'Connected to room');

      // Store session for reconnection
      if (this.room.reconnectionToken) {
        localStorage.setItem('swarm_session', this.room.reconnectionToken);
      }

      this.reconnectAttempts = 0;
      this.setupStateHandlers();
      this.setupMessageHandlers();
      this.setupDisconnectHandler();

    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to connect');
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

    logger.debug('State handlers setup complete');
  }

  private startStatePolling(state: ColyseusGameState) {
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

  private getPlayerCount(state: ColyseusGameState): number {
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
      if (state.players?.forEach) {
        state.players.forEach(() => count++);
      }
    } catch {
      // Ignore errors
    }
    return count;
  }

  private triggerStateUpdate(state: ColyseusGameState) {
    const serializedState = this.serializeState(state);
    this.stateChangeCallbacks.forEach(cb => cb(serializedState));
  }

  private setupMessageHandlers() {
    if (!this.room) return;

    this.room.onMessage('player_died', (data) => {
      logger.info({ playerId: data.playerId, killedBy: data.killedBy, finalScore: data.finalScore }, 'Player died');
      this.playerDiedCallbacks.forEach(cb => cb(data));
    });

    this.room.onMessage('level_up', (data) => {
      logger.info({ newLevel: data.newLevel, choiceCount: data.choices?.length }, 'Level up');
      this.levelUpCallbacks.forEach(cb => cb(data));
    });

    this.room.onMessage('game_info', (data) => {
      logger.debug({ data }, 'Game info received');
    });

    this.room.onMessage('upgrade_applied', (data) => {
      logger.info({ upgrade: data }, 'Upgrade applied');
    });

    this.room.onMessage('respawn_complete', (data) => {
      logger.info({ data }, 'Respawn complete');
    });

    // P9.2: Handle leaderboard update from server
    this.room.onMessage('leaderboard_update', (data) => {
      logger.info({ accepted: data.accepted, rank: data.rank, message: data.message }, 'Leaderboard update');
      this.leaderboardUpdateCallbacks.forEach(cb => cb(data));
    });

    // P3.2: Handle kick/ban notifications from server
    this.room.onMessage('kicked', (data) => {
      logger.error({ reason: data.reason }, 'Kicked from server');
      localStorage.removeItem('swarm_session'); // Clear session to prevent auto-reconnect
    });

    this.room.onMessage('banned', (data) => {
      const remaining = data.remaining
        ? Math.ceil(data.remaining / 1000)
        : null;
      logger.error({ reason: data.reason, remainingSeconds: remaining }, 'Banned from server');
      localStorage.removeItem('swarm_session'); // Clear session to prevent auto-reconnect
    });

    logger.debug('Message handlers setup complete');
  }

  private setupDisconnectHandler() {
    if (!this.room) return;

    this.room.onLeave((code) => {
      logger.info({ code }, 'Disconnected from room');

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
      logger.error({ attempts: this.reconnectAttempts }, 'Max reconnection attempts reached, giving up');
      localStorage.removeItem('swarm_session');
      throw new Error('Failed to connect after multiple attempts');
    }

    this.isReconnecting = true;

    const delay = this.reconnectDelays[
      Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)
    ];

    this.reconnectAttempts++;
    logger.info({ delayMs: delay, attempt: this.reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS }, 'Reconnecting');

    await new Promise(resolve => setTimeout(resolve, delay));

    this.isReconnecting = false;
    await this.connect();
  }

  /**
   * Helper to iterate Colyseus MapSchema on client side
   * Tries multiple methods for compatibility with Schema 2.0
   */
  private forEachInMap<T>(mapSchema: ColyseusMapSchema<T>, callback: (item: T, id: string) => void): void {
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

  private serializeState(state: ColyseusGameState): SerializedGameState {
    // Convert Colyseus MapSchema to plain JavaScript Maps
    const players = new Map<string, SerializedPlayer>();
    this.forEachInMap<ColyseusPlayerSchema>(state.players, (player, id) => {
      players.set(id, {
        id: player.id,
        nickname: player.nickname || '', // P3.1: Include player nickname
        playerClass: player.playerClass || 'survivor', // P9.3: Include player class
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
        lastProcessedSequence: player.lastProcessedSequence || 0, // BUG-027 FIX
        weapons: Array.from(
          (player.weapons?.$items?.values() as Iterable<ColyseusWeaponSchema> | undefined) || []
        ).map((w) => ({
          type: w.type,
          level: w.level,
        })),
      });
    });

    const enemies = new Map<string, SerializedEnemy>();
    this.forEachInMap<ColyseusEnemySchema>(state.enemies, (enemy, id) => {
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
    this.forEachInMap<ColyseusProjectileSchema>(state.projectiles, (proj, id) => {
      projectiles.set(id, {
        id: proj.id,
        type: proj.type,
        x: proj.x,
        y: proj.y,
        radius: proj.radius,
      });
    });

    const xpOrbs = new Map<string, SerializedXPOrb>();
    this.forEachInMap<ColyseusXPOrbSchema>(state.xpOrbs, (orb, id) => {
      xpOrbs.set(id, {
        id: orb.id,
        x: orb.x,
        y: orb.y,
        size: orb.size,
        value: orb.value,
        magnetized: orb.magnetized,
      });
    });

    // P5.2: Power-ups
    const powerUps = new Map<string, SerializedPowerUp>();
    this.forEachInMap<ColyseusPowerUpSchema>(state.powerUps, (powerUp, id) => {
      powerUps.set(id, {
        id: powerUp.id,
        type: powerUp.type,
        x: powerUp.x,
        y: powerUp.y,
        spawnTime: powerUp.spawnTime,
        lifetime: powerUp.lifetime,
      });
    });

    // BUG-048 FIX: P5.1 World events
    const worldEvents = new Map<string, SerializedWorldEvent>();
    this.forEachInMap<ColyseusWorldEventSchema>(state.worldEvents, (event, id) => {
      worldEvents.set(id, {
        id: event.id,
        type: event.type,
        x: event.x,
        y: event.y,
        radius: event.radius,
        startTime: event.startTime,
        duration: event.duration,
        active: event.active,
        intensity: event.intensity || 0,
        spawnedCount: event.spawnedCount || 0,
        xpMultiplier: event.xpMultiplier || 1,
      });
    });

    return {
      players,
      enemies,
      projectiles,
      xpOrbs,
      powerUps,
      worldEvents,
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
    logger.debug({ hasRoom: !!this.room }, 'sendRespawn called');
    if (!this.room) return;
    this.room.send('respawn', { type: 'respawn' });
    logger.info('Respawn message sent to server');
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

  // P9.2: Register leaderboard update callback
  onLeaderboardUpdate(callback: LeaderboardUpdateCallback) {
    this.leaderboardUpdateCallbacks.push(callback);
  }

  get sessionId(): string {
    return this.room?.sessionId || '';
  }

  get connected(): boolean {
    return this.room !== null;
  }

  disconnect() {
    // Clear state polling interval to prevent memory leak
    if (this.statePollingInterval) {
      clearInterval(this.statePollingInterval);
      this.statePollingInterval = null;
    }

    if (this.room) {
      this.room.leave();
      this.room = null;
      localStorage.removeItem('swarm_session');
      logger.info('Disconnected');
    }
  }
}
