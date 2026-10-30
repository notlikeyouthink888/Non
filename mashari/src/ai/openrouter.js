/**
 * اتصال OpenRouter (https://openrouter.ai) — نماذج ذكاء اصطناعي مجانية بواجهة متوافقة مع OpenAI.
 *
 * - المفتاح ينحفظ بالجهاز بمفتاح منفصل، فما يطلع ويا النسخة الاحتياطية.
 * - قائمة النماذج المجانية تنجلب حيّة (أسماءها تتغيّر)، وكل طلب يرسل ثلاث بدائل بالترتيب:
 *   المختار أو الأفضل، ثم نموذج من عائلة ثانية، ثم الموجّه المجاني openrouter/free.
 * - إذا منع WebView الطلب بأندرويد، ينعاد عبر طبقة HTTP الأصلية (CapacitorHttp).
 * - الخطة المجانية: 20 طلب بالدقيقة، و50 باليوم (1000 إذا شريت رصيد 10 دولار مرة وحدة).
 */

import { state, save } from '../core/store.js';

export const OR_BASE = 'https://openrouter.ai/api/v1';
export const FREE_ROUTER = 'openrouter/free';

const KEY_STORE = 'mashari.ai.key';
const MODELS_CACHE = 'mashari.ai.models.v1';

/* ────────── المفتاح ────────── */

export const cleanKey = (k) => String(k || '').replace(/^\s*Bearer\s+/i, '').replace(/\s+/g, '');

export function getKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}

export function setKey(k) {
  try {
    const v = cleanKey(k);
    if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE);
  } catch { /* التخزين غير متاح */ }
}

export const hasKey = () => !!getKey();

export class ORError extends Error {
  constructor(status, message, extra = {}) {
    super(message || `HTTP ${status}`);
    this.name = 'ORError';
    this.status = status;
    Object.assign(this, extra);
  }
}

/* ────────── الطلبات ────────── */

const nativeHttp = () => {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  return c?.isNativePlatform?.() ? c.Plugins?.CapacitorHttp : null;
};

function headers(auth, json) {
  const h = { 'X-Title': 'Dirasat Mashari' };
  if (json) h['Content-Type'] = 'application/json';
  if (auth) h.Authorization = `Bearer ${getKey()}`;
  return h;
}

function errorFromBody(status, body, retryAfter) {
  const e = body?.error || {};
  const raw = e.metadata?.raw;
  const msg = [e.message, typeof raw === 'string' ? raw : ''].filter(Boolean).join(' — ') || (typeof body === 'string' ? body : '');
  return new ORError(Number(e.code) || status, msg, { retryAfter: retryAfter ? Number(retryAfter) : null });
}

async function nativeRequest(http, path, { method, body, auth, timeout }) {
  const r = await http.request({
    url: OR_BASE + path,
    method,
    headers: headers(auth, !!body),
    data: body || undefined,
    responseType: 'json',
    connectTimeout: 20000,
    readTimeout: timeout,
  });
  let data = r.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* نص */ } }
  if (r.status >= 400) throw errorFromBody(r.status, data, r.headers?.['Retry-After'] || r.headers?.['retry-after']);
  return data;
}

let preferNative = false;

