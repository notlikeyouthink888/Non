/**
 * قسم المصاريف — كل ما تشتريه بسعره، وكم يكفيك، وتكلفته اليومية،
 * مع الاشتراكات المتكرّرة وتقرير شهري. كل شيء محلي.
 */

import '../../styles/money.css';
import { h, fill, empty, chipGroup } from '../../core/dom.js';
import { dayKey, fromDayKey, longDate, AR_MONTHS, num } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { scheduleReminder, cancelReminder } from '../time/alarms.js';

export const CATEGORIES = [
  { value: 'home', label: 'البيت', icon: '🏠' },
  { value: 'clean', label: 'تنظيف وعناية', icon: '🧴' },
  { value: 'food', label: 'أكل وشرب', icon: '🍽' },
  { value: 'net', label: 'إنترنت واتصال', icon: '📶' },
  { value: 'transport', label: 'تنقّل', icon: '🚕' },
  { value: 'health', label: 'صحة', icon: '💊' },
  { value: 'study', label: 'دراسة', icon: '📚' },
  { value: 'clothes', label: 'ملابس', icon: '👕' },
  { value: 'tech', label: 'أجهزة', icon: '💻' },
  { value: 'fun', label: 'ترفيه', icon: '🎮' },
  { value: 'other', label: 'أخرى', icon: '🧾' },
];

const RECUR = [
  { value: 'none', label: 'مرّة واحدة' },
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'كل ٣ أشهر' },
  { value: 'yearly', label: 'سنوي' },
];

const TABS = [
  { id: 'overview', label: 'نظرة' },
  { id: 'items', label: 'مشترياتي' },
  { id: 'subs', label: 'الاشتراكات' },
  { id: 'report', label: 'التقرير' },
];

let tab = 'overview';
let filter = 'all';

const catOf = (v) => CATEGORIES.find((c) => c.value === v) || CATEGORIES[CATEGORIES.length - 1];
const cur = () => state.money.currency || 'د.ع';
export const money = (n) => `${num(Math.round(Number(n) || 0))} ${cur()}`;

