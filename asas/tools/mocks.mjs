/**
 * محاكيات الشبكة للفحص الآلي: Claude API وويكيبيديا وويكيميديا كومنز وOpenverse.
 * تتيح تجربة التطبيق كاملًا (كتابة متدفقة، تخطيط الصور، التحقق البصري، التصدير) دون إنترنت ولا مفتاح.
 * كل طلب إلى Claude يُفحص: النموذج، التفكير التكيّفي، الجهد، البديل التلقائي، ورؤوس المتصفح.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IMG = Object.fromEntries(['cone', 'lab', 'site', 'beam', 'extra'].map((n) => [n, readFileSync(join(here, 'fixtures', `${n}.jpg`))]));

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': '*',
};

function json(route, body, status = 200) {
  return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/* ── الصور ───────────────────────────────────────── */

const FILES = [
  { name: 'Concrete_slump_test.jpg', key: 'cone', title: 'Concrete slump test cone', w: 2400, h: 1800 },
  { name: 'Slump_cone_laboratory.jpg', key: 'lab', title: 'Slump cone in laboratory', w: 1600, h: 1200 },
  { name: 'Construction_site_concrete.jpg', key: 'site', title: 'Construction site concrete pouring', w: 3000, h: 2000 },
  { name: 'Flexural_beam_test.jpg', key: 'beam', title: 'Concrete beam flexural test', w: 1200, h: 900 },
  { name: 'Company_logo.png', key: 'extra', title: 'Company logo', w: 600, h: 600, mime: 'image/png' },
  { name: 'Tiny_icon.jpg', key: 'extra', title: 'Tiny picture', w: 120, h: 90 },
  { name: 'Broken_file.jpg', key: null, title: 'Broken image file', w: 1600, h: 1200 },
];

function pageOf(f, i) {
  const base = `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${i}/${f.name}`;
  return {
    pageid: 1000 + i, ns: 6, title: 'File:' + f.name, index: i + 1,
    imageinfo: [{
      url: `https://upload.wikimedia.org/wikipedia/commons/a/a${i}/${f.name}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${f.name}`,
      thumburl: `${base}/960px-${f.name}`, thumbwidth: 960, thumbheight: 720,
      width: f.w, height: f.h, mime: f.mime || 'image/jpeg',
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        Artist: { value: `<a href="//commons.wikimedia.org/wiki/User:Tester${i}">Tester ${i}</a>` },
        ImageDescription: { value: `<p>${f.title}</p>` },
      },
    }],
  };
}

export const stats = { claude: [], images: 0, commons: 0, wikipedia: 0, openverse: 0 };

async function onWikimedia(route) {
  const url = new URL(route.request().url());
  const p = url.searchParams;
  if (url.hostname === 'upload.wikimedia.org') {
    stats.images++;
    const f = FILES.find((x) => url.pathname.includes(x.name));
    if (!f || !f.key) return route.fulfill({ status: 404, headers: CORS, body: 'not found' });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/jpeg' }, body: IMG[f.key] });
  }
  if (url.hostname.endsWith('wikipedia.org')) {
    stats.wikipedia++;
    return json(route, { batchcomplete: true, query: { pages: [
      { pageid: 1, ns: 0, title: 'Concrete slump test', index: 1, pageimage: FILES[0].name },
      { pageid: 2, ns: 0, title: 'Concrete', index: 2, pageimage: FILES[2].name },
    ] } });
  }
  stats.commons++;
  if (p.get('titles')) {
    const names = p.get('titles').split('|').map((t) => t.replace(/^File:/, ''));
    return json(route, { query: { pages: FILES.map(pageOf).filter((pg) => names.includes(pg.title.replace(/^File:/, ''))) } });
  }
  // البحث: نعيد كل الملفات بما فيها السيئة ليُختبر الاستبعاد
  return json(route, { batchcomplete: true, query: { pages: FILES.map(pageOf) } });
}

