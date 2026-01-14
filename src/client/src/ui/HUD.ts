/**
 * HUD (Heads-Up Display) Class
 *
 * Provides the in-game user interface including:
 * - Health and XP bars
 * - Level display
 * - Weapon icons
 * - Leaderboard
 * - Game info (time, wave, players)
 * - Minimap
 * - Upgrade selection modal
 * - Death screen
 *
 * Follows pixel-art aesthetic with "Press Start 2P" font.
 */

interface HUDElements {
  healthBar: HTMLElement;
  healthText: HTMLElement;
  xpBar: HTMLElement;
  levelText: HTMLElement;
  weaponsContainer: HTMLElement;
  leaderboard: HTMLElement;
  gameInfo: HTMLElement;
  minimap: HTMLCanvasElement;
  upgradeModal: HTMLElement;
  upgradeChoices: HTMLElement;
  deathScreen: HTMLElement;
  deathStats: HTMLElement;
  respawnBtn: HTMLElement;
  settingsBtn: HTMLElement;
  settingsModal: HTMLElement;
  masterVolumeSlider: HTMLInputElement;
  sfxVolumeSlider: HTMLInputElement;
  musicVolumeSlider: HTMLInputElement;
  muteCheckbox: HTMLInputElement;
  tutorialOverlay: HTMLElement;
  pauseOverlay: HTMLElement;
}

interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

type AudioSettingsCallback = (settings: AudioSettings) => void;

interface PlayerState {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  weapons: { type: string; level: number }[];
  kills: number;
  timeAlive: number;
  dead: boolean;
}

interface WorldState {
  gameTime: number;
  currentWave: number;
  playerCount: number;
  worldRadius: number;
}

interface UpgradeChoice {
  id: string;
  type: 'weapon' | 'stat';
  weaponType?: string;
  statType?: string;
  description: string;
}

interface DeathStats {
  kills: number;
  timeAlive: number;
  level: number;
}

// Weapon type to emoji mapping
const WEAPON_ICONS: Record<string, string> = {
  knife: '🗡️',
  wand: '🔮',
  bible: '📖',
  garlic: '🧄',
  lightning: '⚡',
  axe: '🪓',
  fireball: '🔥',
  whip: '〰️'
};

export class HUD {
  private container: HTMLElement;
  private elements!: HUDElements;
  private onAudioSettingsChange: AudioSettingsCallback | null = null;
  private currentSettings: AudioSettings = {
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    muted: false
  };

  constructor() {
    const uiContainer = document.getElementById('ui');
    if (!uiContainer) {
      throw new Error('HUD: #ui container not found in DOM');
    }
    this.container = uiContainer;
    this.createElements();
    this.addStyles();
    this.elements = this.getElements();
    this.setupSettingsListeners();
    this.setupKeyboardShortcuts();
  }

  /**
   * Sets the callback for audio settings changes
   */
  setAudioSettingsCallback(callback: AudioSettingsCallback): void {
    this.onAudioSettingsChange = callback;
  }

