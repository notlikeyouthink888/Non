/**
 * ملف PDF للتقرير يُبنى داخل التطبيق دون نافذة طباعة (يُرسل إلى تيليغرام المدير):
 *  1. يُرتَّب التقرير بصفحات A4 بمحرّك المتصفح نفسه: أعمدة بارتفاع الصفحة (multicol)، فتنكسر الصفحات
 *     بين الأسطر وتبقى الصور والجداول والمعادلات كاملة والعناوين مع ما بعدها — بقواعد الطباعة نفسها.
 *  2. تُرسم كل صفحة صورة بمحرّك العرض نفسه (SVG foreignObject ← لوحة رسم)، فالعربية وتشكيلها سليمان
 *     تمامًا، بخطوط التطبيق مضمّنة.
 *  3. تُجمع الصفحات (JPEG) في ملف PDF صغير مكتوب هنا مباشرة.
 * الغلاف صفحة مستقلة، وبعده ترويسة بعنوان التقرير وترقيم يبدأ من 1 كما في ملف Word.
 */

import { h } from '../core/dom.js';
import { getImage } from '../core/db.js';
import { loadMath } from '../core/math.js';
import { renderCover, renderToc, renderSection } from '../report/render.js';
import { hasCover } from '../report/covers.js';
import { figureNumbers } from '../report/model.js';
import { paperAttrs, fmtOf } from '../report/format.js';
import { isEnglish } from '../report/style.js';
import { state } from '../core/store.js';

const PAGE_W = 794;   // A4 بـ 96 نقطة في البوصة
const PAGE_H = 1123;
const BOX_W = 674;    // داخل هوامش الطباعة (16 ملم جانبيًا و18 ملم أعلى وأسفل)
const BOX_H = 987;
const GAP = 120;      // بين الأعمدة (الصفحات) حتى لا يظهر طرف صفحة في جارتها
const FRAME = { x: 26, y: 23 }; // بُعد النص عن إطار الصفحة (7 و6 ملم)
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// التطبيق قد يكون في الخلفية أثناء البناء: لا requestAnimationFrame (يتوقف حينها)، وكل انتظار له حد
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const decoded = (img) => Promise.race([img.decode().catch(() => {}), wait(4000)]);

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

/* ── الأنماط والخطوط مضمّنة (صورة SVG لا تحمّل ملفات خارجية) ─────────── */

let cssCache = null;

