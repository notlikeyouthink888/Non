/**
 * قسم Improve — تطوير الذات.
 *
 * ترتيبه كترتيب التمارين: مجالات بدل الأيام، وداخل كل مجال بطاقات بلا حدّ.
 * كل بطاقة تقبل نصًّا وصورًا وفيديو وملاحظة رسم، ولها:
 *   • أسطر «شنو أحتاج»: مبلغ أو غرض أو وقت — اختيارية، وتُجمَع تلقائيًا.
 *   • إنجاز بتأكيد: لا يُحسب «صح» إلا بعد أن تؤكّد، مع دليل اختياري
 *     (ملاحظة أو صورة) ووقت مسجَّل.
 *   • ربط بالتقويم: يُنشئ مهمّة جديدة بتكرارك الذي تختاره ولا يمسّ أي
 *     مهمّة كتبتها من قبل — الاثنتان تظهران معًا في التقويم.
 */

import '../../styles/improve.css';
import { h, fill, empty, chipGroup } from '../../core/dom.js';
import { dayKey, fromDayKey, longDate, addDays, clockOf } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, promptSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { saveMedia, mediaUrl, deleteMedia, pickFile, mediaUsage } from '../../core/media.js';
import { drawButton, drawPreview, deleteDrawing } from '../../core/draw.js';
import { describe, normalize } from '../time/repeat.js';
import { openRepeatEditor } from '../time/repeatUI.js';
import { newTask, saveTask, removeTask, isTaskDone, toggleTaskDone } from '../time/calendar.js';
import { newItem as newExpense, saveItem as saveExpense, money } from '../money/index.js';

/** حدّ أعلى سخيّ للفيديو في هذا القسم — الدروس الطويلة تُحفظ كما هي. */
const MAX_VIDEO = 250 * 1024 * 1024;

const NEED_KINDS = [
  { value: 'money', label: '💵 مبلغ' },
  { value: 'thing', label: '📦 غرض' },
  { value: 'time', label: '⏳ وقت' },
  { value: 'other', label: '📝 غير ذلك' },
];

const ICONS = ['🧠', '💪', '🛠', '🕌', '💼', '🤝', '📚', '🎯', '🎨', '🎧', '💻', '🌱', '🏃', '✍️', '🔬', '🗣'];

const TABS = [
  { id: 'areas', label: 'مجالاتي' },
  { id: 'today', label: 'اليوم' },
  { id: 'progress', label: 'تقدّمي' },
];

let tab = 'areas';
let activeArea = 'a1';

export default {
  id: 'improve',
  label: 'Improve',
  icon: '🚀',

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
        h('div', [h('h1', 'Improve'), h('p', 'أطوّر نفسي — بخطوات أثبت أنّي نفّذتها')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => fill(content, view(tab, render));

    sync();
    render();
    const off = subscribe('improve', render);

    return { setTab: (t) => { tab = t; sync(); render(); }, unmount: off };
  },
};

function view(which, rerender) {
  if (which === 'today') return todayTab(rerender);
  if (which === 'progress') return progressTab(rerender);
  return areasTab(rerender);
}

/* ─────────────────── البيانات ─────────────────── */

const imp = () => state.improve;
export const areaById = (id) => imp().areas.find((a) => a.id === id) || imp().areas[0];
export const itemById = (id) => imp().items.find((i) => i.id === id) || null;
export const itemsOf = (areaId) => imp().items.filter((i) => i.areaId === areaId)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export function newImproveItem(areaId) {
  return {
    id: uid('im_'),
    areaId,
    title: '',
    note: '',
    media: [],
    drawing: null,
    needs: [],
    target: 1,
    calendar: null,          // { taskId, repeat }
    order: imp().items.length,
    createdAt: Date.now(),
  };
}

export function saveItem(item, { silent = false } = {}) {
  const list = imp().items;
  const i = list.findIndex((x) => x.id === item.id);
  const copy = { ...item, media: [...(item.media || [])], needs: [...(item.needs || [])] };
  if (i >= 0) list[i] = copy; else list.push(copy);
  save(true);
  if (!silent) emit('improve');
}

export async function removeItem(id) {
  const item = itemById(id);
  if (!item) return;
  if (item.media?.length) await Promise.all(item.media.map((m) => deleteMedia(m.id)));
  if (item.drawing) await deleteDrawing(item.drawing);
  if (item.calendar?.taskId) removeTask(item.calendar.taskId);
  // احذف أدلّة الإنجاز وصورها
  for (const [k, v] of Object.entries(imp().proofs)) {
    if (k.startsWith(`${id}|`)) {
      if (v.mediaId) await deleteMedia(v.mediaId);
      delete imp().proofs[k];
    }
  }
  Object.keys(imp().log).forEach((day) => {
    imp().log[day] = (imp().log[day] || []).filter((x) => x !== id);
  });
  imp().items = imp().items.filter((x) => x.id !== id);
  save(true);
  emit('improve');
}

export const isDone = (itemId, key = dayKey()) => (imp().log[key] || []).includes(itemId);
export const proofOf = (itemId, key = dayKey()) => imp().proofs[`${itemId}|${key}`] || null;

/** سلسلة الأيام المتتالية المنجَزة حتى اليوم. */
export function streakOf(itemId) {
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const key = dayKey(addDays(new Date(), -i));
    if (isDone(itemId, key)) n++;
    else if (i > 0) break;          // اليوم نفسه قد لا يكون مُنجزًا بعد
  }
  return n;
}

