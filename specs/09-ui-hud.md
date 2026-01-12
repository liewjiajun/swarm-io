# 09 - UI/HUD System

## Overview
Implement the game's user interface including the HUD (health, XP, level, weapons), death screen, upgrade selection, and leaderboard.

## UI Components

```
┌─────────────────────────────────────────────────────────────┐
│  [HP BAR]                                    [LEADERBOARD] │
│  [XP BAR]                                    1. Player123  │
│  Lv.5                                        2. You        │
│                                              3. ProGamer   │
│  [Weapon Icons]                                            │
│  🗡️ Lv3  🔮 Lv2  📖 Lv1                                    │
│                                                             │
│                      [GAME AREA]                           │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│  [MINIMAP]                              Time: 3:45         │
│  [  •  ]                                Wave: 4            │
└─────────────────────────────────────────────────────────────┘
```

## File: src/client/src/ui/HUD.ts

```typescript
export class HUD {
  private container: HTMLElement;
  private elements: {
    healthBar: HTMLElement;
    healthText: HTMLElement;
    xpBar: HTMLElement;
    levelText: HTMLElement;
    weaponsContainer: HTMLElement;
    leaderboard: HTMLElement;
    gameInfo: HTMLElement;
    minimap: HTMLCanvasElement;
  };

  constructor() {
    this.container = document.getElementById('ui') as HTMLElement;
    this.createElements();
    this.elements = this.getElements();
  }

  private createElements() {
    this.container.innerHTML = `
      <div class="hud">
        <!-- Top Left: Health & XP -->
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
            <div class="time">Time: 0:00</div>
            <div class="wave">Wave: 1</div>
            <div class="players">Players: 0</div>
          </div>
        </div>
        
        <!-- Minimap -->
        <div class="hud-minimap">
          <canvas class="minimap" width="150" height="150"></canvas>
        </div>
      </div>
      
      <!-- Upgrade Modal (hidden by default) -->
      <div class="upgrade-modal hidden">
        <div class="upgrade-title">LEVEL UP!</div>
        <div class="upgrade-choices"></div>
      </div>
      
      <!-- Death Screen (hidden by default) -->
      <div class="death-screen hidden">
        <div class="death-title">YOU DIED</div>
        <div class="death-stats"></div>
        <button class="respawn-btn">RESPAWN</button>
      </div>
    `;
    
    this.addStyles();
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .hud {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        font-family: 'Press Start 2P', monospace, sans-serif;
        color: white;
        text-shadow: 2px 2px 0 black;
      }
      
      .hud > div { pointer-events: auto; }
      
      .hud-topleft {
        position: absolute;
        top: 20px;
        left: 20px;
      }
      
      .health-bar, .xp-bar {
        width: 200px;
        height: 20px;
        background: rgba(0,0,0,0.5);
        border: 2px solid white;
        margin-bottom: 5px;
        position: relative;
      }
      
      .health-fill {
        height: 100%;
        background: linear-gradient(to bottom, #ff6b6b, #c0392b);
        transition: width 0.3s;
      }
      
      .xp-fill {
        height: 100%;
        background: linear-gradient(to bottom, #4ecdc4, #1abc9c);
        transition: width 0.3s;
      }
      
      .health-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
      }
      
      .level-text {
        font-size: 14px;
        margin-top: 5px;
      }
      
      .hud-topright {
        position: absolute;
        top: 20px;
        right: 20px;
      }
      
      .leaderboard {
        background: rgba(0,0,0,0.5);
        padding: 10px;
        border: 2px solid white;
        min-width: 180px;
      }
      
      .leaderboard-title {
        font-size: 10px;
        margin-bottom: 10px;
        text-align: center;
      }
      
      .leaderboard-entry {
        font-size: 8px;
        margin: 5px 0;
      }
      
      .leaderboard-entry.you {
        color: #4ecdc4;
      }
      
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
        background: rgba(0,0,0,0.5);
        border: 2px solid white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }
      
      .weapon-level {
        font-size: 8px;
        margin-top: 2px;
      }
      
      .hud-bottomright {
        position: absolute;
        bottom: 20px;
        right: 20px;
      }
      
      .game-info {
        background: rgba(0,0,0,0.5);
        padding: 10px;
        font-size: 10px;
        text-align: right;
      }
      
      .hud-minimap {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
      }
      
      .minimap {
        background: rgba(0,0,0,0.5);
        border: 2px solid white;
      }
      
      .upgrade-modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9);
        padding: 30px;
        border: 4px solid gold;
        text-align: center;
      }
      
      .upgrade-modal.hidden { display: none; }
      
      .upgrade-title {
        font-size: 24px;
        color: gold;
        margin-bottom: 20px;
      }
      
      .upgrade-choices {
        display: flex;
        gap: 15px;
      }
      
      .upgrade-choice {
        width: 150px;
        padding: 15px;
        background: rgba(255,255,255,0.1);
        border: 2px solid white;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .upgrade-choice:hover {
        background: rgba(255,255,255,0.2);
        border-color: gold;
        transform: scale(1.05);
      }
      
      .upgrade-name {
        font-size: 12px;
        margin-bottom: 10px;
      }
      
      .upgrade-desc {
        font-size: 8px;
        color: #aaa;
      }
      
      .death-screen {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      
      .death-screen.hidden { display: none; }
      
      .death-title {
        font-size: 48px;
        color: #ff6b6b;
        margin-bottom: 30px;
      }
      
      .death-stats {
        font-size: 14px;
        margin-bottom: 30px;
        text-align: center;
      }
      
      .respawn-btn {
        font-family: inherit;
        font-size: 16px;
        padding: 15px 30px;
        background: #4ecdc4;
        border: none;
        color: white;
        cursor: pointer;
        text-shadow: 2px 2px 0 black;
      }
      
      .respawn-btn:hover {
        background: #1abc9c;
      }
    `;
    document.head.appendChild(style);
  }

  private getElements() {
    return {
      healthBar: this.container.querySelector('.health-fill') as HTMLElement,
      healthText: this.container.querySelector('.health-text') as HTMLElement,
      xpBar: this.container.querySelector('.xp-fill') as HTMLElement,
      levelText: this.container.querySelector('.level-text') as HTMLElement,
      weaponsContainer: this.container.querySelector('.weapons-container') as HTMLElement,
      leaderboard: this.container.querySelector('.leaderboard-entries') as HTMLElement,
      gameInfo: this.container.querySelector('.game-info') as HTMLElement,
      minimap: this.container.querySelector('.minimap') as HTMLCanvasElement,
    };
  }

  update(player: any, world: any, allPlayers: Map<string, any>, localPlayerId: string) {
    // Health
    const healthPercent = (player.health / player.maxHealth) * 100;
    this.elements.healthBar.style.width = `${healthPercent}%`;
    this.elements.healthText.textContent = `${Math.ceil(player.health)}/${player.maxHealth}`;
    
    // XP
    const xpPercent = (player.xp / player.xpToNextLevel) * 100;
    this.elements.xpBar.style.width = `${xpPercent}%`;
    
    // Level
    this.elements.levelText.textContent = `Lv. ${player.level}`;
    
    // Weapons
    this.updateWeapons(player.weapons);
    
    // Leaderboard
    this.updateLeaderboard(allPlayers, localPlayerId);
    
    // Game info
    this.updateGameInfo(world);
    
    // Minimap
    this.updateMinimap(player, allPlayers, world);
  }

  private updateWeapons(weapons: any[]) {
    const icons: Record<string, string> = {
      knife: '🗡️',
      wand: '🔮',
      bible: '📖',
      garlic: '🧄',
      lightning: '⚡',
      axe: '🪓',
      fireball: '🔥',
      whip: '〰️',
    };
    
    this.elements.weaponsContainer.innerHTML = weapons.map(w => `
      <div class="weapon-icon">
        <span>${icons[w.type] || '❓'}</span>
        <span class="weapon-level">Lv${w.level}</span>
      </div>
    `).join('');
  }

  private updateLeaderboard(players: Map<string, any>, localPlayerId: string) {
    const sorted = Array.from(players.values())
      .filter(p => !p.dead)
      .sort((a, b) => b.timeAlive - a.timeAlive)
      .slice(0, 5);
    
    this.elements.leaderboard.innerHTML = sorted.map((p, i) => {
      const isYou = p.id === localPlayerId;
      const name = isYou ? 'YOU' : `Player ${p.id.slice(0, 4)}`;
      const time = this.formatTime(p.timeAlive);
      return `
        <div class="leaderboard-entry ${isYou ? 'you' : ''}">
          ${i + 1}. ${name} - ${time}
        </div>
      `;
    }).join('');
  }

  private updateGameInfo(world: any) {
    this.elements.gameInfo.innerHTML = `
      <div class="time">Time: ${this.formatTime(world.gameTime)}</div>
      <div class="wave">Wave: ${world.currentWave + 1}</div>
      <div class="players">Players: ${world.playerCount}</div>
    `;
  }

  private updateMinimap(player: any, allPlayers: Map<string, any>, world: any) {
    const ctx = this.elements.minimap.getContext('2d')!;
    const size = 150;
    const worldRadius = world.worldRadius;
    const scale = size / (worldRadius * 2.5);
    
    // Clear
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, size, size);
    
    // World boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(size/2, size/2, worldRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
    
    // Other players
    ctx.fillStyle = '#0088ff';
    allPlayers.forEach(p => {
      if (p.dead) return;
      const x = size/2 + p.x * scale;
      const y = size/2 + p.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Local player
    ctx.fillStyle = '#00ff00';
    const px = size/2 + player.x * scale;
    const py = size/2 + player.y * scale;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  showUpgradeUI(choices: any[], onSelect: (id: string) => void) {
    const modal = this.container.querySelector('.upgrade-modal') as HTMLElement;
    const choicesContainer = modal.querySelector('.upgrade-choices') as HTMLElement;
    
    choicesContainer.innerHTML = choices.map(choice => `
      <div class="upgrade-choice" data-id="${choice.id}">
        <div class="upgrade-name">${choice.weaponType || choice.statType || 'Upgrade'}</div>
        <div class="upgrade-desc">${choice.description}</div>
      </div>
    `).join('');
    
    // Add click handlers
    choicesContainer.querySelectorAll('.upgrade-choice').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        onSelect(id);
        this.hideUpgradeUI();
      });
    });
    
    modal.classList.remove('hidden');
  }

  hideUpgradeUI() {
    const modal = this.container.querySelector('.upgrade-modal') as HTMLElement;
    modal.classList.add('hidden');
  }

  showDeathScreen(stats: { kills: number; timeAlive: number; level: number }, onRespawn: () => void) {
    const screen = this.container.querySelector('.death-screen') as HTMLElement;
    const statsEl = screen.querySelector('.death-stats') as HTMLElement;
    const respawnBtn = screen.querySelector('.respawn-btn') as HTMLElement;
    
    statsEl.innerHTML = `
      <div>Time Survived: ${this.formatTime(stats.timeAlive)}</div>
      <div>Enemies Killed: ${stats.kills}</div>
      <div>Level Reached: ${stats.level}</div>
    `;
    
    respawnBtn.onclick = () => {
      onRespawn();
      this.hideDeathScreen();
    };
    
    screen.classList.remove('hidden');
  }

  hideDeathScreen() {
    const screen = this.container.querySelector('.death-screen') as HTMLElement;
    screen.classList.add('hidden');
  }
}
```

## Acceptance Criteria

1. Health bar shows current/max health with visual fill
2. XP bar fills as XP is gained
3. Level number updates on level up
4. Weapon icons show all equipped weapons with levels
5. Leaderboard shows top 5 players by survival time
6. Game info shows time, wave, and player count
7. Minimap shows player positions relative to world
8. Upgrade modal appears on level up with clickable choices
9. Death screen shows stats and respawn button
10. All UI is styled with pixel-art aesthetic
11. UI doesn't block game interaction (pointer-events: none on container)