async function inlineFontFace(rule, base) {
  let text = rule.cssText;
  for (const m of [...text.matchAll(/url\((["']?)([^"')]+)\1\)/g)]) {
    if (m[2].startsWith('data:')) continue;
    try {
      const blob = await (await fetch(new URL(m[2], base).href)).blob();
      text = text.replace(m[0], `url("${await blobToDataURL(blob)}")`);
    } catch { /* يبقى الخط البديل */ }
  }
  return text;
}

async function pageCss() {
  if (cssCache) return cssCache;
  const parts = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const base = sheet.href || location.href;
    for (const rule of rules) {
      if (rule.type === CSSRule.FONT_FACE_RULE) parts.push(await inlineFontFace(rule, base));
      else parts.push(rule.cssText);
    }
  }
  cssCache = parts.join('\n');
  return cssCache;
}

async function fontsReady() {
  const sample = 'ابجد هوز Abc 123';
  await Promise.all(['400', '700'].flatMap((w) => [`${w} 16px "Noto Naskh Arabic"`, `${w} 16px "IBM Plex Sans Arabic"`])
    .map((f) => document.fonts?.load(f, sample).catch(() => {})));
  await document.fonts?.ready;
}

/* ── ترتيب الصفحات ─────────────────────────────── */

/** «ورقة» صفحة واحدة بتنسيق التقرير (الإطار ولون العناوين والخط). */
function paperOf(report) {
  const en = isEnglish(report);
  const a = paperAttrs(report);
  const paper = h('div.paper', { dir: en ? 'ltr' : 'rtl', lang: en ? 'en' : 'ar' });
  Object.assign(paper.dataset, a.dataset);
  for (const [k, v] of Object.entries(a.vars)) paper.style.setProperty(k, v);
  paper.append(h('div.pframe', { 'aria-hidden': 'true' }));
  return paper;
}

/** صور التقرير من الجهاز مضمّنة في الصفحة (لا روابط blob). */
async function embedImages(root, report) {
  const byId = new Map((report.figures || []).map((f) => [f.id, f]));
  await Promise.all([...root.querySelectorAll('img')].map(async (img) => {
    img.removeAttribute('loading');
    const fig = byId.get(img.closest('figure.fig')?.dataset.fig);
    try {
      if (fig?.img) {
        const rec = await getImage(fig.img);
        if (rec?.blob) img.src = await blobToDataURL(rec.blob);
      } else if (img.src.startsWith('blob:')) {
        img.src = await blobToDataURL(await (await fetch(img.src)).blob());
      }
    } catch { /* بلا صورة */ }
  }));
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.src ? decoded(img) : null)));
}

/**
 * يرتّب التقرير في الصفحة فعليًا (خارج الشاشة، داخل Shadow DOM فلا يراه بقية التطبيق) بالأنماط نفسها
 * التي تُرسم بها الصفحات، ويقيس عدد الصفحات وموضع كل صورة.
 */
async function layout(report, css) {
  const border = paperAttrs(report).dataset.border;
  const inset = border && border !== 'none' ? FRAME : { x: 0, y: 0 };
  const fw = BOX_W - 2 * inset.x;
  const fh = BOX_H - 2 * inset.y;
  const pitch = fw + GAP;

  const withCover = hasCover(report, state.exportOpts.cover !== false);
  const cover = renderCover(report);
  const nums = figureNumbers(report);
  const content = h('div.pdf-content', { dir: isEnglish(report) ? 'ltr' : 'rtl' }, [
    withCover ? null : cover,
    renderToc(report),
    h('div.secs', report.sections.map((_, i) => renderSection(report, i, { editable: false, numbers: nums }))),
  ]);
  const flow = h('div.pdf-flow', {
    style: `left:${inset.x}px;top:${inset.y}px;width:${fw}px;height:${fh}px;column-width:${fw}px;column-gap:${GAP}px;column-count:auto`,
  }, content);
  const paper = paperOf(report);
  paper.append(flow);
  const coverPaper = withCover ? paperOf(report) : null;
  coverPaper?.append(cover);

  // خارج الشاشة بالمقاسات نفسها التي تُرسم بها الصفحات
  const host = h('div', { style: 'position:fixed;left:-20000px;top:0;pointer-events:none;z-index:-1', 'aria-hidden': 'true' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', css), h('div.pdfdoc', paper), coverPaper ? h('div.pdfdoc', coverPaper) : null);
  document.body.append(host);
  try {
    await embedImages(shadow, report);
    await wait(30);
    const left = flow.getBoundingClientRect().left;
    const colOf = (x) => Math.max(0, Math.floor((x - left + 2) / pitch));
    let last = 0;
    for (const el of content.querySelectorAll('.secs > .rsec > *, .toc, .cover-off')) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) last = Math.max(last, colOf(r.right - 4));
    }
    const pages = Math.max(1, last + 1, Math.round((flow.scrollWidth + GAP) / pitch));
    // تثبيت مقاس كل صورة كما رُتّبت، ليبقى الترتيب نفسه حين تُحذف صور الصفحات الأخرى من كل صفحة
    const imgs = [...flow.querySelectorAll('img')].map((img) => {
      const r = img.getBoundingClientRect();
      img.style.width = `${r.width}px`;
      img.style.height = `${r.height}px`;
      return colOf(r.left + r.width / 2);
    });
    return { paper, flow, coverPaper, pages: Math.min(pages, 200), pitch, inset, imgs };
  } finally {
    host.remove();
  }
}

/* ── رسم الصفحات ─────────────────────────────── */

function pageXml(css, paperNode, { head = '', foot = '' } = {}) {
  const page = h('div.pdfdoc', [h('style', css), head ? h('div.pdf-head', head) : null, paperNode, foot ? h('div.pdf-foot', foot) : null]);
  const xhtml = new XMLSerializer().serializeToString(page);
  return `<svg xmlns="http://www.w3.org/2000/svg" data-theme="light" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`
    + `<foreignObject x="0" y="0" width="${PAGE_W}" height="${PAGE_H}">${xhtml}</foreignObject></svg>`;
}

async function rasterize(svg, scale, quality) {
  // رابط data (لا blob): كروم يعدّ صورة SVG فيها HTML من رابط blob مصدرًا أجنبيًا فيمنع حفظ اللوحة
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  {
    const img = new Image();
    await Promise.race([
      new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('تعذّر رسم صفحة PDF')); img.src = url; }),
      wait(30000).then(() => { throw new Error('تأخر رسم صفحة PDF'); }),
    ]);
    await decoded(img);
    const c = document.createElement('canvas');
    c.width = Math.round(PAGE_W * scale);
    c.height = Math.round(PAGE_H * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('تعذّر حفظ صفحة PDF');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  }
}

