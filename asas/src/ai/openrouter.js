/**
 * مزوّد OpenRouter: نماذج مجانية عبر واجهة متوافقة مع OpenAI (https://openrouter.ai/api/v1).
 *
 * ما يجعله يعمل بدقة مع النماذج المجانية المتغيّرة باستمرار:
 *  - قائمة النماذج المجانية تُجلب حيّة من /models (لا أسماء مثبّتة قد تختفي) وتُرتَّب حسب الجودة المتوقعة،
 *    وتُحفظ نسخة منها في الجهاز.
 *  - كل طلب يحمل `models` بثلاثة بدائل بالترتيب (المختار، ثم نموذج من عائلة أخرى، ثم موجّه
 *    openrouter/free)، فيتولى OpenRouter التحويل تلقائيًا عند الازدحام أو التوقف.
 *  - مخرجات JSON بمخطط صارم إن دعمه النموذج، وإلا بوضع JSON، مع قراءة متسامحة وإعادة محاولة واحدة.
 *  - البث (SSE) يتجاهل تعليقات «: OPENROUTER PROCESSING» ويلتقط الأخطاء أثناء البث ونصوص التفكير.
 *  - في أندرويد: إن منع المتصفح الطلب يُعاد عبر طبقة HTTP الأصلية في Capacitor.
 *  - حدود الخطة المجانية: 20 طلبًا في الدقيقة، و50 في اليوم (1000 بعد شراء رصيد 10 دولارات مرة واحدة).
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { state, addUsage, cleanKey } from '../core/store.js';

export const OR_BASE = 'https://openrouter.ai/api/v1';
/** موجّه OpenRouter المجاني: يختار نموذجًا مجانيًا متاحًا يدعم متطلبات الطلب (صور، JSON…). */
export const FREE_ROUTER = 'openrouter/free';

const CACHE_KEY = 'asas.or.models.v1';
const CACHE_TTL = 12 * 3600 * 1000;
const isNative = Capacitor.isNativePlatform();

export class ORError extends Error {
  constructor(status, message, extra = {}) {
    super(message || `HTTP ${status}`);
    this.name = 'ORError';
    this.status = status;
    Object.assign(this, extra); // code, metadata, kind, retryAfter
  }
}

/* ── قائمة النماذج المجانية ─────────────────────────── */

// نماذج ليست للمحادثة: مصنِّفات أمان وتضمين وصوت وتوليد صور
const NOT_CHAT = /guard|safety|moderat|embed|rerank|tts|whisper|transcri|speech|audio-only|image-gen|diffusion|flux|imagen|classif/i;

// عائلات معروفة بجودة الكتابة متعددة اللغات والاستدلال (للترتيب فقط، لا للتصفية)
const FAMILIES = [
  [/deepseek/, 34, 'deepseek'], [/qwen|qwq/, 30, 'qwen'], [/kimi|moonshot/, 30, 'kimi'], [/gemini/, 30, 'gemini'],
  [/glm|z-ai|zhipu/, 26, 'glm'], [/gpt-oss|openai\//, 26, 'openai'], [/grok|x-ai/, 24, 'grok'], [/gemma/, 24, 'gemma'],
  [/llama-?4/, 22, 'llama'], [/llama/, 16, 'llama'], [/mistral|mixtral|magistral|devstral/, 16, 'mistral'],
  [/nemotron|nvidia/, 14, 'nvidia'], [/hermes|nous/, 12, 'nous'],
];

function familyOf(id) {
  const s = String(id).toLowerCase();
  for (const [re, , fam] of FAMILIES) if (re.test(s)) return fam;
  return s.split('/')[0];
}

/** عدد معاملات النموذج بالمليارات من اسمه (235b، 70b…) متجاهلًا المعاملات الفعّالة (a22b). */
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
    vision: inMods.includes('image'),
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
  else if (m.ctx >= 64000) s += 6;
  if (m.maxOut && m.maxOut < 4000) s -= 30;
  if (m.structured) s += 4;
  return Math.round(s * 10) / 10;
}

