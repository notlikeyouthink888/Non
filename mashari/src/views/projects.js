/** تبويب المشاريع: قاعدة الأفكار كاملة مع البحث والفلترة. */

import { h, fill, chipGroup, empty } from '../core/dom.js';
import { state, save } from '../core/store.js';
import { allCats, allProjects, filterProjects, countProjects, catOf, TYPES, CAPITALS } from '../model.js';
import { openStudy } from './study.js';
import { openProjectForm } from './projectForm.js';
import { openSettings } from './settings.js';
import { projectRow, head } from './parts.js';

let panelOpen = false;

const VERDICT_FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'star', label: '⭐ المفضّلة' },
  { value: 'win', label: '✅ ينجح' },
  { value: 'maybe', label: '🤔 متردد' },
  { value: 'lose', label: '❌ يفشل' },
  { value: 'studied', label: '✍️ درستها' },
  { value: 'none', label: '⭕ بلا حكم' },
];

const SORTS = [
  { value: 'default', label: 'حسب القسم' },
  { value: 'recent', label: 'آخر ما درست' },
  { value: 'chance', label: 'نسبة النجاح' },
  { value: 'name', label: 'الاسم' },
];

const advancedOn = (f) => f.type !== 'all' || !!f.cap || f.sort !== 'default';

export function mountProjects(screen) {
  const f = state.ui.filter;
  const listEl = h('div.plist-wrap');
  const countEl = h('div.result-line');

  const search = h('input.search', {
    type: 'search', value: f.q, enterKeyHint: 'search',
    placeholder: 'دوّر على فكرة… مثلًا: عطور، فيب، مطعم',
    'aria-label': 'بحث',
  });
  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { f.q = search.value; save(); renderList(); }, 140);
  });

  const panel = h('div.filter-panel' + (panelOpen ? '.open' : ''));
  const filterBtn = h('button.chip.filter-btn', {
    type: 'button',
    onclick: () => { panelOpen = !panelOpen; panel.classList.toggle('open', panelOpen); },
  }, '⚙︎ فلترة');

  const changed = () => { save(); renderList(); };

  function renderPanel() {
    filterBtn.classList.toggle('on', advancedOn(f));
    fill(panel, [
      h('div.flabel', 'النوع'),
      chipGroup([{ value: 'all', label: 'الكل' }, ...TYPES.map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` }))],
        f.type, (v) => { f.type = v; filterBtn.classList.toggle('on', advancedOn(f)); changed(); }),
      h('div.flabel', 'رأس المال التقريبي'),
      chipGroup([{ value: 0, label: 'الكل' }, ...CAPITALS.map((c) => ({ value: c.id, label: c.name }))],
        f.cap, (v) => { f.cap = v; filterBtn.classList.toggle('on', advancedOn(f)); changed(); }),
      h('div.flabel', 'الترتيب'),
      chipGroup(SORTS, f.sort, (v) => { f.sort = v; filterBtn.classList.toggle('on', advancedOn(f)); changed(); }),
    ]);
  }

  const perCat = new Map();
  allProjects().forEach((p) => perCat.set(p.cat, (perCat.get(p.cat) || 0) + 1));
  const catChips = chipGroup(
    [{ value: 'all', label: 'كل الأقسام' }, ...allCats().filter((c) => perCat.get(c.id)).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))],
    f.cat, (v) => { f.cat = v; changed(); }, { scroll: true },
  );

  const open = (p) => openStudy({ kind: 'project', id: p.id });

  function clearFilters() {
    Object.assign(f, { q: '', verdict: 'all', cat: 'all', type: 'all', cap: 0, sort: 'default' });
    save();
    screen.replaceChildren();
    mountProjects(screen);
  }

  function renderList() {
    const list = filterProjects(f);
    const total = countProjects();
    const filtered = list.length !== total;
    fill(countEl, [
      h('span', filtered ? `يظهر ${list.length} من ${total} فكرة` : `${total} فكرة مشروع`),
      filtered ? h('button.link', { type: 'button', onclick: clearFilters }, 'شيل الفلاتر') : null,
    ]);

    if (!list.length) {
      fill(listEl, empty('🔍', f.verdict !== 'all' && f.verdict !== 'none'
        ? 'ماكو مشاريع بهذا الحكم بعد — افتح مشروع واكتب حكمك.'
        : 'ما لگيت شي بهالبحث. جرّب كلمة ثانية، أو أضفه كمشروع جديد.',
      h('button.btn.mt', { type: 'button', onclick: addNew }, '＋ أضف مشروع جديد')));
      return;
    }

    const grouped = f.sort === 'default' && f.cat === 'all' && !f.q.trim();
    if (!grouped) {
      fill(listEl, h('div.list', list.map((p) => projectRow(p, open))));
      return;
    }
    const groups = new Map();
    list.forEach((p) => { if (!groups.has(p.cat)) groups.set(p.cat, []); groups.get(p.cat).push(p); });
    fill(listEl, [...groups.entries()].map(([cat, items]) => {
      const c = catOf(cat);
      return h('section.group', [
        h('div.ghead', [
          h('h2.sec', [h('span', `${c.icon} ${c.name}`), h('span.count', String(items.length))]),
          h('button.link', { type: 'button', onclick: () => openStudy({ kind: 'sector', id: cat }) }, 'ادرس القطاع ‹'),
        ]),
        h('div.list', items.map((p) => projectRow(p, open))),
      ]);
    }));
  }

  function addNew() {
    openProjectForm(null, {
      defaultCat: f.cat !== 'all' ? f.cat : undefined,
      onSaved: (p) => openStudy({ kind: 'project', id: p.id }),
    });
  }

  renderPanel();
  fill(screen, [
    head('دراسة مشاريع', `${state.market.title} · إنت اللي تقرر ينجح لو يفشل`,
      h('button.btn.icon.ghost', { type: 'button', 'aria-label': 'الإعدادات', onclick: openSettings }, '⚙')),
    h('div.searchbar', [search]),
    h('div.chips.scroll.vrow', [
      filterBtn,
      ...VERDICT_FILTERS.map((v) => h('button.chip' + (f.verdict === v.value ? '.on' : ''), {
        type: 'button',
        onclick: (e) => {
          f.verdict = v.value;
          [...e.currentTarget.parentElement.children].forEach((c) => { if (c !== filterBtn) c.classList.remove('on'); });
          e.currentTarget.classList.add('on');
          changed();
        },
      }, v.label)),
    ]),
    panel,
    catChips,
    countEl,
    listEl,
    h('button.fab', { type: 'button', 'aria-label': 'أضف مشروع', onclick: addNew }, [h('span', '＋'), h('span.fab-l', 'مشروع')]),
  ]);
  renderList();
  // نوسّط رقاقة القسم المختار أفقيًا فقط (scrollIntoView كان يحرّك القائمة لفوق)
  requestAnimationFrame(() => {
    const on = catChips.querySelector('.on');
    if (!on) return;
    const box = catChips.getBoundingClientRect();
    const chip = on.getBoundingClientRect();
    catChips.scrollLeft += (chip.left + chip.width / 2) - (box.left + box.width / 2);
  });
}
