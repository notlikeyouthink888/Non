/**
 * تصدير التقرير إلى Word (.docx) باتجاه من اليمين لليسار:
 * صفحة غلاف، فهرس، عناوين، فقرات، خطوات مرقّمة، جداول، معادلات، صور مضمّنة مع مصادرها، وأرقام صفحات.
 * الترقيم يُكتب نصًّا صريحًا حتى يظهر صحيحًا في Word وWPS وLibreOffice وGoogle Docs.
 */

import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Footer, Header,
  AlignmentType, HeadingLevel, PageNumber, WidthType, ShadingType, BorderStyle, PageBreak,
} from 'docx';
import { state } from '../core/store.js';
import { getImage } from '../core/db.js';
import { getType } from '../data/types.js';
import { parseBlocks, inline } from '../report/md.js';
import { bidi } from '../core/arabic.js';
import { figuresOf, figureNumbers } from '../report/model.js';
import { hasCover } from '../report/covers.js';
import { coverSection } from './cover-docx.js';

const ACCENT = 'B45309';
const BODY_SIZE = 28; // 14pt
const HAS_AR = /[\u0600-\u06FF]/;

function fonts() {
  const cs = state.exportOpts.wordFont || 'Simplified Arabic';
  return { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs };
}

/** مقطع نصي بخصائص الاتجاه والخط الصحيحة. */
function run(text, o = {}) {
  const rtl = o.ltr ? false : true;
  return new TextRun({
    text,
    bold: o.b, boldComplexScript: o.b,
    italics: o.i, italicsComplexScript: o.i,
    size: o.size || BODY_SIZE, sizeComplexScript: o.size || BODY_SIZE,
    font: o.font ? { ascii: o.font, hAnsi: o.font, cs: o.font } : o.mono ? { ascii: 'Consolas', hAnsi: 'Consolas', cs: fonts().cs } : fonts(),
    rightToLeft: rtl,
    color: o.color,
    highlight: o.ph ? 'yellow' : undefined,
    language: { value: 'en-US', bidirectional: 'ar-IQ' },
  });
}

/** يحوّل نصًّا بتنسيق داخلي إلى مقاطع Word. */
function runs(text, base = {}) {
  return inline(bidi(text)).map((r) => {
    if (r.code) return run(r.text, { ...base, ltr: !HAS_AR.test(r.text), mono: true });
    if (r.ph) return run(r.text, { ...base, ph: true });
    return run(r.text, { ...base, b: base.b || r.b, i: r.i });
  });
}

function para(children, o = {}) {
  return new Paragraph({
    children,
    bidirectional: o.ltr ? false : true,
    alignment: o.align || AlignmentType.BOTH,
    spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 360 },
    indent: o.indent,
    heading: o.heading,
    keepNext: o.keepNext,
    shading: o.shading,
    border: o.border,
    pageBreakBefore: o.pageBreakBefore,
  });
}

function heading(text, level = 1) {
  const size = level === 1 ? 34 : level === 2 ? 30 : 28;
  return para(runs(text, { b: true, size, color: level === 1 ? ACCENT : undefined }), {
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    align: AlignmentType.START, before: level === 1 ? 320 : 200, after: 120, keepNext: true,
  });
}

function listItems(items, ordered) {
  const out = [];
  items.forEach((it, k) => {
    const marker = ordered ? `${k + 1}. ` : '• ';
    out.push(para([run(marker, { b: true, color: ordered ? ACCENT : undefined }), ...runs(it.text)], {
      align: AlignmentType.START, after: 80, indent: { start: 360, hanging: 360 },
    }));
    (it.sub || []).forEach((s) => out.push(para([run('◦ '), ...runs(s)], { align: AlignmentType.START, after: 60, indent: { start: 900, hanging: 300 } })));
  });
  return out;
}

function table(b) {
  const cell = (text, head) => new TableCell({
    children: [para(runs(text, { b: head, size: 22 }), { align: AlignmentType.CENTER, after: 40, line: 276 })],
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: true,
    rows: [
      new TableRow({ tableHeader: true, children: b.head.map((c) => cell(c, true)) }),
      ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
    ],
  });
}