export const doneCount = (itemId) =>
  Object.values(imp().log).reduce((s, arr) => s + (arr.includes(itemId) ? 1 : 0), 0);

/** يسجّل الإنجاز مع دليله، ويعلّم مهمّة التقويم المرتبطة إن وُجدت. */
function markDone(item, { note = '', mediaId = null } = {}, key = dayKey()) {
  const log = imp().log;
  log[key] = log[key] || [];
  if (!log[key].includes(item.id)) log[key].push(item.id);
  imp().proofs[`${item.id}|${key}`] = { at: Date.now(), note, mediaId };

  // المهمّة المرتبطة تُعلَّم منجَزة لهذا اليوم فقط — لا تُحذف ولا تُعدَّل
  const task = item.calendar?.taskId
    ? state.time.tasks.find((t) => t.id === item.calendar.taskId)
    : null;
  if (task && !isTaskDone(task, key)) toggleTaskDone(task, key);

  save(true);
  emit('improve');
  emit('tasks');
}

async function undoDone(item, key = dayKey()) {
  const log = imp().log;
  log[key] = (log[key] || []).filter((x) => x !== item.id);
  const p = imp().proofs[`${item.id}|${key}`];
  if (p?.mediaId) await deleteMedia(p.mediaId);
  delete imp().proofs[`${item.id}|${key}`];
  save(true);
  emit('improve');
}

const needsTotal = (item) => (item.needs || [])
  .filter((n) => n.kind === 'money' && !n.done)
  .reduce((s, n) => s + (Number(n.amount) || 0), 0);

/* ─────────────────── تبويب المجالات ─────────────────── */

function areasTab(rerender) {
  const area = areaById(activeArea);
  const items = itemsOf(area.id);
  const doneToday = items.filter((i) => isDone(i.id)).length;

  return h('div', [
    h('div.imp-areas', imp().areas.map((a) => {
      const n = itemsOf(a.id).length;
      return h('button.imp-area' + (a.id === activeArea ? '.on' : ''), {
        onclick: () => { activeArea = a.id; haptic(); rerender(); },
      }, [
        h('span.ic', a.icon || '📌'),
        h('span.nm.ellipsis', a.name),
        h('small', n ? `${n}` : '—'),
      ]);
    })),

    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `${area.icon || ''} ${area.name}`),
          h('div.card-s', items.length
            ? `${items.length} خطوة · أُنجز اليوم ${doneToday}`
            : 'لا خطوات بعد — أضف أوّل خطوة'),
        ]),
        h('button.btn.sm', { onclick: () => editArea(area, rerender) }, '✎'),
      ]),
      items.length ? h('div.bar', { style: { marginTop: '10px' } },
        h('i', { style: { width: `${Math.round((doneToday / items.length) * 100)}%` } })) : null,
    ]),

    items.length
      ? h('div.list', { style: { marginTop: '12px' } }, items.map((it) => itemRow(it, rerender)))
      : h('div', { style: { marginTop: '16px' } }, empty('📈', 'ابدأ بخطوة واحدة تطوّر فيها نفسك')),

    h('button.btn.primary.block', {
      style: { marginTop: '14px' },
      onclick: () => openItemEditor(newImproveItem(area.id), rerender),
    }, '＋ خطوة جديدة'),

    h('button.btn.ghost.block', {
      style: { marginTop: '8px' },
      onclick: () => addArea(rerender),
    }, '＋ مجال جديد'),
  ]);
}

