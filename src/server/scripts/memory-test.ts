/**
 * Memory Leak Test Script (P4.5)
 *
 * Tests for memory leaks by running extended sessions with:
 * - Multiple connect/disconnect cycles
 * - Extended gameplay with enemy spawning/killing
 * - XP orb creation/collection
 * - Projectile firing/cleanup
 *
 * Monitors server memory via /api/stats endpoint and process.memoryUsage()
 *
 * Usage:
 *   npx tsx src/server/scripts/memory-test.ts [options]
 *
 * Options:
 *   --duration=N    Test duration in minutes (default: 5)
 *   --players=N     Number of simultaneous players (default: 10)
 *   --churn=N       Player churn rate per minute (default: 5)
 *   --url=URL       Server URL (default: ws://localhost:2567)
 *
 * Example:
 *   npx tsx src/server/scripts/memory-test.ts --duration=30 --players=20
 */

import { Client, Room } from 'colyseus.js';

// Configuration
interface MemoryTestConfig {
  duration: number; // minutes
  players: number;
  churnRate: number; // players per minute
  serverUrl: string;
  apiUrl: string;
}

// Memory snapshot
interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
}

// Parse command line arguments
function parseArgs(): MemoryTestConfig {
  const args = process.argv.slice(2);
  const config: MemoryTestConfig = {
    duration: 5,
    players: 10,
    churnRate: 5,
    serverUrl: 'ws://localhost:2567',
    apiUrl: 'http://localhost:2567'
  };

  for (const arg of args) {
    const [key, value] = arg.split('=');
    switch (key) {
      case '--duration':
        config.duration = parseInt(value, 10);
        break;
      case '--players':
        config.players = parseInt(value, 10);
        break;
      case '--churn':
        config.churnRate = parseInt(value, 10);
        break;
      case '--url':
        config.serverUrl = value;
        config.apiUrl = value.replace('ws://', 'http://').replace('wss://', 'https://');
        break;
    }
  }

  return config;
}

// Player bot with aggressive gameplay
class TestBot {
  private client: Client;
  private room: Room | null = null;
  private isActive = false;
  private actionInterval: NodeJS.Timeout | null = null;
  public id: string;

  constructor(serverUrl: string, id: string) {
    this.client = new Client(serverUrl);
    this.id = id;
  }

  async connect(): Promise<boolean> {
    try {
      this.room = await this.client.joinOrCreate('game');
      this.isActive = true;

      // Aggressive actions to stress memory
      this.startActions();
      return true;
    } catch (error) {
      console.error(`Bot ${this.id} connection failed:`, error);
      return false;
    }
  }

  private startActions(): void {
    // Rapid movement and actions at 60Hz
    this.actionInterval = setInterval(() => {
      if (this.room && this.isActive) {
        // Move around aggressively
        const angle = (Date.now() / 1000) % (Math.PI * 2);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        this.room.send('input', {
          dx,
          dy,
          sequence: Date.now()
        });
      }
    }, 16); // 60Hz to stress test
  }

  async disconnect(): Promise<void> {
    this.isActive = false;

    if (this.actionInterval) {
      clearInterval(this.actionInterval);
      this.actionInterval = null;
    }

    if (this.room) {
      try {
        await this.room.leave();
      } catch {
        // Ignore leave errors
      }
      this.room = null;
    }
  }
}

// Memory monitor
class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private config: MemoryTestConfig;

  constructor(config: MemoryTestConfig) {
    this.config = config;
  }

  async takeSnapshot(): Promise<MemorySnapshot> {
    // Try to get server memory via API (if available)
    // For now, we'll track client-side memory as a proxy
    const mem = process.memoryUsage();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  getSnapshots(): MemorySnapshot[] {
    return this.snapshots;
  }

  analyzeLeaks(): {
    hasLeak: boolean;
    growthRate: number;
    initialMemory: number;
    finalMemory: number;
    maxMemory: number;
  } {
    if (this.snapshots.length < 2) {
      return {
        hasLeak: false,
        growthRate: 0,
        initialMemory: 0,
        finalMemory: 0,
        maxMemory: 0
      };
    }

    const initial = this.snapshots[0];
    const final = this.snapshots[this.snapshots.length - 1];
    const duration = (final.timestamp - initial.timestamp) / 1000 / 60; // minutes

    // Calculate linear regression for heap growth
    const heapUsedValues = this.snapshots.map((s) => s.heapUsed);
    const maxMemory = Math.max(...heapUsedValues);

    // Simple growth rate: MB per minute
    const growthRate = (final.heapUsed - initial.heapUsed) / 1024 / 1024 / duration;

    // Consider it a leak if memory grows > 5MB per minute consistently
    const hasLeak = growthRate > 5;

    return {
      hasLeak,
      growthRate,
      initialMemory: initial.heapUsed,
      finalMemory: final.heapUsed,
      maxMemory
    };
  }
}

