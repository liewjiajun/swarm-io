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
  minimapZoomIn: HTMLElement; // P3.3d: Zoom in button
  minimapZoomOut: HTMLElement; // P3.3d: Zoom out button
  minimapTooltip: HTMLElement; // P3.3a: Tooltip for player names
  upgradeModal: HTMLElement;
  upgradeChoices: HTMLElement;
  deathScreen: HTMLElement;
  deathRank: HTMLElement; // P3.2d: Player's final rank display
  deathStats: HTMLElement;
  deathLeaderboard: HTMLElement; // P3.2d: End-of-game leaderboard container
  respawnBtn: HTMLElement;
  settingsBtn: HTMLElement;
  settingsModal: HTMLElement;
  masterVolumeSlider: HTMLInputElement;
  sfxVolumeSlider: HTMLInputElement;
  musicVolumeSlider: HTMLInputElement;
  muteCheckbox: HTMLInputElement;
  crtCheckbox: HTMLInputElement;
  tutorialOverlay: HTMLElement;
  pauseOverlay: HTMLElement;
  nicknameModal: HTMLElement; // P3.1: Nickname input modal
  nicknameInput: HTMLInputElement; // P3.1: Nickname text input
  nicknameSubmitBtn: HTMLElement; // P3.1: Submit button
}

interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

type AudioSettingsCallback = (settings: AudioSettings) => void;
type CRTSettingsCallback = (enabled: boolean) => void;

interface UISoundCallbacks {
  playClick: () => void;
  playHover: () => void;
  playModalOpen: () => void;
  playModalClose: () => void;
  playUpgradeSelect: () => void;
}

interface PlayerState {
  id: string;
  nickname: string; // P3.1: Player display name
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

// P3.3: Enemy state for minimap enhancements
interface EnemyState {
  id: string;
  type: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
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
  score: number; // P3.2d: Final score
  rank: number; // P3.2d: Final rank among all players
  totalPlayers: number; // P3.2d: Total players when died
  topPlayers: { name: string; score: number; kills: number }[]; // P3.2d: Top 5 players for end-of-game leaderboard
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
  private onCRTSettingsChange: CRTSettingsCallback | null = null;
  private uiSounds: UISoundCallbacks | null = null;
  private currentSettings: AudioSettings = {
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    muted: false
  };
  private crtEnabled: boolean = false;

  // P3.3: Minimap enhancements state
  private minimapZoom: number = 1.0; // P3.3d: Zoom level (0.5 to 2.0)
  private minimapTooltipElement: HTMLElement | null = null; // P3.3a: Tooltip for player names
  private lastEnemies: Map<string, EnemyState> = new Map(); // P3.3b/c: Cache enemies for heatmap/boss icons
  private playerPositionsForHover: Array<{ x: number; y: number; name: string }> = []; // P3.3a: Cache for hover detection

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
    this.setupMinimapListeners(); // P3.3: Setup minimap zoom and hover listeners
  }

  /**
   * Sets the callback for audio settings changes
   */
  setAudioSettingsCallback(callback: AudioSettingsCallback): void {
    this.onAudioSettingsChange = callback;
  }

  /**
   * Sets the callback for CRT effect toggle (P1.10)
   */
  setCRTSettingsCallback(callback: CRTSettingsCallback): void {
    this.onCRTSettingsChange = callback;
  }

  /**
   * Sets the UI sound callbacks for button interactions
   * These are called when user interacts with UI elements
   */
  setUISoundCallbacks(callbacks: UISoundCallbacks): void {
    this.uiSounds = callbacks;
  }

