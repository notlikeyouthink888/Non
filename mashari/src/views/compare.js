/** مقارنة لحد ٤ مشاريع جنب بعض: الحكم، النسبة، النقاط، والأرقام. */

import { h, fill, empty } from '../core/dom.js';
import { openPage, toast, haptic } from '../core/ui.js';
import { money, num } from '../core/text.js';
import { studiedProjects, verdictOf, calcTotals, calcHasData, capOf, typeOf } from '../model.js';
import { openStudy } from './study.js';

const MAX = 4;

export function openCompare() {
  const items = studiedProjects();
  const pre = [...items]
    .sort((a, b) => (b.s.star - a.s.star) || ((b.s.chance ?? -1) - (a.s.chance ?? -1)))
    .slice(0, Math.min(3, items.length))
    .map(({ p }) => p.id);
  const picked = new Set(pre);

  openPage((el, { close }) => {
    const chips = h('div.chips.scroll');
    const tableWrap = h('div.cmp-wrap');

    fill(el, [
      h('header.page-head', [
        h('button.btn.icon.ghost', { 'aria-label': 'رجوع', onclick: close }, '→'),
        h('div.grow', [h('div.page-t', '⚖️ مقارنة المشاريع'), h('div.page-s', `اختار لحد ${MAX} مشاريع من اللي درستها`)]),
      ]),
      h('div.page-body', items.length ? [chips, tableWrap] : [empty('⚖️', 'ادرس مشروعين على الأقل حتى تگدر تقارن بيناتهم.')]),
    ]);

    function renderChips() {
      fill(chips, items.map(({ p }) => h('button.chip' + (picked.has(p.id) ? '.on' : ''), {
        type: 'button',
        onclick: () => {
          if (picked.has(p.id)) picked.delete(p.id);
          else if (picked.size >= MAX) { toast(`الحد ${MAX} مشاريع بالمقارنة`); return; }
          else picked.add(p.id);
          haptic();
          renderChips();
          renderTable();
        },
      }, `${p.icon} ${p.name}`)));
    }

    function renderTable() {
      const cols = items.filter(({ p }) => picked.has(p.id));
      if (cols.length < 2) {
        fill(tableWrap, h('div.muted.center.mt', 'اختار مشروعين أو أكثر من فوق.'));
        return;
      }
      const data = cols.map(({ p, s }) => ({ p, s, t: calcHasData(s.calc) ? calcTotals(s.calc) : null }));

      // نعلّم الأفضل بكل صف رقمي
      const best = (vals, prefer) => {
        const nums = vals.filter((v) => v !== null && v !== undefined);
        if (nums.length < 2) return null;
        return prefer === 'max' ? Math.max(...nums) : Math.min(...nums);
      };
      const rows = [
        { label: 'الحكم', cell: (d) => { const v = verdictOf(d.s.verdict); return v ? h('span.vb.' + v.cls, [v.icon, ' ', v.label]) : '—'; } },
        { label: 'نسبة النجاح', val: (d) => d.s.chance, fmt: (v) => `${v}%`, prefer: 'max' },
        { label: 'الإيجابيات', val: (d) => d.s.pros.length, fmt: String, prefer: 'max' },
        { label: 'السلبيات', val: (d) => d.s.cons.length, fmt: String, prefer: 'min' },
        { label: 'تكاليف البداية', val: (d) => (d.t?.setup || null), fmt: money, prefer: 'min' },
        { label: 'المصاريف الشهرية', val: (d) => (d.t?.monthly || null), fmt: money, prefer: 'min' },
        { label: 'صافي الربح الشهري', val: (d) => d.t?.net ?? null, fmt: money, prefer: 'max' },
        { label: 'يرجع رأس المال خلال', val: (d) => d.t?.payback ?? null, fmt: (v) => `${num(v, 1)} شهر`, prefer: 'min' },
        { label: 'رأس المال (تقدير)', cell: (d) => capOf(d.p.cap)?.name || '—' },
        { label: 'النوع', cell: (d) => `${typeOf(d.p.type).icon} ${typeOf(d.p.type).name}` },
      ];

      fill(tableWrap, h('table.cmp', [
        h('thead', h('tr', [
          h('th'),
          ...data.map((d) => h('th', h('button.cmp-head', {
            type: 'button',
            onclick: () => openStudy({ kind: 'project', id: d.p.id }, { onClose: renderTable }),
          }, [h('span.cmp-ico', d.p.icon), h('span', d.p.name)]))),
        ])),
        h('tbody', rows.map((r) => {
          const vals = r.val ? data.map(r.val) : null;
          const b = vals ? best(vals, r.prefer) : null;
          return h('tr', [
            h('th', r.label),
            ...data.map((d, i) => {
              if (r.cell) return h('td', r.cell(d));
              const v = vals[i];
              return h('td' + (b !== null && v === b ? '.best' : ''), v === null || v === undefined ? '—' : r.fmt(v));
            }),
          ]);
        })),
      ]));
    }

    if (items.length) { renderChips(); renderTable(); }
  });
}
