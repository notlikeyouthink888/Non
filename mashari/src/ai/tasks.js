/**
 * مهام الذكاء الاصطناعي: تحليل احتمالات مشروع، تقييم سريع لقسم كامل، واقتراح مشاريع جديدة.
 * كل رد يتنظّف ويتحقق منه هنا قبل ما يوصل للواجهة أو ينحفظ.
 */

import { state, save } from '../core/store.js';
import { norm } from '../core/text.js';
import { jsonCall } from './openrouter.js';
import {
  allProjects, allCats, catOf, typeOf, capOf, verdictOf, calcTotals, calcHasData, TYPES, CAPITALS,
} from '../model.js';

const SYSTEM = `أنت مستشار دراسات جدوى للمشاريع الصغيرة والمتوسطة بالسوق العراقي، وتعرف واقع العراق زين:
انقطاع الكهرباء والاعتماد على المولدات، تذبذب سعر صرف الدولار، الإيجارات حسب المنطقة،
البيع عن طريق البيجات (إنستغرام وتيك توك) وشركات التوصيل، المواسم (رمضان، الأعياد، الزيارات، الصيف، بداية الدوام)،
الإجازات الرسمية والبلدية، والفرق بين بغداد والمحافظات وإقليم كوردستان.
كن واقعي وصريح ولا تجامل: إذا المشروع مشبّع أو خطر گولها بوضوح. الأرقام تقديرية ومعقولة للسوق الحالي.
اكتب بعربي بسيط وجُمل قصيرة يفهمها العراقي.`;

const curText = () => (state.settings.currency === 'USD'
  ? 'الدولار الأمريكي'
  : 'الدينار العراقي (أرقام كاملة، مثلًا 15000000 لخمسة عشر مليون)');

const clampInt = (v, lo, hi) => {
  const n = Number(typeof v === 'string' ? v.replace(/[,٬\s%]/g, '') : v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null;
};

const strList = (v, max = 8) => (Array.isArray(v) ? v : [])
  .map((x) => (typeof x === 'string' ? x : x?.text || x?.name || '').trim())
  .filter(Boolean)
  .slice(0, max);

const verdictFor = (chance) => (chance >= 65 ? 'win' : chance >= 40 ? 'maybe' : 'lose');

/* ────────── تحليل مشروع ────────── */

const RANGE = {
  type: 'object',
  properties: { min: { type: 'number' }, max: { type: 'number' } },
  required: ['min', 'max'],
  additionalProperties: false,
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    chance: { type: 'integer' },
    verdict: { type: 'string', enum: ['win', 'maybe', 'lose'] },
    summary: { type: 'string' },
    scenarios: {
      type: 'object',
      properties: { strong: { type: 'integer' }, average: { type: 'integer' }, loss: { type: 'integer' } },
      required: ['strong', 'average', 'loss'],
      additionalProperties: false,
    },
    factors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, score: { type: 'integer' }, note: { type: 'string' } },
        required: ['name', 'score', 'note'],
        additionalProperties: false,
      },
    },
    pros: { type: 'array', items: { type: 'string' } },
    cons: { type: 'array', items: { type: 'string' } },
    capital: RANGE,
    monthlyProfit: RANGE,
    risks: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'string' } },
  },
  required: ['chance', 'verdict', 'summary', 'scenarios', 'factors', 'pros', 'cons', 'capital', 'monthlyProfit', 'risks', 'tips', 'checks'],
  additionalProperties: false,
};

function range(v) {
  if (!v || typeof v !== 'object') return null;
  let a = Number(v.min);
  let b = Number(v.max);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if (!Number.isFinite(a)) a = b;
  if (!Number.isFinite(b)) b = a;
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

/** يوزّع النسب الثلاث حتى مجموعها 100 بالضبط. */
function scenarios(v, chance) {
  let s = [clampInt(v?.strong, 0, 100), clampInt(v?.average, 0, 100), clampInt(v?.loss, 0, 100)].map((x) => x ?? 0);
  let total = s.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const strong = Math.round(chance * 0.45);
    s = [strong, chance - strong, 100 - chance];
    total = s.reduce((a, b) => a + b, 0);
  }
  s = s.map((x) => Math.round((x * 100) / total));
  const diff = 100 - s.reduce((a, b) => a + b, 0);
  s[s.indexOf(Math.max(...s))] += diff;
  return { strong: s[0], average: s[1], loss: s[2] };
}

