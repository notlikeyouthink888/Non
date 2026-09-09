/** القسم الثالث: الالتزامات — تمارين واسترخاء بمواعيدها، وتتبّع يومي بالسلاسل. */

import '../../styles/commit.css';
import { h, fill, empty, chipGroup, toggle as toggleSwitch, settingRow } from '../../core/dom.js';
import { dayKey, AR_DAYS_SHORT, addDays, durMin } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { System } from '../../core/native.js';
import { scheduleReminder, cancelReminder } from '../time/alarms.js';
import { EXERCISES, ROUTINES, CATEGORIES, byId, categoryOf } from '../../data/exercises.js';

const TABS = [
  { id: 'today', label: 'اليوم' },
  { id: 'library', label: 'المكتبة' },
  { id: 'routines', label: 'روتينات' },
  { id: 'progress', label: 'تقدّمي' },
];

let tab = 'today';
let cat = 'all';

export default {
  id: 'commit',
  label: 'التزاماتي',
  icon: '🎯',

  mount(root, params = {}) {
    if (params.tab) tab = params.tab;
    const content = h('div');
    const tabsEl = h('div.tabs');

    TABS.forEach((t) => tabsEl.append(h('button', {
      dataset: { tab: t.id },
      onclick: () => { tab = t.id; haptic(); sync(); render(); },
    }, t.label)));

    fill(root, [
      h('div.head', [
        h('div', [h('h1', 'التزاماتك'), h('p', 'تمارين واسترخاء في أوقاتها الصحيحة')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('commit', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'today') return todayTab(rerender);
  if (which === 'library') return libraryTab(rerender);
  if (which === 'routines') return routinesTab(rerender);
  return progressTab();
}

/* ─────────────────── الالتزامات ─────────────────── */

export function addCommitment(source, opts = {}) {
  const c = {
    id: uid('cm_'),
    libId: source.id,
    kind: source.items ? 'routine' : 'exercise',
    title: source.title,
    minutes: source.minutes || (source.items ? source.items.reduce((s, i) => s + (byId(i)?.minutes || 0), 0) : 10),
    time: opts.time || defaultTimeFor(source.bestTime),
    days: opts.days || [0, 1, 2, 3, 4, 5, 6],
    remind: opts.remind ?? true,
    streak: 0,
    best: 0,
    lastDone: null,
    createdAt: Date.now(),
  };
  state.commit.active.push(c);
  save();
  syncReminder(c);
  emit('commit');
  return c;
}

function defaultTimeFor(bestTime) {
  return ({
    'صباح': '07:30', 'ظهر': '13:00', 'عصر': '17:00',
    'مساء': '20:00', 'قبل النوم': '22:30',
  })[bestTime] || '18:00';
}

function numericId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 100000 + 300000;
}

function syncReminder(c) {
  const nid = numericId(c.id);
  cancelReminder(nid);
  if (!c.remind || !c.time) return;
  const [hh, mm] = c.time.split(':').map(Number);
  const at = new Date();
  at.setHours(hh, mm, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  // التكرار الأسبوعي يتولّاه النظام
  scheduleReminder({
    id: nid, at: at.getTime(),
    title: c.title,
    body: `التزامك اليومي · ${durMin(c.minutes)}`,
  });
}

export function removeCommitment(id) {
  cancelReminder(numericId(id));
  state.commit.active = state.commit.active.filter((c) => c.id !== id);
  save();
  emit('commit');
}

export function isDoneToday(c, key = dayKey()) {
  return (state.commit.log[key] || []).includes(c.id);
}

export function toggleDone(c, key = dayKey()) {
  const log = state.commit.log;
  log[key] = log[key] || [];
  const i = log[key].indexOf(c.id);
  if (i >= 0) {
    log[key].splice(i, 1);
  } else {
    log[key].push(c.id);
    c.lastDone = key;
  }
  c.streak = computeStreak(c);
  c.best = Math.max(c.best || 0, c.streak);
  save();
  emit('commit');
}

/** يعدّ الأيام المتتابعة المنجَزة — يوم اليوم غير المنجَز لا يكسر السلسلة بعد. */
function computeStreak(c) {
  const done = (d) => (state.commit.log[dayKey(d)] || []).includes(c.id);
  const cursor = new Date();
  if (!done(cursor)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (streak < 400 && done(cursor)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** الالتزامات المستحقّة اليوم بحسب أيام الأسبوع المختارة. */
export function dueToday() {
  const dow = new Date().getDay();
  return state.commit.active.filter((c) => c.days.includes(dow));
}

/* ─────────────────── التبويبات ─────────────────── */

function todayTab(rerender) {
  const due = dueToday();
  const key = dayKey();
  const done = due.filter((c) => isDoneToday(c, key));

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `${done.length} من ${due.length} اليوم`),
          h('div.card-s', due.length ? `${durMin(due.reduce((s, c) => s + c.minutes, 0))} إجمالي` : 'أضف التزامك الأول من المكتبة'),
        ]),
        h('div', { style: { fontSize: '26px' } }, done.length === due.length && due.length ? '✅' : '🎯'),
      ]),
      due.length ? h('div.bar', { style: { marginTop: '10px' } },
        h('i', { style: { width: `${Math.round((done.length / due.length) * 100)}%` } })) : null,
    ]),

    due.length ? h('div.list', due.map((c) => commitRow(c, key, rerender)))
      : empty('🎯', 'لا التزامات لليوم — اختر من المكتبة أو الروتينات.'),

    state.commit.active.length ? h('div', [
      h('h2.sec', 'كل التزاماتي'),
      h('div.list', state.commit.active.map((c) => h('div.item', [
        h('div.grow', { onclick: () => openCommitEditor(c, rerender) }, [
          h('div.t', c.title),
          h('div.s', `${c.time} · ${c.days.length === 7 ? 'كل يوم' : c.days.map((d) => AR_DAYS_SHORT[d]).join('، ')}`),
        ]),
        h('span.badge' + (c.streak > 0 ? '.ok' : ''), `🔥 ${c.streak}`),
      ]))),
    ]) : null,
  ]);
}

function commitRow(c, key, rerender) {
  const done = isDoneToday(c, key);
  const src = byId(c.libId) || ROUTINES.find((r) => r.id === c.libId);
  return h('div.commit' + (done ? '.done' : ''), [
    h('div.box', { onclick: () => { haptic(20); toggleDone(c, key); rerender(); } }, done ? '✓' : ''),
    h('div.grow', { onclick: () => (src ? openHowTo(src) : openCommitEditor(c, rerender)) }, [
      h('div.t', c.title),
      h('div.s', `${c.time} · ${durMin(c.minutes)}${c.streak ? ` · 🔥 ${c.streak} يوم` : ''}`),
    ]),
    src && !src.items ? h('button.btn.sm.ghost', {
      onclick: () => openTimerFor(c, src, rerender),
    }, '▶') : null,
  ]);
}

function libraryTab(rerender) {
  const list = cat === 'all' ? EXERCISES : EXERCISES.filter((e) => e.cat === cat);
  return h('div', [
    chipGroup(
      [{ value: 'all', label: `الكل (${EXERCISES.length})` },
        ...CATEGORIES.map((c) => ({ value: c.id, label: `${c.icon} ${c.label}` }))],
      cat,
      (v) => { cat = v; rerender(); },
    ),
    h('div.list', { style: { marginTop: '14px' } }, list.map((e) => h('div.item', [
      h('div.n', { style: { fontSize: '18px' } }, categoryOf(e.cat).icon),
      h('div.grow', { onclick: () => openHowTo(e, rerender) }, [
        h('div.t', e.title),
        h('div.s', `${durMin(e.minutes)} · ${e.level} · ${e.bestTime}`),
      ]),
      h('button.btn.sm', {
        onclick: () => openAddSheet(e, rerender),
      }, '＋'),
    ]))),
  ]);
}

function routinesTab(rerender) {
  return h('div.list', ROUTINES.map((r) => h('div.card', [
    h('div.row.between', [
      h('div.grow', [
        h('div.card-t', `${r.icon} ${r.title}`),
        h('div.card-s', r.desc),
        h('div.muted', { style: { marginTop: '4px' } }, `أفضل وقت: ${r.bestTime}`),
      ]),
    ]),
    h('div.chips', { style: { marginTop: '10px' } },
      r.items.map((id) => {
        const e = byId(id);
        return e ? h('button.chip.sm', { onclick: () => openHowTo(e) }, e.title) : null;
      })),
    h('div.grid2', { style: { marginTop: '10px' } }, [
      h('button.btn.sm', { onclick: () => runRoutine(r) }, '▶ ابدأ الآن'),
      h('button.btn.sm.primary', { onclick: () => openAddSheet(r, rerender) }, '＋ التزام يومي'),
    ]),
  ])));
}

function progressTab() {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const key = dayKey(d);
    const due = state.commit.active.filter((c) => c.days.includes(d.getDay()));
    const done = (state.commit.log[key] || []).length;
    days.push({ key, d, done, total: due.length });
  }
  const totalDone = Object.values(state.commit.log).reduce((s, arr) => s + arr.length, 0);
  const best = Math.max(0, ...state.commit.active.map((c) => c.best || 0));

  return h('div', [
    h('div.grid2', [
      statCard('إجمالي الإنجازات', String(totalDone)),
      statCard('أطول سلسلة', `${best} يوم`),
    ]),

    h('h2.sec', 'آخر أسبوعين'),
    h('div.card', h('div.heat', days.map((x) => h('div.cell', {
      title: `${x.key}: ${x.done}/${x.total}`,
      style: {
        opacity: x.total ? String(0.25 + 0.75 * (x.done / Math.max(1, x.total))) : '0.15',
      },
    }, String(x.d.getDate()))))),

    h('h2.sec', 'التزاماتي'),
    state.commit.active.length
      ? h('div.list', state.commit.active.map((c) => h('div.item', [
        h('div.grow', [h('div.t', c.title), h('div.s', `أفضل سلسلة: ${c.best || 0} يوم`)]),
        h('span.badge.accent', `🔥 ${c.streak || 0}`),
      ])))
      : h('div.muted', 'لا التزامات بعد.'),
  ]);
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '21px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}

/* ─────────────────── أوراق ─────────────────── */

export function openHowTo(item, rerender) {
  const isRoutine = !!item.items;
  sheet(item.title, ({ close }) => h('div', [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', isRoutine ? 'روتين' : categoryOf(item.cat).label),
      h('span.badge', durMin(item.minutes || item.items.reduce((s, i) => s + (byId(i)?.minutes || 0), 0))),
      item.level ? h('span.badge', item.level) : null,
      h('span.badge', `أفضل وقت: ${item.bestTime}`),
    ]),

    item.benefit ? h('p', { style: { marginTop: '12px' } }, item.benefit) : null,
    item.desc ? h('p', { style: { marginTop: '12px' } }, item.desc) : null,

    isRoutine
      ? h('div', [
        h('h2.sec', 'الترتيب'),
        h('div.list', item.items.map((id, i) => {
          const e = byId(id);
          return e ? h('div.item', {
            onclick: () => { close(); openHowTo(e, rerender); },
          }, [
            h('div.n', String(i + 1)),
            h('div.grow', [h('div.t', e.title), h('div.s', `${durMin(e.minutes)} · ${e.level}`)]),
          ]) : null;
        })),
      ])
      : h('div', [
        h('h2.sec', 'الطريقة'),
        h('ol.howto', item.howTo.map((s) => h('li', s))),
        item.note ? h('div.card.tight', { style: { marginTop: '10px' } }, [h('div.card-s', `💡 ${item.note}`)]) : null,
      ]),

    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn', { onclick: () => { close(); isRoutine ? runRoutine(item) : runSingle(item); } }, '▶ ابدأ'),
      h('button.btn.primary', { onclick: () => { close(); openAddSheet(item, rerender); } }, '＋ أضِف كالتزام'),
    ]),
  ]));
}