  /**
   * Creates all HUD HTML elements
   */
  private createElements(): void {
    this.container.innerHTML = `
      <div class="hud">
        <!-- Top Left: Health, XP, Level -->
        <div class="hud-topleft">
          <div class="health-bar">
            <div class="health-fill"></div>
            <span class="health-text">100/100</span>
          </div>
          <div class="xp-bar">
            <div class="xp-fill"></div>
          </div>
          <div class="level-text">Lv. 1</div>
        </div>

        <!-- Top Right: Leaderboard -->
        <div class="hud-topright">
          <div class="leaderboard">
            <div class="leaderboard-title">TOP SURVIVORS</div>
            <div class="leaderboard-entries"></div>
          </div>
        </div>

        <!-- Bottom Left: Weapons -->
        <div class="hud-bottomleft">
          <div class="weapons-container"></div>
        </div>

        <!-- Bottom Right: Game Info -->
        <div class="hud-bottomright">
          <div class="game-info">
            <div class="game-time">00:00</div>
            <div class="game-wave">Wave 1</div>
            <div class="game-players">1 Players</div>
          </div>
        </div>

        <!-- Bottom Center: Minimap -->
        <div class="hud-minimap">
          <canvas class="minimap" width="150" height="150"></canvas>
        </div>
      </div>

      <!-- Upgrade Modal -->
      <div class="upgrade-modal hidden">
        <div class="upgrade-title">LEVEL UP!</div>
        <div class="upgrade-choices"></div>
      </div>

      <!-- Death Screen -->
      <div class="death-screen hidden">
        <div class="death-content">
          <div class="death-title">YOU DIED</div>
          <div class="death-stats"></div>
          <button class="respawn-btn">RESPAWN</button>
        </div>
      </div>

      <!-- Settings Button -->
      <button class="settings-btn" title="Settings (ESC)">⚙️</button>

      <!-- Settings Modal -->
      <div class="settings-modal hidden">
        <div class="settings-content">
          <div class="settings-title">SETTINGS</div>
          <div class="settings-group">
            <label class="settings-label">Master Volume</label>
            <input type="range" class="settings-slider master-volume" min="0" max="100" value="70">
            <span class="volume-value">70%</span>
          </div>
          <div class="settings-group">
            <label class="settings-label">SFX Volume</label>
            <input type="range" class="settings-slider sfx-volume" min="0" max="100" value="80">
            <span class="volume-value">80%</span>
          </div>
          <div class="settings-group">
            <label class="settings-label">Music Volume</label>
            <input type="range" class="settings-slider music-volume" min="0" max="100" value="50">
            <span class="volume-value">50%</span>
          </div>
          <div class="settings-group mute-group">
            <label class="settings-label">Mute All</label>
            <input type="checkbox" class="settings-checkbox mute-checkbox">
          </div>
          <button class="settings-close-btn">CLOSE</button>
        </div>
      </div>

      <!-- Tutorial Overlay -->
      <div class="tutorial-overlay hidden">
        <div class="tutorial-content">
          <div class="tutorial-title">HOW TO PLAY</div>
          <div class="tutorial-section tutorial-desktop-controls">
            <div class="tutorial-heading">MOVEMENT</div>
            <div class="tutorial-keys">
              <span class="key">W</span>
              <span class="key">A</span>
              <span class="key">S</span>
              <span class="key">D</span>
            </div>
            <div class="tutorial-text">Use WASD or Arrow Keys to move</div>
          </div>
          <div class="tutorial-section tutorial-mobile-controls">
            <div class="tutorial-heading">MOVEMENT</div>
            <div class="tutorial-joystick-icon">
              <div class="joystick-demo-base">
                <div class="joystick-demo-knob"></div>
              </div>
            </div>
            <div class="tutorial-text">Touch and drag the virtual joystick to move</div>
          </div>
          <div class="tutorial-section">
            <div class="tutorial-heading">COMBAT</div>
            <div class="tutorial-text">Weapons auto-attack nearby enemies</div>
          </div>
          <div class="tutorial-section">
            <div class="tutorial-heading">SURVIVE</div>
            <div class="tutorial-text">Collect XP orbs to level up and choose upgrades</div>
          </div>
          <div class="tutorial-section tutorial-tips-desktop">
            <div class="tutorial-heading">TIPS</div>
            <div class="tutorial-text">• ESC opens Settings</div>
            <div class="tutorial-text">• Avoid the world edge</div>
            <div class="tutorial-text">• Watch out for bosses!</div>
          </div>
          <div class="tutorial-section tutorial-tips-mobile">
            <div class="tutorial-heading">TIPS</div>
            <div class="tutorial-text">• Tap the gear icon for Settings</div>
            <div class="tutorial-text">• Avoid the world edge</div>
            <div class="tutorial-text">• Watch out for bosses!</div>
          </div>
          <button class="tutorial-start-btn">START GAME</button>
        </div>
      </div>

      <!-- Pause Overlay -->
      <div class="pause-overlay hidden">
        <div class="pause-content">
          <div class="pause-title">PAUSED</div>
          <button class="pause-resume-btn">RESUME</button>
          <button class="pause-settings-btn">SETTINGS</button>
        </div>
      </div>
    `;
  }

