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
import { installMocks, stats, ctl } from './mocks.mjs';
import { startUpstream, startWorker } from './server-sim.mjs';

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
  /* ── 1. الرئيسية: الجامعة والمواد وأنواع التقارير ── */
  await page.goto(BASE + '#/');
  await page.waitForSelector('.type-card');
  assert(await page.locator('.type-card').count() === 12, 'الرئيسية: 12 نوع تقرير جامعي');
  assert(await page.locator('.cat-card').count() === 5, 'الرئيسية: مواد المرحلة الثانية الخمس');
  assert(await page.locator('.uni-row .chip.on', { hasText: 'جامعة بغداد' }).count() === 1, 'الجامعة الافتراضية للغلاف: جامعة بغداد');
  await shot(page, '01-home');

  await page.locator('.search input').fill('تنشن تست');
  await appear(page.getByText('اكتب تقريرًا بعنوان «تنشن تست»'));
  assert(await page.locator('.item', { hasText: 'فحص الشد للحديد' }).count() >= 1, 'البحث بالمصطلح المكتوب بالعربية «تنشن» يجد فحص الشد');

  await page.locator('.search input').fill('السلمب');
  await appear(page.getByText('اكتب تقريرًا بعنوان «السلمب»'));
  assert(await page.locator('.item', { hasText: 'فحص الهطول للخرسانة الطرية' }).count() >= 1, 'البحث بالعامية «السلمب» يجد فحص الهطول');
  await shot(page, '02-search');

  await page.locator('.search input').fill('الطائرات المسيرة في المساحة');
  await appear(page.getByText('اكتب تقريرًا بعنوان «الطائرات المسيرة في المساحة»'));
  assert(await page.getByText('لم تجد العنوان المناسب؟').count() === 1, 'عنوان غير موجود: تظهر بطاقة «لم تجد العنوان؟»');
  await page.getByText('اقترح عناوين بالذكاء الاصطناعي').click();
  await appear(page.locator('.notice.warn'));
  assert(await page.locator('.notice.warn').count() >= 1, 'دون مفتاح: يطلب تفعيل الذكاء الاصطناعي بدل الخطأ');

  /* ── 2. المواد ──────────────────────────────── */
  await page.locator('.nav button').nth(1).click();
  await appear(page.locator('h1.page', { hasText: 'مواد المرحلة الثانية' }));
  assert(await page.locator('.item').count() === 5, 'المواد: خمس مواد للمرحلة الثانية');
  await page.locator('.item', { hasText: 'مقاومة المواد' }).click();
  await page.waitForSelector('.topbar');
  await until(page, () => document.querySelectorAll('.item').length >= 20);
  assert(await page.locator('.item').count() === 24, 'مقاومة المواد: 24 عنوانًا');
  await page.locator('.chip', { hasText: 'تجارب المختبر' }).click();
  await until(page, () => document.querySelectorAll('.item').length === 11);
  assert(await page.locator('.item').count() === 11, 'تصفية تجارب المختبر: 11 تجربة');
  await shot(page, '03-browse-strength');

  /* ── 3. تقرير مختبر دون اتصال بصيغة الجامعة ──── */
  await page.goto(BASE + '#/create?topic=tension_test');
  await page.waitForSelector('.type-card.on');
  const readIn = page.locator('textarea[placeholder^="اكتب: "]');
  assert((await readIn.getAttribute('placeholder')).includes('قطر النموذج'), 'صفحة الإنشاء: خانة القراءات مع ما يجب كتابته لهذه التجربة');
  await page.locator('input[placeholder="مثال: 3"]').fill('3');
  await shot(page, '04-create');
  await page.getByText('أنشئ التقرير (محتوى كامل دون اتصال)').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page);
  assert(await page.locator('.rsec').count() === 10, 'تقرير مختبر مقاومة المواد دون اتصال: 10 أقسام مع المواصفة');
  assert(await page.locator('.rsec ol li').count() >= 10, 'خطوات العمل مرقّمة (10 خطوات)');
  assert(await page.locator('.eq').count() >= 1, 'المعادلات تُعرض في كتلة مستقلة');
  await page.waitForFunction(() => document.querySelectorAll('.eq .mx svg').length >= 1 && !document.querySelector('.mx-wait'), null, { timeout: 20000 });
  assert(await page.locator('.eq .mx svg [data-mml-node="mfrac"]').count() >= 1, 'المعادلات مرسومة صورًا بكسور حقيقية بلا «/»');
  assert(await page.locator('.rsec li .mx svg').count() >= 1, 'رموز المعادلات في «حيث» مرسومة بدلائلها السفلية');
  assert(await page.locator('.mx-err').count() === 0, 'لا معادلة فشل رسمها');
  assert(await page.locator('.rsec h3', { hasText: 'أسئلة المناقشة' }).count() === 1, 'المناقشة: أسئلة المناقشة مع أجوبتها');
  const cover = await page.locator('.paper > .cover').innerText();
  assert(cover.includes('جمهورية العراق') && cover.includes('جامعة بغداد') && cover.includes('التجربة رقم (3)') && cover.includes('مقاومة المواد'), 'الغلاف بصيغة الجامعة: الوزارة والجامعة والمادة ورقم التجربة');
  // الصور تُحمَّل كسولًا (loading=lazy)، فننزل إلى أول صورة كما يفعل المستخدم
  await page.locator('figure.fig').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('figure.fig img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const offImgs = await page.locator('figure.fig img').count();
  assert(offImgs >= 1, `الصور تُجلب وتُعرض حتى دون ذكاء اصطناعي (${offImgs})`);
  await shot(page, '05-report-offline');

  /* ── 3ج. الغلاف اختياري وبأنماط متعددة ───────── */
  const openCover = async () => {
    const det = page.locator('details.more-opts', { has: page.locator('summary', { hasText: 'الغلاف' }) });
    if (!(await det.evaluate((d) => d.open))) await det.locator(':scope > summary').click();
  };
  const makeOffline = async (topic, style) => {
    await page.goto(BASE + '#/library');
    await page.goto(BASE + `#/create?topic=${topic}`);
    await page.waitForSelector('.type-card.on');
    await openCover();
    if (style === 'none') await page.locator('.row-set', { hasText: 'صفحة غلاف' }).locator('.switch').click();
    else await page.locator(`.cp[data-id="${style}"]`).click();
    await page.getByText(/أنشئ التقرير \(محتوى كامل دون اتصال\)|نسخة دون اتصال/).first().click();
    await page.waitForURL(/#\/report\//);
    await waitDone(page);
  };
  const exportWord = async (name) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.dock button', { hasText: 'Word' }).click()]);
    mkdirSync(OUT, { recursive: true });
    const path = join(OUT, name);
    await dl.saveAs(path);
    return docxInfo(path);
  };
  await page.goto(BASE + '#/create?topic=compression_test');
  await page.waitForSelector('.type-card.on');
  await openCover();
  assert(await page.locator('.cover-picker .cp').count() === 17, 'الغلاف: 17 نمطًا (منها 8 حديثة مستوحاة من Canva) بمعاينة حيّة لبيانات التقرير');
  await page.locator('.cover-picker').scrollIntoViewIfNeeded();
  await shot(page, '14-cover-styles');

  await makeOffline('compression_test', 'none');
  assert(await page.locator('.paper > .cover').count() === 0 && (await page.locator('.paper > .cover-off h1').innerText()).includes('فحص الانضغاط'), 'الغلاف اختياري: تقرير بلا غلاف يبدأ بعنوانه');
  let info = await exportWord('no-cover.docx');
  assert(info.sections === 1 && !info.text.includes('وزارة التعليم العالي'), 'Word بلا غلاف: قسم واحد يبدأ بالعنوان');

  await makeOffline('compression_test', 'frame');
  assert(await page.locator('.paper > .cover.cs-frame').count() === 1, 'نمط «إطار مزدوج» في العرض');
  info = await exportWord('frame.docx');
  assert(info.sections === 2 && info.pgBorders === 1, 'Word: الغلاف قسم مستقل بإطار صفحة مزدوج حقيقي، والترقيم يبدأ بعده');

  await makeOffline('compression_test', 'table');
  assert(await page.locator('.paper > .cover.cs-table .cv-table tr').count() >= 6, 'نمط «جدول معلومات»: جدول الطالب والتواريخ في الغلاف');
  info = await exportWord('table.docx');
  assert(info.eqImgs >= 2 && info.omath === 0, `Word: المعادلات صور افتراضيًا (${info.eqImgs})`);
  assert(info.firstTable.includes('اسم الطالب') && info.firstTable.includes('تاريخ التسليم'), 'Word: جدول معلومات الغلاف');

  await page.locator('.topbar .icon-btn').last().click();
  await page.locator('.action-item', { hasText: 'تعديل العنوان وبيانات الغلاف' }).click();
  await page.locator('.sheet .cp[data-id="band"]').click();
  await page.locator('.sheet button.btn.primary', { hasText: 'حفظ' }).click();
  // معاينات الأنماط داخل الورقة المنبثقة أغلفة أيضًا: ننتظر إغلاقها ونفحص غلاف التقرير نفسه
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
  await appear(page.locator('.paper > .cover.cs-band'));
  assert(await page.locator('.paper > .cover.cs-band .cv-band').count() === 1, 'تغيير نمط غلاف تقرير محفوظ من «تعديل بيانات الغلاف»');

  // التنسيق لكل تقرير: إطار مزدوج وعناوين تحتها خط وبلا ترقيم
  await page.locator('.topbar .icon-btn').last().click();
  await page.locator('.action-item', { hasText: 'التنسيق والشكل' }).click();
  await page.locator('.sheet .chip', { hasText: /^مزدوج$/ }).click();
  await page.locator('.sheet .chip', { hasText: 'تحتها خط' }).click();
  await page.locator('.sheet .chip', { hasText: 'أخضر' }).click();
  await page.locator('.sheet .row-set', { hasText: 'ترقيم الأقسام' }).locator('.switch').click();
  // لا يُطبَّق شيء قبل الحفظ
  assert(await page.locator('.paper[data-border="double"]').count() === 0, 'التنسيق: الاختيارات مسودة حتى «حفظ التغييرات»');
  await page.locator('.sheet .fmt-save').click();
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
  await appear(page.locator('.paper[data-border="double"][data-heading="underline"]'));
  assert(await page.locator('.paper[data-border="double"][data-heading="underline"]').count() === 1 && await page.locator('.rsec h2 .n').count() === 0, 'التنسيق: إطار مزدوج وعناوين تحتها خط وأقسام بلا أرقام بعد الحفظ');
  assert((await page.locator('.paper').evaluate((p) => p.style.getPropertyValue('--frame'))).trim() === '#15803d', 'التنسيق: تغيير اللون يُطبَّق (أخضر)');
  info = await exportWord('format.docx');
  const firstHead = (await page.locator('.rsec h2').first().innerText()).trim();
  assert(info.pgBorders === 1 && info.sections === 2 && new RegExp(`^${firstHead}$`, 'm').test(info.text) && !new RegExp(`^\\d+\\. ${firstHead}`, 'm').test(info.text), `Word: إطار على كل صفحات التقرير وعناوين بلا أرقام («${firstHead}»)`);

  // تقرير جماعي: أسماء الطلبة ولقب المشرف ونمط «شعاران»
  await page.locator('.topbar .icon-btn').last().click();
  await page.locator('.action-item', { hasText: 'تعديل العنوان وبيانات الغلاف' }).click();
  await page.locator('.sheet .cp[data-id="logos"]').click();
  await page.locator('.sheet textarea[placeholder^="اسم في كل سطر"]').fill('علي حسن\nسارة محمد\nزينب كريم');
  await page.locator('.sheet .chip', { hasText: /^م\.م$/ }).click();
  await page.locator('.sheet button.btn.primary', { hasText: 'حفظ' }).click();
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
  await appear(page.locator('.paper > .cover.cs-logos'));
  assert(await page.locator('.paper > .cover.cs-logos .cv-students li').count() === 3, 'الغلاف: «إعداد الطلاب» قائمة مرقّمة بأسماء المجموعة (نمط شعاران)');
  info = await exportWord('students.docx');
  assert(info.text.includes('زينب كريم') && info.text.includes('إعداد الطلاب'), 'Word: أسماء طلبة المجموعة في الغلاف');

  // لون الغلاف ولونه الثاني، وإخفاء الحقول، وتغيير عناوينها — بنمط حديث بزخرفة
  await page.locator('.topbar .icon-btn').last().click();
  await page.locator('.action-item', { hasText: 'تعديل العنوان وبيانات الغلاف' }).click();
  await page.locator('.sheet .cp[data-id="royal"]').click();
  const design = page.locator('.sheet .cv-design');
  await page.locator('.sheet .field', { has: page.locator('label', { hasText: /^بإشراف$/ }) }).locator('input').fill('أحمد سلمان');
  await design.locator('.field').first().locator('.chip', { hasText: 'أخضر' }).click();
  await design.locator('.chip', { hasText: 'فضي' }).click();
  assert((await page.locator('.sheet .cp[data-id="royal"] .cover').evaluate((c) => c.style.getPropertyValue('--cc'))).trim() === '#15803d', 'لون الغلاف: المعاينة تتلوّن فورًا بالأخضر');
  await design.locator('details.cv-fields > summary').click();
  await design.locator('.cv-fields .row-set', { hasText: 'اسم المادة' }).locator('.switch').click();
  await design.locator('.cv-fields .row-set', { hasText: 'جمهورية العراق' }).locator('.switch').click();
  await design.locator('details.cv-labels > summary').click();
  await design.locator('input[data-label="sup"]').fill('المشرف');
  await design.locator('.label-row', { has: page.locator('input[data-label="students"]') }).locator('.switch').click();
  await page.locator('.sheet button.btn.primary', { hasText: 'حفظ' }).click();
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
  await appear(page.locator('.paper > .cover.cs-royal'));
  const royal = page.locator('.paper > .cover.cs-royal');
  const vars = await royal.evaluate((c) => [c.style.getPropertyValue('--cc').trim(), c.style.getPropertyValue('--ca').trim(), !!c.querySelector('.cv-deco svg path')]);
  assert(vars[0] === '#15803d' && vars[1] === '#94a3b8' && vars[2], `لون الغلاف أخضر ولونه الثاني فضي وزخرفة النمط «ملكي» (${vars.join('، ')})`);
  const rt = await royal.innerText();
  assert(!rt.includes('مقاومة المواد') && !rt.includes('جمهورية العراق') && rt.includes('تقرير مختبر'), 'إخفاء اسم المادة وترويسة الوزارة من الغلاف');
  assert(rt.includes('المشرف:') && rt.includes('أحمد سلمان') && !rt.includes('بإشراف') && !rt.includes('إعداد الطلاب') && rt.includes('زينب كريم'), 'عناوين الحقول: «بإشراف» صارت «المشرف»، و«إعداد الطلاب» حُذفت وبقيت الأسماء');
  info = await exportWord('royal.docx');
  assert(info.behind === 1 && info.colors.includes('15803D') && info.text.includes('المشرف: م.م أحمد سلمان') && !info.text.includes('جمهورية العراق'), `Word: زخرفة الغلاف خلف النص واللون الأخضر والحقول نفسها (${info.behind} زخرفة)`);

  // معادلات Word القابلة للتعديل (خيار في الإعدادات)
  const reportUrl = page.url();
  await page.goto(BASE + '#/settings');
  await page.locator('.chip', { hasText: 'معادلات Word قابلة للتعديل' }).click();
  await page.goto(reportUrl);
  await page.waitForSelector('.paper > .cover');
  info = await exportWord('native-math.docx');
  assert(info.omath >= 2 && info.mfrac >= 1, `Word: خيار معادلات Word قابلة للتعديل بكسور حقيقية (${info.omath})`);
  await page.goto(BASE + '#/settings');
  await page.locator('.chip', { hasText: 'صور واضحة' }).click();

  /* ── 3ب. مفتاح خاطئ: رسالة عربية واضحة لا انهيار ── */
  await page.goto(BASE + '#/settings');
  await page.locator('.prov', { has: page.locator('strong', { hasText: /^Claude$/ }) }).click();
  await page.waitForSelector('input[placeholder="sk-ant-api03-…"]');
  await page.locator('input[placeholder="sk-ant-api03-…"]').fill('sk-ant-api03-bad-0123456789abcdefghijklmnop');
  await page.locator('input[placeholder="sk-ant-api03-…"]').blur();
  await page.goto(BASE + '#/create?topic=curing');
  await page.waitForSelector('.type-card.on');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await page.waitForSelector('.notice.err', { timeout: 15000 });
  assert((await page.locator('.notice.err').innerText()).includes('مفتاح API غير صحيح'), 'مفتاح خاطئ: رسالة عربية واضحة مع زر إعادة المحاولة');

  /* ── 4. تفعيل الذكاء الاصطناعي ──────────────── */
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('input[placeholder="sk-ant-api03-…"]');
  // بعض لوحات مفاتيح أندرويد تضع النص الملصوق دون حدث input: نضع القيمة مباشرة بلا أحداث
  await page.evaluate(() => { document.querySelector('input[name="asas-api-key"]').value = ' sk-ant-api03-test-0123456789abcdefghijklmnop\u200f\n'; });
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  await page.waitForSelector('text=تم الاتصال', { timeout: 10000 });
  ok('مفتاح ملصوق دون حدث input (كما في صورة الخطأ) يُقرأ ويُنظَّف ويُختبر بنجاح');
  assert(await page.locator('.notice', { hasText: 'مفعّل — يكتب التقارير' }).count() === 1, 'الحالة تتحدث فورًا إلى «مفعّل» دون إعادة فتح الصفحة');
  await shot(page, '06-settings');

  /* ── 5. اقتراح عناوين ثم تقرير بالذكاء الاصطناعي ── */
  await page.goto(BASE + '#/?q=' + encodeURIComponent('الطائرات المسيرة في المساحة'));
  await page.getByText('اقترح عناوين بالذكاء الاصطناعي').click();
  await page.waitForSelector('text=استخدام الطائرات المسيّرة في المسح الطوبوغرافي', { timeout: 10000 });
  assert(await page.locator('.card .item').count() === 3, 'الذكاء الاصطناعي اقترح 3 عناوين');
  await shot(page, '07-suggestions');
  await page.locator('.card .item').first().click();
  await page.waitForSelector('.type-card.on');
  assert((await page.locator('textarea').first().inputValue()).includes('الطائرات المسيّرة'), 'العنوان المقترح انتقل إلى صفحة الإنشاء');
  await page.locator('button[aria-label="زيادة"]').click(); // 3 صور: يقبل التحقق البصري اثنتين ويرفض الأخيرة
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await page.waitForSelector('.gen-panel .phase', { timeout: 5000 });
  await shot(page, '08-generating');
  await waitDone(page, 40000);
  assert(await page.locator('.rsec').count() === 9, 'تقرير نظري بالذكاء الاصطناعي: 9 أقسام كما في الهيكل');
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

  /* ── 8أ. عرض تقديمي PowerPoint ─────────────── */
  await page.locator('.topbar .icon-btn').last().click();
  const [pdl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('.action-item', { hasText: 'عرض تقديمي PowerPoint' }).click(),
  ]);
  const pptxPath = join(OUT, 'report.pptx');
  await pdl.saveAs(pptxPath);
  {
    const py = `
import sys, json
from pptx import Presentation
p = Presentation(sys.argv[1])
texts = [' '.join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in p.slides]
pics = sum(1 for s in p.slides for sh in s.shapes if sh.shape_type == 13)
tables = sum(1 for s in p.slides for sh in s.shapes if sh.has_table)
notes = sum(1 for s in p.slides if s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip())
print(json.dumps({'n': len(p.slides), 'first': texts[0], 'last': texts[-1], 'second': texts[1], 'pics': pics, 'tables': tables, 'notes': notes}, ensure_ascii=False))
`;
    const d = JSON.parse(execFileSync('python3', ['-c', py, pptxPath]).toString());
    assert(d.n >= 10 && d.first.includes('الطائرات المسيّرة') && d.second.includes('المحتويات') && d.last.includes('شكرًا لحسن الاستماع'), `PowerPoint: شريحة عنوان ومحتويات وأقسام وختام (${d.n} شريحة)`);
    assert(d.pics >= 3 && d.tables >= 1 && d.notes >= 5, `PowerPoint: صور ومعادلات صورًا وجدول وملاحظات متحدث (${d.pics} صورة)`);
  }

  /* ── 8ب. تقرير مختبر بقراءات الطالب ─────────── */
  await page.goto(BASE + '#/create?topic=venturi');
  await page.waitForSelector('.type-card.on');
  await page.locator('textarea[placeholder^="اكتب: "]').fill('القراءة 1: h1 = 0.352 m و h2 = 0.202 m، الحجم 5 لتر في 13.9 ثانية');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page, 40000);
  assert(stats.lastReportPrompt.includes('قراءات الطالب الفعلية') && stats.lastReportPrompt.includes('h1 = 0.352'), 'قراءات الطالب تصل إلى الذكاء الاصطناعي ليحسب منها النتائج');
  assert(await page.locator('.rsec').count() === 9, 'تقرير مختبر الموائع: 9 أقسام (المواصفة خاصة بالخرسانة والمقاومة)');

  /* ── 8ب2. تقرير بالإنجليزية بأسلوب طالب عادي ─── */
  await page.goto(BASE + '#/create?topic=slump');
  await page.waitForSelector('.type-card.on');
  await page.locator('.chip', { hasText: 'English' }).click();
  await page.locator('.chip', { hasText: 'طالب عادي' }).click();
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page, 40000);
  assert(stats.lastReportPrompt.includes('Write the ENTIRE report in English') && stats.lastReportPrompt.includes('طالب عادي') && stats.lastReportPrompt.includes('كتابة طبيعية'), 'الأسلوب واللغة يصلان للذكاء الاصطناعي: إنجليزي بأسلوب طالب عادي وكتابة طبيعية');
  const enHeads = await page.locator('.rsec h2').allInnerTexts();
  assert(await page.locator('.paper[dir="ltr"]').count() === 1 && /Introduction|Background|Overview/.test(enHeads[0] || ''), `تقرير إنجليزي: الورقة من اليسار لليمين وعناوين إنجليزية (${enHeads.slice(0, 3).join(' | ')})`);
  assert((await page.locator('.paper > .cover').innerText()).includes('Republic of Iraq'), 'تقرير إنجليزي: الغلاف بالإنجليزية');
  {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('.dock button', { hasText: 'Word' }).click()]);
    const path = join(OUT, 'english.docx');
    await dl.saveAs(path);
    const en = docxInfo(path);
    assert(en.all.includes('University of Baghdad') && /Introduction|Background|Overview/.test(en.text) && en.bidi < 3, `Word إنجليزي: من اليسار لليمين (${en.bidi} فقرة RTL)`);
  }

  /* ── 8ج. OpenRouter المجاني ─────────────────── */
  await page.goto(BASE + '#/settings');
  await page.locator('.prov', { has: page.locator('strong', { hasText: /^OpenRouter$/ }) }).click();
  await page.waitForSelector('input[placeholder="sk-or-v1-…"]');
  await appear(page.locator('.item', { hasText: 'تلقائي — الأفضل المتاح الآن' }));
  const orList = await page.locator('.list .item').allInnerTexts();
  assert(orList.some((t) => t.includes('Qwen3 235B')) && orList.some((t) => t.includes('Gemma 4 31B')), 'OpenRouter: قائمة النماذج المجانية تُجلب حيّة ومرتّبة');
  assert(!orList.some((t) => /Guard|GPT-5|Router/.test(t)), 'OpenRouter: لا نماذج مدفوعة ولا مصنِّفات أمان في القائمة');
  const setKey = (k) => page.evaluate((v) => { document.querySelector('input[name="asas-api-key"]').value = v; }, k);
  await setKey('sk-or-v1-policy-0123456789abcdef0123456789');
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  await appear(page.locator('span', { hasText: 'إعدادات الخصوصية' }));
  assert(await page.locator('span', { hasText: 'openrouter.ai/settings/privacy' }).count() === 1, 'OpenRouter: خطأ سياسة البيانات يشرح كيف تُفعَّل النماذج المجانية');
  await setKey('sk-or-v1-bad-0123456789abcdef0123456789');
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  await appear(page.locator('span', { hasText: 'مفتاح OpenRouter غير صحيح' }));
  assert(await page.locator('span', { hasText: 'مفتاح OpenRouter غير صحيح' }).count() === 1, 'OpenRouter: مفتاح خاطئ برسالة عربية واضحة');
  await setKey('sk-or-v1-good-0123456789abcdef0123456789');
  await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
  await page.waitForSelector('text=والكتابة بـ Qwen3 235B', { timeout: 10000 });
  ok('OpenRouter: اختبار الاتصال ناجح مع اسم النموذج والحد اليومي');
  await shot(page, '13-settings-openrouter');

  await page.goto(BASE + '#/?q=' + encodeURIComponent('الطائرات المسيرة في المساحة'));
  await page.getByText('اقترح عناوين بالذكاء الاصطناعي').click();
  await page.waitForSelector('text=مقارنة المسح بالطائرات المسيّرة', { timeout: 10000 });
  assert(await page.locator('.card .item').count() === 3, 'OpenRouter: اقتراح العناوين (JSON داخل شرح وعلامات ``` يُقرأ بتسامح)');

  await page.goto(BASE + '#/create?topic=reynolds');
  await page.waitForSelector('.type-card.on');
  assert(await page.getByText('سيُكتب مجانًا عبر OpenRouter').count() === 1, 'صفحة الإنشاء تذكر الكتابة المجانية عبر OpenRouter');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page, 40000);
  const orText = await page.locator('.paper').innerText();
  assert(await page.locator('.rsec').count() === 9, 'OpenRouter: تقرير مختبر كامل بأقسامه التسعة رغم اختلاف صيغ العناوين (### و**…**)');
  assert(!/think|أرتب الأقسام/.test(orText), 'OpenRouter: أفكار النموذج (<think>) لا تظهر في التقرير');
  await page.waitForFunction(() => document.querySelectorAll('figure.fig img').length >= 1, null, { timeout: 15000 });
  assert((await page.content()).includes('OpenRouter — Qwen3 235B'), 'التقرير يذكر النموذج المجاني الذي كتبه');
  const orBad = stats.openrouter.filter((c) => c.problems.length);
  assert(!orBad.length, `كل طلبات OpenRouter سليمة: مفتاح، سلسلة نماذج مجانية تنتهي بالموجّه، بلا حقول Claude (${stats.openrouter.length})` + (orBad.length ? ' — ' + JSON.stringify(orBad[0]) : ''));
  const vis = stats.openrouter.filter((c) => c.kind === 'choices');
  assert(vis.length >= 1 && vis.every((c) => c.images >= 1 && c.images <= 6 && c.models[0].includes('gemma')), `OpenRouter: التحقق البصري بنموذج يرى الصور وبدفعات صغيرة (${vis.map((c) => c.images).join('، ')} صورة)`);
  assert(stats.openrouter.some((c) => c.kind === 'figures' && c.rf === 'json_schema'), 'OpenRouter: مخطط JSON صارم للنماذج التي تدعمه');
  assert(stats.orModels >= 1 && stats.orKey >= 1, 'OpenRouter: قائمة النماذج والتحقق من المفتاح عبر /models و/key');

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

  /* ── 9ب. محتوى التقرير: بلا نقاط وبلا جداول وبصيغة مختلفة ── */
  await page.goto(BASE + '#/create?topic=slump');
  await page.waitForSelector('.type-card.on');
  const vText = () => page.locator('.row-set', { hasText: 'تنويع الصياغة' }).locator('.t').innerText();
  const v1 = await vText();
  await page.getByRole('button', { name: /صيغة أخرى/ }).click();
  assert((await vText()) !== v1 && /الصيغة \d+ من 12/.test(await vText()), `تنويع الصياغة: صيغة أخرى من 12 (${v1} ← ${await vText()})`);
  await page.locator('.chip', { hasText: 'فقرات بلا نقاط' }).click();
  await page.locator('.row-set', { hasText: 'جداول للقراءات' }).locator('.switch').click();
  await page.locator('.dock button').last().click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page);
  const lists = await page.evaluate(() => [...document.querySelectorAll('.rsec')].slice(0, -1).reduce((n, s) => n + s.querySelectorAll('li').length, 0));
  assert(lists === 0 && await page.locator('.tbl-wrap').count() === 0, `محتوى التقرير: فقرات بلا نقاط وبلا جداول (${lists} نقطة)`);
  assert(await page.locator('.rsec p', { hasText: /أولًا،/ }).count() >= 1, 'الخطوات تُكتب جملًا متتابعة «أولًا… ثانيًا…» بدل قائمة');

  /* ── 9ج. DeepSeek بربط الحساب دون مفتاح ───────── */
  await page.goto(BASE + '#/settings');
  await page.locator('.prov', { has: page.locator('strong', { hasText: /^DeepSeek$/ }) }).click();
  // مفتاح OpenRouter من الفحص السابق يجعله مربوطًا: نفك الربط لنجرّب الربط من البداية
  await page.getByRole('button', { name: 'فك الربط' }).click();
  await page.getByRole('button', { name: /اربط حسابك/ }).click();
  await page.waitForSelector('text=الحساب مربوط', { timeout: 15000 });
  assert(stats.orLink?.verified && stats.orLink.method === 'S256', 'DeepSeek: ربط الحساب بتسجيل الدخول (PKCE S256) ومبادلة الرمز بمفتاح دون لصق');
  await appear(page.locator('.list .item', { hasText: 'DeepSeek V3.1' }));
  assert(await page.locator('.list .item', { hasText: 'DeepSeek V3.1' }).count() === 1 && await page.locator('.list .item', { hasText: 'Qwen' }).count() === 0, 'DeepSeek: قائمة نماذج DeepSeek فقط');
  const dsFrom = stats.openrouter.length;
  await page.goto(BASE + '#/create?topic=curing');
  await page.waitForSelector('.type-card.on');
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await waitDone(page, 40000);
  const dsCalls = stats.openrouter.slice(dsFrom).filter((c) => c.kind === 'stream');
  assert(dsCalls.length >= 1 && dsCalls.every((c) => c.models.every((m) => m.startsWith('deepseek/')) && !c.problems.length), `DeepSeek: التقرير كُتب بنماذج DeepSeek فقط (${dsCalls.map((c) => c.models.join('+')).join('، ')})`);

  /* ── 9د. الخروج من التطبيق أثناء الكتابة: يكمل تلقائيًا بلا خطأ ── */
  const setVisible = (v) => page.evaluate((vis) => {
    Object.defineProperty(document, 'visibilityState', { value: vis ? 'visible' : 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  ctl.dropNext = 1;
  await page.goto(BASE + '#/create?topic=tension_test');
  await page.waitForSelector('.type-card.on');
  await setVisible(false); // المستخدم يخرج من التطبيق بعد بدء الكتابة
  await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
  await page.waitForURL(/#\/report\//);
  await page.waitForFunction(() => /سيكمل تلقائيًا/.test(document.querySelector('.gen-panel')?.innerText || ''), null, { timeout: 15000 });
  assert(await page.locator('.notice.err').count() === 0, 'انقطاع الاتصال أثناء الخروج من التطبيق: «سيكمل تلقائيًا من حيث توقف» بدل الخطأ');
  await sleep(800);
  assert(stats.orContinued === 0, 'لا يعيد الطلب وهو خارج التطبيق: ينتظر رجوعك');
  await setVisible(true);
  await waitDone(page, 40000);
  const contHeads = await page.locator('.rsec h2').allInnerTexts();
  assert(stats.orContinued === 1 && contHeads.length === 10 && new Set(contHeads).size === contHeads.length && await page.locator('.notice.err').count() === 0,
    `بعد الرجوع: أكمل التقرير من حيث انقطع دون تكرار ولا خطأ (${contHeads.length} قسمًا)`);

  /* ── 11. خادم المدير: مفاتيح ونماذج للجميع، سجل التقارير، تيليغرام، إيقاف جهاز ── */
  const up = await startUpstream(8790);
  const srv = await startWorker(8788, 8790);
  const SRV = 'http://127.0.0.1:8788';
  const PW = 'admin-pass-123';
  try {
    await page.goto(BASE + '#/settings');
    await page.getByRole('button', { name: 'لوحة مدير التطبيق' }).click();
    await page.waitForSelector('input[name="admin-url"]');
    await page.fill('input[name="admin-url"]', SRV);
    await page.fill('input[name="admin-password"]', 'wrong-password');
    await page.getByRole('button', { name: 'دخول' }).click();
    await appear(page.getByText('كلمة سر المدير غير صحيحة'));
    assert(await page.getByText('كلمة سر المدير غير صحيحة').count() === 1, 'لوحة المدير: كلمة سر خاطئة تُرفض');
    await page.fill('input[name="admin-password"]', PW);
    await page.getByRole('button', { name: 'دخول' }).click();
    await page.waitForSelector('.admin .stats4', { timeout: 10000 });
    for (const [label, key] of [['الأول', 'sk-or-v1-limit-0123456789abcdefghij'], ['الثاني', 'sk-or-v1-good-0123456789abcdefghij']]) {
      const n = await page.locator('.key-row').count();
      await page.fill('input[name="key-label"]', label);
      await page.fill('input[name="key-secret"]', key);
      await page.getByRole('button', { name: 'أضف المفتاح' }).click();
      await until(page, (c) => document.querySelectorAll('.key-row').length === c, n + 1);
    }
    assert(await page.locator('.key-row').count() === 2, 'لوحة المدير: إضافة مفتاحين (يُستعملان بالترتيب)');
    for (const name of ['Qwen3 235B', 'DeepSeek V3.1']) {
      await page.getByRole('button', { name: 'أضف نموذج كتابة' }).click();
      await page.locator('.sheet .item', { hasText: name }).first().click();
      await page.waitForSelector('.sheet', { state: 'detached' });
      await appear(page.locator('.admin .item.static', { hasText: name }));
    }
    assert(await page.locator('.admin .item.static', { hasText: '1. Qwen3 235B' }).count() === 1 && await page.locator('.admin .item.static', { hasText: '2. DeepSeek V3.1' }).count() === 1, 'لوحة المدير: اختيار نماذج الكتابة للجميع من قائمة OpenRouter الحيّة');
    await page.locator('.admin .chip', { hasText: '5 تقارير' }).click();
    await page.waitForSelector('.toast:has-text("حُفظ")', { timeout: 10000 });
    await page.fill('input[name="tg-token"]', '777:telegram-token');
    await page.fill('input[name="tg-chat"]', '424242');
    await page.locator('.admin button', { hasText: /^حفظ$/ }).last().click();
    await page.waitForSelector('.toast:has-text("حُفظ تيليغرام")', { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('input[name="tg-chat"]')?.value === '424242', null, { timeout: 10000 });
    await page.getByRole('button', { name: 'رسالة تجربة' }).click();
    await appear(page.locator('.toast', { hasText: 'وصلت رسالة التجربة' }));
    assert(up.log.tg.some((m) => m.path === '/tg/bot777:telegram-token/sendMessage' && m.body.includes('424242')), 'تيليغرام: رسالة تجربة وصلت إلى بوت المدير');
    await shot(page, '15-admin');

    // المستخدم: «خادم التطبيق» دون أي مفتاح
    await page.goto(BASE + '#/settings');
    await page.locator('.prov', { has: page.locator('strong', { hasText: 'خادم التطبيق' }) }).click();
    await page.waitForSelector('input[placeholder="https://asas-server.example.workers.dev"]');
    await page.fill('input[placeholder="https://asas-server.example.workers.dev"]', SRV);
    await page.locator('.card input[placeholder="اسمك الثلاثي"]').fill('سجاد علي');
    await page.getByRole('button', { name: 'اختبار الاتصال' }).click();
    await appear(page.getByText(/متصل بخادم/));
    assert((await page.getByText(/متصل بخادم/).innerText()).includes('Qwen3 235B'), 'المستخدم: متصل بخادم التطبيق بلا مفتاح، ويرى النموذج الذي اختاره المدير');
    assert(await page.getByText('يرى المدير تقاريرك').count() >= 1, 'المستخدم يُبلَّغ بوضوح أن المدير يرى تقاريره');
    await page.goto(BASE + '#/create?topic=compression_test');
    await page.waitForSelector('.type-card.on');
    assert(await page.locator('.srv-note').count() === 1, 'صفحة الإنشاء تذكر أن نسخة من التقرير تصل إلى المدير');
    await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
    await page.waitForURL(/#\/report\//);
    await waitDone(page, 40000);
    assert(await page.locator('.rsec').count() >= 8 && await page.locator('.notice.err').count() === 0, `تقرير كامل عبر خادم التطبيق (${await page.locator('.rsec').count()} أقسام)`);
    const streams = up.log.or.filter((x) => x.stream);
    // الطلبات الأولى (الكتابة وتخطيط الصور معًا) تصطدم بحصة المفتاح الأول، ثم كل ما بعدها بالثاني
    const orKeys = up.log.or.map((x) => (/limit/.test(x.key) ? 1 : 2));
    const firstGood = orKeys.indexOf(2);
    assert(orKeys[0] === 1 && firstGood > 0 && orKeys.slice(firstGood).every((k) => k === 2) && streams.length >= 1, `الخادم: حين انتهت حصة المفتاح الأول انتقل تلقائيًا إلى الثاني (${orKeys.join('←')})`);
    assert(streams.every((x) => x.models.join() === 'qwen/qwen3-235b-a22b:free,deepseek/deepseek-chat-v3.1:free,openrouter/free'), 'الخادم يفرض النماذج التي اختارها المدير');
    const admin = (path, o = {}) => fetch(SRV + '/admin' + path, { ...o, headers: { authorization: `Bearer ${PW}`, 'content-type': 'application/json' } }).then((r) => r.json());
    let logged = [];
    for (let i = 0; i < 40 && !logged.length; i++) { logged = (await admin('/reports')).reports; if (!logged.length) await sleep(250); }
    assert(logged.length === 1 && logged[0].name === 'سجاد علي' && logged[0].title.includes('الانضغاط') && logged[0].words > 50, `سجل المدير: التقرير بعنوانه واسم صاحبه (${logged[0]?.title} — ${logged[0]?.name})`);
    await srv.settle();
    assert(up.log.tg.some((m) => m.body.includes('انتهت حصته اليومية')) && up.log.tg.some((m) => m.path.endsWith('/sendDocument') && m.body.includes('الانضغاط')), 'تيليغرام: تنبيه انتهاء حصة المفتاح، وملف التقرير الجديد كاملًا');

    // المدير يرى التقرير ويوقف الجهاز
    await page.goto(BASE + '#/admin');
    await page.waitForSelector('.admin .reports .item', { timeout: 10000 });
    await page.locator('.admin .reports .item').first().click();
    await page.waitForSelector('.sheet .admin-paper h2, .sheet .admin-paper h3');
    assert(await page.locator('.sheet .admin-paper').innerText().then((t) => t.length > 200), 'لوحة المدير: نص التقرير كاملًا');
    await page.locator('.sheet .scrim, .scrim').first().click({ force: true }).catch(() => {});
    await page.goto(BASE + '#/admin');
    await page.waitForSelector('.admin [data-device]', { timeout: 10000 });
    assert((await page.locator('.admin [data-device]').first().innerText()).includes('سجاد علي'), 'لوحة المدير: قائمة المستخدمين بأسمائهم وعدد تقاريرهم');
    await page.locator('.admin [data-device] .switch').first().click();
    await appear(page.locator('.toast', { hasText: 'أُوقف' }));
    await page.goto(BASE + '#/create?topic=curing');
    await page.waitForSelector('.type-card.on');
    await page.getByText('أنشئ التقرير بالذكاء الاصطناعي').click();
    await page.waitForURL(/#\/report\//);
    await page.waitForSelector('.notice.err', { timeout: 15000 });
    assert((await page.locator('.notice.err').innerText()).includes('أوقف مدير التطبيق هذا الجهاز'), 'جهاز أوقفه المدير: رسالة واضحة بدل الكتابة');
  } finally {
    up.server.close();
    srv.server.close();
  }

  /* ── 10. صحة طلبات Claude ────────────────────── */
  const bad = stats.claude.filter((c) => c.problems.length);
  assert(stats.claude.length >= 5, `طلبات Claude المرسلة: ${stats.claude.length} (${[...new Set(stats.claude.map((c) => c.kind))].join('، ')})`);
  assert(!bad.length, 'كل طلبات Claude سليمة: opus-5-5، تفكير تكيّفي، جهد صريح، بديل تلقائي، تخزين مؤقت' + (bad.length ? ' — ' + JSON.stringify(bad[0]) : ''));
  assert(stats.claude.some((c) => c.kind === 'choices' && c.images >= 3), 'التحقق البصري أرسل صور المرشحين للنموذج');
}

/** بنية ملف Word: عدد الأقسام، حدود الصفحة، نص الفقرات، ونص أول جدول. */
function docxInfo(path) {
  const py = `
import sys, json, zipfile, docx
z = zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode('utf8')
d = docx.Document(sys.argv[1])
t = d.tables[0] if d.tables else None
first = ' '.join(c.text for r in t.rows for c in r.cells) if t else ''
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def rtl(p):
  b = p._p.pPr.find(W + 'bidi') if p._p.pPr is not None else None
  return b is not None and b.get(W + 'val') not in ('false', '0')
import re
print(json.dumps({'sections': z.count('<w:sectPr'), 'pgBorders': int('<w:pgBorders' in z), 'behind': z.count('behindDoc="1"'),
  'colors': sorted(set(re.findall(r'w:color w:val="([0-9A-Fa-f]{6})"', z))), 'text': '\\n'.join(p.text for p in d.paragraphs), 'firstTable': first,
  'eqImgs': z.count('name="معادلة"'), 'omath': z.count('<m:oMath>') + z.count('<m:oMath '), 'mfrac': z.count('<m:f>'),
  'all': '\\n'.join([p.text for p in d.paragraphs] + [c.text for t in d.tables for r in t.rows for c in r.cells]),
  'bidi': sum(1 for p in d.paragraphs if p.text.strip() and rtl(p))}, ensure_ascii=False))
`;
  return JSON.parse(execFileSync('python3', ['-c', py, path]).toString());
}

/** يفحص ملف Word الناتج: اتجاه من اليمين لليسار، صور مضمّنة، نصوص عربية. */
function verifyDocx(path) {
  const py = `
import sys, docx
d = docx.Document(sys.argv[1])
ps = d.paragraphs
bidi = sum(1 for p in ps if p._p.pPr is not None and p._p.pPr.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}bidi') is not None)
z = d.part.blob.decode('utf8')
eqs = z.count('name="معادلة"')
imgs = len(d.inline_shapes) - eqs
text = '\\n'.join(p.text for p in ps)
print(len(ps), bidi, imgs, len(d.tables), int('الطائرات المسيّرة' in text), int('شكل (1)' in text), int('وزارة التعليم العالي' in text and 'جامعة بغداد' in text), eqs)
`;
  const out = execFileSync('python3', ['-c', py, path]).toString().trim().split(/\s+/).map(Number);
  const [paras, bidi, imgs, tables, hasTitle, hasCaption, hasCover, eqs] = out;
  assert(paras > 40 && bidi / paras > 0.85, `Word: ${bidi}/${paras} فقرة باتجاه من اليمين لليسار`);
  assert(imgs === 2, `Word: الصور مضمّنة (${imgs})`);
  assert(eqs >= 3, `Word: المعادلات صور واضحة بكسور حقيقية (${eqs})`);
  assert(tables >= 1 && hasTitle && hasCaption, 'Word: الجداول والعنوان وتعليقات الصور موجودة');
  assert(hasCover === 1, 'Word: غلاف الجامعة مع ترويسة الوزارة');
}

/** محوّل المعادلات: القسمة كسر حقيقي دائمًا، والدلائل والأسس والوحدات صحيحة، ولا «/» في أي معادلة من القاعدة. */
async function mathUnit() {
  const { convertExpr, toTeX, autoMath, mathPieces } = await import('../src/core/mathconv.js');
  const { KB } = await import('../src/data/kb/index.js');
  const cases = [
    ['fcu = P / A', 'f_{cu} = \\frac{P}{A}'],
    ['EI·d²y/dx² = M(x)', 'E I \\cdot \\frac{d^{2} y}{dx^{2}} = M(x)'],
    ['hL = K·V² / 2g', 'h_{L} = \\frac{K \\cdot V^{2}}{2 g}'],
    ['Re = 1.273 × 0.01 / 1.0 × 10⁻⁶', '\\mathrm{Re} = \\frac{1.273 \\times 0.01}{1.0 \\times 10^{- 6}}'],
    ['σ = 15700 / 78.54 = 199.9 MPa', '\\sigma = \\frac{15700}{78.54} = 199.9\\,\\mathrm{MPa}'],
    ['a(n+1)/an', '\\frac{a_{n + 1}}{a_{n}}'],
    ['C3S = 4.071·CaO', '\\mathrm{C_{3}S} = 4.071 \\cdot \\mathrm{CaO}'],
  ];
  for (const [src, want] of cases) assert(convertExpr(src) === want, `المحوّل: ${src}`);
  assert(toTeX('a_{n+1}/a_n') === '\\frac{a_{n+1}}{a_n}', 'المحوّل: LaTeX فيه «/» يصبح \\frac');
  const ex = autoMath('مكعب فشل عند 675 kN ← fcu = 675000 / 22500 = 30 MPa.');
  assert(ex.filter((x) => x.math).length === 1 && ex.some((x) => x.text?.includes('مكعب')), 'المعادلة داخل الجملة العربية تُفصل وحدها');
  // كل معادلات القاعدة ومسائلها: لا قسمة بالشرطة المائلة بعد التحويل (إلا داخل وحدة مثل m/s)
  const noUnits = (t) => t.replace(/\\mathrm\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  let n = 0;
  const bad = [];
  for (const kb of Object.values(KB)) {
    for (const l of kb.calc?.eq || []) for (const p of mathPieces(l)) if (p.t === 'math') { n++; if (/(^|[^{\\])\/(?![^{]*\})/.test(noUnits(p.tex))) bad.push(l); }
    for (const e of kb.examples || []) for (const s of [...(e.s || []), e.a]) for (const x of autoMath(s)) if (x.math !== undefined) { n++; if (/\//.test(noUnits(x.math))) bad.push(s); }
  }
  assert(n > 600 && !bad.length, `كل معادلات القاعدة (${n}) تتحول بكسور حقيقية بلا «/»${bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''}`);
}

async function main() {
  console.log('▸ محوّل المعادلات…');
  await mathUnit();
  if (process.argv.includes('--math')) return; // فحص المحوّل وحده: npm run check -- --math
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
      const expected = /Broken_file/.test(r.url()) || (r.status() === 401 && /api\.anthropic\.com/.test(r.url()))
        || ([401, 403, 429].includes(r.status()) && /127\.0\.0\.1:8788/.test(r.url()))
        || ([401, 404, 429].includes(r.status()) && /openrouter\.ai\/api/.test(r.url()));
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
  writeFileSync(join(OUT, 'openrouter-requests.json'), JSON.stringify(stats.openrouter, null, 2));
  console.log(`\n✓ نجحت كل الفحوصات (${passed}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
