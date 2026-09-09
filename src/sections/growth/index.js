/** القسم الخامس: الإنتاجية — مكتبة تتجاوز ١٠٠ عنصر، مسارات، وتتبّع ما أتقنته. */

import '../../styles/growth.css';
import { h, fill, empty, chipGroup } from '../../core/dom.js';
import { dayKey, durMin } from '../../core/fmt.js';
import { state, save, emit, subscribe } from '../../core/store.js';
import { sheet, toast, haptic, promptSheet } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import {
  GROWTH, GROWTH_CATEGORIES, PATHS, growthById, growthCategory, TOTAL_GROWTH,
} from '../../data/growth.js';
import { newTask, saveTask } from '../time/calendar.js';

const TABS = [
  { id: 'today', label: 'اليوم' },
  { id: 'library', label: 'المكتبة' },
  { id: 'paths', label: 'المسارات' },
  { id: 'done', label: 'ما أتقنته' },
];

let tab = 'today';
let cat = 'all';
let query = '';

export default {
  id: 'growth',
  label: 'الإنتاجية',
  icon: '📈',

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
        h('div', [h('h1', 'إنتاجيتك'), h('p', `${TOTAL_GROWTH} عنصرًا عمليًا في ${GROWTH_CATEGORIES.length} قسمًا`)]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('growth', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'today') return todayTab(rerender);
  if (which === 'library') return libraryTab(rerender);
  if (which === 'paths') return pathsTab(rerender);
  return doneTab(rerender);
}

/* ─────────────────── الحالة ─────────────────── */

export function isDone(id) { return state.growth.done.some((d) => d.id === id); }
export function isFocused(id) { return state.growth.focusIds.includes(id); }

export function markDone(id, done = true) {
  const list = state.growth.done;
  const i = list.findIndex((d) => d.id === id);
  if (done && i < 0) {
    list.push({ id, day: dayKey(), at: Date.now() });
    state.growth.xp += 10;
    state.growth.focusIds = state.growth.focusIds.filter((x) => x !== id);
  } else if (!done && i >= 0) {
    list.splice(i, 1);
    state.growth.xp = Math.max(0, state.growth.xp - 10);
  }
  save();
  emit('growth');
}

export function toggleFocus(id) {
  const f = state.growth.focusIds;
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1);
  else {
    if (f.length >= 5) { toast('ركّز على ٥ عناصر كحدّ أقصى', 'err'); return false; }
    f.push(id);
  }
  save();
  emit('growth');
  return i < 0;
}

/** عنصر اليوم — يُختار مرّة واحدة يوميًا ويبقى ثابتًا. */
export function dailyPick() {
  const today = dayKey();
  const pick = state.growth.dailyPick;
  if (pick && pick.day === today && growthById(pick.id) && !isDone(pick.id)) return growthById(pick.id);

  const pool = GROWTH.filter((g) => !isDone(g.id));
  if (!pool.length) return null;
  // اختيار ثابت لليوم اعتمادًا على التاريخ حتى لا يتغيّر بكل فتح
  const seed = [...today].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const item = pool[seed % pool.length];
  state.growth.dailyPick = { day: today, id: item.id };
  save();
  return item;
}

const level = () => Math.floor(state.growth.xp / 100) + 1;

/* ─────────────────── التبويبات ─────────────────── */

