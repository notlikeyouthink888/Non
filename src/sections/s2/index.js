/**
 * نظام S2 — تنظيم الوقت بالدقيقة.
 *
 * أيام الدوام (السبت–الأربعاء) فيها كتلة ثابتة من ٦:٣٠ إلى ٢:٣٠،
 * والخميس والجمعة عطلة. ما بقي من اليوم توزّعه على فئات:
 * قراءة، نوم، هواية، جم، مذاكرة… وكل كتلة لها وقت بداية ونهاية بالدقيقة.
 */

import '../../styles/s2.css';
import { h, fill, empty, chipGroup, toggle as toggleSwitch, settingRow } from '../../core/dom.js';
import { AR_DAYS, AR_DAYS_SHORT, clock, durMin, pad } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { drawButton, drawPreview, deleteDrawing } from '../../core/draw.js';

export const CATS = [
  { id: 'work', label: 'الدوام', icon: '🏫', color: '#60a5fa' },
  { id: 'study', label: 'مذاكرة', icon: '📚', color: '#a78bfa' },
  { id: 'read', label: 'قراءة', icon: '📖', color: '#22d3ee' },
  { id: 'sleep', label: 'نوم', icon: '😴', color: '#6366f1' },
  { id: 'gym', label: 'جم', icon: '🏋', color: '#f87171' },
  { id: 'hobby', label: 'هواية', icon: '🎨', color: '#fbbf24' },
  { id: 'food', label: 'أكل', icon: '🍽', color: '#34d399' },
  { id: 'pray', label: 'صلاة', icon: '🕌', color: '#10b981' },
  { id: 'rest', label: 'راحة', icon: '☕', color: '#94a3b8' },
  { id: 'move', label: 'تنقّل', icon: '🚌', color: '#f472b6' },
  { id: 'family', label: 'أهل', icon: '👥', color: '#fb923c' },
  { id: 'other', label: 'آخر', icon: '✳️', color: '#8b95a8' },
];

const catOf = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

const TABS = [
  { id: 'today', label: 'اليوم' },
  { id: 'plan', label: 'الجدول' },
  { id: 'week', label: 'الأسبوع' },
  { id: 'setup', label: 'الإعداد' },
];

let tab = 'today';
let planScope = 'work';        // work | off | 0..6
let tickTimer = null;

