/**
 * محرّك MathJax (TeX ← SVG). ملف ثقيل يُحمَّل عند أول معادلة فقط (core/math.js).
 * النص داخل \text (ومنه العربي) يُكتب كلمة واحدة بخط النظام حتى تتصل حروفه،
 * ويُقاس عرضه بلوحة رسم حقيقية في المتصفح.
 */

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { SerializedMmlVisitor } from 'mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js';
import { STATE } from 'mathjax-full/js/core/MathItem.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';

const TEXT_FONT = 'serif';
const adaptor = liteAdaptor();

// قياس النص الحقيقي (العربي خاصة) بدل التقدير الثابت لكل حرف
if (typeof document !== 'undefined') {
  const ctx = document.createElement('canvas').getContext('2d');
  adaptor.nodeSize = function nodeSize(node, em = 1) {
    const text = this.textContent(node);
    const fs = parseFloat(this.getAttribute(node, 'font-size')) || em;
    ctx.font = `${fs}px ${TEXT_FONT}`;
    return [ctx.measureText(text).width / em, 0.8];
  };
}

RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'noundefined'] }),
  OutputJax: new SVG({ fontCache: 'none', mtextFont: TEXT_FONT }),
});
const toMml = new SerializedMmlVisitor();

const cache = new Map();

/**
 * يحوّل TeX إلى SVG بوحدات em (يتبع حجم الخط حوله).
 * @returns {{ svg: string, w: number, h: number, d: number } | null} null عند خطأ في الصيغة
 */
export function svg(tex, display = false) {
  const key = `${display ? 'D' : 'I'}${tex}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const node = doc.convert(tex, { display, em: 16, ex: 8 });
    const s = adaptor.innerHTML(node);
    if (!/data-mml-node="merror"/.test(s)) {
      const vb = s.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
      if (vb) {
        const [, , y, w, h] = vb.map(Number);
        const W = w / 1000;
        const H = h / 1000;
        const D = Math.max(0, (h + y) / 1000);
        const markup = s
          .replace(/ width="[^"]*"/, ` width="${W.toFixed(3)}em"`)
          .replace(/ height="[^"]*"/, ` height="${H.toFixed(3)}em"`)
          .replace(/ style="[^"]*"/, ` style="vertical-align:${(-D).toFixed(3)}em;direction:ltr"`);
        out = { svg: markup, w: W, h: H, d: D };
      }
    }
  } catch { out = null; }
  if (cache.size > 800) cache.clear();
  cache.set(key, out);
  return out;
}

/** MathML (لمعادلات Word القابلة للتعديل). */
export function mathml(tex, display = false) {
  try {
    const root = doc.convert(tex, { display, end: STATE.CONVERT });
    const s = toMml.visitTree(root);
    return /<merror/.test(s) ? null : s;
  } catch { return null; }
}

/** شجرة MathML الداخلية (للتحويل إلى معادلات Word). */
export function mmlTree(tex, display = false) {
  try {
    return doc.convert(tex, { display, end: STATE.CONVERT });
  } catch { return null; }
}

/**
 * صورة PNG بخلفية شفافة وحبر أسود.
 * fontPx: حجم الخط بالبكسل (14pt = 18.67px)، scale: دقة إضافية للطباعة.
 * @returns {Promise<{ data: Uint8Array, w: number, h: number, d: number } | null>} الأبعاد بالبكسل عند 96 نقطة/بوصة
 */
export async function png(tex, { display = false, fontPx = 18.67, scale = 3 } = {}) {
  const r = svg(tex, display);
  if (!r || typeof document === 'undefined') return null;
  const W = r.w * fontPx;
  const H = r.h * fontPx;
  const markup = r.svg
    .replace(/currentColor/g, '#000')
    .replace(/ width="[^"]*"/, ` width="${W}"`)
    .replace(/ height="[^"]*"/, ` height="${H}"`)
    .replace(/ style="[^"]*"/, '');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  try { await img.decode(); } catch { return null; }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W * scale));
  c.height = Math.max(1, Math.ceil(H * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (!blob) return null;
  return { data: new Uint8Array(await blob.arrayBuffer()), w: W, h: H, d: r.d * fontPx };
}
