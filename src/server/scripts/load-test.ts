/**
 * Load Test Script (P4.6)
 *
 * Simulates multiple concurrent players connecting to the server to test:
 * - Connection handling for 150+ players
 * - Server performance under load
 * - State synchronization with many clients
 * - Message throughput
 *
 * Usage:
 *   npx tsx src/server/scripts/load-test.ts [options]
 *
 * Options:
 *   --players=N     Number of simulated players (default: 50)
 *   --duration=N    Test duration in seconds (default: 60)
 *   --rampup=N      Ramp-up time in seconds (default: 10)
 *   --url=URL       Server URL (default: ws://localhost:2567)
 *
 * Example:
 *   npx tsx src/server/scripts/load-test.ts --players=150 --duration=120
 */

import { Client, Room } from 'colyseus.js';

// Configuration
interface LoadTestConfig {
  players: number;
  duration: number;
  rampupTime: number;
  serverUrl: string;
}

// Parse command line arguments
function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const config: LoadTestConfig = {
    players: 50,
    duration: 60,
    rampupTime: 10,
    serverUrl: 'ws://localhost:2567'
  };

  for (const arg of args) {
    const [key, value] = arg.split('=');
    switch (key) {
      case '--players':
        config.players = parseInt(value, 10);
        break;
      case '--duration':
        config.duration = parseInt(value, 10);
        break;
      case '--rampup':
        config.rampupTime = parseInt(value, 10);
        break;
      case '--url':
        config.serverUrl = value;
        break;
    }
  }

  return config;
}

// Metrics tracking
interface Metrics {
  connectionsAttempted: number;
  connectionsSuccessful: number;
  connectionsFailed: number;
  messagesReceived: number;
  messagesSent: number;
  stateUpdates: number;
  errors: string[];
  latencies: number[];
}

// Simulated player bot
class PlayerBot {
  private client: Client;
  private room: Room | null = null;
  private isActive = false;
  private moveInterval: NodeJS.Timeout | null = null;
  private metrics: Metrics;

  constructor(serverUrl: string, metrics: Metrics) {
    this.client = new Client(serverUrl);
    this.metrics = metrics;
  }

