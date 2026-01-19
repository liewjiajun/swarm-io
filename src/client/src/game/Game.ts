import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { Interpolator } from './Interpolator';
import { NetworkClient, SerializedGameState } from '../network';
import { HUD } from '../ui';
import { AudioManager } from '../audio';
import type { PlayerInput, WeaponType } from '@swarm-io/shared';
import { gameLogger as logger } from '../utils/logger';

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private interpolator: Interpolator;
  private network: NetworkClient;
  private hud: HUD;
  private audio: AudioManager;

  private localPlayerId: string = '';
  private lastUpdateTime: number = 0;
  private running: boolean = false;
  private connected: boolean = false;
  private inputSequence: number = 0;
  private paused: boolean = false;
  private playerNickname: string = ''; // P3.1: Store player nickname
  private playerClass: string = 'survivor'; // P9.3: Store player class

  // BUG-011 FIX: Throttle input sending to match server rate limit (30Hz)
  // Previously game sent 60Hz inputs but NetworkClient dropped 50% due to rate limiting
  private lastInputSendTime: number = 0;
  private readonly INPUT_SEND_INTERVAL: number = 1000 / 30; // 30Hz = ~33.33ms

  // Track state for audio/visual event detection
  private lastPlayerHealth: number = 100;
  private lastProjectileCount: number = 0;
  private lastXpOrbIds: Set<string> = new Set();
  private lastEnemyIds: Set<string> = new Set();
  private knownProjectileIds: Set<string> = new Set();
  private lastEnemyPositions: Map<string, { x: number; y: number; type: string }> = new Map();

  // Track boss presence for music switching
  private bossPresent: boolean = false;
  private lastBossPresent: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.interpolator = new Interpolator();
    this.network = new NetworkClient();
    this.hud = new HUD();
    this.audio = new AudioManager();

    // Connect HUD settings to AudioManager
    this.setupAudioSettings();

    // Setup pause key handler
    this.setupPauseHandler();
  }

  /**
   * Sets up the P key handler for pausing the game
   */
  private setupPauseHandler(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') {
        if (this.running && !this.paused) {
          this.pause();
        } else if (this.paused) {
          this.resume();
        }
      }
    });
  }

  /**
   * Pauses the game
   */
  private pause(): void {
    if (!this.running || this.paused) return;

    this.paused = true;
    this.hud.showPause(
      () => this.resume(),
      () => {} // Settings callback is handled by HUD
    );
    logger.debug('Paused');
  }

  /**
   * Resumes the game from pause
   */
  private resume(): void {
    if (!this.paused) return;

    this.paused = false;
    this.hud.hidePause();
    this.lastUpdateTime = performance.now(); // Reset delta time to prevent time jump
    logger.debug('Resumed');
  }

  /**
   * Sets up the audio settings callback between HUD and AudioManager
   */
  private setupAudioSettings(): void {
    // Set initial audio settings in HUD
    this.hud.updateAudioSettings({
      masterVolume: this.audio.getMasterVolume(),
      sfxVolume: this.audio.getSfxVolume(),
      musicVolume: this.audio.getMusicVolume(),
      muted: false
    });

    // Set callback to update AudioManager when settings change
    this.hud.setAudioSettingsCallback((settings) => {
      this.audio.setMasterVolume(settings.masterVolume);
      this.audio.setSfxVolume(settings.sfxVolume);
      this.audio.setMusicVolume(settings.musicVolume);
      this.audio.setMuted(settings.muted);
    });

    // Set callback to update Renderer CRT effect when toggled (P1.10)
    this.hud.setCRTSettingsCallback((enabled) => {
      this.renderer.setCRTEnabled(enabled);
    });

    // Set UI sound callbacks for button interactions (P2.A8)
    this.hud.setUISoundCallbacks({
      playClick: () => this.audio.playUIClick(),
      playHover: () => this.audio.playUIHover(),
      playModalOpen: () => this.audio.playModalOpen(),
      playModalClose: () => this.audio.playModalClose(),
      playUpgradeSelect: () => this.audio.playUpgradeSelect(),
    });
  }

  async start() {
    logger.info('Starting SWARM.IO client');

    // Initialize sprite mode (P1.1/P1.2 integration)
    // This loads sprite assets while tutorial is displayed
    // Falls back to procedural rendering if assets are missing
    this.renderer.initSpriteMode().then((success) => {
      if (success) {
        logger.info('Sprite mode initialized successfully');
      } else {
        logger.info('Using procedural rendering (sprite assets not available)');
      }
    });

    // P3.1 + P9.3: Show nickname modal first, then class selection, then tutorial
    // Load stored nickname if available for returning players
    const storedNickname = this.hud.getStoredNickname();
    const _storedClass = this.hud.getStoredPlayerClass();

    if (storedNickname) {
      // Returning player - use stored nickname
      this.playerNickname = storedNickname;
      // Show class selection (they may want to change class)
      this.hud.showClassSelectionModal((classId) => {
        this.playerClass = classId;
        this.hud.showTutorialIfFirstTime(() => {
          this.startGameConnection();
        });
      });
    } else {
      // First time player - show nickname modal first
      this.hud.showNicknameModal((nickname) => {
        this.playerNickname = nickname;
        // Then show class selection
        this.hud.showClassSelectionModal((classId) => {
          this.playerClass = classId;
          this.hud.showTutorialIfFirstTime(() => {
            this.startGameConnection();
          });
        });
      });
    }
  }

  /**
   * Initiates the network connection and starts the game loop
   * P3.1 + P9.3: Now passes the player's nickname and class when connecting
   */
  private async startGameConnection() {
    try {
      // Setup network event handlers BEFORE connecting
      // This ensures we don't miss the initial state update
      this.setupNetworkHandlers();

      // Connect to server with nickname and class (P3.1 + P9.3)
      await this.network.connect(this.playerNickname, this.playerClass);
      this.localPlayerId = this.network.sessionId;
      this.connected = true;

      logger.info({ playerId: this.localPlayerId, nickname: this.playerNickname, playerClass: this.playerClass }, 'Connected');

      // Start gameplay music
      this.audio.playMusic('gameplay');

      // Start game loop
      this.running = true;
      this.lastUpdateTime = performance.now();
      this.gameLoop();

    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to connect to server');
      // Fall back to mock state for testing
      this.setupMockState();
      // Start gameplay music even in mock mode
      this.audio.playMusic('gameplay');
      this.running = true;
      this.lastUpdateTime = performance.now();
      this.gameLoop();
    }
  }

  private setupNetworkHandlers() {
    // Handle state updates from server
    this.network.onStateChange((state: SerializedGameState) => {
      // BUG-019 FIX: Removed high-frequency log that was causing 10,000+ messages
      this.interpolator.pushState(this.convertToRenderState(state), performance.now());

      // BUG-027 FIX (IMPROVED): Reconcile client prediction with authoritative server state
      // Key fix: Use FRESH server state (localPlayerState.x/y), not interpolated state
      // This ensures we start from the authoritative position the server sent
      const localPlayerState = state.players.get(this.localPlayerId);
      if (localPlayerState && localPlayerState.lastProcessedSequence > 0) {
        // Reconcile using fresh server position and re-apply unacknowledged inputs
        const reconciledPos = this.input.reconcile(
          localPlayerState.x,
          localPlayerState.y,
          localPlayerState.speed,
          localPlayerState.lastProcessedSequence
        );

        // Update the local player in the interpolator with reconciled position
        const localPlayer = this.interpolator.getLocalPlayer(this.localPlayerId);
        if (localPlayer) {
          localPlayer.x = reconciledPos.x;
          localPlayer.y = reconciledPos.y;
        }
      }
    });

    // Handle player death
    this.network.onPlayerDied((data) => {
      if (data.playerId === this.localPlayerId) {
        logger.info({ finalScore: data.finalScore }, 'Local player died');
        // Play death sound
        this.audio.playDeathSound();
        // Get player stats from the last known state
        const state = this.interpolator.getInterpolatedState(performance.now() - 100);
        const player = state.players.get(this.localPlayerId);

        // P3.2d: Calculate score and gather leaderboard data
        const calculateScore = (p: { kills: number; timeAlive: number; level: number }) => {
          return (p.kills * 100) + Math.floor(p.timeAlive * 10) + (p.level * 50);
        };

        // Get all players and sort by score for ranking
        const allPlayers = Array.from(state.players.values())
          .map(p => ({
            id: p.id,
            name: p.nickname || `Player`,
            kills: p.kills || 0,
            timeAlive: p.timeAlive || 0,
            level: p.level || 1,
            score: calculateScore({ kills: p.kills || 0, timeAlive: p.timeAlive || 0, level: p.level || 1 }),
            dead: p.dead
          }))
          .sort((a, b) => b.score - a.score);

        // Find local player's rank (include dead players in ranking)
        const localPlayerRank = allPlayers.findIndex(p => p.id === this.localPlayerId) + 1;

        // Get top 5 players for end-of-game leaderboard (include all players, even dead)
        const topPlayers = allPlayers.slice(0, 5).map(p => ({
          name: p.id === this.localPlayerId ? (p.name || 'YOU') : p.name,
          score: p.score,
          kills: p.kills
        }));

        const stats = {
          kills: player?.kills || 0,
          timeAlive: player?.timeAlive || 0,
          level: player?.level || 1,
          score: calculateScore({ kills: player?.kills || 0, timeAlive: player?.timeAlive || 0, level: player?.level || 1 }),
          rank: localPlayerRank || allPlayers.length,
          totalPlayers: allPlayers.length,
          topPlayers
        };
        this.hud.showDeathScreen(stats, () => this.respawn());
      }
    });

    // Handle level up with upgrade choices
    this.network.onLevelUp((data) => {
      logger.info({ newLevel: data.newLevel, choiceCount: data.choices.length }, 'Level up');
      // Play level up sound and flash
      this.audio.playLevelUpSound();
      this.renderer.triggerLevelUpFlash();
      // Store choices so we can look them up by ID when the user selects
      const choiceMap = new Map(data.choices.map(c => [c.id, c]));
      this.hud.showUpgradeUI(data.choices, (choiceId: string) => {
        const choice = choiceMap.get(choiceId);
        if (choice) {
          this.network.sendUpgradeChoice(choice);
        }
      });
    });

    logger.debug('Network handlers setup complete');
  }

  private convertToRenderState(state: SerializedGameState): any {
    // Convert SerializedGameState to the format expected by Interpolator/Renderer
    // The Renderer expects PlayerState interface but we have SerializedPlayer
    const players = new Map();
    state.players.forEach((player, id) => {
      players.set(id, {
        id: player.id,
        nickname: player.nickname || '', // P3.1: Include nickname
        x: player.x,
        y: player.y,
        health: player.health,
        maxHealth: player.maxHealth,
        level: player.level,
        xp: player.xp,
        xpToNextLevel: player.xpToNextLevel,
        speed: player.speed,
        invulnerable: player.invulnerableTime > 0,
        invulnerableTime: player.invulnerableTime,
        timeAlive: player.timeAlive,
        hostility: 0,
        facing: { x: player.facingX, y: player.facingY },
        facingX: player.facingX,
        facingY: player.facingY,
        weapons: player.weapons,
        kills: player.kills,
        dead: player.dead,
        pendingUpgrade: player.pendingUpgrade
      });
    });

    const enemies = new Map();
    state.enemies.forEach((enemy, id) => {
      enemies.set(id, {
        id: enemy.id,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        targetPlayerId: null,
        velocityX: 0,
        velocityY: 0
      });
    });

    const projectiles = new Map();
    state.projectiles.forEach((proj, id) => {
      projectiles.set(id, {
        id: proj.id,
        type: proj.type,
        x: proj.x,
        y: proj.y,
        radius: proj.radius,
        ownerId: '',
        damage: 0,
        velocityX: 0,
        velocityY: 0,
        lifetime: 1,
        piercing: 0,
        hitEnemies: []
      });
    });

    const xpOrbs = new Map();
    state.xpOrbs.forEach((orb, id) => {
      xpOrbs.set(id, {
        id: orb.id,
        x: orb.x,
        y: orb.y,
        size: orb.size,
        value: orb.value,
        magnetized: orb.magnetized,
        targetPlayerId: null
      });
    });

    // P5.2: Power-ups
    const powerUps = new Map();
    state.powerUps?.forEach((powerUp, id) => {
      powerUps.set(id, {
        id: powerUp.id,
        type: powerUp.type,
        x: powerUp.x,
        y: powerUp.y,
        spawnTime: powerUp.spawnTime,
        lifetime: powerUp.lifetime
      });
    });

    // BUG-048 FIX: P5.1 World events
    const worldEvents = new Map();
    state.worldEvents?.forEach((event, id) => {
      worldEvents.set(id, {
        id: event.id,
        type: event.type,
        x: event.x,
        y: event.y,
        radius: event.radius,
        startTime: event.startTime,
        duration: event.duration,
        active: event.active,
        intensity: event.intensity,
        spawnedCount: event.spawnedCount,
        xpMultiplier: event.xpMultiplier
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
        difficulty: state.world.difficulty
      }
    };
  }

  private setupMockState() {
    // Create a simple mock state for testing the renderer without network
    logger.info('Using mock state (offline mode)');
    this.localPlayerId = 'test-player';

    const mockState = {
      players: new Map([
        [this.localPlayerId, {
          id: this.localPlayerId,
          nickname: this.playerNickname || 'Test Player', // P3.1: Include nickname
          x: 0,
          y: 0,
          health: 100,
          maxHealth: 100,
          level: 1,
          xp: 0,
          xpToNextLevel: 100,
          speed: 5,
          invulnerableTime: 0,
          timeAlive: 0,
          hostility: 0,
          facingX: 1,
          facingY: 0,
          weapons: [{ type: 'knife', level: 1, cooldownRemaining: 0, evolved: false, evolvedType: '' }],
          kills: 0,
          dead: false,
          pendingUpgrade: false,
          armor: 0,
          magnetRange: 5
        }]
      ]),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: {
        worldRadius: 500,
        playerCount: 1,
        gameTime: 0,
        currentWave: 1,
        difficulty: 1
      }
    };

    this.interpolator.pushState(mockState, performance.now());
  }

  private gameLoop() {
    if (!this.running) return;

    // Continue the loop but skip updates when paused
    if (!this.paused) {
      const now = performance.now();
      const dt = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;

      this.update(dt);
      this.render();
    }

    requestAnimationFrame(() => this.gameLoop());
  }

  private update(dt: number) {
    // Get raw input from keyboard/touch (does not store or assign sequence)
    const rawInput = this.input.getRawInput();

    // BUG-011 FIX: Throttle input sending to 30Hz to match server rate limit
    // This prevents creating inputs that NetworkClient will immediately drop
    const now = performance.now();
    if ((rawInput.dx !== 0 || rawInput.dy !== 0) && this.connected) {
      if (now - this.lastInputSendTime >= this.INPUT_SEND_INTERVAL) {
        this.inputSequence++;
        const input: PlayerInput = {
          dx: rawInput.dx,
          dy: rawInput.dy,
          sequence: this.inputSequence
        };

        // Send input to server
        this.network.sendInput(input);

        // Store pending input for reconciliation with actual delta time
        // This ensures reconciliation uses the same dt as the original prediction
        this.input.storePendingInput(input, dt);

        this.lastInputSendTime = now;
      }
    }

    // Apply client-side prediction for local player (runs every frame for smooth movement)
    const localPlayer = this.interpolator.getLocalPlayer(this.localPlayerId);
    if (localPlayer) {
      this.input.applyPrediction(localPlayer, rawInput, dt);
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

    // Process audio events based on state changes
    this.processAudioEvents(state, localPlayer);

    // Render all entities
    this.renderer.render(state, this.localPlayerId);

    // Update HUD with current state (P3.3: Now includes enemies for minimap enhancements)
    this.hud.update(localPlayer, state.world, state.players, this.localPlayerId, state.enemies);
  }

  /**
   * Detect state changes and play appropriate audio
   * Compares current state with previous frame to detect:
   * - New projectiles (weapon fired)
   * - Removed XP orbs (collected)
   * - Removed enemies (killed)
   * - Player health decrease (damage taken)
   */
  private processAudioEvents(state: any, localPlayer: any): void {
    // Detect player damage
    if (localPlayer) {
      if (localPlayer.health < this.lastPlayerHealth && this.lastPlayerHealth > 0) {
        this.audio.playPlayerDamageSound();
        // P9.7: Screen shake when player takes damage
        this.renderer.triggerHitShake();
      }
      this.lastPlayerHealth = localPlayer.health;
    }

    // Detect new projectiles (weapon fired) - only from local player
    const currentProjectileIds = new Set<string>();
    state.projectiles.forEach((proj: any, id: string) => {
      currentProjectileIds.add(id);

      // If this is a new projectile we haven't seen
      if (!this.knownProjectileIds.has(id)) {
        // Try to determine weapon type from projectile type
        const weaponType = this.getWeaponTypeFromProjectile(proj.type);
        if (weaponType) {
          this.audio.playWeaponSound(weaponType);
        }
      }
    });
    this.knownProjectileIds = currentProjectileIds;

    // Detect XP orb collection (orbs that disappeared while player nearby)
    const currentXpOrbIds = new Set<string>();
    state.xpOrbs.forEach((_orb: any, id: string) => {
      currentXpOrbIds.add(id);
    });

    // Check for removed orbs (collected)
    this.lastXpOrbIds.forEach(id => {
      if (!currentXpOrbIds.has(id)) {
        // Orb was removed - likely collected
        this.audio.playPickupSound('small'); // Default to small sound
      }
    });
    this.lastXpOrbIds = currentXpOrbIds;

    // Detect enemy deaths and spawn explosions
    const currentEnemyIds = new Set<string>();
    state.enemies.forEach((enemy: any, id: string) => {
      currentEnemyIds.add(id);
      // Track position for death explosion
      this.lastEnemyPositions.set(id, { x: enemy.x, y: enemy.y, type: enemy.type });
    });

    // Check for removed enemies (killed)
    let enemiesKilled = 0;
    let bossKilled = false;
    this.lastEnemyIds.forEach(id => {
      if (!currentEnemyIds.has(id)) {
        enemiesKilled++;
        // Spawn death explosion at last known position
        const lastPos = this.lastEnemyPositions.get(id);
        if (lastPos) {
          this.renderer.spawnDeathExplosion(lastPos.x, lastPos.y, lastPos.type);
          // P9.7: Check if boss was killed for larger shake
          if (lastPos.type.startsWith('boss_')) {
            bossKilled = true;
          }
          this.lastEnemyPositions.delete(id);
        }
      }
    });

    // Play enemy death sound (limit to avoid audio spam)
    if (enemiesKilled > 0 && enemiesKilled <= 3) {
      this.audio.playEnemyDeathSound();
    }

    // P9.7: Screen shake on enemy kills
    if (bossKilled) {
      // Large shake for boss kills
      this.renderer.triggerBossShake();
    } else if (enemiesKilled > 0) {
      // Medium shake for regular kills (scale slightly with kill count)
      this.renderer.triggerKillShake();
    }
    this.lastEnemyIds = currentEnemyIds;

    // Clean up position tracking for removed enemies
    this.lastEnemyPositions.forEach((_, id) => {
      if (!currentEnemyIds.has(id)) {
        this.lastEnemyPositions.delete(id);
      }
    });

    // Detect boss presence for music switching
    this.bossPresent = false;
    state.enemies.forEach((enemy: any) => {
      if (enemy.type.startsWith('boss_')) {
        this.bossPresent = true;
      }
    });

    // Switch music based on boss presence
    if (this.bossPresent && !this.lastBossPresent) {
      // Boss just spawned - play warning and switch to boss music
      this.audio.playBossWarning();
      // Delay music switch until after warning sound
      setTimeout(() => {
        if (this.bossPresent) {
          this.audio.playMusic('boss');
        }
      }, 1500);
    } else if (!this.bossPresent && this.lastBossPresent) {
      // Boss defeated - switch back to gameplay music
      this.audio.playMusic('gameplay');
    }
    this.lastBossPresent = this.bossPresent;
  }

  /**
   * Map projectile type to weapon type for audio
   */
  private getWeaponTypeFromProjectile(projectileType: string): WeaponType | null {
    const mapping: Record<string, WeaponType> = {
      'slash': 'knife',
      'bullet': 'wand',
      'orb': 'bible',
      'lightning_bolt': 'lightning',
      'axe_spin': 'axe',
      'fireball': 'fireball',
      'explosion': 'fireball', // Explosion is part of fireball
    };
    return mapping[projectileType] || null;
  }

  stop() {
    this.running = false;
    if (this.connected) {
      this.network.disconnect();
      this.connected = false;
    }
    this.input.destroy();
    this.hud.destroy();
    this.audio.destroy();
    logger.info('Stopped');
  }

  // Public method to handle respawn
  respawn() {
    logger.debug({ connected: this.connected }, 'Respawn requested');
    if (this.connected) {
      logger.info('Sending respawn message to server');
      this.network.sendRespawn();
    }
  }
}
