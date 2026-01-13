import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { Interpolator } from './Interpolator';
import { NetworkClient, SerializedGameState } from '../network';
import { HUD } from '../ui';
import { AudioManager } from '../audio';
import type { PlayerInput, WeaponType } from '@swarm-io/shared';

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
    console.log('[Game] Paused');
  }

  /**
   * Resumes the game from pause
   */
  private resume(): void {
    if (!this.paused) return;

    this.paused = false;
    this.hud.hidePause();
    this.lastUpdateTime = performance.now(); // Reset delta time to prevent time jump
    console.log('[Game] Resumed');
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
  }

  async start() {
    console.log('[Game] Starting SWARM.IO client...');

    // Show tutorial for first-time players
    this.hud.showTutorialIfFirstTime(() => {
      this.startGameConnection();
    });
  }

  /**
   * Initiates the network connection and starts the game loop
   */
  private async startGameConnection() {
    try {
      // Setup network event handlers BEFORE connecting
      // This ensures we don't miss the initial state update
      this.setupNetworkHandlers();

      // Connect to server
      await this.network.connect();
      this.localPlayerId = this.network.sessionId;
      this.connected = true;

      console.log('[Game] Connected with player ID:', this.localPlayerId);

      // Start game loop
      this.running = true;
      this.lastUpdateTime = performance.now();
      this.gameLoop();

    } catch (error) {
      console.error('[Game] Failed to connect to server:', error);
      // Fall back to mock state for testing
      this.setupMockState();
      this.running = true;
      this.lastUpdateTime = performance.now();
      this.gameLoop();
    }
  }

  private setupNetworkHandlers() {
    // Handle state updates from server
    this.network.onStateChange((state: SerializedGameState) => {
      console.log('[Game] State received, players:', state.players.size);
      this.interpolator.pushState(this.convertToRenderState(state), performance.now());
    });

    // Handle player death
    this.network.onPlayerDied((data) => {
      if (data.playerId === this.localPlayerId) {
        console.log('[Game] Local player died. Final score:', data.finalScore);
        // Play death sound
        this.audio.playDeathSound();
        // Get player stats from the last known state
        const state = this.interpolator.getInterpolatedState(performance.now() - 100);
        const player = state.players.get(this.localPlayerId);
        const stats = {
          kills: player?.kills || 0,
          timeAlive: player?.timeAlive || 0,
          level: player?.level || 1
        };
        this.hud.showDeathScreen(stats, () => this.respawn());
      }
    });

    // Handle level up with upgrade choices
    this.network.onLevelUp((data) => {
      console.log('[Game] Level up! New level:', data.newLevel);
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

    console.log('[Game] Network handlers setup complete');
  }

  private convertToRenderState(state: SerializedGameState): any {
    // Convert SerializedGameState to the format expected by Interpolator/Renderer
    // The Renderer expects PlayerState interface but we have SerializedPlayer
    const players = new Map();
    state.players.forEach((player, id) => {
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
        difficulty: state.world.difficulty
      }
    };
  }

  private setupMockState() {
    // Create a simple mock state for testing the renderer without network
    console.log('[Game] Using mock state (offline mode)');
    this.localPlayerId = 'test-player';

    const mockState = {
      players: new Map([
        [this.localPlayerId, {
          id: this.localPlayerId,
          x: 0,
          y: 0,
          health: 100,
          maxHealth: 100,
          level: 1,
          xp: 0,
          xpToNextLevel: 100,
          speed: 5,
          invulnerable: false,
          invulnerableTime: 0,
          timeAlive: 0,
          hostility: 0,
          facing: { x: 1, y: 0 },
          facingX: 1,
          facingY: 0,
          weapons: [{ type: 'knife', level: 1 }],
          kills: 0,
          dead: false,
          pendingUpgrade: false
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
    // Process input
    const rawInput = this.input.getInput();

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

    // Debug: log player count periodically
    if (Math.random() < 0.01) { // ~1% of frames
      console.log('[Game] Render state players:', state.players.size);
    }

    // Update camera to follow local player
    const localPlayer = state.players.get(this.localPlayerId);
    if (localPlayer) {
      this.renderer.setCameraTarget(localPlayer.x, localPlayer.y);
    }

    // Process audio events based on state changes
    this.processAudioEvents(state, localPlayer);

    // Render all entities
    this.renderer.render(state, this.localPlayerId);

    // Update HUD with current state
    this.hud.update(localPlayer, state.world, state.players, this.localPlayerId);
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
    this.lastEnemyIds.forEach(id => {
      if (!currentEnemyIds.has(id)) {
        enemiesKilled++;
        // Spawn death explosion at last known position
        const lastPos = this.lastEnemyPositions.get(id);
        if (lastPos) {
          this.renderer.spawnDeathExplosion(lastPos.x, lastPos.y, lastPos.type);
          this.lastEnemyPositions.delete(id);
        }
      }
    });

    // Play enemy death sound (limit to avoid audio spam)
    if (enemiesKilled > 0 && enemiesKilled <= 3) {
      this.audio.playEnemyDeathSound();
    }
    this.lastEnemyIds = currentEnemyIds;

    // Clean up position tracking for removed enemies
    this.lastEnemyPositions.forEach((_, id) => {
      if (!currentEnemyIds.has(id)) {
        this.lastEnemyPositions.delete(id);
      }
    });
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
    console.log('[Game] Stopped');
  }

  // Public method to handle respawn
  respawn() {
    if (this.connected) {
      this.network.sendRespawn();
    }
  }
}
