/**
 * قسم التمارين — برنامج ثابت من ثلاثة أيام، كل يوم ثماني خانات تمارين
 * تقبل نصًا أو صورة أو فيديو، مع حساب البروتين اليومي.
 */

import '../../styles/workout.css';
import { h, fill, chipGroup } from '../../core/dom.js';
import { dayKey, fromDayKey, longDate, addDays, clockOf } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { saveMedia, mediaUrl, deleteMedia, pickFile, mediaUsage } from '../../core/media.js';
import { PROTEIN_FOODS, ACTIVITY_LEVELS, suggestTarget, PROTEIN_TIPS } from '../../data/protein.js';
import { drawButton, drawPreview, deleteDrawing } from '../../core/draw.js';

const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
export const SLOTS_PER_DAY = 8;

const TABS = [
  { id: 'plan', label: 'التمارين' },
  { id: 'protein', label: 'البروتين' },
  { id: 'log', label: 'سجلّي' },
];

let tab = 'plan';
let activeDay = 'd1';

export default {
  id: 'workout',
  label: 'التمارين',
  icon: '🏋',

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
        h('div', [h('h1', 'تمارينك'), h('p', 'ثلاثة أيام · ٨ تمارين لكل يوم · بروتينك محسوب')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('workout', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'plan') return planTab(rerender);
  if (which === 'protein') return proteinTab(rerender);
  return logTab(rerender);
}

/* ─────────────────── بيانات ─────────────────── */

export function getDay(id = activeDay) {
  return state.workout.days.find((d) => d.id === id) || state.workout.days[0];
}

/** الخانة رقم n (من ١ إلى ٨) في يوم معيّن، أو null إن كانت فارغة. */
export function getSlot(dayId, n) {
  return (getDay(dayId).slots || []).find((s) => s.n === n) || null;
}

export function saveSlot(dayId, slot) {
  const day = getDay(dayId);
  day.slots = day.slots || [];
  const i = day.slots.findIndex((s) => s.n === slot.n);
  if (i >= 0) day.slots[i] = slot; else day.slots.push(slot);
  day.slots.sort((a, b) => a.n - b.n);
  save();
  emit('workout');
}

export async function removeSlot(dayId, n) {
  const day = getDay(dayId);
  const slot = getSlot(dayId, n);
  if (slot?.media?.length) {
    await Promise.all(slot.media.map((m) => deleteMedia(m.id)));
  }
  if (slot?.drawing) await deleteDrawing(slot.drawing);
  day.slots = (day.slots || []).filter((s) => s.n !== n);
  save();
  emit('workout');
}

/** إنجاز خانة اليوم (يُسجَّل بتاريخ اليوم الحقيقي). */
export function toggleSlotDone(dayId, n, key = dayKey()) {
  const log = state.workout.log;
  const entry = log[key] || { dayId, doneSlots: [] };
  entry.dayId = dayId;
  const i = entry.doneSlots.indexOf(n);
  if (i >= 0) entry.doneSlots.splice(i, 1); else entry.doneSlots.push(n);
  log[key] = entry;
  save();
  emit('workout');
}

export function isSlotDone(dayId, n, key = dayKey()) {
  const entry = state.workout.log[key];
  return !!entry && entry.dayId === dayId && entry.doneSlots.includes(n);
}

/* ─────────────────── تبويب التمارين ─────────────────── */

function planTab(rerender) {
  const day = getDay();
  const filled = (day.slots || []).length;
  const doneToday = state.workout.log[dayKey()];
  const doneCount = doneToday?.dayId === day.id ? doneToday.doneSlots.length : 0;

  return h('div', [
    h('div.day-pills', state.workout.days.map((d) => {
      const n = (d.slots || []).length;
      return h('button.day-pill' + (d.id === activeDay ? '.on' : ''), {
        onclick: () => { activeDay = d.id; haptic(); rerender(); },
      }, [d.name, h('small', n ? `${n} تمرين` : 'فارغ')]);
    })),

    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', day.name),
          h('div.card-s', `${filled} من ${SLOTS_PER_DAY} خانة · أُنجز اليوم ${doneCount}`),
        ]),
        h('button.btn.sm', { onclick: () => renameDay(day, rerender) }, '✎ الاسم'),
      ]),
      filled ? h('div.bar', { style: { marginTop: '10px' } },
        h('i', { style: { width: `${Math.round((doneCount / Math.max(1, filled)) * 100)}%` } })) : null,
    ]),

    ...Array.from({ length: SLOTS_PER_DAY }, (_, i) => slotRow(day.id, i + 1, rerender)),

    h('div.muted.center', { style: { marginTop: '14px', fontSize: '12px' } },
      'اضغط على أي خانة لإضافة التمرين — نص أو صورة أو فيديو.'),
  ]);
}

