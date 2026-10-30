/**
 * فحص آلي: يبني التطبيق، يفتحه بمتصفح بلا واجهة، ويجرّب المسارات الأساسية فعليًا:
 * بحث، فتح مشروع، حكم، إيجابيات وسلبيات، ملاحظات، خريطة ذهنية، حسبة، إضافة مشروع،
 * دراستي، السوق، المقارنة، الإعدادات والنسخة الاحتياطية. يسقط عند أي خطأ بالطرفية.
 * الاستعمال: npm run check   (أضف --shots لحفظ لقطات في docs/shots)
 */

import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
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

/* ── OpenRouter وهمي: نفس شكل الردود الحقيقية، بدون إنترنت ولا مفتاح ── */

const mock = { mode: 'ok' };

const ANALYSIS = {
  chance: 62, verdict: 'maybe', summary: 'الطلب موجود عند الشباب بس المنافسة عالية والقوانين ممكن تتشدد.',
  scenarios: { strong: 35, average: 40, loss: 25 },
  factors: ['الطلب', 'المنافسة', 'رأس المال', 'هامش الربح', 'المخاطر', 'سهولة التشغيل']
    .map((name, i) => ({ name, score: [8, 3, 6, 7, 4, 7][i], note: 'شرح مختصر' })),
  pros: ['هامش ربح عالي بالسوائل', 'زبائن يرجعون كل أسبوع', 'بضاعة خفيفة وسهلة الخزن', 'تگدر تبيع أونلاين ويا المحل'],
  cons: ['منافسة قوية بالمناطق التجارية', 'احتمال منع أو تشديد قانوني', 'بضاعة مقلّدة بالسوق', 'تأثر بسعر الدولار'],
  capital: { min: 8000000, max: 15000000 }, monthlyProfit: { min: 900000, max: 2500000 },
  risks: ['تشديد قانوني', 'تقليد'], tips: ['اختار مكان قرب الجامعات', 'افتح بيج من أول يوم'], checks: ['كم محل فيب بالشارع؟', 'شكد الإيجار؟'],
};

const IDEAS = { ideas: [
  { name: 'لاندري خدمة ذاتية', icon: '🧺', cat: 'services', type: 'shop', cap: 2, desc: 'غسالات ونشافات بالعملة يستعملها الزبون بنفسه.', why: 'الطلاب والعزاب بالمدن الكبيرة يحتاجوها.', chance: 58 },
  { name: 'مطبخ سحابي للطلبات', icon: '🍳', cat: 'food', type: 'service', cap: 2, desc: 'مطبخ بلا صالة يبيع عن طريق تطبيقات التوصيل.', why: 'التوصيل صار عادة يومية.', chance: 64 },
  { name: 'تأجير بلايستيشن للبيوت', icon: '🎮', cat: 'غلط', type: 'xx', cap: 7, desc: 'تأجير أجهزة بالساعة أو باليوم للبيوت والمناسبات.', why: 'سعر الجهاز غالي على الشباب.', chance: '71' },
  { name: 'محل فيبات وسوائل', icon: '💨', cat: 'smoke', type: 'shop', cap: 2, desc: 'مكرر', why: 'مكرر', chance: 50 },
] };

function chatReply(body) {
  const sys = body.messages[0].content;
  const user = body.messages[body.messages.length - 1].content;
  let data;
  if (sys.includes('You verify connectivity')) data = { ok: true };
  else if (user.includes('حلّل هذا المشروع')) data = ANALYSIS;
  else if (user.includes('قيّم احتمال نجاح كل مشروع')) {
    const ids = [...user.matchAll(/^- ([^:\s]+):/gm)].map((m) => m[1]);
    data = { scores: ids.map((id, i) => ({ id, chance: 30 + ((i * 17) % 60), reason: 'سبب مختصر' })) };
  } else if (user.includes('اقترح')) data = IDEAS;
  else data = {};
  // نلفّه بشرح وعلامات ``` حتى نختبر القراءة المتسامحة
  return 'تفضل:\n```json\n' + JSON.stringify(data) + '\n```';
}

