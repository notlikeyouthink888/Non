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
import {
  PROTEIN_FOODS, FOOD_CATEGORIES, AMOUNTS, proteinOf,
  ACTIVITY_LEVELS, suggestTarget, PROTEIN_TIPS,
} from '../../data/protein.js';
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

export function saveSlot(dayId, slot, { silent = false } = {}) {
  const day = getDay(dayId);
  day.slots = day.slots || [];
  const i = day.slots.findIndex((s) => s.n === slot.n);
  const copy = { ...slot, media: [...(slot.media || [])] };
  if (i >= 0) day.slots[i] = copy; else day.slots.push(copy);
  day.slots.sort((a, b) => a.n - b.n);
  save(true);
  if (!silent) emit('workout');
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

/**
 * محرّر الخانة.
 *
 * حقول الكتابة تُنشأ مرّة واحدة ولا يُعاد بناؤها أبدًا — إضافة صورة أو رسم
 * تحدّث شبكة الوسائط وحدها. هكذا لا تُقطع كتابة لوحة المفاتيح العربية
 * (تركيب الحروف) في منتصفها فتضيع نصف الكلمة. والقيم تُقرأ من الحقول نفسها
 * عند الحفظ، لا من نسخة جانبية، فما تراه على الشاشة هو ما يُحفظ حرفيًا.
 * فوق ذلك تُحفظ المسوّدة تلقائيًا بعد ثانية من آخر تعديل.
 */
function openSlotEditor(dayId, n, rerender) {
  const existing = getSlot(dayId, n);
  const draft = existing
    ? { ...existing, media: [...(existing.media || [])] }
    : { n, title: '', note: '', sets: '', reps: '', rest: '', weight: '', media: [], drawing: null };

  const titleEl = h('input', {
    placeholder: 'اسم التمرين', value: draft.title,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
  });
  const noteEl = h('textarea', { placeholder: 'اكتب الطريقة أو ملاحظاتك…', value: draft.note });
  const setsEl = numInput(draft.sets);
  const repsEl = numInput(draft.reps);
  const restEl = numInput(draft.rest);
  const weightEl = numInput(draft.weight);

  const mediaHead = h('h2.sec', '');
  const mediaBox = h('div');
  const drawBox = h('div');
  const savedHint = h('div.muted.center', { style: { fontSize: '11px', marginTop: '8px', minHeight: '14px' } }, '');

  const label = () => (readDraft().title || `التمرين ${ORDINALS[n - 1]}`);

  /** يقرأ ما هو مكتوب الآن في الحقول الحيّة. */
  function readDraft() {
    draft.title = titleEl.value;
    draft.note = noteEl.value;
    draft.sets = setsEl.value;
    draft.reps = repsEl.value;
    draft.rest = restEl.value;
    draft.weight = weightEl.value;
    return draft;
  }

  const hasContent = () => !!(draft.title.trim() || draft.note.trim() || draft.media.length || draft.drawing);

  let autoTimer = null;
  function autoSave() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      readDraft();
      if (!hasContent()) return;
      saveSlot(dayId, draft, { silent: true });
      savedHint.textContent = '✓ حُفظ تلقائيًا';
    }, 900);
  }

  [titleEl, noteEl, setsEl, repsEl, restEl, weightEl].forEach((el) => {
    el.addEventListener('input', () => { savedHint.textContent = ''; autoSave(); });
    // يلتقط ما تكتبه لوحة المفاتيح دفعة واحدة (الإكمال التلقائي، اللصق، تركيب الحروف)
    el.addEventListener('change', () => { readDraft(); autoSave(); });
    el.addEventListener('blur', () => { readDraft(); if (hasContent()) saveSlot(dayId, draft, { silent: true }); });
  });

  /** تحديث موضعي لشبكة الوسائط — لا يمسّ حقول الكتابة. */
  function renderMedia() {
    mediaHead.textContent = `الصور والفيديو (${draft.media.length})`;
    fill(mediaBox, draft.media.length ? [h('div.media-grid', draft.media.map((m) => {
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
          readDraft();
          if (hasContent()) saveSlot(dayId, draft, { silent: true });
          renderMedia();
        },
      }, '✕'));
      return box;
    }))] : [h('div.muted', 'لا ملفات بعد.')]);
  }

  /** تحديث موضعي لملاحظة الرسم. */
  function renderDraw() {
    fill(drawBox, [
      drawPreview(draft.drawing, { title: label() }),
      drawButton({
        id: draft.drawing,
        title: label(),
        onChange: (id) => {
          draft.drawing = id;
          readDraft();
          if (hasContent()) saveSlot(dayId, draft, { silent: true });
          renderDraw();
        },
      }),
    ]);
  }

  const body = h('div', [
    titleEl,
    h('h2.sec', 'الوصف أو الطريقة'),
    noteEl,
    h('h2.sec', 'الأرقام (اختياري)'),
    h('div.grid2', [field('المجموعات', setsEl), field('التكرارات', repsEl)]),
    h('div.grid2', [field('الراحة (ثانية)', restEl), field('الوزن (كغم)', weightEl)]),

    mediaHead,
    mediaBox,
    h('div.grid3', { style: { marginTop: '10px' } }, [
      h('button.btn.sm', { onclick: () => attach('image', false) }, '🖼 صورة'),
      h('button.btn.sm', { onclick: () => attach('image', true) }, '📷 كاميرا'),
      h('button.btn.sm', { onclick: () => attach('video', false) }, '🎬 فيديو'),
    ]),

    h('h2.sec', 'ملاحظة رسم'),
    drawBox,

    h('div.grid2', { style: { marginTop: '16px' } }, [
      existing
        ? h('button.btn.danger', {
          onclick: async () => {
            if (!await confirmSheet('حذف التمرين', `سيُحذف «${existing.title || 'التمرين'}» مع ملفاته.`)) return;
            clearTimeout(autoTimer);
            await removeSlot(dayId, n);
            panel.close(); rerender();
          },
        }, '🗑 حذف')
        : h('button.btn.ghost', {
          onclick: async () => {
            clearTimeout(autoTimer);
            // ما حُفظ تلقائيًا لخانة جديدة يُلغى مع الإلغاء
            if (getSlot(dayId, n)) { await removeSlot(dayId, n); rerender(); }
            panel.close();
          },
        }, 'إلغاء'),
      h('button.btn.primary', {
        onclick: () => {
          clearTimeout(autoTimer);
          readDraft();
          if (!hasContent()) { toast('أضف اسمًا أو وصفًا أو ملفًا على الأقل', 'err'); return; }
          saveSlot(dayId, draft);
          panel.close();
          toast('حُفظ التمرين', 'ok');
          rerender();
        },
      }, '💾 حفظ'),
    ]),
    savedHint,
  ]);

  const panel = sheet(existing ? `تعديل التمرين ${ORDINALS[n - 1]}` : `التمرين ${ORDINALS[n - 1]}`, body);

  async function attach(kind, camera) {
    readDraft();                       // نثبّت المكتوب قبل مغادرة الشاشة إلى المنتقي
    if (hasContent()) saveSlot(dayId, draft, { silent: true });
    const file = await pickFile(kind, { camera });
    if (!file) return;
    toast('جارٍ الحفظ…');
    try {
      const m = await saveMedia(file);
      if (!m) return;
      draft.media.push(m);
      readDraft();
      saveSlot(dayId, draft, { silent: true });
      renderMedia();
      toast('أُضيف الملف', 'ok');
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الملف', 'err');
    }
  }

  renderMedia();
  renderDraw();
}

