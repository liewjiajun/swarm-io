import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { Interpolator } from './Interpolator';
import { NetworkClient, SerializedGameState } from '../network';
import { HUD } from '../ui';
import type { PlayerInput } from '@swarm-io/shared';

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private interpolator: Interpolator;
  private network: NetworkClient;
  private hud: HUD;

  private localPlayerId: string = '';
  private lastUpdateTime: number = 0;
  private running: boolean = false;
  private connected: boolean = false;
  private inputSequence: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.interpolator = new Interpolator();
    this.network = new NetworkClient();
    this.hud = new HUD();
  }

  async start() {
    console.log('[Game] Starting SWARM.IO client...');

    try {
      // Connect to server
      await this.network.connect();
      this.localPlayerId = this.network.sessionId;
      this.connected = true;

      console.log('[Game] Connected with player ID:', this.localPlayerId);

      // Setup network event handlers
      this.setupNetworkHandlers();

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
      this.interpolator.pushState(this.convertToRenderState(state), performance.now());
    });

    // Handle player death
    this.network.onPlayerDied((data) => {
      if (data.playerId === this.localPlayerId) {
        console.log('[Game] Local player died. Final score:', data.finalScore);
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

    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    this.update(dt);
    this.render();

    requestAnimationFrame(() => this.gameLoop());
  }

  private update(dt: number) {
    // Process input
    const rawInput = this.input.getInput();

    // Only send input if there's movement or if connected
    if ((rawInput.dx !== 0 || rawInput.dy !== 0) && this.connected) {
      this.inputSequence++;
      const input: PlayerInput = {
        dx: rawInput.dx,
        dy: rawInput.dy,
        sequence: this.inputSequence
      };

      // Send input to server
      this.network.sendInput(input);
    }

    // Apply client-side prediction for local player
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

    // Render all entities
    this.renderer.render(state, this.localPlayerId);

    // Update HUD with current state
    this.hud.update(localPlayer, state.world, state.players, this.localPlayerId);
  }

  stop() {
    this.running = false;
    if (this.connected) {
      this.network.disconnect();
      this.connected = false;
    }
    this.hud.destroy();
    console.log('[Game] Stopped');
  }

  // Public method to handle respawn
  respawn() {
    if (this.connected) {
      this.network.sendRespawn();
    }
  }
}