  /**
   * Gets the current CRT effect state
   */
  isCRTEnabled(): boolean {
    return this.crtEnabled;
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

        <!-- Bottom Center: Minimap (P3.3: Enhanced with zoom controls) -->
        <div class="hud-minimap">
          <canvas class="minimap" width="150" height="150"></canvas>
          <div class="minimap-controls">
            <button class="minimap-zoom-in" title="Zoom In">+</button>
            <button class="minimap-zoom-out" title="Zoom Out">−</button>
          </div>
          <div class="minimap-tooltip hidden"></div>
        </div>
      </div>

      <!-- Upgrade Modal -->
      <div class="upgrade-modal hidden">
        <div class="upgrade-title">LEVEL UP!</div>
        <div class="upgrade-choices"></div>
      </div>

      <!-- Death Screen (P3.2d: Enhanced with end-of-game leaderboard) -->
      <div class="death-screen hidden">
        <div class="death-content">
          <div class="death-title">YOU DIED</div>
          <div class="death-rank"></div>
          <div class="death-stats"></div>
          <div class="death-leaderboard">
            <div class="death-leaderboard-title">TOP SURVIVORS</div>
            <div class="death-leaderboard-entries"></div>
          </div>
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
          <div class="settings-group crt-group">
            <label class="settings-label">CRT Effect</label>
            <input type="checkbox" class="settings-checkbox crt-checkbox">
            <span class="settings-hint">Retro scanline effect</span>
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

      <!-- P3.1: Nickname Input Modal -->
      <div class="nickname-modal hidden">
        <div class="nickname-content">
          <div class="nickname-title">ENTER YOUR NAME</div>
          <input type="text" class="nickname-input" placeholder="Survivor" maxlength="16" autocomplete="off" spellcheck="false">
          <div class="nickname-hint">Max 16 characters</div>
          <button class="nickname-submit-btn">PLAY</button>
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

      /* P3.2: Enhanced leaderboard - shows top 10 by score with kills */
      .leaderboard {
        background: rgba(0, 0, 0, 0.5);
        padding: 10px;
        border: 2px solid white;
        min-width: 220px;
        max-height: 280px;
        overflow-y: auto;
      }

      .leaderboard-title {
        font-size: 10px;
        text-align: center;
        margin-bottom: 10px;
        color: #ffd700;
      }

      .leaderboard-entry {
        font-size: 8px;
        margin: 3px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4px;
      }

      .leaderboard-entry.you {
        color: #4ecdc4;
        text-shadow: 0 0 5px rgba(78, 205, 196, 0.5);
      }

      .leaderboard-rank {
        min-width: 20px;
        text-align: left;
      }

      .leaderboard-name {
        flex: 1;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .leaderboard-kills {
        min-width: 32px;
        text-align: right;
        color: #ff6b6b;
      }

      .leaderboard-entry.you .leaderboard-kills {
        color: #ff8f8f;
      }

      .leaderboard-score {
        min-width: 40px;
        text-align: right;
        color: #ffd700;
      }

      .leaderboard-separator {
        text-align: center;
        color: #666;
        font-size: 8px;
        margin: 5px 0;
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

      /* P3.3d: Minimap zoom controls */
      .minimap-controls {
        position: absolute;
        top: 5px;
        right: 5px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .minimap-zoom-in,
      .minimap-zoom-out {
        width: 20px;
        height: 20px;
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.5);
        color: white;
        font-size: 14px;
        font-family: 'Press Start 2P', monospace;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        transition: all 0.2s ease;
      }

      .minimap-zoom-in:hover,
      .minimap-zoom-out:hover {
        background: rgba(78, 205, 196, 0.5);
        border-color: #4ecdc4;
      }

      /* P3.3a: Minimap tooltip for player nicknames on hover */
      .minimap-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid #4ecdc4;
        color: white;
        font-size: 8px;
        padding: 3px 6px;
        font-family: 'Press Start 2P', monospace;
        pointer-events: none;
        white-space: nowrap;
        z-index: 10;
        text-shadow: 1px 1px 0 #000;
      }

      .minimap-tooltip.hidden {
        display: none;
      }

      /* Upgrade Modal - BUG-046 FIX: Position in top-right corner instead of center
         so players can see the battlefield while selecting upgrades */
      .upgrade-modal {
        position: fixed;
        top: 20px;
        right: 20px;
        transform: none;
        background: rgba(0, 0, 0, 0.85);
        padding: 20px;
        border: 3px solid #ffd700;
        z-index: 200;
        font-family: 'Press Start 2P', monospace;
        text-align: center;
        pointer-events: auto; /* BUG-016 FIX: Override parent #ui pointer-events: none */
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }

      .upgrade-modal.hidden {
        display: none;
      }

      /* BUG-046 FIX: Smaller title for compact corner display */
      .upgrade-title {
        font-size: 16px;
        color: #ffd700;
        margin-bottom: 15px;
        text-shadow: 2px 2px 0 #000;
      }

      /* BUG-046 FIX: Display choices in a 2x2 grid for compact corner display */
      .upgrade-choices {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        justify-content: center;
      }

      /* BUG-046 FIX: Smaller upgrade cards for compact corner display */
      .upgrade-choice {
        width: auto;
        min-width: 120px;
        padding: 10px;
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

      .death-rank {
        font-size: 18px;
        color: #ffd700;
        margin-bottom: 15px;
        text-shadow: 2px 2px 0 #000;
      }

      .death-stats {
        font-size: 12px;
        color: white;
        margin-bottom: 20px;
        text-shadow: 2px 2px 0 #000;
        line-height: 1.8;
        display: flex;
        justify-content: center;
        gap: 30px;
        flex-wrap: wrap;
      }

      .death-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 80px;
      }

      .death-stat-value {
        font-size: 20px;
        color: #4ecdc4;
      }

      .death-stat-label {
        font-size: 8px;
        color: #aaa;
        margin-top: 4px;
      }

      /* P3.2d: End-of-game leaderboard in death screen */
      .death-leaderboard {
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid #ffd700;
        padding: 15px;
        margin-bottom: 25px;
        min-width: 280px;
      }

      .death-leaderboard-title {
        font-size: 10px;
        color: #ffd700;
        text-align: center;
        margin-bottom: 12px;
        text-shadow: 1px 1px 0 #000;
      }

      .death-leaderboard-entries {
        font-size: 10px;
      }

      .death-leaderboard-entry {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 6px 0;
        padding: 4px 8px;
        background: rgba(255, 255, 255, 0.05);
        gap: 10px;
      }

      .death-leaderboard-entry.you {
        background: rgba(78, 205, 196, 0.2);
        border: 1px solid #4ecdc4;
        color: #4ecdc4;
      }

      .death-leaderboard-entry .leaderboard-rank {
        min-width: 24px;
      }

      .death-leaderboard-entry .leaderboard-name {
        flex: 1;
      }

      .death-leaderboard-entry .leaderboard-kills {
        color: #ff6b6b;
      }

      .death-leaderboard-entry .leaderboard-score {
        color: #ffd700;
        min-width: 50px;
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

      .mute-group, .crt-group {
        justify-content: flex-start;
      }

      .settings-hint {
        font-size: 8px;
        color: #888;
        margin-left: 10px;
        font-style: italic;
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

      /* P3.1: Nickname Input Modal */
      .nickname-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 600;
        font-family: 'Press Start 2P', monospace;
        pointer-events: auto;
      }

      .nickname-modal.hidden {
        display: none;
      }

      .nickname-content {
        background: rgba(0, 0, 0, 0.95);
        padding: 40px;
        border: 4px solid #4ecdc4;
        text-align: center;
        max-width: 400px;
      }

      .nickname-title {
        font-size: 20px;
        color: #4ecdc4;
        margin-bottom: 30px;
        text-shadow: 2px 2px 0 #000;
      }

      .nickname-input {
        width: 100%;
        padding: 15px;
        font-family: 'Press Start 2P', monospace;
        font-size: 14px;
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid white;
        color: white;
        text-align: center;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s ease;
      }

      .nickname-input:focus {
        border-color: #4ecdc4;
      }

      .nickname-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }

      .nickname-hint {
        font-size: 8px;
        color: #888;
        margin-top: 10px;
        text-shadow: 1px 1px 0 #000;
      }

      .nickname-submit-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 16px;
        padding: 15px 40px;
        background: #4ecdc4;
        color: white;
        border: none;
        cursor: pointer;
        margin-top: 25px;
        text-shadow: 2px 2px 0 #000;
        transition: all 0.2s ease;
      }

      .nickname-submit-btn:hover {
        background: #1abc9c;
        transform: scale(1.05);
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
      minimapZoomIn: this.container.querySelector('.minimap-zoom-in') as HTMLElement, // P3.3d
      minimapZoomOut: this.container.querySelector('.minimap-zoom-out') as HTMLElement, // P3.3d
      minimapTooltip: this.container.querySelector('.minimap-tooltip') as HTMLElement, // P3.3a
      upgradeModal: this.container.querySelector('.upgrade-modal') as HTMLElement,
      upgradeChoices: this.container.querySelector('.upgrade-choices') as HTMLElement,
      deathScreen: this.container.querySelector('.death-screen') as HTMLElement,
      deathRank: this.container.querySelector('.death-rank') as HTMLElement, // P3.2d
      deathStats: this.container.querySelector('.death-stats') as HTMLElement,
      deathLeaderboard: this.container.querySelector('.death-leaderboard-entries') as HTMLElement, // P3.2d
      respawnBtn: this.container.querySelector('.respawn-btn') as HTMLElement,
      settingsBtn: this.container.querySelector('.settings-btn') as HTMLElement,
      settingsModal: this.container.querySelector('.settings-modal') as HTMLElement,
      masterVolumeSlider: this.container.querySelector('.master-volume') as HTMLInputElement,
      sfxVolumeSlider: this.container.querySelector('.sfx-volume') as HTMLInputElement,
      musicVolumeSlider: this.container.querySelector('.music-volume') as HTMLInputElement,
      muteCheckbox: this.container.querySelector('.mute-checkbox') as HTMLInputElement,
      crtCheckbox: this.container.querySelector('.crt-checkbox') as HTMLInputElement,
      tutorialOverlay: this.container.querySelector('.tutorial-overlay') as HTMLElement,
      pauseOverlay: this.container.querySelector('.pause-overlay') as HTMLElement,
      nicknameModal: this.container.querySelector('.nickname-modal') as HTMLElement, // P3.1
      nicknameInput: this.container.querySelector('.nickname-input') as HTMLInputElement, // P3.1
      nicknameSubmitBtn: this.container.querySelector('.nickname-submit-btn') as HTMLElement // P3.1
    };
  }

