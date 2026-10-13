/**
 * تحويل المعادلات المكتوبة نصًّا عاديًا (σ = P / A) إلى TeX فيه كسور حقيقية وأسس ودلائل سفلية،
 * وتقسيم أسطر المعادلات والفقرات العربية إلى مقاطع نصية ومقاطع رياضية تُرسم صورًا.
 * لا يعتمد على المتصفح، فيُختبر في Node على كل معادلات قاعدة المعرفة.
 */

const AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const AR_G = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;

const GREEK = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', µ: '\\mu', ν: '\\nu', ξ: '\\xi',
  π: '\\pi', ρ: '\\rho', σ: '\\sigma', ς: '\\varsigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi',
  ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
};
const GREEK_RE = /[α-ωϵϑϕςµΓΘΛΞΦΨΩ]/;
const LETTER = /[A-Za-zα-ωϵϑϕςµΓΘΛΞΦΨΩ]/;

const SUP_CH = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ';
const SUP_TO = '0123456789+-=()ni';
const SUB_CH = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼ';
const SUB_TO = '0123456789+-=()aeoxhklmnpstij';

/** الدوال المعروفة. */
const FUNCS = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc', cosec: '\\csc',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', coth: '\\coth', arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan',
  ln: '\\ln', log: '\\log', exp: '\\exp', lim: '\\lim', max: '\\max', min: '\\min', det: '\\det', arg: '\\arg',
  atan2: '\\operatorname{atan2}', adj: '\\operatorname{adj}', tr: '\\operatorname{tr}', sgn: '\\operatorname{sgn}',
};
/** اختصارات تُكتب بخط قائم (أسماء لا حاصل ضرب حروف). */
const NAMES = new Set(['HV', 'BHN', 'HRC', 'HRB', 'CF', 'FM', 'AIV', 'ACV', 'RL', 'HI', 'BS', 'FS', 'IS', 'SD', 'HD', 'VD', 'BB', 'FB',
  'SG', 'Re', 'Fr', 'Eu', 'We', 'Ma', 'CBR', 'Vol', 'Az', 'TP', 'LL', 'PI', 'OD', 'SSD', 'MDD', 'OMC', 'DRUW', 'CN', 'CE', 'Gs', 'FL', 'FR']);
/** كلمات تُكتب دليلًا سفليًا قائمًا: σmax ← σ_max. */
const SUBWORDS = new Set(['max', 'min', 'avg', 'allow', 'cr', 'act', 'th', 'true', 'gauge', 'abs', 'atm', 'exp', 'cal', 'lat',
  'net', 'total', 'eff', 'ult', 'req', 'top', 'cyl', 'cube', 'proj', 'above', 'station', 'measured', 'design', 'mean', 'old', 'new']);
/** كلمات إنجليزية قصيرة تبقى نصًّا. */
const EN_SHORT = new Set(['of', 'on', 'and', 'or', 'the', 'to', 'for', 'per', 'set', 'Air', 'air', 'Cut', 'no', 'at', 'in', 'by', 'is', 'with', 'from', 'if', 'as']);
const VULGAR = { '½': '\\frac{1}{2}', '¼': '\\frac{1}{4}', '¾': '\\frac{3}{4}', '⅓': '\\frac{1}{3}', '⅔': '\\frac{2}{3}', '⅛': '\\frac{1}{8}' };
/** الوحدات بعد الأرقام. */
const UNITS = new Set(['mm', 'cm', 'm', 'km', 'µm', 'μm', 'nm', 'kN', 'N', 'MN', 'MPa', 'GPa', 'kPa', 'Pa', 'kg', 'g', 'kgf', 'gf', 's', 'ms',
  'µs', 'μs', 'min', 'hr', 'L', 'ml', 'mL', 'J', 'kJ', 'kW', 'rad', 'Hz', 'rpm', 'ha', 'mol', 'dB', 'kWh']);
const UNIT_ATTACH = new Set([...UNITS].filter((u) => u.length > 1));
const DIFF = /^d([xyztuvrsθφAVMQhpwF])$/;
const CHEM_EL = '(?:Ca|Si|Al|Fe|Ba|Mg|Na|Cl|K|S|O|C|A|F|H|N)';
const CHEM = new RegExp(`^(?:${CHEM_EL}\\d*){2,}$`);
const STD_CODE = /\b(?:ASTM|AASHTO|ACI|ASCE|BS|EN|ISO|IQS|IS|DIN|ANSI|BSI|IRS)\b/;

const REL = { '=': '=', '≈': '\\approx', '≅': '\\cong', '≃': '\\simeq', '~': '\\sim', '≤': '\\le', '⩽': '\\le', '≥': '\\ge', '⩾': '\\ge',
  '<': '<', '>': '>', '≠': '\\ne', '→': '\\to', '⇒': '\\Rightarrow', '⟹': '\\Longrightarrow', '⇔': '\\Leftrightarrow', '↔': '\\leftrightarrow',
  '≡': '\\equiv', '∝': '\\propto', ':': ':', '∴': '\\therefore', '≪': '\\ll', '≫': '\\gg', '∈': '\\in' };
const ADD = { '+': '+', '-': '-', '−': '-', '±': '\\pm', '∓': '\\mp' };
const MUL = { '·': '\\cdot', '⋅': '\\cdot', '•': '\\cdot', '∙': '\\cdot', '×': '\\times', '*': '\\cdot', '∗': '\\cdot', '/': '/', '÷': '/' };
const SEPS = { ',': ',\\,', ';': ';\\;' };

const isDigit = (c) => c >= '0' && c <= '9';
const letterTex = (ch) => GREEK[ch] || ch;

/* ── المحلّل اللفظي ─────────────────────────────────── */

function readBalanced(s, i, open, close) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