function openAddSheet(source, rerender) {
  const draft = {
    time: defaultTimeFor(source.bestTime),
    days: [0, 1, 2, 3, 4, 5, 6],
    remind: true,
  };
  const body = h('div');
  const panel = sheet('أضِف كالتزام', body);

  function render() {
    fill(body, [
      h('div.card.tight', [h('div.card-t', source.title), h('div.card-s', `أفضل وقت مقترح: ${source.bestTime}`)]),

      h('h2.sec', 'الوقت'),
      h('input', { type: 'time', value: draft.time, onchange: (e) => { draft.time = e.target.value; } }),

      h('h2.sec', 'الأيام'),
      chipGroup(AR_DAYS_SHORT.map((d, i) => ({ value: i, label: d })), draft.days,
        (days) => { draft.days = days; }, { multi: true }),
      h('div.chips', { style: { marginTop: '8px' } }, [
        h('button.chip', { onclick: () => { draft.days = [0, 1, 2, 3, 4, 5, 6]; render(); } }, 'كل يوم'),
        h('button.chip', { onclick: () => { draft.days = [0, 1, 2, 3, 4]; render(); } }, 'أيام الدوام'),
        h('button.chip', { onclick: () => { draft.days = [1, 3, 5]; render(); } }, 'يوم بعد يوم'),
      ]),

      h('h2.sec', 'تذكير'),
      settingRow('نبّهني في الموعد', 'إشعار يوميًا', toggleSwitch(draft.remind, (on) => { draft.remind = on; })),

      h('button.btn.primary.block', {
        style: { marginTop: '14px' },
        onclick: () => {
          if (!draft.days.length) { toast('اختر يومًا واحدًا على الأقل', 'err'); return; }
          addCommitment(source, draft);
          panel.close();
          toast('أُضيف إلى التزاماتك', 'ok');
          rerender?.();
        },
      }, '💾 أضِف'),
    ]);
  }

  render();
}

