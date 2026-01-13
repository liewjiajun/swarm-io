import { Room, Client, Delayed } from '@colyseus/core';
import { GameState } from '../state/GameState.js';
import {
  SpatialHash,
  InputSystem,
  PhysicsSystem,
  SpawnSystem,
  WeaponSystem,
  CombatSystem,
  XPSystem
} from '../systems/index.js';
import { GAME_CONSTANTS, randomPointOnCircle } from '@swarm-io/shared';
import { InputMessage, UpgradeMessage } from '@swarm-io/shared';

interface PlayerInput {
  dx: number;
  dy: number;
  sequence: number;
  timestamp: number;
}

interface ClientData {
  inputBuffer: PlayerInput[];
  lastProcessedSequence: number;
  joinTime: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = 150;

  // Game systems
  private spatialHash = new SpatialHash(50);
  private inputSystem = new InputSystem();
  private physicsSystem = new PhysicsSystem(this.spatialHash);
  private spawnSystem = new SpawnSystem();
  private weaponSystem = new WeaponSystem();
  private combatSystem = new CombatSystem();
  private xpSystem = new XPSystem();

  // Client management
  private clientData = new Map<string, ClientData>();

  // Game timing
  private gameLoopInterval: Delayed | null = null;

  onCreate(options: any) {
    console.log('[GameRoom] Room created with options:', options);

    // Initialize game state
    this.setState(new GameState());

    // Register message handlers
    this.setupMessageHandlers();

    // Start the game loop at 60Hz
    this.startGameLoop();

    console.log('[GameRoom] Game loop started at 60Hz');
  }

  private setupMessageHandlers() {
    this.onMessage('input', (client, message) => {
      this.handleInputMessage(client, message as InputMessage);
    });

    this.onMessage('choose_upgrade', (client, message) => {
      this.handleUpgradeMessage(client, message as UpgradeMessage);
    });

    this.onMessage('respawn', (client) => {
      this.handleRespawnMessage(client);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`[GameRoom] Player ${client.sessionId} joining...`);

    try {
      // Generate spawn position near center with some spread
      const spawnRadius = Math.min(100, this.state.world.worldRadius * 0.2);
      const spawnPos = randomPointOnCircle(spawnRadius);

      // Add player to game state
      this.state.addPlayer(client.sessionId, spawnPos.x, spawnPos.y);

      // Initialize client data
      this.clientData.set(client.sessionId, {
        inputBuffer: [],
        lastProcessedSequence: 0,
        joinTime: Date.now()
      });

      // Recalculate world size
      this.recalculateWorldSize();

      console.log(`[GameRoom] Player ${client.sessionId} spawned at (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)})`);

      // Send welcome message
      client.send('game_info', {
        playerId: client.sessionId,
        worldRadius: this.state.world.worldRadius,
        playerCount: this.state.world.playerCount
      });

    } catch (error) {
      console.error(`[GameRoom] Error during player join:`, error);
      client.error(500, 'Failed to join game');
    }
  }

  onLeave(client: Client, consented?: boolean) {
    console.log(`[GameRoom] Player ${client.sessionId} leaving... (consented: ${consented})`);

    try {
      // Remove player from game state
      this.state.removePlayer(client.sessionId);

      // Clean up client data
      this.clientData.delete(client.sessionId);

      // Clean up input system data
      this.inputSystem.cleanupPlayer(client.sessionId);

      // Recalculate world size
      this.recalculateWorldSize();

      console.log(`[GameRoom] Player ${client.sessionId} removed. Players remaining: ${this.state.world.playerCount}`);

    } catch (error) {
      console.error(`[GameRoom] Error during player leave:`, error);
    }
  }


  onDispose() {
    console.log('[GameRoom] Room disposing...');

    // Stop game loop
    if (this.gameLoopInterval) {
      this.gameLoopInterval.clear();
      this.gameLoopInterval = null;
    }

    // Reset systems
    this.spawnSystem.reset();
    this.weaponSystem.reset();
    this.combatSystem.reset();
    this.xpSystem.reset();

    console.log('[GameRoom] Room disposed');
  }

  private startGameLoop() {
    // Run at 60Hz (16.67ms intervals)
    this.gameLoopInterval = this.clock.setInterval(() => {
      this.updateGameState(GAME_CONSTANTS.SERVER_TICK_RATE / 1000); // Convert to seconds
    }, GAME_CONSTANTS.SERVER_TICK_RATE);
  }

  private updateGameState(deltaTime: number) {
    try {
      // Update game time
      this.state.world.gameTime += deltaTime;

      // Process buffered inputs for all players
      this.processPlayerInputs(deltaTime);

      // Rebuild spatial hash for efficient collision queries
      this.rebuildSpatialHash();

      // Update all systems in dependency order
      this.physicsSystem.update(this.state, deltaTime);
      this.weaponSystem.update(this.state, this.spatialHash, deltaTime);
      this.combatSystem.update(this.state, this.spatialHash, deltaTime);
      this.xpSystem.update(this.state, this.spatialHash, deltaTime);
      this.spawnSystem.update(this.state, deltaTime);

      // Update player timers and states
      this.updatePlayerTimers(deltaTime);

    } catch (error) {
      console.error('[GameRoom] Error in game loop:', error);
    }
  }

  private processPlayerInputs(deltaTime: number) {
    this.clientData.forEach((clientData, playerId) => {
      const player = this.state.players.get(playerId);
      if (!player || player.dead || player.pendingUpgrade) {
        return;
      }

      // Process one input per tick (prevents spam)
      if (clientData.inputBuffer.length > 0) {
        const input = clientData.inputBuffer.shift()!;

        // Update sequence tracking
        if (input.sequence > clientData.lastProcessedSequence) {
          clientData.lastProcessedSequence = input.sequence;
        }

        // Process input through input system
        this.inputSystem.processInput(player, input, deltaTime);
      }
    });
  }

  private rebuildSpatialHash() {
    this.spatialHash.clear();

    // Insert all entities into spatial hash
    Object.values(this.state.players).forEach(player => {
      if (!player.dead) {
        this.spatialHash.insert({
          id: player.id,
          x: player.x,
          y: player.y,
          type: 'player',
          entity: player
        });
      }
    });

    Object.values(this.state.enemies).forEach(enemy => {
      this.spatialHash.insert({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        type: 'enemy',
        entity: enemy
      });
    });

    Object.values(this.state.projectiles).forEach(projectile => {
      this.spatialHash.insert({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        type: 'projectile',
        entity: projectile
      });
    });

    Object.values(this.state.xpOrbs).forEach(orb => {
      this.spatialHash.insert({
        id: orb.id,
        x: orb.x,
        y: orb.y,
        type: 'xp',
        entity: orb
      });
    });
  }

  private updatePlayerTimers(deltaTime: number) {
    Object.values(this.state.players).forEach(player => {
      if (!player.dead) {
        // Update time alive
        player.timeAlive += deltaTime;

        // Update invulnerability timer
        if (player.invulnerableTime > 0) {
          player.invulnerableTime = Math.max(0, player.invulnerableTime - deltaTime);
        }

        // Decay hostility over time
        if (player.hostility > 0) {
          player.hostility = Math.max(0, player.hostility - deltaTime * 2); // 2 points per second
        }
      }
    });
  }

  private handleInputMessage(client: Client, message: InputMessage) {
    const clientData = this.clientData.get(client.sessionId);
    if (!clientData) {
      console.warn(`[GameRoom] No client data for input from ${client.sessionId}`);
      return;
    }

    // Validate input structure
    if (!message || !message.input || typeof message.input.dx !== 'number' || typeof message.input.dy !== 'number') {
      console.warn(`[GameRoom] Invalid input from ${client.sessionId}:`, message);
      return;
    }

    // Prevent input buffer overflow
    if (clientData.inputBuffer.length >= 10) {
      console.warn(`[GameRoom] Input buffer overflow for ${client.sessionId}, dropping oldest input`);
      clientData.inputBuffer.shift(); // Remove oldest input
    }

    // Add to input buffer
    clientData.inputBuffer.push({
      dx: message.input.dx,
      dy: message.input.dy,
      sequence: message.input.sequence || 0,
      timestamp: Date.now()
    });
  }

  private handleUpgradeMessage(client: Client, message: UpgradeMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.pendingUpgrade) {
      console.warn(`[GameRoom] Invalid upgrade request from ${client.sessionId}`);
      return;
    }

    // Validate upgrade choice structure
    if (!message.choice || !message.choice.type) {
      console.warn(`[GameRoom] Invalid upgrade choice from ${client.sessionId}:`, message);
      return;
    }

    // Apply upgrade through XP system
    const success = this.xpSystem.applyUpgrade(this.state, client.sessionId, message.choice);

    if (success) {
      // Send confirmation to client
      client.send('upgrade_applied', {
        choice: message.choice,
        playerLevel: player.level
      });
    } else {
      console.warn(`[GameRoom] Failed to apply upgrade for ${client.sessionId}:`, message.choice);
    }
  }

