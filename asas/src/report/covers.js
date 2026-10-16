/**
 * أغلفة التقارير: ١٧ نمطًا من بيانات واحدة (coverData)، تُعرض في التطبيق وPDF
 * بصفحة بنسب A4 وبأحجام خطوط نسبية لعرض الصفحة (cqw)، فالمعاينة المصغّرة والعرض والطباعة
 * متطابقة. نسخة Word من كل نمط في export/cover-docx.js، وزخارف الأنماط الحديثة في cover-deco.js.
 * لون الغلاف ولونه الثاني، وما يظهر فيه من حقول، وعناوين الحقول — كلها يختارها الطالب.
 */

import { h, field, chipGroup, toggle, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { bidi } from '../core/arabic.js';
import { getType } from '../data/types.js';
import { coverLines, studentsOf, supervisorOf, labelsOf, hiddenOf, labeled, COVER_LABELS } from './model.js';
import { dateEN, TYPE_EN } from './style.js';
import { decoSVG, tint, shade } from './cover-deco.js';

export const COVER_STYLES = [
  { id: 'classic', name: 'كلاسيكي رسمي', desc: 'الترويسة في الأعلى، والعنوان في الوسط، وبيانات الطالب في الأسفل' },
  { id: 'frame', name: 'إطار مزدوج', desc: 'الترتيب الرسمي داخل إطار مزدوج بلون الغلاف' },
  { id: 'letterhead', name: 'ترويسة رسمية', desc: 'الوزارة والجامعة يمينًا والشعار في الوسط والسنة يسارًا، ثم خط فاصل' },
  { id: 'table', name: 'جدول معلومات', desc: 'بيانات الطالب والتقرير في جدول منظّم تحت العنوان' },
  { id: 'band', name: 'شريط ملوّن', desc: 'شريط بلون الغلاف في الأعلى يحمل اسم الجامعة' },
  { id: 'side', name: 'شريط جانبي', desc: 'عمود ملوّن بالمادة ونوع التقرير' },
  { id: 'lab', name: 'ورقة مختبر', desc: 'رقم التجربة بارز مع جدول الطالب والتواريخ' },
  { id: 'minimal', name: 'بسيط', desc: 'العنوان واسم الطالب فقط بمساحات واسعة' },
  { id: 'logos', name: 'شعاران', desc: 'شعار الجامعة وشعار الكلية على الجانبين والجهة بينهما، ثم العنوان مظلّلًا وأسماء الطلبة' },
  // أنماط حديثة مستوحاة من تصاميم Canva (زخارف عند حواف الصفحة بلونين)
  { id: 'royal', name: 'ملكي', desc: 'كحلي وذهبي: زاوية مثلثة وموجة سفلية بخط ذهبي، وفواصل مزخرفة', modern: true },
  { id: 'stripe', name: 'شريط مزدوج', desc: 'عمود ملوّن بطول الصفحة بجانبه خط ذهبي، واسم الجامعة بارز', modern: true },
  { id: 'panel', name: 'لوحة العنوان', desc: 'الجامعة أعلى الصفحة والعنوان داخل لوحة ملوّنة بلسان، والبيانات بخط جانبي', modern: true },
  { id: 'modern', name: 'عصري', desc: 'مثلثات متداخلة في الزاوية وعنوان كبير بخط عمودي، والبيانات في عمودين', modern: true },
  { id: 'waves', name: 'أمواج', desc: 'موجة ملوّنة في الأعلى وأخرى في الأسفل', modern: true },
  { id: 'geo', name: 'هندسي', desc: 'مثلثان قطريان في زاويتين متقابلتين مع جدول البيانات', modern: true },
  { id: 'blueprint', name: 'لوحة هندسية', desc: 'ورق مربعات وإطار مزدوج كلوحات الرسم الهندسي، والبيانات في جدول اللوحة', modern: true },
  { id: 'corners', name: 'زوايا مزخرفة', desc: 'زاوية مزدوجة بمعيّن ذهبي في كل ركن، بترتيب رسمي', modern: true },
];
export const COVER_BY_ID = Object.fromEntries(COVER_STYLES.map((c) => [c.id, c]));

/** ألوان داكنة بما يكفي لنص أبيض، لكل مادة. */
const COLORS = { strength: '#b91c1c', math: '#6d28d9', concrete: '#475569', survey: '#0369a1', fluids: '#1d4ed8' };
export function coverColor(catId) {
  return COLORS[catId] || '#9a3412';
}

/** ألوان الغلاف (كلها داكنة بما يكفي لنص أبيض فوقها)، ويمكن اختيار أي لون آخر. */
export const COVER_COLORS = [
  { value: 'subject', label: 'لون المادة' },
  { value: 'navy', label: 'كحلي', hex: '#1e3a8a' },
  { value: 'blue', label: 'أزرق', hex: '#1d4ed8' },
  { value: 'sky', label: 'سماوي', hex: '#0369a1' },
  { value: 'teal', label: 'فيروزي', hex: '#0f766e' },
  { value: 'green', label: 'أخضر', hex: '#15803d' },
  { value: 'olive', label: 'زيتوني', hex: '#4d7c0f' },
  { value: 'maroon', label: 'خمري', hex: '#7f1d1d' },
  { value: 'red', label: 'أحمر', hex: '#b91c1c' },
  { value: 'rose', label: 'وردي غامق', hex: '#be123c' },
  { value: 'purple', label: 'بنفسجي', hex: '#6d28d9' },
  { value: 'indigo', label: 'نيلي', hex: '#4338ca' },
  { value: 'brown', label: 'بني', hex: '#7c2d12' },
  { value: 'orange', label: 'برتقالي', hex: '#c2410c' },
  { value: 'gold', label: 'ذهبي', hex: '#a16207' },
  { value: 'slate', label: 'رمادي', hex: '#374151' },
  { value: 'black', label: 'أسود', hex: '#111111' },
];
/** اللون الثاني (للخطوط والزخارف في الأنماط الحديثة). */
export const COVER_ACCENTS = [
  { value: 'gold', label: 'ذهبي', hex: '#c0912f' },
  { value: 'same', label: 'نفس اللون' },
  { value: 'light', label: 'فاتح منه' },
  { value: 'silver', label: 'فضي', hex: '#94a3b8' },
  { value: 'orange', label: 'برتقالي', hex: '#ea580c' },
  { value: 'sky', label: 'سماوي', hex: '#0ea5e9' },
  { value: 'green', label: 'أخضر', hex: '#16a34a' },
  { value: 'red', label: 'أحمر', hex: '#dc2626' },
  { value: 'black', label: 'أسود', hex: '#111111' },
];
const HEX = /^#[0-9a-f]{6}$/i;

/** لون الغلاف الفعلي لتقرير (أو لبياناته وحدها مع المادة). */
export function coverColorOf(meta = {}, catId = null) {
  const v = meta.coverColor;
  if (HEX.test(v || '')) return v.toLowerCase();
  return COVER_COLORS.find((c) => c.value === v)?.hex || coverColor(catId);
}
export const reportColor = (report) => coverColorOf(report?.meta || {}, report?.catId);

export function coverAccentOf(meta = {}, main = '#1e3a8a') {
  const v = meta.coverAccent || 'gold';
  if (HEX.test(v)) return v.toLowerCase();
  if (v === 'same') return main;
  if (v === 'light') return tint(main, 0.45);
  return COVER_ACCENTS.find((c) => c.value === v)?.hex || '#c0912f';
}

/** حقول الغلاف التي يمكن إخفاؤها. */
export const COVER_FIELDS = [
  { key: 'ministry', label: 'جمهورية العراق — وزارة التعليم العالي' },
  { key: 'university', label: 'اسم الجامعة' },
  { key: 'college', label: 'الكلية' },
  { key: 'department', label: 'القسم' },
  { key: 'logo', label: 'الشعارات' },
  { key: 'kind', label: 'نوع التقرير (تقرير مختبر …)' },
  { key: 'subject', label: 'اسم المادة (الرياضيات، الخرسانة…)' },
  { key: 'expNo', label: 'رقم التجربة' },
  { key: 'students', label: 'اسم الطالب أو أسماء الطلبة' },
  { key: 'stage', label: 'المرحلة والشعبة' },
  { key: 'supervisor', label: 'المشرف' },
  { key: 'date', label: 'التواريخ' },
  { key: 'year', label: 'السنة الدراسية' },
];
/** عناوين الحقول القابلة للتغيير أو الحذف. */
export const LABEL_FIELDS = ['student', 'students', 'sup', 'stage', 'subject', 'exp', 'date', 'expDate', 'submit', 'year'];

/** هل للتقرير صفحة غلاف؟ (التقارير القديمة بلا الخيار تتبع إعداد التصدير القديم). */
export function hasCover(report, fallback = true) {
  const v = report.options?.cover;
  return v === undefined ? fallback : v !== false;
}

/** كل ما يحتاجه أي نمط غلاف. */
export function coverData(report) {
  const m = report.meta || {};
  const type = getType(report.typeId);
  const L = coverLines(report);
  const en = L.en;
  const hide = hiddenOf(m);
  const T = labelsOf(m, en);
  const labLike = ['lab', 'field'].includes(type.id);
  const blank = '……………………';
  const students = L.students;
  const sup = hide.supervisor ? '' : supervisorOf(m);
  const stageGroup = hide.stage ? '' : L.by.find((x) => /المرحلة|الشعبة|Stage|Group/.test(x)) || '';
  const date = hide.date ? '' : (en ? dateEN(m.date) : m.date) || '';
  const submit = hide.date ? '' : (en ? dateEN(m.submitDate) : m.submitDate) || '';
  const subject = L.subject;
  const expNo = hide.expNo ? '' : m.expNo || '';
  const studentLabel = students.length > 1 ? (en ? T.students : 'إعداد') : T.student;
  // صفوف الجدول: الحقول الفارغة تبقى خطًّا منقوطًا ليُكتب باليد، والمخفية لا تظهر
  const rows = [
    hide.students ? null : [studentLabel, students.length ? students.join(en ? ', ' : '، ') : blank],
    hide.stage ? null : [T.stage, stageGroup || blank],
    subject ? [T.subject, subject] : null,
    labLike && !hide.expNo ? [T.exp, m.expNo || '……'] : null,
    hide.date ? null : [labLike ? T.expDate : T.date, date || blank],
    labLike && !hide.date ? [T.submit, submit || blank] : null,
    m.org ? [labelsOf(m, en).org, m.org] : null,
    m.location ? [labelsOf(m, en).loc, m.location] : null,
    hide.supervisor ? null : [T.sup, sup || blank],
  ].filter(Boolean);
  // أزواج «عنوان: قيمة» للبيانات المملوءة فقط (للأنماط الحديثة)
  const pairs = [
    students.length === 1 ? [T.student, students[0]] : null,
    stageGroup ? ['', stageGroup] : null,
    sup ? [T.sup, sup] : null,
    m.org ? [labelsOf(m, en).org, m.org] : null,
    m.location ? [labelsOf(m, en).loc, m.location] : null,
    date ? [labLike ? T.expDate : T.date, date] : null,
    labLike && submit ? [T.submit, submit] : null,
  ].filter(Boolean);
  const color = coverColorOf(m, report.catId);
  return {
    en,
    students,
    studentsHead: T.students ? `${T.students}:` : '',
    name: students.join(en ? ', ' : '، '),
    sup,
    supLabel: T.sup,
    logo: hide.logo ? '' : m.logo || '',
    logo2: hide.logo ? '' : m.logo2 || '',
    style: COVER_BY_ID[m.coverStyle] ? m.coverStyle : 'classic',
    gov: L.gov,
    org: L.org,
    kind: L.kind,
    by: L.by,
    year: L.year,
    title: report.title,
    subject,
    typeName: en ? TYPE_EN[type.id] || 'Report' : type.short || type.name,
    expWord: en ? 'Experiment No.' : 'التجربة رقم',
    expNo,
    hideExp: !!hide.expNo,
    labLike,
    rows,
    pairs,
    color,
    accent: coverAccentOf(m, color),
  };
}

const lines = (cls, arr) => (arr.length ? h(`div.${cls}`, arr.map((l) => h('div', bidi(l)))) : null);
/** قائمة الطلبة حين يكونون أكثر من واحد (عمودان إن زادوا على أربعة). */
const studentsEl = (d) => (d.students.length > 1
  ? h('div.cv-students', [d.studentsHead ? h('div.cv-sh', d.studentsHead) : null, h('ol' + (d.students.length > 4 ? '.two' : ''), d.students.map((n) => h('li', bidi(n))))])
  : null);
const byEl = (d) => [lines('cv-by', d.by), studentsEl(d)];
const logoEl = (d) => (d.logo ? h('img.cv-logo', { src: d.logo, alt: 'الشعار' }) : null);
const titleEl = (d) => h('h1.cv-title', bidi(d.title));
const kindEl = (d) => (d.kind ? h('div.cv-kind', bidi(d.kind)) : null);
const yearEl = (d) => (d.year ? h('div.cv-year', bidi(d.year)) : null);
const infoTable = (d) => (d.rows.length ? h('table.cv-table', h('tbody', d.rows.map(([k, v]) => h('tr', [h('th', k), h('td', bidi(v))])))) : null);
/** بيانات الطالب أسطرًا بعنوان عريض (الأنماط الحديثة). */
const infoList = (d, cls = '') => [
  d.pairs.length ? h(`div.cv-info${cls}`, d.pairs.map(([k, v]) => h('div', [k ? h('b', `${k}: `) : null, bidi(v)]))) : null,
  studentsEl(d),
];
/** فاصل مزخرف: خط — معيّن — خط. */
const orn = () => h('div.cv-orn', [h('i'), h('b'), h('i')]);

const LAYOUTS = {
  classic: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [kindEl(d), titleEl(d)]),
    h('div.cv-bot', [...byEl(d), yearEl(d)]),
  ],
  letterhead: (d) => [
    h('div.cv-head', [
      h('div.cv-hs', [...d.gov, ...d.org].map((l) => h('div', bidi(l)))),
      h('div.cv-hc', logoEl(d) || h('div.cv-emblem', (d.subject || d.title || 'أ').slice(0, 1))),
      h('div.cv-he', [d.year ? h('div', d.year) : null, d.subject ? h('div', d.subject) : null]),
    ]),
    h('div.cv-mid', [kindEl(d), titleEl(d)]),
    h('div.cv-bot', byEl(d)),
  ],
  table: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [kindEl(d), titleEl(d)]),
    h('div.cv-bot', [infoTable(d), yearEl(d)]),
  ],
  band: (d) => [
    h('div.cv-band', [logoEl(d), h('div', d.org.map((l) => h('div', bidi(l))))]),
    h('div.cv-mid', [kindEl(d), titleEl(d), d.subject ? h('div.cv-sub', d.subject) : null]),
    h('div.cv-bot', byEl(d)),
    h('div.cv-foot', [d.gov.length ? h('span', d.gov.join(' — ')) : null, d.year ? h('span', d.year) : null]),
  ],
  side: (d) => [
    h('div.cv-side', [
      h('div.cv-side-top', [d.subject ? h('div.cv-side-sub', d.subject) : null, h('div.cv-side-kind', d.typeName)]),
      d.year ? h('div.cv-side-year', d.year) : null,
    ]),
    h('div.cv-main', [
      h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
      h('div.cv-mid', [kindEl(d), titleEl(d)]),
      h('div.cv-bot', byEl(d)),
    ]),
  ],
  lab: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-org', d.org)]),
    h('div.cv-mid', [
      h('div.cv-expno', [h('span', d.labLike && !d.hideExp ? d.expWord : d.typeName), d.labLike && !d.hideExp ? h('strong', d.expNo || '…') : null]),
      titleEl(d),
      d.subject ? h('div.cv-sub', d.subject) : null,
    ]),
    h('div.cv-bot', [infoTable(d), yearEl(d)]),
  ],
  minimal: (d) => [
    h('div.cv-mid', [
      titleEl(d),
      h('div.cv-rule'),
      d.name ? h('div.cv-name', bidi(d.name)) : null,
      h('div.cv-meta', [d.org[0], d.subject, d.year].filter(Boolean).join(' • ')),
    ]),
  ],
  logos: (d) => [
    h('div.cv-logos', [
      d.logo ? h('img.cv-logo', { src: d.logo, alt: '' }) : h('span.cv-logo-ph'),
      h('div.cv-org2', [...d.gov, ...d.org].map((l) => h('div', bidi(l)))),
      d.logo2 ? h('img.cv-logo', { src: d.logo2, alt: '' }) : h('span.cv-logo-ph'),
    ]),
    h('div.cv-mid', [kindEl(d), h('h1.cv-title.cv-hl', bidi(d.title))]),
    h('div.cv-bot', [
      d.sup ? h('div.cv-sup', [d.supLabel ? h('strong', `${d.supLabel}: `) : null, bidi(d.sup)]) : null,
      d.students.length > 1 ? studentsEl(d) : lines('cv-by', d.by.filter((x) => !d.sup || !x.startsWith(d.supLabel ? `${d.supLabel}:` : d.sup))),
      yearEl(d),
    ]),
  ],

  /* ── الأنماط الحديثة ── */
  royal: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    orn(),
    h('div.cv-mid', [kindEl(d), h('div.cv-bar'), titleEl(d)]),
    h('div.cv-bot', [...infoList(d), yearEl(d)]),
  ],
  stripe: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), d.org[0] ? h('div.cv-uni', bidi(d.org[0])) : null, d.org.length > 1 ? orn() : null, lines('cv-org', d.org.slice(1))]),
    h('div.cv-mid', [kindEl(d), orn(), titleEl(d)]),
    h('div.cv-bot', [...infoList(d), yearEl(d)]),
  ],
  panel: (d) => [
    h('div.cv-head2', [h('div.cv-hs', [lines('cv-gov', d.gov), lines('cv-org', d.org)]), logoEl(d)]),
    h('div.cv-panel', [d.kind ? h('div.cv-tab', bidi(d.kind)) : null, titleEl(d), d.subject && !d.kind ? h('div.cv-sub', d.subject) : null]),
    h('div.cv-bot', [...infoList(d, '.cv-barred'), yearEl(d)]),
  ],
  modern: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [h('div.cv-tblock', titleEl(d)), kindEl(d), h('div.cv-bar')]),
    h('div.cv-bot', [d.pairs.length ? h('table.cv-grid', h('tbody', d.pairs.map(([k, v]) => h('tr', [h('th', k || ''), h('td', bidi(v))])))) : null, studentsEl(d), yearEl(d)]),
  ],
  waves: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [kindEl(d), titleEl(d), d.subject && !d.kind ? h('div.cv-sub', d.subject) : null]),
    h('div.cv-bot', [...infoList(d), yearEl(d)]),
  ],
  geo: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [kindEl(d), titleEl(d)]),
    h('div.cv-bot', [infoTable(d), yearEl(d)]),
  ],
  blueprint: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [kindEl(d), h('div.cv-tbox', titleEl(d))]),
    h('div.cv-bot', [infoTable(d), yearEl(d)]),
  ],
  corners: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [orn(), kindEl(d), titleEl(d), orn()]),
    h('div.cv-bot', [...byEl(d), yearEl(d)]),
  ],
};
LAYOUTS.frame = LAYOUTS.classic;