function slotRow(dayId, n, rerender) {
  const slot = getSlot(dayId, n);
  const done = isSlotDone(dayId, n);

  if (!slot) {
    return h('div.slot.empty', { onclick: () => openSlotEditor(dayId, n, rerender) }, [
      h('div.num', String(n)),
      h('div.grow', [
        h('div.t', { style: { color: 'var(--fg-3)' } }, `＋ أضف التمرين ${ORDINALS[n - 1]}`),
        h('div.s', 'نص · صورة · فيديو'),
      ]),
    ]);
  }

  const media = slot.media || [];
  const thumb = h('div.thumb', media.length ? '' : '🏋');
  if (media.length) {
    mediaUrl(media[0].id).then((url) => {
      if (!url) return;
      fill(thumb, media[0].type === 'video'
        ? h('video', { src: url, muted: true, playsinline: true })
        : h('img', { src: url, alt: '' }));
    });
  }

  return h('div.slot' + (done ? '.done' : ''), [
    h('div.num', {
      onclick: (e) => { e.stopPropagation(); haptic(18); toggleSlotDone(dayId, n); rerender(); },
    }, done ? '✓' : String(n)),
    h('div.grow', { onclick: () => openSlotView(dayId, n, rerender) }, [
      h('div.t.ellipsis', slot.title || `التمرين ${ORDINALS[n - 1]}`),
      h('div.s.ellipsis', [
        slot.sets ? `${slot.sets}×${slot.reps || '؟'}` : null,
        slot.rest ? `راحة ${slot.rest}ث` : null,
        media.length ? `${media.length} ملف` : null,
        slot.note && !slot.sets ? slot.note : null,
      ].filter(Boolean).join(' · ') || 'اضغط للتفاصيل'),
    ]),
    thumb,
  ]);
}

function renameDay(day, rerender) {
  const input = h('input', { value: day.name, placeholder: 'اسم اليوم (مثلًا: صدر وترايسبس)' });
  const panel = sheet('اسم اليوم', h('div', [
    input,
    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        day.name = input.value.trim() || day.name;
        save(); emit('workout'); panel.close(); rerender();
      },
    }, 'حفظ'),
  ]));
}

/* ─────────────────── عرض التمرين ─────────────────── */

function openSlotView(dayId, n, rerender) {
  const slot = getSlot(dayId, n);
  if (!slot) { openSlotEditor(dayId, n, rerender); return; }
  const done = isSlotDone(dayId, n);

  const body = h('div');
  const panel = sheet(slot.title || `التمرين ${ORDINALS[n - 1]}`, body);

  fill(body, [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', `خانة ${n}`),
      slot.sets ? h('span.badge', `${slot.sets} مجموعات × ${slot.reps || '؟'}`) : null,
      slot.rest ? h('span.badge', `راحة ${slot.rest} ثانية`) : null,
      slot.weight ? h('span.badge', `${slot.weight} كغم`) : null,
    ]),

    slot.note ? h('p', { style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, slot.note) : null,

    ...(slot.media || []).map((m) => {
      const box = h('div.media-full', { style: { minHeight: '60px' } });
      mediaUrl(m.id).then((url) => {
        if (!url) { fill(box, h('div.muted.center', 'تعذّر فتح الملف')); return; }
        fill(box, m.type === 'video'
          ? h('video', { src: url, controls: true, playsinline: true, style: { width: '100%', borderRadius: '14px' } })
          : h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '14px', display: 'block' } }));
      });
      return box;
    }),

    slot.drawing ? drawPreview(slot.drawing, { title: slot.title || `التمرين ${ORDINALS[n - 1]}` }) : null,

    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn' + (done ? '.ok' : '.primary'), {
        onclick: () => { toggleSlotDone(dayId, n); panel.close(); rerender(); },
      }, done ? '✓ أُنجز اليوم' : '✓ علّمه منجَزًا'),
      h('button.btn', { onclick: () => { panel.close(); openSlotEditor(dayId, n, rerender); } }, '✎ تعديل'),
    ]),
  ]);
}

/* ─────────────────── محرّر التمرين ─────────────────── */