/* ── أدوات الوقت ── */
export const toMin = (hhmm) => {
  const [a, b] = String(hhmm || '0:0').split(':').map(Number);
  return (a || 0) * 60 + (b || 0);
};
export const toHHMM = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(Math.round(m) % 60)}`;
const fmtTime = (m) => clock(Math.floor(m / 60) % 24, Math.round(m) % 60, state.settings.hour12);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const isWorkDay = (dow = new Date().getDay()) => state.s2.workDays.includes(dow);
export const scopeOfDay = (dow) => (isWorkDay(dow) ? 'work' : 'off');

export default {
  id: 's2',
  label: 'نظام S2',
  icon: '🧭',

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
        h('div', [
          h('h1', 'نظام S2'),
          h('p', isWorkDay() ? 'اليوم دوام' : 'اليوم عطلة'),
        ]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();

    // تحديث «الآن» كل دقيقة
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!document.body.contains(content)) return;
      if (tab === 'today' || tab === 'plan') render();
    }, 60000);

    const off = subscribe('s2', render);
    return {
      setTab: (t) => { tab = t; sync(); render(); },
      unmount: () => { off(); clearInterval(tickTimer); },
    };
  },
};

function view(which, rerender) {
  if (which === 'today') return todayTab(rerender);
  if (which === 'plan') return planTab(rerender);
  if (which === 'week') return weekTab(rerender);
  return setupTab(rerender);
}

/* ─────────────────── البيانات ─────────────────── */

/** كل كتل يوم معيّن (الثابتة + المخصّصة) مرتّبة. */
export function blocksForDay(dow) {
  const scope = scopeOfDay(dow);
  const out = state.s2.blocks
    .filter((b) => b.scope === scope || b.scope === dow)
    .map((b) => ({ ...b }));

  const w = state.s2.work;
  if (w.enabled && scope === 'work') {
    out.push({
      id: '__work', fixed: true, cat: 'work', title: w.title || 'الدوام',
      start: w.start, end: w.end, scope: 'work',
    });
  }

  return out.sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** الكتل التي تخصّ نطاق عرض معيّن في تبويب الجدول. */
function blocksForScope(scope) {
  const out = state.s2.blocks.filter((b) => b.scope === scope).map((b) => ({ ...b }));
  const w = state.s2.work;
  if (w.enabled && scope === 'work') {
    out.push({ id: '__work', fixed: true, cat: 'work', title: w.title || 'الدوام', start: w.start, end: w.end, scope: 'work' });
  }
  return out.sort((a, b) => toMin(a.start) - toMin(b.start));
}

export function saveBlock(block) {
  const list = state.s2.blocks;
  const i = list.findIndex((b) => b.id === block.id);
  if (i >= 0) list[i] = block; else list.push(block);
  save();
  emit('s2');
}

export async function removeBlock(id) {
  const b = state.s2.blocks.find((x) => x.id === id);
  if (b?.drawing) await deleteDrawing(b.drawing);
  state.s2.blocks = state.s2.blocks.filter((x) => x.id !== id);
  save();
  emit('s2');
}

/** الكتلة الجارية الآن والتالية. */
export function currentAndNext(dow = new Date().getDay(), m = nowMin()) {
  const blocks = blocksForDay(dow);
  const cur = blocks.find((b) => m >= toMin(b.start) && m < toMin(b.end));
  const next = blocks.find((b) => toMin(b.start) > m);
  return { cur, next, blocks };
}

/** مجموع الدقائق لكل فئة في يوم. */
export function dayBalance(dow) {
  const totals = {};
  let used = 0;
  blocksForDay(dow).forEach((b) => {
    const d = Math.max(0, toMin(b.end) - toMin(b.start));
    totals[b.cat] = (totals[b.cat] || 0) + d;
    used += d;
  });
  return { totals, used, free: Math.max(0, 1440 - used) };
}

/* ─────────────────── اليوم ─────────────────── */

function todayTab(rerender) {
  const dow = new Date().getDay();
  const m = nowMin();
  const { cur, next, blocks } = currentAndNext(dow, m);
  const bal = dayBalance(dow);
  const c = cur ? catOf(cur.cat) : null;

  const leftInCur = cur ? toMin(cur.end) - m : 0;
  const progress = cur ? (m - toMin(cur.start)) / Math.max(1, toMin(cur.end) - toMin(cur.start)) : 0;
  const circ = 2 * Math.PI * 26;

  return h('div', [
    h('div.s2-now', [
      h('svg.ring', {
        width: 64, height: 64, viewBox: '0 0 64 64',
        html: `<g transform="rotate(-90 32 32)">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-3)" stroke-width="6"/>
          <circle cx="32" cy="32" r="26" fill="none" stroke="${c ? c.color : 'var(--fg-3)'}" stroke-width="6"
            stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - progress)}"/>
        </g>`,
      }),
      h('div.grow', [
        h('div.lbl', cur ? 'الآن' : 'وقت حرّ الآن'),
        h('div.ttl', cur ? `${c.icon} ${cur.title || c.label}` : 'لا كتلة مجدولة'),
        h('div.sub', cur
          ? `ينتهي ${fmtTime(toMin(cur.end))} · باقي ${durMin(leftInCur)}`
          : (next ? `التالي بعد ${durMin(toMin(next.start) - m)}` : 'أضف كتلة من تبويب الجدول')),
      ]),
    ]),

    next ? h('div.card.tight', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `${catOf(next.cat).icon} التالي: ${next.title || catOf(next.cat).label}`),
          h('div.card-s', `${fmtTime(toMin(next.start))} — ${fmtTime(toMin(next.end))}`),
        ]),
        h('span.badge.accent', `بعد ${durMin(toMin(next.start) - m)}`),
      ]),
    ]) : null,

    h('h2.sec', `${AR_DAYS[dow]} · ${isWorkDay(dow) ? 'يوم دوام' : 'عطلة'}`),
    blocks.length
      ? h('div.list', blocks.map((b) => blockRow(b, m, rerender)))
      : empty('🧭', 'لا كتل لهذا اليوم — ابنِ جدولك من تبويب «الجدول».'),

    h('h2.sec', 'توزيع يومك'),
    h('div.card', balanceView(bal)),

    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => { tab = 'plan'; planScope = scopeOfDay(dow); rerender(); },
    }, '✎ عدّل جدول اليوم'),
  ]);
}

function blockRow(b, m, rerender) {
  const c = catOf(b.cat);
  const active = m >= toMin(b.start) && m < toMin(b.end);
  const past = m >= toMin(b.end);

  return h('div.item', {
    style: { borderInlineStartColor: c.color, borderInlineStartWidth: '3px', opacity: past ? '.55' : '1' },
    onclick: () => openBlockEditor(b, rerender),
  }, [
    h('div.n', { style: { background: `color-mix(in srgb, ${c.color} 25%, var(--surface-2))`, fontSize: '17px' } }, c.icon),
    h('div.grow', [
      h('div.t', b.title || c.label),
      h('div.s.mono', `${fmtTime(toMin(b.start))} — ${fmtTime(toMin(b.end))} · ${durMin(toMin(b.end) - toMin(b.start))}`),
    ]),
    active ? h('span.badge.ok', 'الآن') : null,
    b.fixed ? h('span.badge', 'ثابت') : null,
  ]);
}

function balanceView(bal) {
  const rows = Object.entries(bal.totals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));

  return h('div.balance', [
    ...rows.map(([cat, min]) => {
      const c = catOf(cat);
      return h('div.row2', [
        h('div.nm', `${c.icon} ${c.label}`),
        h('div.tr', h('i', { style: { width: `${Math.round((min / max) * 100)}%`, background: c.color } })),
        h('div.vl', durMin(min)),
      ]);
    }),
    h('div.row2', [
      h('div.nm', '⬜ حرّ'),
      h('div.tr', h('i', { style: { width: `${Math.round((bal.free / 1440) * 100)}%`, background: 'var(--surface-3)' } })),
      h('div.vl', durMin(bal.free)),
    ]),
  ]);
}

/* ─────────────────── الجدول (الخط الزمني) ─────────────────── */

function planTab(rerender) {
  const blocks = blocksForScope(planScope);
  const startHour = state.s2.startHour ?? 5;
  const PX = 1.35;                       // بكسل لكل دقيقة
  const totalMin = 24 * 60;
  const height = totalMin * PX;

  const body = h('div.tl-body', { style: { height: `${height}px` } });
  const hours = h('div.tl-hours', { style: { height: `${height}px` } });
  const grid = h('div.tl-grid');

  for (let hh = 0; hh <= 24; hh++) {
    const y = ((hh * 60 - startHour * 60 + 1440) % 1440) * PX;
    if (hh < 24) {
      hours.append(h('span', { style: { top: `${y}px` } }, `${pad((hh) % 24)}:00`));
      grid.append(h('i', { style: { top: `${y}px` } }));
      grid.append(h('i.half', { style: { top: `${y + 30 * PX}px` } }));
    }
  }
  body.append(grid);

  // موضع الدقيقة على الخط مع بداية العرض المختارة
  const yOf = (m) => (((m - startHour * 60) % 1440) + 1440) % 1440 * PX;

  blocks.forEach((b) => {
    const s = toMin(b.start);
    const e = toMin(b.end);
    const dur = (e > s ? e - s : (1440 - s) + e);
    const c = catOf(b.cat);
    const top = yOf(s);
    const hgt = Math.max(16, dur * PX - 3);

    body.append(h('div.tl-block' + (hgt < 34 ? '.tiny' : ''), {
      style: { top: `${top}px`, height: `${hgt}px`, '--c': c.color },
      onclick: (ev) => { ev.stopPropagation(); openBlockEditor(b, rerender); },
    }, [
      h('div.bt', `${c.icon} ${b.title || c.label}`),
      h('div.bs', `${fmtTime(s)} — ${fmtTime(e)}`),
    ]));
  });

  // خطّ الآن (فقط إن كان النطاق يطابق اليوم)
  const dow = new Date().getDay();
  if (planScope === scopeOfDay(dow) || planScope === dow) {
    body.append(h('div.tl-now', { style: { top: `${yOf(nowMin())}px` } }));
  }

  // ضغطة على فراغ = كتلة جديدة تبدأ عند تلك اللحظة
  body.addEventListener('click', (ev) => {
    const rect = body.getBoundingClientRect();
    const min = Math.round(((ev.clientY - rect.top) / PX + startHour * 60) / 15) * 15;
    const start = ((min % 1440) + 1440) % 1440;
    openBlockEditor(newBlock({ scope: planScope, start: toHHMM(start), end: toHHMM(start + 60) }), rerender);
  });

  const bal = (() => {
    const totals = {};
    let used = 0;
    blocks.forEach((b) => {
      const d = Math.max(0, toMin(b.end) - toMin(b.start));
      totals[b.cat] = (totals[b.cat] || 0) + d;
      used += d;
    });
    return { totals, used, free: Math.max(0, 1440 - used) };
  })();

  return h('div', [
    chipGroup([
      { value: 'work', label: '🏫 أيام الدوام' },
      { value: 'off', label: '🌴 العطلة' },
      ...AR_DAYS_SHORT.map((d, i) => ({ value: i, label: d })),
    ], planScope, (v) => { planScope = v; rerender(); }),

    h('div.muted', { style: { marginTop: '10px' } },
      planScope === 'work' ? 'ينطبق على السبت والأحد والاثنين والثلاثاء والأربعاء.'
        : planScope === 'off' ? 'ينطبق على الخميس والجمعة.'
          : `خاصّ بيوم ${AR_DAYS[planScope]} فقط — يُضاف فوق جدول ${isWorkDay(planScope) ? 'الدوام' : 'العطلة'}.`),

    h('div.row', { style: { marginTop: '10px', gap: '8px' } }, [
      h('button.btn.primary.grow', {
        onclick: () => openBlockEditor(newBlock({ scope: planScope }), rerender),
      }, '＋ كتلة جديدة'),
      h('button.btn', { onclick: () => quickFill(rerender) }, '⚡ قوالب'),
    ]),

    h('div.tl-wrap', [hours, body]),

    h('div.s2-legend', CATS.filter((c) => bal.totals[c.id]).map((c) =>
      h('span.lg', [h('i', { style: { background: c.color } }), `${c.label} ${durMin(bal.totals[c.id])}`]))),

    h('div.card.tight', { style: { marginTop: '12px' } }, [
      h('div.row.between', [
        h('span.muted', 'مجدول'),
        h('b', durMin(bal.used)),
      ]),
      h('div.row.between', { style: { marginTop: '4px' } }, [
        h('span.muted', 'حرّ'),
        h('b', durMin(bal.free)),
      ]),
    ]),

    h('div.muted.center', { style: { marginTop: '10px', fontSize: '12px' } },
      'اضغط على أي فراغ في الخط الزمني لإضافة كتلة تبدأ من تلك اللحظة.'),
  ]);
}

function newBlock(patch = {}) {
  return {
    id: uid('b_'),
    scope: 'work',
    start: '15:00',
    end: '16:00',
    cat: 'read',
    title: '',
    note: '',
    drawing: null,
    workoutDay: null,
    ...patch,
  };
}

/* ─────────────────── محرّر الكتلة ─────────────────── */

function openBlockEditor(block, rerender) {
  if (block.fixed) { openWorkEditor(rerender); return; }

  const draft = { ...block };
  const exists = state.s2.blocks.some((b) => b.id === block.id);
  const body = h('div');
  const panel = sheet(exists ? 'تعديل الكتلة' : 'كتلة جديدة', body);

  function render() {
    const c = catOf(draft.cat);

    fill(body, [
      h('div.time-row', [
        h('input', {
          type: 'time', value: draft.start,
          onchange: (e) => { draft.start = e.target.value || draft.start; lenLine.textContent = lenText(); },
        }),
        h('span.muted', '←'),
        h('input', {
          type: 'time', value: draft.end,
          onchange: (e) => { draft.end = e.target.value || draft.end; lenLine.textContent = lenText(); },
        }),
      ]),
      lenLine,

      h('div.chips', { style: { marginTop: '8px' } }, [15, 30, 45, 60, 90, 120].map((mm) =>
        h('button.chip', {
          onclick: () => { draft.end = toHHMM(toMin(draft.start) + mm); render(); },
        }, durMin(mm)))),

      h('h2.sec', 'الفئة'),
      h('div.cat-pick', CATS.map((cat) => h('button' + (cat.id === draft.cat ? '.on' : ''), {
        style: { '--c': cat.color },
        onclick: () => { draft.cat = cat.id; render(); },
      }, [h('span.e', cat.icon), h('span', cat.label)]))),

      h('h2.sec', 'العنوان'),
      h('input', {
        placeholder: c.label, value: draft.title,
        oninput: (e) => { draft.title = e.target.value; },
      }),

      h('h2.sec', 'يطبَّق على'),
      chipGroup([
        { value: 'work', label: 'كل أيام الدوام' },
        { value: 'off', label: 'العطلة' },
        ...AR_DAYS_SHORT.map((d, i) => ({ value: i, label: d })),
      ], draft.scope, (v) => { draft.scope = v; }),

      draft.cat === 'gym' ? gymLink(draft, render) : null,

      h('h2.sec', 'ملاحظة'),
      h('textarea', {
        placeholder: 'تفاصيل أو تذكير…', value: draft.note,
        oninput: (e) => { draft.note = e.target.value; },
      }),

      h('h2.sec', 'ملاحظة رسم'),
      drawPreview(draft.drawing, { title: draft.title || c.label }),
      drawButton({
        id: draft.drawing,
        title: draft.title || c.label,
        onChange: (id) => { draft.drawing = id; render(); },
      }),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        exists
          ? h('button.btn.danger', {
            onclick: async () => {
              if (!await confirmSheet('حذف الكتلة', `ستُحذف «${draft.title || c.label}».`)) return;
              await removeBlock(draft.id);
              panel.close(); rerender();
            },
          }, '🗑 حذف')
          : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => {
            if (toMin(draft.end) <= toMin(draft.start)) { toast('وقت النهاية يجب أن يكون بعد البداية', 'err'); return; }
            saveBlock(draft);
            panel.close();
            toast('حُفظت الكتلة', 'ok');
            rerender();
          },
        }, '💾 حفظ'),
      ]),
    ]);
    lenLine.textContent = lenText();
  }

  const lenLine = h('div.muted.center', { style: { marginTop: '6px' } });
  const lenText = () => {
    const d = toMin(draft.end) - toMin(draft.start);
    return d > 0 ? `المدّة: ${durMin(d)}` : 'النهاية يجب أن تكون بعد البداية';
  };

  render();
}

/** ربط كتلة الجم بقسم التمارين — اختياري تمامًا. */
function gymLink(draft, render) {
  const days = state.workout?.days || [];
  return h('div', [
    h('h2.sec', 'الربط بقسم التمارين'),
    settingRow('اربطها بيوم تمارين', 'تظهر تمارين ذلك اليوم هنا',
      toggleSwitch(!!draft.workoutDay, (on) => {
        draft.workoutDay = on ? (days[0]?.id || null) : null;
        render();
      })),
    draft.workoutDay ? h('div', { style: { marginTop: '10px' } }, [
      chipGroup(days.map((d) => ({ value: d.id, label: `${d.name} (${(d.slots || []).length})` })),
        draft.workoutDay, (v) => { draft.workoutDay = v; }),
      h('div.muted', { style: { marginTop: '8px', fontSize: '11.5px' } },
        'الربط اختياري — إن أطفأته تبقى الكتلة مجرّد وقت جم في جدولك.'),
    ]) : null,
  ]);
}

function openWorkEditor(rerender) {
  const w = { ...state.s2.work };
  const body = h('div');
  const panel = sheet('كتلة الدوام الثابتة', body);

  fill(body, [
    h('div.time-row', [
      h('input', { type: 'time', value: w.start, onchange: (e) => { w.start = e.target.value || w.start; } }),
      h('span.muted', '←'),
      h('input', { type: 'time', value: w.end, onchange: (e) => { w.end = e.target.value || w.end; } }),
    ]),
    h('div.muted.center', { style: { marginTop: '8px' } }, 'تنطبق على كل أيام الدوام.'),

    h('h2.sec', 'الاسم'),
    h('input', { value: w.title, placeholder: 'الدوام', oninput: (e) => { w.title = e.target.value; } }),

    h('div', { style: { marginTop: '12px' } },
      settingRow('مفعّلة', null, toggleSwitch(w.enabled, (on) => { w.enabled = on; }))),

    h('button.btn.primary.block', {
      style: { marginTop: '14px' },
      onclick: () => {
        state.s2.work = w;
        save(); emit('s2');
        panel.close();
        toast('حُفظ الدوام', 'ok');
        rerender();
      },
    }, '💾 حفظ'),
  ]);
}

/* ─────────────────── قوالب سريعة ─────────────────── */

const TEMPLATES = [
  {
    id: 'tpl_work', name: 'يوم دوام متوازن', scope: 'work',
    desc: 'نوم ٧ ساعات، قراءة بعد الظهر، جم، ومذاكرة قبل النوم.',
    blocks: [
      { cat: 'sleep', start: '22:30', end: '05:45', title: 'نوم' },
      { cat: 'pray', start: '05:45', end: '06:15', title: 'الفجر وترتيب' },
      { cat: 'move', start: '06:15', end: '06:30', title: 'الطريق' },
      { cat: 'food', start: '14:30', end: '15:15', title: 'غداء وراحة' },
      { cat: 'rest', start: '15:15', end: '16:00', title: 'قيلولة قصيرة' },
      { cat: 'read', start: '16:00', end: '17:00', title: 'قراءة' },
      { cat: 'gym', start: '17:15', end: '18:30', title: 'جم' },
      { cat: 'study', start: '19:30', end: '21:00', title: 'مذاكرة' },
      { cat: 'hobby', start: '21:00', end: '22:15', title: 'هوايتي' },
    ],
  },
  {
    id: 'tpl_off', name: 'يوم عطلة منتج', scope: 'off',
    desc: 'نوم أطول قليلًا، كتلة عميقة للهواية، ووقت للأهل.',
    blocks: [
      { cat: 'sleep', start: '23:30', end: '07:30', title: 'نوم' },
      { cat: 'food', start: '08:00', end: '08:45', title: 'فطور' },
      { cat: 'hobby', start: '09:00', end: '11:30', title: 'هوايتي (كتلة عميقة)' },
      { cat: 'read', start: '11:30', end: '12:30', title: 'قراءة' },
      { cat: 'food', start: '13:00', end: '14:00', title: 'غداء' },
      { cat: 'rest', start: '14:00', end: '15:30', title: 'راحة' },
      { cat: 'gym', start: '17:00', end: '18:30', title: 'جم' },
      { cat: 'family', start: '19:00', end: '21:00', title: 'أهل وأصدقاء' },
      { cat: 'study', start: '21:00', end: '22:30', title: 'مراجعة الأسبوع' },
    ],
  },
];

function quickFill(rerender) {
  sheet('قوالب جاهزة', ({ close }) => h('div.list', [
    ...TEMPLATES.map((t) => h('div.card', [
      h('div.card-t', t.name),
      h('div.card-s', t.desc),
      h('div.muted', { style: { marginTop: '6px', fontSize: '11.5px' } }, `${t.blocks.length} كتل · ${t.scope === 'work' ? 'أيام الدوام' : 'العطلة'}`),
      h('button.btn.primary.block', {
        style: { marginTop: '10px' },
        onclick: async () => {
          const has = state.s2.blocks.some((b) => b.scope === t.scope);
          if (has && !await confirmSheet('استبدال الجدول؟',
            `يوجد جدول لـ«${t.scope === 'work' ? 'أيام الدوام' : 'العطلة'}». سيُستبدل بالقالب.`,
            { danger: true, okText: 'استبدل' })) return;

          state.s2.blocks = state.s2.blocks.filter((b) => b.scope !== t.scope);
          t.blocks.forEach((b) => state.s2.blocks.push(newBlock({ ...b, scope: t.scope })));
          save(); emit('s2');
          close();
          toast('طُبِّق القالب', 'ok');
          rerender();
        },
      }, 'طبّق هذا القالب'),
    ])),
    h('div.muted.center', { style: { fontSize: '12px' } }, 'تقدر تعدّل أي كتلة بعد التطبيق بحرّية.'),
  ]));
}

/* ─────────────────── الأسبوع ─────────────────── */

function weekTab(rerender) {
  const order = [];
  for (let i = 0; i < 7; i++) order.push((state.settings.weekStart + i) % 7);

  const weekTotals = {};
  order.forEach((dow) => {
    const { totals } = dayBalance(dow);
    Object.entries(totals).forEach(([k, v]) => { weekTotals[k] = (weekTotals[k] || 0) + v; });
  });
  const rows = Object.entries(weekTotals).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  const totalWeek = rows.reduce((s, [, v]) => s + v, 0);

  return h('div', [
    h('div.week-grid', order.map((dow) => {
      const blocks = blocksForDay(dow).filter((b) => b.cat !== 'sleep');
      const off = !isWorkDay(dow);
      return h('div.week-col', {
        onclick: () => { planScope = dow; tab = 'plan'; rerender(); },
      }, [
        h('div.wd' + (off ? '.off' : ''), AR_DAYS_SHORT[dow]),
        ...blocks.slice(0, 7).map((b) => {
          const c = catOf(b.cat);
          return h('div.chip2', {
            style: { background: `color-mix(in srgb, ${c.color} 26%, var(--surface-2))`, color: 'var(--fg)' },
          }, c.icon);
        }),
        blocks.length > 7 ? h('div.chip2', { style: { color: 'var(--fg-3)' } }, `+${blocks.length - 7}`) : null,
      ]);
    })),

    h('h2.sec', 'ساعاتك في الأسبوع'),
    h('div.card', h('div.balance', rows.map(([cat, min]) => {
      const c = catOf(cat);
      return h('div.row2', [
        h('div.nm', `${c.icon} ${c.label}`),
        h('div.tr', h('i', { style: { width: `${Math.round((min / max) * 100)}%`, background: c.color } })),
        h('div.vl', durMin(min)),
      ]);
    }))),

    h('div.card.tight', [
      h('div.card-t', `المجدول أسبوعيًا: ${durMin(totalWeek)}`),
      h('div.card-s', `من أصل ${durMin(7 * 1440)} — الباقي ${durMin(7 * 1440 - totalWeek)} غير مخطّط.`),
    ]),

    h('h2.sec', 'ملاحظة'),
    h('div.card.tight', h('div.card-s',
      'الجداول هنا قوالب أسبوعية ثابتة: ما تضعه في «أيام الدوام» يتكرّر في الخمسة أيام، '
      + 'و«العطلة» في الخميس والجمعة. لأي يوم استثناء، اختر اسمه من الشريط وأضف كتلة خاصّة به.')),
  ]);
}

/* ─────────────────── الإعداد ─────────────────── */

function setupTab(rerender) {
  const s = state.s2;
  const days = state.workout?.days || [];

  return h('div', [
    h('h2.sec', 'أيام الدوام'),
    h('div.card', [
      h('div.muted', { style: { marginBottom: '10px' } }, 'اختر أيام دوامك — الباقي عطلة.'),
      chipGroup(AR_DAYS.map((d, i) => ({ value: i, label: d })), s.workDays, (v) => {
        s.workDays = v;
        save(); emit('s2');
      }, { multi: true }),
    ]),

    h('h2.sec', 'وقت الدوام'),
    h('div.card', [
      h('div.time-row', [
        h('input', { type: 'time', value: s.work.start, onchange: (e) => { s.work.start = e.target.value; save(); emit('s2'); } }),
        h('span.muted', '←'),
        h('input', { type: 'time', value: s.work.end, onchange: (e) => { s.work.end = e.target.value; save(); emit('s2'); } }),
      ]),
      h('div.muted.center', { style: { marginTop: '8px' } },
        `${durMin(toMin(s.work.end) - toMin(s.work.start))} يوميًا خارج البيت`),
      h('div', { style: { marginTop: '10px' } },
        settingRow('أظهر كتلة الدوام', null, toggleSwitch(s.work.enabled, (on) => { s.work.enabled = on; save(); emit('s2'); rerender(); }))),
    ]),

    h('h2.sec', 'أيام الجم'),
    h('div.card', [
      chipGroup(AR_DAYS.map((d, i) => ({ value: i, label: d })), s.gym.days, (v) => {
        s.gym.days = v; save(); emit('s2');
      }, { multi: true }),

      h('div', { style: { marginTop: '12px' } },
        settingRow('اربط أيام الجم بقسم التمارين', 'اختياري — يوزّع أيام تمارينك الثلاثة على أيام الجم',
          toggleSwitch(s.gym.link, (on) => { s.gym.link = on; save(); emit('s2'); rerender(); }))),

      s.gym.link ? h('div', { style: { marginTop: '10px' } }, [
        ...s.gym.days.sort((a, b) => a - b).map((dow) => h('div.item', [
          h('div.grow', h('div.t', AR_DAYS[dow])),
          h('select', {
            style: { width: '150px' },
            onchange: (e) => { s.gym.map[dow] = e.target.value || null; save(); emit('s2'); },
          }, [
            h('option', { value: '' }, 'بلا ربط'),
            ...days.map((d) => h('option', { value: d.id, selected: s.gym.map[dow] === d.id }, d.name)),
          ]),
        ])),
        h('button.btn.ghost.block', {
          style: { marginTop: '10px' },
          onclick: async () => {
            const { go } = await import('../../app.js');
            go('workout');
          },
        }, '🏋 افتح قسم التمارين'),
      ]) : null,
    ]),

    h('h2.sec', 'بداية عرض الخط الزمني'),
    h('div.card', [
      chipGroup([0, 4, 5, 6, 7].map((hh) => ({ value: hh, label: `${pad(hh)}:00` })), s.startHour ?? 5, (v) => {
        s.startHour = v; save(); emit('s2');
      }),
      h('div.muted', { style: { marginTop: '8px' } }, 'يحدّد من أي ساعة يبدأ الخط الزمني في تبويب الجدول.'),
    ]),

    h('h2.sec', 'تفريغ'),
    h('button.btn.danger.block', {
      onclick: async () => {
        if (!await confirmSheet('مسح كل الكتل', 'ستُحذف كل كتل الجدول (الدوام يبقى).')) return;
        await Promise.all(state.s2.blocks.filter((b) => b.drawing).map((b) => deleteDrawing(b.drawing)));
        state.s2.blocks = [];
        save(); emit('s2');
        toast('مُسح الجدول', 'ok');
        rerender();
      },
    }, '🗑 امسح كل الكتل'),
  ]);
}
