/**
 * عرض تقديمي PowerPoint من التقرير (للسمنار ولأي تقرير): شريحة عنوان بأسماء الطلبة والمشرف،
 * ثم المحتويات، ثم شرائح الأقسام (نقاط مختصرة، ومعادلات صورًا واضحة، وجداول، وصور مع تعليقها)،
 * وشريحة ختام «شكرًا لحسن الاستماع». نص القسم كاملًا في ملاحظات المتحدث.
 */

import PptxGenJS from 'pptxgenjs';
import { getImage } from '../core/db.js';
import { parseBlocks, inline, plain } from '../report/md.js';
import { mathPieces } from '../core/mathconv.js';
import { loadMath, isTall } from '../core/math.js';
import { figuresOf, figureNumbers, coverLines, labelsOf, labeled } from '../report/model.js';
import { reportColor } from '../report/covers.js';
import { isEnglish } from '../report/style.js';

const W = 13.333;
const H = 7.5;
const M = 0.6; // الهامش
const TOP = 1.45; // بداية المحتوى تحت شريط العنوان
const BOTTOM = H - 0.45;
const FONT = 'Arial';

const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** يقطع النص الطويل عند حدّ جملة (للشرائح نقاط مختصرة لا فقرات). */
function brief(t, max = 170) {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('،'), cut.lastIndexOf('؛'), cut.lastIndexOf(','));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + (end > max * 0.5 ? '' : '…');
}

/** ارتفاع تقريبي لنص بعرض معيّن (بوصة). */
function textHeight(t, width, pt) {
  const perLine = Math.max(10, Math.floor((width * 72) / (pt * 0.52)));
  const lines = Math.max(1, Math.ceil(t.length / perLine));
  return lines * pt * 1.45 / 72 + 0.12;
}