function openSlotEditor(dayId, n, rerender) {
  const existing = getSlot(dayId, n);
  const draft = existing
    ? { ...existing, media: [...(existing.media || [])] }
    : { n, title: '', note: '', sets: '', reps: '', rest: '', weight: '', media: [], drawing: null };

  const body = h('div');
  const panel = sheet(existing ? `تعديل التمرين ${ORDINALS[n - 1]}` : `التمرين ${ORDINALS[n - 1]}`, body);

  function render() {
    fill(body, [
      h('input', {
        placeholder: 'اسم التمرين', value: draft.title,
        oninput: (e) => { draft.title = e.target.value; },
      }),

      h('h2.sec', 'الوصف أو الطريقة'),
      h('textarea', {
        placeholder: 'اكتب الطريقة أو ملاحظاتك…', value: draft.note,
        oninput: (e) => { draft.note = e.target.value; },
      }),

      h('h2.sec', 'الأرقام (اختياري)'),
      h('div.grid2', [
        numField('المجموعات', draft.sets, (v) => { draft.sets = v; }),
        numField('التكرارات', draft.reps, (v) => { draft.reps = v; }),
      ]),
      h('div.grid2', [
        numField('الراحة (ثانية)', draft.rest, (v) => { draft.rest = v; }),
        numField('الوزن (كغم)', draft.weight, (v) => { draft.weight = v; }),
      ]),

      h('h2.sec', `الصور والفيديو (${draft.media.length})`),
      draft.media.length ? h('div.media-grid', draft.media.map((m) => {
        const box = h('div.media-box');
        mediaUrl(m.id).then((url) => {
          if (!url) return;
          box.prepend(m.type === 'video'
            ? h('video', { src: url, muted: true, playsinline: true })
            : h('img', { src: url, alt: '' }));
        });
        box.append(h('button.kill', {
          onclick: async () => {
            await deleteMedia(m.id);
            draft.media = draft.media.filter((x) => x.id !== m.id);
            render();
          },
        }, '✕'));
        return box;
      })) : h('div.muted', 'لا ملفات بعد.'),

      h('div.grid3', { style: { marginTop: '10px' } }, [
        h('button.btn.sm', { onclick: () => attach('image', false) }, '🖼 صورة'),
        h('button.btn.sm', { onclick: () => attach('image', true) }, '📷 كاميرا'),
        h('button.btn.sm', { onclick: () => attach('video', false) }, '🎬 فيديو'),
      ]),

      h('h2.sec', 'ملاحظة رسم'),
      drawPreview(draft.drawing, { title: draft.title || `التمرين ${ORDINALS[n - 1]}` }),
      drawButton({
        id: draft.drawing,
        title: draft.title || `التمرين ${ORDINALS[n - 1]}`,
        onChange: (id) => { draft.drawing = id; render(); },
      }),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        existing
          ? h('button.btn.danger', {
            onclick: async () => {
              if (!await confirmSheet('حذف التمرين', `سيُحذف «${existing.title || 'التمرين'}» مع ملفاته.`)) return;
              await removeSlot(dayId, n);
              panel.close(); rerender();
            },
          }, '🗑 حذف')
          : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.title.trim() && !draft.note.trim() && !draft.media.length) {
              toast('أضف اسمًا أو وصفًا أو ملفًا على الأقل', 'err');
              return;
            }
            saveSlot(dayId, draft);
            panel.close();
            toast('حُفظ التمرين', 'ok');
            rerender();
          },
        }, '💾 حفظ'),
      ]),
    ]);
  }

  async function attach(kind, camera) {
    const file = await pickFile(kind, { camera });
    if (!file) return;
    toast('جارٍ الحفظ…');
    try {
      const m = await saveMedia(file);
      if (m) { draft.media.push(m); render(); toast('أُضيف الملف', 'ok'); }
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الملف', 'err');
    }
  }

  render();
}

function numField(label, value, onChange) {
  return h('div.field', [
    h('label', label),
    h('input', {
      type: 'number', inputmode: 'numeric', value, placeholder: '—',
      oninput: (e) => onChange(e.target.value),
    }),
  ]);
}

/* ─────────────────── البروتين ─────────────────── */

const proteinToday = (key = dayKey()) => state.workout.protein.log[key] || [];
const proteinTotal = (key = dayKey()) => proteinToday(key).reduce((s, e) => s + Number(e.grams || 0), 0);

export function addProtein(entry, key = dayKey()) {
  const log = state.workout.protein.log;
  log[key] = log[key] || [];
  log[key].push({ id: uid('pr_'), at: Date.now(), ...entry });
  save();
  emit('workout');
}

export function removeProtein(id, key = dayKey()) {
  const log = state.workout.protein.log;
  log[key] = (log[key] || []).filter((e) => e.id !== id);
  save();
  emit('workout');
}

