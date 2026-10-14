/**
 * المؤلّف دون اتصال: يبني تقريرًا كاملًا من قاعدة المعرفة حسب هيكل نوع التقرير،
 * وما لا تغطيه القاعدة يُترك بإرشاد واضح بين أقواس معقوفة ليكمله الطالب.
 */

import { getType, sectionsOf } from '../data/types.js';
import { CAT_BY_ID } from '../data/categories.js';
import { CAT_REFS, GENERIC } from '../data/kb/index.js';
import { synonym } from './style.js';

const bullets = (arr) => arr.map((x) => `- ${x}`).join('\n');
const numbered = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join('\n');

function table(t) {
  if (!t?.cols?.length) return '';
  const head = `| ${t.cols.join(' | ')} |`;
  const sep = `| ${t.cols.map(() => '---').join(' | ')} |`;
  const rows = (t.rows || []).map((r) => `| ${t.cols.map((_, i) => r[i] ?? '').join(' | ')} |`);
  return [head, sep, ...rows].join('\n');
}

/** المعادلات وتعريف الرموز (دون المثال). */
function formulasMd(c) {
  if (!c?.eq?.length) return '';
  const out = ['```eq\n' + c.eq.join('\n') + '\n```'];
  if (c.vars?.length) out.push('حيث:\n' + bullets(c.vars));
  return out.join('\n\n');
}

/** مسائل محلولة: المسألة ثم الحل خطوة بخطوة ثم الجواب. */
function examplesMd(list, single = false) {
  const ex = single ? list.slice(0, 1) : list;
  return ex.map((e, i) => [
    ex.length > 1 ? `### مثال ${i + 1}` : '',
    `**المسألة:** ${e.q}`,
    `**الحل:**\n${numbered(e.s || [])}`,
    e.a ? `**الجواب:** ${e.a}` : '',
  ].filter(Boolean).join('\n\n')).join('\n\n');
}

/** أسئلة وأجوبة بخط عريض للسؤال. */
function qaMd(list) {
  return list.map((d, i) => `**${i + 1}. ${d.q}**\n\n${d.a}`).join('\n\n');
}

/** فقرة تمهيدية عامة صادقة لأي موضوع. */
function genericIntro(title, cat, type) {
  const c = CAT_BY_ID[cat];
  return `يتناول هذا التقرير موضوع «${title}»${c ? ` من مادة ${c.name}` : ''} لطلبة المرحلة الثانية في قسم الهندسة المدنية، ويعرضه وفق هيكل ${type.name}${type.steps ? ' مع الخطوات المرقّمة' : ''}.`;
}

/** صيغ مختلفة لكل نقطة في الخاتمة: تُختار حسب رقم صيغة التقرير حتى لا تتشابه تقارير الطلبة. */
const CONCL = {
  obj: [
    (x) => `حقق التقرير غرضه المتمثل في: ${x}.`,
    (x) => `تمكّنّا من خلال هذا العمل من ${x.replace(/^(?:إيجاد|حساب|تعيين|قياس|دراسة|معرفة)/, (m) => m)}.`,
    (x) => `الهدف الأساسي كان ${x}، وقد تحقق بالخطوات المذكورة.`,
    (x) => `بيّن العمل كيفية ${x.replace(/^(?:إيجاد|حساب|تعيين|قياس|دراسة|معرفة)\s*/, '')}.`,
    (x) => `أوضحت التجربة طريقة ${x.replace(/^(?:إيجاد|حساب|تعيين|قياس|دراسة|معرفة)\s*/, '')} عمليًا.`,
  ],
  limits: [
    (x) => `تُقارن النتائج دائمًا بالقيم النموذجية والحدود المعتمدة، ومنها: ${x}`,
    (x) => `لا تكتمل قراءة النتيجة إلا بمقارنتها بالحدود المعروفة، مثل: ${x}`,
    (x) => `من القيم المرجعية التي نقارن بها: ${x}`,
    (x) => `للحكم على النتيجة نرجع إلى الحدود المعتمدة، ومنها: ${x}`,
  ],
  uses: [
    (t, x) => `تكمن أهمية «${t}» عمليًا في: ${x}.`,
    (t, x) => `يُستفاد من هذا الموضوع في الواقع العملي في: ${x}.`,
    (t, x) => `من التطبيقات المباشرة لما درسناه: ${x}.`,
    (t, x) => `يحتاج المهندس المدني هذا في: ${x}.`,
  ],
  notes: [
    (x) => `من أهم ما يجب الانتباه له: ${x}`,
    (x) => `لاحظنا أن الدقة تتأثر كثيرًا بما يلي: ${x}`,
    (x) => `أكثر ما يؤثر في صحة النتيجة: ${x}`,
    (x) => `نوصي عند إعادة العمل بالانتباه إلى أن ${x}`,
  ],
  problems: [
    (x) => `من الأخطاء التي يجب تجنبها: ${x}`,
    (x) => `خطأ شائع يقع فيه الطلبة: ${x}`,
    (x) => `يجب الحذر من: ${x}`,
  ],
};

