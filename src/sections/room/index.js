/**
 * قسم «أشياء لازم أضيفها لغرفتي» — قائمة مرتّبة بأولوياتها وأماكنها،
 * مع صورة وسعر تقديري، وربط بالمصاريف عند الشراء.
 */

import '../../styles/room.css';
import { h, fill, empty, chipGroup } from '../../core/dom.js';
import { dayKey } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, promptSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { saveMedia, mediaUrl, deleteMedia, pickFile } from '../../core/media.js';
import { newItem as newExpense, saveItem as saveExpense, money } from '../money/index.js';

const PRIORITIES = [
  { value: 'must', label: '🔴 ضروري' },
  { value: 'soon', label: '🟡 قريبًا' },
  { value: 'later', label: '🟢 لاحقًا' },
];

const TABS = [
  { id: 'list', label: 'القائمة' },
  { id: 'zones', label: 'حسب المكان' },
  { id: 'bought', label: 'اشتريته' },
];

let tab = 'list';
let filter = 'all';

const prioLabel = (v) => (PRIORITIES.find((p) => p.value === v) || PRIORITIES[2]).label;

export default {
  id: 'room',
  label: 'غرفتي',
  icon: '🛏',

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
        h('div', [h('h1', 'غرفتي'), h('p', 'أشياء لازم أضيفها — بترتيبها وأولويتها')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('room', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'list') return listTab(rerender);
  if (which === 'zones') return zonesTab(rerender);
  return boughtTab(rerender);
}

/* ─────────────────── البيانات ─────────────────── */

export function newRoomItem(patch = {}) {
  const pending = state.room.items.filter((x) => x.status !== 'bought');
  return {
    id: uid('rm_'),
    name: '',
    note: '',
    zone: 'عام',
    priority: 'soon',
    price: 0,
    status: 'want',          // want | bought
    order: pending.length,
    photo: null,
    createdAt: Date.now(),
    ...patch,
  };
}

export function saveRoomItem(item) {
  const list = state.room.items;
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  save();
  emit('room');
}

export async function removeRoomItem(id) {
  const item = state.room.items.find((x) => x.id === id);
  if (item?.photo) await deleteMedia(item.photo);
  state.room.items = state.room.items.filter((x) => x.id !== id);
  reindex();
  save();
  emit('room');
}

/** يعيد ترقيم الترتيب بعد أي تغيير. */
function reindex() {
  state.room.items
    .filter((x) => x.status !== 'bought')
    .sort((a, b) => a.order - b.order)
    .forEach((x, i) => { x.order = i; });
}

export function moveItem(id, dir) {
  const pending = state.room.items
    .filter((x) => x.status !== 'bought')
    .sort((a, b) => a.order - b.order);
  const i = pending.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= pending.length) return;
  const a = pending[i].order;
  pending[i].order = pending[j].order;
  pending[j].order = a;
  save();
  emit('room');
}

export function markBought(item, addToExpenses) {
  item.status = 'bought';
  item.boughtAt = dayKey();
  save();
  if (addToExpenses && item.price > 0) {
    saveExpense(newExpense({
      name: item.name,
      price: item.price,
      category: 'home',
      note: `من قائمة الغرفة · ${item.zone}`,
    }));
  }
  reindex();
  emit('room');
}

const pendingItems = () => state.room.items
  .filter((x) => x.status !== 'bought')
  .sort((a, b) => a.order - b.order);

/* ─────────────────── التبويبات ─────────────────── */

function listTab(rerender) {
  const all = pendingItems();
  const list = filter === 'all' ? all : all.filter((x) => x.priority === filter);
  const totalPrice = all.reduce((s, x) => s + (Number(x.price) || 0), 0);

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `${all.length} شيء تريده`),
          h('div.card-s', totalPrice > 0 ? `الكلفة التقديرية: ${money(totalPrice)}` : 'أضف الأسعار لتعرف كم تحتاج'),
        ]),
        h('div', { style: { fontSize: '26px' } }, '🛏'),
      ]),
    ]),

    h('button.btn.primary.block', { onclick: () => openItemEditor(newRoomItem(), rerender) }, '＋ أضف شيئًا'),

    h('div', { style: { marginTop: '12px' } }, chipGroup(
      [{ value: 'all', label: `الكل (${all.length})` },
        ...PRIORITIES.map((p) => ({
          value: p.value,
          label: `${p.label} (${all.filter((x) => x.priority === p.value).length})`,
        }))],
      filter,
      (v) => { filter = v; rerender(); },
    )),

    list.length
      ? h('div.list', { style: { marginTop: '12px' } }, list.map((x, i) => roomRow(x, i + 1, rerender, true)))
      : h('div', { style: { marginTop: '20px' } },
        empty('🛏', 'القائمة فارغة — اكتب أول شيء تريد إضافته لغرفتك.')),

    all.length > 1 ? h('div.muted.center', { style: { marginTop: '12px', fontSize: '12px' } },
      'استعمل السهمين لترتيب الأولوية — الأعلى أولًا.') : null,
  ]);
}