async function request(path, { method = 'POST', body = null, auth = true, signal, timeout = 120000 } = {}) {
  const http = nativeHttp();
  if (preferNative && http) return nativeRequest(http, path, { method, body, auth, timeout });

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let res;
  try {
    res = await fetch(OR_BASE + path, {
      method, headers: headers(auth, !!body), body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timedOut) throw new ORError(408, 'timeout', { kind: 'timeout' });
    // بأندرويد ممكن WebView يمنع الطلب؛ نجرّب الطبقة الأصلية مرة
    if (http && navigator.onLine !== false) {
      try {
        const data = await nativeRequest(http, path, { method, body, auth, timeout });
        preferNative = true;
        return data;
      } catch (nerr) {
        if (nerr instanceof ORError) throw nerr;
      }
    }
    throw new ORError(0, String(err?.message || err), { kind: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let data = null;
  try { data = await res.json(); } catch { /* مو JSON */ }
  if (!res.ok) throw errorFromBody(res.status, data, res.headers.get('retry-after'));
  if (!data) throw new ORError(502, 'invalid json', { kind: 'empty' });
  return data;
}

/* ────────── النماذج المجانية ────────── */

const NOT_CHAT = /guard|safety|moderat|embed|rerank|tts|whisper|transcri|speech|audio|image-gen|diffusion|flux|imagen|classif/i;

// عائلات معروفة بجودة العربي والاستدلال (للترتيب فقط)
const FAMILIES = [
  [/deepseek/, 34, 'deepseek'], [/qwen|qwq/, 30, 'qwen'], [/kimi|moonshot/, 30, 'kimi'], [/gemini/, 30, 'gemini'],
  [/glm|z-ai/, 26, 'glm'], [/gpt-oss|openai\//, 26, 'openai'], [/grok|x-ai/, 24, 'grok'], [/gemma/, 24, 'gemma'],
  [/llama-?4/, 22, 'llama'], [/llama/, 16, 'llama'], [/mistral|mixtral|magistral/, 16, 'mistral'],
  [/nemotron|nvidia/, 14, 'nvidia'],
];

const familyOf = (id) => {
  const s = String(id).toLowerCase();
  for (const [re, , fam] of FAMILIES) if (re.test(s)) return fam;
  return s.split('/')[0];
};

function sizeOf(text) {
  let best = 0;
  for (const m of String(text).toLowerCase().matchAll(/(?<![a-z\d.])(\d+(?:\.\d+)?)b\b/g)) best = Math.max(best, parseFloat(m[1]));
  return best;
}

function parseModel(m) {
  const arch = m.architecture || {};
  const [inPart, outPart] = String(arch.modality || 'text->text').split('->');
  const inMods = arch.input_modalities || inPart.split('+');
  const outMods = arch.output_modalities || (outPart || 'text').split('+');
  const params = m.supported_parameters || [];
  const p = m.pricing || {};
  const zero = (v) => v === undefined || v === null || Number(v) === 0;
  return {
    id: m.id,
    name: String(m.name || m.id).replace(/\s*\(free\)\s*$/i, '').replace(/^[^:]+:\s*/, ''),
    ctx: m.context_length || m.top_provider?.context_length || 0,
    maxOut: m.top_provider?.max_completion_tokens || 0,
    chat: inMods.includes('text') && outMods.includes('text'),
    structured: params.includes('structured_outputs'),
    json: params.includes('response_format') || params.includes('structured_outputs'),
    reasoning: params.includes('reasoning') || params.includes('include_reasoning'),
    free: /:free$/.test(m.id) || (zero(p.prompt) && zero(p.completion) && zero(p.request)),
  };
}

function score(m) {
  const id = `${m.id} ${m.name}`.toLowerCase();
  let s = 0;
  for (const [re, bonus] of FAMILIES) if (re.test(id)) { s += bonus; break; }
  const size = sizeOf(id);
  s += size ? Math.min(size, 300) / 6 : 15;
  if (/coder|code\b/.test(id)) s -= 12;
  if (/distill/.test(id)) s -= 6;
  if (/nano|tiny|\bmini\b/.test(id)) s -= 10;
  if (m.ctx && m.ctx < 16000) s -= 40;
  if (m.maxOut && m.maxOut < 4000) s -= 30;
  if (m.structured) s += 4;
  return s;
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(MODELS_CACHE) || 'null');
    return c?.list?.length ? c : null;
  } catch { return null; }
}

export const cachedModels = () => readCache()?.list || [];

/** النماذج المجانية الصالحة للكتابة، من الأفضل. تتحدّث كل 12 ساعة. */
export async function freeModels({ force = false, signal } = {}) {
  const c = readCache();
  if (!force && c && Date.now() - c.at < 12 * 3600 * 1000) return c.list;
  try {
    const res = await request('/models', { method: 'GET', auth: false, signal, timeout: 30000 });
    const list = (res.data || []).map(parseModel)
      .filter((m) => m.free && m.chat && !NOT_CHAT.test(`${m.id} ${m.name}`) && !m.id.startsWith('openrouter/'))
      .map((m) => ({ ...m, score: score(m) }))
      .sort((a, b) => b.score - a.score);
    if (list.length) {
      try { localStorage.setItem(MODELS_CACHE, JSON.stringify({ at: Date.now(), list })); } catch { /* ممتلئ */ }
    }
    return list;
  } catch (err) {
    if (c) return c.list;
    throw err;
  }
}

/** ثلاث بدائل للطلب الواحد: المختار (أو الأفضل)، ثم عائلة ثانية، ثم الموجّه المجاني. */
export function chainFor(list) {
  const pick = state.ai.model;
  const pool = list.filter((m) => !m.ctx || m.ctx >= 16000);
  const ids = [];
  if (pick && pick !== 'auto') ids.push(pick);
  for (const m of pool) {
    if (ids.length >= 2) break;
    if (ids.includes(m.id)) continue;
    if (ids.length === 1 && familyOf(m.id) === familyOf(ids[0]) && pool.some((x) => familyOf(x.id) !== familyOf(ids[0]))) continue;
    ids.push(m.id);
  }
  ids.push(FREE_ROUTER);
  return [...new Set(ids)].slice(0, 3);
}

export function modelName(id) {
  if (!id || id === 'auto') return 'تلقائي (أفضل نموذج مجاني)';
  if (id === FREE_ROUTER) return 'الموجّه المجاني';
  const m = cachedModels().find((x) => x.id === id);
  return m?.name || String(id).split('/').pop().replace(/:free$/, '');
}

export function setModel(id) {
  state.ai.model = id || 'auto';
  save();
}

/* ────────── JSON ────────── */

/** يحذف أفكار النموذج المكتوبة بالنص (<think>…</think>). */
export function stripThink(text) {
  let t = String(text || '');
  const close = t.search(/<\/think>/i);
  if (close >= 0 && !/<think>/i.test(t.slice(0, close))) t = t.slice(close + '</think>'.length);
  t = t.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  const open = t.search(/<think>/i);
  if (open >= 0) t = t.slice(0, open);
  return t.trim();
}

/** يستخرج أول كائن JSON من نص بيه شرح أو علامات ``` أو فواصل زايدة. */
export function parseJSONLoose(text) {
  const t = stripThink(text).replace(/^﻿/, '');
  try { return JSON.parse(t); } catch { /* نكمل */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : t;
  const start = src.search(/[{[]/);
  if (start < 0) throw new Error('no json');
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const chunk = src.slice(start, end >= 0 ? end + 1 : undefined);
  try { return JSON.parse(chunk); } catch { /* نكمل */ }
  return JSON.parse(chunk.replace(/,\s*([}\]])/g, '$1'));
}

const schemaHint = (schema) =>
  `أرجع JSON صالح فقط بلا أي شرح ولا علامات \`\`\`، مطابق لهذا المخطط (JSON Schema):\n${JSON.stringify(schema)}`;

/**
 * طلب يرجع JSON. normalize(raw) ينظّف الرد ويرمي خطأ إذا ما يصلح، فنعيد المحاولة مرة.
 * يرجع { data, model }.
 */
export async function jsonCall({ system, prompt, schema, normalize, maxTokens = 4000, signal }) {
  if (!hasKey()) throw new ORError(401, 'no key', { kind: 'nokey' });
  let list = [];
  try { list = await freeModels({ signal }); } catch { list = cachedModels(); }
  const models = chainFor(list);
  const primary = list.find((m) => m.id === models[0]);
  const body = {
    model: models[0],
    models,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: `${system}\n\n${schemaHint(schema)}` },
      { role: 'user', content: prompt },
    ],
  };
  if (primary?.structured) body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } };
  else if (primary?.json) body.response_format = { type: 'json_object' };
  if (primary?.reasoning) body.reasoning = { effort: 'low' };

  const call = async (b) => {
    const data = await request('/chat/completions', { body: b, signal });
    if (data?.error) throw errorFromBody(502, data);
    const ch = data?.choices?.[0];
    if (ch?.finish_reason === 'error') throw errorFromBody(502, data);
    return { text: ch?.message?.content || '', model: data?.model || models[0] };
  };

  let out = await call(body);
  try {
    return { data: normalize(parseJSONLoose(out.text)), model: out.model };
  } catch {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const retry = {
      ...body,
      messages: [...body.messages,
        { role: 'assistant', content: String(out.text || '').slice(0, 6000) },
        { role: 'user', content: `ردّك مو JSON صالح ومطابق للمخطط. ${schemaHint(schema)}` }],
    };
    out = await call(retry);
    try {
      return { data: normalize(parseJSONLoose(out.text)), model: out.model };
    } catch {
      throw new ORError(502, 'bad json', { kind: 'json' });
    }
  }
}

