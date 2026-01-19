import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // P7.6: Code coverage configuration (target 80%+)
    // Note: Client coverage thresholds are lower due to DOM/canvas dependencies
    // that are difficult to test without full integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/test/**', // Test setup files
        'src/main.ts', // Entry point with side effects
        'src/game/Renderer.ts', // Complex Three.js rendering (needs integration tests)
        'src/ui/HUD.ts', // DOM manipulation heavy
        'src/game/InputManager.ts', // Browser event handlers
        'src/audio/AudioManager.ts', // Web Audio API
      ],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 30,
        statements: 40,
      },
    },
  },
  define: {
    'import.meta.env.DEV': JSON.stringify(true),
  },
});
