/**
 * تصدير التقرير إلى Word (.docx) باتجاه من اليمين لليسار:
 * صفحة غلاف، فهرس، عناوين، فقرات، خطوات مرقّمة، جداول، معادلات، صور مضمّنة مع مصادرها، وأرقام صفحات.
 * الترقيم يُكتب نصًّا صريحًا حتى يظهر صحيحًا في Word وWPS وLibreOffice وGoogle Docs.
 * المعادلات صور PNG واضحة بكسور حقيقية (تُرسم مسبقًا بالمحرّك نفسه الذي يعرضها في التطبيق)،
 * أو معادلات Word قابلة للتعديل إن اختار الطالب ذلك.
 */

import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Footer, Header,
  AlignmentType, HeadingLevel, PageNumber, WidthType, ShadingType, BorderStyle, PageBreak, LineRuleType,
} from 'docx';
import { state } from '../core/store.js';
import { getImage } from '../core/db.js';
import { getType } from '../data/types.js';
import { parseBlocks, inline } from '../report/md.js';
import { bidi } from '../core/arabic.js';
import { mathPieces } from '../core/mathconv.js';
import { loadMath, isTall, eqLineRTL, ltrSep } from '../core/math.js';
import { docxMath, hasArabic } from './omml.js';
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

/* ── المعادلات ─────────────────────────────────────── */

/** المعادلات المجهّزة للتقرير الحالي: مفتاح ← { png, omml } */
let MATH = new Map();
const mkey = (tex, display) => `${display ? 'D' : 'I'}${tex}`;