function openCommitEditor(c, rerender) {
  const body = h('div');
  const panel = sheet(c.title, body);

  function render() {
    fill(body, [
      h('h2.sec', 'الوقت'),
      h('input', { type: 'time', value: c.time, onchange: (e) => { c.time = e.target.value; save(); syncReminder(c); } }),

      h('h2.sec', 'الأيام'),
      chipGroup(AR_DAYS_SHORT.map((d, i) => ({ value: i, label: d })), c.days,
        (days) => { c.days = days; save(); }, { multi: true }),

      h('h2.sec', 'تذكير'),
      settingRow('نبّهني', null, toggleSwitch(c.remind, (on) => { c.remind = on; save(); syncReminder(c); })),

      h('div.card.tight', { style: { marginTop: '12px' } }, [
        h('div.card-t', `🔥 السلسلة الحالية: ${c.streak || 0} يوم`),
        h('div.card-s', `الأفضل: ${c.best || 0} يوم`),
      ]),

      h('button.btn.danger.block', {
        style: { marginTop: '14px' },
        onclick: async () => {
          if (!await confirmSheet('حذف الالتزام', `سيُحذف «${c.title}» مع تذكيره.`)) return;
          removeCommitment(c.id);
          panel.close();
          rerender?.();
        },
      }, '🗑 حذف الالتزام'),
    ]);
  }

  render();
}

