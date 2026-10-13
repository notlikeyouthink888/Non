/**
 * فحص آلي شامل: يبني التطبيق، يشغّله في متصفح بلا واجهة مع محاكيات للشبكة،
 * ويجرّب المسارات الحقيقية: البحث، التصفح، تقرير دون اتصال، تفعيل الذكاء الاصطناعي،
 * اقتراح العناوين، كتابة تقرير متدفق مع صور متحقق منها، تحرير قسم، استبدال صورة،
 * تصدير Word (ويُفحص الملف الناتج)، والمكتبة. يسقط عند أي خطأ.
 *
 * الاستعمال: npm run check   (أضف --shots لحفظ لقطات في docs/shots)
 */

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { installMocks, stats } from './mocks.mjs';

const SHOTS = process.argv.includes('--shots');
// إبطاء المعالج (مثلًا CHECK_CPU_SLOWDOWN=6) يحاكي أجهزة CI والهواتف البطيئة ويكشف أخطاء التوقيت
const SLOWDOWN = Number(process.env.CHECK_CPU_SLOWDOWN) || 1;
const SHOT_DIR = 'docs/shots';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const BASE = 'http://127.0.0.1:4173/';
const OUT = join(tmpdir(), 'asas-check');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} فشل (${code})`))));
  });
}

function ok(label) { passed++; console.log(`  ✓ ${label}`); }
function assert(cond, label) { if (!cond) throw new Error(label); ok(label); }

// التنقّل وتحديث الواجهة غير متزامنين (وأبطأ في متصفحات CI): ننتظر الحالة المتوقعة نفسها
// ثم نؤكّدها، بدل مهلة ثابتة أو محدِّد قد يطابق عناصر الشاشة السابقة. المهلة لا تُسقط الفحص؛ التأكيد يفعل.
const appear = (locator) => locator.first().waitFor({ timeout: 10000 }).catch(() => {});
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 10000 }).catch(() => {});

async function shot(page, name) {
  if (!SHOTS) return;
  await sleep(250);
  // الفحص أسرع من البشر: نخفي تنبيهات الخطوات السابقة حتى لا تغطي اللقطة
  await page.evaluate(() => document.getElementById('toast-root')?.replaceChildren());
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function waitDone(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const p = document.querySelector('.gen-panel');
    return p && p.style.display === 'none' && document.querySelectorAll('.rsec').length > 0;
  }, null, { timeout });
}

async function flows(page) {
  /* ── 1. الرئيسية والبحث ─────────────────────── */
  await page.goto(BASE + '#/');
  await page.waitForSelector('.type-card');
  assert(await page.locator('.type-card').count() === 17, 'الرئيسية: 17 نوع تقرير');
  assert(await page.locator('.cat-card').count() === 16, 'الرئيسية: 16 قسمًا');
  await shot(page, '01-home');

  await page.locator('.search input').fill('السلمب');
  await appear(page.getByText('اكتب تقريرًا بعنوان «السلمب»'));
  assert(await page.locator('.item', { hasText: 'فحص الهطول للخرسانة الطرية' }).count() >= 1, 'البحث بالعامية «السلمب» يجد فحص الهطول');
  await shot(page, '02-search');

  await page.locator('.search input').fill('الطاقة الشمسية في المباني');
  await appear(page.getByText('اكتب تقريرًا بعنوان «الطاقة الشمسية في المباني»'));
  assert(await page.getByText('لم تجد العنوان المناسب؟').count() === 1, 'عنوان غير موجود: تظهر بطاقة «لم تجد العنوان؟»');
  await page.getByText('اقترح عناوين بالذكاء الاصطناعي').click();
  await appear(page.locator('.notice.warn'));
  assert(await page.locator('.notice.warn').count() >= 1, 'دون مفتاح: يطلب تفعيل الذكاء الاصطناعي بدل الخطأ');

  /* ── 2. التصفح ──────────────────────────────── */
  await page.locator('.nav button').nth(1).click();
  await appear(page.locator('h1.page', { hasText: 'مكتبة العناوين' }));
  assert(await page.locator('.item').count() === 16, 'مكتبة العناوين: 16 قسمًا');
  await page.locator('.item', { hasText: 'التربة وميكانيك التربة' }).click();
  await page.waitForSelector('.topbar');
  assert(await page.locator('.item').count() >= 30, 'قسم التربة: أكثر من 30 عنوانًا');
  await shot(page, '03-browse-soil');

  /* ── 3. تقرير دون اتصال من قاعدة المعرفة ────── */
  await page.goto(BASE + '#/create?topic=slump');
  await page.waitForSelector('.type-card.on');
  await shot(page, '04-create');
  await page.getByText('أنشئ التقرير (محتوى كامل دون اتصال)').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page);
  assert(await page.locator('.rsec').count() === 11, 'تقرير مختبري دون اتصال: 11 قسمًا');
  assert(await page.locator('.rsec ol li').count() >= 10, 'خطوات العمل مرقّمة (10 خطوات)');
  assert(await page.locator('.eq').count() >= 1, 'المعادلات تُعرض في كتلة مستقلة');
  await page.waitForFunction(() => [...document.querySelectorAll('figure.fig img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const offImgs = await page.locator('figure.fig img').count();
  assert(offImgs >= 1, `الصور تُجلب وتُعرض حتى دون ذكاء اصطناعي (${offImgs})`);
  await shot(page, '05-report-offline');

  /* ── 3ب. مفتاح خاطئ: رسالة عربية واضحة لا انهيار ── */
  await page.goto(BASE + '#/settings');
  await page.locator('input[placeholder="sk-ant-…"]').fill('sk-ant-bad-0123456789abcdefghijklmnop');
  await page.locator('input[placeholder="sk-ant-…"]').blur();
  await page.goto(BASE + '#/create?topic=curing');
  await page.waitForSelector('.type-card.on');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await page.waitForSelector('.notice.err', { timeout: 15000 });
  assert((await page.locator('.notice.err').innerText()).includes('مفتاح API غير صحيح'), 'مفتاح خاطئ: رسالة عربية واضحة مع زر إعادة المحاولة');

  /* ── 4. تفعيل الذكاء الاصطناعي ──────────────── */
  await page.goto(BASE + '#/settings');
  await page.locator('input[placeholder="sk-ant-…"]').fill('sk-ant-test-0123456789abcdefghijklmnop');
  await page.locator('input[placeholder="sk-ant-…"]').blur();
  await sleep(200);
  await page.getByText('اختبار الاتصال').click();
  await page.waitForSelector('text=تم الاتصال', { timeout: 10000 });
  ok('الإعدادات: اختبار الاتصال بـ Claude ناجح');
  await shot(page, '06-settings');

  /* ── 5. اقتراح عناوين ثم تقرير بالذكاء الاصطناعي ── */
  await page.goto(BASE + '#/?q=' + encodeURIComponent('الطاقة الشمسية في المباني'));
  await page.getByText('اقترح عناوين بالذكاء الاصطناعي').click();
  await page.waitForSelector('text=استخدام الطاقة الشمسية في المباني السكنية', { timeout: 10000 });
  assert(await page.locator('.card .item').count() === 3, 'الذكاء الاصطناعي اقترح 3 عناوين');
  await shot(page, '07-suggestions');
  await page.locator('.card .item').first().click();
  await page.waitForSelector('.type-card.on');
  assert((await page.locator('textarea').first().inputValue()).includes('الطاقة الشمسية'), 'العنوان المقترح انتقل إلى صفحة الإنشاء');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await page.waitForSelector('.gen-panel .phase', { timeout: 5000 });
  await shot(page, '08-generating');
  await waitDone(page, 40000);
  assert(await page.locator('.rsec').count() === 10, 'تقرير بحثي بالذكاء الاصطناعي: 10 أقسام كما في الهيكل');
  assert(await page.locator('.rsec table').count() >= 1, 'الجداول تُعرض');
  assert(await page.locator('.rsec .ph').count() >= 1, 'القيم بين [ ] مميزة لتعديلها');
  await page.waitForFunction(() => document.querySelectorAll('figure.fig img').length >= 2, null, { timeout: 15000 });
  const aiImgs = await page.locator('figure.fig img').count();
  const rejected = await page.locator('.fig-pending').count();
  assert(aiImgs === 2 && rejected === 1, `التحقق البصري: صورتان مقبولتان وواحدة مرفوضة لا تُعرض (${aiImgs}/${rejected})`);
  const credit = await page.locator('figure.fig .credit').first().innerText();
  assert(/ويكي/.test(credit) && /CC BY-SA/.test(credit), 'مصدر الصورة ورخصتها مذكوران');
  const brokenShown = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length);
  assert(brokenShown === 0, 'لا توجد صورة مكسورة في الصفحة');
  await shot(page, '09-report-ai');

  /* ── 6. تحرير قسم بالذكاء الاصطناعي ─────────── */
  await page.locator('.rsec .tools button').first().click();
  await page.waitForSelector('.sheet .editor');
  await page.locator('.sheet .chip', { hasText: 'أعد الصياغة' }).click();
  await page.waitForFunction(() => document.querySelector('.sheet textarea')?.value.includes('بعد إعادة الصياغة'), null, { timeout: 10000 });
  await shot(page, '10-edit-section');
  await page.locator('.sheet button.btn.primary', { hasText: 'حفظ' }).click();
  await until(page, () => document.querySelector('.rsec')?.innerText.includes('بعد إعادة الصياغة'));
  assert(await page.locator('.rsec').first().innerText().then((t) => t.includes('بعد إعادة الصياغة')), 'تحرير القسم بالذكاء الاصطناعي وحفظه');

  /* ── 7. استبدال صورة ─────────────────────────── */
  await page.locator('figure.fig .fig-tools button').first().click();
  await page.waitForSelector('.sheet .cands');
  await page.waitForFunction(() => document.querySelectorAll('.sheet .cand img').length >= 1, null, { timeout: 10000 });
  await shot(page, '11-image-picker');
  await page.locator('.sheet .cand').last().click();
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
  await until(page, () => {
    const imgs = [...document.querySelectorAll('figure.fig img')];
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  assert(await page.locator('figure.fig img').count() === 2, 'استبدال صورة من المرشحين');

  /* ── 8. تصدير Word ───────────────────────────── */
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.locator('.dock button', { hasText: 'Word' }).click(),
  ]);
  mkdirSync(OUT, { recursive: true });
  const docxPath = join(OUT, 'report.docx');
  await download.saveAs(docxPath);
  assert(statSync(docxPath).size > 20000, `تصدير Word (${Math.round(statSync(docxPath).size / 1024)} ك.ب)`);
  verifyDocx(docxPath);

  /* ── 9. المكتبة والحذف ───────────────────────── */
  await page.goto(BASE + '#/library');
  await page.waitForSelector('.list .item');
  const before = await page.locator('.list .item').count();
  assert(before >= 2, `المكتبة: ${before} تقارير محفوظة`);
  await shot(page, '12-library');
  await page.locator('.list .item .icon-btn').first().click();
  await page.locator('.action-item', { hasText: 'حذف' }).click();
  await page.locator('.sheet .btn.danger', { hasText: 'احذف' }).click();
  await until(page, (n) => document.querySelectorAll('.list .item').length === n, before - 1);
  assert(await page.locator('.list .item').count() === before - 1, 'حذف تقرير من المكتبة');

  /* ── 10. صحة طلبات Claude ────────────────────── */
  const bad = stats.claude.filter((c) => c.problems.length);
  assert(stats.claude.length >= 5, `طلبات Claude المرسلة: ${stats.claude.length} (${[...new Set(stats.claude.map((c) => c.kind))].join('، ')})`);
  assert(!bad.length, 'كل طلبات Claude سليمة: opus-5-5، تفكير تكيّفي، جهد صريح، بديل تلقائي، تخزين مؤقت' + (bad.length ? ' — ' + JSON.stringify(bad[0]) : ''));
  assert(stats.claude.some((c) => c.kind === 'choices' && c.images >= 3), 'التحقق البصري أرسل صور المرشحين للنموذج');
}

/** يفحص ملف Word الناتج: اتجاه من اليمين لليسار، صور مضمّنة، نصوص عربية. */
function verifyDocx(path) {
  const py = `