/** يجمع كل معادلات التقرير ويجهّزها (صور PNG أو معادلات Word) قبل بناء المستند. */
async function prepareMath(report, mode) {
  MATH = new Map();
  const items = new Map();
  const add = (tex, display) => items.set(mkey(tex, display), { tex, display });
  const scan = (t) => inline(t).forEach((r) => { if (r.math !== undefined) add(r.math, r.display || isTall(r.math)); });
  for (const s of report.sections) {
    for (const b of parseBlocks(s.md)) {
      if (b.t === 'p') { const r = inline(b.text); if (r.length === 1 && r[0].math !== undefined) add(r[0].math, true); else scan(b.text); }
      else if (b.t === 'note') scan(b.text);
      else if (b.t === 'ol' || b.t === 'ul') b.items.forEach((it) => { scan(it.text); (it.sub || []).forEach(scan); });
      else if (b.t === 'table') [...b.head, ...b.rows.flat()].forEach(scan);
      else if (b.t === 'eq') {
        b.lines.forEach((l) => mathPieces(l).forEach((p) => {
          if (p.t === 'math') add(p.tex, true);
          if (p.t === 'note') p.parts.forEach((x) => { if (x.math !== undefined) add(x.math, false); });
        }));
      }
    }
  }
  if (!items.size) return;
  let eng;
  try { eng = await loadMath(); } catch { return; } // بلا المحرّك تبقى المعادلات نصًّا
  const list = [...items.values()];
  // عدد محدود في الوقت نفسه حتى لا تثقل الأجهزة الضعيفة
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const it = list[next++];
      const entry = {};
      if (mode === 'native' && !hasArabic(it.tex)) {
        const tree = () => eng.mmlTree(it.tex, it.display);
        if (docxMath(tree())) entry.omml = () => docxMath(tree());
      }
      if (!entry.omml) entry.png = await eng.png(it.tex, { display: it.display, fontPx: BODY_SIZE / 1.5, scale: 3 }).catch(() => null);
      MATH.set(mkey(it.tex, it.display), entry);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/** معادلة داخل فقرة Word: صورة منخفضة إلى خط الكتابة، أو معادلة Word، أو نصّها إن تعذّر الرسم. */
function mathRun(tex, display, src, base = {}) {
  const m = MATH.get(mkey(tex, display));
  if (m?.omml) { const o = m.omml(); o.tallMath = display; return o; }
  if (m?.png) {
    const k = (base.size || BODY_SIZE) / BODY_SIZE;
    const p = m.png;
    const img = new ImageRun({
      type: 'png',
      data: p.data,
      transformation: { width: Math.max(1, p.w * k), height: Math.max(1, p.h * k) },
      altText: { name: 'معادلة', description: src || tex, title: 'معادلة' },
      // داخل الجملة: تُنزل الصورة قليلًا حتى يقع خط أساس الرمز على خط الكتابة (للرموز ذات الدلائل فقط؛
      // الكسور الطويلة تبقى على السطر حتى لا تتداخل مع ما فوقها في بعض البرامج)
      run: !display && p.d > 0.5 && p.h < 34 ? { position: `-${(p.d * k * 0.75).toFixed(1)}pt` } : undefined,
    });
    img.tallMath = p.h * k > 26;
    return img;
  }
  return run(src || tex, { ...base, ltr: true, font: 'Cambria Math' });
}

/** يحوّل نصًّا بتنسيق داخلي إلى مقاطع Word، والمعادلات صورًا. */
function runs(text, base = {}) {
  return inline(text, { math: base.math !== false }).map((r) => {
    if (r.math !== undefined) return mathRun(r.math, r.display || isTall(r.math), r.src, base);
    const t = bidi(r.text);
    if (r.code) return run(t, { ...base, ltr: !HAS_AR.test(t), mono: true });
    if (r.ph) return run(t, { ...base, ph: true });
    return run(t, { ...base, b: base.b || r.b, i: r.i });
  });
}

/** سطر من كتلة معادلات: في الوسط، ويُقرأ من اليمين إن كانت فيه تسمية أو شرح عربي. */
function eqPara(line) {
  const parts = mathPieces(line);
  const rtl = eqLineRTL(parts);
  const children = [];
  parts.forEach((p, k) => {
    if (k) children.push(run('  ', { ltr: !rtl }));
    if (p.t === 'math') children.push(mathRun(p.tex, true, p.src));
    else if (p.t === 'label') children.push(...runs(`${p.s}:`, { b: true, math: false }));
    else if (p.t === 'note') {
      children.push(run('(', { size: 24, color: '555555' }));
      p.parts.forEach((x) => children.push(x.math !== undefined ? mathRun(x.math, false, x.src, { size: 24 }) : run(bidi(x.text), { size: 24, color: '555555' })));
      children.push(run(')', { size: 24, color: '555555' }));
    } else children.push(run(rtl ? p.s : ltrSep(p.s), { ltr: !rtl, color: '555555' }));
  });
  // «على الأقل» حتى يتّسع السطر لارتفاع المعادلة في كل البرامج
  return para(children, { ltr: !rtl, align: AlignmentType.CENTER, before: 80, after: 120, line: 240, lineRule: LineRuleType.AT_LEAST });
}

function para(children, o = {}) {
  // سطر فيه كسر أو معادلة طويلة: المسافة «على الأقل» حتى لا يُقص أعلى المعادلة في بعض البرامج
  const tall = !o.lineRule && children.some((c) => c && c.tallMath);
  const line = o.line ?? 360;
  return new Paragraph({
    children,
    bidirectional: o.ltr ? false : true,
    alignment: o.align || AlignmentType.BOTH,
    spacing: tall
      ? { after: o.after ?? 120, before: (o.before ?? 0) + 40, line: Math.round(line * 1.35), lineRule: LineRuleType.AT_LEAST }
      : { after: o.after ?? 120, before: o.before ?? 0, line, ...(o.lineRule ? { lineRule: o.lineRule } : {}) },
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
  return para(runs(text, { b: true, size, color: level === 1 ? ACCENT : undefined, math: false }), {
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
    else if (b.t === 'p') {
      const r = inline(b.text);
      if (r.length === 1 && r[0].math !== undefined) out.push(para([mathRun(r[0].math, true, r[0].src)], { align: AlignmentType.CENTER, ltr: true, before: 80, after: 120, line: 240, lineRule: LineRuleType.AT_LEAST }));
      else out.push(para(runs(b.text)));
    }
    else if (b.t === 'ol' || b.t === 'ul') out.push(...listItems(b.items, b.t === 'ol'));
    else if (b.t === 'table') { out.push(table(b)); out.push(para([run('')], { after: 60 })); }
    else if (b.t === 'eq') b.lines.forEach((l) => out.push(eqPara(l)));
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
  await prepareMath(report, opts.wordMath);
  const nums = figureNumbers(report);
  const withCover = hasCover(report, opts.cover !== false);
  const children = [];

  // بلا غلاف: يبدأ التقرير بعنوانه ونوعه
  if (!withCover) children.push(para(runs(report.title, { b: true, size: 36, color: ACCENT, math: false }), { align: AlignmentType.CENTER, after: 300 }));
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
      ...(withCover ? [coverSection(report, { run, runs: (t, o = {}) => runs(t, { ...o, math: false }), para })] : []),
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