function usable(m) {
  return m.free && m.chat && !NOT_CHAT.test(`${m.id} ${m.name}`) && !m.id.startsWith('openrouter/');
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c?.list?.length ? c : null;
  } catch { return null; }
}

/** آخر قائمة محفوظة دون اتصال (قد تكون قديمة). */
export function cachedModels() {
  return readCache()?.list || [];
}

/**
 * النماذج المجانية الصالحة للكتابة، مرتّبة من الأفضل.
 * تُجلب حيّة كل 12 ساعة، وتُستعمل النسخة المحفوظة إن تعذّر الاتصال.
 */
export async function freeModels({ force = false, signal } = {}) {
  const c = readCache();
  if (!force && c && Date.now() - c.at < CACHE_TTL) return c.list;
  try {
    const res = await request('/models', { method: 'GET', auth: false, signal, timeout: 30000 });
    const list = (res.data || []).map(parseModel).filter(usable)
      .map((m) => ({ ...m, score: score(m) }))
      .sort((a, b) => b.score - a.score);
    if (list.length) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch { /* المساحة ممتلئة */ }
    }
    return list;
  } catch (err) {
    if (c) return c.list; // نسخة قديمة أفضل من لا شيء
    throw err;
  }
}

/**
 * سلسلة النماذج لطلب واحد: المختار (أو الأفضل)، ثم بديل من عائلة أخرى، ثم الموجّه المجاني.
 * kind: 'text' | 'vision'
 */
/** نماذج DeepSeek المجانية المعروفة (حين تتعذّر قراءة القائمة الحيّة). */
export const DEEPSEEK_FALLBACK = ['deepseek/deepseek-chat-v3.1:free', 'deepseek/deepseek-chat-v3-0324:free', 'deepseek/deepseek-r1-0528:free'];
export const isDeepSeek = (id) => familyOf(id) === 'deepseek';

export function chainFor(kind, list) {
  // فرع DeepSeek: الكتابة بنماذج DeepSeek فقط (والتحقق من الصور بنموذج يرى الصور لأن DeepSeek لا يراها)
  if (state.ai.provider === 'deepseek' && kind === 'text') {
    const pick = state.ai.deepseek?.model;
    const pool = list.filter((m) => isDeepSeek(m.id) && (!m.ctx || m.ctx >= 16000)).map((m) => m.id);
    const ids = [...(pick && pick !== 'auto' ? [pick] : []), ...pool, ...(pool.length ? [] : DEEPSEEK_FALLBACK)];
    return [...new Set(ids)].slice(0, 3);
  }
  const o = state.ai.openrouter;
  const pick = kind === 'vision' ? o.visionModel : o.model;
  // سياق أقل من 16 ألف رمز لا يتسع لتعليمات التقرير ونصه
  const pool = list.filter((m) => (kind !== 'vision' || m.vision) && (!m.ctx || m.ctx >= 16000));
  const ids = [];
  if (pick && pick !== 'auto') {
    // نموذج مختار يدويًا لا يدعم الصور لا يصلح للتحقق البصري
    const m = list.find((x) => x.id === pick);
    if (kind !== 'vision' || !m || m.vision) ids.push(pick);
  }
  for (const m of pool) {
    if (ids.length >= 2) break;
    if (ids.includes(m.id)) continue;
    if (ids.length === 1 && familyOf(m.id) === familyOf(ids[0]) && pool.some((x) => familyOf(x.id) !== familyOf(ids[0]))) continue;
    ids.push(m.id);
  }
  ids.push(FREE_ROUTER);
  return [...new Set(ids)].slice(0, 3);
}

/** اسم مختصر للعرض. */
export function modelName(id) {
  if (!id || id === 'auto') return 'تلقائي';
  if (id === FREE_ROUTER) return 'الموجّه المجاني';
  const m = cachedModels().find((x) => x.id === id);
  return m?.name || String(id).split('/').pop().replace(/:free$/, '');
}

