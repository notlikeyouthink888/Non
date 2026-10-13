/**
 * المؤلّف دون اتصال: يبني تقريرًا كاملًا من قاعدة المعرفة حسب هيكل نوع التقرير،
 * وما لا تغطيه القاعدة يُترك بإرشاد واضح بين أقواس معقوفة ليكمله المستخدم.
 */

import { getType } from '../data/types.js';
import { CAT_BY_ID } from '../data/categories.js';
import { CAT_REFS, GENERIC } from '../data/kb/index.js';

const bullets = (arr) => arr.map((x) => `- ${x}`).join('\n');
const numbered = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join('\n');

function table(t) {
  if (!t?.cols?.length) return '';
  const head = `| ${t.cols.join(' | ')} |`;
  const sep = `| ${t.cols.map(() => '---').join(' | ')} |`;
  const rows = (t.rows || []).map((r) => `| ${t.cols.map((_, i) => r[i] ?? '').join(' | ')} |`);
  return [head, sep, ...rows].join('\n');
}

function calcMd(c) {
  if (!c) return '';
  const out = [];
  if (c.eq?.length) out.push('```eq\n' + c.eq.join('\n') + '\n```');
  if (c.vars?.length) out.push('حيث:\n' + bullets(c.vars));
  if (c.example) out.push(`**مثال حسابي:** ${c.example}`);
  if (c.note) out.push(`> ${c.note}`);
  return out.join('\n\n');
}

/** فقرة تمهيدية عامة صادقة لأي موضوع. */
function genericIntro(title, cat, type) {
  const c = CAT_BY_ID[cat];
  return `يتناول هذا التقرير موضوع «${title}»${c ? ` ضمن مجال ${c.short || c.name}` : ''} في الهندسة المدنية، ويعرضه وفق هيكل ${type.name}، مع التركيز على الجوانب العملية و${type.steps ? 'الخطوات المرقّمة' : 'التطبيق'} والمواصفات المعتمدة.`;
}

/** خاتمة مولّدة من محتوى القاعدة. */
function conclusion(kb, title) {
  const pts = [];
  if (kb.obj) pts.push(`حقق التقرير غرضه المتمثل في: ${kb.obj.replace(/\.$/, '')}.`);
  if (kb.limits?.[0]) pts.push(`تُقارن النتائج دائمًا بالحدود المعتمدة، ومنها: ${kb.limits[0]}`);
  if (kb.uses?.length) pts.push(`تكمن أهمية «${title}» عمليًا في: ${kb.uses.slice(0, 3).join('، ')}.`);
  if (kb.notes?.[0]) pts.push(`من الملاحظات المهمة: ${kb.notes[0]}`);
  if (kb.problems?.[0] && pts.length < 4) pts.push(`من أبرز المشاكل التي يجب تجنبها: ${kb.problems[0]}.`);
  return bullets(pts.map((p) => p.replace(/\.\.$/, '.').replace(/:\s*\./, '.')));
}

function refsOf(kb, cat) {
  const refs = [...(kb?.std || []), ...(CAT_REFS[cat] || [])];
  return numbered([...new Set(refs)]);
}

/** يحوّل حقلًا من قاعدة المعرفة إلى Markdown، أو null إن لم يتوفر. */
function fieldMd(key, kb, ctx) {
  const v = kb ? kb[key] : null;
  switch (key) {
    case 'intro': return kb?.intro?.length ? kb.intro.join('\n\n') : null;
    case 'defs': return kb?.intro?.length > 1 ? kb.intro[0] : null;
    case 'obj': return kb?.obj || null;
    case 'std': return kb?.std?.length ? bullets(kb.std) : null;
    case 'steps': return kb?.steps?.length ? numbered(kb.steps) : null;
    case 'calc': return kb?.calc ? calcMd(kb.calc) : null;
    case 'table': return kb?.table ? `${table(kb.table)}\n\n> املأ الجدول بقراءاتك الفعلية.` : null;
    case 'example': return kb?.calc?.example ? `**مثال:** ${kb.calc.example}` : null;
    case 'pros':
      return kb?.pros ? `### المزايا\n\n${bullets(kb.pros.pros || [])}\n\n### العيوب\n\n${bullets(kb.pros.cons || [])}` : null;
    case 'concl': return kb ? conclusion(kb, ctx.title) : null;
    case 'refs': return refsOf(kb, ctx.cat);
    case 'trainingIntro': return GENERIC.trainingIntro.join('\n\n');
    case 'roles': return bullets(GENERIC.roles);
    case 'env': return bullets(GENERIC.env);
    case 'safety': return v?.length ? (ctx.numberedSafety ? numbered(v) : bullets(v)) : (ctx.genericSafety ? bullets(GENERIC.safety) : null);
    case 'hazards': return bullets(v?.length ? v : GENERIC.hazards);
    case 'ppe': return bullets(v?.length ? v : GENERIC.ppe);
    case 'emergency': return bullets(v?.length ? v : GENERIC.emergency);
    case 'inspect': return null;
    default:
      return Array.isArray(v) && v.length ? bullets(v) : null;
  }
}

/**
 * يبني أقسام التقرير.
 * @returns {{ sections: {h, md}[], coverage: number }}
 */
export function composeOffline({ title, typeId, cat, kb }) {
  const type = getType(typeId);
  const used = new Set();
  let filled = 0;
  const ctx = { title, cat, numberedSafety: type.id === 'safety', genericSafety: ['method', 'safety', 'training', 'visit'].includes(type.id) };

  const sections = type.sections.map((s, idx) => {
    let md = null;
    for (const k of s.k) {
      if (used.has(k) && !['refs', 'std'].includes(k)) continue;
      md = fieldMd(k, kb, ctx);
      if (md) { used.add(k); break; }
    }
    if (!md && idx === 0) md = kb?.intro?.length && !used.has('intro') ? kb.intro.join('\n\n') : genericIntro(title, cat, type);
    if (!md && s.k.includes('refs')) md = refsOf(kb, cat);
    if (md) filled++;
    return { h: s.h, md: md || `[اكتب هنا: ${s.g}]` };
  });

  return { sections, coverage: filled / type.sections.length };
}

/** مواضع مقترحة للصور حسب حقول الأقسام. */
const FIG_KEYS = [['app', 'equip'], ['steps'], ['table', 'uses', 'kinds', 'qc']];

export function planFiguresOffline({ typeId, count, kb, topic, title }) {
  const type = getType(typeId);
  const queries = [...new Set([...(kb?.img || []), topic?.en].filter(Boolean))];
  if (!queries.length || !count) return [];
  const used = new Set();
  const figs = [];
  for (let i = 0; i < count; i++) {
    let sec = -1;
    for (const keys of FIG_KEYS.slice(i % FIG_KEYS.length).concat(FIG_KEYS)) {
      sec = type.sections.findIndex((s, j) => !used.has(j) && s.k.some((k) => keys.includes(k)));
      if (sec >= 0) break;
    }
    if (sec < 0) sec = Math.min(type.sections.length - 1, 1 + i * 2);
    used.add(sec);
    figs.push({
      sec,
      caption: i === 0 ? title : `${title} — ${type.sections[sec].h}`,
      queries: [queries[i % queries.length], ...queries.filter((_, j) => j !== i % queries.length)].slice(0, 3),
    });
  }
  return figs.sort((a, b) => a.sec - b.sec);
}