function lex(src) {
  const s = String(src).replace(/ /g, ' ').replace(/\.\.\./g, '…');
  const toks = [];
  let i = 0;
  let sp = false;
  const push = (t, v, extra = {}) => { toks.push({ t, v, sp, ...extra }); sp = false; };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { sp = true; i++; continue; }

    // محطة مساحية: 0+060
    const st = isDigit(c) && s.slice(i).match(/^(\d+)\+(\d{3})(?!\d)/);
    if (st && !isDigit(s[i - 1] || '')) { push('num', `${st[1]}{+}${st[2]}`); i += st[0].length; continue; }
    // رقم، مع تجميع الآلاف بمسافات: 88 826 000
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1] || ''))) {
      const m = s.slice(i).match(/^\d*\.?\d+/);
      let v = m[0];
      i += v.length;
      if (/^\d{1,3}$/.test(v)) {
        let g;
        while ((g = s.slice(i).match(/^ (\d{3})(?![\d])(\.\d+)?/))) {
          v += `\\,${g[1]}${g[2] || ''}`;
          i += g[0].length;
          if (g[2]) break;
        }
      }
      push('num', v);
      continue;
    }

    if (VULGAR[c]) { push('num', VULGAR[c]); i++; continue; }
    if (c === 'ȳ') { push('id', 'ȳ'); i++; continue; }
    if (LETTER.test(c) && !'ΣΠΔ'.includes(c)) {
      let j = i;
      while (j < s.length && ((LETTER.test(s[j]) && !'ΣΠΔ'.includes(s[j])) || isDigit(s[j]) || s[j] === '̄' || s[j] === '̅')) j++;
      // «σ1,2»: فاصلة بين رقمين ملاصقين تبقى ضمن الدليل
      if (/^,\d/.test(s.slice(j)) && /\d$/.test(s.slice(i, j))) { j += 2; while (isDigit(s[j] || '')) j++; }
      const raw = s.slice(i, j);
      let primes = '';
      while ("′'‘’″‴".includes(s[j] || '\0') && j < s.length) { primes += s[j] === '″' ? "''" : s[j] === '‴' ? "'''" : "'"; j++; }
      let after = '';
      if (primes) { let k = j; while (k < s.length && (LETTER.test(s[k]) || isDigit(s[k]))) k++; after = s.slice(j, k); j = k; }
      push('id', raw, { primes, after });
      i = j;
      continue;
    }
    if (AR.test(c)) {
      const m = s.slice(i).match(/^[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:\s+[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+)*/);
      push('ar', m[0].replace(/[،؛]/g, ''));
      i += m[0].length;
      continue;
    }
    if (c === '^') {
      const n = s[i + 1];
      if (n === '(') { const [inner, j] = readBalanced(s, i + 1, '(', ')'); push('sup', inner); i = j; continue; }
      if (n === '{') { const [inner, j] = readBalanced(s, i + 1, '{', '}'); push('sup', inner, { tex: true }); i = j; continue; }
      const m = s.slice(i + 1).match(/^[−\-+]?(?:\d*\.?\d+|[A-Za-zα-ω][0-9]*|[A-Za-z]+)/);
      push('sup', m ? m[0] : '');
      i += 1 + (m ? m[0].length : 0);
      continue;
    }
    if (SUP_CH.includes(c)) {
      let v = '';
      while (i < s.length && SUP_CH.includes(s[i])) { v += SUP_TO[SUP_CH.indexOf(s[i])]; i++; }
      push('sup', v);
      continue;
    }
    if (c === '_') {
      const n = s[i + 1];
      if (n === '(') { const [inner, j] = readBalanced(s, i + 1, '(', ')'); push('sub', inner, { explicit: true }); i = j; continue; }
      if (n === '{') { const [inner, j] = readBalanced(s, i + 1, '{', '}'); push('sub', inner, { explicit: true, tex: true }); i = j; continue; }
      const m = s.slice(i + 1).match(/^[A-Za-z0-9α-ω]+/);
      push('sub', m ? m[0] : '', { explicit: true });
      i += 1 + (m ? m[0].length : 0);
      continue;
    }
    if (SUB_CH.includes(c)) {
      let v = '';
      while (i < s.length && SUB_CH.includes(s[i])) { v += SUB_TO[SUB_CH.indexOf(s[i])]; i++; }
      push('sub', v);
      continue;
    }
    if (c === '√') { push('sqrt', 2); i++; continue; }
    if (c === '∛') { push('sqrt', 3); i++; continue; }
    if (c === '∜') { push('sqrt', 4); i++; continue; }
    const big = { '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', Σ: '\\sum', '∑': '\\sum', Π: '\\prod', '∏': '\\prod' }[c];
    if (big) { push('big', big); i++; continue; }
    const sym = { Δ: '\\Delta', '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty', '∅': '\\emptyset' }[c];
    if (sym) { push('sym', sym); i++; continue; }
    if (c === '…' || c === '⋯') { push('dots', '\\cdots'); i++; continue; }
    if (c === '°') { push('deg', ''); i++; continue; }
    if (c === '%') { push('pct', ''); i++; continue; }
    if (c === '!') { push('fact', ''); i++; continue; }
    if ("′″‴'".includes(c)) { push('prime', c === '″' ? "''" : c === '‴' ? "'''" : "'"); i++; continue; }
    if ('([{'.includes(c)) { push('open', c); i++; continue; }
    if (')]}'.includes(c)) { push('close', c); i++; continue; }
    if (c === '|') { push('bar', '|'); i++; continue; }
    if (c === '–' || c === '—') { push('dash', c); i++; continue; }
    if (REL[c] || ADD[c] || MUL[c] || SEPS[c]) { push('op', c); i++; continue; }
    if (c === '،' || c === '؛') { push('op', c === '،' ? ',' : ';'); i++; continue; }
    push('raw', c);
    i++;
  }
  return toks;
}

/* ── المعرّفات ──────────────────────────────────────── */

function isWord(raw) {
  if (EN_SHORT.has(raw)) return true;
  return raw.length >= 4 && /^[A-Za-z][a-z]+$/.test(raw) && /[aeiouy]/i.test(raw);
}

function chemTex(raw) {
  return `\\mathrm{${raw.replace(/(\d+)/g, '_{$1}')}}`;
}

/** حاصل ضرب حروف: nπx ← n π x، وa22a33 ← a_{22} a_{33}. */
function productTex(raw) {
  return (raw.match(/[A-Za-zα-ωϵϑϕςµΓΘΛΞΦΨΩ][̄]?\d*/g) || [raw]).map((u) => {
    const bar = u.includes('̄');
    const ch = u[0];
    const dg = u.replace(/^.̄?/, '');
    const b = bar ? `\\bar{${letterTex(ch)}}` : letterTex(ch);
    return dg ? `${b}_{${dg}}` : b;
  }).join(' ');
}

function subText(rest) {
  if (SUBWORDS.has(rest) || (rest.length >= 3 && /^[a-z]+$/.test(rest) && /[aeiou]/.test(rest))) return `\\mathrm{${rest}}`;
  return [...rest].map((c) => (GREEK[c] ? `${GREEK[c]} ` : c)).join('').trim();
}

/** يحوّل معرّفًا واحدًا. يعيد { tex, word?, func?, diff? }. */
function idTex(raw, mode = {}) {
  if (FUNCS[raw]) return { tex: FUNCS[raw], func: true };
  const plain = raw.replace(/[̄̅]/g, '');
  const bar = plain !== raw;
  if (bar) {
    const t = idTex(plain, mode).tex;
    const m = t.match(/^(\\[a-zA-Z]+|[A-Za-z])(.*)$/);
    return { tex: m ? `\\bar{${m[1]}}${m[2]}` : `\\bar{${t}}` };
  }
  if (NAMES.has(raw)) return { tex: `\\mathrm{${raw}}` };
  if (mode.exp || mode.afterFunc || mode.sub) return { tex: productTex(raw) };
  const nm = raw.match(/^([A-Z]{2,})([a-z0-9]{1,3})$/);
  if (nm && NAMES.has(nm[1])) return { tex: `\\mathrm{${nm[1]}}_{${nm[2]}}` };
  if (CHEM.test(raw) && (/\d/.test(raw) || /Ca|Si|Al|Fe|Ba|Mg|Na/.test(raw))) return { tex: chemTex(raw) };
  if (/^[A-Z]{3,}$/.test(raw)) return { tex: `\\mathrm{${raw}}` };
  const sw = raw.match(/^([A-Za-zα-ωΓΘΛΞΦΨΩ])([a-z]{2,})$/);
  if (sw && SUBWORDS.has(sw[2])) return { tex: `${letterTex(sw[1])}_{\\mathrm{${sw[2]}}}` };
  if (isWord(raw)) return { tex: raw, word: true };
  const df = raw.match(DIFF);
  if (df) return { tex: `d${letterTex(df[1]).startsWith('\\') ? ' ' : ''}${letterTex(df[1])}`, diff: true };
  if (/^[xyz]{2,}$/.test(raw)) return { tex: productTex(raw) };
  // vx وax ضرب، أما fx وfxy وux فمشتقات جزئية بدليل سفلي
  if (/^[a-z][xyzt]+$/.test(raw) && !'fgu'.includes(raw[0])) return { tex: productTex(raw) };
  if (/^(?:[A-Za-zα-ω]\d+){2,}$/.test(raw)) return { tex: productTex(raw) };
  if (/^[A-Za-z]+[α-ωΓΘΛΞΦΨΩ]/.test(raw) && !/^[A-Z][α-ω]$/.test(raw)) return { tex: productTex(raw) };

  const base = raw[0];
  const rest = raw.slice(1);
  const b = letterTex(base);
  if (!rest) return { tex: b };
  if (/^[\d,]+$/.test(rest)) return { tex: `${b}_{${rest}}` };
  if (GREEK_RE.test(base)) {
    if (base === 'λ' || (/^[A-Z]/.test(rest) && !'δστε'.includes(base))) return { tex: productTex(raw) };
    return { tex: `${b}_{${subText(rest)}}` };
  }
  if (/[A-Z]/.test(base) && /^[A-Z]+$/.test(rest)) return { tex: productTex(raw) };
  return { tex: `${b}_{${subText(rest)}}` };
}

