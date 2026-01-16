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
import { gameRoomLogger, securityLogger } from '../utils/logger.js';
import { getTelemetryService } from '../services/TelemetryService.js';

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
    gameRoomLogger.info({ options }, 'Room created');

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

    gameRoomLogger.info('Game loop started at 60Hz');
  }

  /**
   * Kick a player from the game due to security violation
   * Also records the ban for persistence (P3.2)
   */
  private kickPlayer(playerId: string, reason: string): void {
    const client = this.clients.find(c => c.sessionId === playerId);
    if (client) {
      securityLogger.warn({ playerId, reason }, 'Kicking player');

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
    securityLogger.warn({ sessionId, durationSeconds: banEntry.duration / 1000, violations: banEntry.violations }, 'Banned session');

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
      securityLogger.warn({ ip, durationSeconds: banEntry.duration / 1000 }, 'Banned IP');
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

        securityLogger.info({ sessionBans: this.bannedSessions.size, ipBans: this.bannedIPs.size }, 'Loaded bans');
      }
    } catch (error) {
      securityLogger.error({ err: error }, 'Failed to load bans');
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
      securityLogger.error({ err: error }, 'Failed to save bans');
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
      securityLogger.debug({ count: cleaned }, 'Cleaned up expired bans');
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

    // P4.2: Revival mechanic - start/stop reviving another player
    this.onMessage('start_revive', (client, message: { targetPlayerId: string }) => {
      this.handleStartReviveMessage(client, message);
    });

    this.onMessage('stop_revive', (client) => {
      this.handleStopReviveMessage(client);
    });
  }

  onJoin(client: Client, options: any) {
    gameRoomLogger.info({ playerId: client.sessionId }, 'Player joining');

    try {
      // Check if player is banned (P3.2)
      const clientIP = this.getClientIP(client);
      const banStatus = this.isBanned(client.sessionId, clientIP);
      if (banStatus.banned) {
        const remainingSeconds = banStatus.remaining ? Math.ceil(banStatus.remaining / 1000) : null;
        securityLogger.warn({ playerId: client.sessionId, remainingSeconds, reason: banStatus.reason }, 'Rejected banned player');
        client.send('banned', {
          reason: banStatus.reason,
          remaining: banStatus.remaining
        });
        client.leave(4001); // Custom close code for banned
        return;
      }

      // P3.1: Extract and sanitize nickname from options
      let nickname = '';
      if (options?.nickname && typeof options.nickname === 'string') {
        // Sanitize: trim, limit length, remove special characters
        nickname = options.nickname
          .trim()
          .slice(0, 16) // Max 16 characters
          .replace(/[<>&"'`]/g, ''); // Remove HTML-sensitive chars
      }

      // Generate spawn position near center with some spread
      const spawnRadius = Math.min(100, this.state.world.worldRadius * 0.2);
      const spawnPos = randomPointOnCircle(spawnRadius);

      // Add player to game state with nickname
      this.state.addPlayer(client.sessionId, spawnPos.x, spawnPos.y, nickname);

      // Initialize client data
      this.clientData.set(client.sessionId, {
        inputBuffer: [],
        lastProcessedSequence: 0,
        joinTime: Date.now()
      });

      // Recalculate world size
      this.recalculateWorldSize();

      gameRoomLogger.info({ playerId: client.sessionId, x: spawnPos.x, y: spawnPos.y }, 'Player spawned');

      // Update world state
      this.state.world.playerCount = this.state.players.size;

      // Send game_info AFTER the state has been broadcast
      setImmediate(() => {
        client.send('game_info', {
          playerId: client.sessionId,
          worldRadius: this.state.world.worldRadius,
          playerCount: this.state.world.playerCount
        });
      });

    } catch (error) {
      gameRoomLogger.error({ err: error, playerId: client.sessionId }, 'Error during player join');
      client.error(500, 'Failed to join game');
    }
  }

  onLeave(client: Client, consented?: boolean) {
    gameRoomLogger.info({ playerId: client.sessionId, consented }, 'Player leaving');

    try {
      // Remove player from game state
      this.state.removePlayer(client.sessionId);

      // Clean up client data
      this.clientData.delete(client.sessionId);

      // Clean up input system data
      this.inputSystem.cleanupPlayer(client.sessionId);

      // Recalculate world size
      this.recalculateWorldSize();

      gameRoomLogger.info({ playerId: client.sessionId, playersRemaining: this.state.world.playerCount }, 'Player removed');

    } catch (error) {
      gameRoomLogger.error({ err: error, playerId: client.sessionId }, 'Error during player leave');
    }
  }


  onDispose() {
    gameRoomLogger.info('Room disposing');

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

    gameRoomLogger.info('Room disposed');
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

      // Send level_up messages to clients with pending upgrades (BUG-002 fix)
      this.notifyLevelUps();

      // Send player_died messages to clients who just died (BUG-003 fix)
      this.notifyPlayerDeaths();

    } catch (error) {
      gameRoomLogger.error({ err: error }, 'Error in game loop');
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

        // Update sequence tracking (BUG-027 FIX: sync to player schema for client reconciliation)
        if (input.sequence > clientData.lastProcessedSequence) {
          clientData.lastProcessedSequence = input.sequence;
          // Sync to player schema so client receives it for prediction reconciliation
          player.lastProcessedSequence = clientData.lastProcessedSequence;
        }

        // Process input through input system
        this.inputSystem.processInput(player, input, deltaTime);
      }
    });
  }

  private rebuildSpatialHash() {
    this.spatialHash.clear();

    // Insert all entities into spatial hash
    this.state.players.forEach(player => {
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

    this.state.enemies.forEach(enemy => {
      this.spatialHash.insert({
        id: enemy.id,
        x: enemy.x,
        y: enemy.y,
        type: 'enemy',
        entity: enemy
      });
    });

    this.state.projectiles.forEach(projectile => {
      this.spatialHash.insert({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        type: 'projectile',
        entity: projectile
      });
    });

    this.state.xpOrbs.forEach(orb => {
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
    this.state.players.forEach(player => {
      if (!player.dead) {
        // Update time alive
        player.timeAlive += deltaTime;

        // Update invulnerability timer
        if (player.invulnerableTime > 0) {
          player.invulnerableTime = Math.max(0, player.invulnerableTime - deltaTime);
        }

        // Decay hostility over time (BUG-008 fix: use constant instead of hardcoded value)
        if (player.hostility > 0) {
          player.hostility = Math.max(0, player.hostility - deltaTime * GAME_CONSTANTS.HOSTILITY_DECAY_RATE);
        }
      } else {
        // P4.2: Update revival cooldown for dead players
        if (player.revivalCooldown > 0) {
          player.revivalCooldown = Math.max(0, player.revivalCooldown - deltaTime);
        }
      }
    });

    // P4.2: Process revival progress for players being revived
    this.processRevivalProgress(deltaTime);
  }

  /**
   * P4.2: Process revival mechanics - update revival progress for players being revived
   */
  private processRevivalProgress(deltaTime: number) {
    this.state.players.forEach(deadPlayer => {
      if (!deadPlayer.dead) return;

      // If being actively revived
      if (deadPlayer.revivingPlayerId) {
        // Find the player doing the reviving
        const reviver = this.state.players.get(deadPlayer.revivingPlayerId);
        if (!reviver || reviver.dead) {
          // Reviver is no longer valid, reset revival progress
          deadPlayer.revivingPlayerId = '';
          deadPlayer.revivalProgress = 0;
          return;
        }

        // Check if reviver is still in range
        const distance = Math.sqrt(
          (reviver.x - deadPlayer.x) ** 2 + (reviver.y - deadPlayer.y) ** 2
        );

        if (distance > GAME_CONSTANTS.REVIVAL_RADIUS) {
          // Reviver moved out of range, reset progress
          deadPlayer.revivingPlayerId = '';
          deadPlayer.revivalProgress = 0;
          return;
        }

        // Increment revival progress
        deadPlayer.revivalProgress += deltaTime / GAME_CONSTANTS.REVIVAL_TIME;

        // Check if revival is complete
        if (deadPlayer.revivalProgress >= 1) {
          this.completeRevival(deadPlayer, reviver);
        }
      } else if (deadPlayer.revivalProgress > 0) {
        // Decay progress when not being revived (lose progress at 50% rate)
        deadPlayer.revivalProgress = Math.max(0, deadPlayer.revivalProgress - deltaTime / (GAME_CONSTANTS.REVIVAL_TIME * 2));
      }
    });
  }

  /**
   * P4.2: Complete the revival of a dead player
   */
  private completeRevival(deadPlayer: any, reviver: any) {
    // Revive the player (keeps level, weapons, etc.)
    deadPlayer.revive();

    gameRoomLogger.info({
      revivedPlayerId: deadPlayer.id,
      reviverId: reviver.id
    }, 'Player revived by teammate');

    // Notify both clients
    const revivedClient = this.clients.find(c => c.sessionId === deadPlayer.id);
    const reviverClient = this.clients.find(c => c.sessionId === reviver.id);

    if (revivedClient) {
      revivedClient.send('revived', {
        revivedBy: reviver.id,
        reviverNickname: reviver.nickname || `Player ${reviver.id.slice(0, 4)}`
      });
    }

    if (reviverClient) {
      reviverClient.send('revival_complete', {
        revivedPlayerId: deadPlayer.id,
        revivedNickname: deadPlayer.nickname || `Player ${deadPlayer.id.slice(0, 4)}`
      });
    }
  }

  /**
   * Notify clients when their player has leveled up and has pending upgrade choices (BUG-002 fix)
   */
  private notifyLevelUps(): void {
    this.state.players.forEach((player, playerId) => {
      // Check if player has pending upgrade with choices that haven't been notified yet
      if (player.pendingUpgrade && player.pendingChoices && player.pendingChoices.length > 0) {
        const client = this.clients.find(c => c.sessionId === playerId);
        if (client) {
          // Send level_up message with upgrade choices
          client.send('level_up', {
            newLevel: player.level,
            choices: player.pendingChoices
          });

          gameRoomLogger.debug({ playerId, choiceCount: player.pendingChoices.length }, 'Sent level_up');

          // Clear choices after sending to prevent re-sending
          // Note: player.pendingUpgrade stays true until they choose an upgrade
          player.pendingChoices = [];
        }
      }
    });
  }

  /**
   * Notify clients when their player has died (BUG-003 fix)
   */
  private notifyPlayerDeaths(): void {
    this.state.players.forEach((player, playerId) => {
      // Check if player just died (dead=true but deathTime is very recent - within last 100ms)
      if (player.dead && player.deathTime > 0) {
        const timeSinceDeath = Date.now() - player.deathTime;

        // Only send once, right after death (within 100ms window)
        if (timeSinceDeath < 100) {
          const client = this.clients.find(c => c.sessionId === playerId);
          if (client) {
            client.send('player_died', {
              playerId: player.id,
              killedBy: player.killedBy || 'unknown',
              finalScore: {
                kills: player.kills,
                timeAlive: player.timeAlive,
                level: player.level
              }
            });

            gameRoomLogger.debug({ playerId, killedBy: player.killedBy }, 'Sent player_died');

            // P2.10: Record session telemetry for balance analysis
            const telemetry = getTelemetryService();
            const weaponsUsed: string[] = [];
            player.weapons.forEach(weapon => {
              weaponsUsed.push(weapon.type);
            });
            telemetry.recordSession({
              playerId: player.id,
              survivalTime: player.timeAlive,
              kills: player.kills,
              levelReached: player.level,
              waveReached: this.state.world.currentWave,
              weaponsUsed
            });

            // BUG-020 FIX: Clear deathTime after sending notification to prevent duplicates
            // Previously this could fire multiple times within the 100ms window
            player.deathTime = 0;
          }
        }
      }
    });
  }

  private handleInputMessage(client: Client, message: InputMessage) {
    const clientData = this.clientData.get(client.sessionId);
    if (!clientData) {
      gameRoomLogger.warn({ playerId: client.sessionId }, 'No client data for input');
      return;
    }

    // Validate input structure
    if (!message || !message.input || typeof message.input.dx !== 'number' || typeof message.input.dy !== 'number') {
      gameRoomLogger.warn({ playerId: client.sessionId, message }, 'Invalid input');
      return;
    }

    // Prevent input buffer overflow
    if (clientData.inputBuffer.length >= 10) {
      gameRoomLogger.debug({ playerId: client.sessionId }, 'Input buffer overflow, dropping oldest');
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
      gameRoomLogger.warn({ playerId: client.sessionId }, 'Invalid upgrade request');
      return;
    }

    // Validate upgrade choice structure
    if (!message.choice || !message.choice.type) {
      gameRoomLogger.warn({ playerId: client.sessionId, message }, 'Invalid upgrade choice');
      return;
    }

    // Apply upgrade through XP system
    const success = this.xpSystem.applyUpgrade(this.state, client.sessionId, message.choice);

    if (success) {
      // P2.10: Record upgrade choice telemetry for balance analysis
      const telemetry = getTelemetryService();
      telemetry.recordUpgradeChoice({
        playerId: client.sessionId,
        type: message.choice.type,
        target: message.choice.weaponType || message.choice.statType || 'unknown',
        playerLevel: player.level
      });

      // Send confirmation to client
      client.send('upgrade_applied', {
        choice: message.choice,
        playerLevel: player.level
      });
    } else {
      gameRoomLogger.warn({ playerId: client.sessionId, choice: message.choice }, 'Failed to apply upgrade');
    }
  }

  private handleRespawnMessage(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.dead) {
      gameRoomLogger.warn({ playerId: client.sessionId }, 'Invalid respawn request');
      return;
    }

    // Clean up any projectiles owned by this player (e.g., Bible orbs)
    const toRemove: string[] = [];
    this.state.projectiles.forEach((proj, id) => {
      if (proj.ownerId === client.sessionId) {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => this.state.removeProjectile(id));

    // Generate new spawn position
    const spawnRadius = Math.min(100, this.state.world.worldRadius * 0.2);
    const spawnPos = randomPointOnCircle(spawnRadius);

    // Respawn player
    player.respawn(spawnPos.x, spawnPos.y);

    gameRoomLogger.info({ playerId: client.sessionId, x: spawnPos.x, y: spawnPos.y }, 'Player respawned');

    // Send respawn confirmation
    client.send('respawn_complete', {
      x: spawnPos.x,
      y: spawnPos.y
    });
  }

  /**
   * P4.2: Handle start revive message - alive player starts reviving a dead teammate
   */
  private handleStartReviveMessage(client: Client, message: { targetPlayerId: string }) {
    const reviver = this.state.players.get(client.sessionId);
    if (!reviver || reviver.dead) {
      gameRoomLogger.warn({ playerId: client.sessionId }, 'Dead player cannot revive');
      return;
    }

    const targetPlayer = this.state.players.get(message.targetPlayerId);
    if (!targetPlayer || !targetPlayer.dead) {
      gameRoomLogger.warn({ playerId: client.sessionId, targetId: message.targetPlayerId }, 'Target cannot be revived');
      return;
    }

    // Check if target can be revived (not on cooldown)
    if (!targetPlayer.canBeRevived) {
      client.send('revive_failed', {
        reason: 'cooldown',
        remainingCooldown: targetPlayer.revivalCooldown
      });
      return;
    }

    // Check if reviver is in range
    const distance = Math.sqrt(
      (reviver.x - targetPlayer.x) ** 2 + (reviver.y - targetPlayer.y) ** 2
    );

    if (distance > GAME_CONSTANTS.REVIVAL_RADIUS) {
      client.send('revive_failed', {
        reason: 'out_of_range',
        distance,
        requiredDistance: GAME_CONSTANTS.REVIVAL_RADIUS
      });
      return;
    }

    // Check if someone else is already reviving this player
    if (targetPlayer.revivingPlayerId && targetPlayer.revivingPlayerId !== client.sessionId) {
      client.send('revive_failed', {
        reason: 'already_being_revived'
      });
      return;
    }

    // Start the revival process
    targetPlayer.revivingPlayerId = client.sessionId;
    // Don't reset progress if continuing from before
    if (targetPlayer.revivalProgress === 0 || targetPlayer.revivingPlayerId !== client.sessionId) {
      targetPlayer.revivalProgress = 0;
    }

    gameRoomLogger.debug({
      reviverId: client.sessionId,
      targetId: message.targetPlayerId
    }, 'Revival started');
  }

  /**
   * P4.2: Handle stop revive message - player stopped holding revive button
   */
  private handleStopReviveMessage(client: Client) {
    // Find any player being revived by this client and cancel
    this.state.players.forEach(player => {
      if (player.dead && player.revivingPlayerId === client.sessionId) {
        // Don't fully reset progress - decay it slowly instead
        // This allows players to briefly let go without losing all progress
        player.revivingPlayerId = '';
        // Progress will naturally decay to 0 if not continued

        gameRoomLogger.debug({
          reviverId: client.sessionId,
          targetId: player.id,
          lostProgress: player.revivalProgress
        }, 'Revival stopped');
      }
    });
  }

  private recalculateWorldSize() {
    // Count living players (use .size for MapSchema, not Object.keys)
    const playerCount = this.state.players.size;

    // Update world state
    this.state.world.playerCount = playerCount;
    this.state.world.recalculateSize(playerCount);

    gameRoomLogger.debug({ worldRadius: this.state.world.worldRadius, playerCount }, 'World size updated');
  }

  // Public methods for monitoring and debugging
  getRoomStats(): Record<string, unknown> {
    return {
      playerCount: this.state.world.playerCount,
      enemyCount: this.state.enemies.size,
      projectileCount: this.state.projectiles.size,
      xpOrbCount: this.state.xpOrbs.size,
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