export default {
  id: 'money',
  label: 'المصاريف',
  icon: '💰',

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
        h('div', [h('h1', 'مصاريفك'), h('p', 'كم دفعت، وكم يكفيك، ومتى ينتهي')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('money', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'overview') return overviewTab(rerender);
  if (which === 'items') return itemsTab(rerender);
  if (which === 'subs') return subsTab(rerender);
  return reportTab(rerender);
}

/* ─────────────────── الحسابات ─────────────────── */

export function newItem(patch = {}) {
  return {
    id: uid('ex_'),
    name: '',
    price: 0,
    qty: 1,
    category: 'home',
    date: dayKey(),
    lastsDays: 0,       // كم يكفيني (٠ = غير محدّد)
    note: '',
    recurring: 'none',
    remind: true,
    createdAt: Date.now(),
    ...patch,
  };
}

export function saveItem(item) {
  const list = state.money.items;
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.unshift(item);
  save();
  syncItemReminder(item);
  emit('money');
}

export function removeItem(id) {
  cancelReminder(numericId(id));
  state.money.items = state.money.items.filter((x) => x.id !== id);
  save();
  emit('money');
}

function numericId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 100000 + 400000;
}

/** تكلفة الشيء في اليوم الواحد. */
export function dailyCost(item) {
  const total = (Number(item.price) || 0) * (Number(item.qty) || 1);
  if (item.recurring && item.recurring !== 'none') {
    const days = { monthly: 30, quarterly: 91, yearly: 365 }[item.recurring] || 30;
    return total / days;
  }
  if (item.lastsDays > 0) return total / item.lastsDays;
  return 0;
}

/** متى ينتهي الشيء أو يُجدَّد الاشتراك (ms) أو 0. */
export function endsAt(item) {
  const start = fromDayKey(item.date).getTime();
  if (item.recurring && item.recurring !== 'none') {
    const days = { monthly: 30, quarterly: 91, yearly: 365 }[item.recurring] || 30;
    let next = start;
    while (next <= Date.now()) next += days * 86400000;
    return next;
  }
  if (item.lastsDays > 0) return start + item.lastsDays * 86400000;
  return 0;
}

export function daysLeft(item) {
  const at = endsAt(item);
  return at ? Math.ceil((at - Date.now()) / 86400000) : null;
}

function syncItemReminder(item) {
  const nid = numericId(item.id);
  cancelReminder(nid);
  if (!item.remind) return;
  const at = endsAt(item);
  if (!at) return;
  // تنبيه قبل يومين من النفاد أو التجديد
  const fireAt = at - 2 * 86400000;
  if (fireAt > Date.now()) {
    const isSub = item.recurring && item.recurring !== 'none';
    scheduleReminder({
      id: nid,
      at: fireAt,
      title: isSub ? `تجديد: ${item.name}` : `قارب على النفاد: ${item.name}`,
      body: isSub ? `يُجدَّد بعد يومين · ${money(item.price)}` : 'بقي يومان تقريبًا — جهّز البديل.',
    });
  }
}

const monthKeyOf = (key) => key.slice(0, 7);
const thisMonth = () => dayKey().slice(0, 7);

export function monthTotal(mk = thisMonth()) {
  return state.money.items
    .filter((x) => monthKeyOf(x.date) === mk && (!x.recurring || x.recurring === 'none'))
    .reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
}

export function subsMonthly() {
  return state.money.items
    .filter((x) => x.recurring && x.recurring !== 'none')
    .reduce((s, x) => s + dailyCost(x) * 30, 0);
}

export const totalDaily = () => state.money.items.reduce((s, x) => s + dailyCost(x), 0);

/* ─────────────────── النظرة العامة ─────────────────── */

function overviewTab(rerender) {
  const items = state.money.items;
  const mTotal = monthTotal();
  const subs = subsMonthly();
  const daily = totalDaily();

  const ending = items
    .map((x) => ({ x, d: daysLeft(x) }))
    .filter((e) => e.d !== null && e.d <= 10)
    .sort((a, b) => a.d - b.d);

  return h('div', [
    h('div.card.glow', [
      h('div.muted.center', `${AR_MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`),
      h('div.big-money', money(mTotal)),
      h('div.muted.center', `+ ${money(subs)} اشتراكات شهرية`),
    ]),

    h('div.grid2', [
      statCard('تكلفتك اليومية', money(daily)),
      statCard('عدد المشتريات', String(items.length)),
    ]),

    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => openItemEditor(newItem(), rerender),
    }, '＋ أضف مصروفًا'),

    ending.length ? h('div', [
      h('h2.sec', 'ينتهي أو يُجدَّد قريبًا'),
      h('div.list', ending.map(({ x, d }) => expRow(x, rerender, d))),
    ]) : null,

    items.length ? h('div', [
      h('h2.sec', 'آخر ما اشتريت'),
      h('div.list', [...items].slice(0, 6).map((x) => expRow(x, rerender))),
    ]) : h('div', { style: { marginTop: '18px' } },
      empty('🧾', 'لا مصاريف بعد. سجّل أول شيء اشتريته وسأحسب لك كم يكلّفك يوميًا.')),
  ]);
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '17px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}

function expRow(item, rerender, dLeft) {
  const d = dLeft === undefined ? daysLeft(item) : dLeft;
  const c = catOf(item.category);
  const perDay = dailyCost(item);
  const cls = d === null ? '' : d < 0 ? '.over' : d <= 3 ? '.due' : '';

  return h('div.exp' + cls, { onclick: () => openItemView(item, rerender) }, [
    h('div.ic', c.icon),
    h('div.grow', [
      h('div.t.ellipsis', item.name),
      h('div.s.ellipsis', [
        c.label,
        item.qty > 1 ? `×${item.qty}` : null,
        perDay > 0 ? `${money(perDay)}/يوم` : null,
      ].filter(Boolean).join(' · ')),
      d !== null ? h('div.lasts', [
        h('span.dot' + (d < 0 ? '.gone' : d <= 3 ? '.warn' : '')),
        item.recurring !== 'none'
          ? (d < 0 ? 'حان التجديد' : `يُجدَّد بعد ${d} يوم`)
          : (d < 0 ? 'يُفترض أنه انتهى' : `يكفي ${d} يوم بعد`),
      ]) : null,
    ]),
    h('div.p', money((Number(item.price) || 0) * (Number(item.qty) || 1))),
  ]);
}

