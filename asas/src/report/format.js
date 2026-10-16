/**
 * تنسيق التقرير (مأخوذ من أشكال تقارير الطلبة الحقيقية): ترقيم الأقسام، الفهرس، إطار الصفحات،
 * شكل العناوين، حجم الخط، المسافة بين الأسطر، فواصل بين الأقسام، أرقام الصفحات، والترويسة.
 * لكل تقرير تنسيقه، وقيمه الافتراضية من الإعدادات.
 */

import { h, field, chipGroup, toggle, settingRow } from '../core/dom.js';
import { state } from '../core/store.js';
import { reportColor } from './covers.js';

export const FORMAT_DEFAULTS = {
  numbering: true,
  numStyle: 'num',
  toc: true,
  border: 'none',
  borderColor: 'subject',
  textColor: 'black',
  heading: 'color',
  headAlign: 'start',
  fontSize: 14,
  spacing: 1.5,
  indent: false,
  margins: 'normal',
  separators: false,
  pageNumbers: true,
  header: true,
  align: 'justify',
};

/** الإطارات: [قيمة، اسم، نمط Word، سُمك Word بثُمن النقطة]. */
export const BORDERS = [
  { value: 'none', label: 'بلا إطار' },
  { value: 'single', label: 'خط واحد', word: ['SINGLE', 12] },
  { value: 'double', label: 'مزدوج', word: ['DOUBLE', 6] },
  { value: 'thick', label: 'سميك ورفيع', word: ['THICK_THIN_SMALL_GAP', 24] },
  { value: 'thinthick', label: 'رفيع وسميك', word: ['THIN_THICK_LARGE_GAP', 24] },
  { value: 'art', label: 'ثلاثي مزخرف', word: ['THIN_THICK_THIN_SMALL_GAP', 24] },
  { value: 'triple', label: 'ثلاثة خطوط', word: ['TRIPLE', 4] },
  { value: 'dashed', label: 'متقطّع', word: ['DASHED', 8] },
  { value: 'dotted', label: 'منقّط', word: ['DOTTED', 12] },
  { value: 'wave', label: 'موجي', word: ['DOUBLE_WAVE', 6] },
  { value: 'ridge', label: 'بارز', word: ['THREE_D_EMBOSS', 24] },
  { value: 'bold', label: 'سميك', word: ['THICK', 24] },
];
export const BORDER_COLORS = [
  { value: 'subject', label: 'لون الغلاف' },
  { value: 'black', label: 'أسود', hex: '#111111' },
  { value: 'navy', label: 'كحلي', hex: '#1e3a8a' },
  { value: 'blue', label: 'أزرق', hex: '#1d4ed8' },
  { value: 'teal', label: 'فيروزي', hex: '#0f766e' },
  { value: 'green', label: 'أخضر', hex: '#15803d' },
  { value: 'maroon', label: 'خمري', hex: '#7f1d1d' },
  { value: 'red', label: 'أحمر', hex: '#b91c1c' },
  { value: 'purple', label: 'بنفسجي', hex: '#6d28d9' },
  { value: 'orange', label: 'برتقالي', hex: '#c2410c' },
  { value: 'gray', label: 'رمادي', hex: '#4b5563' },
];
export const TEXT_COLORS = [
  { value: 'black', label: 'أسود', hex: '#000000' },
  { value: 'dark', label: 'رمادي داكن', hex: '#1f2937' },
  { value: 'navy', label: 'كحلي داكن', hex: '#172554' },
  { value: 'brown', label: 'بني داكن', hex: '#3b2414' },
];
export const HEADINGS = [
  { value: 'color', label: 'ملوّنة' },
  { value: 'underline', label: 'تحتها خط' },
  { value: 'plain', label: 'عريضة سوداء' },
  { value: 'band', label: 'شريط مظلّل' },
  { value: 'boxed', label: 'داخل إطار' },
  { value: 'line', label: 'خط تحت العنوان بعرض الصفحة' },
];
export const NUM_STYLES = [
  { value: 'num', label: '1. 2. 3.' },
  { value: 'ordinal', label: 'أولًا: ثانيًا:' },
  { value: 'ardigits', label: '١- ٢- ٣-' },
  { value: 'paren', label: '(1) (2)' },
  { value: 'roman', label: 'I. II. III.' },
];
export const FONT_SIZES = [12, 13, 14, 15, 16];
export const SPACINGS = [
  { value: 1, label: 'مفرد' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: '2' },
];
export const MARGINS = [
  { value: 'narrow', label: 'ضيقة', twip: 900 },
  { value: 'normal', label: 'عادية', twip: 1300 },
  { value: 'wide', label: 'واسعة', twip: 1700 },
];

const ORD_AR = ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا', 'خامسًا', 'سادسًا', 'سابعًا', 'ثامنًا', 'تاسعًا', 'عاشرًا', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];
const ORD_EN = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** رقم القسم n (يبدأ من 1) بنمط الترقيم المختار، مع ما يليه («1. » أو «أولًا: »). */
export function secNumber(n, f, en = false) {
  switch (f.numStyle) {
    case 'ordinal': return `${(en ? ORD_EN : ORD_AR)[n - 1] || n}: `;
    case 'ardigits': return en ? `${n}- ` : `${String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])}- `;
    case 'paren': return `(${n}) `;
    case 'roman': return `${ROMAN[n - 1] || n}. `;
    default: return `${n}. `;
  }
}

/** التنسيق الفعلي لتقرير: الافتراضي ← الإعدادات ← التقرير نفسه. */
export function fmtOf(report) {
  return { ...FORMAT_DEFAULTS, toc: state.exportOpts.toc !== false, ...(state.format || {}), ...(report?.format || {}) };
}

