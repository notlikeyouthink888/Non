/** مكتبة العناوين: الأقسام ثم عناوين كل قسم مع تصفية حسب نوع التقرير. */

import { h, fill, debounce, empty } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go } from '../core/nav.js';
import { CATEGORIES, CAT_BY_ID } from '../data/categories.js';
import { TOPICS, topicsOf } from '../data/topics.js';
import { REPORT_TYPES, TYPE_BY_ID } from '../data/types.js';
import { KB } from '../data/kb/index.js';
import { searchTopics } from '../search/index.js';
import { topicItem, topbar } from './common.js';

export default {
  mount(root, { params }) {
    const catId = params[0];
    if (catId && CAT_BY_ID[catId]) return mountCategory(root, CAT_BY_ID[catId]);
    return mountAll(root);
  },
};

function mountAll(root) {
  const kbCount = Object.keys(KB).length;
  const input = h('input', { type: 'search', placeholder: 'ابحث في كل العناوين…', oninput: () => onType() });
  const body = h('div');
  root.append(h('div.wrap', [
    h('h1.page', 'مكتبة العناوين'),
    h('p.sub', `${TOPICS.length} عنوانًا في ${CATEGORIES.length} قسمًا، منها ${kbCount} بمحتوى كامل يعمل دون اتصال. ولأي عنوان آخر اكتبه بنفسك من الرئيسية.`),
    h('div.search', [icon('search', 20), input]),
    body,
  ]));

  const onType = debounce(render, 150);
  function render() {
    const q = input.value.trim();
    if (q.length >= 2) {
      const res = searchTopics(q, { limit: 50 });
      fill(body, res.length
        ? h('div.list.mt', res.map((r) => topicItem(r.topic)))
        : empty('🔎', 'لا يوجد عنوان مطابق. يمكنك كتابة عنوانك الخاص من الرئيسية.', h('button.btn.primary', { type: 'button', onclick: () => go(`/?q=${encodeURIComponent(q)}`) }, 'ابحث في الرئيسية')));
      return;
    }
    fill(body, h('div.list.mt', CATEGORIES.map((c) => {
      const n = topicsOf(c.id).length;
      const k = topicsOf(c.id).filter((t) => KB[t.id]).length;
      return h('button.item', { type: 'button', onclick: () => go(`/browse/${c.id}`) }, [
        h('div.lead-ico', c.icon),
        h('div.grow', [h('div.t', c.name), h('div.s', [h('span', `${n} عنوانًا`), k ? h('span.badge.ok', `${k} دون اتصال`) : null])]),
        icon('chevron', 18, 'chev'),
      ]);
    })));
  }
  render();
}

function mountCategory(root, cat) {
  const all = topicsOf(cat.id);
  const typeIds = [...new Set(all.flatMap((t) => t.types))].filter((id) => TYPE_BY_ID[id]);
  let filter = 'all';
  let onlyKB = false;

  const list = h('div.list.mt');
  const chips = h('div.hscroll', [
    chip('all', 'الكل'),
    ...REPORT_TYPES.filter((t) => typeIds.includes(t.id)).map((t) => chip(t.id, `${t.icon} ${t.short}`)),
  ]);
  const kbToggle = h('button.chip', { type: 'button', onclick: () => { onlyKB = !onlyKB; kbToggle.classList.toggle('on', onlyKB); render(); } }, '✓ دون اتصال فقط');

  function chip(id, label) {
    return h('button.chip' + (id === filter ? '.on' : ''), {
      type: 'button',
      onclick: (e) => {
        filter = id;
        [...chips.children].forEach((c) => c.classList.remove('on'));
        e.currentTarget.classList.add('on');
        render();
      },
    }, label);
  }

  root.append(
    topbar(cat.name),
    h('div.wrap', [
      h('p.sub.mt', `${all.length} عنوانًا — اختر عنوانًا ثم نوع التقرير الذي تريده.`),
      chips,
      h('div.row.mt', [kbToggle]),
      list,
    ]),
  );

  function render() {
    const items = all.filter((t) => (filter === 'all' || t.types.includes(filter)) && (!onlyKB || KB[t.id]));
    fill(list, items.length
      ? items.map((t) => topicItem(t, { showCat: false, onClick: () => go(`/create?topic=${t.id}${filter !== 'all' ? `&type=${filter}` : ''}`) }))
      : empty('📭', 'لا توجد عناوين بهذا الشرط.'));
  }
  render();
}