async function onOpenverse(route) {
  stats.openverse++;
  return json(route, { result_count: 1, results: [{
    id: 'ov1', title: 'Concrete work', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Flexural_beam_test.jpg/960px-Flexural_beam_test.jpg',
    thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Flexural_beam_test.jpg/330px-Flexural_beam_test.jpg',
    creator: 'Someone', license: 'by', license_version: '2.0', width: 1200, height: 900, filetype: 'jpg', source: 'flickr',
    foreign_landing_url: 'https://example.org/photo', tags: [{ name: 'concrete' }],
  }] });
}

/* ── Claude ──────────────────────────────────────── */

function reportMarkdown(prompt) {
  const heads = [...prompt.matchAll(/^\d+\.\s+(.+?)\s+\(/gm)].map((m) => m[1]);
  return heads.map((h, i) => {
    let body = `هذه فقرة تجريبية للقسم «${h}» تشرح المحتوى بلغة عربية واضحة، مع مصطلح إنجليزي مثل قابلية التشغيل (Workability) ورقم مواصفة مثل ASTM C143.`;
    if (i === 1) body += '\n\n1. رطّب القالب واللوح.\n2. املأ القالب على ثلاث طبقات.\n3. ادمك كل طبقة بـ25 ضربة.\n   - تُوزَّع الضربات بانتظام.\n4. ارفع القالب خلال 5 ثوانٍ.';
    if (i === 2) body += '\n\n**جدول (1): نتائج الفحص**\n\n| رقم النموذج | الهطول (ملم) | الملاحظات |\n|---|---|---|\n| 1 | [85] | هطول حقيقي |\n| 2 | [90] | — |';
    if (i === 3) body += '\n\n```eq\nSlump = 300 − h\n```\n\nحيث:\n- h: ارتفاع الخرسانة بعد رفع القالب (ملم)\n\n> ملاحظة مهمة: يُهمل الفحص عند حدوث هطول قصّي.';
    if (i === 4) body += '\n\n### عنوان فرعي\n\n- نقطة أولى مع **كلمة عريضة**.\n- نقطة ثانية فيها `BS EN 12350-2`.';
    return `## ${h}\n\n${body}`;
  }).join('\n\n');
}

function jsonFor(body) {
  const props = body.output_config?.format?.schema?.properties || {};
  if (props.figures) {
    const n = Number((JSON.stringify(body.messages).match(/خطّط (\d+) صورة/) || [])[1] || 2);
    return { figures: Array.from({ length: n }, (_, i) => ({
      section: [3, 5, 7, 1, 2, 4][i] ?? i, caption_ar: ['قالب الهطول وأدوات الفحص', 'رفع القالب وقياس الهطول', 'نموذج بعد الفحص', 'صورة رابعة', 'صورة خامسة', 'صورة سادسة'][i],
      queries_en: ['concrete slump test', 'slump cone', 'fresh concrete'], must_show: 'metal slump cone with concrete',
    })) };
  }
  if (props.choices) {
    const figs = (JSON.stringify(body.messages).match(/الصورة المطلوبة رقم/g) || []).length;
    // نرفض آخر صورة لنختبر «لا صورة خاطئة»
    return { choices: Array.from({ length: figs }, (_, i) => ({ figure: i, best: i === figs - 1 && figs > 1 ? -1 : 0, reason: i === figs - 1 && figs > 1 ? 'المرشحات لا تُظهر المطلوب' : 'مطابق' })) };
  }
  if (props.titles) {
    return { titles: [
      { title: 'استخدام الطاقة الشمسية في المباني السكنية', type: 'research', why: 'الأنظمة وطرق التركيب', image_en: 'solar panels building' },
      { title: 'طريقة تنفيذ تركيب الألواح الشمسية على السطوح', type: 'method', why: 'خطوات التنفيذ والسلامة', image_en: 'rooftop solar installation' },
      { title: 'تقييم أحمال الألواح الشمسية على السقوف الخرسانية', type: 'design', why: 'حساب الأحمال الإضافية', image_en: 'solar roof structure' },
    ] };
  }
  if (props.ok) return { ok: true, msg: 'تم الاتصال' };
  return {};
}

function message(text, model) {
  return {
    id: 'msg_mock', type: 'message', role: 'assistant', model, content: [{ type: 'text', text }],
    stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 },
  };
}

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function streamBody(text, model) {
  const chunks = text.match(/[\s\S]{1,60}/g) || [];
  const ev = [
    { type: 'message_start', message: { ...message('', model), content: [], stop_reason: null, usage: { input_tokens: 2500, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 1800 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    ...chunks.map((c) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: c } })),
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.round(text.length / 2) } },
    { type: 'message_stop' },
  ];
  return sse(ev);
}