/** دليل سفلي صريح بعد _ : كلمة ← قائم، صيغة كيميائية ← قائمة، وإلا كما هو. */
function explicitSub(v, tex) {
  if (tex) return v;
  if (SUBWORDS.has(v)) return `\\mathrm{${v}}`;
  if (CHEM.test(v) && /\d/.test(v)) return chemTex(v);
  if (/^[A-Za-z]+$/.test(v)) return v.length >= 3 && /[a-z]/.test(v) ? `\\mathrm{${v}}` : v;
  return convertExpr(v, { sub: true });
}

/* ── المحلّل النحوي ─────────────────────────────────── */

const node = (tex, o = {}) => ({ tex, ...o });
const TALL = /\\frac|\\sum|\\int|\\prod|\\iint|\\oint/;

function texEscape(c) {
  return { '#': '\\#', $: '\\$', '&': '\\&', '\\': '\\backslash ', '{': '\\{', '}': '\\}', '"': "''", '?': '?' }[c] ?? c;
}

class Parser {
  constructor(toks, mode) {
    this.toks = toks;
    this.p = 0;
    this.mode = mode;
    this.absDepth = 0;
  }

  peek(k = 0) { return this.toks[this.p + k]; }
  next() { return this.toks[this.p++]; }
  isOp(tok, set) { return tok && tok.t === 'op' && set[tok.v] !== undefined; }

  parseList(closer) {
    const parts = [];
    let tall = false;
    while (this.p < this.toks.length) {
      const t = this.peek();
      if (t.t === 'close' && (!closer || closer.includes(t.v))) break;
      if (t.t === 'bar' && this.absDepth > 0 && closer === '|') break;
      if (this.isOp(t, SEPS)) { this.next(); parts.push(SEPS[t.v]); continue; }
      const before = this.p;
      const n = this.parseRel(closer);
      if (n.tex) { parts.push(n.tex); tall ||= n.tall; }
      if (this.p === before) { // رمز لا يُفهم: يُكتب كما هو حتى لا يعلق التحليل
        const x = this.next();
        if (x.t === 'close' || x.t === 'bar') parts.push(texEscape(x.v));
        else parts.push(texEscape(x.v || ''));
      }
    }
    return node(parts.join(' '), { tall });
  }

  parseRel(closer) {
    const parts = [];
    let tall = false;
    let n = this.parseAdd(closer);
    parts.push(n.tex); tall ||= n.tall;
    while (this.isOp(this.peek(), REL)) {
      const op = this.next();
      parts.push(REL[op.v]);
      n = this.parseAdd(closer);
      parts.push(n.tex); tall ||= n.tall;
    }
    const tex = parts.filter((x) => x !== '').join(' ');
    return node(tex, { tall, single: parts.length === 1 ? n : null });
  }

  parseAdd(closer) {
    const parts = [];
    let tall = false;
    let last = null;
    if (this.isOp(this.peek(), ADD)) parts.push(ADD[this.next().v]);
    last = this.parseMul(closer);
    parts.push(last.tex); tall ||= last.tall;
    while (this.isOp(this.peek(), ADD)) {
      parts.push(ADD[this.next().v]);
      last = this.parseMul(closer);
      parts.push(last.tex); tall ||= last.tall;
    }
    const tex = parts.filter((x) => x !== '').join(' ');
    return parts.length === 1 ? last : node(tex, { tall });
  }

  parseMul(closer) {
    let acc = this.parseRun(closer);
    let prefix = null; // ما قبل آخر حدّ مع عمليته: لمشتقة مثل EI·d²y/dx²
    let lastRun = acc;
    while (this.isOp(this.peek(), MUL)) {
      const op = this.next();
      const isDiv = op.v === '/' || op.v === '÷';
      const rhs = this.parseRun(closer, isDiv);
      if (!rhs.tex) { acc = node(`${acc.tex} ${isDiv ? '/' : MUL[op.v]}`, { tall: acc.tall }); break; }
      if (isDiv) {
        if (!acc.tex) { acc = node(`/ ${rhs.tex}`); continue; }
        const frac = (a, b) => node(`\\frac{${this.unwrap(a)}}{${this.unwrap(b)}}`, { tall: true, frac: true });
        if (prefix && isDerivNum(lastRun) && isDiffTex(rhs.tex)) {
          lastRun = frac(lastRun, rhs);
          acc = node(`${prefix.tex} ${lastRun.tex}`, { tall: true });
        } else {
          acc = frac(acc, rhs);
          lastRun = acc;
          prefix = null;
        }
      } else {
        prefix = node(`${this.bare(acc)} ${MUL[op.v]}`, { tall: acc.tall });
        acc = node(`${prefix.tex} ${this.bare(rhs)}`, { tall: acc.tall || rhs.tall });
        lastRun = rhs;
      }
    }
    return acc;
  }

  /** مقام الكسر وبسطه بلا أقواسهما الخارجية. */
  unwrap(n) { return n.group && '(['.includes(n.group.o) && !n.call && !/,\\,/.test(n.group.inner) ? n.group.inner : n.tex; }
  /** كسر منفرد بين قوسين يُكتب بلا قوسين حين يُضرب: (4/π)·x ← 4π·x. */
  bare(n) { return n.loneFrac ? n.group.inner : n.tex; }

  canStart(t) {
    if (!t) return false;
    if (t.t === 'bar') return this.absDepth === 0 || !this.lastWasOperand;
    return ['num', 'id', 'ar', 'open', 'sqrt', 'big', 'sym', 'dots', 'raw', 'dash', 'pct', 'sup', 'sub', 'deg', 'prime'].includes(t.t)
      && !(t.t === 'raw' && t.v === '?');
  }

  /** حدود متجاورة بلا عملية صريحة (2πr، ‎3 P). في المقام تتوقف بعد التفاضل: d/dx sinh x. */
  parseRun(closer, denom = false) {
    const parts = [];
    let tall = false;
    let afterFunc = false;
    let count = 0;
    while (this.canStart(this.peek())) {
      const t = this.peek();
      if (t.t === 'bar' && this.absDepth > 0 && count > 0) break;
      if (denom && count > 0 && (parts[0].diff || (parts[0].tex === '\\partial' && count > 1))) break;
      const f = this.parseFactor(afterFunc);
      afterFunc = !!f.func;
      const prev = parts[parts.length - 1];
      if (f.word && prev?.word) {
        prev.words.push(f.words[0]);
        prev.tex = `\\text{${prev.words.join(' ')}}`;
        continue;
      }
      if (f.diff && parts.length) f.tex = `\\,${f.tex}`;
      if (prev && (f.word !== prev.word) && !f.group && !prev.group) f.tex = `\\ ${f.tex}`;
      parts.push(f);
      tall ||= f.tall;
      count++;
    }
    this.lastWasOperand = count > 0;
    if (parts.length === 1) return parts[0];
    if (!parts.length) return node('');
    // كسر منفرد بين قوسين داخل حدود متجاورة يُكتب بلا قوسين: ∫ (dy/g(y)) ← ∫ dy/g(y)
    const tex = parts.map((x, k) => (x.loneFrac && !x.call && k > 0 ? x.group.inner : x.tex)).join(' ');
    return node(tex, { tall, diff: parts[0].diff && parts.length === 1 });
  }