/* ── ربط الحساب (OAuth PKCE): مفتاح يُنشأ تلقائيًا بعد تسجيل الدخول ── */

/** يبادل رمز العودة من صفحة تسجيل الدخول بمفتاح الحساب. */
export async function exchangeCode(code, verifier) {
  const res = await request('/auth/keys', { method: 'POST', auth: false, body: { code, code_verifier: verifier, code_challenge_method: 'S256' }, timeout: 30000 });
  if (!res?.key) throw new ORError(400, 'لم يُرجع OpenRouter مفتاحًا');
  return res.key;
}

/* ── الاتصال ─────────────────────────────────────── */

function headers(auth, json) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (auth) h.Authorization = `Bearer ${cleanKey(state.ai.openrouter.apiKey)}`;
  return h;
}

/** إشارة إلغاء تجمع إلغاء المستخدم ومهلة قابلة للتمديد. */
function linkSignal(outer, ms) {
  const ctrl = new AbortController();
  let timedOut = false;
  let timer = null;
  const arm = (t) => { clearTimeout(timer); if (t) timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, t); };
  const onAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  arm(ms);
  return {
    signal: ctrl.signal,
    bump: arm,
    timedOut: () => timedOut,
    done: () => { clearTimeout(timer); outer?.removeEventListener('abort', onAbort); },
  };
}

async function errorFromResponse(res) {
  let body = null;
  try { body = await res.json(); } catch { /* ليس JSON */ }
  return errorFromBody(res.status, body, res.headers.get('retry-after'));
}

function errorFromBody(status, body, retryAfter) {
  const e = body?.error || {};
  const raw = e.metadata?.raw;
  const msg = [e.message, typeof raw === 'string' ? raw : ''].filter(Boolean).join(' — ') || (typeof body === 'string' ? body : '');
  return new ORError(Number(e.code) || status, msg, { metadata: e.metadata, retryAfter: retryAfter ? Number(retryAfter) : null });
}

/** طلب عبر طبقة HTTP الأصلية في أندرويد (بلا بث) — يُستعمل إن منع المتصفح الطلب. */
async function nativeRequest(path, { method, body, auth, timeout }) {
  const r = await CapacitorHttp.request({
    url: OR_BASE + path,
    method,
    headers: headers(auth, !!body),
    data: body,
    responseType: 'json',
    connectTimeout: 20000,
    readTimeout: timeout || 300000,
  });
  let data = r.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* نص */ } }
  if (r.status >= 400) throw errorFromBody(r.status, data, r.headers?.['Retry-After'] || r.headers?.['retry-after']);
  return data;
}

let preferNative = false;

/**
 * طلب واحد. stream=true يعيد كائن Response للبث، أو { native: data } إن اضطررنا للطبقة الأصلية.
 */
async function request(path, { method = 'POST', body = null, auth = true, signal, stream = false, timeout = 120000 } = {}) {
  if (preferNative && isNative) {
    const data = await nativeRequest(path, { method, body: body && stream ? { ...body, stream: false } : body, auth, timeout: stream ? 600000 : timeout });
    return stream ? { native: data } : data;
  }
  // البث: مهلة للاتصال الأول فقط، ثم يمددها كل جزء يصل (انظر sse)
  const link = linkSignal(signal, stream ? 90000 : timeout);
  let res;
  try {
    res = await fetch(OR_BASE + path, { method, headers: headers(auth, !!body), body: body ? JSON.stringify(body) : undefined, signal: link.signal });
  } catch (err) {
    link.done();
    if (signal?.aborted) throw err;
    if (link.timedOut()) throw new ORError(408, 'timeout', { kind: 'timeout' });
    // في أندرويد قد يمنع WebView الطلب (CORS أو شبكة)؛ نجرّب الطبقة الأصلية مرة
    if (isNative && navigator.onLine !== false) {
      try {
        const data = await nativeRequest(path, { method, body: body && stream ? { ...body, stream: false } : body, auth, timeout: stream ? 600000 : timeout });
        preferNative = true;
        return stream ? { native: data } : data;
      } catch (nerr) {
        if (nerr instanceof ORError) throw nerr;
      }
    }
    throw new ORError(0, String(err?.message || err), { kind: 'network' });
  }
  if (!stream) link.done();
  if (!res.ok) { link.done(); throw await errorFromResponse(res); }
  if (stream) return Object.assign(res, { _link: link });
  try { return await res.json(); } catch { throw new ORError(502, 'invalid json', { kind: 'empty' }); }
}