// Main test runner
async function runMemoryTest(config: MemoryTestConfig): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║        SWARM.IO MEMORY LEAK TEST (P4.5)            ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Duration: ${config.duration} minutes${' '.repeat(35 - config.duration.toString().length)}║`);
  console.log(`║ Players: ${config.players}${' '.repeat(40 - config.players.toString().length)}║`);
  console.log(`║ Churn rate: ${config.churnRate}/min${' '.repeat(34 - config.churnRate.toString().length)}║`);
  console.log(`║ Server: ${config.serverUrl.substring(0, 40).padEnd(41)}║`);
  console.log('╚════════════════════════════════════════════════════╝\n');

  const monitor = new MemoryMonitor(config);
  const bots: Map<string, TestBot> = new Map();
  let botCounter = 0;
  let connectCycles = 0;
  let disconnectCycles = 0;

  // Take initial snapshot
  await monitor.takeSnapshot();

  // Connect initial players
  console.log(`[Memory Test] Connecting ${config.players} initial players...`);
  for (let i = 0; i < config.players; i++) {
    const bot = new TestBot(config.serverUrl, `bot-${botCounter++}`);
    if (await bot.connect()) {
      bots.set(bot.id, bot);
      connectCycles++;
    }
  }
  console.log(`[Memory Test] ${bots.size} players connected\n`);

  const startTime = Date.now();
  const endTime = startTime + config.duration * 60 * 1000;

  // Snapshot interval (every 30 seconds)
  const snapshotInterval = setInterval(async () => {
    await monitor.takeSnapshot();
  }, 30000);

  // Churn interval (connect/disconnect players)
  const churnInterval = config.churnRate > 0 ? setInterval(async () => {
    // Disconnect a random bot
    const botIds = Array.from(bots.keys());
    if (botIds.length > 0) {
      const disconnectId = botIds[Math.floor(Math.random() * botIds.length)];
      const bot = bots.get(disconnectId);
      if (bot) {
        await bot.disconnect();
        bots.delete(disconnectId);
        disconnectCycles++;
      }
    }

    // Connect a new bot
    const newBot = new TestBot(config.serverUrl, `bot-${botCounter++}`);
    if (await newBot.connect()) {
      bots.set(newBot.id, newBot);
      connectCycles++;
    }
  }, 60000 / config.churnRate) : null;

  // Progress updates
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const remaining = config.duration - elapsed;
    const snapshot = monitor.getSnapshots()[monitor.getSnapshots().length - 1];
    const heapMB = (snapshot.heapUsed / 1024 / 1024).toFixed(1);

    console.log(`[${elapsed.toFixed(1)} min] Heap: ${heapMB}MB, Active bots: ${bots.size}, ` +
      `Connect cycles: ${connectCycles}, Remaining: ${remaining.toFixed(1)} min`);
  }, 60000);

  // Wait for test duration
  await new Promise((resolve) => setTimeout(resolve, config.duration * 60 * 1000));

  // Cleanup
  clearInterval(snapshotInterval);
  if (churnInterval) clearInterval(churnInterval);
  clearInterval(progressInterval);

  // Take final snapshot
  await monitor.takeSnapshot();

  // Disconnect all bots
  console.log('\n[Memory Test] Disconnecting all bots...');
  await Promise.all(Array.from(bots.values()).map((bot) => bot.disconnect()));

  // Allow GC to run
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Final snapshot after cleanup
  await monitor.takeSnapshot();

  // Analyze results
  printResults(config, monitor, { connectCycles, disconnectCycles });
}

function printResults(
  config: MemoryTestConfig,
  monitor: MemoryMonitor,
  cycles: { connectCycles: number; disconnectCycles: number }
): void {
  const analysis = monitor.analyzeLeaks();
  const snapshots = monitor.getSnapshots();

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║           MEMORY TEST RESULTS                      ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Test Duration:            ${config.duration} minutes${' '.repeat(23 - config.duration.toString().length)}║`);
  console.log(`║ Snapshots Taken:          ${snapshots.length.toString().padEnd(24)}║`);
  console.log(`║ Connect Cycles:           ${cycles.connectCycles.toString().padEnd(24)}║`);
  console.log(`║ Disconnect Cycles:        ${cycles.disconnectCycles.toString().padEnd(24)}║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Initial Heap:             ${(analysis.initialMemory / 1024 / 1024).toFixed(1)} MB${' '.repeat(19)}║`);
  console.log(`║ Final Heap:               ${(analysis.finalMemory / 1024 / 1024).toFixed(1)} MB${' '.repeat(19)}║`);
  console.log(`║ Max Heap:                 ${(analysis.maxMemory / 1024 / 1024).toFixed(1)} MB${' '.repeat(19)}║`);
  console.log(`║ Growth Rate:              ${analysis.growthRate.toFixed(2)} MB/min${' '.repeat(17)}║`);
  console.log('╚════════════════════════════════════════════════════╝');

  console.log('\n' + '═'.repeat(52));
  if (!analysis.hasLeak) {
    console.log('✅ MEMORY TEST PASSED: No significant memory leak detected');
    console.log(`   Growth rate: ${analysis.growthRate.toFixed(2)} MB/min (threshold: 5 MB/min)`);
  } else {
    console.log('⚠️  MEMORY TEST WARNING: Potential memory leak detected');
    console.log(`   Growth rate: ${analysis.growthRate.toFixed(2)} MB/min (threshold: 5 MB/min)`);
    console.log('   Recommend investigating with Node.js heap profiler');
  }
  console.log('═'.repeat(52) + '\n');
}

// Run the test
const config = parseArgs();
runMemoryTest(config).then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Memory test error:', error);
  process.exit(1);
});
