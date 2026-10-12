/** إنشاء كائن التقرير وتهيئته. */

import { uid, state } from '../core/store.js';
import { getType } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { fmtDate } from '../core/fmt.js';

export function newReport({ title, typeId, topicId = null, options = {}, meta = {} }) {
  const topic = topicId ? TOPIC_BY_ID[topicId] : null;
  const type = getType(typeId);
  return {
    id: uid('r_'),
    title: title.trim(),
    typeId: type.id,
    topicId: topic?.id || null,
    catId: topic?.cat || options.catId || null,
    options: {
      length: options.length || state.prefs.length,
      level: options.level || state.prefs.level,
      images: Number.isFinite(options.images) ? options.images : type.figures,
      details: options.details || '',
    },
    meta: {
      ...state.cover,
      date: fmtDate(),
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
  const type = getType(report.typeId);
  const have = new Set(report.sections.map((s) => s.h.replace(/[\s:：]+$/, '').trim()));
  return type.sections.filter((s) => !have.has(s.h)).map((s) => s.h);
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
