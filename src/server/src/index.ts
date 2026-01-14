// MUST be imported BEFORE any schema classes for decorators to work
import 'reflect-metadata';

import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import express from 'express';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom.js';

// Create Express app
const app = express();

// Parse JSON bodies
app.use(express.json());

// CORS middleware for client development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
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

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    verifyClient: (info: any) => {
      // Basic verification - allow connections from localhost during development
      const origin = info.origin;
      return !origin || origin.includes('localhost') || origin.includes('127.0.0.1');
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

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Error:', error);
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
╔═══════════════════════════════════════════════╗
║              SWARM.IO SERVER                  ║
║           Multiplayer Game Server             ║
╠═══════════════════════════════════════════════╣
║ 🚀 Server started on port ${PORT}                ║
║ 🎮 Game endpoint: ws://localhost:${PORT}/game     ║
║ 📊 Monitor: http://localhost:${PORT}/colyseus     ║
║ 🩺 Health: http://localhost:${PORT}/health        ║
║ 📈 Stats: http://localhost:${PORT}/api/stats      ║
╚═══════════════════════════════════════════════╝
  `);

  console.log('[Server] Game features enabled:');
  console.log('  ✓ Wave-based enemy spawning');
  console.log('  ✓ 4 weapon types (knife, wand, bible, garlic)');
  console.log('  ✓ Damage validation & security');
  console.log('  ✓ XP collection & leveling');
  console.log('  ✓ Multiplayer up to 150 players per room');
  console.log('  ✓ Real-time monitoring & stats');

}).catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');

  gameServer.gracefullyShutdown().then(() => {
    console.log('[Server] Server shut down gracefully');
    process.exit(0);
  }).catch((error) => {
    console.error('[Server] Error during shutdown:', error);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');

  gameServer.gracefullyShutdown().then(() => {
    console.log('[Server] Server shut down gracefully');
    process.exit(0);
  }).catch((error) => {
    console.error('[Server] Error during shutdown:', error);
    process.exit(1);
  });
});

// Log unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  process.exit(1);
});