  /**
   * Main update method - called every frame
   * P3.3: Now accepts enemies for minimap enhancements
   */
  update(
    player: PlayerState | undefined,
    world: WorldState | undefined,
    allPlayers: Map<string, PlayerState>,
    localPlayerId: string,
    enemies?: Map<string, EnemyState>
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
      // P3.3: Pass enemies to minimap for heatmap and boss icons
      this.updateMinimap(player, allPlayers, world, enemies);
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
   * Calculates a player's score based on kills, time alive, and level
   * P3.2a: Score = (kills * 100) + (timeAlive * 10) + (level * 50)
   */
  private calculateScore(player: PlayerState): number {
    return (player.kills * 100) + Math.floor(player.timeAlive * 10) + (player.level * 50);
  }

  /**
   * Updates leaderboard with top 10 players by score
   * P3.1: Shows player nicknames instead of generic names
   * P3.2a: Ranks by score (kills * 100 + timeAlive * 10 + level * 50)
   * P3.2b: Shows kill count alongside score
   * P3.2c: Highlights local player with special styling
   */
  private updateLeaderboard(
    players: Map<string, PlayerState>,
    localPlayerId: string
  ): void {
    // Convert to array and filter out dead players
    // P3.2a: Sort by score (not just survival time)
    const playerList = Array.from(players.values())
      .filter(p => !p.dead)
      .sort((a, b) => this.calculateScore(b) - this.calculateScore(a))
      .slice(0, 10); // P3.2a: Show top 10 instead of top 5

    // Find local player's rank (even if not in top 10)
    const allSortedPlayers = Array.from(players.values())
      .filter(p => !p.dead)
      .sort((a, b) => this.calculateScore(b) - this.calculateScore(a));
    const localPlayerRank = allSortedPlayers.findIndex(p => p.id === localPlayerId) + 1;
    const localPlayer = players.get(localPlayerId);

    this.elements.leaderboard.innerHTML = playerList
      .map((player, index) => {
        const isLocal = player.id === localPlayerId;
        // P3.1: Use nickname if available, fallback to "YOU" for local player or generic name
        let name: string;
        if (isLocal) {
          name = player.nickname || 'YOU';
        } else {
          name = player.nickname || `Player ${index + 1}`;
        }
        // Truncate long names to fit in leaderboard (max 10 chars to fit kills)
        if (name.length > 10) {
          name = name.slice(0, 9) + '…';
        }
        const score = this.calculateScore(player);
        // P3.2b: Show kill count with skull emoji
        const kills = player.kills;
        return `
          <div class="leaderboard-entry ${isLocal ? 'you' : ''}">
            <span class="leaderboard-rank">${index + 1}.</span>
            <span class="leaderboard-name">${name}</span>
            <span class="leaderboard-kills">💀${kills}</span>
            <span class="leaderboard-score">${score}</span>
          </div>
        `;
      })
      .join('') +
      // P3.2c: If local player is not in top 10, show their rank at the bottom
      (localPlayer && !localPlayer.dead && localPlayerRank > 10 ? `
        <div class="leaderboard-separator">···</div>
        <div class="leaderboard-entry you">
          <span class="leaderboard-rank">${localPlayerRank}.</span>
          <span class="leaderboard-name">${localPlayer.nickname || 'YOU'}</span>
          <span class="leaderboard-kills">💀${localPlayer.kills}</span>
          <span class="leaderboard-score">${this.calculateScore(localPlayer)}</span>
        </div>
      ` : '');
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
   * P3.3: Enhanced with enemy heatmap, boss icons, player hover names, and zoom
   */
  private updateMinimap(
    player: PlayerState,
    allPlayers: Map<string, PlayerState>,
    world: WorldState,
    enemies?: Map<string, EnemyState>
  ): void {
    const canvas = this.elements.minimap;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 150;
    const worldRadius = world.worldRadius || 500;
    // P3.3d: Apply zoom level to scale calculation
    const baseScale = size / (worldRadius * 2.5);
    const scale = baseScale * this.minimapZoom;

    // Cache enemies for hover detection
    if (enemies) {
      this.lastEnemies = enemies;
    }

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, size, size);

    // Draw world boundary circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, worldRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

    // P3.3b: Draw enemy density heatmap
    if (this.lastEnemies.size > 0) {
      this.drawEnemyHeatmap(ctx, size, scale, player);
    }

    // P3.3c: Draw boss locations with special icons
    this.lastEnemies.forEach(enemy => {
      if (enemy.type.startsWith('boss_')) {
        const ex = size / 2 + (enemy.x - player.x * (this.minimapZoom - 1)) * scale;
        const ey = size / 2 + (enemy.y - player.y * (this.minimapZoom - 1)) * scale;
        // Only draw if within canvas bounds
        if (ex >= 0 && ex <= size && ey >= 0 && ey <= size) {
          // Draw pulsing boss icon (skull symbol)
          ctx.fillStyle = '#ff4444';
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Draw skull symbol
          ctx.fillStyle = '#ffff00';
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('💀', ex, ey);
        }
      }
    });

    // P3.3a: Clear and rebuild player positions for hover detection
    this.playerPositionsForHover = [];

    // Draw other players (blue dots) - P3.3a: Store positions for hover
    ctx.fillStyle = '#4a90d9';
    allPlayers.forEach(p => {
      if (p.id !== player.id && !p.dead) {
        // When zoomed, adjust for player-centric view
        const x = size / 2 + (p.x - player.x * (this.minimapZoom - 1)) * scale;
        const y = size / 2 + (p.y - player.y * (this.minimapZoom - 1)) * scale;
        // Only draw if within canvas bounds
        if (x >= 0 && x <= size && y >= 0 && y <= size) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          // P3.3a: Store position and name for hover tooltip
          this.playerPositionsForHover.push({
            x,
            y,
            name: p.nickname || `Player`
          });
        }
      }
    });

    // Draw local player (teal dot, larger)
    ctx.fillStyle = '#4ecdc4';
    const px = size / 2 + player.x * scale;
    const py = size / 2 + player.y * scale;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    // Store local player position for hover too
    this.playerPositionsForHover.push({
      x: px,
      y: py,
      name: player.nickname || 'YOU'
    });
  }