import sys, docx
d = docx.Document(sys.argv[1])
ps = d.paragraphs
bidi = sum(1 for p in ps if p._p.pPr is not None and p._p.pPr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}bidi') is not None)
imgs = len(d.inline_shapes)
text = '\\n'.join(p.text for p in ps)
print(len(ps), bidi, imgs, len(d.tables), int('الطاقة الشمسية' in text), int('شكل (1)' in text))
`;
  const out = execFileSync('python3', ['-c', py, path]).toString().trim().split(/\s+/).map(Number);
  const [paras, bidi, imgs, tables, hasTitle, hasCaption] = out;
  assert(paras > 40 && bidi / paras > 0.85, `Word: ${bidi}/${paras} فقرة باتجاه من اليمين لليسار`);
  assert(imgs === 2, `Word: الصور مضمّنة (${imgs})`);
  assert(tables >= 1 && hasTitle && hasCaption, 'Word: الجداول والعنوان وتعليقات الصور موجودة');
}

async function main() {
  console.log('▸ بناء الإصدار…');
  await run('npx', ['vite', 'build']);

  console.log('▸ تشغيل خادم المعاينة…');
  // vite مباشرة لا عبر npx: إيقاف npx كان يترك خادم المعاينة حيًّا فيخدم نسخة قديمة في الفحص التالي
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
  await sleep(2500);

  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, acceptDownloads: true });
    const page = await context.newPage();
    if (SLOWDOWN > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
    await installMocks(page);

    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      const expected = /Broken_file/.test(r.url()) || (r.status() === 401 && /api\.anthropic\.com/.test(r.url()));
      if (r.status() >= 400 && !expected) errors.push(`HTTP ${r.status()}: ${r.url()}`);
    });

    if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
    await flows(page);
    await browser.close();
  } catch (err) {
    errors.push(`فشل: ${err.message}`);
    await browser?.close().catch(() => {});
  } finally {
    server.kill();
  }

  if (errors.length) {
    console.error('\n✗ أخطاء:');
    errors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  writeFileSync(join(OUT, 'claude-requests.json'), JSON.stringify(stats.claude, null, 2));
  console.log(`\n✓ نجحت كل الفحوصات (${passed}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
