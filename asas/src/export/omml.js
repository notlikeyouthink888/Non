/**
 * معادلات Word قابلة للتعديل: تحويل شجرة MathML الداخلية من MathJax إلى عناصر معادلات docx
 * (كسور وجذور وأسس ودلائل ومجاميع وتكاملات وأقواس). ما لا يُدعم يُرمى خطأً فتُستعمل الصورة بدله.
 */

import {
  Math as DocxMath, MathRun, MathFraction, MathRadical, MathSuperScript, MathSubScript, MathSubSuperScript,
  MathSum, MathIntegral, MathRoundBrackets, MathSquareBrackets, MathCurlyBrackets, MathAngledBrackets,
} from 'docx';

const NARY_SUM = new Set(['∑', '∏']);
const NARY_INT = new Set(['∫', '∬', '∭', '∮']);
const INVISIBLE = /^[⁡⁢⁣⁤]$/;
const BRACKETS = { '(': [MathRoundBrackets, ')'], '[': [MathSquareBrackets, ']'], '{': [MathCurlyBrackets, '}'], '⟨': [MathAngledBrackets, '⟩'] };

class Unsupported extends Error {}

const kids = (n) => (n.childNodes || []).filter(Boolean);
const textOf = (n) => (typeof n.getText === 'function' ? n.getText() : kids(n).map(textOf).join(''));

/** يجرّد الأغلفة (TeXAtom، mrow المستنتج، mstyle) ليصل إلى العنصر الفعلي. */
function core(n) {
  let x = n;
  while (x && ['TeXAtom', 'mstyle', 'mpadded', 'semantics'].includes(x.kind) && kids(x).length === 1) x = kids(x)[0];
  while (x && x.kind === 'mrow' && kids(x).length === 1) x = kids(x)[0];
  return x;
}

/** المشغّل الكبير (∑ أو ∫) في عنصر ما، مع حدوده إن وُجدت. */
function naryOf(n) {
  const c = core(n);
  if (!c) return null;
  const isOp = (x) => { const y = core(x); return y && y.kind === 'mo' && (NARY_SUM.has(textOf(y)) || NARY_INT.has(textOf(y))) ? textOf(y) : null; };
  const op = isOp(c);
  if (op) return { op };
  if (['msubsup', 'munderover', 'msub', 'munder', 'msup', 'mover'].includes(c.kind)) {
    const [base, a, b] = kids(c);
    const o = isOp(base);
    if (!o) return null;
    const lower = ['msubsup', 'munderover', 'msub', 'munder'].includes(c.kind) ? a : null;
    const upper = c.kind === 'msubsup' || c.kind === 'munderover' ? b : c.kind === 'msup' || c.kind === 'mover' ? a : null;
    return { op: o, lower, upper };
  }
  return null;
}

/** صف من العناصر: المشغّل الكبير يأخذ ما بعده جسمًا له، والأقواس الممتدة تُجمع. */
function row(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    const nary = naryOf(n);
    if (nary) {
      const body = row(list.slice(i + 1));
      const opts = {
        children: body.length ? body : [new MathRun('')],
        ...(nary.lower ? { subScript: conv(nary.lower) } : {}),
        ...(nary.upper ? { superScript: conv(nary.upper) } : {}),
      };
      if (NARY_SUM.has(nary.op)) out.push(new MathSum(opts));
      else {
        if (nary.op !== '∫') throw new Unsupported(nary.op);
        out.push(new MathIntegral(opts));
      }
      return out;
    }
    out.push(...conv(n));
  }
  return out;
}

/** يحوّل عنصرًا إلى مكوّنات معادلة docx. */
function conv(n) {
  if (!n) return [];
  switch (n.kind) {
    case 'math': case 'mrow': case 'inferredMrow': case 'TeXAtom': case 'mstyle': case 'mpadded': case 'semantics': {
      const ch = kids(n);
      // \left( … \right): قوسان ممتدان حول المحتوى
      if (ch.length >= 2) {
        const first = core(ch[0]);
        const last = core(ch[ch.length - 1]);
        if (first?.kind === 'mo' && last?.kind === 'mo') {
          const o = textOf(first);
          const br = BRACKETS[o];
          if (br && textOf(last) === br[1]) return [new br[0]({ children: row(ch.slice(1, -1)) })];
        }
      }
      return row(ch);
    }
    case 'mi': case 'mn': case 'mtext': case 'ms': {
      const t = textOf(n);
      return t ? [new MathRun(t)] : [];
    }
    case 'mo': {
      const t = textOf(n);
      if (!t || INVISIBLE.test(t)) return [];
      return [new MathRun(t)];
    }
    case 'mspace': return [];
    case 'mphantom': return [];
    case 'mfrac': {
      const [a, b] = kids(n);
      return [new MathFraction({ numerator: conv(a), denominator: conv(b) })];
    }
    case 'msqrt': return [new MathRadical({ children: row(kids(n)) })];
    case 'mroot': {
      const [a, b] = kids(n);
      return [new MathRadical({ children: conv(a), degree: conv(b) })];
    }
    case 'msup': case 'mover': {
      const [a, b] = kids(n);
      if (n.kind === 'mover') {
        // \bar{x}: حرف بشرطة فوقه
        const acc = textOf(core(b) || b);
        if (/^[¯‾_̅¯―–—-]$/.test(acc)) return [new MathRun(`${textOf(a)}̅`)];
        throw new Unsupported('mover');
      }
      return [new MathSuperScript({ children: conv(a), superScript: conv(b) })];
    }
    case 'msub': case 'munder': {
      const [a, b] = kids(n);
      return [new MathSubScript({ children: conv(a), subScript: conv(b) })];
    }
    case 'msubsup': case 'munderover': {
      const [a, b, c] = kids(n);
      return [new MathSubSuperScript({ children: conv(a), subScript: conv(b), superScript: conv(c) })];
    }
    default:
      throw new Unsupported(n.kind);
  }
}

/**
 * معادلة Word من شجرة MathJax، أو null إن كان فيها ما لا يُدعم (عربي، مصفوفات...).
 * tree: من mmlTree() في core/mathjax.js
 */
export function docxMath(tree) {
  if (!tree) return null;
  try {
    const children = conv(tree);
    if (!children.length) return null;
    return new DocxMath({ children });
  } catch {
    return null;
  }
}

/** هل في المعادلة نص عربي؟ (يُرسم صورة حتى لا تنقلب حروفه في Word). */
export const hasArabic = (tex) => /[؀-ۿ]/.test(tex);