/* ── البث (SSE) ───────────────────────────────────── */

/** يقرأ أحداث SSE: { data } أو { comment } أو { done }. */
async function* sse(res, link) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let data = [];
  try {
    for (;;) {
      link.bump(120000); // لا بيانات ولا تعليقات لدقيقتين = الاتصال متوقف
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line === '') {
          if (data.length) { const d = data.join('\n'); data = []; if (d.trim() === '[DONE]') { yield { done: true }; return; } yield { data: d }; }
        } else if (line.startsWith(':')) {
          yield { comment: line.slice(1).trim() };
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
    if (data.length) { const d = data.join('\n'); if (d.trim() !== '[DONE]') yield { data: d }; }
  } finally {
    link.done();
    try { reader.releaseLock(); } catch { /* مغلق */ }
  }
}

/**
 * يحذف أفكار النموذج المكتوبة داخل النص (<think>…</think>) — بعض النماذج المجانية تكتبها هكذا.
 * إن بقي وسم مفتوح فالنموذج ما زال يفكّر ولا يُعرض شيء بعده.
 */
export function stripThink(text) {
  let t = String(text || '');
  // بعض المزوّدين يحذفون وسم الفتح ويُبقون وسم الإغلاق بعد التفكير
  const close = t.search(/<\/think>/i);
  if (close >= 0 && !/<think>/i.test(t.slice(0, close))) t = t.slice(close + '</think>'.length);
  t = t.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  const open = t.search(/<think>/i);
  if (open >= 0) t = t.slice(0, open);
  return t.replace(/^\s+/, '');
}

function outBudget(ids, list, want) {
  const caps = ids.map((id) => list.find((m) => m.id === id)?.maxOut).filter((n) => n > 0);
  const cap = caps.length ? Math.min(...caps) : 16000;
  return Math.max(1024, Math.min(want, cap, 16000));
}

function reasoningFor(primary, effort) {
  if (!primary?.reasoning) return undefined;
  return { effort: effort === 'low' ? 'low' : 'medium' };
}

async function modelsOrEmpty(signal) {
  try { return await freeModels({ signal }); } catch { return cachedModels(); }
}

/**
 * كتابة متدفقة. onText(snapshot) أثناء الكتابة، وonPhase('thinking'|'writing').
 */