/** لون الإطار والعناوين. */
export function frameColor(report, f = fmtOf(report)) {
  if (f.borderColor === 'subject') return reportColor(report);
  return BORDER_COLORS.find((c) => c.value === f.borderColor)?.hex || '#111111';
}
export const textColor = (f) => TEXT_COLORS.find((c) => c.value === f.textColor)?.hex || '#000000';

/**
 * عناصر تحرير التنسيق (للإعدادات ولورقة «التنسيق» في التقرير).
 * التعديلات على مسودة، ولا تُطبَّق إلا بزر «حفظ التغييرات».
 * get() يعيد التنسيق الحالي، وsave(patch) يحفظه.
 */
export function formatControls(get, save, { saveText = 'حفظ التغييرات' } = {}) {
  const box = h('div.fmt-box');
  const draft = { ...FORMAT_DEFAULTS, ...get() };
  let dirty = false;
  const set = (patch) => { Object.assign(draft, patch); dirty = true; draw(); };
  const btn = h('button.btn.primary.block.mt.fmt-save', {
    type: 'button',
    onclick: () => { save({ ...draft }); dirty = false; draw(); },
  });
  const swatch = (hex) => h('span.swatch', { style: { background: hex } });
  const draw = () => {
    const f = draft;
    const pick = (key, opts, label, hint) => field(label, chipGroup(opts, f[key], (v) => set({ [key]: v })), hint);
    btn.textContent = dirty ? saveText : 'لا تغييرات غير محفوظة';
    btn.classList.toggle('ghost', !dirty);
    box.replaceChildren(
      h('h4.fmt-h', 'الإطار والألوان'),
      pick('border', BORDERS.map(({ value, label }) => ({ value, label })), 'إطار الصفحات', 'إطار حول كل صفحات التقرير في Word وPDF، كما في كثير من تقارير الطلبة'),
      field('اللون (العناوين والإطار والترقيم)', chipGroup(BORDER_COLORS.map(({ value, label, hex }) => ({ value, label: h('span.sw-l', [swatch(hex || 'linear-gradient(135deg,#b91c1c,#1d4ed8)'), label]) })), f.borderColor, (v) => set({ borderColor: v }))),
      field('لون الكتابة', chipGroup(TEXT_COLORS.map(({ value, label, hex }) => ({ value, label: h('span.sw-l', [swatch(hex), label]) })), f.textColor, (v) => set({ textColor: v }))),
      h('h4.fmt-h', 'العناوين والترقيم'),
      pick('heading', HEADINGS, 'شكل العناوين'),
      pick('headAlign', [{ value: 'start', label: 'جهة البداية' }, { value: 'center', label: 'في الوسط' }], 'مكان العناوين'),
      settingRow('ترقيم الأقسام', 'أو عناوين بلا أرقام', toggle(f.numbering, (v) => set({ numbering: v }))),
      f.numbering ? pick('numStyle', NUM_STYLES, 'شكل الترقيم') : null,
      h('h4.fmt-h', 'الصفحة والفقرات'),
      pick('fontSize', FONT_SIZES.map((n) => ({ value: n, label: `${n}` })), 'حجم الخط', 'المعتاد في تقارير الجامعات العراقية 14'),
      pick('spacing', SPACINGS, 'المسافة بين الأسطر'),
      pick('align', [{ value: 'justify', label: 'ضبط الطرفين' }, { value: 'start', label: 'محاذاة لجهة البداية' }], 'محاذاة الفقرات'),
      pick('margins', MARGINS.map(({ value, label }) => ({ value, label })), 'هوامش الصفحة'),
      settingRow('مسافة بادئة لأول سطر في الفقرة', null, toggle(f.indent, (v) => set({ indent: v }))),
      settingRow('فهرس المحتويات', null, toggle(f.toc, (v) => set({ toc: v }))),
      settingRow('خط فاصل بين الأقسام', null, toggle(f.separators, (v) => set({ separators: v }))),
      settingRow('أرقام الصفحات', null, toggle(f.pageNumbers, (v) => set({ pageNumbers: v }))),
      settingRow('عنوان التقرير أعلى الصفحات', null, toggle(f.header, (v) => set({ header: v }))),
      btn,
    );
  };
  draw();
  return box;
}

/** صورة حدود موجية بلون الإطار (للإطار «موجي» عبر border-image). */
function waveImage(hex) {
  const c = encodeURIComponent(hex);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='27' height='27' viewBox='0 0 27 27' fill='none' stroke='${c}' stroke-width='1.6'>`
    + "<path d='M0 4.5q2.25-3 4.5 0t4.5 0 4.5 0 4.5 0 4.5 0 4.5 0'/><path d='M0 22.5q2.25-3 4.5 0t4.5 0 4.5 0 4.5 0 4.5 0 4.5 0'/>"
    + "<path d='M4.5 0q-3 2.25 0 4.5t0 4.5 0 4.5 0 4.5 0 4.5 0 4.5'/><path d='M22.5 0q-3 2.25 0 4.5t0 4.5 0 4.5 0 4.5 0 4.5 0 4.5'/></svg>";
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

/** خصائص الورقة في العرض والطباعة (متغيرات CSS وسمات). */
export function paperAttrs(report) {
  const f = fmtOf(report);
  return {
    dataset: { heading: f.heading, border: f.border, sep: f.separators ? '1' : '0', align: f.align, num: f.numbering ? '1' : '0', hal: f.headAlign, indent: f.indent ? '1' : '0' },
    vars: { '--doc-fs': `${f.fontSize}pt`, '--doc-lh': String(Math.max(1.35, f.spacing * 1.25)), '--frame': frameColor(report, f), '--doc-ink': textColor(f), '--wave': waveImage(frameColor(report, f)) },
  };
}