function todayTab(rerender) {
  const pick = dailyPick();
  const focus = state.growth.focusIds.map(growthById).filter(Boolean);
  const doneCount = state.growth.done.length;
  const pct = Math.round((doneCount / TOTAL_GROWTH) * 100);

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `المستوى ${level()}`),
          h('div.card-s', `${doneCount} من ${TOTAL_GROWTH} عنصرًا · ${state.growth.xp} نقطة`),
        ]),
        h('div', { style: { fontSize: '26px' } }, '📈'),
      ]),
      h('div.bar', { style: { marginTop: '10px' } }, h('i', { style: { width: `${pct}%` } })),
      h('div.muted', { style: { marginTop: '6px' } }, `${pct}% من المكتبة`),
    ]),

    pick ? h('div', [
      h('h2.sec', 'عنصر اليوم'),
      growthCard(pick, rerender, true),
    ]) : null,

    h('h2.sec', `تركيزي الآن (${focus.length}/5)`),
    focus.length
      ? h('div.list', focus.map((g) => growthRow(g, rerender)))
      : h('div.muted', 'اختر حتى ٥ عناصر من المكتبة لتركّز عليها هذه الفترة.'),

    h('h2.sec', 'ابدأ من هنا'),
    h('div.list', PATHS.slice(0, 3).map((p) => h('div.item', {
      onclick: () => { tab = 'paths'; rerender(); },
    }, [
      h('div.n', { style: { fontSize: '18px' } }, p.icon),
      h('div.grow', [h('div.t', p.title), h('div.s', p.desc)]),
    ]))),
  ]);
}

function libraryTab(rerender) {
  const q = query.trim().toLowerCase();
  let list = cat === 'all' ? GROWTH : GROWTH.filter((g) => g.cat === cat);
  if (q) list = list.filter((g) => g.title.toLowerCase().includes(q) || g.why.toLowerCase().includes(q));

  return h('div', [
    h('input', {
      type: 'search', placeholder: 'ابحث عن مهارة أو عادة…', value: query,
      oninput: (e) => { query = e.target.value; rerender(); },
    }),
    h('div', { style: { marginTop: '12px' } }, chipGroup(
      [{ value: 'all', label: `الكل (${GROWTH.length})` },
        ...GROWTH_CATEGORIES.map((c) => ({
          value: c.id,
          label: `${c.icon} ${c.label} (${GROWTH.filter((g) => g.cat === c.id).length})`,
        }))],
      cat,
      (v) => { cat = v; rerender(); },
    )),
    list.length
      ? h('div.list', { style: { marginTop: '14px' } }, list.map((g) => growthRow(g, rerender)))
      : h('div', { style: { marginTop: '20px' } }, empty('🔍', 'لا نتائج مطابقة')),
  ]);
}

function pathsTab(rerender) {
  return h('div.list', PATHS.map((p) => {
    const items = p.items.map(growthById).filter(Boolean);
    const done = items.filter((g) => isDone(g.id)).length;
    return h('div.card', [
      h('div.row.between', [
        h('div.grow', [
          h('div.card-t', `${p.icon} ${p.title}`),
          h('div.card-s', p.desc),
        ]),
        h('span.badge' + (done === items.length ? '.ok' : ''), `${done}/${items.length}`),
      ]),
      h('div.bar', { style: { margin: '10px 0' } },
        h('i', { style: { width: `${Math.round((done / Math.max(1, items.length)) * 100)}%` } })),
      h('div.list', items.map((g) => growthRow(g, rerender, true))),
    ]);
  }));
}

