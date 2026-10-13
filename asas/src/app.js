/**
 * الشِل: موجّه الشاشات بالروابط (#/...) + شريط التنقّل السفلي + زر الرجوع في أندرويد.
 */

import { h, fill } from './core/dom.js';
import { icon } from './core/icons.js';
import { topModalClose, hasModal } from './core/ui.js';
import { onBackButton, exitApp } from './core/native.js';
import { parseHash, go, replace, back } from './core/nav.js';

import home from './screens/home.js';
import browse from './screens/browse.js';
import create from './screens/create.js';
import report from './screens/report.js';
import library from './screens/library.js';
import settings from './screens/settings.js';

const ROUTES = [
  { re: /^\/?$/, screen: home, tab: 'home' },
  { re: /^\/browse(?:\/([\w-]+))?$/, screen: browse, tab: 'browse' },
  { re: /^\/create$/, screen: create, tab: 'home', noNav: true },
  { re: /^\/report\/([\w-]+)$/, screen: report, tab: 'library', noNav: true },
  { re: /^\/library$/, screen: library, tab: 'library' },
  { re: /^\/settings$/, screen: settings, tab: 'settings' },
];

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home', path: '/' },
  { id: 'browse', label: 'المواد', icon: 'grid', path: '/browse' },
  { id: 'library', label: 'تقاريري', icon: 'folder', path: '/library' },
  { id: 'settings', label: 'الإعدادات', icon: 'sliders', path: '/settings' },
];

let screenEl = null;
let navEl = null;
let current = null;

function route() {
  while (hasModal()) topModalClose();
  const { path, query } = parseHash();
  let match = null;
  let r = ROUTES[0];
  for (const rt of ROUTES) {
    match = path.match(rt.re);
    if (match) { r = rt; break; }
  }
  if (!match) { replace('/'); return; }

  try { current?.cleanup?.(); } catch (err) { console.warn('[app] تنظيف الشاشة', err); }
  screenEl.replaceChildren();
  screenEl.scrollTop = 0;
  screenEl.classList.toggle('no-nav', !!r.noNav);
  navEl.classList.toggle('hidden', !!r.noNav);
  [...navEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === r.tab));

  const res = r.screen.mount(screenEl, { params: match.slice(1), query }) || {};
  current = { route: r, cleanup: typeof res === 'function' ? res : res.cleanup };
  document.documentElement.dataset.route = r.tab;
}

export function mountApp(root) {
  screenEl = h('main.screen');
  navEl = h('nav.nav', { 'aria-label': 'التنقّل' }, TABS.map((t) => h('button', {
    type: 'button', dataset: { tab: t.id },
    onclick: () => { if (parseHash().path !== t.path) go(t.path); else screenEl.scrollTo({ top: 0, behavior: 'smooth' }); },
  }, [icon(t.icon, 22), h('span', t.label)])));
  fill(root, [screenEl, navEl]);

  window.addEventListener('hashchange', route);
  onBackButton(() => {
    if (topModalClose()) return;
    const { path } = parseHash();
    if (path === '/' || path === '') exitApp();
    else back('/');
  });
  route();
}

export function screen() { return screenEl; }
