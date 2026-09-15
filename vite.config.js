import { defineConfig } from 'vite';
import { cpSync, existsSync, createReadStream } from 'node:fs';
import { resolve, normalize } from 'node:path';

const FONTS_SRC = resolve('node_modules/pdfjs-dist/standard_fonts');

/**
 * خطوط PDF القياسية تُنسَخ داخل حزمة التطبيق حتى يُعرض أي ملف PDF
 * دون إنترنت ودون تنزيل أي شيء وقت الفتح.
 */
function pdfStandardFonts() {
  const PREFIX = '/pdfjs/standard_fonts/';
  return {
    name: 'yw-pdf-standard-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith(PREFIX)) return next();
        const file = resolve(FONTS_SRC, normalize(url.slice(PREFIX.length)).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(FONTS_SRC) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'font/otf');
        return createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(FONTS_SRC)) {
        cpSync(FONTS_SRC, resolve('dist/pdfjs/standard_fonts'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pdfStandardFonts()],
  server: { host: '0.0.0.0', port: 5173, strictPort: false, hmr: false, watch: { ignored: ['**/docs/**', '**/android/**', '**/legacy/**'] } },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
  worker: { format: 'es' },
});
