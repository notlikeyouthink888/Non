/**
 * عرض المعادلات في الصفحة: محرّك MathJax يُحمَّل عند الحاجة (ملف منفصل)، وكل معادلة
 * تظهر بنصّها الأصلي لحظة ثم تُستبدل برسم SVG واضح يتبع حجم الخط ولونه ويُطبع متجهيًّا.
 */

import { h } from './dom.js';
import { bidi } from './arabic.js';
import { mathPieces } from './mathconv.js';

let engine = null;
let loading = null;

/** يحمّل المحرّك مرة واحدة. */
export function loadMath() {
  if (engine) return Promise.resolve(engine);
  loading ||= import('./mathjax.js').then((m) => (engine = m)).catch((e) => { loading = null; throw e; });
  return loading;
}

/** المحرّك إن كان محمّلًا. */
export const mathEngine = () => engine;

const AR = /[؀-ۿ]/;

/**
 * عنصر معادلة واحدة.
 * display: كسور بحجم كامل (أسطر المعادلات والحسابات)، وإلا بحجم السطر.
 */
export function mathEl(tex, { display = false, src = '' } = {}) {
  const el = h(`span.mx${display ? '.mx-d' : ''}`, { dir: 'ltr', title: src || undefined });
  const fill = () => {
    const r = engine.svg(tex, display);
    if (r) { el.innerHTML = r.svg; el.classList.remove('mx-wait'); } else { el.textContent = src || tex; el.className = 'mx mx-err'; }
  };
  if (engine) fill();
  else {
    el.textContent = src || tex;
    el.classList.add('mx-wait');
    loadMath().then(fill).catch(() => el.classList.remove('mx-wait'));
  }
  return el;
}

/** تحتوي المعادلة كسرًا أو جذرًا أو مجموعًا؟ تُعرض حينها بحجم كامل داخل السطر. */
export const isTall = (tex) => /\\frac|\\sum|\\int|\\iint|\\oint|\\prod|\\sqrt\{[^}]*\\frac/.test(tex);

/** هل سطر المعادلة يُقرأ من اليمين (فيه تسمية أو شرح عربي)؟ */
export function eqLineRTL(parts) {
  return parts.some((p) => p.t === 'label' || p.t === 'note' || (p.t === 'text' && AR.test(p.s)));
}

/** سطر من كتلة معادلات: تسمية عربية ومعادلات وفواصل وشرح. */
export function eqLineEl(line) {
  const parts = mathPieces(line);
  const rtl = eqLineRTL(parts);
  return h('div.eql', { dir: rtl ? 'rtl' : 'ltr' }, parts.map((p) => {
    if (p.t === 'math') return mathEl(p.tex, { display: true, src: p.src });
    if (p.t === 'label') return h('span.eq-lb', `${bidi(p.s)}:`);
    if (p.t === 'note') {
      return h('span.eq-nt', ['(', ...p.parts.map((x) => (x.math !== undefined ? mathEl(x.math, { src: x.src }) : document.createTextNode(bidi(x.text)))), ')']);
    }
    return h('span.eq-tx', rtl ? p.s : ltrSep(p.s));
  }));
}

/** الفواصل في سطر يُقرأ من اليسار: ← تصبح ⟹، والفاصلة العربية لاتينية. */
export function ltrSep(s) {
  return s === '←' ? '⟹' : s === '،' ? ',' : s === '؛' ? ';' : s;
}