/** يتحقق من صحة شكل الطلب حسب إرشادات Claude API. */
function validate(req, body) {
  const h = req.headers();
  const problems = [];
  if (!h['x-api-key']) problems.push('x-api-key مفقود');
  if (h['anthropic-dangerous-direct-browser-access'] !== 'true') problems.push('رأس الوصول المباشر من المتصفح مفقود');
  if (!h['anthropic-version']) problems.push('anthropic-version مفقود');
  if (!['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(body.model)) problems.push('نموذج غير متوقع: ' + body.model);
  if (body.thinking?.type !== 'adaptive') problems.push('thinking ليس adaptive');
  if (!['low', 'medium', 'high'].includes(body.output_config?.effort)) problems.push('effort غير محدد');
  if (body.temperature !== undefined) problems.push('temperature يجب ألا يُرسل');
  if (body.model !== 'claude-haiku-5-5') {
    if (body.fallbacks !== 'default') problems.push('fallbacks ليس default');
    if (!(h['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01')) problems.push('رأس server-side-fallback مفقود');
  }
  if (!Array.isArray(body.system) || !body.system[0]?.cache_control) problems.push('system بلا cache_control');
  if (!body.max_tokens) problems.push('max_tokens مفقود');
  return problems;
}

async function onClaude(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if ((req.headers()['x-api-key'] || '').includes('bad')) {
    return route.fulfill({ status: 401, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  }
  const body = JSON.parse(req.postData() || '{}');
  const problems = validate(req, body);
  const kind = body.output_config?.format ? Object.keys(body.output_config.format.schema.properties || {})[0] : (body.stream ? 'stream' : 'text');
  const imgs = JSON.stringify(body.messages).split('"type":"image"').length - 1;
  stats.claude.push({ kind, model: body.model, effort: body.output_config?.effort, problems, images: imgs });
  if (body.stream) {
    const prompt = typeof body.messages[0].content === 'string' ? body.messages[0].content : '';
    const text = prompt.includes('القسم المطلوب تعديله')
      ? 'نص القسم بعد إعادة الصياغة بالذكاء الاصطناعي.\n\n1. خطوة أولى محسّنة.\n2. خطوة ثانية محسّنة.'
      : reportMarkdown(prompt);
    // نُبطئ قليلًا ليظهر التدفق
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: streamBody(text, body.model) });
  }
  return json(route, message(JSON.stringify(jsonFor(body)), body.model));
}

/** يربط كل المحاكيات بصفحة Playwright ويمنع أي اتصال حقيقي آخر. */
export async function installMocks(page) {
  await page.route(/^https:\/\/api\.anthropic\.com\//, onClaude);
  await page.route(/^https:\/\/(commons\.wikimedia\.org|upload\.wikimedia\.org|[a-z]+\.wikipedia\.org)\//, onWikimedia);
  await page.route(/^https:\/\/api\.openverse\.org\//, onOpenverse);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|api\.anthropic\.com|commons\.wikimedia\.org|upload\.wikimedia\.org|[a-z]+\.wikipedia\.org|api\.openverse\.org)/, (r) => r.abort());
}
