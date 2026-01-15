/**
 * Structured logging utility for SWARM.IO client
 *
 * Provides consistent logging across client components with:
 * - Log levels (debug, info, warn, error)
 * - Structured data support (JSON-like objects)
 * - Component-specific child loggers
 * - Configurable via localStorage or environment
 *
 * Usage:
 *   import { logger, createChildLogger } from '../utils/logger';
 *
 *   // Direct logging
 *   logger.info({ playerId: '123' }, 'Player connected');
 *
 *   // Child loggers for specific components
 *   const networkLogger = createChildLogger('NetworkClient');
 *   networkLogger.info({ roomId: 'abc' }, 'Connected to room');
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  debug: (context: LogContext | string, message?: string) => void;
  info: (context: LogContext | string, message?: string) => void;
  warn: (context: LogContext | string, message?: string) => void;
  error: (context: LogContext | string, message?: string) => void;
  child: (context: LogContext) => Logger;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Get configured log level from localStorage or default
 * Can be set in browser console: localStorage.setItem('LOG_LEVEL', 'debug')
 */
function getLogLevel(): LogLevel {
  // Check localStorage for client-side log level override
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('LOG_LEVEL');
    if (stored && stored in LOG_LEVELS) {
      return stored as LogLevel;
    }
  }

  // Default to 'info' in production, 'debug' in development
  return import.meta.env.DEV ? 'debug' : 'info';
}

/**
 * Format log context for console output
 */
function formatContext(context: LogContext): string {
  const entries = Object.entries(context);
  if (entries.length === 0) return '';

  return entries
    .map(([key, value]) => {
      if (typeof value === 'object') {
        try {
          return `${key}=${JSON.stringify(value)}`;
        } catch {
          return `${key}=[Object]`;
        }
      }
      return `${key}=${value}`;
    })
    .join(' ');
}

/**
 * Create a logger with a given component context
 */
function createLogger(component?: string, parentContext: LogContext = {}): Logger {
  const baseContext: LogContext = { ...parentContext };
  if (component) {
    baseContext.component = component;
  }

  const currentLevel = getLogLevel();

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  }

  function log(
    level: LogLevel,
    consoleMethod: 'log' | 'info' | 'warn' | 'error',
    contextOrMessage: LogContext | string,
    message?: string
  ): void {
    if (!shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    let logMessage: string;
    let context: LogContext;

    // Handle both (message) and (context, message) calling conventions
    if (typeof contextOrMessage === 'string') {
      logMessage = contextOrMessage;
      context = {};
    } else {
      logMessage = message || '';
      context = contextOrMessage;
    }

    // Merge contexts
    const fullContext = { ...baseContext, ...context };
    const componentPrefix = fullContext.component ? `[${fullContext.component}]` : '';

    // Remove component from context display (it's in the prefix)
    const displayContext = { ...fullContext };
    delete displayContext.component;

    const contextStr = formatContext(displayContext);
    const parts = [timestamp, componentPrefix, logMessage, contextStr].filter(Boolean);

    // Use console method with appropriate formatting
    console[consoleMethod](parts.join(' '));
  }

  return {
    debug: (contextOrMessage, message?) => log('debug', 'log', contextOrMessage, message),
    info: (contextOrMessage, message?) => log('info', 'info', contextOrMessage, message),
    warn: (contextOrMessage, message?) => log('warn', 'warn', contextOrMessage, message),
    error: (contextOrMessage, message?) => log('error', 'error', contextOrMessage, message),
    child: (context: LogContext) =>
      createLogger(context.component as string | undefined, { ...baseContext, ...context }),
  };
}

/**
 * Main logger instance for the client
 */
export const logger: Logger = createLogger();

/**
 * Create a child logger with a component name prefix
 * @param component - Name of the component (e.g., 'NetworkClient', 'Game')
 */
export function createChildLogger(component: string): Logger {
  return logger.child({ component });
}

/**
 * Pre-configured child loggers for each client component
 * These provide consistent naming and can be imported directly
 */
export const networkLogger = createChildLogger('NetworkClient');
export const gameLogger = createChildLogger('Game');
export const rendererLogger = createChildLogger('Renderer');
export const audioLogger = createChildLogger('AudioManager');
export const inputLogger = createChildLogger('InputManager');
export const hudLogger = createChildLogger('HUD');
export const spriteLogger = createChildLogger('SpriteLoader');
export const animationLogger = createChildLogger('AnimationController');

export default logger;
