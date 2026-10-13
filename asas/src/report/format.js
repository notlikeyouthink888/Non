/**
 * تنسيق التقرير (مأخوذ من أشكال تقارير الطلبة الحقيقية): ترقيم الأقسام، الفهرس، إطار الصفحات،
 * شكل العناوين، حجم الخط، المسافة بين الأسطر، فواصل بين الأقسام، أرقام الصفحات، والترويسة.
 * لكل تقرير تنسيقه، وقيمه الافتراضية من الإعدادات.
 */

import { h, field, chipGroup, toggle, settingRow } from '../core/dom.js';
import { state } from '../core/store.js';
import { coverColor } from './covers.js';

export const FORMAT_DEFAULTS = {
  numbering: true,
  toc: true,
  border: 'none',
  borderColor: 'subject',
  heading: 'color',
  fontSize: 14,
  spacing: 1.5,
  separators: false,
  pageNumbers: true,
  header: true,
  align: 'justify',
};

export const BORDERS = [
  { value: 'none', label: 'بلا إطار' },
  { value: 'single', label: 'خط واحد' },
  { value: 'double', label: 'مزدوج' },
  { value: 'thick', label: 'سميك ورفيع' },
  { value: 'art', label: 'مزخرف' },
];
export const BORDER_COLORS = [
  { value: 'subject', label: 'لون المادة' },
  { value: 'black', label: 'أسود', hex: '#111111' },
  { value: 'navy', label: 'كحلي', hex: '#1e3a8a' },
  { value: 'green', label: 'أخضر', hex: '#15803d' },
  { value: 'maroon', label: 'خمري', hex: '#7f1d1d' },
];
export const HEADINGS = [
  { value: 'color', label: 'ملوّنة' },
  { value: 'underline', label: 'تحتها خط' },
  { value: 'plain', label: 'عريضة سوداء' },
  { value: 'band', label: 'شريط مظلّل' },
];
export const FONT_SIZES = [12, 13, 14, 16];
export const SPACINGS = [
  { value: 1, label: 'مفرد' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: '2' },
];

/** التنسيق الفعلي لتقرير: الافتراضي ← الإعدادات ← التقرير نفسه. */
export function fmtOf(report) {
  return { ...FORMAT_DEFAULTS, toc: state.exportOpts.toc !== false, ...(state.format || {}), ...(report?.format || {}) };
}

/** لون الإطار والعناوين. */
export function frameColor(report, f = fmtOf(report)) {
  if (f.borderColor === 'subject') return coverColor(report?.catId);
  return BORDER_COLORS.find((c) => c.value === f.borderColor)?.hex || '#111111';
}

/**
 * عناصر تحرير التنسيق (للإعدادات ولورقة «التنسيق» في التقرير).
 * get() يعيد كائن التنسيق الحالي، وset(patch) يحفظ التغيير.
 */
export function formatControls(get, set) {
  const box = h('div');
  const draw = () => {
    const f = { ...FORMAT_DEFAULTS, ...get() };
    const pick = (key, opts, label, hint) => field(label, chipGroup(opts, f[key], (v) => { set({ [key]: v }); draw(); }), hint);
    box.replaceChildren(
      pick('border', BORDERS, 'إطار الصفحات', 'إطار حول كل صفحات التقرير في Word وPDF، كما في كثير من تقارير الطلبة'),
      f.border !== 'none' ? pick('borderColor', BORDER_COLORS.map(({ value, label }) => ({ value, label })), 'لون الإطار') : null,
      pick('heading', HEADINGS, 'شكل العناوين'),
      pick('fontSize', FONT_SIZES.map((n) => ({ value: n, label: `${n}` })), 'حجم الخط', 'المعتاد في تقارير الجامعات العراقية 14'),
      pick('spacing', SPACINGS, 'المسافة بين الأسطر'),
      pick('align', [{ value: 'justify', label: 'ضبط الطرفين' }, { value: 'start', label: 'محاذاة لجهة البداية' }], 'محاذاة الفقرات'),
      settingRow('ترقيم الأقسام', '1. المقدمة، 2. الهدف… أو عناوين بلا أرقام', toggle(f.numbering, (v) => set({ numbering: v }))),
      settingRow('فهرس المحتويات', null, toggle(f.toc, (v) => set({ toc: v }))),
      settingRow('خط فاصل بين الأقسام', null, toggle(f.separators, (v) => set({ separators: v }))),
      settingRow('أرقام الصفحات', null, toggle(f.pageNumbers, (v) => set({ pageNumbers: v }))),
      settingRow('عنوان التقرير أعلى الصفحات', null, toggle(f.header, (v) => set({ header: v }))),
    );
  };
  draw();
  return box;
}

/** خصائص الورقة في العرض والطباعة (متغيرات CSS وسمات). */
export function paperAttrs(report) {
  const f = fmtOf(report);
  return {
    dataset: { heading: f.heading, border: f.border, sep: f.separators ? '1' : '0', align: f.align, num: f.numbering ? '1' : '0' },
    vars: { '--doc-fs': `${f.fontSize}pt`, '--doc-lh': String(Math.max(1.35, f.spacing * 1.25)), '--frame': frameColor(report, f) },
  };
}
