/**
 * يصدّر ملف Word لتقرير دون اتصال لموضوع معيّن ويحوّل صفحاته إلى صور للمراجعة البصرية.
 * الاستعمال: node tools/word-sample.mjs <topic> <مجلد> [native]   (يتطلب npm run build قبله)
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
import { installMocks } from './mocks.mjs';

const [topic = 'compression_test', dir = 'tools/out', native] = process.argv.slice(2);
const out = resolve(dir);
mkdirSync(out, { recursive: true });
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4174', '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
const BASE = 'http://127.0.0.1:4174/';
try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await installMocks(page);
  if (native) {
    await page.goto(BASE + '#/settings');
    await page.locator('.chip', { hasText: 'معادلات Word قابلة للتعديل' }).click();
  }
  await page.goto(`${BASE}#/create?topic=${topic}`);
  await page.waitForSelector('.type-card.on');
  await page.locator('.dock button').last().click();
  await page.waitForURL(/#\/report\//);
  await page.waitForFunction(() => { const p = document.querySelector('.gen-panel'); return p && p.style.display === 'none' && document.querySelectorAll('.rsec').length > 0; }, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.mx-wait'), null, { timeout: 20000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.dock button', { hasText: 'Word' }).click()]);
  const path = join(out, `${topic}.docx`);
  await dl.saveAs(path);
  // لقطة للأقسام التي فيها معادلات كما تظهر في التطبيق
  const secs = page.locator('.rsec', { has: page.locator('.mx') });
  for (let i = 0; i < Math.min(3, await secs.count()); i++) await secs.nth(i).screenshot({ path: join(out, `${topic}-app-${i + 1}.png`) });
  await browser.close();
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, path], { stdio: 'ignore', timeout: 180000 });
  execFileSync('pdftoppm', ['-r', '80', '-png', join(out, `${topic}.pdf`), join(out, topic)]);
  console.log('ok', path);
} finally {
  server.kill();
}
