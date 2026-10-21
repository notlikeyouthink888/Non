/**
 * طبقة البيانات: المشاريع (القاعدة + اللي تضيفها)، الأقسام، والدراسات.
 * الدراسة لها ثلاث أنواع بنفس الشكل: مشروع، قطاع (قسم كامل)، والسوق العام.
 */

import { PROJECTS, CATS, TYPES, CAPITALS } from './data/projects.js';
import { state, save, blankStudy, uid } from './core/store.js';
import { norm, matches } from './core/text.js';

export { TYPES, CAPITALS };

export const VERDICTS = [
  { id: 'win', label: 'ينجح', icon: '✅', cls: 'ok' },
  { id: 'maybe', label: 'متردد', icon: '🤔', cls: 'warn' },
  { id: 'lose', label: 'يفشل', icon: '❌', cls: 'danger' },
];

export const verdictOf = (id) => VERDICTS.find((v) => v.id === id) || null;

/* ────────── الأقسام والأنواع ────────── */

export function allCats() {
  return [...CATS, ...state.customCats];
}

export function catOf(id) {
  return allCats().find((c) => c.id === id) || { id, icon: '📁', name: 'أخرى' };
}

export const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
export const capOf = (id) => CAPITALS.find((c) => c.id === id) || null;

export function addCustomCat(name, icon = '📁') {
  const cat = { id: uid('cat_'), icon, name };
  state.customCats.push(cat);
  save();
  return cat;
}

/* ────────── المشاريع ────────── */

const SEED = new Map(PROJECTS.map((p) => [p.id, p]));

export const isSeed = (id) => SEED.has(id);

function withEdits(p) {
  const e = state.edits[p.id];
  return e ? { ...p, ...e, edited: true } : { ...p };
}

/**
 * كل المشاريع الظاهرة مرتّبة حسب القسم: اللي أضفتها أولًا (الأحدث فوق) ثم القاعدة.
 */