/** يبني الغلاف بنمطه. style يسمح بمعاينة نمط آخر دون تغيير التقرير. */
export function renderCoverHTML(report, { style } = {}) {
  const d = coverData(report);
  const s = style && COVER_BY_ID[style] ? style : d.style;
  const svg = decoSVG(s, { color: d.color, accent: d.accent, rtl: !d.en });
  const el = h(`div.cover.cs-${s}`, { dir: d.en ? 'ltr' : 'rtl', lang: d.en ? 'en' : 'ar' }, [
    svg ? h('div.cv-deco', { html: svg, 'aria-hidden': 'true' }) : null,
    h('div.cv', LAYOUTS[s](d)),
  ]);
  // المتغيرات المخصّصة لا تُضبط بإسناد خاصية عادية
  el.style.setProperty('--cc', d.color);
  el.style.setProperty('--ca', d.accent);
  el.style.setProperty('--ca2', shade(d.accent, 0.22));
  return el;
}

/** رأس مختصر للتقرير حين لا غلاف له. */
export function renderNoCover(report) {
  const d = coverData(report);
  return h('div.cover-off', [kindEl(d), h('h1', bidi(report.title)), d.by.length ? h('div.muted', bidi(d.by.slice(0, 2).join(' — '))) : null]);
}

/**
 * شبكة اختيار نمط الغلاف بمعاينات حيّة لبيانات التقرير نفسه.
 * getReport يعيد تقريرًا (أو شكله) بالبيانات الحالية.
 */
