/** قطع واجهة مشتركة: شارة الحكم، حلقة النسبة، صف المشروع، ومؤشرات الدراسة. */

import { h, svg } from '../core/dom.js';
import { state } from '../core/store.js';
import { verdictOf, typeOf, capOf, mapCount, calcHasData } from '../model.js';
import { aiChance } from '../ai/tasks.js';

/** حلقة نسبة دائرية. */
export function ring(pct, { size = 56, stroke = 6, label = null, cls = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  const mid = size / 2;
  return svg('svg', { class: 'ring ' + cls, width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' }, [
    svg('circle', { class: 'ring-bg', cx: mid, cy: mid, r, 'stroke-width': stroke, fill: 'none' }),
    p > 0 ? svg('circle', {
      class: 'ring-fg', cx: mid, cy: mid, r, 'stroke-width': stroke, fill: 'none',
      'stroke-dasharray': `${(c * p) / 100} ${c}`, 'stroke-linecap': 'round',
      transform: `rotate(-90 ${mid} ${mid})`,
    }) : null,
    svg('text', { class: 'ring-t', x: mid, y: mid, 'text-anchor': 'middle', 'dominant-baseline': 'central', text: label ?? `${Math.round(p)}%` }),
  ]);
}

export function verdictPill(s, { big = false } = {}) {
  const v = verdictOf(s?.verdict);
  if (!v) return null;
  return h('span.vb.' + v.cls + (big ? '.big' : ''), [h('b', v.icon), ' ', v.label]);
}

/** مؤشرات صغيرة لشنو كتبت بالدراسة: +3 −2 📝 🧠5 🧮 */
export function studyPills(s, ai = null) {
  const out = [];
  if (ai !== null) out.push(h('span.sp.ai' + (ai >= 65 ? '.hi' : ai < 40 ? '.lo' : ''), { title: 'احتمال النجاح حسب الذكاء' }, `🤖 ${ai}%`));
  if (!s) return out.length ? h('span.pills', out) : null;
  if (s.pros.length) out.push(h('span.sp.pro', { dir: 'ltr' }, `+${s.pros.length}`));
  if (s.cons.length) out.push(h('span.sp.con', { dir: 'ltr' }, `−${s.cons.length}`));
  if (s.notes.trim()) out.push(h('span.sp', '📝'));
  const m = mapCount(s);
  if (m) out.push(h('span.sp', `🧠 ${m}`));
  if (calcHasData(s.calc)) out.push(h('span.sp', '🧮'));
  if (s.chance !== null) out.push(h('span.sp.ch', `${s.chance}%`));
  return out.length ? h('span.pills', out) : null;
}

/** صف مشروع بالقائمة. */
export function projectRow(p, onOpen) {
  const s = state.studies[p.id];
  const v = verdictOf(s?.verdict);
  const t = typeOf(p.type);
  const cap = capOf(p.cap);
  return h('button.pcard' + (v ? '.v-' + v.id : ''), { type: 'button', onclick: () => onOpen(p) }, [
    h('span.pic', p.icon || '💡'),
    h('span.grow', [
      h('span.pt', [
        p.name,
        s?.star ? h('span.star', { title: 'مفضّل' }, ' ★') : null,
      ]),
      h('span.ps', [`${t.icon} ${t.name}`, cap ? ` · رأس مال ${cap.name}` : '', p.custom ? ' · ' : '', p.custom ? h('span.mine', p.ai ? '🤖 اقتراح الذكاء' : 'إضافتي') : null]),
      studyPills(s, aiChance(p.id)),
    ]),
    v ? h('span.vb.' + v.cls, [h('b', v.icon), ' ', v.label]) : h('span.chev', '‹'),
  ]);
}

/** رأس قسم بالصفحة الرئيسية. */
export function head(title, sub, actions = null) {
  return h('div.head', [
    h('div.grow', [h('h1', title), sub ? h('p', sub) : null]),
    actions,
  ]);
}
