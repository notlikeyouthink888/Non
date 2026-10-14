/**
 * الإعدادات والحالة الخفيفة — تُحفظ في localStorage داخل الجهاز.
 * التقارير والصور الكبيرة تُحفظ في IndexedDB (core/db.js).
 */

const KEY = 'asas.state.v1';
const listeners = new Set();
let saveTimer = null;

/** مزوّدو الذكاء الاصطناعي: OpenRouter بنماذجه المجانية، أو Claude المدفوع الأدق. */
export const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', badge: 'مجاني', note: 'نماذج مجانية بحد 50 طلبًا في اليوم — جيدة للتقارير، وأقل دقة من Claude في الحسابات' },
  { id: 'deepseek', name: 'DeepSeek', badge: 'ربط بالحساب', note: 'نماذج DeepSeek المجانية بربط حسابك بضغطة (Google أو بريد) — بلا نسخ مفاتيح' },
  { id: 'claude', name: 'Claude', badge: 'الأدق', note: 'مدفوع بالاستهلاك — أعلى دقة في العربية والحسابات والتحقق من الصور' },
];

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
    provider: 'openrouter',    // openrouter | deepseek | claude
    mode: 'key',               // Claude: key | proxy
    apiKey: '',                // مفتاح Claude
    proxyUrl: '',
    proxyToken: '',
    model: 'claude-opus-5-5',
    effort: 'high',
    openrouter: {
      apiKey: '',              // sk-or-v1-…
      model: 'auto',           // auto = أفضل نموذج مجاني متاح الآن، أو معرّف نموذج محدد
      visionModel: 'auto',
    },
    deepseek: {
      model: 'auto',           // نموذج DeepSeek المجاني (عبر حساب OpenRouter المربوط)
      linked: false,           // رُبط الحساب بتسجيل الدخول لا بمفتاح ملصوق
    },
    verifyImages: true,        // تحقّق الذكاء الاصطناعي من مطابقة الصور للموضوع
    usage: { input: 0, output: 0, cost: 0, calls: 0, reports: 0 },
  },
  images: {
    enabled: true,
    sources: { commons: true, wikipedia: true, openverse: true },
  },
  cover: {
    uni: 'baghdad',            // معرّف الجامعة في data/universities.js أو 'other'
    university: 'جامعة بغداد',
    college: 'كلية الهندسة',
    department: 'قسم الهندسة المدنية',
    stage: 'الثانية',
    author: '',
    group: '',                 // الشعبة أو المجموعة
    supervisor: '',
    ministry: true,            // ترويسة «جمهورية العراق — وزارة التعليم العالي والبحث العلمي»
    enabled: true,             // صفحة غلاف للتقارير الجديدة (تُغيَّر لكل تقرير)
    style: 'classic',          // نمط الغلاف الافتراضي (report/covers.js)
    logo: '',                  // شعار الجامعة (صورة مصغّرة data URL) — اختياري
    logoAR: 1,                 // نسبة ارتفاع الشعار إلى عرضه
  },
  prefs: { length: 'medium', level: 'natural', lang: 'mix', structure: 'fixed', human: true, lists: 'mix', tables: true },
  exportOpts: { wordFont: 'Simplified Arabic', toc: true, cover: true, attribution: true, wordMath: 'image' },
  format: {},                  // قيم التنسيق الافتراضية للتقارير (report/format.js)
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
    const saved = JSON.parse(raw);
    const st = deepMerge(structuredClone(defaults), saved);
    // من حفظ مفتاح Claude قبل إضافة OpenRouter يبقى على Claude
    if (!saved.ai?.provider) {
      const hadClaude = cleanKey(saved.ai?.apiKey).length > 20 || /^https?:\/\//.test(String(saved.ai?.proxyUrl || '').trim());
      st.ai.provider = hadClaude ? 'claude' : 'openrouter';
    }
    return st;
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

/**
 * ينظّف مفتاحًا ملصوقًا: يزيل المسافات والأسطر وعلامات الاتجاه والمحارف الخفية
 * التي تلتصق به عند النسخ من المتصفح أو من تطبيقات المراسلة.
 */
export function cleanKey(k) {
  return String(k ?? '').replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '');
}

/** هل الذكاء الاصطناعي مهيّأ للعمل؟ */
export function aiReady() {
  const a = state.ai;
  if (a.provider === 'openrouter' || a.provider === 'deepseek') return cleanKey(a.openrouter.apiKey).length > 20;
  if (a.mode === 'proxy') return /^https?:\/\//.test(a.proxyUrl.trim());
  return cleanKey(a.apiKey).length > 20;
}

/**
 * يسجّل استهلاك الرموز وكلفتها التقريبية بالدولار.
 * يقبل صيغة Claude (input_tokens) وصيغة OpenRouter (prompt_tokens)؛ نماذج OpenRouter المجانية بلا كلفة.
 */
export function addUsage(usage, modelId) {
  if (!usage) {
    if (modelId) update((s) => { s.ai.usage.calls += 1; }, 'usage');
    return 0;
  }
  const free = 'prompt_tokens' in usage || 'completion_tokens' in usage;
  const m = modelInfo(modelId);
  const input = free ? (usage.prompt_tokens || 0) : (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.05;
  const output = free ? (usage.completion_tokens || 0) : usage.output_tokens || 0;
  const cost = free ? 0 : (input * m.inPrice + output * m.outPrice) / 1e6;
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