function itemRow(item, rerender) {
  const done = isDone(item.id);
  const media = item.media || [];
  const streak = streakOf(item.id);
  const need = needsTotal(item);

  const thumb = h('div.thumb', media.length ? '' : (areaById(item.areaId).icon || '📌'));
  if (media.length) {
    mediaUrl(media[0].id).then((url) => {
      if (!url) return;
      fill(thumb, media[0].type === 'video'
        ? h('video', { src: url, muted: true, playsinline: true })
        : h('img', { src: url, alt: '' }));
    });
  }

  return h('div.imp-item' + (done ? '.done' : ''), [
    h('button.check', {
      title: done ? 'أُنجز اليوم' : 'علّمه منجَزًا',
      onclick: (e) => { e.stopPropagation(); confirmDone(item, rerender); },
    }, done ? '✓' : ''),

    h('div.grow', { onclick: () => openItemView(item, rerender) }, [
      h('div.t.ellipsis', item.title || 'خطوة'),
      h('div.s.ellipsis', [
        streak > 1 ? `🔥 ${streak} يوم` : null,
        media.length ? `${media.length} ملف` : null,
        item.calendar?.taskId ? `🗓 ${describe(item.calendar.repeat)}` : null,
        need ? `يحتاج ${money(need)}` : null,
        item.note && !media.length ? item.note : null,
      ].filter(Boolean).join(' · ') || 'اضغط للتفاصيل'),
    ]),

    thumb,
  ]);
}

/* ─────────────────── تأكيد الإنجاز ─────────────────── */

/**
 * لا تُعلَّم الخطوة «صح» بضغطة عابرة: تُفتح ورقة تأكيد تسألك هل نفّذتها فعلًا،
 * وتتيح لك إرفاق دليل (ملاحظة أو صورة) يُحفظ مع وقت التنفيذ.
 */
function confirmDone(item, rerender) {
  const key = dayKey();

  if (isDone(item.id, key)) {
    const p = proofOf(item.id, key);
    const body = h('div', [
      h('div.card.glow', [
        h('div.card-t', '✓ نفّذتها اليوم'),
        h('div.card-s', p?.at ? `سُجّلت الساعة ${clockOf(new Date(p.at), state.settings.hour12)}` : ''),
      ]),
      p?.note ? h('p', { style: { marginTop: '10px', whiteSpace: 'pre-wrap' } }, p.note) : null,
      proofImage(p),
      h('button.btn.danger.block', {
        style: { marginTop: '14px' },
        onclick: async () => {
          if (!await confirmSheet('تراجع عن الإنجاز', 'سيُحذف تسجيل اليوم ودليله.')) return;
          await undoDone(item, key);
          panel.close(); rerender();
        },
      }, '↺ تراجع عن إنجاز اليوم'),
    ]);
    const panel = sheet(item.title || 'خطوة', body);
    return;
  }

  let proofMedia = null;
  const noteEl = h('textarea', { placeholder: 'شنو سوّيت بالضبط؟ (اختياري لكنه يفيدك لاحقًا)' });
  const shot = h('div');

  const renderShot = () => fill(shot, proofMedia
    ? [h('div.imp-proof', [
      (() => {
        const box = h('div.media-full');
        mediaUrl(proofMedia.id).then((url) => {
          if (url) fill(box, h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '12px', display: 'block' } }));
        });
        return box;
      })(),
      h('button.btn.sm.ghost', {
        onclick: async () => { await deleteMedia(proofMedia.id); proofMedia = null; renderShot(); },
      }, '✕ احذف الصورة'),
    ])]
    : [h('div.grid2', [
      h('button.btn.sm', { onclick: () => pickProof(false) }, '🖼 صورة دليل'),
      h('button.btn.sm', { onclick: () => pickProof(true) }, '📷 صوّرها الآن'),
    ])]);

  async function pickProof(camera) {
    const file = await pickFile('image', { camera });
    if (!file) return;
    try {
      proofMedia = await saveMedia(file);
      renderShot();
    } catch (err) { toast(err.message || 'تعذّر حفظ الصورة', 'err'); }
  }

  const body = h('div', [
    h('div.card.tight', [
      h('div.card-t', item.title || 'خطوة'),
      h('div.card-s', 'أكّد أنّك نفّذتها فعلًا — هذا التأكيد هو ما يجعل السجلّ صادقًا.'),
    ]),
    h('h2.sec', 'ماذا فعلت؟'),
    noteEl,
    h('h2.sec', 'دليل (اختياري)'),
    shot,
    h('div.grid2', { style: { marginTop: '16px' } }, [
      h('button.btn.ghost', { onclick: () => panel.close() }, 'ليس بعد'),
      h('button.btn.ok', {
        onclick: () => {
          if (imp().requireProof && !noteEl.value.trim() && !proofMedia) {
            toast('اكتب سطرًا أو أرفق صورة لتأكيد التنفيذ', 'err');
            return;
          }
          markDone(item, { note: noteEl.value.trim(), mediaId: proofMedia?.id || null }, key);
          panel.close();
          haptic(24);
          toast('سُجّل — أحسنت 💪', 'ok');
          rerender();
        },
      }, '✓ نعم، نفّذتها'),
    ]),
  ]);

  const panel = sheet('تأكيد التنفيذ', body);
  renderShot();
}

