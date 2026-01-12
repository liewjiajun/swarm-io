import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { Interpolator } from './Interpolator';
// Note: NetworkClient will be added in Phase 4
// import { NetworkClient } from '../network/NetworkClient';
import type { PlayerState, EnemyState, ProjectileState, XPOrbState } from '@swarm-io/shared';

export class Game {
  private renderer: Renderer;
  private input: InputManager;
  private interpolator: Interpolator;
  // private network: NetworkClient; // Will be added in Phase 4

  private localPlayerId: string = 'test-player';
  private lastUpdateTime: number = 0;
  private running: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.interpolator = new Interpolator();
    // this.network = new NetworkClient(); // Will be added in Phase 4

    // For Phase 3 testing, create a mock state
    this.setupMockState();
  }

  private setupMockState() {
    // Create a simple mock state for testing the renderer
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
          timeAlive: 0,
          hostility: 0,
          facing: { x: 1, y: 0 },
          weapons: [],
          kills: 0
        } as PlayerState]
      ]),
      enemies: new Map(),
      projectiles: new Map(),
      xpOrbs: new Map(),
      world: {
        worldRadius: 500,
        playerCount: 1,
        gameTime: 0,
        difficulty: 1,
        wave: 1
      }
    };

    this.interpolator.pushState(mockState, performance.now());
  }

  async start() {
    console.log('Starting SWARM.IO client (Phase 3 - Testing mode)');

    // In Phase 4, we'll add:
    // await this.network.connect();
    // this.localPlayerId = this.network.sessionId;
    // this.setupNetworkHandlers();

    this.running = true;
    this.lastUpdateTime = performance.now();
    this.gameLoop();
  }

  private setupNetworkHandlers() {
    // Will be implemented in Phase 4 when NetworkClient is ready
    /*
    this.network.onStateChange((state) => {
      this.interpolator.pushState(state, performance.now());
    });

    this.network.onPlayerDied((data) => {
      if (data.playerId === this.localPlayerId) {
        this.renderer.showDeathScreen(data.finalScore);
      }
    });

    this.network.onLevelUp((data) => {
      this.renderer.showUpgradeUI(data.choices, (choiceId) => {
        this.network.sendUpgradeChoice(choiceId);
      });
    });
    */
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
    const input = this.input.getInput();

    // For Phase 3 testing, log input when moving
    if (input.dx !== 0 || input.dy !== 0) {
      console.log('Input captured:', input);

      // For Phase 4, we'll add:
      // this.network.sendInput(input);
    }

    // Apply client-side prediction for local player
    const localPlayer = this.interpolator.getLocalPlayer(this.localPlayerId);
    if (localPlayer) {
      this.input.applyPrediction(localPlayer, input, dt);
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
  }

  stop() {
    this.running = false;
    // In Phase 4, we'll add:
    // this.network.disconnect();
  }
}