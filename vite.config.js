import { defineConfig } from 'vite';
import { cpSync, existsSync, createReadStream } from 'node:fs';
import { resolve, normalize } from 'node:path';

/**
 * موارد pdf.js تُنسَخ داخل حزمة التطبيق حتى يُعرض أي ملف PDF دون إنترنت
 * ودون تنزيل أي شيء وقت الفتح:
 *   standard_fonts — الخطوط الأربعة عشر القياسية التي لا تُضمَّن في الملفات.
 *   cmaps          — جداول ترميز الخطوط العريضة (CID)، وبدونها تظهر حروف
 *                    عربية مبعثرة أو ناقصة في الملفات المصدَّرة من وورد.
 */
const PDF_ASSETS = [
  { url: '/pdfjs/standard_fonts/', dir: resolve('node_modules/pdfjs-dist/standard_fonts'), out: 'dist/pdfjs/standard_fonts', type: 'font/otf' },
  { url: '/pdfjs/cmaps/', dir: resolve('node_modules/pdfjs-dist/cmaps'), out: 'dist/pdfjs/cmaps', type: 'application/octet-stream' },
];

function pdfAssets() {
  return {
    name: 'yw-pdf-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const asset = PDF_ASSETS.find((a) => url.startsWith(a.url));
        if (!asset) return next();
        const rel = normalize(url.slice(asset.url.length)).replace(/^(\.\.[/\\])+/, '');
        const file = resolve(asset.dir, rel);
        if (!file.startsWith(asset.dir) || !existsSync(file)) return next();
        res.setHeader('Content-Type', asset.type);
        return createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const a of PDF_ASSETS) {
        if (existsSync(a.dir)) cpSync(a.dir, resolve(a.out), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pdfAssets()],
  server: { host: '0.0.0.0', port: 5173, strictPort: false, hmr: false, watch: { ignored: ['**/docs/**', '**/android/**', '**/legacy/**'] } },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
  worker: { format: 'es' },
});