function proofImage(p) {
  if (!p?.mediaId) return null;
  const box = h('div.media-full', { style: { marginTop: '10px' } });
  mediaUrl(p.mediaId).then((url) => {
    if (url) fill(box, h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '12px', display: 'block' } }));
  });
  return box;
}

/* ─────────────────── عرض الخطوة ─────────────────── */

function openItemView(item, rerender) {
  const body = h('div');
  const panel = sheet(item.title || 'خطوة', body);
  const done = isDone(item.id);
  const need = needsTotal(item);

  fill(body, [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', areaById(item.areaId).name),
      streakOf(item.id) > 1 ? h('span.badge.ok', `🔥 ${streakOf(item.id)} يوم متتالٍ`) : null,
      h('span.badge', `أُنجزت ${doneCount(item.id)} مرّة`),
      item.calendar?.taskId ? h('span.badge', `🗓 ${describe(item.calendar.repeat)}`) : null,
    ]),

    item.note ? h('p', { style: { marginTop: '12px', whiteSpace: 'pre-wrap' } }, item.note) : null,

    ...(item.media || []).map((m) => {
      const box = h('div.media-full', { style: { minHeight: '60px', marginTop: '10px' } });
      mediaUrl(m.id).then((url) => {
        if (!url) { fill(box, h('div.muted.center', 'تعذّر فتح الملف')); return; }
        fill(box, m.type === 'video'
          ? h('video', { src: url, controls: true, playsinline: true, style: { width: '100%', borderRadius: '14px' } })
          : h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '14px', display: 'block' } }));
      });
      return box;
    }),

    item.drawing ? drawPreview(item.drawing, { title: item.title || 'خطوة' }) : null,

    (item.needs || []).length ? h('div', [
      h('h2.sec', `أحتاج (${item.needs.length})`),
      h('div.list', item.needs.map((n) => h('div.imp-need' + (n.done ? '.done' : ''), [
        h('button.check', {
          onclick: () => { n.done = !n.done; saveItem(item); rerender(); panel.close(); openItemView(itemById(item.id), rerender); },
        }, n.done ? '✓' : ''),
        h('div.grow', [
          h('div', n.text),
          h('div.u', NEED_KINDS.find((k) => k.value === n.kind)?.label || ''),
        ]),
        n.kind === 'money' && n.amount ? h('b.g', money(n.amount)) : null,
      ]))),
      need ? h('div.card.tight', { style: { marginTop: '8px' } }, [
        h('div.row.between', [h('span.muted', 'المتبقّي المطلوب'), h('b', money(need))]),
        h('button.btn.sm.block', {
          style: { marginTop: '8px' },
          onclick: () => {
            const e = newExpense({ name: item.title || 'خطوة تطوير', price: need, category: 'تطوير', note: 'من قسم Improve' });
            saveExpense(e);
            toast('أُضيف إلى المصاريف', 'ok');
          },
        }, '💰 أضفه إلى المصاريف'),
      ]) : null,
    ]) : null,

    h('div.grid2', { style: { marginTop: '16px' } }, [
      h('button.btn' + (done ? '.ok' : '.primary'), {
        onclick: () => { panel.close(); confirmDone(item, rerender); },
      }, done ? '✓ أُنجزت اليوم' : '✓ نفّذتها الآن'),
      h('button.btn', { onclick: () => { panel.close(); openItemEditor(item, rerender); } }, '✎ تعديل'),
    ]),
  ]);
}

/* ─────────────────── محرّر الخطوة ─────────────────── */

/**
 * حقول الكتابة تُنشأ مرّة واحدة ولا يُعاد بناؤها عند إضافة ملف أو رسم،
 * فلا تنقطع كتابة لوحة المفاتيح العربية في منتصف الكلمة.
 */