export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('not object');
  const chance = clampInt(raw.chance, 0, 100);
  if (chance === null) throw new Error('no chance');
  const factors = (Array.isArray(raw.factors) ? raw.factors : [])
    .map((f) => ({ name: String(f?.name || '').trim(), score: clampInt(f?.score, 0, 10), note: String(f?.note || '').trim() }))
    .filter((f) => f.name && f.score !== null)
    .slice(0, 8);
  const summary = String(raw.summary || '').trim();
  if (!summary && !factors.length) throw new Error('empty');
  return {
    chance,
    verdict: verdictOf(raw.verdict) ? raw.verdict : verdictFor(chance),
    summary,
    scenarios: scenarios(raw.scenarios, chance),
    factors,
    pros: strList(raw.pros),
    cons: strList(raw.cons),
    capital: range(raw.capital),
    monthlyProfit: range(raw.monthlyProfit),
    risks: strList(raw.risks, 6),
    tips: strList(raw.tips, 8),
    checks: strList(raw.checks, 6),
  };
}

function studyContext(s) {
  if (!s) return '';
  const lines = [];
  const v = verdictOf(s.verdict);
  if (v) lines.push(`- حكمه: ${v.label}`);
  if (s.chance !== null) lines.push(`- نسبة النجاح بتقديره: ${s.chance}%`);
  if (s.pros.length) lines.push(`- الإيجابيات اللي كتبها: ${s.pros.map((x) => x.t).join('؛ ')}`);
  if (s.cons.length) lines.push(`- السلبيات اللي كتبها: ${s.cons.map((x) => x.t).join('؛ ')}`);
  if (s.notes.trim()) lines.push(`- ملاحظاته: ${s.notes.trim().slice(0, 1500)}`);
  if (calcHasData(s.calc)) {
    const t = calcTotals(s.calc);
    const parts = [];
    if (t.setup) parts.push(`تكاليف البداية ${t.setup}`);
    if (t.monthly) parts.push(`المصاريف الشهرية ${t.monthly}`);
    if (t.gross !== null) parts.push(`الربح قبل المصاريف ${Math.round(t.gross)} بالشهر`);
    if (parts.length) lines.push(`- أرقام حسبته (${state.settings.currency === 'USD' ? 'دولار' : 'دينار'}): ${parts.join('، ')}`);
  }
  return lines.length ? `\nدراسة صاحب المشروع لحد الآن (خذها بعين الاعتبار وصحّحها إذا بيها غلط):\n${lines.join('\n')}\n` : '';
}