/** يتأكد من المفتاح ويجرّب طلب صغير فعلي. */
export async function testConnection(signal) {
  await request('/key', { method: 'GET', signal, timeout: 30000 });
  const { model } = await jsonCall({
    system: 'You verify connectivity.',
    prompt: 'Return {"ok": true}',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
    normalize: (v) => { if (!v || typeof v !== 'object') throw new Error('bad'); return v; },
    maxTokens: 300,
    signal,
  });
  return `انربط بنجاح ✓ — يشتغل هسه بـ ${modelName(model)}`;
}

/* ────────── رسائل الأخطاء ────────── */

export function errorMessage(err) {
  const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160);
  if (err?.name === 'AbortError') return 'انلغى الطلب.';
  if (!(err instanceof ORError)) return 'صار خطأ غير متوقع: ' + short(err?.message);
  const msg = err.message || '';
  if (err.kind === 'nokey') return 'لازم تحط مفتاح OpenRouter أول — من ⚙ الإعدادات ← الذكاء الاصطناعي.';
  if (err.kind === 'network') return 'ما گدرت أتصل بـ OpenRouter. تأكد من الإنترنت وجرّب مرة ثانية.';
  if (err.kind === 'timeout' || err.status === 408) return 'النموذج المجاني تأخّر بالرد. جرّب مرة ثانية أو اختار نموذج ثاني من الإعدادات.';
  if (err.kind === 'empty') return 'وصل رد فارغ من النموذج. جرّب مرة ثانية.';
  if (err.kind === 'json') return 'النموذج ما رجّع رد مرتّب. جرّب مرة ثانية أو اختار نموذج ثاني.';
  switch (err.status) {
    case 401:
      return 'مفتاح OpenRouter غلط أو محذوف. سوّي مفتاح من openrouter.ai/keys (يبدي بـ sk-or-) والصقه كامل.';
    case 402:
      return 'رصيد حسابك بـ OpenRouter بالسالب، والنماذج المجانية واقفة لحد ما يتسدد.';
    case 403:
      return 'مزوّد النموذج رفض الطلب. جرّب مرة ثانية أو اختار نموذج ثاني.';
    case 404:
      if (/data policy|privacy|publication|training/i.test(msg)) {
        return 'النماذج المجانية مقفولة بإعدادات الخصوصية بحسابك. افتح openrouter.ai/settings/privacy وفعّل السماح بالنماذج المجانية، وجرّب مرة ثانية.';
      }
      return 'النموذج المختار ما بقى متاح. اختار «تلقائي» من إعدادات الذكاء.';
    case 429:
      if (/per-day|per day|daily/i.test(msg)) return 'خلصت حصتك المجانية لليوم (50 طلب، أو 1000 إذا شريت رصيد 10 دولار). تتجدد باچر.';
      if (/upstream|provider|temporarily/i.test(msg)) return 'النموذج المجاني مزدحم هسه. انتظر شوية وجرّب، أو اختار نموذج ثاني.';
      return `وصلت حد 20 طلب بالدقيقة. انتظر ${err.retryAfter ? `${Math.ceil(err.retryAfter)} ثانية` : 'دقيقة'} وجرّب.`;
    case 500: case 502: case 503: case 504:
      return 'النماذج المجانية مشغولة أو واقفة هسه. جرّب بعد شوية.';
    default:
      return `خطأ من OpenRouter (${err.status || '?'}): ${short(msg)}`;
  }
}

/** هل الخطأ يستاهل نوقف السلسلة (مفتاح، حصة، خصوصية) بدل ما نكمل؟ */
export const isFatal = (err) => err instanceof ORError && ([401, 402, 404].includes(err.status) || err.kind === 'nokey'
  || (err.status === 429 && /per-day|per day|daily/i.test(err.message || '')));