function openItemEditor(item, rerender) {
  const exists = !!itemById(item.id);
  const draft = { ...item, media: [...(item.media || [])], needs: [...(item.needs || [])] };

  const titleEl = h('input', {
    placeholder: 'ما الخطوة؟ مثلًا: أقرأ ٢٠ صفحة', value: draft.title,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
  });
  const noteEl = h('textarea', { placeholder: 'تفاصيل، طريقة، أو لماذا تفعلها…', value: draft.note });

  const mediaHead = h('h2.sec', '');
  const mediaBox = h('div');
  const drawBox = h('div');
  const needsBox = h('div');
  const calBox = h('div');
  const hint = h('div.muted.center', { style: { fontSize: '11px', marginTop: '8px', minHeight: '14px' } }, '');

  function readDraft() {
    draft.title = titleEl.value;
    draft.note = noteEl.value;
    return draft;
  }
  const hasContent = () => !!(draft.title.trim() || draft.note.trim() || draft.media.length || draft.drawing);

  let autoTimer = null;
  function autoSave() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      readDraft();
      if (!hasContent()) return;
      saveItem(draft, { silent: true });
      hint.textContent = '✓ حُفظ تلقائيًا';
    }, 900);
  }

  [titleEl, noteEl].forEach((el) => {
    el.addEventListener('input', () => { hint.textContent = ''; autoSave(); });
    el.addEventListener('change', () => { readDraft(); autoSave(); });
    el.addEventListener('blur', () => { readDraft(); if (hasContent()) saveItem(draft, { silent: true }); });
  });

  function renderMedia() {
    mediaHead.textContent = `صور وفيديو (${draft.media.length})`;
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
          if (hasContent()) saveItem(draft, { silent: true });
          renderMedia();
        },
      }, '✕'));
      return box;
    }))] : [h('div.muted', 'لا ملفات بعد — أضف صورة أو فيديو يشرح الخطوة.')]);
  }

  function renderDraw() {
    fill(drawBox, [
      drawPreview(draft.drawing, { title: draft.title || 'خطوة' }),
      drawButton({
        id: draft.drawing,
        title: draft.title || 'خطوة',
        onChange: (id) => {
          draft.drawing = id;
          readDraft();
          if (hasContent()) saveItem(draft, { silent: true });
          renderDraw();
        },
      }),
    ]);
  }

  function renderNeeds() {
    fill(needsBox, [
      draft.needs.length
        ? h('div.list', draft.needs.map((n) => h('div.imp-need', [
          h('div.grow', [
            h('div', n.text),
            h('div.u', [
              NEED_KINDS.find((k) => k.value === n.kind)?.label,
              n.kind === 'money' && n.amount ? money(n.amount) : null,
            ].filter(Boolean).join(' · ')),
          ]),
          h('button.btn.sm.ghost', {
            onclick: () => {
              draft.needs = draft.needs.filter((x) => x.id !== n.id);
              saveItem(readDraft(), { silent: true });
              renderNeeds();
            },
          }, '✕'),
        ])))
        : h('div.muted', 'اختياري: اكتب ما تحتاجه لتنفيذها — مبلغ، غرض، وقت.'),
      h('button.btn.block', { style: { marginTop: '8px' }, onclick: addNeed }, '＋ أضف سطر «أحتاج»'),
    ]);
  }

  function addNeed() {
    const text = h('input', { placeholder: 'مثلًا: اشتراك دورة، دفتر، ساعة يوميًا' });
    const amount = h('input', { type: 'number', inputmode: 'numeric', placeholder: 'المبلغ (إن كان مبلغًا)' });
    let kind = 'money';
    const panel2 = sheet('ماذا أحتاج؟', h('div', [
      h('div.field', [h('label', 'ما هو؟'), text]),
      h('div.field', [h('label', 'النوع'), chipGroup(NEED_KINDS, kind, (v) => { kind = v; })]),
      h('div.field', [h('label', 'المبلغ (اختياري)'), amount]),
      h('button.btn.primary.block', {
        style: { marginTop: '12px' },
        onclick: () => {
          if (!text.value.trim()) { toast('اكتب ما تحتاجه', 'err'); return; }
          draft.needs.push({
            id: uid('nd_'), text: text.value.trim(), kind,
            amount: Number(amount.value) || 0, done: false,
          });
          readDraft();
          if (hasContent()) saveItem(draft, { silent: true });
          renderNeeds();
          panel2.close();
        },
      }, 'أضف'),
    ]));
  }

  function renderCal() {
    const linked = !!draft.calendar?.taskId;
    fill(calBox, [
      h('div.card.tight', [
        h('div.card-t', linked ? `🗓 في التقويم — ${describe(draft.calendar.repeat)}` : '🗓 غير مرتبطة بالتقويم'),
        h('div.card-s', linked
          ? 'تظهر في التقويم مع مهامك الأخرى، ولا تمسّ أيًّا منها.'
          : 'يمكنك وضعها في التقويم بتكرار تختاره — تُضاف مهمّة جديدة فقط.'),
      ]),
      h('button.btn.block', { style: { marginTop: '8px' }, onclick: () => openCalendarLink(draft, renderCal) },
        linked ? '✎ عدّل موعدها وتكرارها' : '🗓 ضعها في التقويم'),
      linked ? h('button.btn.ghost.block', {
        style: { marginTop: '8px' },
        onclick: async () => {
          if (!await confirmSheet('فكّ الربط', 'ستُحذف المهمّة التي أنشأها هذا القسم فقط.')) return;
          removeTask(draft.calendar.taskId);
          draft.calendar = null;
          saveItem(readDraft(), { silent: true });
          renderCal();
          toast('فُكّ الربط', 'ok');
        },
      }, '✕ أخرجها من التقويم') : null,
    ]);
  }

  const body = h('div', [
    titleEl,
    h('h2.sec', 'الشرح'),
    noteEl,

    mediaHead,
    mediaBox,
    h('div.grid3', { style: { marginTop: '10px' } }, [
      h('button.btn.sm', { onclick: () => attach('image', false) }, '🖼 صورة'),
      h('button.btn.sm', { onclick: () => attach('image', true) }, '📷 كاميرا'),
      h('button.btn.sm', { onclick: () => attach('video', false) }, '🎬 فيديو'),
    ]),

    h('h2.sec', 'ملاحظة رسم'),
    drawBox,

    h('h2.sec', 'شنو أحتاج لتنفيذها؟'),
    needsBox,

    h('h2.sec', 'التقويم'),
    calBox,

    h('div.grid2', { style: { marginTop: '16px' } }, [
      exists
        ? h('button.btn.danger', {
          onclick: async () => {
            if (!await confirmSheet('حذف الخطوة', `سيُحذف «${draft.title || 'بلا عنوان'}» مع ملفاته وسجلّه.`)) return;
            clearTimeout(autoTimer);
            await removeItem(draft.id);
            panel.close(); rerender();
          },
        }, '🗑 حذف')
        : h('button.btn.ghost', {
          onclick: async () => {
            clearTimeout(autoTimer);
            if (itemById(draft.id)) { await removeItem(draft.id); rerender(); }
            panel.close();
          },
        }, 'إلغاء'),
      h('button.btn.primary', {
        onclick: () => {
          clearTimeout(autoTimer);
          readDraft();
          if (!draft.title.trim()) { toast('اكتب عنوان الخطوة', 'err'); return; }
          saveItem(draft);
          panel.close();
          toast('حُفظت', 'ok');
          rerender();
        },
      }, '💾 حفظ'),
    ]),
    hint,
  ]);

  const panel = sheet(exists ? 'تعديل الخطوة' : 'خطوة جديدة', body);

  async function attach(kind, camera) {
    readDraft();
    if (hasContent()) saveItem(draft, { silent: true });
    const file = await pickFile(kind, { camera });
    if (!file) return;
    toast('جارٍ الحفظ…');
    try {
      const m = await saveMedia(file, { maxBytes: MAX_VIDEO });
      if (!m) return;
      draft.media.push(m);
      readDraft();
      saveItem(draft, { silent: true });
      renderMedia();
      toast('أُضيف الملف', 'ok');
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الملف', 'err');
    }
  }

  renderMedia();
  renderDraw();
  renderNeeds();
  renderCal();
}

