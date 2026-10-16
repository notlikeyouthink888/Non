/** إنشاء كائن التقرير وتهيئته. */

import { uid, state } from '../core/store.js';
import { getType, sectionsOf } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { catName, CATEGORIES } from '../data/categories.js';

const CAT_EN = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.enName]));
import { academicYear } from '../data/universities.js';
import { fmtDate } from '../core/fmt.js';
import { planSections, TYPE_EN, toEN, dateEN, randomVariant } from './style.js';

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
      lists: options.lists || state.prefs.lists || 'mix',
      tables: options.tables ?? state.prefs.tables !== false,
      variant: options.variant || randomVariant(),
    },
    format: options.numbering === undefined ? {} : { numbering: !!options.numbering },
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

/** عناوين حقول الغلاف الافتراضية بالعربية والإنجليزية (يستطيع الطالب تغييرها أو حذفها). */
export const COVER_LABELS = {
  ar: { student: 'اسم الطالب', students: 'إعداد الطلاب', sup: 'بإشراف', stage: 'المرحلة', subject: 'المادة', exp: 'رقم التجربة', date: 'التاريخ', expDate: 'تاريخ التجربة', submit: 'تاريخ التسليم', year: 'السنة الدراسية', org: 'الجهة', loc: 'الموقع' },
  en: { student: 'Student', students: 'Prepared by', sup: 'Supervised by', stage: 'Stage', subject: 'Subject', exp: 'Experiment No.', date: 'Date', expDate: 'Date of Experiment', submit: 'Date of Submission', year: 'Academic Year', org: 'Organization', loc: 'Location' },
};

/** العناوين الفعلية: ما غيّره الطالب (والفارغ يعني بلا عنوان) وإلا الافتراضي بلغة التقرير. */
export function labelsOf(meta = {}, en = false) {
  const d = COVER_LABELS[en ? 'en' : 'ar'];
  const o = meta.labels || {};
  return Object.fromEntries(Object.keys(d).map((k) => [k, typeof o[k] === 'string' ? o[k].trim() : d[k]]));
}

/** «العنوان: القيمة»، أو القيمة وحدها إن حُذف العنوان. */
export const labeled = (label, value) => (label ? `${label}: ${value}` : value);

/** ما أخفاه الطالب من الغلاف (الوزارة محفوظة قديمًا في meta.ministry). */
export function hiddenOf(meta = {}) {
  return { ...(meta.hide || {}), ...(meta.ministry === false ? { ministry: true } : {}) };
}

/**
 * أسطر الغلاف بصيغة تقارير الجامعات العراقية — مصدر واحد للعرض وPDF وWord.
 * بالعربية أو بالإنجليزية حسب لغة التقرير. الطلبة المتعددون يُكتبون قائمة «إعداد الطلاب».
 * تحترم ما أخفاه الطالب من الحقول وعناوينها المعدّلة.
 * @returns {{ gov: string[], org: string[], kind: string, by: string[], students: string[], year: string, subject: string, en: boolean }}
 */
export function coverLines(report) {
  const m = report.meta || {};
  const type = getType(report.typeId);
  const en = report.options?.lang === 'en';
  const hide = hiddenOf(m);
  const L = labelsOf(m, en);
  const subject = hide.subject ? '' : en ? (CAT_EN[report.catId] || m.subject || '') : m.subject || '';
  const expNo = hide.expNo ? '' : m.expNo;
  const students = hide.students ? [] : studentsOf(m);
  const sup = hide.supervisor ? '' : supervisorOf(m);
  let kind;
  if (en) {
    const t = TYPE_EN[type.id] || 'Report';
    kind = type.id === 'lab' || type.id === 'field'
      ? `${subject ? `${subject} ` : ''}${t}${expNo ? ` — ${type.id === 'lab' ? 'Experiment' : 'Field Work'} No. (${expNo})` : ''}`
      : `${t}${subject ? ` — ${subject}` : ''}`;
  } else if (type.id === 'lab') kind = `تقرير مختبر ${subject || ''}`.trim() + (expNo ? ` — التجربة رقم (${expNo})` : '');
  else if (type.id === 'field') kind = `تقرير العمل الحقلي${expNo ? ` رقم (${expNo})` : ''}${subject ? ` — ${subject}` : ''}`;
  else kind = `${type.name}${subject ? ` — ${subject}` : ''}`;
  const stage = en ? toEN(m.stage) : m.stage;
  const stageGroup = hide.stage ? '' : [stage ? (en ? `${stage} Stage` : `المرحلة ${stage}`) : '', m.group ? (en ? `Group (${m.group})` : `الشعبة ${m.group}`) : ''].filter(Boolean).join(' — ');
  const tr = (x) => (en ? toEN(x) : x);
  return {
    en,
    subject,
    gov: hide.ministry ? [] : en ? ['Republic of Iraq', 'Ministry of Higher Education and Scientific Research'] : ['جمهورية العراق', 'وزارة التعليم العالي والبحث العلمي'],
    org: [!hide.university && m.university, !hide.college && m.college, !hide.department && m.department].filter(Boolean).map(tr),
    kind: hide.kind ? '' : kind,
    students,
    by: [
      students.length === 1 ? labeled(L.student, students[0]) : '',
      stageGroup,
      sup ? labeled(L.sup, sup) : '',
      m.org ? labeled(L.org, m.org) : '',
      m.location ? labeled(L.loc, m.location) : '',
      m.date && !hide.date ? labeled(L.date, en ? dateEN(m.date) : m.date) : '',
    ].filter(Boolean),
    year: m.year && !hide.year ? (L.year ? `${L.year} ${m.year}` : m.year) : '',
  };
}
