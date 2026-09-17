/**
 * فحص آلي: يبني التطبيق، يفتحه في متصفّح بلا واجهة،
 * يتنقّل بين كل الأقسام والتبويبات، ويسقط عند أي خطأ في الطرفية.
 * الاستعمال: npm run check   (أضف --shots لحفظ لقطات في docs/shots)
 */

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = 'docs/shots';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const TEST_PDF = join(tmpdir(), 'yw-check.pdf');

const SECTIONS = [
  { id: 'music', tabs: ['tracks', 'new', 'favorites', 'playlists', 'artists', 'albums'] },
  { id: 'time', tabs: ['overview', 'timer', 'alarms', 'calendar', 'sleep', 'day'] },
  { id: 's2', tabs: ['today', 'plan', 'week', 'setup'] },
  { id: 'study', tabs: ['groups', 'recent', 'search'] },
  { id: 'workout', tabs: ['plan', 'protein', 'log'] },
  { id: 'improve', tabs: ['areas', 'today', 'progress'] },
  { id: 'money', tabs: ['overview', 'items', 'subs', 'report'] },
  { id: 'commit', tabs: ['today', 'library', 'routines', 'progress'] },
  { id: 'places', tabs: ['map', 'list', 'offline'] },
  { id: 'room', tabs: ['list', 'zones', 'bought'] },
  { id: 'growth', tabs: ['today', 'library', 'paths', 'done'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** موارد pdf.js المحمَّلة — تُطلَب من داخل عامل الخيط، فلا تظهر في performance. */
const pdfAssetHits = [];

/** ينتقل إلى قسم سواء كان مثبّتًا في الشريط أو داخل ورقة «الأقسام». */
async function goSection(page, id) {
  const pinned = page.locator(`.nav button[data-id="${id}"]`);
  if (await pinned.count()) {
    await pinned.click();
  } else {
    await page.locator('.nav button[data-id="__more"]').click();
    await sleep(300);
    await page.locator(`.sec-tile[data-sec="${id}"]`).click();
  }
  await sleep(400);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} فشل (${code})`))));
  });
}

/** يجرّب المسارات الأساسية فعليًا: منبّه، مهمّة، مؤقّت، التزام، مكان، عنصر إنتاجية. */
async function runFlows(page) {
  const go = (id) => goSection(page, id);
  const tab = async (i) => { await page.locator('.tabs button').nth(i).click(); await sleep(300); };
  const expect = async (label, locator, count = 1) => {
    const n = await locator.count();
    if (n < count) throw new Error(`${label}: توقّعنا ${count} فوجدنا ${n}`);
    console.log(`  ✓ ${label}`);
  };

  // منبّه جديد
  await go('time');
  await tab(2);
  await page.getByText('＋ منبّه جديد').click();
  await sleep(350);
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة منبّه', page.locator('.item .switch'));

  // مهمّة جديدة في التقويم
  await tab(3);
  await page.getByText('＋ مهمّة').click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('اختبار آلي');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة مهمّة', page.locator('.task'));

  // تشغيل مؤقّت ثم إلغاؤه
  await tab(1);
  await page.getByText('5 د', { exact: true }).first().click();
  await sleep(500);
  await expect('تشغيل المؤقّت', page.locator('.dial'));
  await page.getByText('⏹ إلغاء').click();
  await sleep(300);

  // التزام من المكتبة
  await go('commit');
  await tab(1);
  await page.locator('.item button.btn.sm').first().click();
  await sleep(350);
  await page.locator('.sheet').getByText('💾 أضِف').click();
  await sleep(400);
  await go('commit');
  await tab(0);
  await expect('إضافة التزام', page.locator('.commit'));

  // مكان جديد
  await go('places');
  await tab(1);
  await page.getByText('＋ مكان جديد').click();
  await sleep(400);
  await page.locator('.sheet input').first().fill('مكان اختبار');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة مكان', page.locator('.place'));

  // عنصر إنتاجية
  await go('growth');
  await tab(1);
  await page.locator('.growth .box').first().click();
  await sleep(300);
  await expect('تعليم عنصر كمنجَز', page.locator('.growth.done'));

  // تمرين في اليوم الأول
  await go('workout');
  await tab(0);
  await page.locator('.slot.empty').first().click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('ضغط بنش');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة تمرين', page.locator('.slot:not(.empty)'));

  // بروتين
  await tab(1);
  await page.getByText('✎ إدخال يدوي').click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('بيض');
  await page.locator('.sheet input[type="number"]').first().fill('18');
  await page.locator('.sheet').getByText('أضف', { exact: true }).click();
  await sleep(400);
  await expect('تسجيل بروتين', page.locator('.food'));

  // مصروف
  await go('money');
  await tab(1);
  await page.getByText('＋ مصروف جديد').click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('معجون أسنان');
  await page.locator('.sheet input[type="number"]').first().fill('3000');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة مصروف', page.locator('.exp'));

  // شيء للغرفة
  await go('room');
  await tab(0);
  await page.getByText('＋ أضف شيئًا').click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('رف خشبي');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة غرض للغرفة', page.locator('.room-item'));

  // كتلة في نظام S2
  await go('s2');
  await tab(1);
  await page.getByText('＋ كتلة جديدة').click();
  await sleep(400);
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await go('s2');
  await tab(1);
  await expect('إضافة كتلة S2', page.locator('.tl-block'));

  // مجموعة وصفحة في المذاكرة
  await go('study');
  await tab(0);
  await page.getByText('＋ مجموعة جديدة').click();
  await sleep(350);
  await page.locator('.sheet input').first().fill('رياضيات');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(400);
  await expect('إضافة مجموعة', page.locator('.grp'));
  await page.locator('.grp').first().click();
  await sleep(350);
  await page.getByText('＋ صفحة جديدة').first().click();
  await sleep(400);
  await page.locator('.add-strip button').first().click();
  await sleep(350);
  await page.locator('.pg-editor').first().fill('قانون فيثاغورس');
  await expect('إضافة صفحة وعنصر نص', page.locator('.blk'));

  // محرّر الرسم يفتح ويحفظ
  await page.locator('.add-strip button').nth(4).click();
  await sleep(900);
  await expect('فتح محرّر الرسم', page.locator('.draw-overlay'));
  await page.locator('.draw-top button.primary').click();
  await sleep(500);

  // الإعدادات
  await go('music');
  await page.locator('.head button.btn.icon').first().click();
  await sleep(350);
  await expect('فتح الإعدادات', page.locator('.sheet'));
  await page.locator('.scrim').click({ position: { x: 20, y: 20 } });
  await sleep(200);

  // بروتين من القائمة: تصنيف الفواكه ← منتقي المقدار
  await go('workout');
  await tab(1);
  await page.getByText('＋ من القائمة').click();
  await sleep(400);
  await page.locator('.sheet .chip').filter({ hasText: 'فواكه' }).click();
  await sleep(300);
  await page.locator('.sheet .food button.primary').first().click();
  await sleep(450);
  await expect('منتقي مقدار الطعام', page.locator('.sheet .prot-big'));
  await page.locator('.sheet').getByText('✓ أضف').click();
  await sleep(450);
  await expect('إضافة فاكهة بمقدارها', page.locator('.food button.as-btn'));

  // تعديل غرامات إدخال مسجَّل
  await page.locator('.food button.as-btn').first().click();
  await sleep(400);
  await page.locator('.sheet input[type="number"]').first().fill('42');
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(450);
  await expect('تعديل غرامات البروتين', page.getByText('42 غم').first());

  // مركز النسخ الاحتياطي ولقطة يدوية
  await page.locator('.head button.btn.icon').first().click();
  await sleep(400);
  await page.locator('.sheet').getByText('🗄 النسخ الاحتياطي والاسترجاع').click();
  await sleep(500);
  await page.locator('.sheet').getByText('＋ خذ لقطة الآن').click();
  await sleep(800);
  await expect('لقطة احتياطية قابلة للاسترجاع', page.locator('.sheet').getByText('↺ استرجع').first());
  // ورقتان مفتوحتان (الإعدادات ثم النسخ) — نغلقهما واحدة تلو الأخرى
  while (await page.locator('.scrim').count()) {
    await page.locator('.scrim').last().click({ position: { x: 20, y: 20 } });
    await sleep(300);
  }

  // اسم عربي يُكتب حرفًا حرفًا ويبقى كاملًا بعد إعادة تشغيل التطبيق
  const NAME = 'تمرين الضغط المائل بالدمبل';
  await go('workout');
  await tab(0);
  await page.locator('.slot.empty').first().click();
  await sleep(400);
  await page.locator('.sheet input').first().pressSequentially(NAME, { delay: 35 });
  await page.locator('.sheet').getByText('💾 حفظ').click();
  await sleep(600);

  await page.reload();
  await page.waitForSelector('.nav', { timeout: 15000 });
  await sleep(900);
  await go('workout');
  await tab(0);
  await expect('اسم عربي كامل بعد إعادة التشغيل', page.getByText(NAME, { exact: true }).first());

  /* ───── قسم Improve: خطوة، متطلّبات، إنجاز بتأكيد، وربط بالتقويم ───── */

  const tasksBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('yw.state.v1')).time.tasks.length);

  // الأوراق تتراكم هنا (محرّر ← ورقة فرعية)، فنعمل دائمًا على الورقة العليا
  const top = () => page.locator('.sheet').last();

  await go('improve');
  await tab(0);
  await page.getByText('＋ خطوة جديدة').click();
  await sleep(400);
  await top().locator('input').first().fill('أقرأ ٢٠ صفحة');
  await top().getByText('＋ أضف سطر «أحتاج»').click();
  await sleep(400);
  await top().locator('input').first().fill('اشتراك مكتبة');
  await top().locator('input[type="number"]').first().fill('15000');
  await top().getByText('أضف', { exact: true }).click();
  await sleep(450);
  await expect('سطر «أحتاج» في الخطوة', page.locator('.imp-need'));

  // ربط بالتقويم — يُنشئ مهمّة جديدة فقط
  await top().getByText('🗓 ضعها في التقويم').click();
  await sleep(450);
  await top().locator('.chip').filter({ hasText: 'كل يوم' }).first().click();
  await sleep(300);
  await top().getByText('🗓 أضفها إلى التقويم').click();
  await sleep(600);
  await top().getByText('💾 حفظ').click();
  await sleep(600);
  await expect('إضافة خطوة تطوير', page.locator('.imp-item'));

  const tasksAfter = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('yw.state.v1')).time.tasks;
    return { n: t.length, improve: t.filter((x) => x.source === 'improve').length, old: t.some((x) => x.title === 'اختبار آلي') };
  });
  if (tasksAfter.n !== tasksBefore + 1 || tasksAfter.improve !== 1 || !tasksAfter.old) {
    throw new Error(`ربط التقويم أخلّ بالمهام: ${JSON.stringify(tasksAfter)} (كانت ${tasksBefore})`);
  }
  console.log('  ✓ ربط التقويم يضيف مهمّة ولا يمسّ القديمة');

  // الإنجاز لا يُقبل بلا تأكيد
  await page.locator('.imp-item .check').first().click();
  await sleep(500);
  await top().getByText('✓ نعم، نفّذتها').click();
  await sleep(400);
  if (!await page.locator('.imp-item.done').count()) console.log('  ✓ التأكيد يمنع «صح» بلا دليل');
  else throw new Error('قُبل الإنجاز بلا دليل');
  await top().locator('textarea').first().fill('قرأت ٢٢ صفحة من كتاب اليوم');
  await top().getByText('✓ نعم، نفّذتها').click();
  await sleep(700);
  await expect('إنجاز موثّق في Improve', page.locator('.imp-item.done'));

  /* ───── عارض PDF داخل التطبيق: ترتيب ثابت ورسم يُحفظ ───── */

  await go('study');
  await tab(0);
  // القسم يتذكّر آخر موضع، فنشقّ طريقنا حتى نصل إلى محرّر صفحة
  if (await page.locator('.grp').count()) { await page.locator('.grp').first().click(); await sleep(450); }
  if (!await page.locator('.add-strip').count() && await page.locator('.page-row').count()) {
    await page.locator('.page-row').first().click();
    await sleep(450);
  }
  await expect('محرّر صفحة المذاكرة مفتوح', page.locator('.add-strip'));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.add-strip button').nth(3).click();
  await (await chooser).setFiles(TEST_PDF);
  await sleep(1400);
  await page.locator('.file').first().click();
  await sleep(4000);
  await expect('فتح PDF داخل التطبيق', page.locator('.pdf-page'), 3);

  const widths = await page.evaluate(() =>
    [...document.querySelectorAll('.pdf-page')].slice(0, 5).map((el) => el.offsetWidth));
  if (new Set(widths).size !== 1) throw new Error(`عرض الصفحات غير موحّد: ${widths.join(',')}`);
  console.log('  ✓ صفحات PDF بعرض موحّد');

  const tops1 = await page.evaluate(() => [...document.querySelectorAll('.pdf-page')].map((e) => e.offsetTop));
  await page.evaluate(() => { document.querySelector('.pdf-stage').scrollTop = 2400; });
  await sleep(1500);
  const tops2 = await page.evaluate(() => [...document.querySelectorAll('.pdf-page')].map((e) => e.offsetTop));
  if (JSON.stringify(tops1) !== JSON.stringify(tops2)) throw new Error('ترتيب صفحات PDF تغيّر أثناء التمرير');
  const atPage = await page.locator('.pdf-top .sub').textContent();
  await page.locator('.pdf-bottom button[title="تكبير"]').click();
  await sleep(1200);
  if (await page.locator('.pdf-top .sub').textContent() !== atPage) throw new Error('التكبير أزاح موضع القراءة');
  console.log('  ✓ ترتيب PDF ثابت والتكبير يحافظ على الصفحة');

  // الخطوط المضمّنة تُقرأ من داخل التطبيق لا من الشبكة
  if (!pdfAssetHits.length) throw new Error('لم تُطلب خطوط pdf.js المضمّنة');
  if (pdfAssetHits.some((r) => r.startsWith('4') || r.startsWith('5'))) {
    throw new Error(`تعذّر تحميل موارد pdf.js: ${pdfAssetHits.join(', ')}`);
  }
  console.log(`  ✓ خطوط pdf.js تُقرأ من داخل التطبيق (${pdfAssetHits.length})`);

  await page.locator('.pdf-top button[title="الصفحات"]').click();
  await sleep(450);
  await expect('لوحة جودة النصّ', page.locator('.pdf-panel b'));
  await page.locator('.pdf-top button[title="الصفحات"]').click();
  await sleep(300);

  await page.locator('.pdf-top button[title="الرسم والكتابة"]').click();
  await sleep(500);
  await expect('٢٤ لونًا للرسم على PDF', page.locator('.pdf-colors button'), 24);

  const lock = page.locator('.pdf-ink .tools button').filter({ hasText: /🔒|🔓/ });
  if (await lock.textContent() !== '🔒') throw new Error('قفل التكبير غير مفعّل افتراضيًا في وضع الرسم');
  await lock.click();
  await sleep(400);
  if (await lock.textContent() !== '🔓') throw new Error('زرّ قفل التكبير لا يتبدّل');
  await lock.click();
  await sleep(400);
  console.log('  ✓ قفل التكبير أثناء الرسم');
  await page.evaluate(() => { document.querySelector('.pdf-stage').scrollTop = 0; });
  await sleep(700);
  const bb = await page.locator('.pdf-page').first().boundingBox();
  await page.mouse.move(bb.x + 40, bb.y + 60);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(bb.x + 40 + i * 9, bb.y + 60 + Math.sin(i / 3) * 18);
  await page.mouse.up();
  await sleep(800);
  const inked = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('yourworld');
    r.onsuccess = () => {
      const g = r.result.transaction('pdfnotes').objectStore('pdfnotes').getAll();
      g.onsuccess = () => res(g.result.reduce((s, v) => s + Object.values(v.pages).reduce((t, a) => t + a.length, 0), 0));
    };
    r.onerror = () => res(0);
  }));
  if (!inked) throw new Error('لم يُحفظ الرسم على PDF');
  console.log('  ✓ الرسم على PDF يُحفظ');
  await page.locator('.pdf-top button[title="إغلاق"]').click();
  await sleep(400);
}

/** بيانات نسخة قديمة من التطبيق (localStorage وحده، بلا طابع زمني). */
const LEGACY = {
  meta: { createdAt: 1, version: 1 },
  workout: {
    days: [
      { id: 'd1', name: 'اليوم الأول', slots: [{ n: 1, title: 'تمرين قديم محفوظ', note: '', media: [] }] },
      { id: 'd2', name: 'اليوم الثاني', slots: [] },
      { id: 'd3', name: 'اليوم الثالث', slots: [] },
    ],
  },
  time: { alarms: [{ id: 'a1', hour: 6, minute: 30, label: 'الدوام', enabled: true }] },
};

/**
 * يتحقّق أن بيانات المستخدم القديمة لا تضيع عند الترقية إلى تخزين IndexedDB:
 * (أ) ترقية عادية عبر ثلاثة إقلاعات، (ب) مرآة قديمة أمام نسخة أفقر في القاعدة.
 */
async function checkMigration(browser, url) {
  const slots = (p) => p.evaluate(() =>
    JSON.parse(localStorage.getItem('yw.state.v1')).workout.days[0].slots.map((x) => x.title));
  const boot = async (p) => {
    await p.goto(url);
    await p.waitForSelector('.nav', { timeout: 15000 });
    await sleep(900);
  };
  const assert = (label, got) => {
    if (got[0] !== 'تمرين قديم محفوظ') throw new Error(`${label}: ضاعت البيانات القديمة (${JSON.stringify(got)})`);
    console.log(`  ✓ ${label}`);
  };

  // (أ) جهاز فيه بيانات النسخة السابقة، ثم يُحدَّث التطبيق ويُفتح ثلاث مرّات
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    await ctx.addInitScript((s) => {
      if (!localStorage.getItem('yw.state.v1')) localStorage.setItem('yw.state.v1', JSON.stringify(s));
    }, LEGACY);
    const p = await ctx.newPage();
    for (let i = 0; i < 3; i++) await boot(p);
    assert('ترقية من النسخة السابقة بلا فقدان', await slots(p));
    await ctx.close();
  }

  // (ب) القاعدة فيها حالة فارغة بطابع زمني، والمرآة القديمة فيها بيانات بلا طابع
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const first = await ctx.newPage();
    await boot(first);
    await first.close();
    await ctx.addInitScript((s) => localStorage.setItem('yw.state.v1', JSON.stringify(s)), LEGACY);
    const p = await ctx.newPage();
    await boot(p);
    assert('حارس: لا تمحو نسخة فارغة بياناتك', await slots(p));
    await ctx.close();
  }
}

async function main() {
  console.log('▸ بناء الإصدار…');
  await run('npx', ['vite', 'build']);

  // ملف PDF للاختبار: صفحات بأحجام مختلفة لنتأكّد أنّ العارض يرتّبها بلا قفز
  await run('node', ['tools/dev/make-test-pdf.mjs', TEST_PDF, '12']);

  console.log('▸ تشغيل خادم المعاينة…');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], { stdio: 'ignore' });
  await sleep(2500);

  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: existsSync(BROWSER) ? BROWSER : undefined,
      args: ['--no-sandbox', '--use-fake-ui-for-media-stream'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });

    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
      if (r.url().includes('/pdfjs/')) pdfAssetHits.push(`${r.status()} ${r.url().split('/pdfjs/')[1]}`);
    });

    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await page.waitForSelector('.nav button', { timeout: 15000 });
    await sleep(700);

    if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

    for (const sec of SECTIONS) {
      await goSection(page, sec.id);

      for (const tab of sec.tabs) {
        const tabs = page.locator('.tabs button');
        const n = await tabs.count();
        const i = sec.tabs.indexOf(tab);
        if (n > i) {
          await tabs.nth(i).click();
          await sleep(300);
        }
        if (SHOTS) {
          await page.screenshot({ path: `${SHOT_DIR}/${sec.id}-${tab}.png` });
        }
      }
      console.log(`  ✓ ${sec.id} (${sec.tabs.length} تبويبات)`);
    }

    await runFlows(page);
    await checkMigration(browser, 'http://127.0.0.1:4173/');

    await browser.close();
  } catch (err) {
    errors.push(`فشل التشغيل: ${err.message}`);
    await browser?.close().catch(() => {});
  } finally {
    server.kill();
  }

  if (errors.length) {
    console.error('\n✗ أخطاء:');
    errors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  console.log('\n✓ كل الأقسام تعمل بلا أخطاء.');
}

main().catch((err) => { console.error(err); process.exit(1); });
