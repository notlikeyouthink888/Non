/**
 * الإعدادات والحالة الخفيفة — تُحفظ في localStorage داخل الجهاز.
 * التقارير والصور الكبيرة تُحفظ في IndexedDB (core/db.js).
 */

const KEY = 'asas.state.v1';
const listeners = new Set();
let saveTimer = null;

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'أعلى جودة ودقة — الافتراضي', inPrice: 4, outPrice: 20, fallbacks: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'جودة عالية بنصف الكلفة تقريبًا', inPrice: 2, outPrice: 10, fallbacks: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'الأسرع والأرخص بكثير', inPrice: 0.1, outPrice: 0.5, fallbacks: false },
];

export const EFFORTS = [
  { value: 'low', label: 'سريع', hint: 'تفكير قليل وزمن أقصر' },
  { value: 'medium', label: 'متوازن', hint: 'توازن بين الدقة والسرعة' },
  { value: 'high', label: 'عميق', hint: 'أدق للتقارير الفنية — الافتراضي' },
];

export const defaults = {
  meta: { createdAt: Date.now(), version: 1, onboarded: false },
  ai: {
    mode: 'key',               // key | proxy
    apiKey: '',
    proxyUrl: '',
    proxyToken: '',
    model: 'claude-opus-5-5',
    effort: 'high',
    verifyImages: true,        // تحقّق الذكاء الاصطناعي من مطابقة الصور للموضوع
    usage: { input: 0, output: 0, cost: 0, calls: 0, reports: 0 },
  },
  images: {
    enabled: true,
    sources: { commons: true, wikipedia: true, openverse: true },
  },
  cover: {
    author: '',
    university: '',
    college: 'كلية الهندسة',
    department: 'قسم الهندسة المدنية',
    stage: '',
    supervisor: '',
  },
  prefs: { length: 'medium', level: 'student' },
  exportOpts: { wordFont: 'Simplified Arabic', toc: true, cover: true, attribution: true },
  ui: { theme: 'dark', fontSize: 'm' },
  recent: [],                  // آخر عمليات البحث
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
    console.warn('[store] تعذّرت القراءة، سنبدأ من الحالة الابتدائية', err);
    return structuredClone(defaults);
  }
}

export const state = load();

export function save(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { console.warn('[store] تعذّر الحفظ', err); }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 200);
}

/** يعدّل الحالة ثم يحفظ ويبثّ. */
export function update(fn, topic = '*') {
  fn(state);
  save();
  emit(topic);
}

export function subscribe(topic, fn) {
  const entry = { topic, fn };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

export function emit(topic = '*') {
  listeners.forEach((l) => {
    if (l.topic === '*' || l.topic === topic || topic === '*') {
      try { l.fn(topic); } catch (err) { console.warn('[store] مستمع فشل', err); }
    }
  });
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function modelInfo(id = state.ai.model) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

/** هل الذكاء الاصطناعي مهيّأ للعمل؟ */
export function aiReady() {
  const a = state.ai;
  if (a.mode === 'proxy') return /^https?:\/\//.test(a.proxyUrl.trim());
  return a.apiKey.trim().length > 20;
}

/** يسجّل استهلاك الرموز وكلفتها التقريبية بالدولار. */
export function addUsage(usage, modelId) {
  if (!usage) return 0;
  const m = modelInfo(modelId);
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.05;
  const output = usage.output_tokens || 0;
  const cost = (input * m.inPrice + output * m.outPrice) / 1e6;
  update((s) => {
    s.ai.usage.input += Math.round(input);
    s.ai.usage.output += output;
    s.ai.usage.cost += cost;
    s.ai.usage.calls += 1;
  }, 'usage');
  return cost;
}

export function pushRecent(q) {
  const v = q.trim();
  if (v.length < 2) return;
  update((s) => {
    s.recent = [v, ...s.recent.filter((x) => x !== v)].slice(0, 8);
  }, 'recent');
}

export function resetSettings() {
  const keep = { meta: state.meta };
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, structuredClone(defaults), keep);
  save(true);
  emit('*');
}
