/** الشِل: ثلاث تبويبات (المشاريع، دراستي، السوق) + شريط التنقّل. */

import { h, fill } from './core/dom.js';
import { state, save } from './core/store.js';
import { on } from './core/bus.js';
import { haptic } from './core/ui.js';
import { mountProjects } from './views/projects.js';
import { mountDashboard } from './views/dashboard.js';
import { mountMarket } from './views/market.js';

const TABS = [
  { id: 'projects', icon: '📋', label: 'المشاريع', mount: mountProjects },
  { id: 'mine', icon: '📊', label: 'دراستي', mount: mountDashboard },
  { id: 'market', icon: '🧭', label: 'السوق', mount: mountMarket },
];

let screen = null;
let nav = null;
let current = null;

export function mountApp(root) {
  screen = h('main.screen');
  nav = h('nav.nav', TABS.map((t) => h('button', {
    type: 'button',
    dataset: { id: t.id },
    onclick: () => { haptic(); go(t.id); },
  }, [h('span.ico', t.icon), h('span', t.label)])));
  fill(root, [screen, nav]);

  // البحث ما ينحفظ بين مرة ومرة، حتى تنفتح القائمة كاملة
  state.ui.filter.q = '';

  on('changed', () => refresh());
  on('go', ({ tab, filter } = {}) => {
    if (filter) Object.assign(state.ui.filter, filter);
    go(tab, { force: true });
  });

  go(TABS.some((t) => t.id === state.ui.tab) ? state.ui.tab : 'projects');
}

export function go(id, { force = false } = {}) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab) return;
  if (current === id && !force) {
    screen.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  current = id;
  state.ui.tab = id;
  save();
  screen.replaceChildren();
  screen.scrollTop = 0;
  tab.mount(screen);
  [...nav.children].forEach((b) => b.classList.toggle('on', b.dataset.id === id));
}

/** يعيد رسم التبويب الحالي ويحافظ على مكان التمرير. */
export function refresh() {
  if (!current) return;
  const top = screen.scrollTop;
  screen.replaceChildren();
  TABS.find((t) => t.id === current).mount(screen);
  screen.scrollTop = top;
}
