/**
 * أغلفة التقارير: ثمانية أنماط من بيانات واحدة (coverData)، تُعرض في التطبيق وPDF
 * بصفحة بنسب A4 وبأحجام خطوط نسبية لعرض الصفحة (cqw)، فالمعاينة المصغّرة والعرض والطباعة
 * متطابقة. نسخة Word من كل نمط في export/cover-docx.js.
 */

import { h } from '../core/dom.js';
import { bidi } from '../core/arabic.js';
import { getType } from '../data/types.js';
import { coverLines } from './model.js';

export const COVER_STYLES = [
  { id: 'classic', name: 'كلاسيكي رسمي', desc: 'الترويسة في الأعلى، والعنوان في الوسط، وبيانات الطالب في الأسفل' },
  { id: 'frame', name: 'إطار مزدوج', desc: 'الترتيب الرسمي داخل إطار مزدوج بلون المادة' },
  { id: 'letterhead', name: 'ترويسة رسمية', desc: 'الوزارة والجامعة يمينًا والشعار في الوسط والسنة يسارًا، ثم خط فاصل' },
  { id: 'table', name: 'جدول معلومات', desc: 'بيانات الطالب والتقرير في جدول منظّم تحت العنوان' },
  { id: 'band', name: 'شريط ملوّن', desc: 'شريط بلون المادة في الأعلى يحمل اسم الجامعة' },
  { id: 'side', name: 'شريط جانبي', desc: 'عمود ملوّن على اليمين بالمادة ونوع التقرير' },
  { id: 'lab', name: 'ورقة مختبر', desc: 'رقم التجربة بارز مع جدول الطالب والتواريخ' },
  { id: 'minimal', name: 'بسيط', desc: 'العنوان واسم الطالب فقط بمساحات واسعة' },
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
  const labLike = ['lab', 'field'].includes(type.id);
  const blank = '……………………';
  const stageGroup = [m.stage ? `المرحلة ${m.stage}` : '', m.group ? `الشعبة ${m.group}` : ''].filter(Boolean).join(' — ');
  // صفوف الجدول: الحقول الفارغة تبقى خطًّا منقوطًا ليُكتب باليد
  const rows = [
    ['اسم الطالب', m.author || blank],
    ['المرحلة', stageGroup || blank],
    m.subject ? ['المادة', m.subject] : null,
    labLike ? ['رقم التجربة', m.expNo || '……'] : null,
    [labLike ? 'تاريخ التجربة' : 'التاريخ', m.date || blank],
    labLike ? ['تاريخ التسليم', m.submitDate || blank] : null,
    m.org ? ['الجهة', m.org] : null,
    m.location ? ['الموقع', m.location] : null,
    ['بإشراف', m.supervisor || blank],
  ].filter(Boolean);
  return {
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
const logoEl = (d) => (d.logo ? h('img.cv-logo', { src: d.logo, alt: 'الشعار' }) : null);
const titleEl = (d) => h('h1.cv-title', bidi(d.title));
const infoTable = (d) => h('table.cv-table', h('tbody', d.rows.map(([k, v]) => h('tr', [h('th', k), h('td', bidi(v))]))));

const LAYOUTS = {
  classic: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', [lines('cv-by', d.by), d.year ? h('div.cv-year', d.year) : null]),
  ],
  letterhead: (d) => [
    h('div.cv-head', [
      h('div.cv-hs', [...d.gov, ...d.org].map((l) => h('div', bidi(l)))),
      h('div.cv-hc', logoEl(d) || h('div.cv-emblem', d.subject ? d.subject.slice(0, 1) : 'أ')),
      h('div.cv-he', [d.year ? h('div', d.year) : null, d.subject ? h('div', d.subject) : null]),
    ]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', [lines('cv-by', d.by)]),
  ],
  table: (d) => [
    h('div.cv-top', [logoEl(d), lines('cv-gov', d.gov), lines('cv-org', d.org)]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d)]),
    h('div.cv-bot', [infoTable(d), d.year ? h('div.cv-year', d.year) : null]),
  ],
  band: (d) => [
    h('div.cv-band', [logoEl(d), h('div', d.org.map((l) => h('div', bidi(l))))]),
    h('div.cv-mid', [h('div.cv-kind', bidi(d.kind)), titleEl(d), d.subject ? h('div.cv-sub', d.subject) : null]),
    h('div.cv-bot', [lines('cv-by', d.by)]),
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
      h('div.cv-bot', [lines('cv-by', d.by)]),
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
      h('div.cv-name', d.rows[0][1]),
      h('div.cv-meta', [d.org[0], d.subject, d.year].filter(Boolean).join(' • ')),
    ]),
  ],
};
LAYOUTS.frame = LAYOUTS.classic;

/** يبني الغلاف بنمطه. style يسمح بمعاينة نمط آخر دون تغيير التقرير. */
export function renderCoverHTML(report, { style } = {}) {
  const d = coverData(report);
  const s = style && COVER_BY_ID[style] ? style : d.style;
  const el = h(`div.cover.cs-${s}`, h('div.cv', LAYOUTS[s](d)));
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