export async function streamText({ system, prompt, effort = 'high', maxTokens = 16000, signal, onText, onPhase }) {
  const list = await modelsOrEmpty(signal);
  const models = chainFor('text', list);
  const primary = list.find((m) => m.id === models[0]);
  const body = {
    model: models[0],
    models,
    stream: true,
    temperature: 0.3,
    max_tokens: outBudget(models, list, Math.min(maxTokens, 16000)),
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
  };
  const reasoning = reasoningFor(primary, effort);
  if (reasoning) body.reasoning = reasoning;

  onPhase?.('thinking');
  const res = await request('/chat/completions', { body, signal, stream: true });

  // الطبقة الأصلية: الرد كاملًا دفعة واحدة
  if (res.native) {
    const ch = res.native.choices?.[0];
    if (res.native.error || ch?.finish_reason === 'error') throw errorFromBody(502, res.native);
    const text = stripThink(ch?.message?.content || '').trim();
    if (!text) throw new ORError(502, 'empty', { kind: 'empty' });
    onPhase?.('writing');
    onText?.(text);
    addUsage(res.native.usage || null, res.native.model || models[0]);
    return { text, stopReason: ch?.finish_reason === 'length' ? 'max_tokens' : ch?.finish_reason, usage: { output_tokens: res.native.usage?.completion_tokens || 0 }, model: `or:${res.native.model || models[0]}`, cost: 0 };
  }

  let acc = '';
  let shown = 0;
  let served = null;
  let finish = null;
  let usage = null;
  let writing = false;
  try {
    for await (const ev of sse(res, res._link)) {
    if (ev.done) break;
    if (ev.comment !== undefined) { if (!writing) onPhase?.('thinking'); continue; }
    let j;
    try { j = JSON.parse(ev.data); } catch { continue; }
    if (j.error) throw errorFromBody(Number(j.error.code) || 502, j);
    served = j.model || served;
    if (j.usage) usage = j.usage;
    const ch = j.choices?.[0];
    if (!ch) continue;
    if (ch.finish_reason === 'error') throw errorFromBody(502, j);
    if (ch.finish_reason) finish = ch.finish_reason;
    const d = ch.delta || {};
    if ((d.reasoning || d.reasoning_details?.length) && !writing) onPhase?.('thinking');
    if (d.content) {
      acc += d.content;
      const vis = stripThink(acc);
      if (vis.length > shown) {
        shown = vis.length;
        if (!writing) { writing = true; onPhase?.('writing'); }
        onText?.(vis);
      }
    }
    }
  } catch (err) {
    // توقف البث بلا بيانات لمدة طويلة: مهلة لا إلغاء من المستخدم
    if (err?.name === 'AbortError' && !signal?.aborted && res._link.timedOut()) throw new ORError(408, 'stream stalled', { kind: 'timeout' });
    throw err;
  }
  const text = stripThink(acc).trim();
  if (!text) throw new ORError(502, 'empty', { kind: 'empty' });
  addUsage(usage, served || models[0]);
  return {
    text,
    stopReason: finish === 'length' ? 'max_tokens' : finish,
    usage: { output_tokens: usage?.completion_tokens || 0 },
    model: `or:${served || models[0]}`,
    cost: 0,
  };
}

/* ── JSON ─────────────────────────────────────────── */

/** يحوّل محتوى بصيغة Claude (نص + صور base64) إلى صيغة OpenAI. */
function toParts(content) {
  if (typeof content === 'string') return content;
  return content.map((b) => (b.type === 'image'
    ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
    : { type: 'text', text: b.text }));
}