  parseGroup(openTok) {
    const o = openTok.v;
    const c = { '(': ')', '[': ']', '{': '}' }[o];
    const inner = this.parseList(c);
    if (this.peek()?.t === 'close') this.next();
    const lo = o === '{' ? '\\{' : o;
    const lc = c === '}' ? '\\}' : c;
    const tex = inner.tall ? `\\left${lo} ${inner.tex} \\right${lc}` : `${lo}${inner.tex}${lc}`;
    const loneFrac = o === '(' && /^\\frac\{/.test(inner.tex) && balancedFrac(inner.tex);
    return node(tex, { tall: inner.tall, group: { o, c, inner: inner.tex }, loneFrac });
  }

  parseFactor(afterFunc) {
    const t = this.next();
    let n;
    switch (t.t) {
      case 'num': n = node(t.v); break;
      case 'id': n = this.parseId(t, afterFunc); break;
      case 'ar': n = node(`\\text{${t.v}}`); break;
      case 'open': n = this.unitGroup(t) || this.parseGroup(t); break;
      case 'bar': {
        this.absDepth++;
        const inner = this.parseList('|');
        this.absDepth--;
        if (this.peek()?.t === 'bar') this.next();
        n = node(inner.tall ? `\\left| ${inner.tex} \\right|` : `|${inner.tex}|`, { tall: inner.tall });
        break;
      }
      case 'sqrt': {
        let arg;
        const nx = this.peek();
        if (nx && nx.t === 'open') { this.next(); const g = this.parseGroup(nx); arg = g.group.inner; } else if (nx && this.canStart(nx)) {
          const a = this.parseFactor(false, true);
          arg = a.group ? a.group.inner : a.tex;
        } else arg = '';
        n = node(t.v === 2 ? `\\sqrt{${arg}}` : `\\sqrt[${t.v}]{${arg}}`, { tall: TALL.test(arg) });
        break;
      }
      case 'big': {
        let tex = t.v;
        let sub = null;
        let sup = null;
        for (let k = 0; k < 2; k++) {
          const nx = this.peek();
          if (nx?.t === 'sub' && sub === null && !nx.sp) {
            this.next();
            let v = nx.v;
            // ∫₋L: إشارة سالبة سفلية يتبعها الحد نفسه
            if (/^[-+]$/.test(v) && ['id', 'num'].includes(this.peek()?.t)) v += this.next().v;
            sub = nx.explicit ? explicitSub(v, nx.tex) : convertExpr(v, { sub: true });
          } else if (nx?.t === 'sup' && sup === null && !nx.sp) {
            this.next();
            sup = nx.tex ? nx.v : convertExpr(nx.v, { exp: true });
          }
        }
        if (sub !== null) tex += `_{${sub}}`;
        if (sup !== null) tex += `^{${sup}}`;
        n = node(tex, { tall: true });
        break;
      }
      case 'sym': n = node(t.v); break;
      case 'dots': n = node(t.v); break;
      case 'dash': n = node('\\text{–}'); break;
      case 'pct': n = node('\\%'); break;
      case 'deg': n = node('{}^{\\circ}'); break;
      case 'prime': n = node(`{}${t.v}`); break;
      case 'sup': n = node(`{}^{${convertExpr(t.v, { exp: true })}}`); break;
      case 'sub': n = node(`{}_{${convertExpr(t.v, { sub: true })}}`); break;
      default: n = node(texEscape(t.v || ''));
    }
    if (t.t === 'num') {
      n = this.postfix(n);
      this.sci(n);
      this.unit(n);
      return n;
    }
    return this.postfix(n);
  }

  parseId(t, afterFunc) {
    const r = idTex(t.v, { ...this.mode, afterFunc });
    if (r.word) {
      const words = [t.v + (t.primes ? "'" : '') + (t.after || '')];
      return node(`\\text{${words[0]}}`, { word: true, words });
    }
    let tex = r.tex;
    if (t.primes) {
      tex = tex.replace(/^(\\[a-zA-Z]+|[^_{}\\]+?)((?:_\{.*\})?)$/, (m0, b0, s0) => `${b0}${t.primes}${s0}`);
      if (t.after) tex = /_\{/.test(tex) ? tex : `${tex}_{${subText(t.after)}}`;
    }
    const nx = this.peek();
    // تحويل لابلاس: L{f(t)}
    if (t.v === 'L' && nx?.t === 'open' && nx.v === '{' && !nx.sp) {
      this.next();
      const g = this.parseList('}');
      if (this.peek()?.t === 'close') this.next();
      return node(`\\mathcal{L}\\left\\{ ${g.tex} \\right\\}`, { tall: g.tall });
    }
    if (r.func) {
      let n = this.postfix(node(tex), true);
      const after = this.peek();
      if (after?.t === 'open' && after.v === '(' && !after.sp) {
        this.next();
        const g = this.parseGroup(after);
        n = node(`${n.tex}${g.tex}`, { tall: g.tall, func: false, call: true });
        return n;
      }
      return node(n.tex, { func: true });
    }
    if (nx?.t === 'open' && nx.v === '(' && !nx.sp && !r.word) {
      this.next();
      const g = this.parseGroup(nx);
      // a(n+1) ← a_{n+1}: دليل لا استدعاء دالة
      if (/^[a-zA-Zα-ω]$/.test(t.v) && /^[nkij] *[-+] *\d$/.test(g.group.inner.replace(/\\,/g, ''))) {
        return node(`${tex}_{${g.group.inner}}`);
      }
      return node(`${tex}${g.tex}`, { tall: g.tall, call: true });
    }
    return node(tex, { diff: r.diff });
  }

  /** صيغة علمية: 1.004 × 10⁻⁶ عدد واحد، فلا يُقسم عليه جزء منه. */
  sci(n) {
    const op = this.peek();
    const ten = this.peek(1);
    const ex = this.peek(2);
    if (op && op.t === 'op' && (op.v === '×' || op.v === '·') && ten?.t === 'num' && ten.v === '10' && ex?.t === 'sup' && !ex.sp) {
      this.p += 3;
      n.tex += ` \\times 10^{${convertExpr(ex.v, { exp: true })}}`;
    }
  }

  /** قوس فيه وحدات فقط: (mm)، (MPa)، (kg/m³)، (%). */
  unitGroup(open) {
    if (open.v !== '(') return null;
    let k = 0;
    const parts = [];
    for (;;) {
      const u = this.peek(k);
      if (!u) return null;
      if (u.t === 'close') break;
      if (u.t === 'id' && UNITS.has(u.v) && !u.primes) parts.push(u.v.replace(/^[µμ]/, '\\mu '));
      else if (u.t === 'sup' && parts.length) parts.push(`^{${u.v}}`);
      else if (u.t === 'op' && (u.v === '/' || u.v === '·') && parts.length) parts.push(u.v === '/' ? '/' : '\\cdot ');
      else if (u.t === 'pct' && !parts.length && this.peek(k + 1)?.t === 'close') { this.p += k + 2; return node('(\\%)'); }
      else return null;
      k++;
    }
    if (!parts.length) return null;
    this.p += k + 1;
    return node(`(\\mathrm{${parts.join('')}})`);
  }

  /** وحدة بعد رقم: 25 MPa، 9.81 m/s²، 150µm. */
  unit(n) {
    const t0 = this.peek();
    if (!t0 || t0.t !== 'id') return;
    const ok = (t) => t && t.t === 'id' && UNITS.has(t.v) && !t.primes;
    if (!ok(t0) || (!t0.sp && !UNIT_ATTACH.has(t0.v))) return;
    let k = 0;
    const parts = [];
    for (;;) {
      const u = this.peek(k);
      if (!ok(u) || (k > 0 && u.sp)) break;
      let ut = u.v.replace(/^[µμ]/, '\\mu ');
      k++;
      const s = this.peek(k);
      if (s?.t === 'sup' && !s.sp) { ut += `^{${s.v}}`; k++; }
      parts.push(ut);
      const op = this.peek(k);
      if (op && op.t === 'op' && (op.v === '/' || op.v === '·') && !op.sp && ok(this.peek(k + 1)) && !this.peek(k + 1).sp) {
        parts.push(op.v === '/' ? '/' : '\\cdot ');
        k++;
        continue;
      }
      break;
    }
    if (!parts.length || /[/·]\s*$/.test(parts[parts.length - 1])) return;
    const after = this.peek(k);
    const boundary = !after || this.isOp(after, REL) || after.t === 'close' || (after.t === 'op' && SEPS[after.v]) || after.t === 'ar'
      || (after.t === 'op' && ADD[after.v] && after.sp) || after.t === 'bar' || after.t === 'dots' || (after.t === 'id' && isWord(after.v));
    if (!boundary) return;
    this.p += k;
    n.tex += `\\,\\mathrm{${parts.join('')}}`;
  }

  postfix(n, isFunc = false) {
    for (;;) {
      const t = this.peek();
      if (!t || t.sp) break;
      if (t.t === 'sup') {
        this.next();
        const c = t.tex ? t.v : convertExpr(t.v.replace(/^\((.*)\)$/, (m, x) => (balancedParens(x) ? x : m)) || t.v, { exp: true });
        const keepParens = /^\(.*\)$/.test(t.v) && !balancedParens(t.v.slice(1, -1)) ? false : /^\(n\)$/.test(t.v);
        const sup = keepParens ? `(${c})` : c;
        n = node(isFunc || !needsBrace(n) ? `${n.tex}^{${sup}}` : `{${n.tex}}^{${sup}}`, { tall: n.tall, func: n.func });
      } else if (t.t === 'sub') {
        this.next();
        const c = t.explicit ? explicitSub(t.v, t.tex) : convertExpr(t.v, { sub: true });
        n = node(/_\{[^{}]*\}$/.test(n.tex) && !needsBrace(n) ? n.tex.replace(/\}$/, `${c}}`) : needsBrace(n) ? `{${n.tex}}_{${c}}` : `${n.tex}_{${c}}`, { tall: n.tall });
      } else if (t.t === 'prime') { this.next(); n = node(`${n.tex}${t.v}`, { tall: n.tall }); }
      else if (t.t === 'deg') {
        this.next();
        const u = this.peek();
        if (u?.t === 'id' && (u.v === 'C' || u.v === 'F') && !u.sp) { this.next(); n = node(`${n.tex}^{\\circ}\\mathrm{${u.v}}`); } else n = node(`${n.tex}^{\\circ}`, { tall: n.tall });
      } else if (t.t === 'pct') { this.next(); n = node(`${n.tex}\\%`, { tall: n.tall }); }
      else if (t.t === 'fact') { this.next(); n = node(`${n.tex}!`, { tall: n.tall }); }
      else break;
    }
    return n;
  }
}

function needsBrace(n) {
  if (n.group || n.frac || /\\frac|\\left|\\sqrt/.test(n.tex)) return true;
  // مسافة في المستوى الأعلى (خارج الأقواس المعقوفة) تعني أكثر من حدّ
  let d = 0;
  const t = n.tex.trim();
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{') d++;
    else if (t[i] === '}') d--;
    else if (d === 0 && /\s/.test(t[i]) && !/\\[a-zA-Z]+$/.test(t.slice(0, i))) return true;
  }
  return false;
}
/** بسط مشتقة: d²y أو dy أو ∂M أو d وحدها. */
function isDerivNum(n) { return !!n && (n.diff || /^(?:d(?:\^\{\d\})?(?:\s|$)|d(?:\^\{\d\})?\s?[A-Za-z\\]|\\partial)/.test(n.tex)); }
/** مقام مشتقة: dx أو dx² أو ∂y. */
function isDiffTex(t) { return /^(?:\\,)?d\s?(?:[A-Za-z]|\\[a-z]+)|^\\partial/.test(t); }
function balancedParens(s) {
  let d = 0;
  for (const c of s) { if (c === '(') d++; else if (c === ')' && --d < 0) return false; }
  return d === 0;
}
function balancedFrac(tex) {
  // \frac{..}{..} يغطي النص كله
  let i = 5;
  for (let k = 0; k < 2; k++) {
    if (tex[i] !== '{') return false;
    let d = 0;
    for (; i < tex.length; i++) { if (tex[i] === '{') d++; else if (tex[i] === '}' && --d === 0) { i++; break; } }
  }
  return i === tex.length;
}

/** يحوّل تعبيرًا رياضيًا نصّيًا إلى TeX. */
export function convertExpr(s, mode = {}) {
  const toks = lex(s);
  if (!toks.length) return '';
  const pr = new Parser(toks, mode);
  const out = [];
  while (pr.p < toks.length) {
    const before = pr.p;
    const n = pr.parseList(null);
    if (n.tex) out.push(n.tex);
    if (pr.p === before) out.push(texEscape(pr.next().v || ''));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/* ── TeX جاهز أم نص عادي؟ ───────────────────────────── */

const TEX_CMD = /\\(?:frac|dfrac|tfrac|sqrt|sum|int|cdot|times|alpha|beta|gamma|delta|Delta|sigma|tau|theta|varepsilon|epsilon|mu|pi|rho|omega|lambda|phi|left|right|text|mathrm|le|ge|approx|pm|infty|partial|nabla|bar|hat|vec|over|begin|end|quad|lim|sin|cos|tan|ln|log)\b|[_^]\{/;
export function looksTeX(s) {
  return TEX_CMD.test(String(s));
}

/** يزيل محدِّدات TeX: $…$، $$…$$، \(…\)، \[…\]. */
export function stripDelims(s) {
  return String(s).trim()
    .replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1')
    .replace(/^\\\[([\s\S]*)\\\]$/, '$1').replace(/^\\\(([\s\S]*)\\\)$/, '$1').trim();
}

/** TeX من سطر: إن كان TeX يُعاد كما هو (مع تصحيح بسيط)، وإلا يُحوَّل. */
export function toTeX(s, mode = {}) {
  const x = stripDelims(s);
  if (looksTeX(x)) return fixTeX(x);
  return convertExpr(x, mode);
}

/** تصحيحات لما تكتبه النماذج أحيانًا: \dfrac داخل السطر، و«/» بين حدّين بسيطين. */
function fixTeX(x) {
  let t = x.replace(/\\(?:dfrac|tfrac)/g, '\\frac').replace(/\\displaystyle\s*/g, '');
  // «/» بين حدّين ← \frac (إلا داخل \text{} و\mathrm{} للوحدات)
  for (let guard = 0; guard < 20; guard++) {
    const i = findSlash(t);
    if (i < 0) break;
    const a = texOperandBack(t, i);
    const b = texOperandFwd(t, i + 1);
    if (!a || !b) break;
    const strip = (o) => (/^\{[\s\S]*\}$/.test(o) && braceMatch(o, 0) === o.length - 1 ? o.slice(1, -1) : /^\\left\(([\s\S]*)\\right\)$/.test(o) ? o.slice(6, -7) : /^\(([\s\S]*)\)$/.test(o) ? o.slice(1, -1) : o);
    t = `${t.slice(0, a.start)}\\frac{${strip(a.text)}}{${strip(b.text)}}${t.slice(b.end)}`;
  }
  return t;
}

function braceMatch(t, i) {
  const open = t[i];
  const close = { '{': '}', '(': ')', '[': ']' }[open];
  let d = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === '\\') { j++; continue; }
    if (t[j] === open) d++;
    else if (t[j] === close && --d === 0) return j;
  }
  return -1;
}
function braceMatchBack(t, j) {
  const close = t[j];
  const open = { '}': '{', ')': '(', ']': '[' }[close];
  let d = 0;
  for (let i = j; i >= 0; i--) {
    if (t[i] === close && t[i - 1] !== '\\') d++;
    else if (t[i] === open && t[i - 1] !== '\\' && --d === 0) return i;
  }
  return -1;
}
/** أول «/» خارج \text{} و\mathrm{} وليس بعد \. */
function findSlash(t) {
  let skipUntil = -1;
  for (let i = 0; i < t.length; i++) {
    if (i < skipUntil) continue;
    const m = t.slice(i).match(/^\\(?:text|mathrm|operatorname|mbox)\s*\{/);
    if (m) { skipUntil = braceMatch(t, i + m[0].length - 1) + 1; continue; }
    if (t[i] === '/' && t[i - 1] !== '\\') return i;
  }
  return -1;
}
/** الحدّ قبل «/»: مجموعة أو أمر أو رمز مع دلائله وأسسه. */
function texOperandBack(t, i) {
  let j = i - 1;
  while (j >= 0 && t[j] === ' ') j--;
  if (j < 0) return null;
  const end = j + 1;
  let start;
  const atom = (k) => {
    if (k < 0) return -1;
    if ('})]'.includes(t[k])) {
      let s0 = braceMatchBack(t, k);
      if (s0 < 0) return -1;
      if (t.slice(Math.max(0, s0 - 5), s0) === '\\left') s0 -= 5;
      // \frac{..}{..} أو \sqrt{..} أو \mathrm{..}
      let s1 = s0;
      while (s1 > 0 && t[s1 - 1] === '}') { const q = braceMatchBack(t, s1 - 1); if (q < 0) break; s1 = q; }
      const cmd = t.slice(0, s1).match(/\\[a-zA-Z]+$/);
      return cmd ? s1 - cmd[0].length : s0;
    }
    const m = t.slice(0, k + 1).match(/(?:\\[a-zA-Z]+|[A-Za-z0-9.]+|[^\s\\{}()\[\]^_+\-=<>,])$/);
    return m ? k + 1 - m[0].length : -1;
  };
  start = atom(j);
  if (start < 0) return null;
  // base_{..}^{..}: نرجع حتى الأساس
  for (;;) {
    const p = start - 1;
    if (p >= 0 && (t[p] === '_' || t[p] === '^')) { const b = atom(p - 1); if (b < 0) break; start = b; } else break;
  }
  return { start, end, text: t.slice(start, end).trim() };
}
/** الحدّ بعد «/». */
function texOperandFwd(t, i) {
  let j = i;
  while (j < t.length && t[j] === ' ') j++;
  if (j >= t.length) return null;
  const start = j;
  const atomF = (k) => {
    if ('{(['.includes(t[k])) { const e = braceMatch(t, k); return e < 0 ? -1 : e + 1; }
    const lr = t.slice(k).match(/^\\left\s*[(\[|.]/);
    if (lr) { const r = t.indexOf('\\right', k); if (r < 0) return -1; const m = t.slice(r).match(/^\\right\s*[)\]|.]/); return r + (m ? m[0].length : 6); }
    const cmd = t.slice(k).match(/^\\[a-zA-Z]+/);
    if (cmd) {
      let e = k + cmd[0].length;
      while (t[e] === ' ') e++;
      while (t[e] === '{' || (t[e] === '[' && /sqrt$/.test(cmd[0]))) { const q = braceMatch(t, e); if (q < 0) break; e = q + 1; }
      return e;
    }
    const m = t.slice(k).match(/^(?:[A-Za-z0-9.]+|[^\s\\{}()\[\]^_+\-=<>,])/);
    return m ? k + m[0].length : -1;
  };
  let end = atomF(j);
  if (end < 0) return null;
  while (t[end] === '_' || t[end] === '^') { const e = atomF(end + 1); if (e < 0) break; end = e; }
  return { start, end, text: t.slice(start, end).trim() };
}

/* ── أسطر كتل المعادلات ─────────────────────────────── */

const SPLIT_SEP = /\s*(←|⇐|⟸|⇒|⟹|؛|،)\s*/;

function bracketsBalanced(s) {
  const st = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (const c of s) {
    if ('([{'.includes(c)) st.push(c);
    else if (pairs[c]) { if (st.pop() !== pairs[c]) return false; }
  }
  if (st.length) return false;
  return ((s.match(/\|/g) || []).length % 2) === 0;
}

const BIN_EDGE = /^[\s]*[+\-−·×*/÷^_]|[+\-−·×*/÷^_√∫Σ][\s]*$/;
const REL_LEAD = /^\s*(=|≈|≤|≥|≠|<|>)\s*/;
const REL_TAIL = /\s*(=|≈|≤|≥|≠|<|>)\s*$/;

/**
 * يقسم سطر معادلة إلى مقاطع: نص عربي (تسمية أو شرح) ومقاطع رياضية.
 * @returns {{t:'text', s:string} | {t:'math', tex:string, src:string}}[]
 */
export function mathPieces(line) {
  let s = String(line || '').trim();
  if (!s) return [];
  const out = [];
  const text = (x) => { if (x) out.push({ t: 'text', s: x }); };
  const math = (x, src) => {
    if (/^\s*\d+(?:\.\d+)?\s*$/.test(x)) { text(x.trim()); return; } // رقم منفرد بين كلمات عربية يبقى نصًّا
    const tex = toTeX(x);
    if (tex) out.push({ t: 'math', tex, src: src ?? x }); else text(src ?? x);
  };

  // TeX صريح: يُرسم كما هو بعد فصل التسمية العربية والعربي خارج \text
  const isTex = looksTeX(s) || /^\$|^\\\(|^\\\[/.test(s);
  if (isTex) {
    s = stripDelims(s);
    const lm = s.match(/^([^=:$\\{}]{1,48}?)\s*:\s+(?=\S)/);
    if (lm && AR.test(lm[1])) { out.push({ t: 'label', s: lm[1].trim() }); s = s.slice(lm[0].length); }
    pushSegments(s, math, text, true);
    return out;
  }

  const pieces = s.split(SPLIT_SEP);
  pieces.forEach((raw, k) => {
    if (k % 2 === 1) { text(/[⇒⟹⇐⟸]/.test(raw) ? '←' : raw); return; }
    let pc = raw.trim();
    // تسمية: «المستطيل:» أو «Southwell:» أو «2×2:»
    const lm = pc.match(/^([^=:$\\]{1,48}?)\s*:\s+(?=\S)/);
    if (lm && (AR.test(lm[1]) || /^[A-Z][A-Za-z ]{2,}$/.test(lm[1]) || /^\d\s*×\s*\d$/.test(lm[1]))) {
      out.push({ t: 'label', s: lm[1].trim() });
      pc = pc.slice(lm[0].length);
    }
    // قوس في آخر القطعة: شرح عربي، أو شرط رياضي يفصله فراغ واسع (−1 < x ≤ 1)
    const tp = trailingParen(pc);
    let note = null;
    let cond = null;
    if (tp && AR.test(tp.inner)) { note = tp.inner; pc = tp.before; } else if (tp && /\s{2,}$/.test(tp.ws) && tp.before.trim()) { cond = tp.inner; pc = tp.before; }
    pushSegments(pc.trim(), math, text, false);
    if (cond) {
      const c = convertExpr(`(${cond})`);
      const prev = out[out.length - 1];
      if (prev?.t === 'math') { prev.tex += ` \\qquad ${c}`; prev.src += `   (${cond})`; } else out.push({ t: 'math', tex: c, src: `(${cond})` });
    }
    if (note) out.push({ t: 'note', parts: autoMath(note) });
  });
  return out;
}

/** آخر قوس متوازن في نهاية النص: { before, ws, inner }. */
function trailingParen(s) {
  const t = s.replace(/\s+$/, '');
  if (!t.endsWith(')')) return null;
  let d = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ')') d++;
    else if (t[i] === '(' && --d === 0) {
      if (i === 0) return null;
      const before = t.slice(0, i);
      const ws = before.match(/\s*$/)[0];
      // استدعاء دالة f(x) ليس شرحًا
      if (!ws && /[A-Za-zα-ω0-9′'″)]$/.test(before)) return null;
      return { before, ws, inner: t.slice(i + 1, -1).trim() };
    }
  }
  return null;
}

function pushSegments(s, math, text, isTex) {
  if (!s) return;
  if (!AR.test(s)) { math(s); return; }
  // فصل العربي: يجب أن تبقى كل قطعة رياضية متوازنة الأقواس ولا تبدأ أو تنتهي بعملية ثنائية
  const re = isTex
    ? /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:\s+[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+)*/g
    : /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+(?:\s+[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+)*/g;
  const segs = [];
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    segs.push({ ar: false, s: s.slice(last, m.index) });
    segs.push({ ar: true, s: m[0] });
    last = m.index + m[0].length;
  }
  segs.push({ ar: false, s: s.slice(last) });
  const ok = segs.every((g) => g.ar || !g.s.trim() || (bracketsBalanced(g.s.replace(REL_LEAD, '').replace(REL_TAIL, '')) && !BIN_EDGE.test(g.s.replace(REL_LEAD, '').replace(REL_TAIL, '')) && !/\\text\{\s*$|^\s*\}/.test(g.s)));
  if (!ok) { math(s); return; } // العربي داخل البنية الرياضية: يُكتب داخل \text
  for (const g of segs) {
    if (g.ar) { text(g.s); continue; }
    let x = g.s.trim();
    if (!x) continue;
    const lead = x.match(REL_LEAD);
    if (lead) { text(lead[1]); x = x.slice(lead[0].length); }
    const tail = x.match(REL_TAIL);
    if (tail) x = x.slice(0, tail.index);
    if (x.trim()) {
      if (/^[\s,.:;()\-–]*$/.test(x)) text(x.trim());
      else math(x.trim());
    }
    if (tail) text(tail[1]);
  }
}

/* ── الرياضيات داخل الفقرات ─────────────────────────── */

const RELS = /[=≈≤≥≠<>]/;
const UNIT_ONLY_TOKEN = (w) => UNITS.has(w) || /^[µμ](?:m|s|g)$/.test(w);

/** هل القطعة وحدات فقط (N/mm² = MPa، kg/m³، 25 MPa)؟ «L = 275» ليست وحدات: فيها علاقة ورقم. */
function unitOnly(x) {
  const words = x.match(/[A-Za-zα-ωΑ-Ωµ]+/g) || [];
  if (!words.length || !words.every(UNIT_ONLY_TOKEN)) return false;
  const inner = x.trim().replace(/^\((.*)\)$/, '$1');
  if (/[+\-−±()]/.test(inner)) return false; // 6/s³ + 1/(s − 2)
  if (/[A-Za-z]\s*\/\s*\d/.test(inner)) return false; // L/360
  return !(RELS.test(x) && /\d/.test(x));
}

/** هل في القطعة رياضيات تستحق الرسم؟ */
export function isMathy(x) {
  const s = x.trim();
  if (!s || s.length > 400) return false;
  if (/https?:|www\.|@/.test(s)) return false;
  if (unitOnly(s)) return false;
  if (STD_CODE.test(s) && !RELS.test(s)) return false;
  if (looksTeX(s)) return true;
  const rel = s.match(RELS);
  if (rel) {
    const i = s.indexOf(rel[0]);
    if (s.slice(0, i).trim() && s.slice(i + 1).trim()) return true;
  }
  const div = s.match(/([A-Za-z0-9α-ω)\]|²³⁴'′]+)\s*\/\s*([A-Za-z0-9α-ω(√[]+)/);
  if (div) {
    const [, a, b] = div;
    const date = /^\d+$/.test(a) && /^\d+$/.test(b) && (a.length > 2 || b.length > 2);
    if (!date) return true;
  }
  if (/[√∫∂∑∬∮]|\^/.test(s)) return true;
  if (/Σ\s*\S/.test(s)) return true;
  if (/[A-Za-zα-ω]_[A-Za-z0-9({]/.test(s)) return true;
  return false;
}

/** «fcu:» أو «T, Ts:» أو «b, d:» في أول بند: رموز تُكتب رياضيًا. */
const SYMBOL_LIST = /^\s*((?:[A-Za-zα-ωΔΣ][A-Za-z0-9α-ω_′'̄]{0,9}|\d+(?:\.\d+)?)(?:\s*,\s*(?:[A-Za-zα-ωΔΣ][A-Za-z0-9α-ω_′'̄]{0,9}))*)\s*$/;

/**
 * يقسم نصًّا (فقرة أو بندًا) إلى مقاطع نصية ورياضية.
 * يدعم $…$ و\(…\) و$$…$$ صريحة، ويكتشف المعادلات المكتوبة نصًّا (fcu = 675000 / 22500 = 30 MPa).
 * @returns {({text:string}|{math:string, src:string, display?:boolean})[]}
 */
export function autoMath(text) {
  return merge(splitExplicit(text).flatMap((x) => (x.math !== undefined ? [x] : detect(x.text))));
}

/** يفصل المعادلات الصريحة ($…$، $$…$$، \(…\)، \[…\]) عن بقية النص قبل تحليل التنسيق. */
export function splitExplicit(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const out = [];
  const re = /\$\$([^$]+)\$\$|\\\[([\s\S]+?)\\\]|(?<![\\\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const body = (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
    const display = m[1] !== undefined || m[2] !== undefined;
    // داخل المحدِّدات الصيغة TeX، إلا إن كُتبت برموز يونيكود بلا أوامر (σ = P/A)
    const plainish = !/\\/.test(body) && /[^\x00-\x7F]/.test(body);
    out.push({ math: plainish ? convertExpr(body) : fixTeX(body), src: body, display });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** يكتشف الرياضيات المكتوبة نصًّا (بلا محدِّدات). */
export function detectMath(text) {
  return merge(detect(String(text ?? '')));
}

function merge(arr) {
  const out = [];
  for (const x of arr) {
    if (x.text !== undefined && out.length && out[out.length - 1].text !== undefined) out[out.length - 1].text += x.text;
    else if (x.text === '' ) continue;
    else out.push(x);
  }
  return out;
}

/** يكتشف الرياضيات في نص بلا محدِّدات. */
function detect(s) {
  if (!/[=≈≤≥≠<>/^√∫∂_ΣΔ\\:]/.test(s)) return [{ text: s }];
  // نص إنجليزي حقيقي (كلمات) يُعامل بالرموز؛ وغيره (أسطر حلول رياضية) بالقطع كالنص العربي
  const words = (s.match(/[A-Za-z]{3,}/g) || []).filter((w) => isWord(w) && !UNITS.has(w) && !FUNCS[w] && !NAMES.has(w));
  return AR.test(s) || words.length < 3 ? detectArabic(s) : detectLatin(s);
}

/** في النص العربي: كل قطعة غير عربية تُفحص، وتُفصل منها الأقواس والعلامات والعلاقات الطرفية. */
function detectArabic(s) {
  const out = [];
  const re = /[^؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿←⇐⇒⟸⟹\n«»]+/g;
  let last = 0;
  let m;
  let atStart = true;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push(...chunk(m[0], atStart || /[،؛:]\s*$/.test(s.slice(0, m.index))));
    last = m.index + m[0].length;
    atStart = false;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** يقسم القطعة عند قوس غير مطابق: «V1) = (1 − 0.25)²». */
function unmatchedSplit(s) {
  const st = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) st.push(i);
    else if (')]}'.includes(c)) {
      if (!st.length) return { left: s.slice(0, i), br: c, right: s.slice(i + 1) };
      st.pop();
    }
  }
  if (st.length) { const i = st[0]; return { left: s.slice(0, i), br: s[i], right: s.slice(i + 1) }; }
  return null;
}

/** فواصل في المستوى الأعلى: «: » و«; » و«, » بين علاقتين. */
function topSplit(s) {
  const parts = [];
  let d = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (d === 0) {
      let sep = null;
      if (c === ':' && /\s/.test(s[i + 1] || ' ') && i > 0) sep = s.slice(i, i + 2);
      else if (c === ';') sep = c;
      else if (c === ',' && /\s/.test(s[i + 1] || '')) {
        const nextRel = RELS.test(s.slice(i + 1).split(/[,;:]/)[0]);
        if (nextRel && RELS.test(s.slice(last, i))) sep = s.slice(i, i + 2);
      }
      if (sep) {
        parts.push({ s: s.slice(last, i) });
        parts.push({ s: sep, sep: true });
        last = i + sep.length;
        i = last - 1;
      }
    }
  }
  if (!parts.length) return [{ s }];
  parts.push({ s: s.slice(last) });
  return parts;
}

function chunk(raw, symbolsOk, beforeColon = false) {
  if (!raw.trim()) return [{ text: raw }];
  const um = unmatchedSplit(raw);
  if (um) return [...chunk(um.left, symbolsOk), { text: um.br }, ...chunk(um.right, false)];
  const tp = topSplit(raw);
  if (tp.length > 1) {
    return tp.flatMap((p, k) => (p.sep ? [{ text: p.s }] : chunk(p.s, symbolsOk && k === 0, tp[k + 1]?.sep && tp[k + 1].s.startsWith(':'))));
  }
  // «1.5 kg (W = 14.72 N)»: كمية ثم قوس فيه معادلة
  const pg = raw.match(/^(.*\S)(\s+)(\((?:[^()]|\([^()]*\))*\))(\s*)$/);
  if (pg && isMathy(pg[3].slice(1, -1)) && !isMathy(pg[1])) return [...chunk(pg[1] + pg[2], symbolsOk), ...chunk(pg[3] + pg[4], false)];
  const out = [];
  let core = raw;
  let pre = '';
  let post = '';
  const take = (rx, front) => {
    const mm = core.match(rx);
    if (!mm) return false;
    if (front) { pre += mm[0]; core = core.slice(mm[0].length); } else { post = mm[0] + post; core = core.slice(0, core.length - mm[0].length); }
    return true;
  };
  for (let guard = 0; guard < 6; guard++) {
    let moved = false;
    moved = take(/^[\s:،,;؛]+/, true) || moved;
    moved = take(/\s+$/, false) || moved;
    moved = take(/[.,;:!?؟]+$/, false) || moved;
    moved = take(REL_LEAD, true) || moved;
    moved = take(REL_TAIL, false) || moved;
    // قوس شرح وحدات في آخر القطعة: (mm²)
    const unitParen = core.match(/\s*\(([^()]*)\)$/);
    if (unitParen && unitOnly(unitParen[1]) && core.length > unitParen[0].length) { post = unitParen[0] + post; core = core.slice(0, unitParen.index); moved = true; }
    // قوسان يحيطان بالقطعة كلها
    if (/^\(.*\)$/.test(core) && bracketsBalanced(core.slice(1, -1))) { pre += '('; post = ')' + post; core = core.slice(1, -1); moved = true; }
    // أقواس غير متوازنة على الطرفين (قوس فُتح في نص عربي سابق)
    if (/^[)\]]/.test(core)) { pre += core[0]; core = core.slice(1); moved = true; }
    if (/[(\[]$/.test(core)) { post = core.slice(-1) + post; core = core.slice(0, -1); moved = true; }
    if (/^\(/.test(core) && !bracketsBalanced(core)) { pre += '('; core = core.slice(1); moved = true; }
    if (/\)$/.test(core) && !bracketsBalanced(core)) { post = ')' + post; core = core.slice(0, -1); moved = true; }
    if (!moved) break;
  }
  const isSym = symbolsOk && (beforeColon || /^\s*:/.test(post)) && SYMBOL_LIST.test(core) && !/^\s*\d/.test(core) && !STD_CODE.test(core);
  if (core && (isSym || (isMathy(core) && bracketsBalanced(core)))) {
    if (pre) out.push({ text: pre });
    if (isSym) {
      out.push({ math: core.split(/\s*,\s*/).map((x) => convertExpr(x)).join(',\\; '), src: core });
    } else {
      out.push({ math: toTeX(core), src: core });
    }
    if (post) out.push({ text: post });
  } else out.push({ text: raw });
  return out;
}

/** في النص الإنجليزي: المعادلة سلسلة رموز حول علاقة (=، ≈ …) تتوقف عند الكلمات. */
function detectLatin(s) {
  const out = [];
  const tokRe = /\s+|[A-Za-zα-ωΑ-Ω_′'̄]+[0-9]*(?:\^[\w.()+−-]+)?[²³⁴⁰-⁹₀-₉]*|\d+(?:\.\d+)?[²³⁴]?|[^\sA-Za-z0-9]/g;
  const toks = s.match(tokRe) || [];
  const mathTok = (t) => {
    if (/^\s+$/.test(t)) return 'sp';
    if (/^[A-Za-z]+$/.test(t) && (isWord(t) && !UNITS.has(t) && !FUNCS[t]) && !NAMES.has(t)) return false;
    if (/^[A-Za-z]{2,}$/.test(t) && ['an', 'is', 'of', 'at', 'as', 'be', 'by', 'if', 'in', 'it', 'on', 'or', 'to', 'we', 'so', 'do', 'no', 'up'].includes(t)) return false;
    if (/^[.,;!?"“”]$/.test(t)) return false;
    return true;
  };
  let i = 0;
  let buf = '';
  const flushText = (x) => { if (x) out.push({ text: x }); };
  while (i < toks.length) {
    // ابحث عن سلسلة رموز رياضية متصلة
    let j = i;
    let span = '';
    while (j < toks.length && mathTok(toks[j])) { span += toks[j]; j++; }
    if (j > i && span.trim() && isMathy(span) && RELS.test(span) || (j > i && /[√∫∂\\^]/.test(span) && isMathy(span))) {
      const lead = span.match(/^\s*/)[0];
      const trail = span.match(/\s*$/)[0];
      flushText(buf + lead);
      buf = '';
      const core = span.trim();
      out.push({ math: toTeX(core), src: core });
      buf = trail;
      i = j;
    } else if (j > i) { buf += span; i = j; } else { buf += toks[i]; i++; }
  }
  flushText(buf);
  return out;
}

/** النص الأصلي للمقاطع (للبحث والنسخ). */
export function piecesText(parts) {
  return parts.map((p) => (p.t === 'note' ? `(${p.parts.map((x) => x.text ?? x.src).join('')})` : p.src ?? p.s ?? p.text ?? '')).join(' ');
}

export const _internal = { lex, idTex, AR_G };
