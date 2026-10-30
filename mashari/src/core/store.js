/**
 * تخزين محلي دائم — كل الدراسة تبقى داخل جهازك، بلا حساب ولا إنترنت.
 * يحفظ في localStorage بكتابة مؤجّلة، ويدمج المفاتيح الجديدة عند كل تحديث.
 */

const KEY = 'mashari.state.v1';
let saveTimer = null;
let onSaveError = null;

/** شكل الدراسة الواحدة (مشروع أو قطاع أو السوق العام). */
export function blankStudy() {
  return {
    verdict: null,       // win | maybe | lose | null
    chance: null,        // 0..100 تقديرك لنسبة النجاح
    pros: [],            // [{ id, t }]
    cons: [],            // [{ id, t }]
    notes: '',
    star: false,
    map: null,           // { nodes: [{ id, t, x, y, c, p }], links: [[a, b]] }
    calc: null,          // { setup: [], monthly: [], daily, margin, days }
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const defaults = {
  meta: { createdAt: Date.now(), version: 1 },
  studies: {},           // projectId -> دراسة
  sectors: {},           // catId -> دراسة القطاع
  market: { title: 'السوق العراقي', study: null },
  custom: [],            // مشاريع أضافها المستخدم { id, icon, name, cat, type, cap, desc, createdAt }
  edits: {},             // تعديلات على مشاريع القاعدة: id -> { name, desc, icon, cat, type, cap }
  hidden: [],            // مشاريع من القاعدة أخفاها المستخدم
  customCats: [],        // أقسام جديدة { id, icon, name }
  ai: {
    model: 'auto',       // النموذج المختار من OpenRouter (المفتاح ينحفظ لحاله، مو هنا)
    analyses: {},        // projectId -> { at, model, cur, data } تحليل كامل
    quick: {},           // projectId -> { at, chance, reason } تقييم سريع
  },
  ui: {
    tab: 'projects',
    filter: { q: '', verdict: 'all', cat: 'all', type: 'all', cap: 0, sort: 'default' },
  },
  settings: {
    theme: 'dark',       // dark | light | auto
    currency: 'IQD',     // IQD | USD
    haptics: true,
  },
};

function deepMerge(base, patch) {
  if (Array.isArray(base) || base === null || typeof base !== 'object') {
    return patch === undefined ? base : patch;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    return deepMerge(structuredClone(defaults), JSON.parse(raw));
  } catch (err) {
    console.warn('[store] تعذّرت القراءة، نبدأ من جديد', err);
    return structuredClone(defaults);
  }
}

export const state = load();

/** يحفظ الحالة (مؤجَّل 300ms لتجميع التعديلات المتتابعة). */
export function save(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) {
      console.warn('[store] تعذّر الحفظ', err);
      onSaveError?.(err);
    }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 300);
}

export function setSaveErrorHandler(fn) { onSaveError = fn; }

/** معرّف قصير فريد. */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** نسخة احتياطية كاملة كنص JSON. */
export function exportAll() {
  return JSON.stringify({ app: 'mashari', version: 1, exportedAt: new Date().toISOString(), state });
}

/** يستورد نسخة احتياطية ويستبدل البيانات الحالية. يرمي خطأ إن لم يكن الملف نسخة صالحة. */
export function importAll(text) {
  const parsed = JSON.parse(text);
  const data = parsed?.app === 'mashari' ? parsed.state : parsed;
  if (!data || typeof data !== 'object' || !('studies' in data)) throw new Error('ليست نسخة من هذا التطبيق');
  const merged = deepMerge(structuredClone(defaults), data);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, merged);
  save(true);
}

/** يمسح كل الدراسة ويرجع التطبيق لحالته الأولى. */
export function resetAll() {
  const keepSettings = state.settings;
  const keepModel = state.ai?.model;
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, structuredClone(defaults), { settings: keepSettings });
  if (keepModel) state.ai.model = keepModel;
  save(true);
}
