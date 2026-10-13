/**
 * أغلفة التقارير: ثمانية أنماط من بيانات واحدة (coverData)، تُعرض في التطبيق وPDF
 * بصفحة بنسب A4 وبأحجام خطوط نسبية لعرض الصفحة (cqw)، فالمعاينة المصغّرة والعرض والطباعة
 * متطابقة. نسخة Word من كل نمط في export/cover-docx.js.
 */

import { h, field, chipGroup } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { bidi } from '../core/arabic.js';
import { getType } from '../data/types.js';
import { coverLines, studentsOf, supervisorOf } from './model.js';
import { dateEN } from './style.js';

export const COVER_STYLES = [
  { id: 'classic', name: 'كلاسيكي رسمي', desc: 'الترويسة في الأعلى، والعنوان في الوسط، وبيانات الطالب في الأسفل' },
  { id: 'frame', name: 'إطار مزدوج', desc: 'الترتيب الرسمي داخل إطار مزدوج بلون المادة' },
  { id: 'letterhead', name: 'ترويسة رسمية', desc: 'الوزارة والجامعة يمينًا والشعار في الوسط والسنة يسارًا، ثم خط فاصل' },
  { id: 'table', name: 'جدول معلومات', desc: 'بيانات الطالب والتقرير في جدول منظّم تحت العنوان' },
  { id: 'band', name: 'شريط ملوّن', desc: 'شريط بلون المادة في الأعلى يحمل اسم الجامعة' },
  { id: 'side', name: 'شريط جانبي', desc: 'عمود ملوّن على اليمين بالمادة ونوع التقرير' },
  { id: 'lab', name: 'ورقة مختبر', desc: 'رقم التجربة بارز مع جدول الطالب والتواريخ' },
  { id: 'minimal', name: 'بسيط', desc: 'العنوان واسم الطالب فقط بمساحات واسعة' },
  { id: 'logos', name: 'شعاران', desc: 'شعار الجامعة وشعار الكلية على الجانبين والجهة بينهما، ثم العنوان مظلّلًا وأسماء الطلبة' },
];
export const COVER_BY_ID = Object.fromEntries(COVER_STYLES.map((c) => [c.id, c]));

/** ألوان داكنة بما يكفي لنص أبيض، لكل مادة. */
const COLORS = { strength: '#b91c1c', math: '#6d28d9', concrete: '#475569', survey: '#0369a1', fluids: '#1d4ed8' };
export function coverColor(catId) {
  return COLORS[catId] || '#9a3412';
}

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
  const labLike = ['lab', 'field'].includes(type.id);
  const blank = '……………………';
  const students = studentsOf(m);
  const sup = supervisorOf(m);
  const stageGroup = L.by.find((x) => /المرحلة|الشعبة|Stage|Group/.test(x)) || '';
  const T = en
    ? { st: students.length > 1 ? 'Prepared by' : 'Student', stage: 'Stage', subject: 'Subject', exp: 'Experiment No.', expDate: 'Date of Experiment', date: 'Date', submit: 'Date of Submission', org: 'Organization', loc: 'Location', sup: 'Supervised by', studentsHead: 'Prepared by:' }
    : { st: students.length > 1 ? 'إعداد' : 'اسم الطالب', stage: 'المرحلة', subject: 'المادة', exp: 'رقم التجربة', expDate: 'تاريخ التجربة', date: 'التاريخ', submit: 'تاريخ التسليم', org: 'الجهة', loc: 'الموقع', sup: 'بإشراف', studentsHead: 'إعداد الطلاب:' };
  const subject = L.kind.includes(' — ') && en ? L.kind.split(' — ').pop() : m.subject;
  // صفوف الجدول: الحقول الفارغة تبقى خطًّا منقوطًا ليُكتب باليد
  const rows = [
    [T.st, students.length ? students.join(en ? ', ' : '، ') : blank],
    [T.stage, stageGroup || blank],
    subject && !en ? [T.subject, subject] : null,
    labLike ? [T.exp, m.expNo || '……'] : null,
    [labLike ? T.expDate : T.date, (en ? dateEN(m.date) : m.date) || blank],
    labLike ? [T.submit, (en ? dateEN(m.submitDate) : m.submitDate) || blank] : null,
    m.org ? [T.org, m.org] : null,
    m.location ? [T.loc, m.location] : null,
    [T.sup, sup || blank],
  ].filter(Boolean);
  return {
    en,
    students,
    studentsHead: T.studentsHead,
    sup,
    supLabel: T.sup,
    logo2: m.logo2 || '',
    style: COVER_BY_ID[m.coverStyle] ? m.coverStyle : 'classic',
    gov: L.gov,
    org: L.org,
    kind: L.kind,
    by: L.by,
    year: L.year,
    title: report.title,
    subject: m.subject || '',
    typeName: type.short || type.name,
    expNo: m.expNo || '',
    labLike,
    rows,
    color: coverColor(report.catId),
    logo: m.logo || '',
  };
}

