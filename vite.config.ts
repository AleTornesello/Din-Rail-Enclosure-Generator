import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works from any sub-path (e.g. GitHub Pages).
  base: './',
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1000 },
  optimizeDeps: { exclude: ['manifold-3d'] },
});
