/**
 * خادم وسيط اختياري لتطبيق «أساس» على Cloudflare Workers (الخطة المجانية تكفي).
 *
 * لماذا؟ وضع مفتاح Claude API داخل التطبيق مناسب لاستعمالك الشخصي فقط.
 * إن أردت مشاركة التطبيق مع زملائك، احتفظ بالمفتاح هنا على الخادم،
 * وأعطهم رابط الخادم ورمز التطبيق فقط — لا يرون مفتاحك أبدًا.
 *
 * النشر (مرة واحدة):
 *   npm create cloudflare@latest asas-proxy     ← اختر «Hello World Worker» ثم استبدل محتوى src/index.js بهذا الملف
 *   cd asas-proxy
 *   npx wrangler secret put ANTHROPIC_API_KEY   ← مفتاحك من console.anthropic.com
 *   npx wrangler secret put APP_TOKEN           ← أي كلمة سر تعطيها لزملائك (اختياري لكنه مستحسن)
 *   npx wrangler deploy
 * ثم في التطبيق: الإعدادات ← الذكاء الاصطناعي ← «خادم وسيط» ← ضع الرابط والرمز.
 */

const ALLOWED_PATHS = new Set(['/v1/messages']);
const ALLOWED_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const MAX_TOKENS_CAP = 64000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
};

function error(status, type, message) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (request.method !== 'POST' || !ALLOWED_PATHS.has(url.pathname)) return error(404, 'not_found_error', 'المسار غير مدعوم');
    if (!env.ANTHROPIC_API_KEY) return error(500, 'api_error', 'لم يُضبط ANTHROPIC_API_KEY على الخادم');
    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return error(403, 'permission_error', 'رمز التطبيق غير صحيح');
    }

    let body;
    try { body = await request.json(); } catch { return error(400, 'invalid_request_error', 'JSON غير صالح'); }
    if (!ALLOWED_MODELS.has(body.model)) return error(400, 'invalid_request_error', 'نموذج غير مسموح على هذا الخادم');
    if (body.max_tokens > MAX_TOKENS_CAP) body.max_tokens = MAX_TOKENS_CAP;

    const headers = new Headers({
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
    });
    const beta = request.headers.get('anthropic-beta');
    if (beta) headers.set('anthropic-beta', beta);

    const upstream = await fetch(`https://api.anthropic.com${url.pathname}${url.search}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // نمرّر الرد كما هو (بما فيه البث المتدفق) مع رؤوس CORS
    const out = new Headers(upstream.headers);
    Object.entries(CORS).forEach(([k, v]) => out.set(k, v));
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
