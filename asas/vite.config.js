import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0', port: 5173, strictPort: false, hmr: false,
    watch: { ignored: ['**/docs/**', '**/android/**', '**/server/**'] },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // مكتبتا Word والذكاء الاصطناعي في ملفّين منفصلين تُحمَّلان عند الحاجة فقط
        manualChunks: { docx: ['docx'], claude: ['@anthropic-ai/sdk'] },
      },
    },
  },
});
