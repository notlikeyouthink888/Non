/** إنشاء كائن التقرير وتهيئته. */

import { uid, state } from '../core/store.js';
import { getType, sectionsOf } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { catName } from '../data/categories.js';
import { academicYear } from '../data/universities.js';
import { fmtDate } from '../core/fmt.js';

export function newReport({ title, typeId, topicId = null, options = {}, meta = {} }) {
  const topic = topicId ? TOPIC_BY_ID[topicId] : null;
  const type = getType(typeId);
  const catId = topic?.cat || options.catId || null;
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
    },
    meta: {
      ...state.cover,
      subject: catName(catId),
      expNo: '',
      date: fmtDate(),
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

/** يطابق عناوين الأقسام المولّدة مع هيكل النوع ويعيد الناقص منها. */
export function missingSections(report) {
  const have = new Set(report.sections.map((s) => s.h.replace(/[\s:：]+$/, '').trim()));
  return sectionsOf(getType(report.typeId), report.catId).filter((s) => !have.has(s.h)).map((s) => s.h);
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

/**
 * أسطر الغلاف بصيغة تقارير الجامعات العراقية — مصدر واحد للعرض وPDF وWord.
 * @returns {{ gov: string[], org: string[], kind: string, by: string[], year: string }}
 */
export function coverLines(report) {
  const m = report.meta || {};
  const type = getType(report.typeId);
  const subject = m.subject || '';
  let kind;
  if (type.id === 'lab') kind = `تقرير مختبر ${subject || ''}`.trim() + (m.expNo ? ` — التجربة رقم (${m.expNo})` : '');
  else if (type.id === 'field') kind = `تقرير العمل الحقلي${m.expNo ? ` رقم (${m.expNo})` : ''}${subject ? ` — ${subject}` : ''}`;
  else kind = `${type.name}${subject ? ` — ${subject}` : ''}`;
  const stageGroup = [m.stage ? `المرحلة ${m.stage}` : '', m.group ? `الشعبة ${m.group}` : ''].filter(Boolean).join(' — ');
  return {
    gov: m.ministry === false ? [] : ['جمهورية العراق', 'وزارة التعليم العالي والبحث العلمي'],
    org: [m.university, m.college, m.department].filter(Boolean),
    kind,
    by: [
      m.author ? `اسم الطالب: ${m.author}` : '',
      stageGroup,
      m.supervisor ? `بإشراف: ${m.supervisor}` : '',
      m.org ? `الجهة: ${m.org}` : '',
      m.location ? `الموقع: ${m.location}` : '',
      m.date ? `التاريخ: ${m.date}` : '',
    ].filter(Boolean),
    year: m.year ? `السنة الدراسية ${m.year}` : '',
  };
}
