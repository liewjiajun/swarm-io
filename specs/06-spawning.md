# 06 - Enemy Spawning System

## Overview
Implement time-based wave spawning for enemies. Enemies spawn at the edge of the world and move toward players. Difficulty scales with time and player count.

## File: src/server/src/systems/SpawnSystem.ts

```typescript
import type { GameState } from '../state/GameState';
import type { SpatialHash } from './SpatialHash';
import { GAME_CONSTANTS, WAVE_SCHEDULE, ENEMY_CONFIGS, randomPointOnCircle } from '@swarm-io/shared';

export class SpawnSystem {
  private lastWaveTime: number = 0;
  private spawnTimer: number = 0;
  private bossSpawned: Set<number> = new Set();

  constructor(
    private state: GameState,
    private spatialHash: SpatialHash
  ) {}

  update(dt: number) {
    const gameTime = this.state.world.gameTime;
    
    // Update difficulty
    this.state.world.updateDifficulty();
    
    // Find current wave
    const currentWave = this.getCurrentWave(gameTime);
    if (!currentWave) return;
    
    // Update wave number
    const waveIndex = WAVE_SCHEDULE.indexOf(currentWave);
    this.state.world.currentWave = waveIndex;
    
    // Spawn boss if not yet spawned for this wave
    if (currentWave.boss && !this.bossSpawned.has(waveIndex)) {
      this.spawnBoss(currentWave.boss);
      this.bossSpawned.add(waveIndex);
    }
    
    // Regular enemy spawning
    this.spawnTimer += dt;
    const spawnInterval = this.calculateSpawnInterval();
    
    while (this.spawnTimer >= spawnInterval) {
      this.spawnTimer -= spawnInterval;
      this.spawnWaveEnemies(currentWave);
    }
  }

  private getCurrentWave(gameTime: number): typeof WAVE_SCHEDULE[0] | null {
    // Find the wave that applies at current time
    let currentWave = null;
    for (const wave of WAVE_SCHEDULE) {
      if (wave.time <= gameTime) {
        currentWave = wave;
      } else {
        break;
      }
    }
    return currentWave;
  }

  private calculateSpawnInterval(): number {
    // Base spawn interval of 0.5 seconds, decreases with player count
    const playerCount = this.state.world.playerCount;
    const baseInterval = 0.5;
    const minInterval = 0.1;
    
    // More players = faster spawning
    return Math.max(minInterval, baseInterval - (playerCount * 0.02));
  }

  private spawnWaveEnemies(wave: typeof WAVE_SCHEDULE[0]) {
    const playerCount = Math.max(1, this.state.world.playerCount);
    const maxEnemies = playerCount * GAME_CONSTANTS.MAX_ENEMIES_PER_PLAYER;
    
    // Count current enemies
    const currentEnemyCount = this.state.enemies.size;
    if (currentEnemyCount >= maxEnemies) return;
    
    // Pick a random enemy type from this wave's roster
    const totalWeight = wave.enemies.reduce((sum, e) => sum + e.count, 0);
    let random = Math.random() * totalWeight;
    
    let selectedType = wave.enemies[0].type;
    for (const enemyDef of wave.enemies) {
      random -= enemyDef.count;
      if (random <= 0) {
        selectedType = enemyDef.type;
        break;
      }
    }
    
    // Spawn at world edge
    this.spawnEnemy(selectedType);
  }

  private spawnEnemy(type: string) {
    const config = ENEMY_CONFIGS[type];
    if (!config) return;
    
    // Spawn at edge of world, slightly outside
    const spawnRadius = this.state.world.worldRadius + GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE;
    const spawnPos = randomPointOnCircle(spawnRadius);
    
    // Optional: Spawn near a player instead of random edge
    const players = Array.from(this.state.players.values()).filter(p => !p.dead);
    if (players.length > 0 && Math.random() < 0.7) {
      // 70% chance to spawn near a random player
      const targetPlayer = players[Math.floor(Math.random() * players.length)];
      const angle = Math.random() * Math.PI * 2;
      const distance = GAME_CONSTANTS.ENEMY_SPAWN_DISTANCE;
      
      spawnPos.x = targetPlayer.x + Math.cos(angle) * distance;
      spawnPos.y = targetPlayer.y + Math.sin(angle) * distance;
    }
    
    const enemy = this.state.addEnemy(type, spawnPos.x, spawnPos.y);
    enemy.initialize(type, this.state.world.difficulty);
  }

  private spawnBoss(bossType: string) {
    const config = ENEMY_CONFIGS[bossType];
    if (!config) return;
    
    // Spawn boss at center-ish location
    const spawnRadius = this.state.world.worldRadius * 0.3;
    const spawnPos = randomPointOnCircle(spawnRadius);
    
    const boss = this.state.addEnemy(bossType, spawnPos.x, spawnPos.y);
    boss.initialize(bossType, this.state.world.difficulty);
    
    console.log(`Boss spawned: ${bossType} at (${spawnPos.x.toFixed(0)}, ${spawnPos.y.toFixed(0)})`);
  }

  getPlayerSpawnPosition(): { x: number; y: number } {
    // Spawn players near center with some spread
    const spawnRadius = Math.min(100, this.state.world.worldRadius * 0.2);
    return randomPointOnCircle(spawnRadius);
  }
}
```

## Wave Progression

The wave system follows this schedule (defined in constants):

| Time | Enemies | Boss |
|------|---------|------|
| 0:00 | Bats (20) | - |
| 0:30 | Bats (30), Skeletons (5) | - |
| 1:00 | Bats (25), Skeletons (15) | - |
| 1:30 | Skeletons (20), Zombies (10) | - |
| 2:00 | Zombies (20), Ghosts (15) | Giant Slime |
| 3:00 | Ghosts (30), Slimes (20) | - |
| 4:00 | Slimes (30), Demons (10) | Skeleton King |
| 5:00 | Demons (25), Zombies (30) | - |
| 6:00 | Demons (40), Ghosts (30) | Demon Lord |

After 6 minutes, the last wave repeats with increasing difficulty multiplier.

## Difficulty Scaling

```typescript
difficulty = 1 + (gameTime / 300) * 0.5
```

- At 0:00: 1.0x
- At 5:00: 1.5x
- At 10:00: 2.0x
- At 15:00: 2.5x

Difficulty multiplier affects:
- Enemy health
- Enemy damage

## Spawn Rate Scaling

Base spawn interval: 0.5 seconds

With players:
- 1 player: 0.48s
- 10 players: 0.3s
- 20 players: 0.1s (minimum)

Maximum enemies = playerCount × 50

## Acceptance Criteria

1. Enemies spawn at world edge
2. Spawn rate scales with player count
3. Enemy types follow wave schedule
4. Bosses spawn once per wave
5. Difficulty scales with time
6. Enemy count respects maximum cap
7. 70% of spawns occur near players
8. Players spawn near world center