function zonesTab(rerender) {
  const all = pendingItems();
  const zones = state.room.zones;
  const used = zones.filter((z) => all.some((x) => x.zone === z));

  return h('div', [
    h('button.btn.block', { onclick: () => addZone(rerender) }, '＋ مكان جديد في الغرفة'),

    used.length ? used.map((z) => {
      const items = all.filter((x) => x.zone === z);
      return h('div', [
        h('div.zone-head', [
          h('span', `📍 ${z}`),
          h('span.line'),
          h('span.muted', `${items.length}`),
        ]),
        h('div.list', items.map((x, i) => roomRow(x, i + 1, rerender))),
      ]);
    }) : h('div', { style: { marginTop: '20px' } }, empty('📍', 'لا أشياء موزّعة على أماكن بعد.')),
  ]);
}

function boughtTab(rerender) {
  const bought = state.room.items.filter((x) => x.status === 'bought');
  const spent = bought.reduce((s, x) => s + (Number(x.price) || 0), 0);

  return h('div', [
    h('div.grid2', [
      h('div.card.tight.center', [
        h('div', { style: { fontSize: '21px', fontWeight: '700' } }, String(bought.length)),
        h('div.muted', 'اشتريته'),
      ]),
      h('div.card.tight.center', [
        h('div', { style: { fontSize: '17px', fontWeight: '700' } }, money(spent)),
        h('div.muted', 'أنفقت عليها'),
      ]),
    ]),

    bought.length
      ? h('div.list', { style: { marginTop: '12px' } }, bought.map((x) => roomRow(x, null, rerender)))
      : h('div', { style: { marginTop: '20px' } }, empty('✅', 'لم تشترِ شيئًا من القائمة بعد.')),
  ]);
}

function roomRow(item, index, rerender, showMoves = false) {
  const ph = h('div.ph', item.photo ? '' : '🪑');
  if (item.photo) {
    mediaUrl(item.photo).then((url) => { if (url) fill(ph, h('img', { src: url, alt: '' })); });
  }

  return h('div.room-item' + (item.status === 'bought' ? '.bought' : ''), [
    h('div.prio.' + item.priority),
    index !== null ? h('div.ord', String(index)) : null,
    ph,
    h('div.grow', { onclick: () => openItemView(item, rerender) }, [
      h('div.t.ellipsis', item.name),
      h('div.s.ellipsis', [
        item.zone,
        item.price > 0 ? money(item.price) : null,
        item.note || null,
      ].filter(Boolean).join(' · ')),
    ]),
    showMoves ? h('div.moves', [
      h('button', { onclick: (e) => { e.stopPropagation(); haptic(10); moveItem(item.id, -1); rerender(); } }, '▲'),
      h('button', { onclick: (e) => { e.stopPropagation(); haptic(10); moveItem(item.id, 1); rerender(); } }, '▼'),
    ]) : null,
  ]);
}

async function addZone(rerender) {
  const name = await promptSheet('مكان جديد', { placeholder: 'مثلًا: الرف فوق المكتب' });
  if (!name) return;
  if (!state.room.zones.includes(name)) {
    state.room.zones.push(name);
    save();
    emit('room');
  }
  rerender();
}

/* ─────────────────── العرض والتحرير ─────────────────── */