  /**
   * P3.3b: Draw enemy density heatmap on minimap
   * Uses a grid-based approach to show enemy concentration
   */
  private drawEnemyHeatmap(
    ctx: CanvasRenderingContext2D,
    size: number,
    scale: number,
    player: PlayerState
  ): void {
    // Create density grid (10x10 cells)
    const gridSize = 10;
    const cellSize = size / gridSize;
    const density: number[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));

    // Count enemies in each cell
    this.lastEnemies.forEach(enemy => {
      // Skip bosses (they get special icons)
      if (enemy.type.startsWith('boss_')) return;

      const ex = size / 2 + (enemy.x - player.x * (this.minimapZoom - 1)) * scale;
      const ey = size / 2 + (enemy.y - player.y * (this.minimapZoom - 1)) * scale;

      // Calculate grid cell
      const cellX = Math.floor(ex / cellSize);
      const cellY = Math.floor(ey / cellSize);

      // Only count if within bounds
      if (cellX >= 0 && cellX < gridSize && cellY >= 0 && cellY < gridSize) {
        density[cellY][cellX]++;
      }
    });

    // Find max density for normalization
    let maxDensity = 0;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (density[y][x] > maxDensity) {
          maxDensity = density[y][x];
        }
      }
    }

    // Draw heatmap cells
    if (maxDensity > 0) {
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const count = density[y][x];
          if (count > 0) {
            // Normalize density and create color gradient (green -> yellow -> red)
            const normalizedDensity = count / maxDensity;
            const alpha = Math.min(0.5, normalizedDensity * 0.6); // Max 50% opacity

            // Color gradient: low = green, medium = yellow, high = red
            let r: number, g: number, b: number;
            if (normalizedDensity < 0.5) {
              // Green to yellow
              r = Math.floor(normalizedDensity * 2 * 255);
              g = 200;
              b = 0;
            } else {
              // Yellow to red
              r = 255;
              g = Math.floor((1 - (normalizedDensity - 0.5) * 2) * 200);
              b = 0;
            }

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  /**
   * P3.3: Setup minimap event listeners for zoom and hover
   */
  private setupMinimapListeners(): void {
    // P3.3d: Zoom in button
    this.elements.minimapZoomIn.addEventListener('click', () => {
      this.uiSounds?.playClick();
      this.minimapZoom = Math.min(2.0, this.minimapZoom + 0.25);
    });

    // P3.3d: Zoom out button
    this.elements.minimapZoomOut.addEventListener('click', () => {
      this.uiSounds?.playClick();
      this.minimapZoom = Math.max(0.5, this.minimapZoom - 0.25);
    });

    // P3.3a: Hover detection for player nicknames
    this.elements.minimap.addEventListener('mousemove', (e) => {
      const rect = this.elements.minimap.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Check if mouse is near any player
      let foundPlayer: { x: number; y: number; name: string } | null = null;
      const hoverRadius = 8; // pixels

      for (const playerPos of this.playerPositionsForHover) {
        const dx = mouseX - playerPos.x;
        const dy = mouseY - playerPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= hoverRadius) {
          foundPlayer = playerPos;
          break;
        }
      }

      if (foundPlayer) {
        // Show tooltip
        this.elements.minimapTooltip.textContent = foundPlayer.name;
        this.elements.minimapTooltip.classList.remove('hidden');
        // Position tooltip near the player dot but ensure it stays within minimap bounds
        const tooltipX = Math.min(Math.max(5, foundPlayer.x - 20), 100);
        const tooltipY = Math.max(5, foundPlayer.y - 20);
        this.elements.minimapTooltip.style.left = `${tooltipX}px`;
        this.elements.minimapTooltip.style.top = `${tooltipY}px`;
      } else {
        // Hide tooltip
        this.elements.minimapTooltip.classList.add('hidden');
      }
    });

    // Hide tooltip when mouse leaves minimap
    this.elements.minimap.addEventListener('mouseleave', () => {
      this.elements.minimapTooltip.classList.add('hidden');
    });
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

    // Attach click and hover handlers
    this.elements.upgradeChoices.querySelectorAll('.upgrade-choice').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (id) {
          this.uiSounds?.playUpgradeSelect();
          onSelect(id);
          this.hideUpgradeUI();
        }
      });
      el.addEventListener('mouseenter', () => {
        this.uiSounds?.playHover();
      });
    });

    // Play modal open sound
    this.uiSounds?.playModalOpen();
    this.elements.upgradeModal.classList.remove('hidden');
  }

  /**
   * Hides upgrade modal
   */
  hideUpgradeUI(): void {
    this.elements.upgradeModal.classList.add('hidden');
  }

  /**
   * Shows death screen with stats, rank, and end-of-game leaderboard
   * P3.2d: Enhanced with final rank display and top 5 players leaderboard
   */
  showDeathScreen(stats: DeathStats, onRespawn: () => void): void {
    // Hide upgrade modal if it's showing (player died while selecting upgrade)
    this.hideUpgradeUI();

    // P3.2d: Display final rank
    const rankSuffix = this.getOrdinalSuffix(stats.rank);
    this.elements.deathRank.innerHTML = `
      FINISHED <span style="color: #4ecdc4;">${stats.rank}${rankSuffix}</span> OF ${stats.totalPlayers}
    `;

    // P3.2d: Enhanced stats display with visual layout
    this.elements.deathStats.innerHTML = `
      <div class="death-stat">
        <span class="death-stat-value">${stats.score}</span>
        <span class="death-stat-label">SCORE</span>
      </div>
      <div class="death-stat">
        <span class="death-stat-value">${stats.kills}</span>
        <span class="death-stat-label">KILLS</span>
      </div>
      <div class="death-stat">
        <span class="death-stat-value">${this.formatTime(stats.timeAlive)}</span>
        <span class="death-stat-label">TIME</span>
      </div>
      <div class="death-stat">
        <span class="death-stat-value">${stats.level}</span>
        <span class="death-stat-label">LEVEL</span>
      </div>
    `;

    // P3.2d: End-of-game leaderboard showing top 5 players
    this.elements.deathLeaderboard.innerHTML = stats.topPlayers
      .map((player, index) => {
        // Check if this is the local player (their name will match stored nickname)
        const storedNickname = this.getStoredNickname();
        const isLocal = player.name === storedNickname || player.name === 'YOU';
        return `
          <div class="death-leaderboard-entry ${isLocal ? 'you' : ''}">
            <span class="leaderboard-rank">${index + 1}.</span>
            <span class="leaderboard-name">${player.name}</span>
            <span class="leaderboard-kills">💀${player.kills}</span>
            <span class="leaderboard-score">${player.score}</span>
          </div>
        `;
      })
      .join('');

    // Remove previous listener and add new one
    const newBtn = this.elements.respawnBtn.cloneNode(true) as HTMLElement;
    this.elements.respawnBtn.parentNode?.replaceChild(newBtn, this.elements.respawnBtn);
    this.elements.respawnBtn = newBtn;

    this.elements.respawnBtn.addEventListener('click', () => {
      this.uiSounds?.playClick();
      onRespawn();
      this.hideDeathScreen();
    });

    // Play modal open sound for death screen
    this.uiSounds?.playModalOpen();
    this.elements.deathScreen.classList.remove('hidden');
  }

  /**
   * Returns ordinal suffix for a number (1st, 2nd, 3rd, etc.)
   */
  private getOrdinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
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
    this.elements.settingsBtn.addEventListener('click', () => {
      this.uiSounds?.playClick();
      this.showSettings();
    });

    // Close button closes modal
    const closeBtn = this.container.querySelector('.settings-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.uiSounds?.playClick();
        this.hideSettings();
      });
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

    // CRT effect checkbox (P1.10)
    this.elements.crtCheckbox.addEventListener('change', (e) => {
      this.crtEnabled = (e.target as HTMLInputElement).checked;
      if (this.onCRTSettingsChange) {
        this.onCRTSettingsChange(this.crtEnabled);
      }
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
    this.uiSounds?.playModalOpen();
    this.elements.settingsModal.classList.remove('hidden');
  }

  /**
   * Hides the settings modal
   */
  hideSettings(): void {
    this.uiSounds?.playModalClose();
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
        this.uiSounds?.playClick();
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
    this.uiSounds?.playModalOpen();
    this.elements.pauseOverlay.classList.remove('hidden');

    // Setup resume button handler
    const resumeBtn = this.container.querySelector('.pause-resume-btn');
    const settingsBtn = this.container.querySelector('.pause-settings-btn');

    if (resumeBtn) {
      const newResumeBtn = resumeBtn.cloneNode(true) as HTMLElement;
      resumeBtn.parentNode?.replaceChild(newResumeBtn, resumeBtn);
      newResumeBtn.addEventListener('click', () => {
        this.uiSounds?.playClick();
        this.hidePause();
        onResume();
      });
    }

    if (settingsBtn) {
      const newSettingsBtn = settingsBtn.cloneNode(true) as HTMLElement;
      settingsBtn.parentNode?.replaceChild(newSettingsBtn, settingsBtn);
      newSettingsBtn.addEventListener('click', () => {
        this.uiSounds?.playClick();
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
   * P3.1: Shows the nickname input modal
   * Called before showing the tutorial for first-time players
   * Loads stored nickname from localStorage if available
   * @param onSubmit - Callback with the entered nickname
   */
  showNicknameModal(onSubmit: (nickname: string) => void): void {
    // Load stored nickname if available
    const storedNickname = localStorage.getItem('swarm-io-nickname');
    if (storedNickname) {
      this.elements.nicknameInput.value = storedNickname;
    }

    // Show modal
    this.elements.nicknameModal.classList.remove('hidden');
    this.elements.nicknameInput.focus();

    // Setup submit handler
    const handleSubmit = () => {
      const nickname = this.elements.nicknameInput.value.trim();
      // Store nickname in localStorage for next time
      if (nickname) {
        localStorage.setItem('swarm-io-nickname', nickname);
      }
      this.uiSounds?.playClick();
      this.hideNicknameModal();
      onSubmit(nickname);
    };

    // Clone button to remove existing listeners
    const newBtn = this.elements.nicknameSubmitBtn.cloneNode(true) as HTMLElement;
    this.elements.nicknameSubmitBtn.parentNode?.replaceChild(newBtn, this.elements.nicknameSubmitBtn);
    this.elements.nicknameSubmitBtn = newBtn;

    this.elements.nicknameSubmitBtn.addEventListener('click', handleSubmit);

    // Allow Enter key to submit
    this.elements.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    });
  }

  /**
   * P3.1: Hides the nickname input modal
   */
  hideNicknameModal(): void {
    this.elements.nicknameModal.classList.add('hidden');
  }

  /**
   * P3.1: Gets the stored nickname from localStorage
   * Returns empty string if not found
   */
  getStoredNickname(): string {
    return localStorage.getItem('swarm-io-nickname') || '';
  }

  /**
   * Cleans up HUD resources
   */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