/* ─────────────────── ربط التقويم ─────────────────── */

/**
 * يكتب في التقويم ولا يعدّل عليه: إن لم تكن الخطوة مرتبطة بعد تُنشأ مهمّة
 * جديدة تحمل معرّف الخطوة، وإن كانت مرتبطة يُعدَّل موعد تلك المهمّة وحدها.
 * أي مهمّة كتبتها أنت من قبل تبقى كما هي وتُعرض جنبًا إلى جنب.
 */
function openCalendarLink(item, onDone) {
  const existing = item.calendar?.taskId
    ? state.time.tasks.find((t) => t.id === item.calendar.taskId)
    : null;

  const draft = {
    date: existing?.date || dayKey(),
    time: existing?.time || '',
    remind: existing?.remind ?? false,
    repeat: normalize(existing?.repeat || item.calendar?.repeat || null),
  };

  const body = h('div');
  const panel = sheet('ضعها في التقويم', body);

  function render() {
    fill(body, [
      h('div.card.tight', h('div.card-s',
        'تُضاف مهمّة جديدة باسم الخطوة. مهامك القديمة لا تتغيّر، وكلّها تظهر معًا في التقويم.')),

      h('h2.sec', 'متى تبدأ؟'),
      h('div.row', { style: { gap: '8px' } }, [
        h('input', {
          type: 'date', value: draft.date, class: 'grow',
          onchange: (e) => { draft.date = e.target.value || draft.date; },
        }),
        h('input', {
          type: 'time', value: draft.time, style: { width: '130px' },
          onchange: (e) => { draft.time = e.target.value; render(); },
        }),
      ]),

      h('h2.sec', 'التكرار'),
      h('div.row.between', [
        h('span.muted', describe(draft.repeat)),
        h('button.btn.sm', {
          onclick: () => openRepeatEditor(draft.repeat, (r) => { draft.repeat = r; render(); },
            fromDayKey(draft.date).getTime()),
        }, 'تعديل'),
      ]),
      h('div.chips', { style: { marginTop: '8px' } }, [
        { label: 'كل يوم', rule: { type: 'daily' } },
        { label: 'كل يومين', rule: { type: 'everyN', interval: 2 } },
        { label: 'كل ٣ أيام', rule: { type: 'everyN', interval: 3 } },
        { label: 'أسبوعيًا', rule: { type: 'weekly', days: [fromDayKey(draft.date).getDay()] } },
        { label: 'مرّة واحدة', rule: { type: 'none' } },
      ].map((q) => h('button.chip', {
        onclick: () => { draft.repeat = normalize({ ...q.rule, anchor: fromDayKey(draft.date).getTime() }); render(); },
      }, q.label))),

      h('h2.sec', 'تذكير'),
      h('label.row', { style: { gap: '8px' } }, [
        h('input', {
          type: 'checkbox', checked: draft.remind,
          onchange: (e) => { draft.remind = e.target.checked; },
        }),
        h('span.muted', draft.time ? `نبّهني الساعة ${draft.time}` : 'حدّد وقتًا أولًا لتفعيل التذكير'),
      ]),

      h('button.btn.primary.block', {
        style: { marginTop: '16px' },
        onclick: () => {
          const task = existing
            ? { ...existing, date: draft.date, time: draft.time, remind: draft.remind, repeat: draft.repeat }
            : newTask({
              title: item.title || 'خطوة تطوير',
              note: item.note || '',
              date: draft.date,
              time: draft.time,
              remind: draft.remind,
              repeat: draft.repeat,
              tag: 'عام',
              source: 'improve',
              improveId: item.id,
            });
          saveTask(task);
          item.calendar = { taskId: task.id, repeat: draft.repeat };
          saveItem(item, { silent: true });
          panel.close();
          toast('صارت في التقويم', 'ok');
          onDone?.();
        },
      }, existing ? '💾 حدّث الموعد' : '🗓 أضفها إلى التقويم'),
    ]);
  }

  render();
}

