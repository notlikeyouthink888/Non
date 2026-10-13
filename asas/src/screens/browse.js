/** مواد المرحلة الثانية: المواد ثم عناوين كل مادة مع تصفية حسب الصنف (تجارب، أعمال حقلية، مواضيع نظرية). */

import { h, fill, debounce, empty } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go } from '../core/nav.js';
import { CATEGORIES, CAT_BY_ID } from '../data/categories.js';
import { TOPICS, topicsOf, KINDS } from '../data/topics.js';
import { KB } from '../data/kb/index.js';
import { searchTopics } from '../search/index.js';
import { topicItem, topbar } from './common.js';
import { bidi } from '../core/arabic.js';

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
    h('h1.page', 'مواد المرحلة الثانية'),
    h('p.sub', `${TOPICS.length} عنوانًا في ${CATEGORIES.length} مواد، كلها بمحتوى كامل يعمل دون اتصال (${kbCount}) مع أسئلة المناقشة. ولأي عنوان آخر اكتبه بنفسك من الرئيسية.`),
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
      const all = topicsOf(c.id);
      const practical = all.filter((t) => t.kind !== 'theory').length;
      return h('button.item', { type: 'button', onclick: () => go(`/browse/${c.id}`) }, [
        h('div.lead-ico', c.icon),
        h('div.grow', [
          h('div.t', bidi(`${c.name} (${c.enName})`)),
          h('div.s', [
            practical ? h('span', `${practical} ${c.id === 'survey' ? 'عملًا حقليًا' : 'تجربة'}`) : null,
            h('span', `${all.length - practical} موضوعًا نظريًا`),
          ]),
        ]),
        icon('chevron', 18, 'chev'),
      ]);
    })));
  }
  render();
}

function mountCategory(root, cat) {
  const all = topicsOf(cat.id);
  const present = KINDS.filter((k) => all.some((t) => t.kind === k.id));
  let filter = 'all';

  const list = h('div.list.mt');
  const chips = h('div.hscroll', [
    chip('all', `الكل (${all.length})`),
    ...present.map((k) => chip(k.id, `${k.label} (${all.filter((t) => t.kind === k.id).length})`)),
  ]);

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
      h('p.sub.mt', bidi(`${cat.enName} — اختر تجربة أو موضوعًا ثم نوع التقرير: تقرير مختبر، أو أجوبة المناقشة، أو ملخص، أو مسائل محلولة…`)),
      present.length > 1 ? chips : null,
      list,
    ]),
  );

  function render() {
    const items = all.filter((t) => filter === 'all' || t.kind === filter);
    fill(list, items.length
      ? items.map((t) => topicItem(t, { showCat: false }))
      : empty('📭', 'لا توجد عناوين بهذا الشرط.'));
  }
  render();
}