function numInput(value) {
  return h('input', { type: 'number', inputmode: 'numeric', value, placeholder: '—' });
}

function field(label, el) {
  return h('div.field', [h('label', label), el]);
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
  save(true);
  emit('workout');
}

/** تعديل إدخال مسجَّل (الاسم أو الغرامات). */
export function editProtein(id, patch, key = dayKey()) {
  const entry = (state.workout.protein.log[key] || []).find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch);
  save(true);
  emit('workout');
}

/**
 * كل الأطعمة المتاحة: الجدول المرجعي + ما أضافه المستخدم،
 * مع تطبيق أي تعديل أجراه على غرامات البروتين.
 */
export function allFoods() {
  const p = state.workout.protein;
  const edits = p.edits || {};
  const base = PROTEIN_FOODS.map((f) => (edits[f.name] != null ? { ...f, per100: edits[f.name], edited: true } : f));
  return [...(p.customFoods || []).map((f) => ({ ...f, custom: true })), ...base];
}

/** وصف مختصر لبروتين الطعام بالوحدة الشائعة. */
function foodSummary(f) {
  const per100 = `${proteinOf(f, 100)} غم / ١٠٠ غم`;
  return f.piece ? `${f.pieceLabel} (${f.piece} غم) = ${proteinOf(f, f.piece)} غم · ${per100}` : per100;
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
        h('div.grow', { onclick: () => openEntryEditor(e, rerender) }, [
          h('div', e.name),
          h('div.u', [clockOf(new Date(e.at), state.settings.hour12), e.amountG ? `${e.amountG} غم طعام` : null]
            .filter(Boolean).join(' · ')),
        ]),
        h('button.g.as-btn', {
          title: 'اضغط لتعديل الغرامات', onclick: () => openEntryEditor(e, rerender),
        }, `${round1(e.grams)} غم`),
        h('button.btn.sm.ghost', {
          onclick: () => { removeProtein(e.id); rerender(); },
        }, '✕'),
      ])))
      : h('div.muted', 'لم تسجّل شيئًا اليوم بعد.'),

    h('h2.sec', `ما يجب أخذه في ${getDay().name}`),
    plan.length
      ? h('div.list', plan.map((item) => h('div.food', [
        h('div.grow', { onclick: () => openPlanEditor(item, rerender) }, [
          h('div', item.name), item.when ? h('div.u', item.when) : null,
        ]),
        h('button.g.as-btn', {
          title: 'اضغط لتعديل الغرامات', onclick: () => openPlanEditor(item, rerender),
        }, `${round1(item.grams)} غم`),
        h('button.btn.sm', {
          onclick: () => { addProtein({ name: item.name, grams: item.grams }); toast('أُضيف إلى سجلّ اليوم', 'ok'); rerender(); },
        }, '✓'),
        h('button.btn.sm.ghost', {
          onclick: () => {
            state.workout.protein.plans[activeDay] = plan.filter((x) => x.id !== item.id);
            save(true); emit('workout'); rerender();
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

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

/** قائمة الأطعمة: بحث + تصنيفات (فيها الفواكه والخضروات) + أطعمتك المضافة. */
function openFoodPicker(rerender, { onPick = null, title = 'أضف بروتينًا' } = {}) {
  const body = h('div');
  const panel = sheet(title, body);
  let q = '';
  let cat = 'all';

  const cats = [{ id: 'all', label: 'الكل', icon: '🍽' }, ...FOOD_CATEGORIES];

  // حقل البحث يُنشأ مرّة واحدة: إعادة بنائه مع كل حرف تقطع الكتابة العربية
  const searchEl = h('input', {
    type: 'search', placeholder: 'ابحث عن طعام أو فاكهة أو خضار…',
    oninput: (e) => { q = e.target.value.trim(); renderList(); },
  });
  const listBox = h('div', { style: { marginTop: '12px' } });
  const chipsBox = h('div.chips', { style: { marginTop: '10px' } });

  function render() {
    fill(chipsBox, cats.map((c) =>
      h('button.chip' + (cat === c.id ? '.on' : ''), {
        onclick: () => { cat = c.id; render(); },
      }, `${c.icon} ${c.label}`)));
    renderList();
  }

  function renderList() {
    const list = allFoods().filter((f) =>
      (cat === 'all' || f.cat === cat) && (!q || f.name.includes(q)));

    fill(listBox, [
      h('div.list', list.length ? list.map((f) => h('div.food', [
        h('div.grow', {
          onclick: () => { panel.close(); openAmountSheet(f, rerender, onPick); },
        }, [
          h('div', f.name + (f.custom ? ' ⭐' : f.edited ? ' ✎' : '')),
          h('div.u', foodSummary(f)),
        ]),
        h('button.btn.sm.ghost', {
          title: 'تعديل غرامات البروتين',
          onclick: () => { panel.close(); openFoodEditor(f, rerender); },
        }, '✎'),
        h('button.btn.sm.primary', {
          onclick: () => { panel.close(); openAmountSheet(f, rerender, onPick); },
        }, '＋'),
      ])) : [h('div.muted', 'لا نتيجة — أضف الطعام بنفسك من الزرّ أعلاه.')]),
    ]);
  }

  fill(body, [
    searchEl,
    chipsBox,
    h('button.btn.block', {
      style: { marginTop: '10px' },
      onclick: () => { panel.close(); openFoodEditor(null, rerender); },
    }, '＋ أضف طعامًا أو مشروبًا جديدًا'),
    listBox,
  ]);

  render();
}

/** منتقي الكمية: حبة / ١٠٠ غم / ربع / نصف / كيلو / كمية حرّة، مع عدّاد. */
function openAmountSheet(food, rerender, onPick = null) {
  const body = h('div');
  const panel = sheet(food.name, body);

  let mode = food.piece ? 'piece' : 'g100';
  let count = 1;
  let freeG = 100;

  const unitGrams = () => {
    if (mode === 'piece') return food.piece || 100;
    if (mode === 'free') return Math.max(0, freeG);
    return AMOUNTS.find((a) => a.id === mode)?.grams || 100;
  };
  const totalFoodG = () => Math.round(unitGrams() * count);
  const totalProtein = () => proteinOf(food, totalFoodG());

  const unitName = () => {
    if (mode === 'piece') return food.pieceLabel || 'حبة';
    if (mode === 'free') return `${freeG} غم`;
    return AMOUNTS.find((a) => a.id === mode)?.label || '١٠٠ غم';
  };

  const out = h('div.card.glow', { style: { marginTop: '14px' } });
  function updateOut() {
    fill(out, [h('div.row.between', [
      h('span.muted', `${totalFoodG()} غم من ${food.name}`),
      h('b.prot-big', `${totalProtein()} غم بروتين`),
    ])]);
  }

  function render() {
    const opts = [
      ...(food.piece ? [{ id: 'piece', label: `${food.pieceLabel || 'حبة'} · ${food.piece} غم` }] : []),
      ...AMOUNTS.filter((a) => a.id !== 'piece'),
      { id: 'free', label: 'كمية حرّة' },
    ];

    fill(body, [
      h('div.card.tight', h('div.card-s', foodSummary(food))),

      h('h2.sec', 'المقدار'),
      h('div.chips', opts.map((a) => h('button.chip' + (mode === a.id ? '.on' : ''), {
        onclick: () => { mode = a.id; render(); },
      }, a.label))),

      mode === 'free' ? h('div.field', { style: { marginTop: '10px' } }, [
        h('label', 'كم غرامًا من الطعام؟'),
        h('input', {
          type: 'number', inputmode: 'numeric', value: freeG,
          oninput: (e) => { freeG = Math.max(0, Number(e.target.value) || 0); updateOut(); },
        }),
      ]) : null,

      h('h2.sec', 'العدد'),
      h('div.row', { style: { gap: '8px', alignItems: 'center' } }, [
        h('button.btn.sm', { onclick: () => { count = Math.max(1, count - 1); render(); } }, '−'),
        h('b.mono', { style: { minWidth: '52px', textAlign: 'center' } }, `×${count}`),
        h('button.btn.sm', { onclick: () => { count += 1; render(); } }, '＋'),
        h('div.grow'),
        ...[2, 3, 5].map((k) => h('button.btn.sm.ghost', { onclick: () => { count = k; render(); } }, `×${k}`)),
      ]),

      out,

      h('button.btn.primary.block', {
        style: { marginTop: '14px' },
        onclick: () => {
          const g = totalProtein();
          if (!g) { toast('المقدار صفر', 'err'); return; }
          const label = `${food.name} — ${count > 1 ? `${count} ` : ''}${unitName()}`;
          if (onPick) onPick({ name: label, grams: g, amountG: totalFoodG() });
          else addProtein({ name: label, grams: g, amountG: totalFoodG(), food: food.name });
          panel.close();
          toast(`أُضيف ${g} غم بروتين`, 'ok');
          rerender();
        },
      }, '✓ أضف'),
    ]);
    updateOut();
  }

  render();
}

/** إضافة طعام جديد للقائمة، أو تعديل غرامات طعام موجود — ويبقى محفوظًا. */
function openFoodEditor(food, rerender) {
  const isCustom = !food || food.custom;
  const name = h('input', { placeholder: 'اسم الطعام أو المشروب', value: food?.name || '' });
  const per100 = h('input', {
    type: 'number', inputmode: 'decimal', placeholder: 'مثلًا 31',
    value: food?.per100 ?? '',
  });
  const pieceG = h('input', {
    type: 'number', inputmode: 'numeric', placeholder: '—', value: food?.piece ?? '',
  });
  const pieceLabel = h('input', { placeholder: 'حبة، كوب، سكوب…', value: food?.pieceLabel || 'حبة' });

  let cat = food?.cat || 'meat';

  const panel = sheet(food ? `تعديل ${food.name}` : 'طعام جديد', h('div', [
    isCustom ? h('div.field', [h('label', 'الاسم'), name]) : h('div.card.tight', h('div.card-t', food.name)),

    h('div.field', [h('label', 'غرام بروتين لكل ١٠٠ غرام'), per100]),

    isCustom ? h('div.grid2', [
      h('div.field', [h('label', 'وزن الحبة/الحصّة (غم)'), pieceG]),
      h('div.field', [h('label', 'اسم الوحدة'), pieceLabel]),
    ]) : null,

    isCustom ? h('div.field', [
      h('label', 'التصنيف'),
      chipGroup(FOOD_CATEGORIES.map((c) => ({ value: c.id, label: `${c.icon} ${c.label}` })), cat, (v) => { cat = v; }),
    ]) : null,

    h('div.grid2', { style: { marginTop: '14px' } }, [
      (food?.edited || food?.custom)
        ? h('button.btn.danger', {
          onclick: () => {
            const p = state.workout.protein;
            if (food.custom) p.customFoods = (p.customFoods || []).filter((f) => f.id !== food.id);
            else delete (p.edits || {})[food.name];
            save(true); emit('workout'); panel.close(); rerender();
            toast(food.custom ? 'حُذف الطعام' : 'رجع الرقم الأصلي', 'ok');
          },
        }, food.custom ? '🗑 حذف' : '↺ الرقم الأصلي')
        : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
      h('button.btn.primary', {
        onclick: () => {
          const v = Number(per100.value);
          const nm = (isCustom ? name.value : food.name).trim();
          if (!nm || !(v >= 0)) { toast('اكتب الاسم وغرامات البروتين', 'err'); return; }
          const p = state.workout.protein;
          p.customFoods = p.customFoods || [];
          p.edits = p.edits || {};

          if (food?.custom) {
            Object.assign(p.customFoods.find((f) => f.id === food.id) || {}, {
              name: nm, per100: v, cat,
              piece: Number(pieceG.value) || null, pieceLabel: pieceLabel.value.trim() || 'حبة',
            });
          } else if (food) {
            p.edits[food.name] = v;               // تعديل رقم في الجدول المرجعي
          } else {
            p.customFoods.unshift({
              id: uid('food_'), name: nm, per100: v, cat,
              piece: Number(pieceG.value) || null, pieceLabel: pieceLabel.value.trim() || 'حبة',
            });
          }
          save(true); emit('workout');
          panel.close(); toast('حُفظ', 'ok'); rerender();
        },
      }, '💾 حفظ'),
    ]),
  ]));
}

/** تعديل إدخال مسجَّل في سجلّ اليوم. */
function openEntryEditor(entry, rerender) {
  const name = h('input', { value: entry.name });
  const grams = h('input', { type: 'number', inputmode: 'decimal', value: entry.grams });

  const panel = sheet('تعديل ما سجّلته', h('div', [
    h('div.field', [h('label', 'الاسم'), name]),
    h('div.field', [h('label', 'غرامات البروتين'), grams]),
    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn.danger', {
        onclick: () => { removeProtein(entry.id); panel.close(); rerender(); },
      }, '🗑 حذف'),
      h('button.btn.primary', {
        onclick: () => {
          const g = Number(grams.value);
          if (!name.value.trim() || !(g >= 0)) { toast('اكتب الاسم والغرامات', 'err'); return; }
          editProtein(entry.id, { name: name.value.trim(), grams: round1(g) });
          panel.close(); toast('حُدِّث', 'ok'); rerender();
        },
      }, '💾 حفظ'),
    ]),
  ]));
}

/** تعديل بند في خطّة اليوم. */
function openPlanEditor(item, rerender) {
  const name = h('input', { value: item.name });
  const grams = h('input', { type: 'number', inputmode: 'decimal', value: item.grams });
  const when = h('input', { value: item.when || '', placeholder: 'الوقت (اختياري)' });

  const panel = sheet('تعديل بند الخطّة', h('div', [
    h('div.field', [h('label', 'الاسم'), name]),
    h('div.field', [h('label', 'غرامات البروتين'), grams]),
    h('div.field', [h('label', 'متى'), when]),
    h('button.btn.primary.block', {
      style: { marginTop: '14px' },
      onclick: () => {
        const g = Number(grams.value);
        if (!name.value.trim() || !(g >= 0)) { toast('اكتب الاسم والغرامات', 'err'); return; }
        Object.assign(item, { name: name.value.trim(), grams: round1(g), when: when.value.trim() });
        save(true); emit('workout');
        panel.close(); toast('حُدِّث', 'ok'); rerender();
      },
    }, '💾 حفظ'),
  ]));
}

function openCustomProtein(rerender) {
  const name = h('input', { placeholder: 'اسم الوجبة أو المشروب' });
  const grams = h('input', { type: 'number', placeholder: 'غرامات البروتين', inputmode: 'decimal' });
  const remember = h('input', { type: 'checkbox' });

  const panel = sheet('إدخال يدوي', h('div', [
    h('div.field', [h('label', 'الاسم'), name]),
    h('div.field', [h('label', 'غرامات البروتين'), grams]),
    h('label.row', { style: { gap: '8px', alignItems: 'center', marginTop: '6px' } },
      [remember, h('span.muted', 'احفظه في قائمتي لاستعماله لاحقًا')]),
    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        const g = Number(grams.value);
        if (!name.value.trim() || !g) { toast('اكتب الاسم والغرامات', 'err'); return; }
        const nm = name.value.trim();
        addProtein({ name: nm, grams: round1(g) });
        if (remember.checked) {
          const p = state.workout.protein;
          p.customFoods = p.customFoods || [];
          // يُحفظ كحصّة وزنها ١٠٠ غم، فيعود بنفس الرقم عند اختياره لاحقًا
          p.customFoods.unshift({
            id: uid('food_'), name: nm, per100: round1(g), cat: 'drink',
            piece: 100, pieceLabel: 'حصّة',
          });
          save(true);
        }
        panel.close(); toast('أُضيف', 'ok'); rerender();
      },
    }, 'أضف'),
  ]));
}

