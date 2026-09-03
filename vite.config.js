import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5173, strictPort: false, hmr: false, watch: { ignored: ['**/docs/**', '**/android/**'] } },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
