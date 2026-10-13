/**
 * محلّل Markdown مصغّر لصيغة التقارير:
 * ### عناوين فرعية، فقرات، قوائم مرقّمة ونقطية (بمستوى فرعي)، جداول،
 * كتل معادلات ```eq (أو $$…$$ و\[…\])، ملاحظات >، وتنسيق داخلي **عريض** و*مائل* و`رمز`
 * و[نص يحتاج تعديل]، ومعادلات داخل السطر ($…$ أو مكتوبة نصًّا مثل σ = P / A).
 * المخرجات كتل بسيطة يستعملها العرض والتصدير إلى Word وPDF.
 */

import { splitExplicit, detectMath } from '../core/mathconv.js';

const OL = /^\s*(?:\d+|[٠-٩]+)[.)\-–]\s+(.*)$/;
const UL = /^\s*[-*•●▪]\s+(.*)$/;
const HEAD = /^(#{1,6})\s+(.*)$/;
const TABLE = /^\s*\|.*\|\s*$/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].replace(/\t/g, '  ').length : 0;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/** يحلّل نص قسم واحد إلى كتل. */
export function parseBlocks(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: 'p', text: para.join(' ').trim() });
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushPara(); i++; continue; }

    // كتلة معادلات أو نص مسبق التنسيق
    const fence = trimmed.match(/^```\s*([\w-]*)/);
    if (fence) {
      flushPara();
      const kind = (fence[1] || '').toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { body.push(lines[i]); i++; }
      i++;
      const clean = body.map((l) => l.trim()).filter(Boolean);
      if (clean.length) blocks.push({ t: kind === 'eq' || kind === 'math' || kind === 'equation' ? 'eq' : 'pre', lines: clean });
      continue;
    }

    // معادلة مستقلة: $$…$$ أو \[…\] (في سطر واحد أو عدة أسطر)
    const dm = trimmed.match(/^(\$\$|\\\[)/);
    if (dm) {
      const close = dm[1] === '$$' ? '$$' : '\\]';
      let body = trimmed.slice(2);
      while (!body.trimEnd().endsWith(close) && i + 1 < lines.length && lines[i + 1].trim()) { i++; body += ' ' + lines[i].trim(); }
      body = body.trimEnd();
      if (body.endsWith(close)) body = body.slice(0, -2);
      flushPara();
      if (body.trim()) blocks.push({ t: 'eq', lines: [`$${body.trim()}$`] });
      i++;
      continue;
    }

    const hm = trimmed.match(HEAD);
    if (hm) {
      flushPara();
      const level = Math.max(3, Math.min(4, hm[1].length + (hm[1].length < 3 ? 1 : 0)));
      blocks.push({ t: 'h', level, text: hm[2].replace(/#+\s*$/, '').trim() });
      i++;
      continue;
    }

    if (TABLE.test(trimmed) && i + 1 < lines.length && SEP.test(lines[i + 1].trim())) {
      flushPara();
      const head = splitRow(trimmed);
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE.test(lines[i].trim())) {
        const r = splitRow(lines[i]);
        while (r.length < head.length) r.push('');
        rows.push(r.slice(0, head.length));
        i++;
      }
      blocks.push({ t: 'table', head, rows });
      continue;
    }

    if (OL.test(line) || UL.test(line)) {
      flushPara();
      const ordered = OL.test(line);
      const baseIndent = indentOf(line);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // سطر فارغ: تستمر القائمة إن جاء بعده عنصر من النوع نفسه
          const next = lines[i + 1];
          if (next && (ordered ? OL.test(next) : UL.test(next)) && indentOf(next) <= baseIndent + 1) { i++; continue; }
          break;
        }
        const ind = indentOf(l);
        const isItem = OL.test(l) || UL.test(l);
        if (isItem && ind > baseIndent + 1 && items.length) {
          const sub = (l.match(OL) || l.match(UL))[1];
          (items[items.length - 1].sub ||= []).push(sub.trim());
          i++;
          continue;
        }
        if (isItem && ind <= baseIndent + 1) {
          const m = ordered ? l.match(OL) : l.match(UL);
          if (!m) break; // تغيّر نوع القائمة
          items.push({ text: m[1].trim() });
          i++;
          continue;
        }
        if (!isItem && ind > baseIndent && items.length) {
          items[items.length - 1].text += ' ' + l.trim();
          i++;
          continue;
        }
        break;
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushPara();
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ t: 'note', text: body.join(' ').trim() });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); i++; continue; }
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmed)) { flushPara(); i++; continue; } // صور مضمّنة لا نستعملها

    para.push(trimmed);
    i++;
  }
  flushPara();
  return blocks;
}

/**
 * يحلّل التنسيق الداخلي إلى مقاطع: { text, b, i, code, ph } أو { math, src, display }
 * ph = نص بين أقواس معقوفة يحتاج تعديلًا من المستخدم.
 * math = صيغة TeX لمعادلة داخل السطر (صريحة بين $…$ أو مكتشفة من نص مثل fcu = P / A).
 * { math: false } يعطي النص كما هو بلا معادلات (للعناوين وما شابه).
 */
export function inline(text, { math = true } = {}) {
  const s = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1');
  if (!math) return fmtRuns(s);
  const out = [];
  // المعادلات الصريحة أولًا حتى لا تُقرأ _ و* داخلها تنسيقًا
  for (const part of splitExplicit(s)) {
    if (part.math !== undefined) { out.push(part); continue; }
    for (const r of fmtRuns(part.text)) {
      if (r.code || r.ph) { out.push(r); continue; }
      for (const x of detectMath(r.text)) out.push(x.math !== undefined ? x : { ...r, text: x.text });
    }
  }
  return out.filter((r) => r.math !== undefined || r.text);
}

function fmtRuns(s) {
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]\n]{1,160})\]|\*([^*\n]+)\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}]))/gu;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    if (m[2] || m[3]) runs.push({ text: m[2] || m[3], b: true });
    else if (m[4]) runs.push({ text: m[4], code: true });
    else if (m[5]) runs.push(isPlaceholder(m[5]) ? { text: m[5], ph: true } : { text: m[0] });
    else if (m[6] || m[7]) runs.push({ text: m[6] || m[7], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  // النصوص العادية المتجاورة تُدمج حتى تُكتشف المعادلة كاملة: 100 × [(S × W) − M] / (S × W)
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && !prev.b && !prev.i && !prev.code && !prev.ph && !r.b && !r.i && !r.code && !r.ph) prev.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** [اسم المشرف] أو [12.5] معلومة يكملها الطالب، أما [(S × W) − M] فجزء من معادلة. */
function isPlaceholder(x) {
  return /[\u0600-\u06FF]/.test(x) || /^\s*[-+−]?\d[\d.,\s]*\s*$/.test(x) || /^[A-Za-z][A-Za-z ]{2,}$/.test(x.trim());
}

/** النص الخام بلا تنسيق (للعدّ والبحث والنسخ). المعادلات بنصّها الأصلي. */
export function plain(text) {
  return inline(text).map((r) => (r.math !== undefined ? r.src : r.ph ? `[${r.text}]` : r.text)).join('');
}

/** يقسم نص تقرير كامل إلى أقسام حسب عناوين ##. */
export function splitSections(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m && !line.startsWith('###')) {
      cur = { h: m[1].replace(/^\d+[.)-]\s*/, '').trim(), md: '' };
      sections.push(cur);
    } else if (/^#\s+/.test(line) && !sections.length) {
      continue; // عنوان رئيسي زائد — العنوان محفوظ منفصلًا
    } else {
      if (!cur) { cur = { h: '', md: '' }; sections.push(cur); }
      cur.md += (cur.md ? '\n' : '') + line;
    }
  }
  return sections
    .map((s) => ({ h: s.h, md: s.md.replace(/^\n+|\n+$/g, '') }))
    .filter((s) => s.h || s.md.trim());
}

/**
 * يوحّد عناوين الأقسام التي تكتبها بعض النماذج بصيغة مختلفة (# أو ### أو سطر عريض **…**)
 * إلى «## العنوان» إن طابقت عنوان قسم متوقَّع لم يظهر بصيغته الصحيحة. لا يمسّ القوائم المرقّمة.
 */
export function normalizeHeadings(md, titles) {
  if (!titles?.length) return md;
  const norm = (x) => String(x).replace(/[\u0640\u064B-\u0652]/g, '').replace(/^\d+\s*[.)\-–]\s*/, '').replace(/[:：.\s]+$/g, '').replace(/\s+/g, ' ').trim();
  const want = new Map(titles.map((t) => [norm(t), t]));
  const lines = String(md || '').split('\n');
  const have = new Set();
  for (const l of lines) {
    const m = l.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m && !l.startsWith('###')) have.add(norm(m[1]));
  }
  return lines.map((l) => {
    let cand = null;
    const hm = l.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (hm) { if (hm[1].length !== 2) cand = hm[2]; } else {
      const bm = l.match(/^\s*(\*\*|__)(.+?)\1\s*[:：]?\s*$/);
      if (bm) cand = bm[2];
    }
    if (!cand) return l;
    const key = norm(cand.replace(/^(\*\*|__)|(\*\*|__)$/g, ''));
    const title = want.get(key);
    if (!title || have.has(key)) return l;
    have.add(key);
    return `## ${title}`;
  }).join('\n');
}

export function joinSections(sections) {
  return sections.map((s) => (s.h ? `## ${s.h}\n\n` : '') + (s.md || '')).join('\n\n');
}

/** عدد الكلمات في تقرير. */
export function wordsOf(sections) {
  return sections.reduce((n, s) => n + (plain(s.h + ' ' + s.md).match(/[\p{L}\p{N}]+/gu) || []).length, 0);
}
