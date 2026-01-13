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
import * as fs from 'fs';
import * as path from 'path';

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

interface BanEntry {
  reason: string;
  timestamp: number;
  duration: number; // -1 = permanent, or milliseconds until expiry
  violations: number;
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

  // Ban persistence (P3.2)
  private bannedSessions = new Map<string, BanEntry>();
  private bannedIPs = new Map<string, BanEntry>();
  private readonly banFilePath = path.join(process.cwd(), 'data', 'bans.json');
  private readonly DEFAULT_BAN_DURATION = 30 * 60 * 1000; // 30 minutes

  // Game timing
  private gameLoopInterval: Delayed | null = null;

  onCreate(options: any) {
    console.log('[GameRoom] Room created with options:', options);

    // Initialize game state
    this.setState(new GameState());

    // Load persisted bans (P3.2)
    this.loadBans();

    // Setup security kick callback
    this.inputSystem.setKickCallback((playerId, reason) => {
      this.kickPlayer(playerId, reason);
    });

    // Register message handlers
    this.setupMessageHandlers();

    // Start the game loop at 60Hz
    this.startGameLoop();

    console.log('[GameRoom] Game loop started at 60Hz');
  }

  /**
   * Kick a player from the game due to security violation
   * Also records the ban for persistence (P3.2)
   */
  private kickPlayer(playerId: string, reason: string): void {
    const client = this.clients.find(c => c.sessionId === playerId);
    if (client) {
      console.log(`[SECURITY] Kicking player ${playerId}: ${reason}`);

      // Record ban before kicking (P3.2)
      this.banPlayer(playerId, reason, this.getClientIP(client));

      // Send kick notification to client before disconnecting
      client.send('kicked', { reason });

      // Disconnect with custom close code (4000 = kicked for security)
      client.leave(4000);
    }
  }

  /**
   * Get client IP address for ban tracking (P3.2)
   */
  private getClientIP(client: Client): string {
    // Colyseus exposes the underlying WebSocket, which has the request info
    const req = (client as any).req || (client as any)._req;
    if (req) {
      // Check for forwarded IP (behind proxy)
      const forwarded = req.headers?.['x-forwarded-for'];
      if (forwarded) {
        return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
      }
      // Use socket remote address
      return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Ban a player by session and optionally by IP (P3.2)
   */
  private banPlayer(sessionId: string, reason: string, ip?: string): void {
    const banEntry: BanEntry = {
      reason,
      timestamp: Date.now(),
      duration: this.DEFAULT_BAN_DURATION,
      violations: 1
    };

    // Check if already banned to accumulate violations
    const existingBan = this.bannedSessions.get(sessionId);
    if (existingBan) {
      banEntry.violations = existingBan.violations + 1;
      // Escalate ban duration with repeat offenses
      banEntry.duration = Math.min(
        this.DEFAULT_BAN_DURATION * Math.pow(2, banEntry.violations - 1),
        24 * 60 * 60 * 1000 // Max 24 hours
      );
    }

    this.bannedSessions.set(sessionId, banEntry);
    console.log(`[SECURITY] Banned session ${sessionId} for ${banEntry.duration / 1000}s (violations: ${banEntry.violations})`);

    // Also ban by IP if available
    if (ip && ip !== 'unknown') {
      const existingIPBan = this.bannedIPs.get(ip);
      if (existingIPBan) {
        banEntry.violations = Math.max(banEntry.violations, existingIPBan.violations + 1);
        banEntry.duration = Math.min(
          this.DEFAULT_BAN_DURATION * Math.pow(2, banEntry.violations - 1),
          24 * 60 * 60 * 1000
        );
      }
      this.bannedIPs.set(ip, { ...banEntry });
      console.log(`[SECURITY] Banned IP ${ip} for ${banEntry.duration / 1000}s`);
    }

    // Persist bans to file
    this.saveBans();
  }

  /**
   * Check if a session or IP is banned (P3.2)
   */
  private isBanned(sessionId: string, ip?: string): { banned: boolean; reason?: string; remaining?: number } {
    const now = Date.now();

    // Check session ban
    const sessionBan = this.bannedSessions.get(sessionId);
    if (sessionBan) {
      if (sessionBan.duration === -1) {
        return { banned: true, reason: sessionBan.reason };
      }
      const elapsed = now - sessionBan.timestamp;
      if (elapsed < sessionBan.duration) {
        return { banned: true, reason: sessionBan.reason, remaining: sessionBan.duration - elapsed };
      }
      // Ban expired, remove it
      this.bannedSessions.delete(sessionId);
    }

    // Check IP ban
    if (ip && ip !== 'unknown') {
      const ipBan = this.bannedIPs.get(ip);
      if (ipBan) {
        if (ipBan.duration === -1) {
          return { banned: true, reason: ipBan.reason };
        }
        const elapsed = now - ipBan.timestamp;
        if (elapsed < ipBan.duration) {
          return { banned: true, reason: ipBan.reason, remaining: ipBan.duration - elapsed };
        }
        // Ban expired, remove it
        this.bannedIPs.delete(ip);
      }
    }

    return { banned: false };
  }

  /**
   * Load bans from persistent storage (P3.2)
   */
  private loadBans(): void {
    try {
      if (fs.existsSync(this.banFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.banFilePath, 'utf-8'));

        // Load session bans
        if (data.sessions) {
          for (const [id, entry] of Object.entries(data.sessions)) {
            this.bannedSessions.set(id, entry as BanEntry);
          }
        }

        // Load IP bans
        if (data.ips) {
          for (const [ip, entry] of Object.entries(data.ips)) {
            this.bannedIPs.set(ip, entry as BanEntry);
          }
        }

        // Clean up expired bans
        this.cleanupExpiredBans();

        console.log(`[SECURITY] Loaded ${this.bannedSessions.size} session bans, ${this.bannedIPs.size} IP bans`);
      }
    } catch (error) {
      console.error('[SECURITY] Failed to load bans:', error);
    }
  }

  /**
   * Save bans to persistent storage (P3.2)
   */
  private saveBans(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.banFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = {
        sessions: Object.fromEntries(this.bannedSessions),
        ips: Object.fromEntries(this.bannedIPs),
        lastUpdated: Date.now()
      };

      fs.writeFileSync(this.banFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SECURITY] Failed to save bans:', error);
    }
  }

  /**
   * Remove expired bans from memory (P3.2)
   */
  private cleanupExpiredBans(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.bannedSessions) {
      if (entry.duration !== -1 && now - entry.timestamp >= entry.duration) {
        this.bannedSessions.delete(id);
        cleaned++;
      }
    }

    for (const [ip, entry] of this.bannedIPs) {
      if (entry.duration !== -1 && now - entry.timestamp >= entry.duration) {
        this.bannedIPs.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SECURITY] Cleaned up ${cleaned} expired bans`);
      this.saveBans();
    }
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
      // Check if player is banned (P3.2)
      const clientIP = this.getClientIP(client);
      const banStatus = this.isBanned(client.sessionId, clientIP);
      if (banStatus.banned) {
        const remaining = banStatus.remaining
          ? ` (${Math.ceil(banStatus.remaining / 1000)}s remaining)`
          : ' (permanent)';
        console.log(`[SECURITY] Rejected banned player ${client.sessionId}${remaining}: ${banStatus.reason}`);
        client.send('banned', {
          reason: banStatus.reason,
          remaining: banStatus.remaining
        });
        client.leave(4001); // Custom close code for banned
        return;
      }

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