/**
 * يولّد أيقونات أندرويد وشاشة البداية من شعار التطبيق (SVG) عبر متصفح بلا واجهة.
 * الاستعمال: npm run icons   (بعد إنشاء مجلد android)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const RES = 'android/app/src/main/res';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const FONT = readFileSync('node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2').toString('base64');

const ART = `<g>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>
  <rect x="27" y="10" width="10" height="24" rx="1.5" fill="url(#g)"/>
  <rect x="17" y="34" width="30" height="8" rx="1.5" fill="url(#g)"/>
  <rect x="9" y="42" width="46" height="9" rx="1.5" fill="url(#g)"/>
  <path d="M7 56h50" stroke="#38BDF8" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 4"/>
</g>`;

const BG = '#0E1116';
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const legacy = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/>${ART}</svg>`;
const round = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${BG}"/><g transform="translate(6.4 6.4) scale(0.8)">${ART}</g></svg>`;
// الواجهة المتكيّفة: لوحة 108 والمنطقة الآمنة قطرها 66 — نضع الشعار في الوسط بحجم 56
const fg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 108 108"><g transform="translate(26 25) scale(0.875)">${ART}</g></svg>`;

function splash(w, h) {
  const m = Math.min(w, h);
  const logo = Math.round(m * 0.26);
  return `<div style="width:${w}px;height:${h}px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(m * 0.03)}px">
    <svg width="${logo}" height="${logo}" viewBox="0 0 64 64">${ART}</svg>
    <div style="font-family:Plex;font-weight:700;font-size:${Math.round(m * 0.09)}px;color:#F5A524;direction:rtl">أساس</div>
  </div>`;
}

async function render(page, html, w, h, path, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>@font-face{font-family:Plex;src:url(data:font/woff2;base64,${FONT}) format('woff2');font-weight:700}html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [d, k] of Object.entries(DENS)) {
  const dir = join(RES, `mipmap-${d}`);
  await render(page, legacy(48 * k), 48 * k, 48 * k, join(dir, 'ic_launcher.png'), true);
  await render(page, round(48 * k), 48 * k, 48 * k, join(dir, 'ic_launcher_round.png'), true);
  await render(page, fg(108 * k), 108 * k, 108 * k, join(dir, 'ic_launcher_foreground.png'), true);
}
const SPL = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(SPL)) {
  await render(page, splash(w, h), w, h, join(RES, `drawable-port-${d}`, 'splash.png'));
  await render(page, splash(h, w), h, w, join(RES, `drawable-land-${d}`, 'splash.png'));
}
await render(page, splash(480, 320), 480, 320, join(RES, 'drawable', 'splash.png'));
await browser.close();
console.log('✓ أُنشئت الأيقونات وشاشات البداية');