  private handleRespawnMessage(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.dead) {
      console.warn(`[GameRoom] Invalid respawn request from ${client.sessionId}`);
      return;
    }

    // Generate new spawn position
    const spawnRadius = Math.min(100, this.state.world.worldRadius * 0.2);
    const spawnPos = randomPointOnCircle(spawnRadius);

    // Respawn player
    player.respawn(spawnPos.x, spawnPos.y);

    console.log(`[GameRoom] Player ${client.sessionId} respawned at (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)})`);

    // Send respawn confirmation
    client.send('respawn_complete', {
      x: spawnPos.x,
      y: spawnPos.y
    });
  }

  private recalculateWorldSize() {
    // Count living players
    const playerCount = Object.keys(this.state.players).length;

    // Update world state
    this.state.world.playerCount = playerCount;
    this.state.world.recalculateSize(playerCount);

    console.log(`[GameRoom] World size updated: ${this.state.world.worldRadius} (${playerCount} players)`);
  }

  // Public methods for monitoring and debugging
  getRoomStats(): Record<string, unknown> {
    return {
      playerCount: this.state.world.playerCount,
      enemyCount: Object.keys(this.state.enemies).length,
      projectileCount: Object.keys(this.state.projectiles).length,
      xpOrbCount: Object.keys(this.state.xpOrbs).length,
      gameTime: this.state.world.gameTime,
      currentWave: this.state.world.currentWave,
      worldRadius: this.state.world.worldRadius,
      inputMetrics: this.inputSystem.getSecurityMetrics(),
      spawnMetrics: this.spawnSystem.getSpawnMetrics(),
      combatMetrics: this.combatSystem.getCombatMetrics(),
      xpMetrics: this.xpSystem.getXPMetrics()
    };
  }
}