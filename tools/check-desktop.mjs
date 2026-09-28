/**
 * فحص آلي لنسخة الحاسبة: يشغّل تطبيق Electron الحقيقي ويتأكّد أنّ
 * الأصل ثابت (فلا تضيع البيانات)، وأنّ جسر النظام يعمل، وأنّ مجلّد
 * الأغاني يُمسح ويُشغَّل، وأنّ عارض PDF يفتح داخل التطبيق.
 *
 * الاستعمال:  node tools/check-desktop.mjs
 * (على خادم بلا شاشة: xvfb-run -a node tools/check-desktop.mjs)
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} فشل (${code})`))));
  });
}

/** ملف WAV صغير صالح — حتى يكون الاختبار على صوت حقيقي لا على ملف وهمي. */
function wav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const d = Buffer.alloc(44 + n * 2);
  d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVE', 8);
  d.write('fmt ', 12); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22);
  d.writeUInt32LE(rate, 24); d.writeUInt32LE(rate * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34);
  d.write('data', 36); d.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(3000 * Math.sin(i / 12)), 44 + i * 2);
  return d;
}

async function main() {
  console.log('▸ بناء الواجهة…');
  await run('npx', ['vite', 'build']);

  const base = mkdtempSync(join(tmpdir(), 'yw-desktop-'));
  const music = join(base, 'music');
  const nested = join(music, 'طرب');
  const udata = join(base, 'udata');
  mkdirSync(nested, { recursive: true });
  mkdirSync(udata, { recursive: true });
  writeFileSync(join(music, 'كاظم الساهر - مدرسة الحب.wav'), wav(2));
  writeFileSync(join(nested, 'أغنية بلا فنان.wav'), wav(1));
  writeFileSync(join(music, 'ملاحظة.txt'), 'ليست أغنية');
  writeFileSync(join(udata, 'desktop.json'), JSON.stringify({ musicFolder: music }));

  const pdf = join(base, 'test.pdf');
  await run('node', ['tools/dev/make-test-pdf.mjs', pdf, '6']);

  const errors = [];
  const ok = (label) => console.log(`  ✓ ${label}`);
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };

  console.log('▸ تشغيل تطبيق الحاسبة…');
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${udata}`],
  });

  try {
    const win = await app.firstWindow();
    win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    win.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await win.waitForSelector('.nav', { timeout: 30000 });
    await sleep(1200);

    /* الأصل ثابت — عليه تعتمد بقاء البيانات بين التشغيلات */
    const origin = await win.evaluate(() => location.origin);
    need(origin === 'yourworld://app', `أصل غير متوقّع: ${origin}`);
    ok('الأصل ثابت (yourworld://app)');

    const stores = await win.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('yourworld');
      r.onsuccess = () => res([...r.result.objectStoreNames]);
      r.onerror = () => res([]);
    }));
    need(stores.includes('state') && stores.includes('blobs'), `مخازن ناقصة: ${stores}`);
    await win.evaluate(() => localStorage.setItem('yw.desktop.probe', 'ok'));
    need(await win.evaluate(() => localStorage.getItem('yw.desktop.probe')) === 'ok', 'localStorage لا يعمل');
    ok('التخزين الدائم يعمل');

    need(await win.evaluate(() => !!window.desktop?.isDesktop), 'جسر الحاسبة غير موجود');
    need(await win.evaluate(() => document.documentElement.classList.contains('is-desktop')),
      'تخطيط الحاسبة غير مفعّل');
    ok('جسر النظام وتخطيط الحاسبة');

    /* مسح مجلّد الأغاني */
    const scan = await win.evaluate(() => window.desktop.musicScan());
    need(scan.tracks.length === 2, `توقّعنا أغنيتين فوجدنا ${scan.tracks.length}`);
    need(scan.tracks.some((t) => t.artist === 'كاظم الساهر'), 'لم يُقرأ اسم الفنّان من اسم الملف');
    need(!scan.tracks.some((t) => t.path.endsWith('.txt')), 'ملف غير صوتي دخل المكتبة');
    ok('مسح مجلّد الأغاني (بمجلّدات فرعية وأسماء عربية)');

    /* البروتوكول يبثّ الملف ويدعم Range — بدونه لا يعمل التنقّل داخل الأغنية */
    const probe = await win.evaluate(async (uri) => {
      const full = await fetch(uri);
      const bytes = (await full.arrayBuffer()).byteLength;
      const part = await fetch(uri, { headers: { Range: 'bytes=0-99' } });
      return {
        status: full.status, type: full.headers.get('content-type'), bytes,
        partStatus: part.status, range: part.headers.get('content-range'),
        partBytes: (await part.arrayBuffer()).byteLength,
      };
    }, scan.tracks[0].uri);
    need(probe.status === 200 && probe.bytes > 1000, `بثّ الملف فشل: ${JSON.stringify(probe)}`);
    need(probe.type.startsWith('audio/'), `نوع خاطئ: ${probe.type}`);
    need(probe.partStatus === 206 && probe.partBytes === 100 && /^bytes 0-99\//.test(probe.range),
      `طلب النطاق فشل: ${JSON.stringify(probe)}`);
    ok('بثّ ملفات الجهاز مع دعم Range');

    const play = await win.evaluate((uri) => new Promise((res) => {
      const a = new Audio();
      a.onloadedmetadata = () => res({ ok: true, ms: Math.round(a.duration * 1000) });
      a.onerror = () => res({ ok: false });
      setTimeout(() => res({ ok: false }), 6000);
      a.src = uri;
    }), scan.tracks[0].uri);
    need(play.ok && play.ms > 0, 'تعذّر تشغيل الملف');
    ok(`تشغيل فعلي للصوت (${play.ms} ملّي ثانية)`);

    /* المكتبة في الواجهة */
    await win.locator('.nav button[data-id="music"]').click();
    await sleep(500);
    await win.locator('.head button.btn.icon[title="تحديث المكتبة"]').click();
    await sleep(5000);
    const rows = await win.locator('.track-row').count();
    need(rows === 2, `صفوف المكتبة: ${rows}`);
    const durations = await win.evaluate(() =>
      [...document.querySelectorAll('.track-row .d')].map((e) => e.textContent));
    need(durations.every((d) => d && d !== '0:00'), `المدد لم تُملأ: ${durations.join(',')}`);
    ok('المكتبة تظهر والمدد تُملأ في الخلفية');

    await win.locator('.track-row').first().click();
    await sleep(2500);
    need(/\d:\d\d \/ \d:\d\d/.test(await win.locator('#mini-host').innerText()), 'المشغّل لم يبدأ');
    ok('المشغّل يعمل من ملفات القرص');

    /* قراءة ملف عبر الجسر */
    const txt = await win.evaluate((p) => window.desktop.readText(p), join(music, 'ملاحظة.txt'));
    need(txt.text === 'ليست أغنية', 'قراءة ملف عبر الجسر فشلت');
    ok('قراءة ملف من القرص (لاسترجاع النسخ الاحتياطية)');

    /* عارض PDF داخل التطبيق */
    await win.locator('.nav button[data-id="__more"]').click();
    await sleep(400);
    await win.locator('.sec-tile[data-sec="study"]').click();
    await sleep(600);
    await win.locator('.tabs button').nth(0).click();
    await sleep(300);
    await win.getByText('＋ مجموعة جديدة').click();
    await sleep(400);
    await win.locator('.sheet input').first().fill('مذاكرة');
    await win.locator('.sheet').getByText('💾 حفظ').click();
    await sleep(500);
    await win.locator('.grp').first().click();
    await sleep(400);
    await win.getByText('＋ صفحة جديدة').first().click();
    await sleep(500);
    const chooser = win.waitForEvent('filechooser');
    await win.locator('.add-strip button').nth(3).click();
    await (await chooser).setFiles(pdf);
    await sleep(1500);
    await win.locator('.file').first().click();
    await sleep(6000);
    const pages = await win.locator('.pdf-page').count();
    need(pages === 6, `صفحات PDF: ${pages}`);
    ok('عارض PDF يفتح داخل تطبيق الحاسبة');
  } finally {
    await app.close().catch(() => {});
    rmSync(base, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error('\n✗ أخطاء في الطرفية:');
    errors.forEach((e) => console.error('   ' + e));
    process.exit(1);
  }
  console.log('\n✓ نسخة الحاسبة تعمل بلا أخطاء.');
}

main().catch((err) => {
  console.error('\n✗ ' + err.message);
  process.exit(1);
});