function proteinTab(rerender) {
  const p = state.workout.protein;
  const total = proteinTotal();
  const target = p.targetG || 1;
  const pct = Math.min(100, Math.round((total / target) * 100));
  const left = Math.max(0, target - total);
  const plan = p.plans[activeDay] || [];

  const circ = 2 * Math.PI * 34;

  return h('div', [
    h('div.card.glow', [
      h('div.prot-ring', [
        h('svg', {
          width: 82, height: 82, viewBox: '0 0 82 82', html: `
          <circle cx="41" cy="41" r="34" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
          <circle cx="41" cy="41" r="34" fill="none" stroke="var(--accent-2)" stroke-width="8"
            stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/>`,
        }),
        h('div.grow', [
          h('div.prot-big', `${Math.round(total)} / ${target} غم`),
          h('div.muted', left > 0 ? `باقي ${Math.round(left)} غم اليوم` : 'وصلت هدفك اليوم 💪'),
        ]),
      ]),
    ]),

    h('h2.sec', 'أضف بسرعة'),
    h('div.grid2', [
      h('button.btn.primary', { onclick: () => openFoodPicker(rerender) }, '＋ من القائمة'),
      h('button.btn', { onclick: () => openCustomProtein(rerender) }, '✎ إدخال يدوي'),
    ]),

    h('h2.sec', `ما أكلته اليوم (${proteinToday().length})`),
    proteinToday().length
      ? h('div.list', [...proteinToday()].reverse().map((e) => h('div.food', [
        h('div.grow', [
          h('div', e.name),
          h('div.u', clockOf(new Date(e.at), state.settings.hour12)),
        ]),
        h('div.g', `${e.grams} غم`),
        h('button.btn.sm.ghost', {
          onclick: () => { removeProtein(e.id); rerender(); },
        }, '✕'),
      ])))
      : h('div.muted', 'لم تسجّل شيئًا اليوم بعد.'),

    h('h2.sec', `ما يجب أخذه في ${getDay().name}`),
    plan.length
      ? h('div.list', plan.map((item) => h('div.food', [
        h('div.grow', [h('div', item.name), item.when ? h('div.u', item.when) : null]),
        h('div.g', `${item.grams} غم`),
        h('button.btn.sm', {
          onclick: () => { addProtein({ name: item.name, grams: item.grams }); toast('أُضيف إلى سجلّ اليوم', 'ok'); rerender(); },
        }, '✓'),
        h('button.btn.sm.ghost', {
          onclick: () => {
            state.workout.protein.plans[activeDay] = plan.filter((x) => x.id !== item.id);
            save(); emit('workout'); rerender();
          },
        }, '✕'),
      ])))
      : h('div.muted', 'لا خطّة لهذا اليوم — أضف ما يجب أن تأخذه فيه.'),
    h('button.btn.block', { style: { marginTop: '10px' }, onclick: () => openPlanAdd(rerender) },
      `＋ أضف إلى خطّة ${getDay().name}`),

    h('h2.sec', 'هدفي اليومي'),
    h('div.card', [
      h('div.field', [
        h('label', `وزني: ${p.weightKg} كغم`),
        h('input', {
          type: 'range', min: 40, max: 160, value: p.weightKg,
          onchange: (e) => {
            p.weightKg = Number(e.target.value);
            p.targetG = suggestTarget(p.weightKg, p.perKg);
            save(); emit('workout'); rerender();
          },
        }),
      ]),
      h('div.field', [
        h('label', 'مستوى النشاط'),
        chipGroup(ACTIVITY_LEVELS, p.perKg, (v) => {
          p.perKg = v;
          p.targetG = suggestTarget(p.weightKg, v);
          save(); emit('workout'); rerender();
        }),
      ]),
      h('div.row.between', [
        h('span.muted', 'الهدف (غرام/يوم)'),
        h('input', {
          type: 'number', value: p.targetG, style: { width: '110px' },
          onchange: (e) => { p.targetG = Math.max(10, Number(e.target.value) || 10); save(); emit('workout'); rerender(); },
        }),
      ]),
      h('div.muted', { style: { marginTop: '8px' } },
        `المقترح لوزنك ومستواك: ${suggestTarget(p.weightKg, p.perKg)} غم`),
    ]),

    h('h2.sec', 'إرشادات'),
    h('div.list', PROTEIN_TIPS.map((t) => h('div.card.tight', h('div.card-s', `• ${t}`)))),
  ]);
}

