/**
 * يولّد أيقونات أندرويد من رسم واحد (دوائر متصلة ومخطط صاعد).
 * الاستعمال: node tools/icons.mjs
 */

import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** الرسم بإحداثيات 512×512 حول المركز (260, 265). */
const ART = `
  <g stroke-width="14" stroke-linecap="round">
    <line x1="256" y1="262" x2="138" y2="146" stroke="#34d399"/>
    <line x1="256" y1="262" x2="388" y2="160" stroke="#fbbf24"/>
    <line x1="256" y1="262" x2="364" y2="392" stroke="#f87171"/>
    <line x1="256" y1="262" x2="132" y2="378" stroke="#a78bfa"/>
  </g>
  <circle cx="138" cy="146" r="46" fill="#0f3327" stroke="#34d399" stroke-width="12"/>
  <circle cx="388" cy="160" r="40" fill="#3a2e10" stroke="#fbbf24" stroke-width="12"/>
  <circle cx="364" cy="392" r="38" fill="#3d1b1b" stroke="#f87171" stroke-width="12"/>
  <circle cx="132" cy="378" r="32" fill="#231c3d" stroke="#a78bfa" stroke-width="12"/>
  <circle cx="256" cy="262" r="86" fill="url(#core)"/>
  <g fill="#ffffff">
    <rect x="214" y="268" width="20" height="34" rx="6"/>
    <rect x="246" y="246" width="20" height="56" rx="6"/>
    <rect x="278" y="222" width="20" height="80" rx="6"/>
  </g>`;

const DEFS = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#17253f"/><stop offset="1" stop-color="#0b0f17"/>
    </linearGradient>
    <linearGradient id="core" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6ea8ff"/><stop offset="1" stop-color="#3a72f0"/>
    </linearGradient>
  </defs>`;

const scaled = (s) => `<g transform="translate(256 256) scale(${s}) translate(-260 -265)">${ART}</g>`;

const SVGS = {
  // أيقونة مربعة بحواف دائرية (أندرويد قبل 8)
  square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
    <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bg)"/>${scaled(0.92)}</svg>`,
  // أيقونة دائرية
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}
    <circle cx="256" cy="256" r="240" fill="url(#bg)"/>${scaled(0.86)}</svg>`,
  // الواجهة الأمامية للأيقونة المتكيّفة: داخل منطقة الأمان (66 من 108)
  foreground: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${DEFS}${scaled(0.7)}</svg>`,
};

async function render(page, svg, size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const browser = await chromium.launch({ executablePath: existsSync(BROWSER) ? BROWSER : undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [dpi, k] of Object.entries(DENSITIES)) {
  await render(page, SVGS.square, Math.round(48 * k), `${RES}/mipmap-${dpi}/ic_launcher.png`);
  await render(page, SVGS.round, Math.round(48 * k), `${RES}/mipmap-${dpi}/ic_launcher_round.png`);
  await render(page, SVGS.foreground, Math.round(108 * k), `${RES}/mipmap-${dpi}/ic_launcher_foreground.png`);
}
await render(page, SVGS.square, 512, 'docs/icon-512.png');
await browser.close();
console.log('✓ الأيقونات جاهزة');
