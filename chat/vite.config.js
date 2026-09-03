import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5180, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
