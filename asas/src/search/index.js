/**
 * محرك البحث في مكتبة العناوين: مطابقة عربية تقريبية مع ترتيب حسب الصلة،
 * واكتشاف نوع التقرير من كلمات المستخدم («تقرير يومي»، «طريقة تنفيذ»...).
 */

import { TOPICS } from '../data/topics.js';
import { REPORT_TYPES } from '../data/types.js';
import { CAT_BY_ID } from '../data/categories.js';
import { KB } from '../data/kb/index.js';
import { norm, queryTerms, matchTerm, stemsOf } from '../core/arabic.js';

let INDEX = null;

/** تكرار كل جذر في العناوين — الكلمات الشائعة («فحص») تُوزن أقل من النادرة («هطول»). */
const DF = new Map();

function buildIndex() {
  INDEX = TOPICS.map((t) => ({
    t,
    title: norm(t.title),
    titleStems: stemsOf(t.title),
    kwStems: stemsOf(t.kw),
    enStems: stemsOf(t.en),
    catStems: stemsOf(CAT_BY_ID[t.cat]?.name || ''),
    hasKB: !!KB[t.id],
  }));
  for (const e of INDEX) {
    new Set([...e.titleStems, ...e.kwStems]).forEach((st) => DF.set(st, (DF.get(st) || 0) + 1));
  }
  return INDEX;
}

function weightOf(term) {
  const n = INDEX.length;
  const df = Math.max(DF.get(term.stem) || 0, term.syn ? DF.get(term.syn) || 0 : 0) || 1;
  return Math.log(1 + n / df);
}

/** كلمات تدل على نوع التقرير المطلوب. */
const TYPE_HINTS = [
  ['lab', ['مختبري', 'مختبر', 'مختبريه', 'فحص', 'تجربه']],
  ['training', ['تدريب', 'صيفي', 'التدريب']],
  ['visit', ['زياره', 'ميدانيه', 'ميداني']],
  ['daily', ['يومي', 'يوميه']],
  ['progress', ['تقدم', 'انجاز', 'شهري', 'اسبوعي']],
  ['inspection', ['استلام', 'فحص واستلام']],
  ['method', ['طريقه تنفيذ', 'تنفيذ', 'method', 'ميثود']],
  ['qc', ['جوده', 'سيطره نوعيه']],
  ['safety', ['سلامه', 'مخاطر']],
  ['assessment', ['تقييم', 'تشققات', 'معالجه']],
  ['geotech', ['تحري', 'جسات', 'جيوتقني']],
  ['boq', ['كميات', 'كلفه', 'تخمين']],
  ['design', ['تصميم', 'تصميمي']],
  ['survey', ['مساحي', 'مساحه']],
  ['failure', ['انهيار', 'حادث', 'فشل']],
  ['proposal', ['مقترح', 'مشروع تخرج', 'خطه بحث']],
  ['research', ['بحث', 'بحثي', 'دراسه']],
];

export function detectType(q) {
  const n = ' ' + norm(q) + ' ';
  for (const [id, hints] of TYPE_HINTS) {
    if (hints.some((h) => n.includes(' ' + h + ' ') || n.includes(' ' + h))) return id;
  }
  return null;
}

/** أنواع التقارير المطابقة لنص البحث. */
export function searchTypes(q) {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  return REPORT_TYPES.map((tp) => {
    const st = stemsOf(tp.name + ' ' + tp.short);
    const s = terms.reduce((acc, term) => acc + matchTerm(term, st), 0) / terms.length;
    return { tp, s };
  }).filter((x) => x.s >= 0.8).sort((a, b) => b.s - a.s).map((x) => x.tp);
}

/**
 * البحث في العناوين.
 * يعيد [{ topic, score, hasKB }] مرتبة تنازليًا.
 */
/** كلمات تصف نوع التقرير لا موضوعه؛ تُحذف من مطابقة العناوين إن بقي غيرها. */
const TYPE_WORDS = new Set(['طريقه', 'تنفيذ', 'يومي', 'يوميه', 'مختبري', 'مختبريه', 'زياره', 'ميدانيه', 'ميداني', 'تدريب', 'صيفي', 'شهري', 'اسبوعي', 'بحثي', 'مقترح', 'method', 'statement']);

export function searchTopics(q, { cat = null, limit = 40 } = {}) {
  const idx = INDEX || buildIndex();
  let terms = queryTerms(q);
  const topical = terms.filter((t) => !TYPE_WORDS.has(t.raw));
  if (topical.length) terms = topical;
  const nq = norm(q).trim();
  if (!terms.length) return [];

  const weights = terms.map(weightOf);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const out = [];
  for (const e of idx) {
    if (cat && e.t.cat !== cat) continue;
    let score = 0;
    let matchedW = 0;
    terms.forEach((term, k) => {
      const sTitle = matchTerm(term, e.titleStems);
      const sKw = matchTerm(term, e.kwStems) * 0.85;
      const sEn = matchTerm(term, e.enStems) * 0.8;
      const sCat = matchTerm(term, e.catStems) * 0.35;
      const best = Math.max(sTitle, sKw, sEn, sCat);
      if (best >= 0.5) matchedW += weights[k];
      score += best * (sTitle >= best ? 3 : 2) * (weights[k] / (totalW / terms.length));
    });
    const coverage = totalW ? matchedW / totalW : 0;
    if (coverage < (terms.length <= 2 ? 0.5 : 0.45)) continue;
    if (nq.length >= 3 && e.title.includes(nq)) score += 6;
    if (coverage > 0.999) score += 2.5;
    score *= 0.6 + coverage * 0.4;
    if (e.hasKB) score += 0.3;
    out.push({ topic: e.t, score, hasKB: e.hasKB, coverage });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** هل النتائج ضعيفة بما يكفي لنقترح الذكاء الاصطناعي؟ */
export function isWeak(results) {
  return !results.length || results[0].coverage < 1 || results[0].score < 5;
}

/** عناوين مقترحة للصفحة الرئيسية (ثابتة يوميًا). */
export function featured(n = 8) {
  const withKB = TOPICS.filter((t) => KB[t.id]);
  const day = Math.floor(Date.now() / 86400000);
  const out = [];
  for (let i = 0; i < n && i < withKB.length; i++) {
    out.push(withKB[(day * 7 + i * 13) % withKB.length]);
  }
  return [...new Set(out)];
}