export function coverPicker(getReport, value, onPick) {
  const grid = h('div.cover-picker');
  const draw = (cur) => {
    const r = getReport();
    grid.replaceChildren(...COVER_STYLES.map((c) => h('button.cp' + (c.id === cur ? '.on' : ''), {
      type: 'button', title: c.desc, 'aria-pressed': c.id === cur ? 'true' : 'false', dataset: { id: c.id },
      onclick: () => { draw(c.id); onPick(c.id); },
    }, [h('div.cp-page', renderCoverHTML(r, { style: c.id })), h('span.cp-name', [c.name, c.modern ? h('span.cp-new', 'جديد') : null])])));
  };
  draw(value);
  grid.refresh = () => draw(grid.querySelector('.cp.on')?.dataset.id || value);
  return grid;
}

/**
 * لون الغلاف ولونه الثاني، وما يظهر فيه، وعناوين الحقول.
 * m بيانات الغلاف (تقرير أو إعدادات): يُغيَّر بإسناد مفاتيح أعلى المستوى فقط (coverColor،
 * coverAccent، hide، labels، ministry) حتى يعمل مع كائن الإعدادات المحفوظ تلقائيًا.
 * onChange يُستدعى بعد كل تغيير (لتحديث المعاينات).
 */
export function coverDesign(m, onChange = () => {}) {
  const box = h('div.cv-design');
  const open = { fields: false, labels: false }; // تبقى الأقسام مفتوحة بعد كل تغيير
  const fold = (key, cls, children) => h(`details.fold.${cls}`, { open: open[key], ontoggle: (e) => { open[key] = e.target.open; } }, children);
  const set = (k, v) => { m[k] = v; onChange(); draw(); };
  const swatch = (bg) => h('span.swatch', { style: { background: bg } });
  const draw = () => {
    const main = coverColorOf(m, null);
    const custom = HEX.test(m.coverColor || '');
    const colorIn = h('input.color-in', { type: 'color', value: custom ? m.coverColor : main, title: 'لون آخر', oninput: (e) => { m.coverColor = e.target.value; onChange(); }, onchange: () => draw() });
    const hide = hiddenOf(m);
    const labels = m.labels || {};
    const setHide = (k, hidden) => {
      if (k === 'ministry') { m.ministry = !hidden; const { ministry, ...rest } = m.hide || {}; m.hide = rest; } else m.hide = { ...(m.hide || {}), [k]: hidden };
      onChange(); draw();
    };
    const setLabel = (k, v) => {
      const next = { ...(m.labels || {}) };
      if (v === undefined) delete next[k]; else next[k] = v;
      m.labels = next;
      onChange();
    };
    box.replaceChildren(
      field('لون الغلاف', h('div', [
        chipGroup(COVER_COLORS.map(({ value, label, hex }) => ({ value, label: h('span.sw-l', [swatch(hex || 'linear-gradient(135deg,#b91c1c,#6d28d9,#0369a1)'), label]) })), custom ? '' : (m.coverColor || 'subject'), (v) => set('coverColor', v)),
        h('label.row.color-row', [colorIn, h('span', custom ? `لون مخصّص ${m.coverColor}` : 'أو اختر أي لون آخر')]),
      ]), 'يتغيّر لون الأشرطة والعناوين والإطار في الغلاف (وPDF وWord)، و«لون الغلاف» في التنسيق يتبعه.'),
      field('اللون الثاني (للخطوط والزخارف)', chipGroup(COVER_ACCENTS.map(({ value, label, hex }) => ({ value, label: h('span.sw-l', [swatch(hex || (value === 'same' ? main : tint(main, 0.45))), label]) })), m.coverAccent || 'gold', (v) => set('coverAccent', v)), 'يظهر في الأنماط الحديثة: ملكي، شريط مزدوج، لوحة العنوان، عصري، أمواج، هندسي، زوايا مزخرفة.'),
      fold('fields', 'cv-fields', [
        h('summary', [icon('eye', 18), 'ما يظهر في الغلاف']),
        h('p.hint', 'أخفِ أي شيء لا تريده في الغلاف — مثل اسم المادة أو ترويسة الوزارة أو نوع التقرير.'),
        ...COVER_FIELDS.map((f) => settingRow(f.label, null, toggle(!hide[f.key], (v) => setHide(f.key, !v)))),
      ]),
      fold('labels', 'cv-labels', [
        h('summary', [icon('edit', 18), 'عناوين الحقول (مثل «اسم الطالب» أو Student)']),
        h('p.hint', 'غيّر العنوان كما تريد، أو أطفئه ليظهر الاسم وحده بلا «Student:». الفارغ يعني العنوان الافتراضي.'),
        ...LABEL_FIELDS.map((k) => {
          const off = labels[k] === '';
          const inp = h('input', {
            value: off ? '' : labels[k] || '', disabled: off, placeholder: `${COVER_LABELS.ar[k]} / ${COVER_LABELS.en[k]}`, dataset: { label: k },
            oninput: (e) => setLabel(k, e.target.value.trim() ? e.target.value : undefined),
          });
          return h('div.label-row', [inp, toggle(!off, (v) => { setLabel(k, v ? undefined : ''); draw(); })]);
        }),
      ]),
    );
  };
  draw();
  return box;
}

