/**
 * Structured logging utility for SWARM.IO server
 *
 * Uses pino for high-performance JSON logging in production.
 * Supports log levels: debug, info, warn, error
 *
 * Usage:
 *   import { logger, createChildLogger } from './utils/logger';
 *
 *   // Direct logging
 *   logger.info({ playerId: '123' }, 'Player connected');
 *
 *   // Child loggers for specific components
 *   const gameRoomLogger = createChildLogger('GameRoom');
 *   gameRoomLogger.info({ roomId: 'abc' }, 'Room created');
 */

import pino, { Logger as PinoLogger } from 'pino';

// Determine log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create base pino logger with appropriate configuration
const pinoOptions: pino.LoggerOptions = {
  level: LOG_LEVEL,
  // Use human-readable timestamps
  timestamp: pino.stdTimeFunctions.isoTime,
  // Base context
  base: {
    service: 'swarm-io-server',
  },
};

// In development, use pino-pretty for human-readable output
// In production, use JSON for log aggregation
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  // Use transport for pretty printing in development
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname,service',
    },
  };
}

// In test environment, silence logs unless explicitly enabled
if (process.env.NODE_ENV === 'test' && !process.env.LOG_TESTS) {
  pinoOptions.level = 'silent';
}

/**
 * Main logger instance for the server
 */
export const logger: PinoLogger = pino(pinoOptions);

/**
 * Create a child logger with a component name prefix
 * @param component - Name of the component (e.g., 'GameRoom', 'CombatSystem')
 */
export function createChildLogger(component: string): PinoLogger {
  return logger.child({ component });
}

/**
 * Pre-configured child loggers for each server component
 * These provide consistent naming and can be imported directly
 */
export const gameRoomLogger = createChildLogger('GameRoom');
export const combatSystemLogger = createChildLogger('CombatSystem');
export const physicsSystemLogger = createChildLogger('PhysicsSystem');
export const spawnSystemLogger = createChildLogger('SpawnSystem');
export const xpSystemLogger = createChildLogger('XPSystem');
export const weaponSystemLogger = createChildLogger('WeaponSystem');
export const inputSystemLogger = createChildLogger('InputSystem');
export const securityLogger = createChildLogger('Security');

export default logger;
