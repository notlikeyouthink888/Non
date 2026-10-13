/**
 * محلّل Markdown مصغّر لصيغة التقارير:
 * ### عناوين فرعية، فقرات، قوائم مرقّمة ونقطية (بمستوى فرعي)، جداول،
 * كتل معادلات ```eq، ملاحظات >، وتنسيق داخلي **عريض** و*مائل* و`رمز` و[نص يحتاج تعديل].
 * المخرجات كتل بسيطة يستعملها العرض والتصدير إلى Word وPDF.
 */

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
 * يحلّل التنسيق الداخلي إلى مقاطع: { text, b, i, code, ph }
 * ph = نص بين أقواس معقوفة يحتاج تعديلًا من المستخدم.
 */
export function inline(text) {
  const s = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1');
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]\n]{1,160})\]|\*([^*\n]+)\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}]))/gu;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    if (m[2] || m[3]) runs.push({ text: m[2] || m[3], b: true });
    else if (m[4]) runs.push({ text: m[4], code: true });
    else if (m[5]) runs.push({ text: m[5], ph: true });
    else if (m[6] || m[7]) runs.push({ text: m[6] || m[7], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  return runs.filter((r) => r.text);
}

/** النص الخام بلا تنسيق (للعدّ والبحث والنسخ). */
export function plain(text) {
  return inline(text).map((r) => (r.ph ? `[${r.text}]` : r.text)).join('');
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

export function joinSections(sections) {
  return sections.map((s) => (s.h ? `## ${s.h}\n\n` : '') + (s.md || '')).join('\n\n');
}

/** عدد الكلمات في تقرير. */
export function wordsOf(sections) {
  return sections.reduce((n, s) => n + (plain(s.h + ' ' + s.md).match(/[\p{L}\p{N}]+/gu) || []).length, 0);
}