/** يستخرج أول كائن JSON من نص قد يحوي شرحًا أو علامات ``` أو فواصل زائدة. */
export function parseJSONLoose(text) {
  const t = stripThink(text).replace(/^﻿/, '').trim();
  try { return JSON.parse(t); } catch { /* نكمل */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : t;
  const start = src.search(/[{[]/);
  if (start < 0) throw new Error('no json');
  // نطابق الأقواس مع تجاهل ما داخل النصوص
  let depth = 0; let inStr = false; let esc = false; let end = -1;
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

/** يطابق القيمة مع المخطط بتسامح: يحوّل الأنواع القريبة ويحذف العناصر الناقصة من المصفوفات. */
export function coerce(v, s) {
  if (!s) return v;
  if (s.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
    const out = {};
    for (const [k, ps] of Object.entries(s.properties || {})) if (v[k] !== undefined && v[k] !== null) out[k] = coerce(v[k], ps);
    for (const k of s.required || []) if (!(k in out)) throw new Error(`missing ${k}`);
    return out;
  }
  if (s.type === 'array') {
    const arr = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
    return arr.map((x) => { try { return coerce(x, s.items); } catch { return undefined; } }).filter((x) => x !== undefined);
  }
  if (s.type === 'integer' || s.type === 'number') {
    const n = Number(typeof v === 'string' ? v.trim() : v);
    if (!Number.isFinite(n)) throw new Error('not number');
    return s.type === 'integer' ? Math.round(n) : n;
  }
  if (s.type === 'boolean') return v === true || v === 'true' || v === 1;
  if (s.type === 'string') return typeof v === 'string' ? v : Array.isArray(v) ? v.join('، ') : String(v);
  return v;
}

function schemaHint(schema) {
  return `أعد JSON صالحًا فقط بلا أي شرح ولا علامات \`\`\`، مطابقًا لهذا المخطط (JSON Schema):\n${JSON.stringify(schema)}`;
}

/** طلب JSON غير متدفق (اقتراح العناوين، تخطيط الصور، التحقق البصري، اختبار الاتصال). */
export async function jsonCall({ system, prompt, content, schema, effort = 'low', maxTokens = 4000, signal }) {
  const list = await modelsOrEmpty(signal);
  const parts = toParts(content || prompt);
  const hasImages = Array.isArray(parts) && parts.some((p) => p.type === 'image_url');
  const models = chainFor(hasImages ? 'vision' : 'text', list);
  const primary = list.find((m) => m.id === models[0]);
  const body = {
    model: models[0],
    models,
    temperature: 0,
    max_tokens: outBudget(models, list, maxTokens),
    messages: [
      { role: 'system', content: `${system}\n\n${schemaHint(schema)}` },
      { role: 'user', content: parts },
    ],
  };
  if (primary?.structured) body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } };
  else if (primary?.json) body.response_format = { type: 'json_object' };
  const reasoning = reasoningFor(primary, effort);
  if (reasoning) body.reasoning = { effort: 'low' };

  const call = async (b) => {
    const data = await request('/chat/completions', { body: b, signal, timeout: hasImages ? 180000 : 120000 });
    if (data?.error) throw errorFromBody(502, data);
    addUsage(data.usage || null, data.model || models[0]);
    return data.choices?.[0]?.message?.content || '';
  };

  let text = await call(body);
  try {
    return coerce(parseJSONLoose(text), schema);
  } catch {
    // محاولة إصلاح واحدة: نعيد له ردّه ونطلب JSON صالحًا فقط
    const retry = {
      ...body,
      messages: [...body.messages, { role: 'assistant', content: String(text || '').slice(0, 6000) }, { role: 'user', content: `ردّك ليس JSON صالحًا مطابقًا للمخطط. ${schemaHint(schema)}` }],
    };
    text = await call(retry);
    try { return coerce(parseJSONLoose(text), schema); } catch { throw new ORError(502, 'bad json', { kind: 'json' }); }
  }
}

/* ── اختبار الاتصال ───────────────────────────────── */

/** يتحقق من المفتاح ثم يجرّب طلبًا صغيرًا فعليًا (يكشف قيود الخصوصية والحصة). */
export async function testConnection(signal) {
  const key = await request('/key', { method: 'GET', signal, timeout: 30000 });
  const info = key?.data || {};
  const list = await modelsOrEmpty(signal);
  await jsonCall({
    system: 'You verify connectivity.',
    prompt: 'Return {"ok": true}',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
    maxTokens: 300,
    signal,
  });
  const chain = chainFor('text', list);
  const tier = info.is_free_tier === false
    ? 'حدّك 50 طلبًا مجانيًا في اليوم، أو 1000 إن اشتريت رصيدًا بقيمة 10 دولارات أو أكثر'
    : 'حساب مجاني: 50 طلبًا في اليوم و20 في الدقيقة';
  // اسم النموذج اللاتيني في آخر الجملة وبلا أقواس بعده حتى لا ينقلب ترتيب العرض
  if (state.ai.provider === 'deepseek') {
    const ds = list.filter((m) => isDeepSeek(m.id)).length;
    return { ok: true, msg: `تم الاتصال بـ DeepSeek — ${tier}. نماذج DeepSeek المجانية المتاحة: ${ds || 'من القائمة الاحتياطية'}، والكتابة بـ ${modelName(chain[0])}` };
  }
  return { ok: true, msg: `تم الاتصال — ${tier}. المتاح الآن ${list.length} نموذجًا مجانيًا، والكتابة بـ ${modelName(chain[0])}` };
}

/* ── رسائل الأخطاء ───────────────────────────────── */

export function errorMessage(err) {
  const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 180);
  if (err?.name === 'AbortError') return 'أُلغي الطلب.';
  if (!(err instanceof ORError)) return 'حدث خطأ غير متوقع: ' + short(err?.message);
  const msg = err.message || '';
  if (err.kind === 'network') return 'تعذّر الاتصال بـ OpenRouter. تحقق من الإنترنت ثم أعد المحاولة.';
  if (err.kind === 'timeout' || err.status === 408) return 'تأخر النموذج المجاني في الرد. أعد المحاولة، أو اختر نموذجًا آخر من الإعدادات.';
  if (err.kind === 'empty') return 'وصل ردّ فارغ من النموذج المجاني. أعد المحاولة، أو اختر نموذجًا آخر من الإعدادات.';
  if (err.kind === 'json') return 'لم يُعِد النموذج المجاني ردًّا منظّمًا صالحًا. أعد المحاولة أو اختر نموذجًا آخر.';
  switch (err.status) {
    case 401:
      return 'مفتاح OpenRouter غير صحيح أو محذوف. أنشئ مفتاحًا من openrouter.ai/keys (يبدأ بـ sk-or-) والصقه كاملًا.';
    case 402:
      return 'رصيد حساب OpenRouter سالب، والنماذج المجانية تتوقف حتى يُسدَّد. راجع openrouter.ai/settings/credits.';
    case 403:
      return 'رفض فلتر المحتوى لدى مزوّد النموذج الطلب. عدّل صياغة العنوان أو التفاصيل وأعد المحاولة.';
    case 404:
      if (/data policy|privacy|publication|training/i.test(msg)) {
        return 'النماذج المجانية مقفلة في إعدادات الخصوصية لحسابك. افتح openrouter.ai/settings/privacy وفعّل السماح بالنماذج المجانية (Free model publication / free endpoints)، ثم أعد المحاولة.';
      }
      return 'النموذج المجاني المختار لم يعد متاحًا. حدّث قائمة النماذج من الإعدادات أو اختر «تلقائي».';
    case 429:
      if (/per-day|per day|daily/i.test(msg)) return 'انتهت حصتك المجانية لهذا اليوم: 50 طلبًا لمن لم يشترِ رصيدًا، و1000 لمن اشترى 10 دولارات مرة واحدة. تتجدد يوميًا، ويبقى المحتوى الجاهز دون اتصال متاحًا.';
      if (/upstream|provider|temporarily/i.test(msg)) return 'مزوّد النموذج المجاني مزدحم الآن. انتظر قليلًا ثم أعد المحاولة، أو اختر نموذجًا آخر.';
      return `تجاوزت حدّ 20 طلبًا في الدقيقة للنماذج المجانية. انتظر ${err.retryAfter ? `${Math.ceil(err.retryAfter)} ثانية` : 'دقيقة'} ثم أعد المحاولة.`;
    case 400:
      if (/context|too long|maximum|token/i.test(msg)) return 'النص أطول مما يقبله النموذج المجاني. اختر طولًا أقصر أو نموذجًا آخر.';
      return 'رفض OpenRouter الطلب: ' + short(msg);
    case 500: case 502: case 503: case 504:
      return 'النماذج المجانية مشغولة أو متوقفة الآن. أعد المحاولة بعد قليل أو اختر نموذجًا آخر.';
    default:
      return `خطأ من OpenRouter (${err.status || '?'}): ${short(msg)}`;
  }
}