function openPlanAdd(rerender) {
  const name = h('input', { placeholder: 'مثلًا: سكوب واي بعد التمرين' });
  const grams = h('input', { type: 'number', placeholder: 'غرامات', inputmode: 'decimal' });
  const when = h('input', { placeholder: 'الوقت (اختياري): بعد التمرين، قبل النوم…' });

  const addToPlan = (nm, g, whenText = '') => {
    const plans = state.workout.protein.plans;
    plans[activeDay] = plans[activeDay] || [];
    plans[activeDay].push({ id: uid('pl_'), name: nm, grams: round1(g), when: whenText });
    save(true); emit('workout');
  };

  const panel = sheet(`خطّة ${getDay().name}`, h('div', [
    h('button.btn.block', {
      onclick: () => {
        panel.close();
        openFoodPicker(rerender, {
          title: `اختر لخطّة ${getDay().name}`,
          onPick: ({ name: nm, grams: g }) => { addToPlan(nm, g); toast('أُضيف إلى الخطّة', 'ok'); },
        });
      },
    }, '🍽 اختر من قائمة الأطعمة'),
    h('h2.sec', 'أو اكتبه بنفسك'),
    name,
    h('div', { style: { height: '10px' } }), grams,
    h('div', { style: { height: '10px' } }), when,
    h('button.btn.primary.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        const g = Number(grams.value);
        if (!name.value.trim() || !g) { toast('اكتب الاسم والغرامات', 'err'); return; }
        addToPlan(name.value.trim(), g, when.value.trim());
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
