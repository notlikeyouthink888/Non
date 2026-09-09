/** التقويم والمهام — إضافة سريعة، تكرار، تذكير، وعرض شهري. */

import { h, fill, chipGroup } from '../../core/dom.js';
import { AR_DAYS_SHORT, AR_MONTHS, dayKey, fromDayKey, relativeDay } from '../../core/fmt.js';
import { state, save, uid, emit } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { describe, normalize, matches, nextAfter } from './repeat.js';
import { openRepeatEditor } from './repeatUI.js';
import { scheduleReminder, cancelReminder } from './alarms.js';

const PRIORITIES = [
  { value: 'low', label: 'عادية' },
  { value: 'mid', label: 'مهمّة' },
  { value: 'high', label: 'عاجلة' },
];

const TAGS = ['عام', 'دراسة', 'عمل', 'صحة', 'بيت', 'مال', 'اجتماعي'];

export function newTask(patch = {}) {
  return {
    id: uid('tk_'),
    title: '',
    note: '',
    date: dayKey(),
    time: '',            // 'HH:MM' أو فارغ
    done: false,
    priority: 'low',
    tag: 'عام',
    remind: false,
    repeat: normalize(null),
    createdAt: Date.now(),
    ...patch,
  };
}

/** مهام يوم محدّد — بما فيها المتكرّرة التي تقع فيه. */
export function tasksForDay(key) {
  const date = fromDayKey(key);
  return state.time.tasks.filter((t) => {
    if (t.date === key) return true;
    if (t.repeat && t.repeat.type !== 'none' && fromDayKey(t.date) <= date) {
      return matches(t.repeat, date, fromDayKey(t.date).getTime());
    }
    return false;
  }).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    const rank = { high: 0, mid: 1, low: 2 };
    return rank[a.priority] - rank[b.priority];
  });
}

/** حالة الإنجاز ليوم معيّن (المتكرّرة تُسجَّل لكل يوم على حدة). */
export function isTaskDone(task, key) {
  if (task.repeat && task.repeat.type !== 'none') return (task.doneDays || []).includes(key);
  return !!task.done;
}

export function toggleTaskDone(task, key) {
  if (task.repeat && task.repeat.type !== 'none') {
    task.doneDays = task.doneDays || [];
    const i = task.doneDays.indexOf(key);
    if (i >= 0) task.doneDays.splice(i, 1); else task.doneDays.push(key);
  } else {
    task.done = !task.done;
  }
  save();
  emit('tasks');
}

export function saveTask(task) {
  const list = state.time.tasks;
  const i = list.findIndex((t) => t.id === task.id);
  if (i >= 0) list[i] = task; else list.push(task);
  save();
  syncTaskReminder(task);
  emit('tasks');
}

export function removeTask(id) {
  cancelReminder(numericTaskId(id));
  state.time.tasks = state.time.tasks.filter((t) => t.id !== id);
  save();
  emit('tasks');
}

function numericTaskId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 100000 + 200000;
}

function syncTaskReminder(task) {
  const nid = numericTaskId(task.id);
  cancelReminder(nid);
  if (!task.remind || !task.time) return;
  const [hh, mm] = task.time.split(':').map(Number);
  const at = fromDayKey(task.date);
  at.setHours(hh || 0, mm || 0, 0, 0);
  let fireAt = at.getTime();
  if (fireAt <= Date.now() && task.repeat?.type !== 'none') {
    fireAt = nextAfter(task.repeat, fireAt, Date.now());
  }
  if (fireAt > Date.now()) {
    scheduleReminder({ id: nid, at: fireAt, title: task.title, body: task.note || 'مهمّة اليوم' });
  }
}

/* ─────────────────────── الواجهة ─────────────────────── */

export function calendarTab() {
  const root = h('div');
  let cursor = new Date();
  let selected = dayKey();

  function render() {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startPad = (monthStart.getDay() - state.settings.weekStart + 7) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const todayKey = dayKey();

    const cells = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - (startPad - i));
      cells.push({ date: d, other: true });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i), other: false });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, other: true });
    }

    const dows = [];
    for (let i = 0; i < 7; i++) dows.push(AR_DAYS_SHORT[(state.settings.weekStart + i) % 7]);

    const selectedTasks = tasksForDay(selected);

    fill(root, [
      h('div.row.between', { style: { marginBottom: '10px' } }, [
        h('button.btn.icon.ghost', { title: 'الشهر السابق', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); render(); } }, '›'),
        h('div.center', [
          h('b', `${AR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`),
          h('div.muted', { style: { fontSize: '11px' } }, `${state.time.tasks.length} مهمّة محفوظة`),
        ]),
        h('button.btn.icon.ghost', { title: 'الشهر التالي', onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); render(); } }, '‹'),
      ]),

      h('div.cal', [
        ...dows.map((d) => h('div.dow', d)),
        ...cells.map((c) => {
          const key = dayKey(c.date);
          const dayTasks = tasksForDay(key);
          const cls = ['day'];
          if (c.other) cls.push('other');
          if (key === todayKey) cls.push('today');
          if (key === selected) cls.push('sel');
          return h('button.' + cls.join('.'), {
            onclick: () => { haptic(); selected = key; render(); },
          }, [
            String(c.date.getDate()),
            dayTasks.length ? h('div.dots', dayTasks.slice(0, 3).map((t) =>
              h('i' + (isTaskDone(t, key) ? '.done' : '')))) : null,
          ]);
        }),
      ]),

      h('div.row.between', { style: { marginTop: '16px', marginBottom: '8px' } }, [
        h('b', relativeDay(fromDayKey(selected))),
        h('button.btn.sm.primary', { onclick: () => openTaskEditor(newTask({ date: selected }), render) }, '＋ مهمّة'),
      ]),

      selectedTasks.length
        ? h('div.list', selectedTasks.map((t) => taskRow(t, selected, render)))
        : h('div.empty', 'لا مهام في هذا اليوم — أضف واحدة بضغطة.'),
    ]);
  }

  render();
  return root;
}