/* ── كتابة ملف PDF من صور الصفحات ─────────────────────── */

const A4 = [595.28, 841.89]; // بالنقاط

/** نص PDF بترميز UTF-16BE (للعنوان العربي في خصائص الملف). */
const pdfText = (s) => `<FEFF${[...String(s)].map((ch) => {
  const c = ch.codePointAt(0);
  if (c <= 0xffff) return c.toString(16).padStart(4, '0');
  const v = c - 0x10000;
  return ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)).padStart(8, '0');
}).join('').toUpperCase()}>`;

export function jpegsToPdf(pages, { title = '' } = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; put(`${n} 0 obj\n${body}\nendobj\n`); };
  const n = pages.length;
  const info = 3 + 3 * n;
  put('%PDF-1.4\n');
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // سطر ثنائي: الملف غير نصي
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const pg = 3 + 3 * i;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${pg + 2} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${pg + 1} 0 R >>`);
    const draw = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
    obj(pg + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    offsets[pg + 2] = pos;
    put(`${pg + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    put(p.bytes);
    put('\nendstream\nendobj\n');
  });
  obj(info, `<< /Title ${pdfText(title)} /Producer (sadiqabbas) >>`);
  const xref = pos;
  put(`xref\n0 ${info + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/* ── الواجهة ─────────────────────────────────── */

/**
 * يبني ملف PDF للتقرير. scale دقة الرسم (1.5 ≈ 144 نقطة في البوصة)، quality جودة JPEG.
 * onPage(i, n) لعرض التقدّم.
 */
export async function reportPdf(report, { scale = 1.5, quality = 0.8, onPage } = {}) {
  await loadMath().catch(() => {});
  await fontsReady();
  const css = await pageCss();
  const L = await layout(report, css);
  const F = fmtOf(report);
  const out = [];
  const total = L.pages + (L.coverPaper ? 1 : 0);
  if (L.coverPaper) {
    out.push(await rasterize(pageXml(css, L.coverPaper), scale, quality));
    onPage?.(1, total);
  }
  for (let i = 0; i < L.pages; i++) {
    const paper = L.paper.cloneNode(true);
    const flow = paper.querySelector('.pdf-flow');
    flow.style.left = `${L.inset.x - i * L.pitch}px`;
    // صور الصفحات الأخرى تُستبدل بفراغ بالمقاس نفسه (أخف بكثير، والترتيب لا يتغير)
    [...flow.querySelectorAll('img')].forEach((img, k) => { if (L.imgs[k] !== i) img.src = BLANK; });
    const head = F.header ? report.title : '';
    const foot = F.pageNumbers ? String(i + 1) : '';
    out.push(await rasterize(pageXml(css, paper, { head, foot }), scale, quality));
    onPage?.(out.length, total);
  }
  return jpegsToPdf(out, { title: report.title });
}
