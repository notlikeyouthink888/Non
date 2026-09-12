/**
 * يولّد أيقونات التطبيق من تصميم واحد (نفس تصميم public/favicon.svg)
 * إلى كل كثافات mipmap. الاستعمال: node tools/make-icons.mjs
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const RES = 'android/app/src/main/res';

// mdpi .. xxxhdpi
const DENSITIES = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

/** التصميم: خلفية داكنة + حرف Y من ثلاثة مسارات ملوّنة. */
function svg({ size, round = false, foregroundOnly = false }) {
  const clip = round
    ? `<clipPath id="c"><circle cx="54" cy="54" r="54"/></clipPath>`
    : `<clipPath id="c"><rect width="108" height="108" rx="24"/></clipPath>`;
  const bg = foregroundOnly ? '' : `
    <rect width="108" height="108" fill="#0B0E14"/>
    <path d="M0 108 L108 0 L108 44 L44 108 Z" fill="#17203A"/>
    <path d="M0 64 L64 0 L108 0 L0 108 Z" fill="#101728" opacity=".7"/>`;
  // الرسم الأمامي يُصغَّر داخل المساحة الآمنة للأيقونة التكيّفية
  const scale = foregroundOnly ? 0.66 : 1;
  const t = foregroundOnly ? `translate(${54 * (1 - scale)} ${54 * (1 - scale)}) scale(${scale})` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">
    <defs>${clip}</defs>
    <g clip-path="url(#c)">
      ${bg}
      <g transform="${t}" fill="none" stroke-linecap="round" stroke-width="9">
        <path d="M34 30 L54 54" stroke="#7C5CFF"/>
        <path d="M74 30 L54 54" stroke="#22D3EE"/>
        <path d="M54 54 L54 80" stroke="#A78BFA"/>
      </g>
      <g transform="${t}">
        <circle cx="34" cy="30" r="6" fill="#7C5CFF"/>
        <circle cx="74" cy="30" r="6" fill="#22D3EE"/>
        <circle cx="54" cy="80" r="6" fill="#A78BFA"/>
        <circle cx="54" cy="54" r="4" fill="#fff"/>
      </g>
    </g>
  </svg>`;
}

const browser = await chromium.launch({
  executablePath: existsSync(BROWSER) ? BROWSER : undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

async function render(markup, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${markup}</body>`,
    { waitUntil: 'load' },
  );
  const buf = await page.screenshot({ omitBackground: true });
  writeFileSync(out, buf);
  console.log('  ✓', out);
}

for (const d of DENSITIES) {
  mkdirSync(`${RES}/${d.dir}`, { recursive: true });
  await render(svg({ size: d.size }), d.size, `${RES}/${d.dir}/ic_launcher.png`);
  await render(svg({ size: d.size, round: true }), d.size, `${RES}/${d.dir}/ic_launcher_round.png`);
  await render(svg({ size: d.size, foregroundOnly: true }), d.size, `${RES}/${d.dir}/ic_launcher_foreground.png`);
}

// معاينة كبيرة للتوثيق
mkdirSync('docs/shots', { recursive: true });
await render(svg({ size: 512 }), 512, 'docs/shots/app-icon.png');

await browser.close();
console.log('✓ وُلّدت الأيقونات');