/** يختار صورة شعار من الجهاز ويصغّرها (حتى 360 بكسل) مع الحفاظ على الشفافية. */
export function pickLogo() {
  return new Promise((resolve, reject) => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    inp.onchange = async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) { resolve(null); return; }
      try {
        const url = URL.createObjectURL(f);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ src: c.toDataURL('image/png'), ar: c.height / c.width });
      } catch (err) { reject(err); }
    };
    document.body.append(inp);
    inp.click();
  });
}

/* ── حقول مشتركة لبيانات الغلاف (صفحة الإنشاء وتعديل الغلاف) ── */

export const SUP_TITLES = ['م.م', 'م.', 'م.د', 'أ.م', 'أ.م.د', 'أ.د'];

/** أسماء طلبة المجموعة ولقب المشرف. m كائن البيانات نفسه (يُعدَّل مباشرة). */
export function peopleFields(m) {
  return [
    field('أسماء طلبة المجموعة (اختياري)', h('textarea', {
      rows: 3, value: m.students || '', placeholder: 'اسم في كل سطر — اتركه فارغًا لتقرير فردي',
      oninput: (e) => { m.students = e.target.value; },
    }), 'لتقرير جماعي: تظهر في الغلاف قائمة «إعداد الطلاب» مرقّمة كما في تقارير المجموعات.'),
    field('لقب المشرف', chipGroup([{ value: '', label: 'بلا' }, ...SUP_TITLES.map((t) => ({ value: t, label: t }))], m.supTitle || '', (v) => { m.supTitle = v; })),
  ];
}

/** شعار الجامعة وشعار الكلية (الثاني يظهر في نمط «شعاران»). */
export function logosRow(m, redraw, onError) {
  const one = (key, label) => [
    m[key] ? h('img', { src: m[key], alt: label }) : null,
    h('button.btn.sm', {
      type: 'button',
      onclick: async () => {
        try { const l = await pickLogo(); if (l) { m[key] = l.src; m[`${key}AR`] = l.ar; redraw(); } } catch { onError?.(); }
      },
    }, [icon('image', 15), m[key] ? `تغيير ${label}` : `${label} (اختياري)`]),
    m[key] ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { m[key] = ''; redraw(); } }, 'إزالة') : null,
  ];
  return h('div.logo-row.mb', [...one('logo', 'شعار الجامعة'), ...one('logo2', 'شعار الكلية')]);
}