/** يحلّل مشروع ويحفظ النتيجة. يرجع الحفظ { at, model, cur, data }. */
export async function analyzeProject(p, { signal } = {}) {
  const prompt = `حلّل هذا المشروع واحسب احتمالات نجاحه:
المشروع: ${p.name}
الوصف: ${p.desc || '—'}
القسم: ${catOf(p.cat).name} · النوع: ${typeOf(p.type).name} · رأس المال التقريبي: ${capOf(p.cap)?.name || '—'}
السوق: ${state.market.title}
${studyContext(state.studies[p.id])}
المطلوب:
- chance: احتمال النجاح الكلي من 0 إلى 100.
- verdict: win إذا الاحتمال عالي، maybe إذا متوسط، lose إذا ضعيف.
- scenarios: احتمال كل نتيجة بعد سنة من الافتتاح (مجموعها 100): strong = ربح قوي ويتوسع، average = يغطي مصاريفه بربح بسيط، loss = يخسر أو يسكّر.
- factors: ستة عوامل بهذي الأسماء بالضبط: الطلب، المنافسة، رأس المال، هامش الربح، المخاطر، سهولة التشغيل. score من 0 إلى 10 حيث 10 دائمًا الأحسن للمشروع (منافسة 10 = منافسة قليلة، مخاطر 10 = مخاطر قليلة، رأس المال 10 = يحتاج مبلغ قليل)، وnote سطر يشرح.
- pros و cons: من 4 إلى 6 نقاط قصيرة لكل وحدة، بدون تكرار اللي كتبه صاحب المشروع.
- capital: تكاليف البداية بـ${curText()} (min و max).
- monthlyProfit: صافي الربح الشهري المتوقع بعد ما يستقر الشغل بنفس العملة (min و max، ممكن يكون بالسالب).
- risks: أهم 3 أو 4 مخاطر.
- tips: من 4 إلى 6 نصائح عملية حتى ينجح.
- checks: من 3 إلى 5 أشياء يتأكد منها بنفسه بالسوق قبل ما يبدي.
- summary: خلاصة بجملتين أو ثلاث.`;

  const { data, model } = await jsonCall({
    system: SYSTEM, prompt, schema: ANALYSIS_SCHEMA, normalize: normalizeAnalysis, maxTokens: 6000, signal,
  });
  const entry = { at: Date.now(), model, cur: state.settings.currency, data };
  state.ai.analyses[p.id] = entry;
  state.ai.quick[p.id] = { at: entry.at, chance: data.chance, reason: data.summary.slice(0, 140), model };
  save();
  return entry;
}

/* ────────── تقييم سريع لمجموعة مشاريع ────────── */

const SCORES_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, chance: { type: 'integer' }, reason: { type: 'string' } },
        required: ['id', 'chance', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

async function scoreBatch(items, signal) {
  const ids = new Set(items.map((p) => p.id));
  const prompt = `قيّم احتمال نجاح كل مشروع من هذي المشاريع بالسوق (${state.market.title}) إذا انفتح هسه بإدارة زينة ورأس مال مناسب.
لكل مشروع: id نفسه بالضبط، chance من 0 إلى 100، وreason سبب مختصر بسطر (أقل من 15 كلمة).
كن صريح وفرّق بين المشاريع، لا تنطي كلها نفس الرقم.

المشاريع:
${items.map((p) => `- ${p.id}: ${p.name} — ${p.desc || ''}`).join('\n')}`;

  const normalize = (raw) => {
    const list = Array.isArray(raw?.scores) ? raw.scores : Array.isArray(raw) ? raw : [];
    const out = list
      .map((x) => ({ id: String(x?.id || '').trim(), chance: clampInt(x?.chance, 0, 100), reason: String(x?.reason || '').trim() }))
      .filter((x) => ids.has(x.id) && x.chance !== null);
    if (!out.length) throw new Error('no scores');
    return out;
  };
  const { data, model } = await jsonCall({
    system: SYSTEM, prompt, schema: SCORES_SCHEMA, normalize, maxTokens: 3000, signal,
  });
  const at = Date.now();
  for (const s of data) state.ai.quick[s.id] = { at, chance: s.chance, reason: s.reason, model };
  save();
  return data.length;
}

/** يقيّم كل مشاريع قسم (دفعات ≤ 18). يرجع عدد اللي تقيّمت. */
export async function scoreCategory(catId, { signal } = {}) {
  const items = allProjects().filter((p) => p.cat === catId);
  let done = 0;
  for (let i = 0; i < items.length; i += 18) {
    done += await scoreBatch(items.slice(i, i + 18), signal);
  }
  return done;
}

/* ────────── اقتراح مشاريع جديدة ────────── */

const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: { type: 'string' },
          cat: { type: 'string' },
          type: { type: 'string' },
          cap: { type: 'integer' },
          desc: { type: 'string' },
          why: { type: 'string' },
          chance: { type: 'integer' },
        },
        required: ['name', 'icon', 'cat', 'type', 'cap', 'desc', 'why', 'chance'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

const firstEmoji = (s) => {
  const m = String(s || '').match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u);
  return m ? m[0] : '💡';
};

