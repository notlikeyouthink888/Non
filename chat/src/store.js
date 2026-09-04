/**
 * التخزين المحلي: المحادثات + الإعدادات.
 * كل شيء يُحفظ على الجهاز فقط (localStorage) — لا يُرسل أي شيء لأي خادم عدا نقطة النهاية التي تختارها.
 */
const K_CONVOS = 'mh.convos.v1';
const K_SETTINGS = 'mh.settings.v1';
const K_ACTIVE = 'mh.active.v1';

/** نقاط نهاية جاهزة — كلها متوافقة مع واجهة OpenAI */
export const PRESETS = [
  {
    id: 'ollama',
    name: 'Ollama (على جهازك)',
    baseUrl: 'http://192.168.1.100:11434/v1',
    model: 'llama3.1:8b',
    needsKey: false,
    hint: 'شغّل Ollama على الكمبيوتر، وبدّل الآيبي لآيبي جهازك في الشبكة. لا حدود ولا رقابة ولا إنترنت.',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (على جهازك)',
    baseUrl: 'http://192.168.1.100:1234/v1',
    model: 'local-model',
    needsKey: false,
    hint: 'شغّل خادم LM Studio وفعّل "Serve on Local Network".',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'aion-labs/aion-2.0',
    needsKey: true,
    hint: 'مئات النماذج بمفتاح واحد. اضغط ⌕ لتصفّحها — المُعلَّمة «مجاني» بلا تكلفة.',
  },
  {
    id: 'groq',
    name: 'Groq (سريع جداً)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    needsKey: true,
    hint: 'سجّل مجاناً في console.groq.com — طبقة مجانية سخية وسرعة عالية.',
  },
  {
    id: 'custom',
    name: 'مخصّص',
    baseUrl: '',
    model: '',
    needsKey: false,
    hint: 'أي خادم متوافق مع OpenAI: llama.cpp، vLLM، text-generation-webui، أو خادمك الخاص.',
  },
];

export const DEFAULT_SETTINGS = {
  preset: 'ollama',
  baseUrl: 'http://192.168.1.100:11434/v1',
  apiKey: '',
  model: 'llama3.1:8b',
  systemPrompt: 'أنت مساعد ذكي. أجب بالعربية بوضوح ومباشرة.',
  temperature: 0.8,
  maxTokens: 2048,
  topP: 0.95,
  stream: true,
  keepContext: 20,
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const write = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

export const store = {
  getSettings() { return { ...DEFAULT_SETTINGS, ...read(K_SETTINGS, {}) }; },
  saveSettings(s) { write(K_SETTINGS, s); },

  getConvos() { return read(K_CONVOS, []); },
  saveConvos(list) { write(K_CONVOS, list); },

  getActiveId() { return read(K_ACTIVE, null); },
  setActiveId(id) { write(K_ACTIVE, id); },

  newConvo(title = 'محادثة جديدة') {
    const c = { id: 'c' + Date.now().toString(36), title, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    const list = this.getConvos();
    list.unshift(c);
    this.saveConvos(list);
    this.setActiveId(c.id);
    return c;
  },

  getConvo(id) { return this.getConvos().find((c) => c.id === id) || null; },

  updateConvo(id, patch) {
    const list = this.getConvos();
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, updatedAt: Date.now() };
    // المحادثة المُحدَّثة تصعد للأعلى
    const [c] = list.splice(i, 1);
    list.unshift(c);
    this.saveConvos(list);
    return c;
  },

  deleteConvo(id) {
    const list = this.getConvos().filter((c) => c.id !== id);
    this.saveConvos(list);
    if (this.getActiveId() === id) this.setActiveId(list[0]?.id || null);
  },

  exportAll() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: this.getSettings(), convos: this.getConvos() }, null, 2);
  },

  importAll(json) {
    const data = JSON.parse(json);
    if (data.convos) this.saveConvos(data.convos);
    if (data.settings) this.saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    return true;
  },
};