  /**
   * Injects CSS styles into the document
   */
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Import pixel font */
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

      .hud {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Press Start 2P', monospace;
        color: white;
        text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
        font-size: 12px;
        z-index: 100;
      }

      .hud > div {
        pointer-events: auto;
      }

      /* Top Left - Health/XP/Level */
      .hud-topleft {
        position: absolute;
        top: 20px;
        left: 20px;
      }

      .health-bar, .xp-bar {
        width: 200px;
        height: 20px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        position: relative;
        margin-bottom: 5px;
      }

      .health-fill {
        height: 100%;
        background: linear-gradient(180deg, #ff6b6b 0%, #c0392b 100%);
        transition: width 0.3s ease;
        width: 100%;
      }

      .xp-fill {
        height: 100%;
        background: linear-gradient(180deg, #4ecdc4 0%, #1abc9c 100%);
        transition: width 0.3s ease;
        width: 0%;
      }

      .health-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        white-space: nowrap;
      }

      .level-text {
        font-size: 14px;
        margin-top: 5px;
      }

      /* Top Right - Leaderboard */
      .hud-topright {
        position: absolute;
        top: 20px;
        right: 20px;
      }

      .leaderboard {
        background: rgba(0, 0, 0, 0.5);
        padding: 10px;
        border: 2px solid white;
        min-width: 180px;
      }

      .leaderboard-title {
        font-size: 10px;
        text-align: center;
        margin-bottom: 10px;
        color: #ffd700;
      }

      .leaderboard-entry {
        font-size: 8px;
        margin: 5px 0;
        display: flex;
        justify-content: space-between;
      }

      .leaderboard-entry.you {
        color: #4ecdc4;
      }

      /* Bottom Left - Weapons */
      .hud-bottomleft {
        position: absolute;
        bottom: 20px;
        left: 20px;
      }

      .weapons-container {
        display: flex;
        gap: 10px;
      }

      .weapon-icon {
        width: 50px;
        height: 50px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .weapon-emoji {
        font-size: 20px;
      }

      .weapon-level {
        font-size: 8px;
        margin-top: 2px;
      }

      /* Bottom Right - Game Info */
      .hud-bottomright {
        position: absolute;
        bottom: 20px;
        right: 20px;
      }

      .game-info {
        background: rgba(0, 0, 0, 0.5);
        padding: 10px;
        text-align: right;
        border: 2px solid white;
      }

      .game-info div {
        font-size: 10px;
        margin: 3px 0;
      }

      /* Minimap */
      .hud-minimap {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
      }

      .minimap {
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
      }

      /* Upgrade Modal */
      .upgrade-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        padding: 30px;
        border: 4px solid #ffd700;
        z-index: 200;
        font-family: 'Press Start 2P', monospace;
        text-align: center;
        pointer-events: auto; /* BUG-016 FIX: Override parent #ui pointer-events: none */
      }

      .upgrade-modal.hidden {
        display: none;
      }

      .upgrade-title {
        font-size: 24px;
        color: #ffd700;
        margin-bottom: 20px;
        text-shadow: 2px 2px 0 #000;
      }

      .upgrade-choices {
        display: flex;
        gap: 15px;
        justify-content: center;
      }

      .upgrade-choice {
        width: 150px;
        padding: 15px;
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid white;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .upgrade-choice:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: #ffd700;
        transform: scale(1.05);
      }

      .upgrade-icon {
        font-size: 32px;
        margin-bottom: 10px;
      }

      .upgrade-name {
        font-size: 12px;
        color: white;
        margin-bottom: 10px;
        text-shadow: 2px 2px 0 #000;
      }

      .upgrade-desc {
        font-size: 8px;
        color: #aaa;
        text-shadow: 1px 1px 0 #000;
      }

      /* Death Screen */
      .death-screen {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 300;
        font-family: 'Press Start 2P', monospace;
        pointer-events: auto; /* BUG-015 FIX: Override parent #ui pointer-events: none */
      }

      .death-screen.hidden {
        display: none;
      }

      .death-content {
        text-align: center;
      }

      .death-title {
        font-size: 48px;
        color: #ff6b6b;
        margin-bottom: 30px;
        text-shadow: 4px 4px 0 #000;
        animation: pulse 1s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }

      .death-stats {
        font-size: 14px;
        color: white;
        margin-bottom: 30px;
        text-shadow: 2px 2px 0 #000;
        line-height: 2;
      }

      .respawn-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 16px;
        padding: 15px 30px;
        background: #4ecdc4;
        color: white;
        border: none;
        cursor: pointer;
        text-shadow: 2px 2px 0 #000;
        transition: background 0.2s ease;
      }