function doneTab(rerender) {
  const done = state.growth.done
    .map((d) => ({ ...d, item: growthById(d.id) }))
    .filter((d) => d.item)
    .sort((a, b) => b.at - a.at);

  const byCat = {};
  done.forEach((d) => { byCat[d.item.cat] = (byCat[d.item.cat] || 0) + 1; });

  return h('div', [
    h('div.grid2', [
      statCard('أتقنته', String(done.length)),
      statCard('المستوى', String(level())),
    ]),

    h('h2.sec', 'حسب القسم'),
    h('div.card', GROWTH_CATEGORIES.map((c) => {
      const total = GROWTH.filter((g) => g.cat === c.id).length;
      const n = byCat[c.id] || 0;
      return h('div', { style: { marginBottom: '10px' } }, [
        h('div.row.between', [
          h('span.muted', `${c.icon} ${c.label}`),
          h('span.muted.mono', `${n}/${total}`),
        ]),
        h('div.bar', h('i', { style: { width: `${Math.round((n / total) * 100)}%` } })),
      ]);
    })),

    h('h2.sec', 'آخر ما أتقنته'),
    done.length
      ? h('div.list', done.slice(0, 30).map((d) => growthRow(d.item, rerender)))
      : empty('🌱', 'لم تُعلّم أي عنصر كمنجَز بعد — ابدأ بعنصر اليوم.'),
  ]);
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '21px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}

/* ─────────────────── عناصر ─────────────────── */

function growthRow(g, rerender, compact = false) {
  const done = isDone(g.id);
  return h('div.growth' + (done ? '.done' : ''), [
    h('div.box', {
      onclick: (e) => { e.stopPropagation(); haptic(18); markDone(g.id, !done); rerender(); },
    }, done ? '✓' : ''),
    h('div.grow', { onclick: () => openGrowth(g, rerender) }, [
      h('div.t', g.title),
      h('div.s', compact
        ? `${g.type} · ${durMin(g.minutes)}`
        : `${growthCategory(g.cat).icon} ${growthCategory(g.cat).label} · ${g.type} · ${durMin(g.minutes)} · ${g.level}`),
    ]),
    isFocused(g.id) ? h('span.badge.accent', '★') : null,
  ]);
}

function growthCard(g, rerender, highlight = false) {
  return h('div.card' + (highlight ? '.glow' : ''), { onclick: () => openGrowth(g, rerender) }, [
    h('div.row.between', [
      h('div.grow', [
        h('div.card-t', g.title),
        h('div.card-s', g.why),
      ]),
      h('span.badge.accent', durMin(g.minutes)),
    ]),
    h('div.row', { style: { marginTop: '10px', gap: '8px' } }, [
      h('button.btn.sm.primary', {
        onclick: (e) => { e.stopPropagation(); markDone(g.id, true); toast('أحسنت — سُجّل كمنجَز', 'ok'); rerender(); },
      }, '✓ أنجزته'),
      h('button.btn.sm', {
        onclick: (e) => { e.stopPropagation(); openGrowth(g, rerender); },
      }, 'الطريقة'),
    ]),
  ]);
}

export function openGrowth(g, rerender) {
  const body = h('div');
  const panel = sheet(g.title, body);

  function render() {
    const done = isDone(g.id);
    const note = state.growth.notes[g.id] || '';

    fill(body, [
      h('div.row.wrap', { style: { gap: '6px' } }, [
        h('span.badge.accent', `${growthCategory(g.cat).icon} ${growthCategory(g.cat).label}`),
        h('span.badge', g.type),
        h('span.badge', durMin(g.minutes)),
        h('span.badge', g.level),
      ]),

      h('h2.sec', 'لماذا يهمّ'),
      h('p', { style: { margin: 0 } }, g.why),

      h('h2.sec', 'الطريقة'),
      h('ol.howto', g.how.map((s) => h('li', s))),

      note ? h('div', [h('h2.sec', 'ملاحظتي'), h('div.card.tight', h('div.card-s', note))]) : null,

      h('div.grid2', { style: { marginTop: '16px' } }, [
        h('button.btn' + (done ? '.ok' : '.primary'), {
          onclick: () => { markDone(g.id, !done); render(); rerender?.(); },
        }, done ? '✓ أنجزته (اضغط للتراجع)' : '✓ علّمه كمنجَز'),
        h('button.btn' + (isFocused(g.id) ? '.ok' : ''), {
          onclick: () => { toggleFocus(g.id); render(); rerender?.(); },
        }, isFocused(g.id) ? '★ ضمن تركيزي' : '☆ أضِف لتركيزي'),
      ]),

      h('div.grid2', { style: { marginTop: '10px' } }, [
        h('button.btn.ghost', {
          onclick: async () => {
            const text = await promptSheet('ملاحظتي على هذا العنصر', { value: note, multiline: true });
            if (text === null) return;
            state.growth.notes[g.id] = text;
            save();
            render();
          },
        }, '✎ ملاحظة'),
        h('button.btn.ghost', {
          onclick: () => {
            saveTask(newTask({
              title: g.title,
              note: g.how.join(' • '),
              tag: 'عام',
              priority: 'mid',
            }));
            panel.close();
            toast('أُضيف كمهمّة اليوم', 'ok');
          },
        }, '＋ كمهمّة اليوم'),
      ]),
    ]);
  }

  render();
}