/** خاتمة مولّدة من محتوى القاعدة، بصيغة وترتيب وشكل يختلف حسب رقم الصيغة. */
function conclusion(kb, title, variant = 0) {
  const v = variant || 1;
  const pick = (arr, k) => arr[(v + k) % arr.length];
  const pts = [];
  if (kb.obj) pts.push(pick(CONCL.obj, 0)(kb.obj.replace(/\.$/, '')));
  if (kb.limits?.length) pts.push(pick(CONCL.limits, 1)(kb.limits[v % kb.limits.length]));
  if (kb.uses?.length) pts.push(pick(CONCL.uses, 2)(title, [...kb.uses].sort((a, b) => ((a.length * v) % 7) - ((b.length * v) % 7)).slice(0, 3).join('، ')));
  if (kb.notes?.length) pts.push(pick(CONCL.notes, 3)(kb.notes[v % kb.notes.length]));
  if (kb.problems?.length && pts.length < 4) pts.push(pick(CONCL.problems, 4)(kb.problems[v % kb.problems.length]));
  const clean = pts.map((p) => p.replace(/\.\.$/, '.').replace(/:\s*\./, '.'));
  // ترتيب مختلف: الهدف أولًا دائمًا، والبقية تُدوَّر
  const rest = clean.slice(1);
  const rot = rest.length ? v % rest.length : 0;
  const ordered = [clean[0], ...rest.slice(rot), ...rest.slice(0, rot)].filter(Boolean);
  const form = v % 3;
  if (form === 1) return numbered(ordered);
  if (form === 2) return ordered.join(' ');
  return bullets(ordered);
}

/** جمل افتتاحية مختلفة تسبق مقدمة القاعدة. */
const INTRO_LEAD = [
  null,
  (t, c) => `يُعد موضوع «${t}» من الموضوعات الأساسية في ${c || 'الهندسة المدنية'}.`,
  (t) => `نتناول في هذا التقرير «${t}».`,
  (t, c) => `من المواضيع التي درسناها في ${c || 'المرحلة الثانية'} موضوع «${t}».`,
  null,
  (t) => `يعرض هذا التقرير «${t}» بشكل مبسط ومنظم.`,
  (t, c) => `يحتاج طالب الهندسة المدنية إلى فهم «${t}» جيدًا، لأنه يرتبط مباشرة بالعمل في الموقع${c ? ` وبمادة ${c}` : ''}.`,
  null,
  (t) => `في هذا التقرير نوضّح «${t}» من الناحيتين النظرية والعملية.`,
  (t, c) => `تتناول ${c ? `مادة ${c}` : 'المادة'} عدة مواضيع مهمة، ومنها «${t}» الذي نعرضه هنا.`,
  (t) => `يهدف هذا التقرير إلى التعريف بـ«${t}» وبيان أهميته.`,
  null,
];

/** يبدّل ترتيب عناصر قائمة لا يهم ترتيبها (تعاريف، أجهزة، تطبيقات) حسب الصيغة. */
function shuffle(arr, v) {
  if (!v || arr.length < 3) return arr;
  return arr.map((x, i) => [x, (i * 7 + v * 13) % 11]).sort((a, b) => a[1] - b[1]).map(([x]) => x);
}

function refsOf(kb, cat) {
  const refs = [...(kb?.std || []), ...(CAT_REFS[cat] || [])];
  return refs.length ? numbered([...new Set(refs)]) : null;
}

