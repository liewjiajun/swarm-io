/**
 * MockColyseusServer - Integration Test Infrastructure (P7.4)
 *
 * A mock Colyseus server that simulates actual server behavior for integration testing.
 * This enables testing:
 * - Client-server message flow
 * - State serialization/deserialization
 * - Reconnection logic
 * - Multiple concurrent clients
 * - Game state synchronization
 *
 * Unlike unit test mocks that bypass actual protocols, this mock:
 * - Maintains actual game state structure
 * - Validates message formats
 * - Simulates server-side logic
 * - Supports multiple simultaneous clients
 */

import { vi } from 'vitest';

// Types matching actual game state
export interface MockPlayer {
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
  weapons: { type: string; level: number }[];
}

export interface MockEnemy {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

export interface MockProjectile {
  id: string;
  type: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  lifetime: number;
  radius: number;
  piercing: number;
}

export interface MockXPOrb {
  id: string;
  x: number;
  y: number;
  size: 'small' | 'medium' | 'large';
  value: number;
  magnetized: boolean;
  targetPlayerId?: string;
}

export interface MockPowerUp {
  id: string;
  type: string;
  x: number;
  y: number;
  spawnTime: number;
  lifetime: number;
}

export interface MockWorldEvent {
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

export interface MockWorld {
  worldRadius: number;
  playerCount: number;
  gameTime: number;
  currentWave: number;
  difficulty: number;
}

export interface MockGameState {
  players: Map<string, MockPlayer>;
  enemies: Map<string, MockEnemy>;
  projectiles: Map<string, MockProjectile>;
  xpOrbs: Map<string, MockXPOrb>;
  powerUps: Map<string, MockPowerUp>;
  worldEvents: Map<string, MockWorldEvent>;
  world: MockWorld;
}

export interface MockClient {
  sessionId: string;
  nickname: string;
  playerClass: string;
  connected: boolean;
}

export interface UpgradeChoice {
  id: string;
  type: 'weapon' | 'stat';
  weaponType?: string;
  statType?: string;
  description: string;
  weight: number;
}

type _MessageHandler = (client: MockClient, message: any) => void;
type RoomCallback = (data: any) => void;

/**
 * Simulates a Colyseus Room for integration testing.
 * Maintains state and handles messages like the real server.
 */
export class MockColyseusRoom {
  public id: string;
  public sessionId: string;
  public reconnectionToken: string;
  public state: MockGameState;

  private messageHandlers: Map<string, RoomCallback[]> = new Map();
  private stateChangeCallbacks: RoomCallback[] = [];
  private leaveCallbacks: ((code: number) => void)[] = [];

  // Mock send function
  public send = vi.fn((type: string, data: any) => {
    // Record the message for verification
    this.sentMessages.push({ type, data });

    // Forward to server mock if connected
    if (this.serverMock) {
      this.serverMock.handleClientMessage(this.sessionId, type, data);
    }
  });

  public leave = vi.fn(() => {
    this.leaveCallbacks.forEach(cb => cb(1000)); // Normal close
  });

  public sentMessages: { type: string; data: any }[] = [];
  private serverMock: MockColyseusServer | null = null;

  constructor(sessionId: string, state: MockGameState, serverMock?: MockColyseusServer) {
    this.id = `room-${Date.now()}`;
    this.sessionId = sessionId;
    this.reconnectionToken = `token-${sessionId}-${Date.now()}`;
    this.state = state;
    this.serverMock = serverMock || null;

    // Make state compatible with MapSchema patterns
    this.enhanceStateWithMapSchemaMethods();
  }

  private enhanceStateWithMapSchemaMethods(): void {
    // Add forEach and $items to each collection for MapSchema compatibility
    const collections = ['players', 'enemies', 'projectiles', 'xpOrbs', 'powerUps', 'worldEvents'] as const;

    for (const collectionName of collections) {
      const map = this.state[collectionName] as Map<string, any>;
      (map as any).$items = map;
      (map as any).forEach = map.forEach.bind(map);
      (map as any).onAdd = vi.fn();
      (map as any).onRemove = vi.fn();
    }
  }

