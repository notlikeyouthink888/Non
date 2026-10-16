/**
 * نسخة Word من أنماط الغلاف (report/covers.js): كل غلاف في قسم مستقل من المستند
 * بلا ترويسة ولا ترقيم، فيبدأ ترقيم الصفحات من 1 بعده. الإطار المزدوج حدود صفحة حقيقية،
 * والشريطان الملوّنان خلايا جداول مظلّلة، وزخارف الأنماط الحديثة صورة بحجم الصفحة خلف النص
 * (الرسم نفسه في التطبيق)، فتظهر الأغلفة كما هي في Word وWPS وLibreOffice.
 */

import {
  Paragraph, ImageRun, Table, TableRow, TableCell, AlignmentType, WidthType, ShadingType,
  BorderStyle, TableBorders, HeightRule, VerticalAlignTable, PageBorderDisplay, PageBorderOffsetFrom,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType,
} from 'docx';
import { coverData } from '../report/covers.js';
import { decoPNG, hasDeco, PAGE_W, PAGE_H } from '../report/cover-deco.js';

/** يحضّر صورة زخرفة الغلاف (غير متزامن) قبل بناء المستند. */
export async function coverDeco(report) {
  const d = coverData(report);
  return hasDeco(d.style) ? decoPNG(d.style, { color: d.color, accent: d.accent, rtl: !d.en }) : null;
}

const hex = (c) => String(c || '#9a3412').replace('#', '').toUpperCase();
const shade = (c, k) => {
  const n = parseInt(hex(c), 16);
  const mix = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255);
};
/** يمزج اللون مع الأبيض (لخلايا عناوين الجدول). */
function tint(c, k) {
  const n = parseInt(hex(c), 16);
  const mix = (v) => Math.round(v * k + 255 * (1 - k)).toString(16).padStart(2, '0');
  return (mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255)).toUpperCase();
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const cellNoBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function logoRun(d, width = 95, key = 'logo') {
  if (!d[key]) return null;
  const m = String(d[key]).match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  const ar = Number(d[`${key}AR`]) > 0 ? Number(d[`${key}AR`]) : 1;
  return new ImageRun({ type: m[1] === 'png' ? 'png' : 'jpg', data: bytes, transformation: { width, height: Math.round(width * ar) }, altText: { name: 'logo', description: 'شعار', title: 'شعار' } });
}

/**
 * يبني قسم الغلاف.
 * kit: { run, runs, para } من export/docx.js (خطوط واتجاه موحّدة).
 * @returns {{ properties, children }}
 */
