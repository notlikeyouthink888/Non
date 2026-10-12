/** تقاريري: كل التقارير المحفوظة في الجهاز مع بحث وإجراءات سريعة. */

import { h, fill, empty, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go } from '../core/nav.js';
import { listReports, deleteReport } from '../core/db.js';
import { actionSheet, confirmSheet, toast } from '../core/ui.js';
import { norm } from '../core/arabic.js';
import { REPORT_TYPES } from '../data/types.js';
import { reportItem } from './common.js';

export default {
  mount(root) {
    let all = [];
    let typeFilter = 'all';
    const input = h('input', { type: 'search', placeholder: 'ابحث في تقاريرك…', oninput: () => onType() });
    const chips = h('div.hscroll.mt');
    const list = h('div.list.mt');
    const count = h('p.sub', '…');

    root.append(h('div.wrap', [
      h('div.row.between', [h('h1.page', 'تقاريري'), h('button.btn.primary.sm', { type: 'button', onclick: () => go('/') }, [icon('plus', 16), 'تقرير جديد'])]),
      count,
      h('div.search', [icon('search', 20), input]),
      chips,
      list,
    ]));

    const onType = debounce(render, 120);

    async function load() {
      all = await listReports().catch(() => []);
      const present = new Set(all.map((r) => r.typeId));
      fill(chips, [
        chip('all', 'الكل'),
        ...REPORT_TYPES.filter((t) => present.has(t.id)).map((t) => chip(t.id, `${t.icon} ${t.short}`)),
      ]);
      chips.style.display = present.size > 1 ? '' : 'none';
      render();
    }

    function chip(id, label) {
      return h('button.chip' + (typeFilter === id ? '.on' : ''), {
        type: 'button',
        onclick: (e) => { typeFilter = id; [...chips.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); render(); },
      }, label);
    }

    function render() {
      const q = norm(input.value.trim());
      const items = all.filter((r) => (typeFilter === 'all' || r.typeId === typeFilter) && (!q || norm(r.title).includes(q)));
      count.textContent = all.length ? `${all.length} تقرير محفوظ في جهازك` : 'تقاريرك تُحفظ هنا داخل جهازك';
      fill(list, items.length
        ? items.map((r) => reportItem(r, { onMore }))
        : all.length
          ? empty('🔎', 'لا توجد تقارير مطابقة.')
          : empty('🗂', 'لم تُنشئ أي تقرير بعد.', h('button.btn.primary', { type: 'button', onclick: () => go('/') }, [icon('plus', 16), 'أنشئ أول تقرير'])));
    }

    async function onMore(r) {
      const a = await actionSheet(r.title, [
        { value: 'open', label: 'فتح', icon: 'file' },
        { value: 'delete', label: 'حذف', icon: 'trash', danger: true },
      ]);
      if (a === 'open') go(`/report/${r.id}`);
      else if (a === 'delete') {
        if (!(await confirmSheet('حذف التقرير', `سيُحذف «${r.title}» وصوره نهائيًا.`, { okText: 'احذف' }))) return;
        await deleteReport(r.id);
        toast('حُذف التقرير');
        load();
      }
    }

    load();
  },
};