  public onStateChange(callback: RoomCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  public onMessage(type: string, callback: RoomCallback): void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.push(callback);
    this.messageHandlers.set(type, handlers);
  }

  public onLeave(callback: (code: number) => void): void {
    this.leaveCallbacks.push(callback);
  }

  // Methods for test control
  public triggerStateChange(): void {
    this.stateChangeCallbacks.forEach(cb => cb(this.state));
  }

  public triggerMessage(type: string, data: any): void {
    const handlers = this.messageHandlers.get(type) || [];
    handlers.forEach(cb => cb(data));
  }

  public simulateDisconnect(code: number = 1006): void {
    this.leaveCallbacks.forEach(cb => cb(code));
  }
}

/**
 * MockColyseusServer - Simulates a full Colyseus server for integration testing.
 *
 * Features:
 * - Multiple simultaneous client connections
 * - Full game state management
 * - Message handling simulation
 * - Upgrade system simulation
 * - Player lifecycle management
 */
export class MockColyseusServer {
  private state: MockGameState;
  private clients: Map<string, MockClient> = new Map();
  private rooms: Map<string, MockColyseusRoom> = new Map();
  private messageLog: { clientId: string; type: string; data: any; timestamp: number }[] = [];

  // Connection behavior configuration
  public connectionDelay: number = 0;
  public shouldFailConnection: boolean = false;
  public connectionError: Error | null = null;

  // Simulation controls
  public gameTime: number = 0;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): MockGameState {
    return {
      players: new Map(),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      powerUps: new Map(),
      worldEvents: new Map(),
      world: {
        worldRadius: 500,
        playerCount: 0,
        gameTime: 0,
        currentWave: 1,
        difficulty: 1,
      },
    };
  }

  /**
   * Simulate a client joining the game.
   * Creates a new player and returns a mock room.
   */
  public async joinOrCreate(
    roomName: string,
    options?: { nickname?: string; playerClass?: string }
  ): Promise<MockColyseusRoom> {
    // Simulate connection delay if configured
    if (this.connectionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.connectionDelay));
    }

    // Simulate connection failure if configured
    if (this.shouldFailConnection) {
      throw this.connectionError || new Error('Connection failed');
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const nickname = options?.nickname || '';
    const playerClass = options?.playerClass || 'survivor';

    // Create mock client
    const client: MockClient = {
      sessionId,
      nickname,
      playerClass,
      connected: true,
    };
    this.clients.set(sessionId, client);

    // Create player in game state
    this.addPlayer(sessionId, nickname, playerClass);

    // Create and return mock room
    const room = new MockColyseusRoom(sessionId, this.state, this);
    this.rooms.set(sessionId, room);

    return room;
  }

  /**
   * Simulate reconnection with stored token.
   * Token format: "token-{sessionId}-{timestamp}"
   * Where sessionId format: "session-{timestamp}-{random}"
   */
  public async reconnect(token: string): Promise<MockColyseusRoom> {
    // Token format: token-session-{timestamp}-{random}-{timestamp}
    // We need to extract "session-{timestamp}-{random}" as the sessionId
    if (!token.startsWith('token-')) {
      throw new Error('Invalid reconnection token');
    }

    // Remove "token-" prefix and extract sessionId
    const withoutPrefix = token.substring(6); // Remove "token-"
    // The sessionId is "session-{timestamp}-{random}", followed by "-{timestamp}"
    // Find the sessionId by looking for "session-" pattern
    const sessionMatch = withoutPrefix.match(/^(session-[^-]+-[^-]+)/);
    if (!sessionMatch) {
      throw new Error('Invalid reconnection token format');
    }
    const sessionId = sessionMatch[1];

    // Check if client still exists
    const existingClient = this.clients.get(sessionId);
    if (!existingClient) {
      throw new Error('Session expired');
    }

    // Return existing or create new room
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new MockColyseusRoom(sessionId, this.state, this);
      this.rooms.set(sessionId, room);
    }