/** يحوّل حقلًا من قاعدة المعرفة إلى Markdown، أو null إن لم يتوفر. */
function fieldMd(key, kb, ctx) {
  const v = kb ? kb[key] : null;
  switch (key) {
    case 'intro': {
      if (!kb?.intro?.length) return null;
      const lead = INTRO_LEAD[(ctx.variant || 0) % INTRO_LEAD.length];
      const paras = [...kb.intro];
      if (lead) paras[0] = `${lead(ctx.title, CAT_BY_ID[ctx.cat]?.name)} ${paras[0]}`;
      return paras.join('\n\n');
    }
    case 'defs':
      if (kb?.defs?.length) return bullets(shuffle(kb.defs, ctx.variant));
      return kb?.intro?.length && !ctx.used.has('intro') ? kb.intro[0] : null;
    case 'obj': return kb?.obj || null;
    case 'std':
      if (kb?.std?.length) return bullets(kb.std);
      return kb && ctx.cat === 'strength' ? 'تُجرى هذه التجربة وفق دليل مختبر مقاومة المواد في القسم، ولا تخضع لمواصفة قياسية خاصة بها.' : null;
    case 'theory': {
      const parts = [kb?.theory?.length ? kb.theory.join('\n\n') : '', formulasMd(kb?.calc)].filter(Boolean);
      return parts.length ? parts.join('\n\n') : null;
    }
    case 'formulas': return formulasMd(kb?.calc) || null;
    case 'appmat': {
      const app = kb?.app || kb?.equip;
      if (!app?.length && !kb?.mat?.length) return null;
      const out = [];
      if (app?.length) out.push(bullets(shuffle(app, ctx.variant)));
      if (kb.mat?.length) out.push(`### المواد والنماذج\n\n${bullets(kb.mat)}`);
      return out.join('\n\n');
    }
    case 'steps': return kb?.steps?.length ? numbered(kb.steps) : null;
    case 'results': {
      if (!kb?.table && !kb?.calc?.example) return null;
      const out = [];
      if (kb.table) out.push(`**جدول (1): القراءات والنتائج**\n\n${table(kb.table)}`);
      if (kb.calc?.example) out.push(`**مثال حسابي:** ${kb.calc.example}`);
      if (kb.calc?.note) out.push(`> ${kb.calc.note}`);
      if (kb.graph) out.push(`**الرسم البياني:** ${kb.graph}`);
      out.push('> املأ الجدول بقراءاتك الفعلية من المختبر، ثم أعد الحسابات بها خطوة بخطوة.');
      return out.join('\n\n');
    }
    case 'table': return kb?.table ? `${table(kb.table)}\n\n> املأ الجدول بقراءاتك الفعلية.` : null;
    case 'example': return kb?.calc?.example ? `**مثال:** ${kb.calc.example}` : null;
    case 'examples':
      if (kb?.examples?.length) return examplesMd(kb.examples, ctx.singleExample);
      return kb?.calc?.example ? `**مثال:** ${kb.calc.example}` : null;
    case 'disc': {
      if (ctx.discOnly) return kb?.disc?.length ? qaMd(kb.disc) : null;
      const out = [];
      if (kb?.limits?.length && ctx.lab) out.push(`### مقارنة النتائج بالقيم النموذجية\n\n${bullets(kb.limits)}`);
      if (kb?.notes?.length && ctx.lab) out.push(`### مصادر الخطأ\n\n${bullets(kb.notes)}`);
      if (kb?.disc?.length) out.push(`${ctx.lab ? '### أسئلة المناقشة\n\n' : ''}${qaMd(kb.disc)}`);
      return out.length ? out.join('\n\n') : null;
    }
    case 'pros':
      return kb?.pros ? `### المزايا\n\n${bullets(kb.pros.pros || [])}\n\n### العيوب\n\n${bullets(kb.pros.cons || [])}` : null;
    case 'compare': return kb?.compare ? `**جدول (1): المقارنة**\n\n${table(kb.compare)}` : null;
    case 'choose': return kb?.choose?.length ? numbered(kb.choose) : null;
    case 'given': return kb?.given ? `${table(kb.given)}\n\n> استبدل القيم ببيانات مشروعك.` : null;
    case 'concl': return kb ? conclusion(kb, ctx.title, ctx.variant) : null;
    case 'refs': return refsOf(kb, ctx.cat);
    case 'trainingIntro': return GENERIC.trainingIntro.join('\n\n');
    case 'visitInfo': {
      const m = ctx.meta || {};
      return table({ cols: ['البيان', 'التفاصيل'], rows: [
        ['مكان الزيارة', m.location || '[اسم الموقع أو المعمل ومكانه]'],
        ['الجهة المستضيفة', m.org || '[الشركة أو الدائرة]'],
        ['تاريخ الزيارة', m.date || '[التاريخ]'],
        ['الأستاذ المرافق', m.supervisor || '[اسم الأستاذ]'],
        ['المرحلة', `${m.stage || 'الثانية'}${m.group ? ` — الشعبة ${m.group}` : ''}`],
      ] });
    }
    case 'safety': return v?.length ? bullets(v) : (ctx.genericSafety ? bullets(GENERIC.safety) : null);
    case 'improve':
      return kb?.notes?.length ? numbered(kb.notes.map((n) => `عالِج هذا المصدر: ${n.replace(/\.$/, '')}.`)) : null;
    case 'outline': {
      const secs = ['التعريف والأهمية', kb?.theory || kb?.calc ? 'الأساس النظري والمعادلات' : '', kb?.steps ? 'الخطوات العملية' : '', kb?.examples ? 'مثال محلول' : '', kb?.uses ? 'التطبيقات' : '', 'الخلاصة'].filter(Boolean);
      return kb ? numbered(secs) : null;
    }
    default:
      return Array.isArray(v) && v.length ? bullets(shuffle(v, ctx.variant)) : null;
  }
}

