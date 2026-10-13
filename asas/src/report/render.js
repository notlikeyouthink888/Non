/** عرض التقرير في الصفحة: الغلاف، الفهرس، الأقسام، الجداول، المعادلات، والصور. */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { imageURL } from '../core/db.js';
import { parseBlocks, inline } from './md.js';
import { bidi } from '../core/arabic.js';
import { figuresOf, figureNumbers, coverLines } from './model.js';

/** يحوّل مقاطع التنسيق الداخلي إلى عُقد. */
export function runsToNodes(text) {
  return inline(bidi(text)).map((r) => {
    if (r.b) return h('strong', r.text);
    if (r.i) return h('em', r.text);
    if (r.code) return h('code', r.text);
    if (r.ph) return h('span.ph', { title: 'معلومة تحتاج تعديلًا منك' }, r.text);
    return document.createTextNode(r.text);
  });
}

export function blocksToNodes(blocks) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'h': return h(b.level === 3 ? 'h3' : 'h4', runsToNodes(b.text));
      case 'p': return h('p', runsToNodes(b.text));
      case 'ol':
      case 'ul':
        return h(b.t, b.items.map((it) => h('li', [
          ...runsToNodes(it.text),
          it.sub?.length ? h('ul', it.sub.map((s) => h('li', runsToNodes(s)))) : null,
        ])));
      case 'table':
        return h('div.tbl-wrap', h('table', [
          h('thead', h('tr', b.head.map((c) => h('th', runsToNodes(c))))),
          h('tbody', b.rows.map((r) => h('tr', r.map((c) => h('td', runsToNodes(c)))))),
        ]));
      case 'eq': return h('div.eq', b.lines.map((l) => h('div', l)));
      case 'note': return h('div.note', runsToNodes(b.text));
      case 'pre': return h('pre.pre', b.lines.join('\n'));
      default: return null;
    }
  });
}

/** الغلاف. */
export function renderCover(report) {
  const c = coverLines(report);
  return h('div.cover', [
    c.gov.length ? h('div.gov', c.gov.map((l) => h('div', l))) : null,
    c.org.length ? h('div.org', c.org.map((l) => h('div', l))) : null,
    h('span.kind', bidi(c.kind)),
    h('h1', bidi(report.title)),
    c.by.length ? h('div.by', c.by.map((l) => h('div', bidi(l)))) : null,
    c.year ? h('div.year', c.year) : null,
  ]);
}

export function renderToc(report) {
  const secs = report.sections.filter((s) => s.h);
  if (secs.length < 3) return null;
  return h('nav.toc', [
    h('strong', 'المحتويات'),
    h('ol', report.sections.map((s, i) => (s.h ? h('li', h('a', { href: `#sec-${i}`, onclick: (e) => { e.preventDefault(); document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth' }); } }, s.h)) : null))),
  ]);
}

/**
 * يعرض صورة مخزّنة مع تعليقها ومصدرها.
 * handlers: { onReplace(fig), onRemove(fig), onSearch(fig) }
 */
export function renderFigure(fig, num, handlers = {}, { editable = true } = {}) {
  if (!fig.img) {
    if (fig.status === 'pending' || fig.status === 'searching') {
      return h('div.fig-pending', [h('div.spinner'), `يبحث عن صورة: ${fig.caption}`]);
    }
    if (!editable) return null;
    return h('div.fig-pending', [
      icon('image', 18),
      h('span.grow', `لا صورة مطابقة لـ «${fig.caption}»${fig.note ? ` — ${fig.note}` : ''}`),
      h('button.btn.sm', { type: 'button', onclick: () => handlers.onSearch?.(fig) }, 'ابحث يدويًا'),
      h('button.icon-btn', { type: 'button', 'aria-label': 'حذف', onclick: () => handlers.onRemove?.(fig) }, icon('trash', 18)),
    ]);
  }
  const img = h('img', { alt: fig.caption, loading: 'lazy', decoding: 'async' });
  imageURL(fig.img).then((u) => { if (u) img.src = u; });
  const c = fig.credit || {};
  const credit = [c.source, c.author, c.license].filter(Boolean).join(' — ');
  return h('figure.fig', { dataset: { fig: fig.id } }, [
    h('div.imgbox', [
      img,
      editable ? h('div.fig-tools', [
        h('button', { type: 'button', 'aria-label': 'استبدال الصورة', title: 'استبدال', onclick: () => handlers.onReplace?.(fig) }, icon('refresh', 18)),
        h('button', { type: 'button', 'aria-label': 'حذف الصورة', title: 'حذف', onclick: () => handlers.onRemove?.(fig) }, icon('trash', 18)),
      ]) : null,
    ]),
    h('figcaption', [h('strong', `شكل (${num}): `), fig.caption]),
    credit ? h('div.credit', `المصدر: ${credit}`) : null,
  ]);
}

/** يعرض قسمًا كاملًا مع صوره. */
export function renderSection(report, i, { live = false, editable = true, handlers = {}, numbers = null } = {}) {
  const s = report.sections[i];
  const nums = numbers || figureNumbers(report);
  const figs = figuresOf(report, i, { all: true });
  return h('section.rsec' + (live ? '.live' : ''), { id: `sec-${i}`, dataset: { i } }, [
    s.h ? h('h2', [h('span.n', `${toArabicOrdinal(i, report)}`), bidi(s.h)]) : null,
    editable && !live ? h('div.tools.no-print', [
      h('button.icon-btn', { type: 'button', 'aria-label': 'تحرير القسم', title: 'تحرير', onclick: () => handlers.onEdit?.(i) }, icon('edit', 17)),
    ]) : null,
    ...blocksToNodes(parseBlocks(s.md)),
    ...figs.map((f) => renderFigure(f, nums.get(f.id), handlers, { editable: editable && !live })),
  ]);
}

/** ترقيم الأقسام (1. 2. ...) متجاهلًا القسم التمهيدي بلا عنوان. */
function toArabicOrdinal(i, report) {
  const offset = report.sections[0] && !report.sections[0].h ? 0 : 1;
  return `${i + offset}.`;
}