    return room;
  }

  /**
   * Add a new player to the game state.
   */
  private addPlayer(sessionId: string, nickname: string, playerClass: string): void {
    // Generate spawn position
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 100;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    // Determine starting weapons based on class
    const weapons = this.getStartingWeapons(playerClass);

    const player: MockPlayer = {
      id: sessionId,
      nickname,
      playerClass,
      x,
      y,
      health: 100,
      maxHealth: 100,
      level: 1,
      xp: 0,
      xpToNextLevel: 5,
      speed: 8,
      facingX: 1,
      facingY: 0,
      kills: 0,
      timeAlive: 0,
      invulnerableTime: 3,
      dead: false,
      pendingUpgrade: false,
      lastProcessedSequence: 0,
      weapons,
    };

    this.state.players.set(sessionId, player);
    this.state.world.playerCount = this.state.players.size;
    this.state.world.worldRadius = 500 + this.state.players.size * 100;
  }

  private getStartingWeapons(playerClass: string): { type: string; level: number }[] {
    switch (playerClass) {
      case 'warrior':
        return [
          { type: 'knife', level: 1 },
          { type: 'axe', level: 1 },
        ];
      case 'mage':
        return [
          { type: 'wand', level: 1 },
          { type: 'fireball', level: 1 },
        ];
      case 'rogue':
        return [
          { type: 'knife', level: 1 },
          { type: 'knife', level: 1 },
        ];
      case 'cleric':
        return [
          { type: 'bible', level: 1 },
          { type: 'garlic', level: 1 },
        ];
      case 'survivor':
      default: {
        // Random 2-3 weapons for survivor class
        const allWeapons = ['knife', 'wand', 'bible', 'garlic', 'lightning', 'axe', 'fireball', 'whip'];
        const count = 2 + Math.floor(Math.random() * 2);
        const selected: { type: string; level: number }[] = [];
        const available = [...allWeapons];

        for (let i = 0; i < count && available.length > 0; i++) {
          const idx = Math.floor(Math.random() * available.length);
          selected.push({ type: available.splice(idx, 1)[0], level: 1 });
        }

        return selected;
      }
    }
  }

  /**
   * Handle a message from a client.
   */
  public handleClientMessage(sessionId: string, type: string, data: any): void {
    this.messageLog.push({
      clientId: sessionId,
      type,
      data,
      timestamp: Date.now(),
    });

    const player = this.state.players.get(sessionId);
    if (!player) return;

    switch (type) {
      case 'input':
        this.handleInput(player, data);
        break;
      case 'choose_upgrade':
        this.handleUpgradeChoice(player, sessionId, data);
        break;
      case 'respawn':
        this.handleRespawn(player, sessionId);
        break;
    }
  }

  private handleInput(player: MockPlayer, data: any): void {
    if (player.dead) return;

    const input = data.input || data;
    const dx = Math.max(-1, Math.min(1, input.dx || 0));
    const dy = Math.max(-1, Math.min(1, input.dy || 0));

    // Update position (simplified - in real server this is done by PhysicsSystem)
    const dt = 1 / 60; // Assume 60Hz tick
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;

    // Update facing direction
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      player.facingX = dx / len;
      player.facingY = dy / len;
    }

    // Track sequence for reconciliation
    if (typeof input.sequence === 'number') {
      player.lastProcessedSequence = input.sequence;
    }
  }

  private handleUpgradeChoice(player: MockPlayer, sessionId: string, data: any): void {
    if (!player.pendingUpgrade) return;

    const choice = data.choice;
    if (!choice) return;

    if (choice.type === 'weapon' && choice.weaponType) {
      // Check if player already has this weapon
      const existingWeapon = player.weapons.find(w => w.type === choice.weaponType);
      if (existingWeapon) {
        existingWeapon.level++;
      } else {
        player.weapons.push({ type: choice.weaponType, level: 1 });
      }
    } else if (choice.type === 'stat' && choice.statType) {
      switch (choice.statType) {
        case 'health':
          player.maxHealth += 20;
          player.health = Math.min(player.health + 20, player.maxHealth);
          break;
        case 'speed':
          player.speed += 0.5;
          break;
        // Other stat boosts...
      }
    }

    player.pendingUpgrade = false;

    // Send confirmation message
    const room = this.rooms.get(sessionId);
    if (room) {
      room.triggerMessage('upgrade_applied', { upgrade: choice });
    }
  }

  private handleRespawn(player: MockPlayer, sessionId: string): void {
    if (!player.dead) return;

    // Reset player state
    player.dead = false;
    player.health = player.maxHealth;
    player.level = 1;
    player.xp = 0;
    player.xpToNextLevel = 5;
    player.kills = 0;
    player.timeAlive = 0;
    player.invulnerableTime = 3;
    player.pendingUpgrade = false;

    // Respawn at random position
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 100;
    player.x = Math.cos(angle) * distance;
    player.y = Math.sin(angle) * distance;

    // Reset to starting weapon
    player.weapons = [{ type: 'knife', level: 1 }];

    // Send confirmation
    const room = this.rooms.get(sessionId);
    if (room) {
      room.triggerMessage('respawn_complete', { playerId: sessionId });
    }
  }

  // Test helper methods

  /**
   * Get all messages sent by a specific client.
   */
  public getMessagesFromClient(sessionId: string): { type: string; data: any }[] {
    return this.messageLog
      .filter(m => m.clientId === sessionId)
      .map(m => ({ type: m.type, data: m.data }));
  }

  /**
   * Get the last message sent by a client.
   */
  public getLastMessage(): { type: string; data: any } | null {
    return this.messageLog.length > 0
      ? {
          type: this.messageLog[this.messageLog.length - 1].type,
          data: this.messageLog[this.messageLog.length - 1].data,
        }
      : null;
  }

  /**
   * Clear message log.
   */
  public clearMessageLog(): void {
    this.messageLog = [];
  }

  /**
   * Get current game state.
   */
  public getState(): MockGameState {
    return this.state;
  }

  /**
   * Get a specific player.
   */
  public getPlayer(sessionId: string): MockPlayer | undefined {
    return this.state.players.get(sessionId);
  }

  /**
   * Add an enemy to the game state.
   */
  public addEnemy(type: string, x: number, y: number): MockEnemy {
    const id = `enemy-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const enemy: MockEnemy = {
      id,
      type,
      x,
      y,
      health: 100,
      maxHealth: 100,
    };
    this.state.enemies.set(id, enemy);
    return enemy;
  }

  /**
   * Add an XP orb to the game state.
   */
  public addXPOrb(x: number, y: number, value: number): MockXPOrb {
    const id = `xp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const size = value >= 25 ? 'large' : value >= 5 ? 'medium' : 'small';
    const orb: MockXPOrb = {
      id,
      x,
      y,
      size,
      value,
      magnetized: false,
    };
    this.state.xpOrbs.set(id, orb);
    return orb;
  }

  /**
   * Simulate a game tick (60Hz update).
   */
  public simulateTick(dt: number = 1 / 60): void {
    this.gameTime += dt;
    this.state.world.gameTime = this.gameTime;

    // Update player timers
    this.state.players.forEach(player => {
      if (!player.dead) {
        player.timeAlive += dt;
        player.invulnerableTime = Math.max(0, player.invulnerableTime - dt);
      }
    });

    // Notify all rooms of state change
    this.rooms.forEach(room => room.triggerStateChange());
  }

  /**
   * Simulate player leveling up.
   */
  public simulateLevelUp(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    player.level++;
    player.xp = 0;
    player.xpToNextLevel = this.getXPForNextLevel(player.level);
    player.pendingUpgrade = true;

    // Generate upgrade choices
    const choices = this.generateUpgradeChoices(player);

    // Send level_up message
    const room = this.rooms.get(sessionId);
    if (room) {
      room.triggerMessage('level_up', {
        newLevel: player.level,
        choices,
      });
    }
  }

  private getXPForNextLevel(level: number): number {
    if (level < 2) return 5;
    if (level < 20) return 5 + (level - 1) * 10;
    if (level < 40) return 195 + (level - 20) * 13;
    return 455 + (level - 40) * 16;
  }

  private generateUpgradeChoices(player: MockPlayer): UpgradeChoice[] {
    const choices: UpgradeChoice[] = [];
    const allWeapons = ['knife', 'wand', 'bible', 'garlic', 'lightning', 'axe', 'fireball', 'whip'];
    const ownedWeapons = player.weapons.map(w => w.type);

    // Add weapon upgrade options
    for (const weapon of player.weapons) {
      if (weapon.level < 8) {
        choices.push({
          id: `upgrade-${weapon.type}`,
          type: 'weapon',
          weaponType: weapon.type,
          description: `Upgrade ${weapon.type} to level ${weapon.level + 1}`,
          weight: 10,
        });
      }
    }

    // Add new weapon options
    const unownedWeapons = allWeapons.filter(w => !ownedWeapons.includes(w));
    for (const weapon of unownedWeapons.slice(0, 2)) {
      choices.push({
        id: `new-${weapon}`,
        type: 'weapon',
        weaponType: weapon,
        description: `Add ${weapon}`,
        weight: 8,
      });
    }

    // Add stat options
    choices.push({
      id: 'stat-health',
      type: 'stat',
      statType: 'health',
      description: '+20 Max Health',
      weight: 15,
    });

    choices.push({
      id: 'stat-speed',
      type: 'stat',
      statType: 'speed',
      description: '+0.5 Movement Speed',
      weight: 12,
    });

    // Shuffle and return 3 choices
    const shuffled = choices.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  /**
   * Simulate player death.
   */
  public simulatePlayerDeath(sessionId: string, killedBy: string = 'enemy'): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    player.dead = true;
    player.health = 0;

    const room = this.rooms.get(sessionId);
    if (room) {
      room.triggerMessage('player_died', {
        playerId: sessionId,
        killedBy,
        finalScore: player.level * 100 + player.kills * 50 + Math.floor(player.timeAlive),
      });
    }
  }

  /**
   * Disconnect a client from the server.
   */
  public disconnectClient(sessionId: string, code: number = 1000): void {
    const room = this.rooms.get(sessionId);
    if (room) {
      room.simulateDisconnect(code);
    }

    if (code === 1000 || code === 4000 || code === 4001) {
      // Normal disconnect or kick/ban - remove client and player
      this.clients.delete(sessionId);
      this.state.players.delete(sessionId);
      this.rooms.delete(sessionId);
      this.state.world.playerCount = this.state.players.size;
    }
  }

  /**
   * Reset server state.
   */
  public reset(): void {
    this.state = this.createInitialState();
    this.clients.clear();
    this.rooms.clear();
    this.messageLog = [];
    this.gameTime = 0;
    this.connectionDelay = 0;
    this.shouldFailConnection = false;
    this.connectionError = null;
  }
}

/**
 * Create a factory function for the mock Colyseus.js module.
 * This allows replacing the colyseus.js import in tests.
 */
export function createMockColyseusModule(server: MockColyseusServer) {
  return {
    Client: class MockClient {
      joinOrCreate = (roomName: string, options?: any) => server.joinOrCreate(roomName, options);
      reconnect = (token: string) => server.reconnect(token);
    },
    Room: MockColyseusRoom,
  };
}