/* ─────────────────── المجالات ─────────────────── */

function editArea(area, rerender) {
  const nameEl = h('input', { value: area.name, placeholder: 'اسم المجال' });
  let icon = area.icon || '📌';

  const panel = sheet('المجال', h('div', [
    h('div.field', [h('label', 'الاسم'), nameEl]),
    h('div.field', [h('label', 'الرمز'), chipGroup(ICONS.map((i) => ({ value: i, label: i })), icon, (v) => { icon = v; })]),
    h('div.grid2', { style: { marginTop: '14px' } }, [
      imp().areas.length > 1
        ? h('button.btn.danger', {
          onclick: async () => {
            const n = itemsOf(area.id).length;
            if (!await confirmSheet('حذف المجال', n ? `سيُحذف المجال و${n} خطوة فيه.` : 'سيُحذف هذا المجال.')) return;
            for (const it of itemsOf(area.id)) await removeItem(it.id);
            imp().areas = imp().areas.filter((a) => a.id !== area.id);
            activeArea = imp().areas[0]?.id;
            save(true); emit('improve');
            panel.close(); rerender();
          },
        }, '🗑 حذف')
        : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
      h('button.btn.primary', {
        onclick: () => {
          area.name = nameEl.value.trim() || area.name;
          area.icon = icon;
          save(true); emit('improve');
          panel.close(); rerender();
        },
      }, '💾 حفظ'),
    ]),
  ]));
}

async function addArea(rerender) {
  const name = await promptSheet('مجال جديد', { placeholder: 'مثلًا: اللغة الإنجليزية', okText: 'أضف' });
  if (!name) return;
  imp().areas.push({ id: uid('ar_'), name, icon: '📌' });
  activeArea = imp().areas[imp().areas.length - 1].id;
  save(true); emit('improve');
  rerender();
}

/* ─────────────────── تبويب اليوم ─────────────────── */

