#!/usr/bin/env node
/**
 * أداة التحقق: Chromium بلا واجهة ⇒ PNG + سجل JSON (أخطاء وحدة التحكم، fps، استدعاءات الرسم).
 *
 *   node tools/shoot.mjs --preset=overview --time=18.5 --out=docs/shots/x.png
 *   node tools/shoot.mjs --showcase=roads --time=21 --w=1280 --h=720
 *   node tools/shoot.mjs --batch=docs/shotlists/round1.json     # عدة لقطات بجلسة واحدة (أسرع بكثير)
 *
 * ⚠️ البيئة بلا GPU: الرسم عبر SwiftShader. أرقام fps غير ممثّلة للعتاد الحقيقي؛
 *    المقاييس المعتمدة: drawCalls / triangles / programs / أخطاء وحدة التحكم.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const T0 = Date.now();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const log = (...a) => { if (!args.quiet) console.error('[shoot]', ((Date.now() - T0) / 1000).toFixed(1) + 's', ...a); };

const W = +(args.w || 1280), H = +(args.h || 720);
const PORT = +(args.port || 5173);
const BASE = args.url || `http://127.0.0.1:${PORT}/`;
const showcase = args.showcase || null;
const quality = args.quality || null;
const seed = args.seed || null;
const settleDefault = +(args.settle || 2000);
const singleOut = resolve(args.out || `docs/shots/${showcase ? 'showcase_' + showcase : (args.preset || 'overview')}.png`);

let shots;
if (args.batch) {
  shots = JSON.parse(readFileSync(args.batch, 'utf8')).map((s) => ({
    out: resolve(s.out), preset: s.preset || 'overview', time: s.time ?? 15,
    cam: s.cam || null, settle: s.settle ?? settleDefault, label: s.label || '',
  }));
} else {
  shots = [{
    out: singleOut, preset: args.preset || 'overview', time: args.time !== undefined ? +args.time : 15,
    cam: args.cam ? JSON.parse(args.cam) : null, settle: settleDefault, label: '',
  }];
}

async function waitServer(url, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok || r.status === 404) return true; } catch {}
    await sleep(400);
  }
  return false;
}

let server = null;
async function ensureServer() {
  if (await waitServer(BASE, 1500)) return false;
  server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write('[vite] ' + d));
  if (!(await waitServer(BASE, 60000))) throw new Error('vite server did not start');
  return true;
}

const url = new URL(BASE);
url.searchParams.set('shot', '1');
if (showcase) url.searchParams.set('showcase', showcase);
if (quality) url.searchParams.set('quality', quality);
if (seed) url.searchParams.set('seed', seed);
if (args.fx === '0') url.searchParams.set('fx', '0');
url.searchParams.set('time', String(shots[0].time));

const spawned = await ensureServer();
log('server up (spawned=' + spawned + ')');

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-lcd-text',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--disable-component-update', '--disable-domain-reliability', '--disable-sync',
    '--metrics-recording-only', '--disable-features=Translate,OptimizationHints,MediaRouter',
  ],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 500)); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => consoleErrors.push('requestfailed: ' + r.url()));

/** الالتقاط من الـcanvas مباشرة (preserveDrawingBuffer) — لا يعتمد على مُركِّب المتصفح. */
async function capture(file) {
  if (args.dom) {
    try { await page.screenshot({ path: file, type: 'png', timeout: 30000 }); return; }
    catch (e) { consoleErrors.push('dom screenshot failed: ' + e.message); }
  }
  const dataUrl = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

let error = null;
const results = [];
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  log('page loaded');
  await page.waitForFunction(() => globalThis.__CITY && globalThis.__CITY.ready === true, null, { timeout: 900000 });
  const init = await page.evaluate(() => globalThis.__CITY.stats().initMs);
  log('app ready (initMs=' + init + ')');

  for (const sh of shots) {
    const errBefore = consoleErrors.length;
    await page.evaluate(([t, p, cam]) => {
      globalThis.__CITY.setTimeOfDay(t);
      if (cam) globalThis.__CITY.setCamera(cam); else globalThis.__CITY.setCameraPreset(p);
    }, [sh.time, sh.preset, sh.cam]);
    await sleep(sh.settle);
    await page.evaluate(() => globalThis.__CITY.resetFrameStats());
    await sleep(1500);
    const stats = await page.evaluate(() => globalThis.__CITY.stats());
    mkdirSync(dirname(sh.out), { recursive: true });
    await capture(sh.out);
    const errs = consoleErrors.slice(errBefore);
    writeFileSync(sh.out.replace(/\.png$/, '.json'), JSON.stringify({
      ok: errs.length === 0, shot: sh.out, requested: sh, viewport: { w: W, h: H },
      consoleErrors: errs, stats,
      note: 'fps مقاسة على SwiftShader (رسم برمجي) — غير ممثلة للعتاد. اعتمد drawCalls/triangles.',
      at: new Date().toISOString(),
    }, null, 2));
    results.push({
      out: sh.out.replace(process.cwd() + '/', ''), label: sh.label,
      fps: stats.fps, frameMs: stats.frameMs, drawCalls: stats.drawCalls, triangles: stats.triangles,
      programs: stats.programs, errors: errs.length,
    });
    log('captured', sh.out.split('/').pop(), 'fps=' + stats.fps, 'draws=' + stats.drawCalls, 'tris=' + stats.triangles);
  }
} catch (e) {
  error = String(e.message || e);
  log('ERROR', error);
  try { mkdirSync(dirname(shots[0].out), { recursive: true }); await capture(shots[0].out); } catch {}
}

let modules = null, pageLogs = [];
try { pageLogs = await page.evaluate(() => globalThis.__CITY.logs().filter((l) => l.level !== 'debug').map((l) => l.msg.slice(0, 240))); } catch {}
try { modules = await page.evaluate(() => Object.fromEntries(Object.entries(globalThis.__CITY.stats().modules).map(([k, v]) => [k, v.state + (v.errors.length ? ':' + v.errors[0] : '')]))); } catch {}

await browser.close();
if (server) server.kill('SIGTERM');

const summary = { ok: !error && consoleErrors.length === 0, error, consoleErrors: consoleErrors.slice(0, 12), results, modules, pageLogs, elapsedS: +((Date.now() - T0) / 1000).toFixed(1) };
writeFileSync(resolve(args.batch ? dirname(shots[0].out) + '/_batch_summary.json' : shots[0].out.replace(/\.png$/, '_run.json')), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
