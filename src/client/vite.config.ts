// src/client/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/colyseus': {
        target: 'http://localhost:2567',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split vendors into separate chunks for better caching
        manualChunks: {
          // Three.js core in its own chunk (~400KB)
          'three-core': ['three'],
          // Colyseus networking in its own chunk (~80KB)
          'colyseus': ['colyseus.js', '@colyseus/schema'],
        },
      },
    },
    // Report gzipped size in build output
    reportCompressedSize: true,
    // Increase warning limit since Three.js is large
    chunkSizeWarningLimit: 600,
  },
});