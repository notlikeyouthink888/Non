/** الشِل: شريط التنقّل + ورقة «كل الأقسام» + المشغّل المصغّر. */

import { h, fill } from './core/dom.js';
import { state, save, subscribe } from './core/store.js';
import { haptic, sheet, toast } from './core/ui.js';
import { setSection } from './core/usage.js';
import { mountMiniPlayer } from './sections/music/mini.js';

import music from './sections/music/index.js';
import time from './sections/time/index.js';
import s2 from './sections/s2/index.js';
import study from './sections/study/index.js';
import workout from './sections/workout/index.js';
import money from './sections/money/index.js';
import commit from './sections/commit/index.js';
import places from './sections/places/index.js';
import room from './sections/room/index.js';
import growth from './sections/growth/index.js';

/** كل الأقسام بترتيب العرض في ورقة «الأقسام». */
export const SECTIONS = [music, time, s2, study, workout, money, commit, places, room, growth];

const PIN_COUNT = 4;

let current = null;
let screenEl = null;
let navEl = null;
let miniHost = null;

const byId = (id) => SECTIONS.find((s) => s.id === id);

/** الأقسام المثبّتة في الشريط السفلي. */
function pinned() {
  const ids = (state.settings.navPinned || []).filter(byId).slice(0, PIN_COUNT);
  const fallback = SECTIONS.map((s) => s.id).filter((id) => !ids.includes(id));
  while (ids.length < PIN_COUNT) ids.push(fallback.shift());
  return ids.map(byId);
}

export function mountApp(root) {
  screenEl = h('main.screen');
  miniHost = h('div#mini-host');
  navEl = h('nav.nav');

  fill(root, [screenEl, miniHost, navEl]);
  buildNav();
  mountMiniPlayer(miniHost, (id) => go(id));

  const start = byId(state.settings.startSection) ? state.settings.startSection : 'music';
  go(start, { restore: true });

  subscribe('nav', buildNav);
}

function buildNav() {
  const items = pinned();
  fill(navEl, [
    ...items.map((sec) => h('button', {
      dataset: { id: sec.id },
      onclick: () => { haptic(); go(sec.id); },
    }, [h('span.ico', sec.icon), h('span', sec.label)])),
    h('button', {
      dataset: { id: '__more' },
      onclick: () => { haptic(); openSections(); },
    }, [h('span.ico', '⋯'), h('span', 'الأقسام')]),
  ]);
  markActive();
}

function markActive() {
  if (!navEl) return;
  [...navEl.children].forEach((b) => b.classList.toggle('on', b.dataset.id === current?.id));
}

/** ورقة تعرض كل الأقسام مع إمكانية تثبيت ما تريده في الشريط. */
export function openSections() {
  const body = h('div');
  const panel = sheet('كل الأقسام', body);

  function render() {
    const pins = (state.settings.navPinned || []).slice(0, PIN_COUNT);

    fill(body, [
      h('div.sec-grid', SECTIONS.map((sec) => {
        const isPinned = pins.includes(sec.id);
        return h('button.sec-tile' + (sec.id === current?.id ? '.on' : ''), {
          dataset: { sec: sec.id },
          onclick: () => { panel.close(); go(sec.id); },
        }, [
          h('span.pin' + (isPinned ? '.on' : ''), {
            onclick: (e) => { e.stopPropagation(); togglePin(sec.id); render(); },
          }, isPinned ? '📌' : '📍'),
          h('span.ic', sec.icon),
          h('span.nm', sec.label),
        ]);
      })),
      h('div.muted.center', { style: { marginTop: '12px', fontSize: '12px' } },
        `اضغط 📍 لتثبيت القسم في الشريط السفلي (${PIN_COUNT} أقسام كحدّ أقصى).`),
    ]);
  }

  render();
}

function togglePin(id) {
  const pins = state.settings.navPinned || (state.settings.navPinned = []);
  const i = pins.indexOf(id);
  if (i >= 0) {
    if (pins.length <= 1) { toast('أبقِ قسمًا واحدًا على الأقل', 'err'); return; }
    pins.splice(i, 1);
  } else {
    if (pins.length >= PIN_COUNT) pins.shift();
    pins.push(id);
  }
  save();
  buildNav();
}

/** ينتقل إلى قسم. `params` تُمرَّر إلى القسم (مثل فتح تبويب معيّن). */
export function go(id, params = {}) {
  const sec = byId(id);
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

  markActive();
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
