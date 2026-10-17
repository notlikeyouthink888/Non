/**
 * الاتصال بخادم مدير التطبيق (server/worker.js):
 *  - «خادم التطبيق» مزوّد ذكاء اصطناعي بلا مفتاح: الطلبات تمر عبر الخادم، وهو يختار النموذج والمفتاح.
 *  - كل جهاز يُعرَّف بمعرّف عشوائي واسم الطالب من بيانات الغلاف، ليرى المدير من استعمل التطبيق.
 *  - حين يكون التطبيق مربوطًا بالخادم تُرسل نسخة من كل تقرير (العنوان والنص) إلى المدير،
 *    ويُخبَر المستخدم بذلك بوضوح في الإعدادات وصفحة الإنشاء.
 *  - لوحة المدير تستدعي مسارات /admin بكلمة سره.
 * رابط الخادم يُضبط عند البناء (VITE_ASAS_SERVER) أو يُدخله المستخدم يدويًا.
 */

import { Capacitor } from '@capacitor/core';
import { state, save, update, uid } from './store.js';

const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
export const serverUrl = () => trimUrl(state.server?.url);
/** هل يكتب التطبيق الآن عبر خادم المدير؟ */
export const onServer = () => state.ai.provider === 'server' && !!serverUrl();
/** هل التطبيق مربوط بخادم مدير (فتصل نسخ التقارير إليه)؟ */
export const linked = () => !!serverUrl();
export const serverProvider = () => state.server?.config?.provider || 'openrouter';

export function deviceId() {
  if (!/^[\w-]{8,64}$/.test(state.server.device || '')) {
    state.server.device = `${uid('d_')}${Math.random().toString(36).slice(2, 10)}`;
    save();
  }
  return state.server.device;
}

/** اسم المستخدم كما يظهر للمدير: اسم الطالب في بيانات الغلاف. */
export const userName = () => String(state.cover?.author || '').trim().slice(0, 60);

/** رؤوس كل طلب إلى الخادم. meta: { kind, report, title, type, subject } لسجل المدير. */
export function serverHeaders(meta = {}) {
  const h = { 'x-asas-device': deviceId(), 'x-asas-name': encodeURIComponent(userName()), 'x-asas-platform': Capacitor.getPlatform() };
  if (state.server.token) h['x-app-token'] = state.server.token;
  for (const [k, v] of Object.entries(meta || {})) if (v) h[`x-asas-${k}`] = encodeURIComponent(String(v).slice(0, 200));
  return h;
}

async function call(path, { method = 'GET', body, signal, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(`${serverUrl()}${path}`, {
      method,
      headers: { ...serverHeaders(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(data?.error?.message || data?.error || `HTTP ${res.status}`).replace(/^ASAS:\s*/, ''));
    return data;
  } finally {
    clearTimeout(t);
  }
}

/** يجلب إعدادات الخادم (المزوّد، النماذج، الحد اليومي، رسالة المدير) ويحفظها. */
export async function fetchConfig({ signal } = {}) {
  const cfg = await call('/api/config', { signal });
  update((s) => {
    s.server.config = cfg;
    s.server.at = Date.now();
    if (cfg.lock) s.ai.provider = 'server'; // المدير يلزم الكل بخادمه
  }, 'ai');
  return cfg;
}

/** إعدادات حديثة قبل التوليد (تُعاد قراءتها كل خمس دقائق على الأكثر). */
export async function ensureConfig(signal) {
  if (!linked()) return null;
  if (state.server.config && Date.now() - (state.server.at || 0) < 5 * 60000) return state.server.config;
  try { return await fetchConfig({ signal }); } catch { return state.server.config; }
}

/** نص التقرير كاملًا كما كُتب (للمدير). */
function reportText(r) {
  return (r.sections || []).map((s) => (s.h ? `## ${s.h}\n\n${s.md}` : s.md)).join('\n\n');
}

/** يرسل نسخة من التقرير إلى المدير (لا يوقف شيئًا إن فشل). */
export async function logReport(r, { type = '', status = r.status } = {}) {
  if (!linked()) return;
  const m = r.meta || {};
  try {
    await call('/api/log', {
      method: 'POST',
      timeout: 30000,
      body: {
        id: r.id, title: r.title, type, subject: m.subject || '', lang: r.options?.lang || '', words: r.words || 0, status,
        model: r.model || '', name: String(m.author || userName()).trim(), people: String(m.students || '').split(/\n|،|,/).map((x) => x.trim()).filter(Boolean).join('، '),
        uni: [m.university, m.college].filter(Boolean).join(' — '), text: reportText(r),
      },
    });
  } catch (err) {
    console.warn('[server] تعذّر إرسال التقرير للمدير', err);
  }
}

/* ── لوحة المدير ─────────────────────────────────── */

export const adminUrl = () => trimUrl(state.admin?.url);

export async function adminApi(path, { method = 'GET', body, url = adminUrl(), password = state.admin?.password } = {}) {
  let res;
  try {
    res = await fetch(`${trimUrl(url)}/admin${path}`, {
      method,
      headers: { authorization: `Bearer ${password || ''}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('تعذّر الوصول إلى الخادم. تأكد من الرابط والإنترنت.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data.error?.message || data.error || `HTTP ${res.status}`));
  return data;
}