async function mockOpenRouter(page) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-title',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = req.url();
    const json = (status, obj) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(obj) });
    if (url.endsWith('/models')) {
      return json(200, { data: [
        { id: 'deepseek/deepseek-chat-v3.1:free', name: 'DeepSeek V3.1 (free)', context_length: 64000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format'], architecture: { modality: 'text->text' } },
        { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B (free)', context_length: 40000, pricing: { prompt: '0', completion: '0' }, supported_parameters: [], architecture: { modality: 'text->text' } },
        { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000, pricing: { prompt: '0.000005', completion: '0.00001' }, architecture: { modality: 'text->text' } },
      ] });
    }
    if (url.endsWith('/key')) return json(200, { data: { label: 'test', is_free_tier: true } });
    if (url.endsWith('/chat/completions')) {
      if (mock.mode === 'daily-limit') return json(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } });
      const body = JSON.parse(req.postData() || '{}');
      if (!body.models?.includes('openrouter/free')) return json(400, { error: { code: 400, message: 'missing fallback chain' } });
      return json(200, { id: 'x', model: body.models[0], choices: [{ message: { role: 'assistant', content: chatReply(body) }, finish_reason: 'stop' }] });
    }
    return json(404, { error: { code: 404, message: 'not found' } });
  });
}

async function main() {
  console.log('▸ بناء الإصدار…');
  await run('npx', ['vite', 'build']);

  console.log('▸ تشغيل خادم المعاينة…');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
  await sleep(2500);

  const errors = [];
  let browser;
  let page;
  try {
    browser = await chromium.launch({
      executablePath: existsSync(BROWSER) ? BROWSER : undefined,
      args: ['--no-sandbox'],
    });
    const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2, hasTouch: false, acceptDownloads: true });
    page = await ctx.newPage();
    page.on('console', (m) => {
      // ردّ 429 الوهمي (اختبار انتهاء الحصة) يطلع بالطرفية كفشل تحميل — هذا متوقّع
      if (m.type() === 'error' && !/status of 429/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); };
    const expect = async (label, cond) => {
      if (!(await cond())) throw new Error(`فشل: ${label}`);
      console.log(`  ✓ ${label}`);
    };
    const sheet = page.locator('.sheet').last();
    const pageTop = () => page.locator('.page').last();

    await mockOpenRouter(page);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('.pcard', { timeout: 15000 });
    await sleep(600);

    await expect('القاعدة فيها أكثر من ٢٠٠ مشروع', async () => (await page.locator('.pcard').count()) > 200);
    await shot('01-projects');

    // بحث متسامح: «بنجرجي» تلگي «بنچرچي»
    await page.locator('.search').fill('بنجرجي');
    await sleep(400);
    await expect('البحث يتسامح ويا چ و گ', async () => (await page.locator('.pcard').count()) === 1);
    await page.locator('.search').fill('فيب');
    await sleep(400);
    await expect('البحث عن «فيب»', async () => (await page.locator('.pcard', { hasText: 'محل فيبات وسوائل' }).count()) === 1);
    await shot('02-search');

    // فتح المشروع ودراسته
    await page.locator('.pcard', { hasText: 'محل فيبات وسوائل' }).click();
    await sleep(500);
    await page.locator('.vbtn', { hasText: 'ينجح' }).click();
    await sleep(250);
    await expect('اختيار الحكم «ينجح»', async () => (await page.locator('.vbtn.ok.on').count()) === 1);

    const pros = page.locator('.points.pros .padd input');
    await pros.fill('الطلب عالي عند الشباب');
    await pros.press('Enter');
    await pros.fill('هامش الربح بالسوائل زين');
    await page.locator('.points.pros .add-btn').click();
    const cons = page.locator('.points.cons .padd input');
    await cons.fill('ممكن يصير منع أو تشديد بالقانون');
    await cons.press('Enter');
    await sleep(200);
    await expect('إضافة إيجابيتين وسلبية', async () =>
      (await page.locator('.points.pros .prow').count()) === 2 && (await page.locator('.points.cons .prow').count()) === 1);

    await page.locator('textarea.notes').fill('المنطقة: الكرادة. الإيجار تقريبًا مليون ونص.');
    await page.locator('.chance input[type=range]').evaluate((el) => { el.value = 70; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await expect('نسبة النجاح ٧٠٪', async () => (await page.locator('.chance-v').textContent()) === '70%');
    await page.locator('.qcard summary').click();
    await page.locator('.qitem').first().click();
    await sleep(200);
    await expect('سؤال مساعد ينضاف للملاحظات', async () => (await page.locator('textarea.notes').inputValue()).includes('منو الزبون'));
    await shot('03-study');

    // الخريطة الذهنية
    await page.locator('.page .tabs button', { hasText: 'الخريطة' }).click();
    await sleep(300);
    await shot('04-map-empty');
    await page.locator('.map-empty .btn.primary').click();
    await sleep(500);
    await expect('فتح محرّر الخريطة', async () => (await page.locator('.mm-svg').count()) === 1);

    await page.locator('.mm-tool', { hasText: 'دائرة جديدة' }).click();
    await sleep(250);
    await sheet.locator('textarea').fill('الزبائن: شباب ١٨–٣٠');
    await sheet.locator('.btn.primary').click();
    await sleep(350);
    await page.locator('.mm-tool', { hasText: 'فرع' }).click();
    await sleep(250);
    await sheet.locator('textarea').fill('يجون بالليل أكثر');
    await sheet.locator('.btn.primary').click();
    await sleep(350);
    await expect('إضافة دائرتين متصلتين', async () => (await page.locator('.mm-node').count()) === 3 && (await page.locator('.mm-link').count()) === 2);

    await page.locator('.mm-bg').click({ position: { x: 10000 + 2, y: 10000 + 2 }, force: true }).catch(() => {});
    await page.locator('.page-head button[aria-label="المزيد"]').last().click();
    await sleep(250);
    await sheet.locator('.menu-item', { hasText: 'أضف فروع جاهزة' }).click();
    await sleep(500);
    await expect('الفروع الجاهزة', async () => (await page.locator('.mm-node').count()) >= 10);

    await page.locator('.page-head button[aria-label="المزيد"]').last().click();
    await sleep(250);
    await sheet.locator('.menu-item', { hasText: 'انقل نقاط الدراسة' }).click();
    await sleep(500);
    await expect('نقل الإيجابيات والسلبيات للخريطة', async () => (await page.locator('.mm-node.c-g').count()) >= 3);

    // سحب دائرة
    const node = page.locator('.mm-node:not(.root)').first();
    const box = await node.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    await sleep(250);
    const box2 = await node.boundingBox();
    await expect('سحب الدائرة يحرّكها', async () => Math.abs(box2.x - box.x) > 20);

    // ربط دائرتين
    await page.locator('.mm-tool', { hasText: 'ربط' }).click();
    await sleep(200);
    const other = page.locator('.mm-node:not(.root):not(.sel)').nth(3);
    const ob = await other.boundingBox();
    await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2);
    await sleep(300);
    await expect('ربط حر بين دائرتين', async () => (await page.locator('.mm-xlink').count()) === 1);

    await page.locator('.mm-zoom button').nth(2).click();
    await sleep(450);
    await shot('05-map-editor');

    // تراجع
    const before = await page.locator('.mm-xlink').count();
    await page.locator('.page-head button[aria-label="تراجع"]').click();
    await sleep(250);
    await expect('التراجع يرجّع آخر خطوة', async () => (await page.locator('.mm-xlink').count()) === before - 1);

    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(450);
    await expect('معاينة الخريطة بصفحة الدراسة', async () => (await page.locator('.map-card .mm-preview').count()) === 1);
    await shot('06-map-preview');

    // الحسبة
    await page.locator('.page .tabs button', { hasText: 'الحسبة' }).click();
    await sleep(300);
    await page.locator('.chip', { hasText: '＋ ديكور وتأسيس' }).click();
    await sleep(200);
    await page.locator('.irow .amount').first().fill('٨٬٠٠٠٬٠٠٠');
    const monthly = page.locator('.card', { hasText: 'المصاريف الشهرية' });
    await monthly.locator('.chip', { hasText: /^＋ إيجار$/ }).click();
    await sleep(200);
    await monthly.locator('.irow .amount').first().fill('1500000');
    const income = page.locator('.card', { hasText: 'الدخل المتوقع' });
    await income.locator('input.amount').nth(0).fill('500000');
    await income.locator('input.amount').nth(1).fill('30');
    await sleep(250);
    await expect('الحسبة تطلّع صافي الربح', async () => (await page.locator('.big-num').textContent()).includes('3,000,000'));
    await expect('مدة رجوع رأس المال', async () => (await page.locator('.res-v').first().textContent()).includes('2.7'));
    await shot('07-calc');

    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(450);
    await expect('الحكم يبين بالقائمة', async () => (await page.locator('.pcard.v-win').count()) === 1);

    // مشروع ثاني بسرعة للمقارنة
    await page.locator('.search').fill('عطور تعبئة');
    await sleep(400);
    await page.locator('.pcard').first().click();
    await sleep(450);
    await page.locator('.vbtn', { hasText: 'متردد' }).click();
    await page.locator('.points.pros .padd input').fill('رأس مال صغير');
    await page.locator('.points.pros .padd input').press('Enter');
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(400);
    await page.locator('.search').fill('');
    await sleep(300);

    // إضافة مشروع جديد
    await page.locator('.fab').click();
    await sleep(300);
    await sheet.locator('.menu-item', { hasText: 'أضيفه بنفسي' }).click();
    await sleep(300);
    await sheet.locator('input').nth(1).fill('محل نظارات شمسية بالمول');
    await sheet.locator('.btn.primary').click();
    await sleep(500);
    await expect('إضافة مشروع جديد يفتح دراسته', async () => (await pageTop().locator('.hero-t').textContent()) === 'محل نظارات شمسية بالمول');
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(400);

    // دراستي
    await page.locator('.nav button').nth(1).click();
    await sleep(400);
    await expect('دراستي تبيّن الأحكام', async () => (await page.locator('.vstat.ok b').textContent()) === '1');
    await shot('08-mine');

    await page.locator('.btn', { hasText: 'قارن بين مشاريع' }).click();
    await sleep(450);
    await expect('المقارنة', async () => (await page.locator('table.cmp').count()) === 1);
    await shot('09-compare');
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(350);

    // السوق والقطاعات
    await page.locator('.nav button').nth(2).click();
    await sleep(400);
    await shot('10-market');
    await page.locator('.sector', { hasText: 'فيب ودخان' }).click();
    await sleep(450);
    await page.locator('.vbtn', { hasText: 'متردد' }).click();
    await page.locator('.points.pros .padd input').fill('الشباب يحبون الفيب');
    await page.locator('.points.pros .padd input').press('Enter');
    await page.locator('.page .tabs button', { hasText: 'المشاريع' }).click();
    await sleep(300);
    await expect('مشاريع القطاع', async () => (await page.locator('.page .pcard').count()) === 4);
    await shot('11-sector');
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(350);
    await page.locator('.market-card').click();
    await sleep(400);
    await expect('دراسة السوق العام', async () => (await pageTop().locator('.hero-t').textContent()) === 'السوق العراقي');
    await page.keyboard.press('Escape');
    await sleep(350);
    await expect('الرجوع (Esc) يسكّر الصفحة', async () => (await page.locator('.page').count()) === 0);

    // الذكاء الاصطناعي (OpenRouter وهمي)
    await page.locator('.nav button').nth(0).click();
    await sleep(300);
    await page.locator('.head button[aria-label="الإعدادات"]').click();
    await sleep(300);
    await sheet.locator('.item', { hasText: 'مو مربوط' }).locator('button').click();
    await sleep(300);
    await sheet.locator('.key-in').fill('sk-or-v1-test');
    await sheet.locator('.btn', { hasText: 'احفظ وجرّب' }).click();
    await page.waitForSelector('.ai-status.ok', { timeout: 10000 });
    await expect('ربط مفتاح OpenRouter وتجربة الاتصال', async () => (await page.locator('.ai-status').textContent()).includes('انربط بنجاح'));
    await shot('15-ai-settings');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await sleep(300);

    await page.locator('.search').fill('فيب');
    await sleep(400);
    await page.locator('.pcard', { hasText: 'محل فيبات وسوائل' }).click();
    await sleep(450);
    await page.locator('.page .tabs button', { hasText: 'تحليل' }).click();
    await sleep(300);
    await page.locator('.ai-intro .btn.primary').click();
    await page.waitForSelector('.ai-hero', { timeout: 15000 });
    await expect('تحليل احتمالات المشروع بالذكاء', async () => (await page.locator('.ai-ring .ring-t').textContent()) === '62%'
      && (await page.locator('.scen-legend').textContent()).includes('35%') && (await page.locator('.factor').count()) === 6);
    const prosBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('mashari.state.v1')).studies['vape-shop'].pros.length);
    await page.locator('.ai-points.pros .adopt').first().click();
    await sleep(400);
    const prosAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('mashari.state.v1')).studies['vape-shop'].pros.length);
    await expect('إضافة نقطة من الذكاء لدراستي', async () => prosAfter === prosBefore + 1);
    await page.locator('.page-body').evaluate((el) => el.scrollTo(0, 0));
    await shot('16-ai-analysis');
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(400);
    await expect('احتمال الذكاء يبين بالقائمة', async () => (await page.locator('.pcard', { hasText: 'محل فيبات وسوائل' }).locator('.sp.ai').textContent()).includes('62%'));
    await page.locator('.search').fill('');
    await sleep(300);

    const cardsBefore = await page.locator(".pcard").count();
    await page.locator('.head button[aria-label="الذكاء الاصطناعي"]').click();
    await sleep(400);
    await page.locator('.page .chip', { hasText: /^3$/ }).click();
    await page.locator('.page .btn.primary', { hasText: 'اقترح' }).click();
    await page.waitForSelector('.idea', { timeout: 15000 });
    await expect('اقتراح مشاريع جديدة (بدون تكرار)', async () => (await page.locator('.idea').count()) === 3);
    await shot('17-ai-ideas');
    await page.locator('.page .link', { hasText: 'أضف الكل' }).click();
    await sleep(400);
    await expect('إضافة الأفكار للقائمة', async () => (await page.locator('.idea .added').count()) === 3);

    await page.locator('.page .tabs button', { hasText: 'احتمالات النجاح' }).click();
    await sleep(300);
    await page.locator('.page .chip', { hasText: 'عطور وتجميل' }).click();
    await sleep(200);
    await page.locator('.page .btn.primary', { hasText: 'قيّم هذا القسم' }).click();
    await page.waitForSelector('.score-row', { timeout: 15000 });
    await sleep(300);
    await expect('تقييم احتمالات قسم كامل', async () => (await page.locator('.page h2.sec', { hasText: 'عطور وتجميل' }).count()) === 1
      && (await page.locator('.score-row').count()) >= 11);
    await shot('18-ai-scores');

    mock.mode = 'daily-limit';
    await page.locator('.page .btn.primary', { hasText: 'قيّم هذا القسم' }).click();
    await page.waitForSelector('.ai-error', { timeout: 15000 });
    await expect('رسالة واضحة عند انتهاء الحصة اليومية', async () => (await page.locator('.ai-error').textContent()).includes('خلصت حصتك'));
    mock.mode = 'ok';
    await page.locator('.page-head button[aria-label="رجوع"]').last().click();
    await sleep(400);
    await expect('المشاريع المقترحة انضافت للقائمة', async () => (await page.locator('.pcard').count()) === cardsBefore + 3
      && (await page.locator('.pcard .mine', { hasText: 'اقتراح الذكاء' }).count()) === 3);

    // الإعدادات + نسخة احتياطية
    await page.locator('.nav button').nth(0).click();
    await sleep(300);
    await page.locator('.head button[aria-label="الإعدادات"]').click();
    await sleep(300);
    await shot('12-settings');
    const dl = page.waitForEvent('download', { timeout: 5000 });
    await sheet.locator('.btn', { hasText: 'احفظ نسخة' }).click();
    const file = await dl;
    await expect('تنزيل نسخة احتياطية', async () => file.suggestedFilename().endsWith('.json'));
    await sheet.locator('.chip', { hasText: 'فاتح' }).click();
    await sleep(250);
    await page.keyboard.press('Escape');
    await sleep(300);
    await shot('13-light');
    await page.locator('.pcard.v-win').first().click();
    await sleep(450);
    await page.locator('.page .tabs button', { hasText: 'الخريطة' }).click();
    await sleep(300);
    await page.locator('.map-card').click();
    await sleep(500);
    await page.locator('.mm-zoom button').nth(2).click();
    await sleep(450);
    await shot('14-light-map');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await sleep(300);

    // البيانات تبقى بعد إعادة التحميل
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.pcard', { timeout: 15000 });
    await sleep(500);
    await expect('الدراسة تبقى محفوظة بعد إعادة الفتح', async () => (await page.locator('.pcard.v-win').count()) === 1
      && (await page.locator('.pcard', { hasText: 'محل نظارات شمسية بالمول' }).count()) === 1);

    await browser.close();
  } catch (err) {
    errors.push(err.message);
    // ماذا كان ظاهر بالشاشة لحظة الفشل — يسهّل معرفة السبب
    const seen = await page?.evaluate(() => {
      const layer = [...document.querySelectorAll('.page, .sheet')].pop();
      return (layer || document.querySelector('.screen'))?.innerText || '';
    }).catch(() => '');
    if (seen) errors.push('الظاهر بالشاشة: ' + seen.replace(/\s+/g, ' ').slice(0, 600));
    await browser?.close().catch(() => {});
  } finally {
    server.kill();
  }

  if (errors.length) {
    console.error('\n✗ أخطاء:');
    errors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  console.log('\n✓ كل المسارات تشتغل بلا أخطاء.');
}

main().catch((err) => { console.error(err); process.exit(1); });