function openFoodPicker(rerender) {
  const body = h('div');
  const panel = sheet('أضف بروتينًا', body);
  let q = '';

  function render() {
    const list = q
      ? PROTEIN_FOODS.filter((f) => f.name.includes(q))
      : PROTEIN_FOODS;

    fill(body, [
      h('input', {
        type: 'search', placeholder: 'ابحث عن طعام…', value: q,
        oninput: (e) => { q = e.target.value.trim(); render(); },
      }),
      h('div.list', { style: { marginTop: '12px' } }, list.map((f) => h('div.food', [
        h('div.grow', [h('div', f.name), h('div.u', f.unit)]),
        h('div.g', `${f.grams} غم`),
        h('div.row', { style: { gap: '4px' } }, [1, 2, 3].map((mult) =>
          h('button.btn.sm', {
            onclick: () => {
              addProtein({ name: mult > 1 ? `${f.name} ×${mult}` : f.name, grams: Math.round(f.grams * mult) });
              toast(`أُضيف ${Math.round(f.grams * mult)} غم`, 'ok');
              panel.close();
              rerender();
            },
          }, `×${mult}`))),
      ]))),
    ]);
  }

  render();
}

function openCustomProtein(rerender) {
  const name = h('input', { placeholder: 'اسم الطعام' });
  const grams = h('input', { type: 'number', placeholder: 'غرامات البروتين', inputmode: 'numeric' });
  const panel = sheet('إدخال يدوي', h('div', [
    name,
    h('div', { style: { height: '10px' } }),
    grams,
    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        const g = Number(grams.value);
        if (!name.value.trim() || !g) { toast('اكتب الاسم والغرامات', 'err'); return; }
        addProtein({ name: name.value.trim(), grams: Math.round(g) });
        panel.close(); toast('أُضيف', 'ok'); rerender();
      },
    }, 'أضف'),
  ]));
}

function openPlanAdd(rerender) {
  const name = h('input', { placeholder: 'مثلًا: سكوب واي بعد التمرين' });
  const grams = h('input', { type: 'number', placeholder: 'غرامات', inputmode: 'numeric' });
  const when = h('input', { placeholder: 'الوقت (اختياري): بعد التمرين، قبل النوم…' });

  const panel = sheet(`خطّة ${getDay().name}`, h('div', [
    name,
    h('div', { style: { height: '10px' } }), grams,
    h('div', { style: { height: '10px' } }), when,
    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        const g = Number(grams.value);
        if (!name.value.trim() || !g) { toast('اكتب الاسم والغرامات', 'err'); return; }
        const plans = state.workout.protein.plans;
        plans[activeDay] = plans[activeDay] || [];
        plans[activeDay].push({ id: uid('pl_'), name: name.value.trim(), grams: Math.round(g), when: when.value.trim() });
        save(); emit('workout');
        panel.close(); toast('أُضيف إلى الخطّة', 'ok'); rerender();
      },
    }, 'أضف إلى الخطّة'),
  ]));
}

/* ─────────────────── السجلّ ─────────────────── */

function logTab(rerender) {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(new Date(), -i);
    const key = dayKey(d);
    const w = state.workout.log[key];
    const prot = proteinTotal(key);
    days.push({ key, d, w, prot });
  }

  const totalSessions = Object.keys(state.workout.log).length;
  const avg = Math.round(days.reduce((s, x) => s + x.prot, 0) / days.length);

  const usage = h('div.muted', 'جارٍ الحساب…');
  mediaUsage().then(({ count, bytes }) => {
    usage.textContent = `${count} ملف · ${(bytes / 1048576).toFixed(1)} م.ب داخل الجهاز`;
  });

  return h('div', [
    h('div.grid2', [
      statCard('أيام تمرين', String(totalSessions)),
      statCard('متوسّط البروتين', `${avg} غم`),
    ]),

    h('h2.sec', 'آخر أسبوعين'),
    h('div.list', days.map((x) => {
      const day = x.w ? state.workout.days.find((d) => d.id === x.w.dayId) : null;
      const pct = Math.min(100, Math.round((x.prot / (state.workout.protein.targetG || 1)) * 100));
      return h('div.card.tight', [
        h('div.row.between', [
          h('div', [
            h('div.card-t', longDate(fromDayKey(x.key))),
            h('div.card-s', day ? `${day.name} · ${x.w.doneSlots.length} تمرين` : 'بلا تمرين'),
          ]),
          h('span.badge' + (pct >= 100 ? '.ok' : pct >= 60 ? '.warn' : ''), `${Math.round(x.prot)} غم`),
        ]),
        h('div.bar', { style: { marginTop: '8px' } }, h('i', { style: { width: `${pct}%` } })),
      ]);
    })),

    h('h2.sec', 'مساحة الوسائط'),
    h('div.card.tight', [usage, h('div.card-s', { style: { marginTop: '6px' } },
      'الصور تُصغَّر تلقائيًا عند الحفظ. احذف تمرينًا لتحرير ملفاته.')]),
  ]);
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '21px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}
