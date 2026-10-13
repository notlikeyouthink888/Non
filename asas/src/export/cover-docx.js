/**
 * نسخة Word من أنماط الغلاف الثمانية (report/covers.js): كل غلاف في قسم مستقل من المستند
 * بلا ترويسة ولا ترقيم، فيبدأ ترقيم الصفحات من 1 بعده. الإطار المزدوج حدود صفحة حقيقية،
 * والشريطان الملوّنان خلايا جداول مظلّلة، فتظهر الأغلفة كما هي في Word وWPS وLibreOffice.
 */

import {
  Paragraph, ImageRun, Table, TableRow, TableCell, AlignmentType, WidthType, ShadingType,
  BorderStyle, TableBorders, HeightRule, VerticalAlignTable, PageBorderDisplay, PageBorderOffsetFrom,
} from 'docx';
import { coverData } from '../report/covers.js';

const hex = (c) => String(c || '#9a3412').replace('#', '').toUpperCase();
/** يمزج اللون مع الأبيض (لخلايا عناوين الجدول). */
function tint(c, k) {
  const n = parseInt(hex(c), 16);
  const mix = (v) => Math.round(v * k + 255 * (1 - k)).toString(16).padStart(2, '0');
  return (mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255)).toUpperCase();
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const cellNoBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function logoRun(d, width = 95) {
  if (!d.logo) return null;
  const m = String(d.logo).match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  const ar = Number(d.logoAR) > 0 ? Number(d.logoAR) : 1;
  return new ImageRun({ type: m[1] === 'png' ? 'png' : 'jpg', data: bytes, transformation: { width, height: Math.round(width * ar) }, altText: { name: 'logo', description: 'شعار', title: 'شعار' } });
}

/**
 * يبني قسم الغلاف.
 * kit: { run, runs, para } من export/docx.js (خطوط واتجاه موحّدة).
 * @returns {{ properties, children }}
 */