  async connect(): Promise<boolean> {
    this.metrics.connectionsAttempted++;

    try {
      const startTime = Date.now();
      this.room = await this.client.joinOrCreate('game');
      const latency = Date.now() - startTime;
      this.metrics.latencies.push(latency);
      this.metrics.connectionsSuccessful++;
      this.isActive = true;

      // Track state updates
      this.room.onStateChange(() => {
        this.metrics.stateUpdates++;
        this.metrics.messagesReceived++;
      });

      // Start simulating player movement
      this.startMovement();
      return true;
    } catch (error) {
      this.metrics.connectionsFailed++;
      this.metrics.errors.push(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private startMovement(): void {
    // Send movement inputs at ~30Hz like a real player
    this.moveInterval = setInterval(() => {
      if (this.room && this.isActive) {
        // Random movement direction
        const dx = (Math.random() - 0.5) * 2;
        const dy = (Math.random() - 0.5) * 2;

        this.room.send('input', {
          dx,
          dy,
          sequence: Date.now()
        });
        this.metrics.messagesSent++;
      }
    }, 33); // ~30Hz
  }

  async disconnect(): Promise<void> {
    this.isActive = false;

    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }

    if (this.room) {
      await this.room.leave();
      this.room = null;
    }
  }
}

// Main load test runner
async function runLoadTest(config: LoadTestConfig): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║           SWARM.IO LOAD TEST (P4.6)                ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Target players: ${config.players.toString().padEnd(35)}║`);
  console.log(`║ Duration: ${config.duration}s${' '.repeat(38 - config.duration.toString().length)}║`);
  console.log(`║ Ramp-up: ${config.rampupTime}s${' '.repeat(39 - config.rampupTime.toString().length)}║`);
  console.log(`║ Server: ${config.serverUrl.substring(0, 40).padEnd(41)}║`);
  console.log('╚════════════════════════════════════════════════════╝\n');

  const metrics: Metrics = {
    connectionsAttempted: 0,
    connectionsSuccessful: 0,
    connectionsFailed: 0,
    messagesReceived: 0,
    messagesSent: 0,
    stateUpdates: 0,
    errors: [],
    latencies: []
  };

  const bots: PlayerBot[] = [];

  // Calculate connection interval for ramp-up
  const connectionInterval = (config.rampupTime * 1000) / config.players;

  console.log(`[Load Test] Starting ramp-up: connecting ${config.players} players over ${config.rampupTime}s`);

  // Connect players gradually
  for (let i = 0; i < config.players; i++) {
    const bot = new PlayerBot(config.serverUrl, metrics);
    bots.push(bot);

    bot.connect().then((success) => {
      if (success) {
        process.stdout.write('.');
      } else {
        process.stdout.write('x');
      }
    });

    // Wait between connections to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, connectionInterval));
  }

  console.log('\n');
  console.log(`[Load Test] Ramp-up complete: ${metrics.connectionsSuccessful}/${config.players} connected`);

  // Wait for test duration
  const testDuration = config.duration - config.rampupTime;
  console.log(`[Load Test] Running test for ${testDuration}s...`);

  // Progress updates every 10 seconds
  const progressInterval = setInterval(() => {
    console.log(`  Active: ${metrics.connectionsSuccessful - metrics.connectionsFailed}, ` +
      `Messages: ${metrics.messagesSent} sent / ${metrics.messagesReceived} received`);
  }, 10000);

  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));

  clearInterval(progressInterval);

  // Disconnect all bots
  console.log('[Load Test] Disconnecting bots...');
  await Promise.all(bots.map((bot) => bot.disconnect()));

  // Print results
  printResults(config, metrics);
}

function printResults(config: LoadTestConfig, metrics: Metrics): void {
  const avgLatency = metrics.latencies.length > 0
    ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
    : 0;

  const maxLatency = metrics.latencies.length > 0
    ? Math.max(...metrics.latencies)
    : 0;

  const minLatency = metrics.latencies.length > 0
    ? Math.min(...metrics.latencies)
    : 0;

  // Sort latencies for percentile calculation
  const sortedLatencies = [...metrics.latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95Latency = sortedLatencies[p95Index] || 0;

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              LOAD TEST RESULTS                     ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Connections Attempted:    ${metrics.connectionsAttempted.toString().padEnd(24)}║`);
  console.log(`║ Connections Successful:   ${metrics.connectionsSuccessful.toString().padEnd(24)}║`);
  console.log(`║ Connections Failed:       ${metrics.connectionsFailed.toString().padEnd(24)}║`);
  console.log(`║ Success Rate:             ${((metrics.connectionsSuccessful / metrics.connectionsAttempted) * 100).toFixed(1)}%${' '.repeat(21)}║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Messages Sent:            ${metrics.messagesSent.toString().padEnd(24)}║`);
  console.log(`║ Messages Received:        ${metrics.messagesReceived.toString().padEnd(24)}║`);
  console.log(`║ State Updates:            ${metrics.stateUpdates.toString().padEnd(24)}║`);
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║ Avg Connection Latency:   ${avgLatency.toFixed(0)}ms${' '.repeat(21 - avgLatency.toFixed(0).length)}║`);
  console.log(`║ Min Connection Latency:   ${minLatency}ms${' '.repeat(23 - minLatency.toString().length)}║`);
  console.log(`║ Max Connection Latency:   ${maxLatency}ms${' '.repeat(23 - maxLatency.toString().length)}║`);
  console.log(`║ P95 Connection Latency:   ${p95Latency}ms${' '.repeat(23 - p95Latency.toString().length)}║`);
  console.log('╚════════════════════════════════════════════════════╝');

  if (metrics.errors.length > 0) {
    console.log('\nErrors encountered:');
    const uniqueErrors = [...new Set(metrics.errors)].slice(0, 10);
    uniqueErrors.forEach((err) => console.log(`  - ${err}`));
    if (metrics.errors.length > 10) {
      console.log(`  ... and ${metrics.errors.length - 10} more`);
    }
  }

  // Pass/Fail criteria
  const successRate = metrics.connectionsSuccessful / metrics.connectionsAttempted;
  const targetMet = metrics.connectionsSuccessful >= config.players * 0.95; // 95% target

  console.log('\n' + '═'.repeat(52));
  if (targetMet && successRate >= 0.95) {
    console.log('✅ LOAD TEST PASSED: Server handled target load');
  } else {
    console.log('❌ LOAD TEST FAILED: Server did not meet target');
    console.log(`   Target: ${config.players} players, Achieved: ${metrics.connectionsSuccessful}`);
  }
  console.log('═'.repeat(52) + '\n');
}

// Run the test
const config = parseArgs();
runLoadTest(config).then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Load test error:', error);
  process.exit(1);
});