export async function buildPptx(report) {
  const en = isEnglish(report);
  const color = reportColor(report).replace('#', '');
  const align = en ? 'left' : 'right';
  const rtl = !en;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.rtlMode = rtl;
  pptx.title = report.title;
  pptx.author = coverLines(report).students.join('، ') || 'أساس';

  // المعادلات صور PNG بالمحرّك نفسه
  let eng = null;
  try { eng = await loadMath(); } catch { eng = null; }
  const mathImg = async (tex, display = true, pt = 24) => {
    if (!eng) return null;
    const p = await eng.png(tex, { display, fontPx: pt * 1.333, scale: 3 }).catch(() => null);
    return p ? { data: `image/png;base64,${b64(p.data)}`, w: p.w / 96, h: p.h / 96 } : null;
  };

  // اتجاه الفقرة (rtl) يُقرأ من خيارات أول مقطع في كل سطر، فيُضاف لكل مقطع
  const txt = (slide, text, o = {}) => slide.addText(Array.isArray(text) ? text.map((r) => ({ ...r, options: { rtlMode: rtl, ...r.options } })) : text, {
    fontFace: FONT, fontSize: 20, color: '1F2937', align, rtlMode: rtl, valign: 'top', margin: 0.05, ...o,
  });

  /** شريحة بشريط عنوان ملوّن. */
  const newSlide = (title, notes = '') => {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.1, fill: { color } });
    txt(s, title, { x: M, y: 0.18, w: W - 2 * M, h: 0.8, fontSize: 28, bold: true, color: 'FFFFFF', valign: 'middle', fit: 'shrink' });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.12, w: W, h: 0.12, fill: { color } });
    if (notes) s.addNotes(notes);
    return s;
  };

  /* ── شريحة العنوان ── */
  const L = coverLines(report);
  {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.35, fill: { color } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.35, w: W, h: 0.35, fill: { color } });
    const org = [...L.org].join(' — ');
    if (org) txt(s, org, { x: M, y: 0.6, w: W - 2 * M, h: 0.6, fontSize: 18, bold: true, align: 'center', color: '374151' });
    txt(s, report.title, { x: M, y: 1.7, w: W - 2 * M, h: 1.9, fontSize: 40, bold: true, align: 'center', valign: 'middle', color, fit: 'shrink' });
    txt(s, L.kind, { x: M, y: 3.6, w: W - 2 * M, h: 0.6, fontSize: 20, align: 'center', color: '4B5563' });
    const T = labelsOf(report.meta || {}, en);
    const who = [
      L.students.length ? labeled(L.students.length > 1 ? T.students : T.student, L.students.join(en ? ', ' : '، ')) : '',
      ...L.by.filter((x) => !(L.students.length === 1 && x === labeled(T.student, L.students[0]))),
    ].filter(Boolean);
    txt(s, who.join('\n'), { x: M, y: 4.45, w: W - 2 * M, h: 2.2, fontSize: 18, align: 'center', color: '1F2937', fit: 'shrink' });
  }

  /* ── المحتويات ── */
  const heads = report.sections.map((s) => s.h).filter(Boolean);
  if (heads.length >= 3) {
    const s = newSlide(en ? 'Outline' : 'المحتويات');
    const cols = heads.length > 7 ? 2 : 1;
    const per = Math.ceil(heads.length / cols);
    for (let c = 0; c < cols; c++) {
      const items = heads.slice(c * per, (c + 1) * per).map((h, k) => ({ text: h, options: { bullet: { type: 'number', startAt: c * per + 1 }, breakLine: true } }));
      const colW = (W - 2 * M) / cols;
      const x = en ? M + c * colW : W - M - (c + 1) * colW;
      txt(s, items, { x, y: TOP, w: colW - 0.2, h: BOTTOM - TOP, fontSize: 22, paraSpaceAfter: 8 });
    }
  }

  /* ── الأقسام ── */
  const nums = figureNumbers(report);
  for (let i = 0; i < report.sections.length; i++) {
    const sec = report.sections[i];
    const title = sec.h || report.title;
    const notes = plain(sec.md).slice(0, 4000);
    let slide = newSlide(title, notes);
    let y = TOP;
    const room = (hgt) => {
      if (y + hgt <= BOTTOM) return;
      slide = newSlide(`${title} (${en ? 'cont.' : 'تابع'})`, notes);
      y = TOP;
    };
    const bullet = (text, level = 0) => {
      const t = brief(text, level ? 130 : 170);
      if (!t) return;
      const hgt = textHeight(t, W - 2 * M - 0.4, level ? 18 : 20);
      room(hgt);
      txt(slide, [{ text: t, options: { bullet: level ? { indent: 18 } : true, indentLevel: level } }], { x: M, y, w: W - 2 * M, h: hgt, fontSize: level ? 18 : 20 });
      y += hgt + 0.06;
    };
    const image = async (tex, display, label = '') => {
      const im = await mathImg(tex, display, 24);
      if (!im) return false;
      const k = Math.min(1, (W - 2 * M - 1) / im.w, 1.6 / im.h);
      const w = im.w * k;
      const hh = im.h * k;
      room(hh + 0.15);
      if (label) txt(slide, label, { x: en ? M : W - M - 3, y, w: 3, h: hh, fontSize: 16, bold: true, valign: 'middle', color: '374151' });
      slide.addImage({ data: im.data, x: (W - w) / 2, y, w, h: hh });
      y += hh + 0.15;
      return true;
    };
    /** نص فيه معادلات: النص نقطة، والمعادلات الكبيرة صور تحته. */
    const richBullet = async (text, level = 0) => {
      const runs = inline(text);
      const maths = runs.filter((r) => r.math !== undefined);
      if (!maths.length) { bullet(plain(text), level); return; }
      const words = runs.filter((r) => r.math === undefined).map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim();
      const tall = maths.filter((r) => r.display || isTall(r.math));
      if (tall.length) {
        if (words.replace(/[\s:،.؛()]+/g, '').length > 2) bullet(words, level);
        for (const r of tall) await image(r.math, true);
      } else bullet(plain(text), level);
    };

    let bullets = 0;
    for (const b of parseBlocks(sec.md)) {
      if (bullets > 14) break; // الشرائح ملخص؛ التفاصيل في الملاحظات
      if (b.t === 'h') { room(0.55); txt(slide, plain(b.text), { x: M, y, w: W - 2 * M, h: 0.5, fontSize: 22, bold: true, color }); y += 0.55; }
      else if (b.t === 'p') { await richBullet(b.text); bullets++; }
      else if (b.t === 'note') { await richBullet(b.text); bullets++; }
      else if (b.t === 'ol' || b.t === 'ul') {
        for (const it of b.items.slice(0, 8)) { await richBullet(it.text); bullets++; for (const s2 of (it.sub || []).slice(0, 3)) bullet(plain(s2), 1); }
      } else if (b.t === 'eq') {
        for (const l of b.lines.slice(0, 6)) {
          const parts = mathPieces(l);
          const label = parts.filter((p) => p.t === 'label').map((p) => p.s).join(' ');
          for (const p of parts.filter((x) => x.t === 'math')) await image(p.tex, true, label);
        }
      } else if (b.t === 'table') {
        const rows = [b.head, ...b.rows.slice(0, 7)].map((r, ri) => r.map((c) => ({
          text: plain(c), options: { bold: ri === 0, fill: { color: ri === 0 ? 'F3F4F6' : 'FFFFFF' }, align: 'center', fontFace: FONT, fontSize: 14, rtlMode: rtl },
        })));
        const hgt = 0.45 * rows.length;
        room(Math.min(hgt, BOTTOM - TOP));
        slide.addTable(en ? rows : rows.map((r) => [...r].reverse()), { x: M, y, w: W - 2 * M, border: { type: 'solid', color: 'BFC5CD', pt: 1 }, autoPage: false });
        y += hgt + 0.2;
      }
    }

    // الصور: شريحة لكل صورة مع تعليقها
    for (const f of figuresOf(report, i)) {
      const rec = await getImage(f.img).catch(() => null);
      if (!rec?.blob) continue;
      const bytes = new Uint8Array(await rec.blob.arrayBuffer());
      const type = /png/.test(rec.blob.type) ? 'png' : 'jpeg';
      const s = newSlide(title, notes);
      const iw = rec.w || f.w || 800;
      const ih = rec.h || f.h || 600;
      const k = Math.min((W - 2 * M) / iw, (BOTTOM - TOP - 0.8) / ih);
      s.addImage({ data: `image/${type};base64,${b64(bytes)}`, x: (W - iw * k) / 2, y: TOP, w: iw * k, h: ih * k });
      txt(s, `${en ? 'Figure' : 'شكل'} (${nums.get(f.id)}): ${f.caption}`, { x: M, y: TOP + ih * k + 0.1, w: W - 2 * M, h: 0.6, fontSize: 16, align: 'center', color: '374151' });
    }
  }

  /* ── الختام ── */
  {
    const s = pptx.addSlide();
    s.background = { color };
    txt(s, en ? 'Thank you' : 'شكرًا لحسن الاستماع', { x: M, y: 2.5, w: W - 2 * M, h: 1.4, fontSize: 48, bold: true, align: 'center', valign: 'middle', color: 'FFFFFF' });
    txt(s, en ? 'Questions?' : 'هل من أسئلة؟', { x: M, y: 4.0, w: W - 2 * M, h: 0.8, fontSize: 24, align: 'center', color: 'FFFFFF' });
  }

  return pptx.write({ outputType: 'blob' });
}