function todayTab(rerender) {
  const key = dayKey();
  const all = imp().items;
  const due = all.filter((i) => !isDone(i.id, key));
  const done = all.filter((i) => isDone(i.id, key));
  const pct = all.length ? Math.round((done.length / all.length) * 100) : 0;

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', longDate(new Date())),
          h('div.card-s', all.length ? `أنجزت ${done.length} من ${all.length}` : 'أضف خطوة أولى من تبويب «مجالاتي»'),
        ]),
        h('b', { style: { fontSize: '22px' } }, `${pct}%`),
      ]),
      h('div.bar', { style: { marginTop: '10px' } }, h('i', { style: { width: `${pct}%` } })),
    ]),

    h('h2.sec', `عليّ اليوم (${due.length})`),
    due.length
      ? h('div.list', due.map((it) => itemRow(it, rerender)))
      : h('div.muted', all.length ? 'أنجزت كل شيء اليوم 🎉' : 'لا خطوات بعد.'),

    done.length ? h('div', [
      h('h2.sec', `أنجزته اليوم (${done.length})`),
      h('div.list', done.map((it) => {
        const p = proofOf(it.id, key);
        return h('div.imp-item.done', [
          h('button.check', { onclick: () => confirmDone(it, rerender) }, '✓'),
          h('div.grow', { onclick: () => confirmDone(it, rerender) }, [
            h('div.t.ellipsis', it.title || 'خطوة'),
            h('div.s.ellipsis', [
              p?.at ? clockOf(new Date(p.at), state.settings.hour12) : null,
              p?.note || (p?.mediaId ? 'مع صورة' : null),
            ].filter(Boolean).join(' · ')),
          ]),
        ]);
      })),
    ]) : null,
  ]);
}

/* ─────────────────── تبويب التقدّم ─────────────────── */

function progressTab() {
  const days = [];
  for (let i = 0; i < 21; i++) {
    const d = addDays(new Date(), -i);
    const key = dayKey(d);
    days.push({ key, d, ids: imp().log[key] || [] });
  }

  const total = Object.values(imp().log).reduce((s, a) => s + a.length, 0);
  const best = imp().items
    .map((i) => ({ i, n: doneCount(i.id), s: streakOf(i.id) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);

  const usage = h('div.muted', 'جارٍ الحساب…');
  mediaUsage().then(({ count, bytes }) => {
    usage.textContent = `${count} ملف · ${(bytes / 1048576).toFixed(1)} م.ب داخل الجهاز`;
  });

  return h('div', [
    h('div.grid2', [
      stat('مرّات نفّذتها', String(total)),
      stat('خطوات نشطة', String(imp().items.length)),
    ]),

    h('h2.sec', 'آخر ثلاثة أسابيع'),
    h('div.imp-heat', days.slice().reverse().map((d) => {
      const n = d.ids.length;
      const lvl = n === 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : 3;
      return h(`div.cell.l${lvl}`, { title: `${longDate(fromDayKey(d.key))} — ${n}` }, String(d.d.getDate()));
    })),

    best.length ? h('div', [
      h('h2.sec', 'الأكثر التزامًا'),
      h('div.list', best.map(({ i, n, s }) => h('div.card.tight', [
        h('div.row.between', [
          h('div', { style: { minWidth: '0' } }, [
            h('div.card-t.ellipsis', i.title || 'خطوة'),
            h('div.card-s', areaById(i.areaId).name),
          ]),
          h('div.row', { style: { gap: '6px' } }, [
            s > 1 ? h('span.badge.ok', `🔥 ${s}`) : null,
            h('span.badge', `${n}`),
          ]),
        ]),
      ]))),
    ]) : null,

    h('h2.sec', 'سجلّ الأيام'),
    h('div.list', days.filter((d) => d.ids.length).slice(0, 10).map((d) => h('div.card.tight', [
      h('div.card-t', longDate(fromDayKey(d.key))),
      h('div.card-s', d.ids.map((id) => itemById(id)?.title || '—').join(' · ')),
    ]))),

    h('h2.sec', 'مساحة الملفات'),
    h('div.card.tight', [usage, h('div.card-s', { style: { marginTop: '6px' } },
      'الصور تُصغَّر تلقائيًا، والفيديو يُحفظ كما هو حتى ٢٥٠ م.ب للملف.')]),

    h('h2.sec', 'الإعداد'),
    h('div.card.tight', [
      h('label.row', { style: { gap: '8px', alignItems: 'center' } }, [
        h('input', {
          type: 'checkbox', checked: imp().requireProof,
          onchange: (e) => { imp().requireProof = e.target.checked; save(true); },
        }),
        h('span.muted', 'لا تقبل «صح» بلا سطر أو صورة تُثبت التنفيذ'),
      ]),
    ]),
  ]);
}

function stat(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '21px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}