/* ─────────────────── المشتريات ─────────────────── */

function itemsTab(rerender) {
  const all = state.money.items.filter((x) => !x.recurring || x.recurring === 'none');
  const list = filter === 'all' ? all : all.filter((x) => x.category === filter);
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));

  return h('div', [
    h('button.btn.primary.block', { onclick: () => openItemEditor(newItem(), rerender) }, '＋ مصروف جديد'),

    h('div', { style: { marginTop: '12px' } }, chipGroup(
      [{ value: 'all', label: `الكل (${all.length})` },
        ...CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` }))],
      filter,
      (v) => { filter = v; rerender(); },
    )),

    sorted.length
      ? h('div.list', { style: { marginTop: '12px' } }, sorted.map((x) => expRow(x, rerender)))
      : h('div', { style: { marginTop: '20px' } }, empty('🧾', 'لا شيء في هذا التصنيف.')),
  ]);
}

function subsTab(rerender) {
  const subs = state.money.items.filter((x) => x.recurring && x.recurring !== 'none');
  const monthly = subsMonthly();

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [h('div.card-t', 'اشتراكاتك'), h('div.card-s', `${subs.length} اشتراك`)]),
        h('b', money(monthly) + ' / شهر'),
      ]),
    ]),

    h('button.btn.primary.block', {
      onclick: () => openItemEditor(newItem({ recurring: 'monthly', category: 'net', lastsDays: 0 }), rerender),
    }, '＋ اشتراك جديد'),

    subs.length
      ? h('div.list', { style: { marginTop: '12px' } }, subs
        .sort((a, b) => (daysLeft(a) ?? 999) - (daysLeft(b) ?? 999))
        .map((x) => expRow(x, rerender)))
      : h('div', { style: { marginTop: '20px' } },
        empty('📶', 'أضف اشتراك الإنترنت أو أي شيء يتكرّر شهريًا.')),

    h('h2.sec', 'كم تكلّفك سنويًا؟'),
    h('div.card.tight', [
      h('div.card-t', money(monthly * 12)),
      h('div.card-s', 'مجموع اشتراكاتك في السنة — راجعها مرّة كل بضعة أشهر واحذف ما لا تستعمله.'),
    ]),
  ]);
}

/* ─────────────────── التقرير ─────────────────── */

function reportTab() {
  const mk = thisMonth();
  const items = state.money.items.filter((x) => monthKeyOf(x.date) === mk);
  const total = items.reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);

  const byCat = {};
  items.forEach((x) => {
    const t = (Number(x.price) || 0) * (Number(x.qty) || 1);
    byCat[x.category] = (byCat[x.category] || 0) + t;
  });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;

  // آخر ٦ أشهر
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: AR_MONTHS[d.getMonth()], total: monthTotal(key) });
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  const daily = totalDaily();

  return h('div', [
    h('div.card.glow', [
      h('div.muted.center', 'هذا الشهر'),
      h('div.big-money', money(total)),
      h('div.muted.center', `≈ ${money(total / Math.max(1, new Date().getDate()))} يوميًا`),
    ]),

    h('h2.sec', 'حسب التصنيف'),
    rows.length
      ? h('div.card', rows.map(([catId, val]) => {
        const c = catOf(catId);
        return h('div.cat-bar', [
          h('div.nm', `${c.icon} ${c.label}`),
          h('div.track', h('i', { style: { width: `${Math.round((val / max) * 100)}%` } })),
          h('div.val', money(val)),
        ]);
      }))
      : h('div.muted', 'لا مصاريف هذا الشهر بعد.'),

    h('h2.sec', 'آخر ٦ أشهر'),
    h('div.card', months.map((m) => h('div.cat-bar', [
      h('div.nm', m.label),
      h('div.track', h('i', { style: { width: `${Math.round((m.total / maxMonth) * 100)}%` } })),
      h('div.val', money(m.total)),
    ]))),

    h('h2.sec', 'الأغلى استهلاكًا يوميًا'),
    (() => {
      const top = state.money.items
        .map((x) => ({ x, d: dailyCost(x) }))
        .filter((e) => e.d > 0)
        .sort((a, b) => b.d - a.d)
        .slice(0, 6);
      return top.length
        ? h('div.list', top.map(({ x, d }) => h('div.exp', [
          h('div.ic', catOf(x.category).icon),
          h('div.grow', [h('div.t', x.name), h('div.s', `${money(x.price)} · يكفي ${x.lastsDays || '—'} يوم`)]),
          h('div.p', `${money(d)}/يوم`),
        ])))
        : h('div.muted', 'حدّد «كم يكفيني» لأي شيء لتظهر تكلفته اليومية هنا.');
    })(),

    h('div.card.tight', { style: { marginTop: '14px' } }, [
      h('div.card-t', `تكلفة حياتك اليومية: ${money(daily)}`),
      h('div.card-s', `أي ${money(daily * 30)} شهريًا و${money(daily * 365)} سنويًا من الأشياء المتكرّرة والمستهلكة.`),
    ]),
  ]);
}

/* ─────────────────── العرض والتحرير ─────────────────── */

function openItemView(item, rerender) {
  const d = daysLeft(item);
  const perDay = dailyCost(item);
  const c = catOf(item.category);
  const total = (Number(item.price) || 0) * (Number(item.qty) || 1);

  sheet(item.name, ({ close }) => h('div', [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', `${c.icon} ${c.label}`),
      item.recurring !== 'none' ? h('span.badge', RECUR.find((r) => r.value === item.recurring)?.label) : null,
      h('span.badge', longDate(fromDayKey(item.date))),
    ]),

    h('div.big-money', { style: { marginTop: '14px' } }, money(total)),
    item.qty > 1 ? h('div.muted.center', `${item.qty} × ${money(item.price)}`) : null,

    perDay > 0 ? h('div.card.tight', { style: { marginTop: '14px' } }, [
      h('div.card-t', `${money(perDay)} في اليوم`),
      h('div.card-s', `أي ${money(perDay * 30)} شهريًا${item.lastsDays ? ` · يكفي ${item.lastsDays} يومًا` : ''}`),
    ]) : null,

    d !== null ? h('div.card.tight', [
      h('div.card-t', d < 0
        ? (item.recurring !== 'none' ? 'حان وقت التجديد' : 'يُفترض أنه انتهى')
        : (item.recurring !== 'none' ? `يُجدَّد بعد ${d} يوم` : `يكفيك ${d} يومًا بعد`)),
      h('div.card-s', `التاريخ المتوقّع: ${longDate(new Date(endsAt(item)))}`),
    ]) : null,

    item.note ? h('p', { style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, item.note) : null,

    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn', {
        onclick: () => {
          const copy = { ...item, id: uid('ex_'), date: dayKey(), createdAt: Date.now() };
          saveItem(copy);
          close();
          toast('سُجّل شراء جديد بنفس التفاصيل', 'ok');
          rerender();
        },
      }, '🔁 اشتريته مجددًا'),
      h('button.btn.primary', { onclick: () => { close(); openItemEditor(item, rerender); } }, '✎ تعديل'),
    ]),
  ]));
}

function openItemEditor(item, onDone) {
  const draft = { ...item };
  const exists = state.money.items.some((x) => x.id === item.id);
  const body = h('div');
  const panel = sheet(exists ? 'تعديل المصروف' : 'مصروف جديد', body);

  const costLine = h('div.card.tight', { style: { marginTop: '12px' } });

  function updateCost() {
    const perDay = dailyCost(draft);
    fill(costLine, perDay > 0 ? [
      h('div.card-t', `${money(perDay)} في اليوم`),
      h('div.card-s', `${money(perDay * 30)} شهريًا · ${money(perDay * 365)} سنويًا`),
    ] : [h('div.card-s', 'حدّد «كم يكفيني» أو اجعله متكرّرًا لتظهر التكلفة اليومية.')]);
  }

  function render() {
    fill(body, [
      h('input', {
        placeholder: 'ما الذي اشتريته؟ (مثلًا: ريحة للأبد)', value: draft.name,
        oninput: (e) => { draft.name = e.target.value; },
      }),

      h('div.grid2', { style: { marginTop: '10px' } }, [
        h('div.field', [
          h('label', `السعر (${cur()})`),
          h('input', {
            type: 'number', inputmode: 'decimal', value: draft.price || '',
            oninput: (e) => { draft.price = Number(e.target.value) || 0; updateCost(); },
          }),
        ]),
        h('div.field', [
          h('label', 'الكمية'),
          h('input', {
            type: 'number', inputmode: 'numeric', value: draft.qty,
            oninput: (e) => { draft.qty = Math.max(1, Number(e.target.value) || 1); updateCost(); },
          }),
        ]),
      ]),

      h('h2.sec', 'التصنيف'),
      chipGroup(CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` })),
        draft.category, (v) => { draft.category = v; }),

      h('h2.sec', 'التاريخ'),
      h('input', {
        type: 'date', value: draft.date,
        onchange: (e) => { draft.date = e.target.value || draft.date; updateCost(); },
      }),

      h('h2.sec', 'كم يكفيني؟'),
      h('div.row', [
        h('input.grow', {
          type: 'number', inputmode: 'numeric', value: draft.lastsDays || '',
          placeholder: 'عدد الأيام (اتركه فارغًا إن لم ينطبق)',
          oninput: (e) => { draft.lastsDays = Number(e.target.value) || 0; updateCost(); },
        }),
      ]),
      (() => {
        const daysInput = () => body.querySelector('input.grow[type="number"]');
        const wrap = h('div.chips', { style: { marginTop: '8px' } });
        [7, 15, 30, 45, 60, 90, 180, 365].forEach((dd) => {
          wrap.append(h('button.chip' + (draft.lastsDays === dd ? '.on' : ''), {
            onclick: (e) => {
              draft.lastsDays = dd;
              [...wrap.children].forEach((c) => c.classList.remove('on'));
              e.target.classList.add('on');
              const inp = daysInput();
              if (inp) inp.value = dd;
              updateCost();
            },
          }, dd >= 30 ? `${Math.round(dd / 30)} شهر` : `${dd} يوم`));
        });
        return wrap;
      })(),

      h('h2.sec', 'التكرار'),
      chipGroup(RECUR, draft.recurring, (v) => { draft.recurring = v; updateCost(); }),

      costLine,

      h('h2.sec', 'ملاحظة'),
      h('textarea', {
        placeholder: 'مثلًا: من أي محل، أي نوع، ملاحظة عن الجودة…',
        value: draft.note, oninput: (e) => { draft.note = e.target.value; },
      }),

      h('label.row', { style: { marginTop: '10px', gap: '8px' } }, [
        h('input', {
          type: 'checkbox', checked: draft.remind,
          onchange: (e) => { draft.remind = e.target.checked; },
        }),
        h('span.muted', 'نبّهني قبل النفاد أو التجديد بيومين'),
      ]),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        exists
          ? h('button.btn.danger', {
            onclick: async () => {
              if (!await confirmSheet('حذف المصروف', `سيُحذف «${draft.name}».`)) return;
              removeItem(draft.id); panel.close(); onDone?.();
            },
          }, '🗑 حذف')
          : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.name.trim()) { toast('اكتب اسم المصروف', 'err'); return; }
            saveItem(draft);
            panel.close();
            toast('سُجّل المصروف', 'ok');
            onDone?.();
          },
        }, '💾 حفظ'),
      ]),
    ]);
    updateCost();
  }

  render();
}