/**
 * يبني أقسام التقرير.
 * @returns {{ sections: {h, md}[], coverage: number }}
 */
export function composeOffline({ title, typeId, cat, kb, meta = {}, variant = 0 }) {
  const type = getType(typeId);
  const secs = sectionsOf(type, cat);
  const used = new Set();
  let filled = 0;
  const ctx = {
    title,
    cat,
    meta,
    variant,
    used,
    lab: ['lab', 'field'].includes(type.id),
    discOnly: type.id === 'discussion' || type.id === 'summary' || type.id === 'seminar',
    singleExample: ['summary', 'theory', 'applications'].includes(type.id),
    genericSafety: ['training', 'visit'].includes(type.id),
  };

  const sections = [];
  secs.forEach((s, idx) => {
    let md = null;
    for (const k of s.k) {
      if (used.has(k) && !['refs', 'std'].includes(k)) continue;
      md = fieldMd(k, kb, ctx);
      if (md) { used.add(k); break; }
    }
    if (!md && idx === 0) {
      if (kb?.intro?.length && !used.has('intro')) { md = kb.intro.join('\n\n'); used.add('intro'); }
      else md = genericIntro(title, cat, type);
    }
    if (!md && s.k.includes('refs')) md = refsOf(kb, cat);
    // قسم اختياري لا مادة له في هذا الموضوع: يُحذف بدل أن يبقى قالبًا فارغًا
    if (!md && s.opt && kb) return;
    if (md) filled++;
    sections.push({ h: synonym(s.h, variant), md: md || `[اكتب هنا: ${s.g}]` });
  });

  return { sections, coverage: filled / sections.length };
}

/** مواضع مقترحة للصور حسب حقول الأقسام. */
const FIG_KEYS = [['appmat', 'app', 'equip'], ['steps'], ['results', 'table', 'uses', 'kinds', 'theory']];

export function planFiguresOffline({ typeId, cat, count, kb, topic, title }) {
  const secs = sectionsOf(getType(typeId), cat);
  const queries = [...new Set([...(kb?.img || []), topic?.en].filter(Boolean))];
  if (!queries.length || !count) return [];
  // لا صور في الأقسام الاختيارية التي يحذفها المؤلّف دون اتصال
  const kept = new Set(composeOffline({ title, typeId, cat, kb }).sections.map((s) => s.h));
  const ok = secs.map((_, j) => j).filter((j) => kept.has(secs[j].h));
  const used = new Set();
  const figs = [];
  for (let i = 0; i < count; i++) {
    let sec = -1;
    for (const keys of FIG_KEYS.slice(i % FIG_KEYS.length).concat(FIG_KEYS)) {
      sec = ok.find((j) => !used.has(j) && secs[j].k.some((k) => keys.includes(k))) ?? -1;
      if (sec >= 0) break;
    }
    if (sec < 0) {
      const free = ok.filter((j) => j > 0 && !used.has(j));
      sec = free.length ? free[Math.min(free.length - 1, i)] : ok[Math.min(ok.length - 1, 1)];
    }
    used.add(sec);
    figs.push({
      sec,
      caption: i === 0 ? title : `${title} — ${secs[sec].h}`,
      queries: [queries[i % queries.length], ...queries.filter((_, j) => j !== i % queries.length)].slice(0, 3),
    });
  }
  return figs.sort((a, b) => a.sec - b.sec);
}
