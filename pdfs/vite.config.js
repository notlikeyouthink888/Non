import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 5174, strictPort: false, hmr: false, watch: { ignored: ['**/android/**'] } },
  preview: { host: '0.0.0.0', port: 4174 },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
