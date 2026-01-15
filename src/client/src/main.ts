import { Game } from './game';
import { logger } from './utils/logger';

async function main() {
  try {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element with id "game" not found');
    }

    const game = new Game(canvas);
    await game.start();

    logger.info('SWARM.IO client started successfully');

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      game.stop();
    });
  } catch (error) {
    logger.error({ error: String(error) }, 'Failed to start SWARM.IO client');
  }
}

main().catch((error) => logger.error({ error: String(error) }, 'Unhandled error in main'));