function openItemView(item, rerender) {
  const body = h('div');
  const panel = sheet(item.name, body);

  const photo = h('div');
  if (item.photo) {
    mediaUrl(item.photo).then((url) => {
      if (url) fill(photo, h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '14px', display: 'block' } }));
    });
  }

  fill(body, [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', `📍 ${item.zone}`),
      h('span.badge', prioLabel(item.priority)),
      item.price > 0 ? h('span.badge', money(item.price)) : null,
      item.status === 'bought' ? h('span.badge.ok', 'اشتريته') : null,
    ]),
    photo,
    item.note ? h('p', { style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, item.note) : null,

    h('div.grid2', { style: { marginTop: '14px' } }, [
      item.status === 'bought'
        ? h('button.btn', {
          onclick: () => {
            item.status = 'want';
            item.order = pendingItems().length;
            save(); emit('room'); panel.close(); rerender();
          },
        }, '↺ أعده للقائمة')
        : h('button.btn.ok', {
          onclick: async () => {
            const addExp = item.price > 0
              ? await confirmSheet('سجّله في المصاريف؟', `سيُضاف «${item.name}» بسعر ${money(item.price)} إلى مصاريفك.`, { danger: false, okText: 'نعم سجّله' })
              : false;
            markBought(item, addExp);
            panel.close();
            toast(addExp ? 'وُسم كمشترى وسُجّل في المصاريف' : 'وُسم كمشترى', 'ok');
            rerender();
          },
        }, '✓ اشتريته'),
      h('button.btn.primary', { onclick: () => { panel.close(); openItemEditor(item, rerender); } }, '✎ تعديل'),
    ]),
  ]);
}

function openItemEditor(item, onDone) {
  const draft = { ...item };
  const exists = state.room.items.some((x) => x.id === item.id);
  const body = h('div');
  const panel = sheet(exists ? 'تعديل' : 'شيء جديد للغرفة', body);

  function render() {
    const photoBox = h('div');
    if (draft.photo) {
      mediaUrl(draft.photo).then((url) => {
        if (!url) return;
        fill(photoBox, h('div.media-box', { style: { aspectRatio: '16/10', marginTop: '10px' } }, [
          h('img', { src: url, alt: '' }),
          h('button.kill', {
            onclick: async () => { await deleteMedia(draft.photo); draft.photo = null; render(); },
          }, '✕'),
        ]));
      });
    }

    fill(body, [
      h('input', {
        placeholder: 'ما الشيء؟ (مثلًا: رف خشبي صغير)', value: draft.name,
        oninput: (e) => { draft.name = e.target.value; },
      }),

      h('h2.sec', 'أين مكانه في الغرفة؟'),
      chipGroup(state.room.zones, draft.zone, (v) => { draft.zone = v; }),
      h('button.btn.sm.ghost', {
        style: { marginTop: '8px' },
        onclick: async () => {
          const name = await promptSheet('مكان جديد', { placeholder: 'اسم المكان' });
          if (!name) return;
          if (!state.room.zones.includes(name)) state.room.zones.push(name);
          draft.zone = name;
          save();
          render();
        },
      }, '＋ مكان آخر'),

      h('h2.sec', 'الأولوية'),
      chipGroup(PRIORITIES, draft.priority, (v) => { draft.priority = v; }),

      h('h2.sec', 'السعر التقديري'),
      h('input', {
        type: 'number', inputmode: 'decimal', value: draft.price || '',
        placeholder: `كم يكلّف تقريبًا؟ (${state.money.currency})`,
        oninput: (e) => { draft.price = Number(e.target.value) || 0; },
      }),

      h('h2.sec', 'ملاحظة'),
      h('textarea', {
        placeholder: 'المقاس، اللون، من أي محل، لماذا تريده…',
        value: draft.note, oninput: (e) => { draft.note = e.target.value; },
      }),

      h('h2.sec', 'صورة'),
      photoBox,
      h('div.grid2', { style: { marginTop: '10px' } }, [
        h('button.btn.sm', { onclick: () => attach(false) }, '🖼 من المعرض'),
        h('button.btn.sm', { onclick: () => attach(true) }, '📷 كاميرا'),
      ]),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        exists
          ? h('button.btn.danger', {
            onclick: async () => {
              if (!await confirmSheet('حذف', `سيُحذف «${draft.name}».`)) return;
              await removeRoomItem(draft.id);
              panel.close(); onDone?.();
            },
          }, '🗑 حذف')
          : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.name.trim()) { toast('اكتب اسم الشيء', 'err'); return; }
            saveRoomItem(draft);
            panel.close();
            toast('حُفظ', 'ok');
            onDone?.();
          },
        }, '💾 حفظ'),
      ]),
    ]);
  }

  async function attach(camera) {
    const file = await pickFile('image', { camera });
    if (!file) return;
    try {
      if (draft.photo) await deleteMedia(draft.photo);
      const m = await saveMedia(file);
      draft.photo = m?.id || null;
      render();
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الصورة', 'err');
    }
  }

  render();
}
