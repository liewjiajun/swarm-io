// MUST be imported BEFORE any schema classes for decorators to work
import 'reflect-metadata';

import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
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

// SSL/TLS Configuration (P4.3)
// Set SSL_CERT_PATH and SSL_KEY_PATH environment variables to enable HTTPS
// In production, consider using a reverse proxy (nginx, cloudflare) instead
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CA_PATH = process.env.SSL_CA_PATH; // Optional CA certificate

// Determine if SSL is enabled
const isSSLEnabled = SSL_CERT_PATH && SSL_KEY_PATH;

// Create HTTP or HTTPS server based on SSL configuration
let server;
if (isSSLEnabled) {
  try {
    const sslOptions: { key: Buffer; cert: Buffer; ca?: Buffer } = {
      key: readFileSync(SSL_KEY_PATH),
      cert: readFileSync(SSL_CERT_PATH)
    };

    // Add CA certificate if provided (for chain validation)
    if (SSL_CA_PATH) {
      sslOptions.ca = readFileSync(SSL_CA_PATH);
    }

    server = createHttpsServer(sslOptions, app);
    logger.info({ certPath: SSL_CERT_PATH }, 'SSL/TLS enabled - using HTTPS');
  } catch (error) {
    logger.fatal({ err: error, certPath: SSL_CERT_PATH, keyPath: SSL_KEY_PATH },
      'Failed to load SSL certificates - check paths and permissions');
    process.exit(1);
  }
} else {
  server = createHttpServer(app);
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Running in production without SSL/TLS - recommend using HTTPS');
  }
}

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

// Protocol strings for startup message
const wsProtocol = isSSLEnabled ? 'wss' : 'ws';
const httpProtocol = isSSLEnabled ? 'https' : 'http';

// Start server
gameServer.listen(PORT).then(() => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║              SWARM.IO SERVER                      ║
║           Multiplayer Game Server                 ║
╠═══════════════════════════════════════════════════╣
║ Server started on port ${PORT}                       ║
║ SSL/TLS: ${isSSLEnabled ? 'ENABLED' : 'DISABLED'}                                    ║
║ Game endpoint: ${wsProtocol}://localhost:${PORT}/game            ║
║ Monitor: ${httpProtocol}://localhost:${PORT}/colyseus            ║
║ Health: ${httpProtocol}://localhost:${PORT}/health               ║
║ Stats: ${httpProtocol}://localhost:${PORT}/api/stats             ║
║ Telemetry: ${httpProtocol}://localhost:${PORT}/api/telemetry     ║
╚═══════════════════════════════════════════════════╝
  `);

  console.log('[Server] Game features enabled:');
  console.log('  ✓ Wave-based enemy spawning');
  console.log('  ✓ 8 weapon types (all implemented)');
  console.log('  ✓ Damage validation & security');
  console.log('  ✓ XP collection & leveling');
  console.log('  ✓ Multiplayer up to 150 players per room');
  console.log('  ✓ Real-time monitoring & stats');
  if (isSSLEnabled) {
    console.log('  ✓ SSL/TLS encryption enabled');
  }

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