      .respawn-btn:hover {
        background: #1abc9c;
      }

      /* Settings Button */
      .settings-btn {
        position: fixed;
        top: 20px;
        right: 220px;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        border-radius: 5px;
        font-size: 20px;
        cursor: pointer;
        z-index: 150;
        transition: all 0.2s ease;
        pointer-events: auto; /* BUG-021 FIX: Override parent #ui pointer-events: none */
      }

      .settings-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: #ffd700;
      }

      /* Settings Modal */
      .settings-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 400;
        font-family: 'Press Start 2P', monospace;
        pointer-events: auto; /* Override parent #ui pointer-events: none */
      }

      .settings-modal.hidden {
        display: none;
      }

      .settings-content {
        background: rgba(0, 0, 0, 0.9);
        padding: 30px;
        border: 4px solid #4ecdc4;
        min-width: 350px;
      }

      .settings-title {
        font-size: 20px;
        color: #4ecdc4;
        text-align: center;
        margin-bottom: 25px;
        text-shadow: 2px 2px 0 #000;
      }

      .settings-group {
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 15px;
      }

      .settings-label {
        font-size: 10px;
        color: white;
        min-width: 100px;
        text-shadow: 1px 1px 0 #000;
      }

      .settings-slider {
        flex: 1;
        height: 8px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        cursor: pointer;
      }

      .settings-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
      }

      .settings-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }

      .volume-value {
        font-size: 10px;
        color: #4ecdc4;
        min-width: 40px;
        text-align: right;
      }

      .mute-group {
        justify-content: flex-start;
      }

      .settings-checkbox {
        width: 20px;
        height: 20px;
        cursor: pointer;
        accent-color: #4ecdc4;
      }

      .settings-close-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 12px;
        padding: 12px 24px;
        background: #4ecdc4;
        color: white;
        border: none;
        cursor: pointer;
        width: 100%;
        margin-top: 20px;
        text-shadow: 1px 1px 0 #000;
        transition: background 0.2s ease;
      }

      .settings-close-btn:hover {
        background: #1abc9c;
      }

      /* Tutorial Overlay */
      .tutorial-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 500;
        font-family: 'Press Start 2P', monospace;
        pointer-events: auto; /* Override parent #ui pointer-events: none */
      }

      .tutorial-overlay.hidden {
        display: none;
      }

      .tutorial-content {
        background: rgba(0, 0, 0, 0.95);
        padding: 40px;
        border: 4px solid #ffd700;
        max-width: 450px;
        text-align: center;
      }

      .tutorial-title {
        font-size: 28px;
        color: #ffd700;
        margin-bottom: 30px;
        text-shadow: 2px 2px 0 #000;
      }

      .tutorial-section {
        margin-bottom: 25px;
      }

      .tutorial-heading {
        font-size: 12px;
        color: #4ecdc4;
        margin-bottom: 10px;
        text-shadow: 1px 1px 0 #000;
      }

      .tutorial-keys {
        display: flex;
        justify-content: center;
        gap: 5px;
        margin-bottom: 10px;
      }

      .key {
        width: 35px;
        height: 35px;
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid white;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
      }

      .tutorial-text {
        font-size: 10px;
        color: #aaa;
        line-height: 1.8;
        text-shadow: 1px 1px 0 #000;
      }

      /* Mobile/Desktop specific tutorial sections */
      .tutorial-mobile-controls,
      .tutorial-tips-mobile {
        display: none;
      }

      .tutorial-desktop-controls,
      .tutorial-tips-desktop {
        display: block;
      }

      @media (max-width: 768px), (hover: none) and (pointer: coarse) {
        .tutorial-mobile-controls,
        .tutorial-tips-mobile {
          display: block;
        }

        .tutorial-desktop-controls,
        .tutorial-tips-desktop {
          display: none;
        }

        .tutorial-content {
          max-width: 350px;
          padding: 25px;
        }

        .tutorial-title {
          font-size: 22px;
          margin-bottom: 20px;
        }
      }

      /* Joystick demo icon for tutorial */
      .tutorial-joystick-icon {
        display: flex;
        justify-content: center;
        margin-bottom: 10px;
      }

      .joystick-demo-base {
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        border: 3px solid rgba(255, 255, 255, 0.3);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .joystick-demo-knob {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, rgba(78, 205, 196, 0.9), rgba(26, 188, 156, 0.8));
        border: 2px solid rgba(255, 255, 255, 0.5);
        animation: joystick-pulse 2s ease-in-out infinite;
      }

      @keyframes joystick-pulse {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(10px, 0); }
        50% { transform: translate(0, 10px); }
        75% { transform: translate(-10px, 0); }
      }

      .tutorial-start-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 14px;
        padding: 15px 30px;
        background: #ffd700;
        color: black;
        border: none;
        cursor: pointer;
        margin-top: 20px;
        transition: all 0.2s ease;
      }

      .tutorial-start-btn:hover {
        background: #ffed4a;
        transform: scale(1.05);
      }

      /* Pause Overlay */
      .pause-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 450;
        font-family: 'Press Start 2P', monospace;
        pointer-events: auto; /* Override parent #ui pointer-events: none */
      }

      .pause-overlay.hidden {
        display: none;
      }

      .pause-content {
        text-align: center;
      }

      .pause-title {
        font-size: 36px;
        color: white;
        margin-bottom: 40px;
        text-shadow: 3px 3px 0 #000;
        animation: pulse 1s ease-in-out infinite;
      }

      .pause-resume-btn, .pause-settings-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 14px;
        padding: 15px 40px;
        margin: 10px;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        display: block;
        width: 200px;
        margin-left: auto;
        margin-right: auto;
      }

      .pause-resume-btn {
        background: #4ecdc4;
        color: white;
        text-shadow: 1px 1px 0 #000;
      }

      .pause-resume-btn:hover {
        background: #1abc9c;
        transform: scale(1.05);
      }

      .pause-settings-btn {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 2px solid white;
        text-shadow: 1px 1px 0 #000;
      }

      .pause-settings-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: #ffd700;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Caches references to DOM elements
   */
  private getElements(): HUDElements {
    return {
      healthBar: this.container.querySelector('.health-fill') as HTMLElement,
      healthText: this.container.querySelector('.health-text') as HTMLElement,
      xpBar: this.container.querySelector('.xp-fill') as HTMLElement,
      levelText: this.container.querySelector('.level-text') as HTMLElement,
      weaponsContainer: this.container.querySelector('.weapons-container') as HTMLElement,
      leaderboard: this.container.querySelector('.leaderboard-entries') as HTMLElement,
      gameInfo: this.container.querySelector('.game-info') as HTMLElement,
      minimap: this.container.querySelector('.minimap') as HTMLCanvasElement,
      upgradeModal: this.container.querySelector('.upgrade-modal') as HTMLElement,
      upgradeChoices: this.container.querySelector('.upgrade-choices') as HTMLElement,
      deathScreen: this.container.querySelector('.death-screen') as HTMLElement,
      deathStats: this.container.querySelector('.death-stats') as HTMLElement,
      respawnBtn: this.container.querySelector('.respawn-btn') as HTMLElement,
      settingsBtn: this.container.querySelector('.settings-btn') as HTMLElement,
      settingsModal: this.container.querySelector('.settings-modal') as HTMLElement,
      masterVolumeSlider: this.container.querySelector('.master-volume') as HTMLInputElement,
      sfxVolumeSlider: this.container.querySelector('.sfx-volume') as HTMLInputElement,
      musicVolumeSlider: this.container.querySelector('.music-volume') as HTMLInputElement,
      muteCheckbox: this.container.querySelector('.mute-checkbox') as HTMLInputElement,
      tutorialOverlay: this.container.querySelector('.tutorial-overlay') as HTMLElement,
      pauseOverlay: this.container.querySelector('.pause-overlay') as HTMLElement
    };
  }

  /**
   * Main update method - called every frame
   */
  update(
    player: PlayerState | undefined,
    world: WorldState | undefined,
    allPlayers: Map<string, PlayerState>,
    localPlayerId: string
  ): void {
    if (!player) return;

    // Update health bar
    const healthPercent = (player.health / player.maxHealth) * 100;
    this.elements.healthBar.style.width = `${healthPercent}%`;
    this.elements.healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;

    // Update XP bar
    const xpPercent = (player.xp / player.xpToNextLevel) * 100;
    this.elements.xpBar.style.width = `${xpPercent}%`;

    // Update level
    this.elements.levelText.textContent = `Lv. ${player.level}`;

    // Update weapons
    this.updateWeapons(player.weapons);

    // Update leaderboard
    this.updateLeaderboard(allPlayers, localPlayerId);

    // Update game info
    if (world) {
      this.updateGameInfo(world);
      this.updateMinimap(player, allPlayers, world);
    }
  }

  /**
   * Updates weapon display icons
   */
  private updateWeapons(weapons: { type: string; level: number }[]): void {
    this.elements.weaponsContainer.innerHTML = weapons
      .map(weapon => {
        const icon = WEAPON_ICONS[weapon.type] || '❓';
        return `
          <div class="weapon-icon">
            <span class="weapon-emoji">${icon}</span>
            <span class="weapon-level">Lv.${weapon.level}</span>
          </div>
        `;
      })
      .join('');
  }

  /**
   * Updates leaderboard with top 5 players by time alive
   */
  private updateLeaderboard(
    players: Map<string, PlayerState>,
    localPlayerId: string
  ): void {
    // Convert to array and filter out dead players
    const playerList = Array.from(players.values())
      .filter(p => !p.dead)
      .sort((a, b) => b.timeAlive - a.timeAlive)
      .slice(0, 5);

    this.elements.leaderboard.innerHTML = playerList
      .map((player, index) => {
        const isLocal = player.id === localPlayerId;
        const name = isLocal ? 'YOU' : `Player ${index + 1}`;
        const time = this.formatTime(player.timeAlive);
        return `
          <div class="leaderboard-entry ${isLocal ? 'you' : ''}">
            <span>${index + 1}. ${name}</span>
            <span>${time}</span>
          </div>
        `;
      })
      .join('');
  }

  /**
   * Updates game info display (time, wave, players)
   */
  private updateGameInfo(world: WorldState): void {
    this.elements.gameInfo.innerHTML = `
      <div class="game-time">${this.formatTime(world.gameTime)}</div>
      <div class="game-wave">Wave ${world.currentWave}</div>
      <div class="game-players">${world.playerCount} Player${world.playerCount !== 1 ? 's' : ''}</div>
    `;
  }

  /**
   * Updates minimap canvas
   */
  private updateMinimap(
    player: PlayerState,
    allPlayers: Map<string, PlayerState>,
    world: WorldState
  ): void {
    const canvas = this.elements.minimap;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 150;
    const worldRadius = world.worldRadius || 500;
    const scale = size / (worldRadius * 2.5);

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, size, size);

    // Draw world boundary circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, worldRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Draw other players (blue dots)
    ctx.fillStyle = '#4a90d9';
    allPlayers.forEach(p => {
      if (p.id !== player.id && !p.dead) {
        const x = size / 2 + p.x * scale;
        const y = size / 2 + p.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw local player (green dot, larger)
    ctx.fillStyle = '#4ecdc4';
    const px = size / 2 + player.x * scale;
    const py = size / 2 + player.y * scale;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Formats seconds to MM:SS string
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Shows upgrade selection modal
   */
  showUpgradeUI(choices: UpgradeChoice[], onSelect: (id: string) => void): void {
    this.elements.upgradeChoices.innerHTML = choices
      .map(choice => {
        const icon = choice.weaponType
          ? WEAPON_ICONS[choice.weaponType] || '⬆️'
          : '⬆️';
        const name = choice.weaponType || choice.statType || 'Upgrade';
        return `
          <div class="upgrade-choice" data-id="${choice.id}">
            <div class="upgrade-icon">${icon}</div>
            <div class="upgrade-name">${name.toUpperCase()}</div>
            <div class="upgrade-desc">${choice.description}</div>
          </div>
        `;
      })
      .join('');

    // Attach click handlers
    this.elements.upgradeChoices.querySelectorAll('.upgrade-choice').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (id) {
          onSelect(id);
          this.hideUpgradeUI();
        }
      });
    });

    this.elements.upgradeModal.classList.remove('hidden');
  }

  /**
   * Hides upgrade modal
   */
  hideUpgradeUI(): void {
    this.elements.upgradeModal.classList.add('hidden');
  }

  /**
   * Shows death screen with stats and respawn button
   */
  showDeathScreen(stats: DeathStats, onRespawn: () => void): void {
    this.elements.deathStats.innerHTML = `
      <div>Time Survived: ${this.formatTime(stats.timeAlive)}</div>
      <div>Enemies Killed: ${stats.kills}</div>
      <div>Level Reached: ${stats.level}</div>
    `;

    // Remove previous listener and add new one
    const newBtn = this.elements.respawnBtn.cloneNode(true) as HTMLElement;
    this.elements.respawnBtn.parentNode?.replaceChild(newBtn, this.elements.respawnBtn);
    this.elements.respawnBtn = newBtn;

    this.elements.respawnBtn.addEventListener('click', () => {
      onRespawn();
      this.hideDeathScreen();
    });

    this.elements.deathScreen.classList.remove('hidden');
  }

  /**
   * Hides death screen
   */
  hideDeathScreen(): void {
    this.elements.deathScreen.classList.add('hidden');
  }

  /**
   * Sets up event listeners for settings controls
   */
  private setupSettingsListeners(): void {
    // Settings button opens modal
    this.elements.settingsBtn.addEventListener('click', () => this.showSettings());

    // Close button closes modal
    const closeBtn = this.container.querySelector('.settings-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideSettings());
    }

    // Click outside modal to close
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) {
        this.hideSettings();
      }
    });

    // Master volume slider
    this.elements.masterVolumeSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.currentSettings.masterVolume = value / 100;
      this.updateVolumeDisplay(this.elements.masterVolumeSlider, value);
      this.notifySettingsChange();
    });

    // SFX volume slider
    this.elements.sfxVolumeSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.currentSettings.sfxVolume = value / 100;
      this.updateVolumeDisplay(this.elements.sfxVolumeSlider, value);
      this.notifySettingsChange();
    });

    // Music volume slider
    this.elements.musicVolumeSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.currentSettings.musicVolume = value / 100;
      this.updateVolumeDisplay(this.elements.musicVolumeSlider, value);
      this.notifySettingsChange();
    });

    // Mute checkbox
    this.elements.muteCheckbox.addEventListener('change', (e) => {
      this.currentSettings.muted = (e.target as HTMLInputElement).checked;
      this.notifySettingsChange();
    });
  }

  /**
   * Sets up keyboard shortcuts (ESC to toggle settings)
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Don't toggle settings if upgrade modal is open
        if (!this.elements.upgradeModal.classList.contains('hidden')) {
          return;
        }
        // Toggle settings
        if (this.elements.settingsModal.classList.contains('hidden')) {
          this.showSettings();
        } else {
          this.hideSettings();
        }
      }
    });
  }

  /**
   * Updates the volume percentage display next to a slider
   */
  private updateVolumeDisplay(slider: HTMLInputElement, value: number): void {
    const valueDisplay = slider.parentElement?.querySelector('.volume-value');
    if (valueDisplay) {
      valueDisplay.textContent = `${value}%`;
    }
  }

  /**
   * Notifies the callback about settings changes
   */
  private notifySettingsChange(): void {
    if (this.onAudioSettingsChange) {
      this.onAudioSettingsChange({ ...this.currentSettings });
    }
  }

  /**
   * Shows the settings modal
   */
  showSettings(): void {
    this.elements.settingsModal.classList.remove('hidden');
  }

  /**
   * Hides the settings modal
   */
  hideSettings(): void {
    this.elements.settingsModal.classList.add('hidden');
  }

  /**
   * Updates settings UI with current audio values
   */
  updateAudioSettings(settings: AudioSettings): void {
    this.currentSettings = { ...settings };

    this.elements.masterVolumeSlider.value = String(Math.round(settings.masterVolume * 100));
    this.updateVolumeDisplay(this.elements.masterVolumeSlider, Math.round(settings.masterVolume * 100));

    this.elements.sfxVolumeSlider.value = String(Math.round(settings.sfxVolume * 100));
    this.updateVolumeDisplay(this.elements.sfxVolumeSlider, Math.round(settings.sfxVolume * 100));

    this.elements.musicVolumeSlider.value = String(Math.round(settings.musicVolume * 100));
    this.updateVolumeDisplay(this.elements.musicVolumeSlider, Math.round(settings.musicVolume * 100));

    this.elements.muteCheckbox.checked = settings.muted;
  }

  /**
   * Shows the tutorial overlay if this is the player's first time
   * Uses localStorage to track if tutorial has been shown
   */
  showTutorialIfFirstTime(onComplete: () => void): void {
    const tutorialSeen = localStorage.getItem('swarm-io-tutorial-seen');

    if (!tutorialSeen) {
      this.showTutorial(onComplete);
    } else {
      // Tutorial already seen, start immediately
      onComplete();
    }
  }

  /**
   * Shows the tutorial overlay
   */
  showTutorial(onComplete: () => void): void {
    this.elements.tutorialOverlay.classList.remove('hidden');

    // Clone button to remove any existing listeners (prevents duplicate handlers)
    const startBtn = this.container.querySelector('.tutorial-start-btn') as HTMLElement;
    if (startBtn) {
      const newBtn = startBtn.cloneNode(true) as HTMLElement;
      startBtn.parentNode?.replaceChild(newBtn, startBtn);

      newBtn.addEventListener('click', () => {
        localStorage.setItem('swarm-io-tutorial-seen', 'true');
        this.hideTutorial();
        onComplete();
      });
    }
  }

  /**
   * Hides the tutorial overlay
   */
  hideTutorial(): void {
    this.elements.tutorialOverlay.classList.add('hidden');
  }

  /**
   * Shows the pause overlay
   */
  showPause(onResume: () => void, onSettings: () => void): void {
    this.elements.pauseOverlay.classList.remove('hidden');

    // Setup resume button handler
    const resumeBtn = this.container.querySelector('.pause-resume-btn');
    const settingsBtn = this.container.querySelector('.pause-settings-btn');

    if (resumeBtn) {
      const newResumeBtn = resumeBtn.cloneNode(true) as HTMLElement;
      resumeBtn.parentNode?.replaceChild(newResumeBtn, resumeBtn);
      newResumeBtn.addEventListener('click', () => {
        this.hidePause();
        onResume();
      });
    }

    if (settingsBtn) {
      const newSettingsBtn = settingsBtn.cloneNode(true) as HTMLElement;
      settingsBtn.parentNode?.replaceChild(newSettingsBtn, settingsBtn);
      newSettingsBtn.addEventListener('click', () => {
        this.hidePause();
        onSettings();
        this.showSettings();
      });
    }
  }

  /**
   * Hides the pause overlay
   */
  hidePause(): void {
    this.elements.pauseOverlay.classList.add('hidden');
  }

  /**
   * Check if pause overlay is visible
   */
  isPaused(): boolean {
    return !this.elements.pauseOverlay.classList.contains('hidden');
  }

  /**
   * Cleans up HUD resources
   */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