export function coverSection(report, kit) {
  const { run, runs, para, deco = null } = kit;
  const d = { ...coverData(report), logoAR: report.meta?.logoAR, logo2AR: report.meta?.logo2AR };
  const RTL = !d.en;
  const C = hex(d.color);
  const center = AlignmentType.CENTER;
  const P = (children, o = {}) => para(children, { align: center, after: 60, line: 300, ...o });
  const text = (t, o = {}, po = {}) => P(runs(t, o), po);
  const gap = (tw) => para([run('')], { before: tw, after: 0, line: 240 });
  const lines = (arr, o, po) => arr.map((l) => text(l, o, po));
  const logo = (w) => { const r = logoRun(d, w); return r ? [P([r], { after: 120 })] : []; };
  const kind = (o = {}, po = {}) => (d.kind ? text(d.kind, { b: true, size: 30, color: C, ...o }, { after: 160, ...po }) : gap(0));
  const title = (size = 46, po = {}, o = {}) => text(d.title, { b: true, size, ...o }, { after: 120, line: 420, ...po });
  const year = () => (d.year ? [text(d.year, { size: 24, color: '4B5563' }, { before: 200 })] : []);
  const ACC = hex(d.accent);
  const ACC2 = hex(shade(d.accent, 0.22));
  /** فاصل مزخرف: خط — معيّن — خط باللون الثاني. */
  const orn = () => P([run('━━━━━  ◆  ━━━━━', { color: ACC, size: 22 })], { after: 120 });
  const bar = () => P([run('━━━━', { color: ACC, size: 30 })], { after: 120 });
  /** صورة الزخرفة بحجم الصفحة خلف النص (في أول فقرة من الغلاف). */
  const decoP = () => {
    if (!deco) return gap(0);
    const img = new ImageRun({
      type: 'png', data: deco, transformation: { width: PAGE_W, height: PAGE_H },
      altText: { name: 'زخرفة الغلاف', description: 'زخرفة الغلاف', title: 'زخرفة' },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true, lockAnchor: true,
        wrap: { type: TextWrappingType.NONE },
      },
    });
    return para([img], { after: 0, line: 240 });
  };
  /** أسطر «عنوان: قيمة» بعنوان عريض؛ barred يضع خطًّا جانبيًّا باللون الثاني. */
  const info = (align, barred = false) => d.pairs.map(([k, v]) => para([...(k ? [run(`${k}: `, { b: true, size: 26 })] : []), ...runs(v, { size: 26 })], {
    align, after: 70, line: 300,
    ...(barred ? { border: { [RTL ? 'right' : 'left']: { style: BorderStyle.SINGLE, size: 36, color: ACC, space: 12 } } } : {}),
  }));

  function infoTable(white = false) {
    const label = (t) => new TableCell({
      children: [para(runs(t, { b: true, size: 25 }), { align: AlignmentType.START, after: 0, line: 280 })],
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(d.color, 0.14) },
      width: { size: 32, type: WidthType.PERCENTAGE }, margins: { top: 90, bottom: 90, left: 140, right: 140 },
    });
    const value = (t) => new TableCell({
      children: [para(runs(t, { size: 25 }), { align: AlignmentType.START, after: 0, line: 280 })],
      ...(white ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' } } : {}),
      width: { size: 68, type: WidthType.PERCENTAGE }, margins: { top: 90, bottom: 90, left: 140, right: 140 },
    });
    if (!d.rows.length) return gap(0); // كل الحقول مخفية
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: RTL,
      rows: d.rows.map(([k, v]) => new TableRow({ children: [label(k), value(v)] })),
    });
  }

  const top = () => [...logo(90), ...lines(d.gov, { b: true, size: 26 }, { after: 20 }), ...(d.gov.length ? [gap(80)] : []), ...lines(d.org, { b: true, size: 30 }, { after: 40 })];
  /** «إعداد الطلاب» قائمة مرقّمة (في عمودين إن زادوا على أربعة). */
  function studentsParas(size = 26) {
    if (d.students.length < 2) return [];
    const item = (n, k) => para(runs(`${k + 1}. ${n}`, { size }), { align: AlignmentType.START, after: 20, line: 280 });
    const head = d.studentsHead ? [para(runs(d.studentsHead, { b: true, size }), { align: AlignmentType.START, after: 40, line: 280 })] : [];
    if (d.students.length <= 4) return [...head, ...d.students.map(item)];
    const half = Math.ceil(d.students.length / 2);
    const col = (arr, off) => new TableCell({ borders: cellNoBorders, width: { size: 50, type: WidthType.PERCENTAGE }, children: arr.map((n, k) => item(n, k + off)) });
    return [...head, new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
      rows: [new TableRow({ children: [col(d.students.slice(0, half), 0), col(d.students.slice(half), half)] })],
    })];
  }
  const by = () => [...lines(d.by, { size: 27 }, { after: 70 }), ...studentsParas()];

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
        children: [lr ? P([lr], { after: 0 }) : P([run((d.subject || d.title || 'أ').slice(0, 1), { b: true, size: 64, color: C })], { after: 0 })],
        borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: 20, type: WidthType.PERCENTAGE },
      });
      children = [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
          rows: [new TableRow({ children: [side([...d.gov, ...d.org], AlignmentType.START), mid, side([d.year, d.subject].filter(Boolean), AlignmentType.END)] })],
        }),
        para([run('')], { after: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C, space: 4 } } }),
        gap(3600), kind(), title(), gap(3600),
        ...d.by.map((l) => para(runs(l, { size: 27 }), { align: AlignmentType.START, after: 60, border: { [RTL ? 'right' : 'left']: { style: BorderStyle.SINGLE, size: 24, color: C, space: 10 } } })),
        ...studentsParas(),
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
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
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
          ...studentsParas(24),
        ],
      });
      children = [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
        rows: [new TableRow({ height: { value: 14600, rule: HeightRule.EXACT }, children: [bar, main] })],
      })];
      break;
    }

    case 'lab':
      children = [
        ...logo(80), ...lines(d.org, { b: true, size: 26 }, { after: 20 }), gap(2200),
        P([run(d.labLike && !d.hideExp ? `${d.expWord}  ` : d.typeName, { b: true, size: 34, color: C }), ...(d.labLike && !d.hideExp ? [run(`(${d.expNo || '…'})`, { b: true, size: 56, color: C })] : [])], { after: 200 }),
        title(48), d.subject ? text(d.subject, { size: 28, color: '4B5563' }) : gap(0),
        gap(1900), infoTable(), ...year(),
      ];
      break;

    case 'minimal':
      children = [
        gap(5400), title(54, { after: 200 }),
        P([run('━━━━━━', { color: C, size: 28 })], { after: 240 }),
        ...(d.name ? [text(d.name, { b: true, size: 32 })] : []),
        text([d.org[0], d.subject, d.year].filter(Boolean).join(' • '), { size: 24, color: '4B5563' }),
      ];
      break;

    case 'logos': {
      const cell = (children, w) => new TableCell({ borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: w, type: WidthType.PERCENTAGE }, children });
      const l1 = logoRun(d, 85);
      const l2 = logoRun(d, 85, 'logo2');
      children = [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
          rows: [new TableRow({ children: [
            cell([l1 ? P([l1], { after: 0 }) : para([run('')])], 20),
            cell([...d.gov, ...d.org].map((l) => P(runs(l, { b: true, size: 24 }), { after: 20, line: 260 })), 60),
            cell([l2 ? P([l2], { after: 0 }) : para([run('')])], 20),
          ] })],
        }),
        gap(2400), kind(),
        P(runs(d.title, { b: true, size: 46 }), {
          after: 200, line: 420,
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(d.color, 0.14) },
          border: ['top', 'bottom', 'left', 'right'].reduce((o, k) => ({ ...o, [k]: { style: BorderStyle.SINGLE, size: 12, color: C, space: 6 } }), {}),
        }),
        gap(2000),
        ...(d.sup ? [P([...(d.supLabel ? [run(`${d.supLabel}: `, { b: true, size: 27 })] : []), ...runs(d.sup, { size: 27 })], { after: 160 })] : []),
        ...(d.students.length > 1 ? studentsParas(27) : lines(d.by.filter((x) => !d.sup || !x.startsWith(d.supLabel ? `${d.supLabel}:` : d.sup)), { size: 27 }, { after: 70 })),
        ...year(),
      ];
      break;
    }

    /* ── الأنماط الحديثة: الزخرفة صورة خلف النص، والهوامش تُبعد النص عنها ── */
    case 'royal':
      margin = { top: 1300, bottom: 3300, left: 1500, right: 1500 };
      children = [
        decoP(), ...top(), orn(), gap(1500), kind({ size: 34 }, { after: 60 }), bar(), title(46, { after: 120 }, { color: hex(d.accent) === 'FFFFFF' ? C : ACC2 }),
        gap(1500), ...info(center), ...studentsParas(), ...year(),
      ];
      break;

    case 'stripe':
      margin = RTL ? { top: 1200, bottom: 1300, right: 2300, left: 1100 } : { top: 1200, bottom: 1300, left: 2300, right: 1100 };
      children = [
        decoP(), ...logo(90), ...lines(d.gov, { b: true, size: 24 }, { after: 20 }),
        ...(d.org[0] ? [text(d.org[0], { b: true, size: 38, color: C }, { before: 100, after: 40, line: 340 })] : []),
        ...(d.org.length > 1 ? [orn()] : []), ...lines(d.org.slice(1), { b: true, size: 28 }, { after: 30 }),
        gap(2200), kind({ size: 36 }, { after: 60 }), orn(), title(46),
        gap(2000), ...info(AlignmentType.START), ...studentsParas(), ...year(),
      ];
      break;

    case 'panel': {
      margin = { top: 1000, bottom: 2700, left: 1200, right: 1200 };
      const lr = logoRun(d, 85);
      const head = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
        rows: [new TableRow({ children: [
          new TableCell({ borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: 75, type: WidthType.PERCENTAGE },
            children: [...d.gov.map((l) => para(runs(l, { b: true, size: 22 }), { align: AlignmentType.START, after: 20, line: 280 })), ...d.org.map((l, i) => para(runs(l, { b: true, size: i ? 26 : 32, color: i ? undefined : C }), { align: AlignmentType.START, before: i ? 0 : 60, after: 30, line: 320 }))] }),
          new TableCell({ borders: cellNoBorders, verticalAlign: VerticalAlignTable.CENTER, width: { size: 25, type: WidthType.PERCENTAGE },
            children: [lr ? para([lr], { align: AlignmentType.END, after: 0 }) : para([run('')])] }),
        ] })],
      });
      const box = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL,
        borders: ['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].reduce((o, k) => ({ ...o, [k]: { style: BorderStyle.SINGLE, size: 18, color: C } }), {}),
        rows: [new TableRow({ children: [new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(d.color, 0.08) }, margins: { top: 0, bottom: 400, left: 300, right: 300 },
          children: [
            ...(d.kind ? [P([run(` ${d.kind} `, { b: true, size: 28, color: 'FFFFFF' })], { after: 360, shading: { type: ShadingType.CLEAR, color: 'auto', fill: C } })] : [gap(300)]),
            P(runs(d.title, { b: true, size: 48 }), { after: 120, line: 420 }),
            ...(d.subject && !d.kind ? [text(d.subject, { size: 28, color: '4B5563' })] : []),
          ],
        })] })],
      });
      children = [decoP(), head, gap(1800), box, gap(1800), ...info(AlignmentType.START, true), ...studentsParas(), ...year()];
      break;
    }

    case 'modern': {
      margin = { top: 1100, bottom: 1500, left: 1100, right: 1100 };
      const half = { end: 4600 }; // نهاية السطر (يسار العربي) بعيدًا عن مثلثات الزاوية
      const S = (t, o, po = {}) => para(runs(t, o), { align: AlignmentType.START, after: 40, line: 300, indent: half, ...po });
      children = [
        decoP(), ...(logoRun(d, 80) ? [para([logoRun(d, 80)], { align: AlignmentType.START, after: 100 })] : []),
        ...d.gov.map((l) => S(l, { b: true, size: 22 })), ...d.org.map((l) => S(l, { b: true, size: 26 })),
        gap(2600),
        para(runs(d.title, { b: true, size: 56 }), { align: AlignmentType.START, after: 160, line: 400, border: { [RTL ? 'right' : 'left']: { style: BorderStyle.SINGLE, size: 48, color: C, space: 14 } } }),
        ...(d.kind ? [para(runs(d.kind, { b: true, size: 30, color: C }), { align: AlignmentType.START, after: 60 })] : []),
        para([run('━━━━━━', { color: ACC, size: 30 })], { align: AlignmentType.START, after: 200 }),
        gap(1200),
        ...(d.pairs.length ? [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL, borders: TableBorders.NONE,
          rows: d.pairs.map(([k, v]) => new TableRow({ children: [
            new TableCell({ borders: cellNoBorders, width: { size: 32, type: WidthType.PERCENTAGE }, children: [para(runs(k || '', { b: true, size: 25 }), { align: AlignmentType.START, after: 60, line: 300 })] }),
            new TableCell({ borders: cellNoBorders, width: { size: 68, type: WidthType.PERCENTAGE }, children: [para(runs(v, { size: 25 }), { align: AlignmentType.START, after: 60, line: 300 })] }),
          ] })),
        })] : []),
        ...studentsParas(), ...year(),
      ];
      break;
    }

    case 'waves':
      margin = { top: 3300, bottom: 3000, left: 1300, right: 1300 };
      children = [
        decoP(), ...top(), gap(1400), kind(), title(), ...(d.subject && !d.kind ? [text(d.subject, { size: 28, color: '4B5563' })] : []),
        gap(1400), ...info(center), ...studentsParas(), ...year(),
      ];
      break;

    case 'geo':
      margin = { top: 3200, bottom: 3300, left: 1300, right: 1300 };
      children = [decoP(), ...top(), gap(1200), kind(), title(), gap(1000), infoTable(), ...year()];
      break;

    case 'blueprint': {
      margin = { top: 1300, bottom: 1300, left: 1300, right: 1300 };
      const tbox = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: RTL,
        borders: ['top', 'bottom', 'left', 'right'].reduce((o, k) => ({ ...o, [k]: { style: BorderStyle.DOUBLE, size: 12, color: C } }), {}),
        rows: [new TableRow({ children: [new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' }, margins: { top: 300, bottom: 300, left: 300, right: 300 },
          children: [P(runs(d.title, { b: true, size: 48 }), { after: 0, line: 420 })],
        })] })],
      });
      children = [decoP(), ...top(), gap(2000), kind(), tbox, gap(2000), infoTable(true), ...year()];
      break;
    }

    case 'corners':
      margin = { top: 1800, bottom: 1700, left: 1700, right: 1700 };
      children = [decoP(), ...top(), gap(2400), orn(), kind(), title(), orn(), gap(2400), ...by(), ...year()];
      break;

    default: // classic
      children = [...top(), gap(3400), kind(), title(), gap(3400), ...by(), ...year()];
  }

  return { properties: { page: { margin, ...(borders ? { borders } : {}) } }, children };
}
