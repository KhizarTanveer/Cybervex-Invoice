import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any folder or sub-path.
  base: './',
  server: { port: 5180 },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
