/** الشِل: شريط التنقّل الخماسي + توجيه الأقسام + شريط المشغّل المصغّر. */

import { h, fill } from './core/dom.js';
import { state, save } from './core/store.js';
import { haptic } from './core/ui.js';
import { setSection } from './core/usage.js';
import { mountMiniPlayer } from './sections/music/mini.js';

import music from './sections/music/index.js';
import time from './sections/time/index.js';
import commit from './sections/commit/index.js';
import places from './sections/places/index.js';
import growth from './sections/growth/index.js';

export const SECTIONS = [music, time, commit, places, growth];

let current = null;
let screenEl = null;
let navEl = null;
let miniHost = null;

export function mountApp(root) {
  screenEl = h('main.screen');
  miniHost = h('div#mini-host');
  navEl = h('nav.nav');

  SECTIONS.forEach((sec) => {
    navEl.append(h('button', {
      dataset: { id: sec.id },
      onclick: () => { haptic(); go(sec.id); },
    }, [h('span.ico', sec.icon), h('span', sec.label)]));
  });

  fill(root, [screenEl, miniHost, navEl]);
  mountMiniPlayer(miniHost, (id) => go(id));

  const start = SECTIONS.some((s) => s.id === state.settings.startSection)
    ? state.settings.startSection : 'music';
  go(start, { restore: true });
}

/** ينتقل إلى قسم. `params` تُمرَّر إلى القسم (مثل فتح تبويب معيّن). */
export function go(id, params = {}) {
  const sec = SECTIONS.find((s) => s.id === id);
  if (!sec) return;
  if (current?.id === id && !params.force) {
    if (params.tab && current.setTab) current.setTab(params.tab);
    return;
  }

  current?.unmount?.();
  screenEl.replaceChildren();
  screenEl.scrollTop = 0;

  const api = sec.mount(screenEl, params) || {};
  current = { id, ...api };
  setSection(id);

  [...navEl.children].forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  document.documentElement.dataset.section = id;
}

export function currentSection() { return current?.id; }

/** إعادة رسم القسم الحالي (بعد تغييرات كبيرة في البيانات). */
export function refresh() {
  if (current) go(current.id, { force: true });
}

export function setStartSection(id) {
  state.settings.startSection = id;
  save();
}