/* ─────────────────── مشغّل التمرين ─────────────────── */

function runSingle(e) {
  runSequence([e]);
}

function runRoutine(r) {
  const items = r.items.map(byId).filter(Boolean);
  if (items.length) runSequence(items, r.title);
}

/** يشغّل سلسلة تمارين بمؤقّت لكل خطوة. */
function runSequence(items, title = '') {
  let i = 0;
  let remaining = items[0].minutes * 60;
  let paused = false;
  let wake = null;

  const body = h('div');
  const panel = sheet(title || items[0].title, body, {
    onClose: () => { clearInterval(iv); wake?.release?.(); },
  });

  System.keepAwake(true).then((w) => { wake = w; });

  function render() {
    const e = items[i];
    fill(body, [
      h('div.center.muted', `${i + 1} / ${items.length}`),
      h('div.big-clock', { dataset: { run: '1' } }, fmt(remaining)),
      h('div.center', { style: { marginBottom: '10px' } }, [h('b', e.title)]),
      h('ol.howto', e.howTo.map((s) => h('li', s))),
      h('div.grid2', { style: { marginTop: '14px' } }, [
        h('button.btn', { onclick: () => { paused = !paused; render(); } }, paused ? '▶ متابعة' : '⏸ إيقاف'),
        h('button.btn.primary', { onclick: nextItem }, i < items.length - 1 ? 'التالي ⏭' : 'إنهاء ✓'),
      ]),
    ]);
  }

  function nextItem() {
    if (i < items.length - 1) {
      i++;
      remaining = items[i].minutes * 60;
      render();
    } else {
      clearInterval(iv);
      panel.close();
      toast('أحسنت — أنهيت التمرين', 'ok');
      haptic(30);
    }
  }

  const iv = setInterval(() => {
    if (paused) return;
    remaining--;
    const el = body.querySelector('[data-run]');
    if (el) el.textContent = fmt(remaining);
    if (remaining <= 0) { haptic(40); nextItem(); }
  }, 1000);

  render();
}

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

function openTimerFor(c, src, rerender) {
  runSequence([src], c.title);
  rerender?.();
}
