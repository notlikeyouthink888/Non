/**
 * فحص آلي: يبني التطبيق، يفتحه في متصفّح بلا واجهة،
 * يتنقّل بين كل الأقسام والتبويبات، ويسقط عند أي خطأ في الطرفية.
 * الاستعمال: npm run check   (أضف --shots لحفظ لقطات في docs/shots)
 */

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = 'docs/shots';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

const SECTIONS = [
  { id: 'music', tabs: ['tracks', 'new', 'favorites', 'playlists', 'artists', 'albums'] },
  { id: 'time', tabs: ['overview', 'timer', 'alarms', 'calendar', 'sleep', 'day'] },
  { id: 'workout', tabs: ['plan', 'protein', 'log'] },
  { id: 'money', tabs: ['overview', 'items', 'subs', 'report'] },
  { id: 'commit', tabs: ['today', 'library', 'routines', 'progress'] },
  { id: 'places', tabs: ['map', 'list', 'offline'] },
  { id: 'room', tabs: ['list', 'zones', 'bought'] },
  { id: 'growth', tabs: ['today', 'library', 'paths', 'done'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // الإعدادات
  await page.locator('.head button.btn.icon').first().click();
  await sleep(350);
  await expect('فتح الإعدادات', page.locator('.sheet'));
  await page.locator('.scrim').click({ position: { x: 20, y: 20 } });
  await sleep(200);
}

async function main() {
  console.log('▸ بناء الإصدار…');
  await run('npx', ['vite', 'build']);

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
