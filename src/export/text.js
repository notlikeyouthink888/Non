/** تحويل التقرير إلى نص عادي للنسخ والمشاركة. */

import { getType } from '../data/types.js';
import { parseBlocks, plain } from '../report/md.js';
import { figuresOf, figureNumbers } from '../report/model.js';

export function toPlainText(report) {
  const type = getType(report.typeId);
  const nums = figureNumbers(report);
  const out = [report.title, type.name, ''];
  report.sections.forEach((s, i) => {
    if (s.h) out.push(`${i + 1}. ${s.h}`, '');
    for (const b of parseBlocks(s.md)) {
      if (b.t === 'h' || b.t === 'p' || b.t === 'note') out.push(plain(b.text), '');
      else if (b.t === 'ol') { b.items.forEach((it, k) => { out.push(`${k + 1}. ${plain(it.text)}`); (it.sub || []).forEach((x) => out.push(`   - ${plain(x)}`)); }); out.push(''); }
      else if (b.t === 'ul') { b.items.forEach((it) => { out.push(`• ${plain(it.text)}`); (it.sub || []).forEach((x) => out.push(`   - ${plain(x)}`)); }); out.push(''); }
      else if (b.t === 'table') { out.push(b.head.map(plain).join(' | ')); b.rows.forEach((r) => out.push(r.map(plain).join(' | '))); out.push(''); }
      else if (b.t === 'eq' || b.t === 'pre') { out.push(...b.lines, ''); }
    }
    figuresOf(report, i).forEach((f) => out.push(`[شكل (${nums.get(f.id)}): ${f.caption}]`, ''));
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
