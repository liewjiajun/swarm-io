import { Game } from './game';

async function main() {
  try {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element with id "game" not found');
    }

    const game = new Game(canvas);
    await game.start();

    console.log('SWARM.IO client started successfully');

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      game.stop();
    });
  } catch (error) {
    console.error('Failed to start SWARM.IO client:', error);
  }
}

main().catch(console.error);