const lines = (cls, arr) => (arr.length ? h(`div.${cls}`, arr.map((l) => h('div', bidi(l)))) : null);
/** قائمة الطلبة حين يكونون أكثر من واحد (عمودان إن زادوا على أربعة). */
const studentsEl = (d) => (d.students.length > 1
  ? h('div.cv-students', [h('div.cv-sh', d.studentsHead), h('ol' + (d.students.length > 4 ? '.two' : ''), d.students.map((n) => h('li', bidi(n))))])
  : null);
const byEl = (d) => [lines('cv-by', d.by), studentsEl(d)];
const logoEl = (d) => (d.logo ? h('img.cv-logo', { src: d.logo, alt: 'الشعار' }) : null);
const titleEl = (d) => h('h1.cv-title', bidi(d.title));
const infoTable = (d) => h('table.cv-table', h('tbody', d.rows.map(([k, v]) => h('tr', [h('th', k), h('td', bidi(v))]))));

const LAYOUTS = {
  classic: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', [...byEl(d), d.year ? h('div.cv-year', d.year) : null]),
  ],
  letterhead: (d) => [
    h('div.cv-head', [
      h('div.cv-hs', [...d.gov, ...d.org].map((l) => h('div', bidi(l)))),
      h('div.cv-hc', logoEl(d) || h('div.cv-emblem', d.subject ? d.subject.slice(0, 1) : 'أ')),
      h('div.cv-he', [d.year ? h('div', d.year) : null, d.subject ? h('div', d.subject) : null]),
    ]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', byEl(d)),
  ],
  table: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', [infoTable(d), d.year ? h('div.cv-year', d.year) : null]),
  ],
  band: (d) => [
    h('div.cv-band', [logoEl(d), h('div', d.org.map((l) => h('div', bidi(l))))]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d), d.subject ? h('div.cv-sub', d.subject) : null]),
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
      h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
      h('div.cv-bot', byEl(d)),
    ]),
  ],
  lab: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-org', d.org)]),
    h('div.cv-mid', [
      h('div.cv-expno', [h('span', d.labLike ? 'التجربة رقم' : d.typeName), d.labLike ? h('strong', d.expNo || '…') : null]),
      titleEl(d),
      d.subject ? h('div.cv-sub', d.subject) : null,
    ]),
    h('div.cv-bot', [infoTable(d), d.year ? h('div.cv-year', d.year) : null]),
  ],
  minimal: (d) => [
    h('div.cv-mid', [
      titleEl(d),
      h('div.cv-rule'),
      h('div.cv-name', bidi(d.rows[0][1])),
      h('div.cv-meta', [d.org[0], d.subject, d.year].filter(Boolean).join(' • ')),
    ]),
  ],
};
LAYOUTS.logos = (d) => [
  h('div.cv-logos', [
    d.logo ? h('img.cv-logo', { src: d.logo, alt: '' }) : h('span.cv-logo-ph'),
    h('div.cv-org2', [...d.gov, ...d.org].map((l) => h('div', bidi(l)))),
    d.logo2 ? h('img.cv-logo', { src: d.logo2, alt: '' }) : h('span.cv-logo-ph'),
  ]),
  h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), h('h1.cv-title.cv-hl', bidi(d.title))]),
  h('div.cv-bot', [
    d.sup ? h('div.cv-sup', [h('strong', `${d.supLabel}: `), bidi(d.sup)]) : null,
    d.students.length > 1 ? studentsEl(d) : lines('cv-by', d.by.filter((x) => !x.startsWith(d.supLabel))),
    d.year ? h('div.cv-year', d.year) : null,
  ]),
];
LAYOUTS.frame = LAYOUTS.classic;

/** يبني الغلاف بنمطه. style يسمح بمعاينة نمط آخر دون تغيير التقرير. */
export function renderCoverHTML(report, { style } = {}) {
  const d = coverData(report);
  const s = style && COVER_BY_ID[style] ? style : d.style;
  const el = h(`div.cover.cs-${s}`, { dir: d.en ? 'ltr' : 'rtl', lang: d.en ? 'en' : 'ar' }, h('div.cv', LAYOUTS[s](d)));
  el.style.setProperty('--cc', d.color); // المتغيرات المخصّصة لا تُضبط بإسناد خاصية عادية
  return el;
}

/** رأس مختصر للتقرير حين لا غلاف له. */
export function renderNoCover(report) {
  const d = coverData(report);
  return h('div.cover-off', [h('div.cv-kind', bidi(d.kind)), h('h1', bidi(report.title)), d.by.length ? h('div.muted', bidi(d.by.slice(0, 2).join(' — '))) : null]);
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
    }, [h('div.cp-page', renderCoverHTML(r, { style: c.id })), h('span.cp-name', c.name)])));
  };
  draw(value);
  grid.refresh = () => draw(grid.querySelector('.cp.on')?.dataset.id || value);
  return grid;
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