/**
 * يقترح أفكار جديدة (ما تنحفظ لحد ما تضيفها).
 * opts: { cat: 'all' | id, budget: 0..3, city, note, count }
 */
export async function suggestIdeas({ cat = 'all', budget = 0, city = '', note = '', count = 6 } = {}, { signal } = {}) {
  const cats = allCats();
  const existing = allProjects();
  const taken = new Set(existing.map((p) => norm(p.name)));
  const inCat = cat !== 'all' ? catOf(cat) : null;
  const names = (inCat ? existing.filter((p) => p.cat === cat) : existing).map((p) => p.name);

  const prompt = `اقترح ${count} أفكار مشاريع جديدة ${inCat ? `بقسم «${inCat.name}»` : 'من أقسام متنوعة'} للسوق (${state.market.title}).
${budget ? `رأس المال المتوفر: ${CAPITALS.find((c) => c.id === budget)?.name} (${CAPITALS.find((c) => c.id === budget)?.hint}).` : ''}
${city.trim() ? `المدينة أو المنطقة: ${city.trim()}.` : ''}
${note.trim() ? `ملاحظة صاحب الطلب: ${note.trim()}` : ''}
لازم تكون أفكار موجودة أو مطلوبة فعلًا بالعراق هسه، ومتنوعة، ومو مكررة ويا هذي المشاريع اللي عنده بالقائمة:
${names.join('، ')}

لكل فكرة:
- name: اسم قصير وواضح.
- icon: إيموجي واحد يناسبها.
- cat: id واحد من هذي الأقسام: ${cats.map((c) => `${c.id} (${c.name})`).join('، ')}${inCat ? ` — والمطلوب ${inCat.id}` : ''}.
- type: id واحد من: ${TYPES.map((t) => `${t.id} (${t.name})`).join('، ')}.
- cap: 1 أو 2 أو 3 (${CAPITALS.map((c) => `${c.id} = ${c.name}: ${c.hint}`).join('، ')}).
- desc: وصف محايد بسطر: شنو المشروع وشنو يبيع أو يقدّم.
- why: ليش ممكن ينجح هسه بالعراق، بسطر.
- chance: احتمال نجاحه من 0 إلى 100.`;

  const catIds = new Set(cats.map((c) => c.id));
  const typeIds = new Set(TYPES.map((t) => t.id));
  const normalize = (raw) => {
    const list = Array.isArray(raw?.ideas) ? raw.ideas : Array.isArray(raw) ? raw : [];
    const seen = new Set(taken);
    const out = [];
    for (const x of list) {
      const name = String(x?.name || '').trim().slice(0, 80);
      const key = norm(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        icon: firstEmoji(x.icon),
        cat: catIds.has(x.cat) ? x.cat : (inCat ? inCat.id : 'trade'),
        type: typeIds.has(x.type) ? x.type : 'shop',
        cap: clampInt(x.cap, 1, 3) || 1,
        desc: String(x.desc || '').trim().slice(0, 300),
        why: String(x.why || '').trim().slice(0, 300),
        chance: clampInt(x.chance, 0, 100),
      });
    }
    if (!out.length) throw new Error('no ideas');
    return out;
  };
  const { data, model } = await jsonCall({
    system: SYSTEM, prompt, schema: IDEAS_SCHEMA, normalize, maxTokens: 5000, signal,
  });
  return { ideas: data, model };
}

/* ────────── قراءة ────────── */

/** احتمال النجاح حسب الذكاء: من التحليل الكامل إن وُجد، وإلا من التقييم السريع. */
export function aiChance(id) {
  const a = state.ai.analyses[id];
  if (a) return a.data.chance;
  const q = state.ai.quick[id];
  return q ? q.chance : null;
}
