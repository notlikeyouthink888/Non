/** إنشاء كائن التقرير وتهيئته. */

import { uid, state } from '../core/store.js';
import { getType, sectionsOf } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { catName, CATEGORIES } from '../data/categories.js';

const CAT_EN = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.enName]));
import { academicYear } from '../data/universities.js';
import { fmtDate } from '../core/fmt.js';
import { planSections, TYPE_EN, toEN, dateEN } from './style.js';

export function newReport({ title, typeId, topicId = null, options = {}, meta = {} }) {
  const topic = topicId ? TOPIC_BY_ID[topicId] : null;
  const type = getType(typeId);
  const catId = topic?.cat || options.catId || null;
  const { enabled: coverOn, style: coverStyle, ...coverMeta } = state.cover;
  return {
    id: uid('r_'),
    title: title.trim(),
    typeId: type.id,
    topicId: topic?.id || null,
    catId,
    options: {
      length: options.length || state.prefs.length,
      level: options.level || state.prefs.level,
      images: Number.isFinite(options.images) ? options.images : type.figures,
      details: options.details || '',
      readings: options.readings || '',
      cover: options.cover ?? coverOn !== false,
      lang: options.lang || state.prefs.lang || 'mix',
      structure: options.structure || state.prefs.structure || 'fixed',
      human: options.human ?? state.prefs.human !== false,
    },
    meta: {
      ...coverMeta,
      coverStyle: coverStyle || 'classic',
      subject: catName(catId),
      expNo: '',
      date: fmtDate(),
      submitDate: '',
      year: academicYear(),
      org: '', project: '', location: '',
      ...meta,
    },
    source: 'ai',
    model: null,
    status: 'generating',
    error: '',
    notes: [],
    sections: [],
    figures: [],
    usage: { cost: 0 },
    words: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * يطابق عناوين الأقسام المولّدة مع هيكل النوع (بلغة التقرير) ويعيد الناقص منها.
 * الأقسام الاختيارية لا تُعدّ ناقصة، والعناوين الحرّة حسب الموضوع لا تُقارن.
 */
export function missingSections(report) {
  const plan = planSections(report.typeId, report.catId, report.options || {});
  if (!plan) return [];
  const have = new Set(report.sections.map((s) => s.h.replace(/[\s:：]+$/, '').trim()));
  return plan.filter((s) => !s.opt && !have.has(s.h)).map((s) => s.h);
}

/** القسم الذي تنتمي إليه الصورة: بالعنوان أولًا (لو تغيّر ترتيب الأقسام) ثم بالرقم. */
export function figureSection(report, fig) {
  const n = report.sections.length;
  if (!n) return 0;
  if (fig.secTitle) {
    const i = report.sections.findIndex((s) => s.h.trim() === fig.secTitle.trim());
    if (i >= 0) return i;
  }
  return Math.max(0, Math.min(n - 1, fig.sec | 0));
}

/** أشكال قسم معيّن (الجاهزة فقط إلا إذا طُلب غير ذلك). */
export function figuresOf(report, secIndex, { all = false } = {}) {
  return (report.figures || []).filter((f) => figureSection(report, f) === secIndex && (all || f.img));
}

/** ترقيم الأشكال حسب ظهورها في التقرير. */
export function figureNumbers(report) {
  const map = new Map();
  let n = 0;
  [...(report.figures || [])]
    .filter((f) => f.img)
    .map((f) => ({ f, s: figureSection(report, f) }))
    .sort((a, b) => a.s - b.s)
    .forEach(({ f }) => map.set(f.id, ++n));
  return map;
}

/** أسماء الطلبة (سطر لكل اسم) أو اسم الطالب الواحد. */
export function studentsOf(meta = {}) {
  const list = String(meta.students || '').split(/\n|،|,/).map((x) => x.trim()).filter(Boolean);
  if (list.length) return list;
  return meta.author ? [meta.author] : [];
}

/** المشرف مع لقبه العلمي (م.م، م.د، أ.م.د …). */
export function supervisorOf(meta = {}) {
  const t = String(meta.supTitle || '').trim();
  const n = String(meta.supervisor || '').trim();
  return n ? (t && !n.startsWith(t) ? `${t} ${n}` : n) : '';
}

/**
 * أسطر الغلاف بصيغة تقارير الجامعات العراقية — مصدر واحد للعرض وPDF وWord.
 * بالعربية أو بالإنجليزية حسب لغة التقرير. الطلبة المتعددون يُكتبون قائمة «إعداد الطلاب».
 * @returns {{ gov: string[], org: string[], kind: string, by: string[], students: string[], year: string, en: boolean }}
 */
export function coverLines(report) {
  const m = report.meta || {};
  const type = getType(report.typeId);
  const en = report.options?.lang === 'en';
  const subject = en ? (CAT_EN[report.catId] || m.subject || '') : m.subject || '';
  const students = studentsOf(m);
  const sup = supervisorOf(m);
  let kind;
  if (en) {
    const t = TYPE_EN[type.id] || 'Report';
    kind = type.id === 'lab' || type.id === 'field'
      ? `${subject ? `${subject} ` : ''}${t}${m.expNo ? ` — ${type.id === 'lab' ? 'Experiment' : 'Field Work'} No. (${m.expNo})` : ''}`
      : `${t}${subject ? ` — ${subject}` : ''}`;
  } else if (type.id === 'lab') kind = `تقرير مختبر ${subject || ''}`.trim() + (m.expNo ? ` — التجربة رقم (${m.expNo})` : '');
  else if (type.id === 'field') kind = `تقرير العمل الحقلي${m.expNo ? ` رقم (${m.expNo})` : ''}${subject ? ` — ${subject}` : ''}`;
  else kind = `${type.name}${subject ? ` — ${subject}` : ''}`;
  const stage = en ? toEN(m.stage) : m.stage;
  const stageGroup = [stage ? (en ? `${stage} Stage` : `المرحلة ${stage}`) : '', m.group ? (en ? `Group (${m.group})` : `الشعبة ${m.group}`) : ''].filter(Boolean).join(' — ');
  const L = en
    ? { student: 'Student', sup: 'Supervised by', org: 'Organization', loc: 'Location', date: 'Date', year: 'Academic Year' }
    : { student: 'اسم الطالب', sup: 'بإشراف', org: 'الجهة', loc: 'الموقع', date: 'التاريخ', year: 'السنة الدراسية' };
  return {
    en,
    gov: m.ministry === false ? [] : en ? ['Republic of Iraq', 'Ministry of Higher Education and Scientific Research'] : ['جمهورية العراق', 'وزارة التعليم العالي والبحث العلمي'],
    org: [m.university, m.college, m.department].filter(Boolean).map((x) => (en ? toEN(x) : x)),
    kind,
    students,
    by: [
      students.length === 1 ? `${L.student}: ${students[0]}` : '',
      stageGroup,
      sup ? `${L.sup}: ${sup}` : '',
      m.org ? `${L.org}: ${m.org}` : '',
      m.location ? `${L.loc}: ${m.location}` : '',
      m.date ? `${L.date}: ${en ? dateEN(m.date) : m.date}` : '',
    ].filter(Boolean),
    year: m.year ? `${L.year} ${m.year}` : '',
  };
}