export function coverSection(report, kit) {
  const { run, runs, para } = kit;
  const d = { ...coverData(report), logoAR: report.meta?.logoAR };
  const C = hex(d.color);
  const center = AlignmentType.CENTER;
  const P = (children, o = {}) => para(children, { align: center, after: 60, line: 300, ...o });
  const text = (t, o = {}, po = {}) => P(runs(t, o), po);
  const gap = (tw) => para([run('')], { before: tw, after: 0, line: 240 });
  const lines = (arr, o, po) => arr.map((l) => text(l, o, po));
  const logo = (w) => { const r = logoRun(d, w); return r ? [P([r], { after: 120 })] : []; };
  const kind = (o = {}) => text(d.kind, { b: true, size: 30, color: C, ...o }, { after: 160 });
  const title = (size = 46, po = {}) => text(d.title, { b: true, size }, { after: 120, line: 420, ...po });
  const year = () => (d.year ? [text(d.year, { size: 24, color: '4B5563' }, { before: 200 })] : []);

  function infoTable() {
    const label = (t) => new TableCell({
      children: [para(runs(t, { b: true, size: 25 }), { align: AlignmentType.START, after: 0, line: 280 })],
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(d.color, 0.14) },
      width: { size: 32, type: WidthType.PERCENTAGE }, margins: { top: 90, bottom: 90, left: 140, right: 140 },
    });
    const value = (t) => new TableCell({
      children: [para(runs(t, { size: 25 }), { align: AlignmentType.START, after: 0, line: 280 })],
      width: { size: 68, type: WidthType.PERCENTAGE }, margins: { top: 90, bottom: 90, left: 140, right: 140 },
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: true,
      rows: d.rows.map(([k, v]) => new TableRow({ children: [label(k), value(v)] })),
    });
  }

  const top = () => [...logo(90), ...lines(d.gov, { b: true, size: 26 }, { after: 20 }), ...(d.gov.length ? [gap(80)] : []), ...lines(d.org, { b: true, size: 30 }, { after: 40 })];
  const by = () => lines(d.by, { size: 27 }, { after: 70 });

  let children;
  let borders;
  let margin = { top: 1100, bottom: 1100, left: 1100, right: 1100 };

  switch (d.style) {
    case 'frame':
      margin = { top: 1500, bottom: 1400, left: 1500, right: 1500 };
      borders = {
        pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
        pageBorderTop: { style: BorderStyle.DOUBLE, size: 18, color: C, space: 24 },
        pageBorderBottom: { style: BorderStyle.DOUBLE, size: 18, color: C, space: 24 },
        pageBorderLeft: { style: BorderStyle.DOUBLE, size: 18, color: C, space: 24 },
        pageBorderRight: { style: BorderStyle.DOUBLE, size: 18, color: C, space: 24 },
      };
      children = [...top(), gap(3000), kind(), title(), gap(3000), ...by(), ...year()];
      break;

    case 'letterhead': {
      const side = (arr, align) => new TableCell({
        children: arr.length ? arr.map((l) => para(runs(l, { b: align === AlignmentType.START, size: 22 }), { align, after: 20, line: 260 })) : [para([run('')])],
        borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: 40, type: WidthType.PERCENTAGE },
      });
      const lr = logoRun(d, 80);
      const mid = new TableCell({
        children: [lr ? P([lr], { after: 0 }) : P([run((d.subject || 'أ').slice(0, 1), { b: true, size: 64, color: C })], { after: 0 })],
        borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: 20, type: WidthType.PERCENTAGE },
      });
      children = [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true, borders: TableBorders.NONE,
          rows: [new TableRow({ children: [side([...d.gov, ...d.org], AlignmentType.START), mid, side([d.year, d.subject].filter(Boolean), AlignmentType.END)] })],
        }),
        para([run('')], { after: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C, space: 4 } } }),
        gap(3600), kind(), title(), gap(3600),
        ...d.by.map((l) => para(runs(l, { size: 27 }), { align: AlignmentType.START, after: 60, border: { right: { style: BorderStyle.SINGLE, size: 24, color: C, space: 10 } } })),
      ];
      break;
    }

    case 'table':
      children = [...top(), gap(2400), kind(), title(), gap(2000), infoTable(), ...year()];
      break;

    case 'band': {
      const lr = logoRun(d, 70);
      children = [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true, borders: TableBorders.NONE,
          rows: [new TableRow({
            height: { value: 2300, rule: HeightRule.ATLEAST },
            children: [new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: C },
              verticalAlign: VerticalAlignTable.CENTER, borders: cellNoBorders, margins: { top: 200, bottom: 200, left: 200, right: 200 },
              children: [...(lr ? [P([lr], { after: 80 })] : []), ...d.org.map((l) => P([run(l, { b: true, size: 30, color: 'FFFFFF' })], { after: 30 }))],
            })],
          })],
        }),
        gap(3000), kind({ size: 32 }), title(), d.subject ? text(d.subject, { size: 28, color: '4B5563' }) : gap(0),
        gap(2800), ...by(), gap(1400),
        para([run([...d.gov, d.year].filter(Boolean).join(' — '), { size: 22, color: '374151' })], { align: center, after: 0, border: { top: { style: BorderStyle.SINGLE, size: 12, color: C, space: 6 } } }),
      ];
      break;
    }

    case 'side': {
      margin = { top: 900, bottom: 900, left: 900, right: 900 };
      const white = (t, size, b = false) => P([run(t, { b, size, color: 'FFFFFF' })], { after: 60 });
      const bar = new TableCell({
        width: { size: 22, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: C }, borders: cellNoBorders,
        margins: { top: 600, bottom: 400, left: 120, right: 120 }, verticalAlign: VerticalAlignTable.TOP,
        children: [
          ...(d.subject ? [white(d.subject, 30, true)] : []), white(d.typeName, 24),
          para([run('')], { before: 9500, after: 0 }),
          ...(d.year ? [white(d.year, 22)] : []),
        ],
      });
      const S = (t, o, po = {}) => para(runs(t, o), { align: AlignmentType.START, after: 50, line: 300, ...po });
      const main = new TableCell({
        width: { size: 78, type: WidthType.PERCENTAGE }, borders: cellNoBorders, margins: { top: 600, bottom: 400, left: 500, right: 500 },
        children: [
          ...(logoRun(d, 80) ? [para([logoRun(d, 80)], { align: AlignmentType.START, after: 100 })] : []),
          ...d.gov.map((l) => S(l, { b: true, size: 24 })), ...d.org.map((l) => S(l, { b: true, size: 28 })),
          para([run('')], { before: 2600, after: 0 }),
          S(d.kind, { b: true, size: 30, color: C }, { after: 140 }),
          S(d.title, { b: true, size: 48 }, { line: 420, after: 120 }),
          para([run('')], { before: 2600, after: 0 }),
          ...d.by.map((l) => S(l, { size: 26 })),
        ],
      });
      children = [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true, borders: TableBorders.NONE,
        rows: [new TableRow({ height: { value: 14600, rule: HeightRule.EXACT }, children: [bar, main] })],
      })];
      break;
    }

    case 'lab':
      children = [
        ...logo(80), ...lines(d.org, { b: true, size: 26 }, { after: 20 }), gap(2200),
        P([run(d.labLike ? 'التجربة رقم  ' : d.typeName, { b: true, size: 34, color: C }), ...(d.labLike ? [run(`(${d.expNo || '…'})`, { b: true, size: 56, color: C })] : [])], { after: 200 }),
        title(48), d.subject ? text(d.subject, { size: 28, color: '4B5563' }) : gap(0),
        gap(1900), infoTable(), ...year(),
      ];
      break;

    case 'minimal':
      children = [
        gap(5400), title(54, { after: 200 }),
        P([run('━━━━━━', { color: C, size: 28 })], { after: 240 }),
        text(d.rows[0][1], { b: true, size: 32 }),
        text([d.org[0], d.subject, d.year].filter(Boolean).join(' • '), { size: 24, color: '4B5563' }),
      ];
      break;

    default: // classic
      children = [...top(), gap(3400), kind(), title(), gap(3400), ...by(), ...year()];
  }

  return { properties: { page: { margin, ...(borders ? { borders } : {}) } }, children };
}