export function allProjects() {
  const hidden = new Set(state.hidden);
  const custom = [...state.custom].reverse().map((p) => ({ ...p, custom: true }));
  const seeded = PROJECTS.filter((p) => !hidden.has(p.id)).map(withEdits);
  const order = new Map(allCats().map((c, i) => [c.id, i]));
  const rank = (p) => order.get(p.cat) ?? 999;
  return [...custom, ...seeded]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

export function getProject(id) {
  if (SEED.has(id)) return withEdits(SEED.get(id));
  const c = state.custom.find((p) => p.id === id);
  return c ? { ...c, custom: true } : null;
}

export function hiddenProjects() {
  return state.hidden.map((id) => SEED.get(id)).filter(Boolean).map(withEdits);
}

export function countProjects() {
  return PROJECTS.length - state.hidden.length + state.custom.length;
}

/** يضيف مشروعًا جديدًا ويعيده. */
export function addProject(data) {
  const p = { id: uid('c_'), createdAt: Date.now(), icon: '💡', cap: 1, type: 'shop', cat: 'trade', desc: '', ...data };
  state.custom.push(p);
  save();
  return p;
}

/** يعدّل معلومات مشروع (المضاف يتعدّل مباشرة، والقاعدة تنحفظ تعديلاتها جانبًا). */
export function updateProject(id, data) {
  if (SEED.has(id)) {
    const base = SEED.get(id);
    const diff = {};
    for (const [k, v] of Object.entries(data)) if (base[k] !== v) diff[k] = v;
    if (Object.keys(diff).length) state.edits[id] = diff;
    else delete state.edits[id];
  } else {
    const p = state.custom.find((x) => x.id === id);
    if (p) Object.assign(p, data);
  }
  save();
}

export function resetProjectEdits(id) {
  delete state.edits[id];
  save();
}

/** المضاف ينحذف مع دراسته، وفكرة القاعدة تنخفي (وتگدر ترجّعها من الإعدادات). */
export function removeProject(id) {
  if (SEED.has(id)) {
    if (!state.hidden.includes(id)) state.hidden.push(id);
  } else {
    state.custom = state.custom.filter((p) => p.id !== id);
    delete state.studies[id];
  }
  save();
}

export function restoreProject(id) {
  state.hidden = state.hidden.filter((x) => x !== id);
  save();
}

/* ────────── الدراسات ────────── */

/** ref = { kind: 'project' | 'sector' | 'market', id } */
export function studyFor(ref, create = false) {
  if (ref.kind === 'market') {
    if (!state.market.study && create) state.market.study = blankStudy();
    return state.market.study;
  }
  const bag = ref.kind === 'sector' ? state.sectors : state.studies;
  if (!bag[ref.id] && create) bag[ref.id] = blankStudy();
  return bag[ref.id] || null;
}

export function touch(study) {
  if (study) study.updatedAt = Date.now();
  save();
}

export const mapCount = (s) => Math.max(0, (s?.map?.nodes?.length || 0) - 1);

export function calcHasData(calc) {
  if (!calc) return false;
  return !!(calc.setup?.length || calc.monthly?.length || calc.daily || calc.direct);
}

export function hasContent(s) {
  if (!s) return false;
  return !!(s.verdict || s.chance !== null || s.pros.length || s.cons.length
    || s.notes.trim() || mapCount(s) || calcHasData(s.calc));
}

/** يشيل الدراسة الفارغة حتى ما تتراكم بيانات بلا فائدة. */
export function pruneStudy(ref) {
  const s = studyFor(ref);
  if (!s || hasContent(s) || s.star) return;
  if (ref.kind === 'market') state.market.study = null;
  else delete (ref.kind === 'sector' ? state.sectors : state.studies)[ref.id];
  save();
}

/* ────────── الحسبة ────────── */

const sum = (items) => (items || []).reduce((a, it) => a + (Number(it.amount) || 0), 0);

export function calcTotals(calc) {
  const setup = sum(calc?.setup);
  const monthly = sum(calc?.monthly);
  const mode = calc?.mode || 'daily';
  const days = calc?.days ?? 30;
  let gross = null;
  if (mode === 'direct') gross = calc?.direct ?? null;
  else if (calc?.daily && calc?.margin) gross = calc.daily * (calc.margin / 100) * days;
  const net = gross === null ? null : gross - monthly;
  const payback = net && net > 0 && setup > 0 ? setup / net : null;
  // كم لازم تبيع باليوم حتى تغطي المصاريف الشهرية (بطريقة المبيعات اليومية فقط)
  const breakEvenDaily = mode === 'daily' && calc?.margin > 0 && days > 0 && monthly > 0
    ? monthly / ((calc.margin / 100) * days) : null;
  return { setup, monthly, gross, net, payback, breakEvenDaily, mode, days };
}

/* ────────── البحث والفلترة ────────── */

function blob(p) {
  const s = state.studies[p.id];
  return norm([
    p.name, p.desc, catOf(p.cat).name, typeOf(p.type).name,
    s?.notes, ...(s?.pros || []).map((x) => x.t), ...(s?.cons || []).map((x) => x.t),
  ].filter(Boolean).join(' '));
}

export function filterProjects(f) {
  let list = allProjects();
  if (f.cat && f.cat !== 'all') list = list.filter((p) => p.cat === f.cat);
  if (f.type && f.type !== 'all') list = list.filter((p) => p.type === f.type);
  if (f.cap) list = list.filter((p) => p.cap === f.cap);
  if (f.verdict && f.verdict !== 'all') {
    list = list.filter((p) => {
      const s = state.studies[p.id];
      if (f.verdict === 'star') return !!s?.star;
      if (f.verdict === 'none') return !s?.verdict;
      if (f.verdict === 'studied') return hasContent(s);
      return s?.verdict === f.verdict;
    });
  }
  if (f.q?.trim()) list = list.filter((p) => matches(blob(p), f.q));

  const st = (p) => state.studies[p.id];
  if (f.sort === 'recent') {
    list.sort((a, b) => (hasContent(st(b)) ? st(b).updatedAt : 0) - (hasContent(st(a)) ? st(a).updatedAt : 0));
  } else if (f.sort === 'chance') {
    list.sort((a, b) => (st(b)?.chance ?? -1) - (st(a)?.chance ?? -1));
  } else if (f.sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }
  return list;
}

/** كل الدراسات اللي بيها شي، مع مشاريعها. */
export function studiedProjects() {
  return allProjects()
    .map((p) => ({ p, s: state.studies[p.id] }))
    .filter(({ s }) => hasContent(s));
}