export function taskRow(task, key, rerender) {
  const done = isTaskDone(task, key);
  return h('div.task' + (done ? '.done' : ''), [
    h('div.p.' + task.priority),
    h('div.box', {
      onclick: () => { haptic(); toggleTaskDone(task, key); rerender?.(); },
    }, done ? '✓' : ''),
    h('div.grow', { onclick: () => openTaskEditor(task, rerender) }, [
      h('div.t', task.title || 'مهمّة'),
      h('div.s', [
        task.time ? `⏰ ${task.time} · ` : '',
        task.tag,
        task.repeat?.type !== 'none' ? ` · 🔁 ${describe(task.repeat)}` : '',
      ].join('')),
      task.note ? h('div.s', { style: { marginTop: '3px' } }, task.note) : null,
    ]),
  ]);
}

export function openTaskEditor(task, onDone) {
  const draft = { ...task, repeat: normalize(task.repeat) };
  const body = h('div');
  const panel = sheet(task.title ? 'تعديل المهمّة' : 'مهمّة جديدة', body);

  function render() {
    fill(body, [
      h('input', {
        placeholder: 'ما الذي تريد إنجازه؟', value: draft.title,
        oninput: (e) => { draft.title = e.target.value; },
      }),

      h('div.row', { style: { marginTop: '10px', gap: '8px' } }, [
        h('input', {
          type: 'date', value: draft.date, class: 'grow',
          onchange: (e) => { draft.date = e.target.value || draft.date; },
        }),
        h('input', {
          type: 'time', value: draft.time, style: { width: '130px' },
          onchange: (e) => { draft.time = e.target.value; render(); },
        }),
      ]),

      h('h2.sec', 'الأولوية'),
      chipGroup(PRIORITIES, draft.priority, (v) => { draft.priority = v; }),

      h('h2.sec', 'التصنيف'),
      chipGroup(TAGS, draft.tag, (v) => { draft.tag = v; }),

      h('h2.sec', 'التكرار'),
      h('div.row.between', [
        h('span.muted', describe(draft.repeat)),
        h('button.btn.sm', {
          onclick: () => openRepeatEditor(draft.repeat, (r) => { draft.repeat = r; render(); },
            fromDayKey(draft.date).getTime()),
        }, 'تعديل'),
      ]),

      h('h2.sec', 'تذكير'),
      h('label.row', { style: { gap: '8px' } }, [
        h('input', {
          type: 'checkbox', checked: draft.remind,
          onchange: (e) => { draft.remind = e.target.checked; },
        }),
        h('span.muted', draft.time ? `نبّهني الساعة ${draft.time}` : 'حدّد وقتًا أولًا لتفعيل التذكير'),
      ]),

      h('h2.sec', 'ملاحظة'),
      h('textarea', {
        placeholder: 'تفاصيل إضافية (اختياري)', value: draft.note,
        oninput: (e) => { draft.note = e.target.value; },
      }),

      h('div.grid2', { style: { marginTop: '14px' } }, [
        h('button.btn.danger', {
          onclick: async () => {
            if (!state.time.tasks.some((t) => t.id === draft.id)) { panel.close(); return; }
            if (!await confirmSheet('حذف المهمّة', `سيُحذف «${draft.title || 'بلا عنوان'}».`)) return;
            removeTask(draft.id);
            panel.close();
            onDone?.();
          },
        }, '🗑 حذف'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.title.trim()) { toast('اكتب عنوان المهمّة', 'err'); return; }
            saveTask(draft);
            panel.close();
            toast('حُفظت المهمّة', 'ok');
            onDone?.();
          },
        }, '💾 حفظ'),
      ]),
    ]);
  }

  render();
}

/** مهام اليوم للعرض في نظرة عامة. */
export function todayTasks() { return tasksForDay(dayKey()); }

/** أقرب المهام القادمة خلال أيام. */
export function upcomingTasks(days = 7) {
  const out = [];
  const start = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    tasksForDay(key).filter((t) => !isTaskDone(t, key)).forEach((t) => out.push({ task: t, key }));
  }
  return out;
}
