// MUST be imported BEFORE any schema classes for decorators to work
import 'reflect-metadata';

import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom.js';
import { logger } from './utils/logger.js';
import { getTelemetryService } from './services/TelemetryService.js';

// Create Express app
const app = express();

// Parse JSON bodies
app.use(express.json());

// CORS configuration - uses environment variable or defaults to localhost for development
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Create HTTP server
const server = createServer(app);

// Extract allowed origin host for WebSocket verification
// Supports both 'http://hostname:port' and '*' (allow all) formats
const getAllowedOriginHost = (corsOrigin: string): string | null => {
  if (corsOrigin === '*') return null; // Allow all origins
  try {
    return new URL(corsOrigin).host;
  } catch {
    return null;
  }
};
const ALLOWED_ORIGIN_HOST = getAllowedOriginHost(CORS_ORIGIN);

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    verifyClient: (info: { origin?: string }) => {
      // Allow if no origin (non-browser clients) or if CORS_ORIGIN is '*'
      if (!info.origin || CORS_ORIGIN === '*') return true;

      // Allow localhost/127.0.0.1 in development mode
      const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
      if (isDevelopment && (info.origin.includes('localhost') || info.origin.includes('127.0.0.1'))) {
        return true;
      }

      // Check against configured CORS origin
      if (ALLOWED_ORIGIN_HOST) {
        try {
          const requestHost = new URL(info.origin).host;
          return requestHost === ALLOWED_ORIGIN_HOST;
        } catch {
          return false;
        }
      }

      return true; // Allow if no specific host configured
    }
  })
});

// Register GameRoom handler
// autoDispose: false prevents room from being disposed when empty (fixes "room disposed" error)
gameServer.define('game', GameRoom, {
  autoDispose: false
});

// Add Colyseus monitor endpoint for debugging
app.use('/colyseus', monitor());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: 'swarm-io game server'
  });
});

// API endpoint to get room statistics
app.get('/api/stats', (req, res) => {
  res.json({
    serverUptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// P2.10: API endpoint to get telemetry data for balance analysis
app.get('/api/telemetry', (req, res) => {
  const telemetry = getTelemetryService();
  res.json({
    stats: telemetry.getStats(),
    collectionDuration: telemetry.getCollectionDuration(),
    timestamp: new Date().toISOString()
  });
});

// P2.10: API endpoint to get recent session data (for detailed analysis)
app.get('/api/telemetry/sessions', (req, res) => {
  const telemetry = getTelemetryService();
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  res.json({
    sessions: telemetry.getRecentSessions(limit),
    timestamp: new Date().toISOString()
  });
});

// P2.10: API endpoint to get recent upgrade choices (for detailed analysis)
app.get('/api/telemetry/upgrades', (req, res) => {
  const telemetry = getTelemetryService();
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  res.json({
    upgrades: telemetry.getRecentUpgradeChoices(limit),
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, path: req.path }, 'Server error');
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

const PORT = parseInt(process.env.PORT || '2567', 10);

// Start server
gameServer.listen(PORT).then(() => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║              SWARM.IO SERVER                      ║
║           Multiplayer Game Server                 ║
╠═══════════════════════════════════════════════════╣
║ Server started on port ${PORT}                       ║
║ Game endpoint: ws://localhost:${PORT}/game            ║
║ Monitor: http://localhost:${PORT}/colyseus            ║
║ Health: http://localhost:${PORT}/health               ║
║ Stats: http://localhost:${PORT}/api/stats             ║
║ Telemetry: http://localhost:${PORT}/api/telemetry     ║
╚═══════════════════════════════════════════════════╝
  `);

  console.log('[Server] Game features enabled:');
  console.log('  ✓ Wave-based enemy spawning');
  console.log('  ✓ 4 weapon types (knife, wand, bible, garlic)');
  console.log('  ✓ Damage validation & security');
  console.log('  ✓ XP collection & leveling');
  console.log('  ✓ Multiplayer up to 150 players per room');
  console.log('  ✓ Real-time monitoring & stats');

}).catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');

  gameServer.gracefullyShutdown().then(() => {
    logger.info('Server shut down gracefully');
    process.exit(0);
  }).catch((error) => {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');

  gameServer.gracefullyShutdown().then(() => {
    logger.info('Server shut down gracefully');
    process.exit(0);
  }).catch((error) => {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  });
});

// Log unhandled errors
process.on('unhandledRejection', (reason, _promise) => {
  logger.error({ err: reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception');
  process.exit(1);
});