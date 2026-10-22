/**
 * فحص آلي شامل: يبني التطبيق، يفتحه في متصفّح بلا واجهة، يستورد صورًا،
 * يقصّ ويدوّر ويطبّق فلترًا، ينشئ PDF ثم يتحقّق من الملف الناتج.
 * الاستعمال: npm run check   (أضف --shots لحفظ لقطات في docs/shots)
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = 'docs/shots';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const PORT = 4174;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} فشل (${code})`))));
  });
}

const ok = (label) => console.log(`  ✓ ${label}`);
async function expectCount(label, locator, count) {
  const n = await locator.count();
  if (n !== count) throw new Error(`${label}: توقّعنا ${count} فوجدنا ${n}`);
  ok(label);
}

await run('npx', ['vite', 'build', '--logLevel', 'warn']);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await sleep(1500);

const errors = [];
const browser = await chromium.launch({ executablePath: existsSync(BROWSER) ? BROWSER : undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOT_DIR, { recursive: true });
    await sleep(350);
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  };

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.start-card');
  ok('فتح الشاشة الرئيسية');
  await shot('home-empty');

  // صور اختبار: «مستند» بخلفية غير متساوية، صورة أفقية، وصورة ملوّنة
  const images = await page.evaluate(async () => {
    const make = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    };
    return [
      make(1200, 1600, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#d8d2c4'); gr.addColorStop(1, '#8c8577');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#222';
        for (let y = 140; y < h - 120; y += 60) g.fillRect(120, y, w - 240 - (y % 180), 14);
        g.font = 'bold 80px sans-serif'; g.fillText('PDFS TEST', 140, 110);
      }),
      make(1600, 900, (g, w, h) => {
        g.fillStyle = '#2b6cb0'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#f6e05e'; g.beginPath(); g.arc(w * 0.7, h * 0.35, 140, 0, 7); g.fill();
        g.fillStyle = '#276749'; g.fillRect(0, h * 0.7, w, h * 0.3);
      }),
      make(1000, 1000, (g, w, h) => {
        for (let i = 0; i < 10; i++) { g.fillStyle = `hsl(${i * 36} 80% 55%)`; g.fillRect(i * w / 10, 0, w / 10, h); }
      }),
    ];
  });

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.start-card').first().click()]);
  await chooser.setFiles(images.map((b, i) => ({ name: `img${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b, 'base64') })));
  await page.waitForSelector('.page-card[data-id]');
  await sleep(600);
  await expectCount('استيراد ثلاث صور', page.locator('.page-card[data-id]'), 3);
  await shot('project');

  // المحرّر: نسبة 1:1، تدوير، فلتر «مستند»
  await page.locator('.page-open').first().click();
  await page.waitForSelector('.crop-box');
  await sleep(500);
  await shot('editor-crop');
  await page.locator('.chip', { hasText: '١:١' }).click();
  const box = await page.locator('.crop-box').boundingBox();
  if (Math.abs(box.width - box.height) > 2) throw new Error(`القص ١:١ غير مربّع: ${box.width}×${box.height}`);
  ok('قصّ بنسبة ١:١');

  // سحب الزاوية لتصغير القص
  const br = await page.locator('.h-br').boundingBox();
  await page.mouse.move(br.x + br.width / 2, br.y + br.height / 2);
  await page.mouse.down();
  await page.mouse.move(br.x - 60, br.y - 40, { steps: 6 });
  await page.mouse.up();
  const box2 = await page.locator('.crop-box').boundingBox();
  if (box2.width >= box.width || Math.abs(box2.width - box2.height) > 2) throw new Error('سحب الزاوية لم يحافظ على النسبة');
  ok('سحب زاوية القص مع حفظ النسبة');

  await page.locator('.tool', { hasText: 'يمين' }).click();
  await sleep(300);
  await page.locator('.etab', { hasText: 'فلاتر' }).click();
  await page.locator('.filter', { hasText: 'مستند' }).click();
  await sleep(700);
  await shot('editor-filters');
  await page.locator('.etab', { hasText: 'ضبط' }).click();
  await page.locator('.range').first().fill('20');
  await sleep(300);
  await page.locator('[aria-label="تم"]').click();
  await page.waitForSelector('.page-grid');
  await sleep(500);
  await expectCount('وسم الفلتر على الصفحة', page.locator('.page-tag'), 1);

  // نقل الصفحة الأخيرة إلى البداية من قائمتها
  await page.locator('.page-more').nth(2).click();
  await page.locator('.menu-item', { hasText: 'نقل إلى البداية' }).click();
  await sleep(400);
  ok('إعادة ترتيب الصفحات');

  // الإنشاء
  await page.locator('.bottom-bar .btn').click();
  await page.waitForSelector('.sheet .field');
  await page.locator('.sheet .field').fill('ملف اختبار');
  await page.locator('.sheet .chip', { hasText: 'A4' }).click();
  await page.locator('.sheet .switch').click();
  await shot('export');
  await page.locator('.sheet .btn.primary.wide').click();
  await page.waitForSelector('.result', { timeout: 30000 });
  ok('إنشاء PDF');
  await shot('result');

  // استخراج الملف من التخزين والتحقّق منه
  const pdfB64 = await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('pdfs');
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction(['docs', 'blobs']);
      t.objectStore('docs').getAll().onsuccess = (e) => {
        const d = e.target.result[0];
        t.objectStore('blobs').get(d.pdf).onsuccess = async (ev) => {
          const buf = new Uint8Array(await ev.target.result.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          resolve(btoa(s));
        };
      };
    };
    r.onerror = () => reject(r.error);
  }));
  mkdirSync('.check', { recursive: true });
  writeFileSync('.check/check.pdf', Buffer.from(pdfB64, 'base64'));
  try {
    const info = execFileSync('python3', ['-c', `
import sys
from pypdf import PdfReader
r = PdfReader('.check/check.pdf', strict=True)
print(len(r.pages), r.metadata.title, ' '.join(f"{float(p.mediabox.width):.0f}x{float(p.mediabox.height):.0f}" for p in r.pages))
print('|'.join(p.extract_text().strip() for p in r.pages))
`]).toString().trim().split('\n');
    const [count, title] = info[0].split(' ');
    if (count !== '3') throw new Error(`عدد الصفحات ${count}`);
    if (title !== 'ملف') throw new Error(`العنوان ${info[0]}`);
    if (info[1] !== '1 / 3|2 / 3|3 / 3') throw new Error(`ترقيم الصفحات: ${info[1]}`);
    ok(`ملف PDF سليم (pypdf): ${info[0]}`);
  } catch (e) {
    if (/No module named|ENOENT/.test(String(e.message))) console.log('  · تخطّي تحقّق pypdf (غير مثبّت)');
    else throw e;
  }
  try {
    execFileSync('pdftoppm', ['-r', '40', '-png', '.check/check.pdf', '.check/check-page']);
    ok('رسم صفحات الملف (pdftoppm)');
  } catch (e) {
    if (e.code === 'ENOENT') console.log('  · تخطّي pdftoppm (غير مثبّت)');
    else throw e;
  }

  // العودة للرئيسية: يظهر الملف في «ملفاتي»
  await page.locator('.row-btns .btn.primary').click();
  await page.waitForSelector('.doc-row');
  await expectCount('الملف في «ملفاتي»', page.locator('.doc-row'), 1);
  await shot('home');

  // تفاصيل الملف ثم إعادة التسمية
  await page.locator('.doc-main').first().click();
  await page.waitForSelector('.doc-hero');
  await shot('doc');
  await page.locator('.menu-item', { hasText: 'إعادة تسمية' }).click();
  await page.locator('.sheet .field').last().fill('ملف معدّل');
  await page.locator('.sheet .btn.primary').last().click();
  await sleep(500);
  if (!(await page.locator('.doc-row strong').first().textContent()).includes('ملف معدّل')) throw new Error('إعادة التسمية لم تنجح');
  ok('إعادة تسمية الملف');

  // تنزيل (بديل «حفظ في الجهاز» في المتصفّح)
  await page.locator('.doc-main').first().click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.big-action', { hasText: 'حفظ في الجهاز' }).click()]);
  // Chromium بلا واجهة يستبدل الأسماء غير اللاتينية بـ«download»، فنتحقّق من المحتوى
  const head = readFileSync(await dl.path()).subarray(0, 5).toString();
  if (head !== '%PDF-') throw new Error(`الملف المنزّل ليس PDF: ${head}`);
  ok('حفظ الملف في الجهاز (تنزيل)');
  await page.keyboard.press('Escape');
  await sleep(300);

  // إعادة فتح الملف للتعديل ثم الوضع الداكن
  await page.locator('.doc-main').first().click();
  await page.locator('.menu-item', { hasText: 'تعديل الصفحات' }).click();
  await page.waitForSelector('.page-card[data-id]');
  await expectCount('فتح الملف للتعديل', page.locator('.page-card[data-id]'), 3);

  await page.emulateMedia({ colorScheme: 'dark' });
  await shot('project-dark');
  await page.locator('[aria-label="رجوع"]').click();
  await page.waitForSelector('.draft-card');
  ok('المسودة تظهر في الرئيسية');
  await shot('home-dark');

  // بقاء المسودة بعد إعادة التحميل
  await page.reload();
  await page.waitForSelector('.draft-card');
  ok('المسودة محفوظة بعد إعادة الفتح');

  if (errors.length) throw new Error('أخطاء في الطرفية:\n' + errors.join('\n'));
  console.log('\n✔ كل الفحوص نجحت');
} finally {
  await browser.close();
  server.kill();
}