function blocks(md) {
  const out = [];
  for (const b of parseBlocks(md)) {
    if (b.t === 'h') out.push(heading(b.text, b.level === 3 ? 2 : 3));
    else if (b.t === 'p') out.push(para(runs(b.text)));
    else if (b.t === 'ol' || b.t === 'ul') out.push(...listItems(b.items, b.t === 'ol'));
    else if (b.t === 'table') { out.push(table(b)); out.push(para([run('')], { after: 60 })); }
    else if (b.t === 'eq') b.lines.forEach((l) => out.push(para([run(l, { ltr: true, size: 26, font: 'Cambria Math' })], { ltr: true, align: AlignmentType.CENTER, after: 80, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' } })));
    else if (b.t === 'note') out.push(para(runs(b.text, { size: 26 }), {
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF4E0' },
      border: { right: { style: BorderStyle.SINGLE, size: 18, color: 'D97706', space: 8 } },
    }));
    else if (b.t === 'pre') out.push(para([run(b.lines.join('\n'), { ltr: true, mono: true, size: 20 })], { ltr: true, align: AlignmentType.LEFT }));
  }
  return out;
}

async function figureParas(fig, num) {
  const rec = await getImage(fig.img);
  if (!rec?.blob) return [];
  const data = await rec.blob.arrayBuffer();
  const maxW = 520;
  const maxH = 400;
  let w = rec.w || fig.w || 800;
  let hgt = rec.h || fig.h || 600;
  const k = Math.min(maxW / w, maxH / hgt, 1);
  w = Math.round(w * k);
  hgt = Math.round(hgt * k);
  const type = /png/.test(rec.blob.type) ? 'png' : 'jpg';
  const out = [
    para([new ImageRun({ type, data, transformation: { width: w, height: hgt }, altText: { name: fig.caption, description: fig.caption, title: fig.caption } })], { align: AlignmentType.CENTER, after: 60, keepNext: true }),
    para([run(`شكل (${num}): `, { b: true, size: 24 }), ...runs(fig.caption, { size: 24 })], { align: AlignmentType.CENTER, after: state.exportOpts.attribution ? 20 : 200 }),
  ];
  const c = fig.credit || {};
  const credit = [c.source, c.author, c.license].filter(Boolean).join(' — ');
  if (state.exportOpts.attribution && credit) out.push(para([run(`المصدر: ${credit}`, { size: 18, color: '777777' })], { align: AlignmentType.CENTER, after: 200 }));
  return out;
}

function tocParas(report) {
  const out = [heading('المحتويات', 1)];
  report.sections.forEach((s, i) => {
    if (s.h) out.push(para([run(`${i + 1}. `, { b: true, color: ACCENT }), run(s.h)], { align: AlignmentType.START, after: 60 }));
  });
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

export async function buildDocx(report) {
  const opts = state.exportOpts;
  const nums = figureNumbers(report);
  const withCover = hasCover(report, opts.cover !== false);
  const children = [];

  // بلا غلاف: يبدأ التقرير بعنوانه ونوعه
  if (!withCover) children.push(para(runs(report.title, { b: true, size: 36, color: ACCENT }), { align: AlignmentType.CENTER, after: 300 }));
  if (opts.toc && report.sections.filter((s) => s.h).length >= 3) children.push(...tocParas(report));

  for (let i = 0; i < report.sections.length; i++) {
    const s = report.sections[i];
    if (s.h) children.push(heading(`${i + 1}. ${s.h}`, 1));
    children.push(...blocks(s.md));
    for (const f of figuresOf(report, i)) children.push(...(await figureParas(f, nums.get(f.id))));
  }

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 22, font: fonts() })],
    })],
  });
  const header = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      children: [run(report.title, { size: 18, color: '888888' })],
    })],
  });

  const doc = new Document({
    creator: report.meta?.author || 'أساس',
    title: report.title,
    description: getType(report.typeId).name,
    styles: {
      default: {
        document: {
          run: { font: fonts(), size: BODY_SIZE, sizeComplexScript: BODY_SIZE, rightToLeft: true },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    sections: [
      // الغلاف قسم مستقل بلا ترويسة ولا ترقيم، فيبدأ ترقيم الصفحات من 1 بعده
      ...(withCover ? [coverSection(report, { run, runs, para })] : []),
      {
        properties: {
          page: {
            margin: { top: 1300, bottom: 1300, left: 1300, right: 1300, header: 600, footer: 600 },
            ...(withCover ? { pageNumbers: { start: 1 } } : {}),
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
