/**
 * عميل Claude الرسمي (@anthropic-ai/sdk) داخل التطبيق.
 *
 * طريقتا اتصال:
 *  - مفتاح API مباشر: يُحفظ في جهاز المستخدم فقط ويُرسل مباشرة إلى Anthropic.
 *  - خادم وسيط (server/worker.js): يحتفظ بالمفتاح على الخادم، مناسب لمشاركة التطبيق مع آخرين.
 *
 * كل الطلبات: النموذج المختار (الافتراضي claude-opus-5-5)، تفكير تكيّفي مع مستوى جهد صريح،
 * وبديل تلقائي من الخادم عند رفض الطلب (fallbacks: "default") للنماذج التي تدعمه.
 */

import Anthropic from '@anthropic-ai/sdk';
import { state, modelInfo, addUsage } from '../core/store.js';

let cached = null;
let cacheKey = '';

export function getClient() {
  const a = state.ai;
  const key = [a.mode, a.apiKey.trim(), a.proxyUrl.trim(), a.proxyToken.trim()].join('|');
  if (cached && cacheKey === key) return cached;

  const opts = { dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 15 * 60 * 1000 };
  if (a.mode === 'proxy') {
    opts.baseURL = a.proxyUrl.trim().replace(/\/+$/, '');
    opts.apiKey = 'via-proxy'; // الخادم الوسيط يستبدله بالمفتاح الحقيقي
    if (a.proxyToken.trim()) opts.defaultHeaders = { 'x-app-token': a.proxyToken.trim() };
  } else {
    opts.apiKey = a.apiKey.trim();
  }
  cached = new Anthropic(opts);
  cacheKey = key;
  return cached;
}

/**
 * يبني معاملات طلب موحّدة.
 * system ثابت لكل الطلبات ومعلَّم للتخزين المؤقت (prompt caching).
 */
export function buildParams({ system, messages, effort, maxTokens = 16000, schema = null }) {
  const m = modelInfo();
  const params = {
    model: m.id,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  };
  if (schema) params.output_config.format = { type: 'json_schema', schema };
  if (m.fallbacks) {
    // عند رفض المصنِّفات الآمنة للطلب يعيده الخادم تلقائيًا على النموذج البديل المناسب
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

export class RefusalError extends Error {
  constructor(details) {
    super('refusal');
    this.code = 'REFUSAL';
    this.details = details;
  }
}

/** نص كل كتل text في رسالة. */
export function textOf(message) {
  return (message?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/** طلب JSON منظَّم (structured outputs) غير متدفق. */
export async function jsonCall({ system, prompt, content, schema, effort = 'low', maxTokens = 16000, signal }) {
  const client = getClient();
  const messages = [{ role: 'user', content: content || prompt }];
  const params = buildParams({ system, messages, effort, maxTokens, schema });
  const msg = await client.beta.messages.create(params, { signal });
  addUsage(msg.usage, params.model);
  if (msg.stop_reason === 'refusal') throw new RefusalError(msg.stop_details);
  const text = textOf(msg).trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('تعذّر قراءة ردّ الذكاء الاصطناعي');
  }
}

/**
 * طلب نصي متدفق: يستدعي onText(snapshot) أثناء الكتابة،
 * وonPhase('thinking'|'writing'|'fallback') لعرض الحالة.
 */
export async function streamText({ system, prompt, effort = 'high', maxTokens = 64000, signal, onText, onPhase }) {
  const client = getClient();
  const params = buildParams({ system, messages: [{ role: 'user', content: prompt }], effort, maxTokens });
  const stream = client.beta.messages.stream(params, { signal });
  let started = false;
  let acc = '';

  stream.on('streamEvent', (ev) => {
    if (ev.type === 'content_block_start') {
      const t = ev.content_block?.type;
      if (t === 'thinking' || t === 'redacted_thinking') onPhase?.('thinking');
      else if (t === 'fallback') onPhase?.('fallback');
    }
  });
  // نجمع الأجزاء بأنفسنا: بعد التحويل لنموذج بديل يبدأ النص في كتلة جديدة تُكمل السابقة
  stream.on('text', (delta) => {
    if (!started) { started = true; onPhase?.('writing'); }
    acc += delta;
    onText?.(acc);
  });

  const msg = await stream.finalMessage();
  const cost = addUsage(msg.usage, params.model);
  if (msg.stop_reason === 'refusal') throw new RefusalError(msg.stop_details);
  // بعد التحويل إلى نموذج بديل قد تتعدد كتل النص؛ نجمعها كلها
  return { text: textOf(msg), stopReason: msg.stop_reason, usage: msg.usage, model: msg.model, cost };
}

/** رسالة خطأ عربية مفهومة لكل حالة. */
export function aiErrorMessage(err) {
  const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160);
  if (err instanceof Anthropic.APIUserAbortError || err?.name === 'AbortError') return 'أُلغي الطلب.';
  if (err?.code === 'REFUSAL') return 'اعتذر النموذج عن كتابة هذا المحتوى. جرّب صياغة مختلفة للعنوان أو التفاصيل.';
  if (err instanceof Anthropic.AuthenticationError) return 'مفتاح API غير صحيح أو مُلغى. راجع الإعدادات.';
  if (err instanceof Anthropic.PermissionDeniedError) return state.ai.mode === 'proxy' ? 'رفض الخادم الوسيط الطلب. تحقق من رمز التطبيق.' : 'لا يملك حسابك صلاحية استعمال هذا النموذج.';
  if (err instanceof Anthropic.NotFoundError) return 'النموذج أو العنوان غير موجود. جرّب نموذجًا آخر أو تحقق من رابط الخادم الوسيط.';
  if (err instanceof Anthropic.RateLimitError) return 'تجاوزت حدّ الطلبات المسموح. انتظر دقيقة ثم أعد المحاولة.';
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit|balance|billing/i.test(err.message)) return 'رصيد حسابك في Anthropic غير كافٍ. اشحن الرصيد من console.anthropic.com ثم أعد المحاولة.';
    return 'طلب غير مقبول: ' + short(err.message);
  }
  if (err instanceof Anthropic.InternalServerError) return 'خوادم الذكاء الاصطناعي مشغولة حاليًا. أعد المحاولة بعد قليل.';
  if (err instanceof Anthropic.APIConnectionError) return 'تعذّر الاتصال بالإنترنت أو بالخادم. تحقق من اتصالك ثم أعد المحاولة.';
  if (err instanceof Anthropic.APIError) return `خطأ من الخادم (${err.status ?? '?'}): ${short(err.message)}`;
  return 'حدث خطأ غير متوقع: ' + short(err?.message);
}

/** فحص سريع للاتصال من صفحة الإعدادات. */
export async function testConnection(signal) {
  const res = await jsonCall({
    system: 'You verify connectivity. Reply with the requested JSON only.',
    prompt: 'Return {"ok": true, "msg": "تم الاتصال"}',
    schema: { type: 'object', properties: { ok: { type: 'boolean' }, msg: { type: 'string' } }, required: ['ok', 'msg'], additionalProperties: false },
    effort: 'low',
    maxTokens: 2000,
    signal,
  });
  return res;
}
