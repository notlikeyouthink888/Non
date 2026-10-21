/** تحويل الدراسة لنص مرتّب تگدر تشاركه (واتساب، تلگرام…) أو تنسخه. */

import { state } from '../core/store.js';
import { money, moneyShort, num } from '../core/text.js';
import { getProject, catOf, typeOf, capOf, verdictOf, studyFor, calcTotals, calcHasData, mapCount, studiedProjects, VERDICTS } from '../model.js';
import { outline } from '../mindmap/model.js';

export function refTitle(ref) {
  if (ref.kind === 'market') return state.market.title;
  if (ref.kind === 'sector') return `قطاع ${catOf(ref.id).name}`;
  return getProject(ref.id)?.name || 'مشروع';
}

export function pointLabels(ref) {
  return ref.kind === 'project'
    ? { pros: 'الإيجابيات', cons: 'السلبيات', prosIcon: '✅', consIcon: '❌' }
    : { pros: 'الفرص', cons: 'التحديات', prosIcon: '🌟', consIcon: '⚠️' };
}

function calcLines(calc) {
  const t = calcTotals(calc);
  const lines = ['🧮 الحسبة:'];
  if (t.setup) lines.push(`• تكاليف البداية: ${money(t.setup)}`);
  if (t.monthly) lines.push(`• المصاريف الشهرية: ${money(t.monthly)}`);
  if (t.gross !== null) lines.push(`• الربح قبل المصاريف بالشهر: ${money(t.gross)}`);
  if (t.net !== null) lines.push(`• صافي الربح الشهري: ${money(t.net)}`);
  if (t.payback) lines.push(`• يرجع رأس المال خلال: ${num(t.payback, 1)} شهر تقريبًا`);
  return lines;
}

/** نص دراسة واحدة. */
export function studyText(ref) {
  const s = studyFor(ref);
  const title = refTitle(ref);
  const L = pointLabels(ref);
  const lines = [`📋 دراسة: ${title}`];

  if (ref.kind === 'project') {
    const p = getProject(ref.id);
    if (p) {
      lines.push(`${catOf(p.cat).icon} ${catOf(p.cat).name} · ${typeOf(p.type).name} · رأس مال ${capOf(p.cap)?.name || '—'}`);
      if (p.desc) lines.push(p.desc);
    }
  }
  if (!s) return lines.join('\n');

  const v = verdictOf(s.verdict);
  if (v || s.chance !== null) {
    lines.push('');
    lines.push(`الحكم: ${v ? `${v.icon} ${v.label}` : 'ما حددت'}${s.chance !== null ? ` — نسبة النجاح بتقديري ${s.chance}%` : ''}`);
  }
  if (s.pros.length) lines.push('', `${L.prosIcon} ${L.pros}:`, ...s.pros.map((x) => `• ${x.t}`));
  if (s.cons.length) lines.push('', `${L.consIcon} ${L.cons}:`, ...s.cons.map((x) => `• ${x.t}`));
  if (s.notes.trim()) lines.push('', '📝 ملاحظات:', s.notes.trim());
  if (calcHasData(s.calc)) lines.push('', ...calcLines(s.calc));
  if (mapCount(s)) lines.push('', '🧠 الخريطة الذهنية:', outline(s.map, title));
  lines.push('', '— من تطبيق «دراسة مشاريع»');
  return lines.join('\n');
}

/** ملخص كل الدراسة: الأحكام مرتّبة مع أهم الأرقام. */
export function reportText() {
  const items = studiedProjects();
  const lines = [`📊 ملخص دراستي — ${state.market.title}`, `درست ${items.length} مشروع`, ''];
  for (const v of VERDICTS) {
    const group = items.filter(({ s }) => s.verdict === v.id)
      .sort((a, b) => (b.s.chance ?? -1) - (a.s.chance ?? -1));
    if (!group.length) continue;
    lines.push(`${v.icon} ${v.label} (${group.length}):`);
    for (const { p, s } of group) {
      const t = calcHasData(s.calc) ? calcTotals(s.calc) : null;
      const extra = [
        s.chance !== null ? `${s.chance}%` : null,
        `+${s.pros.length} −${s.cons.length}`,
        t?.net !== null && t?.net !== undefined ? `صافي ${moneyShort(t.net)}/شهر` : null,
      ].filter(Boolean).join(' · ');
      lines.push(`• ${p.name} — ${extra}`);
    }
    lines.push('');
  }
  const undecided = items.filter(({ s }) => !s.verdict);
  if (undecided.length) {
    lines.push(`✍️ بعدني أدرسها (${undecided.length}):`);
    undecided.forEach(({ p }) => lines.push(`• ${p.name}`));
    lines.push('');
  }
  lines.push('— من تطبيق «دراسة مشاريع»');
  return lines.join('\n');
}
