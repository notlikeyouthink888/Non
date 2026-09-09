/** القسم الثاني: الوقت — نظرة عامة، مؤقّت، منبّهات، تقويم، نوم، ملخّص. */

import '../../styles/time.css';
import { h, fill, empty, settingRow, toggle as toggleSwitch, chipGroup } from '../../core/dom.js';
import { clock, durMin, untilText, longDate, dayKey, pad } from '../../core/fmt.js';
import { state, save, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { usageStats } from '../../core/usage.js';
import { allTracks } from '../music/library.js';
import { timerTab, timerActive, timerRemaining, fmtCountdown } from './timer.js';
import { calendarTab, todayTasks, upcomingTasks, taskRow, openTaskEditor, newTask, isTaskDone } from './calendar.js';
import {
  newAlarm, saveAlarm, removeAlarm, toggleAlarm, nextFire, upcomingAlarm, describeAlarm,
} from './alarms.js';
import { describe, normalize } from './repeat.js';
import { openRepeatEditor } from './repeatUI.js';
import { bedtimesFor, wakeTimesIfSleepingNow, recommendedBedtime, sleepAdvice, SLEEP_TIPS } from './sleep.js';
import { liveSummary, summaryHistory, showSummarySheet, summaryCard } from './summary.js';

const TABS = [
  { id: 'overview', label: 'نظرة' },
  { id: 'timer', label: 'المؤقّت' },
  { id: 'alarms', label: 'المنبّهات' },
  { id: 'calendar', label: 'التقويم' },
  { id: 'sleep', label: 'النوم' },
  { id: 'day', label: 'يومي' },
];

let tab = 'overview';

export default {
  id: 'time',
  label: 'الوقت',
  icon: '⏰',

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
        h('div', [h('h1', 'وقتك'), h('p', 'مؤقّت، منبّهات، تقويم، ونوم منظّم')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    function sync() {
      [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    }

    function render() {
      fill(content, view(tab, render));
    }

    sync();
    render();

    const offs = [subscribe('alarms', render), subscribe('tasks', render), subscribe('timer', () => {
      if (tab === 'overview') render();
    })];

    return {
      setTab: (t) => { tab = t; sync(); render(); },
      unmount: () => offs.forEach((f) => f?.()),
    };
  },
};

function view(which, rerender) {
  if (which === 'overview') return overview(rerender);
  if (which === 'timer') return timerTab();
  if (which === 'alarms') return alarmsTab(rerender);
  if (which === 'calendar') return calendarTab();
  if (which === 'sleep') return sleepTab(rerender);
  if (which === 'day') return dayTab();
  return null;
}

/* ─────────────────────── نظرة عامة ─────────────────────── */

function overview(rerender) {
  const now = new Date();
  const up = upcomingAlarm();
  const tasks = todayTasks();
  const pending = tasks.filter((t) => !isTaskDone(t, dayKey()));
  const usage = usageStats();
  const advice = sleepAdvice(now);
  const bed = recommendedBedtime();

  return h('div', [
    h('div.card.glow', [
      h('div.big-clock', clock(now.getHours(), now.getMinutes(), state.settings.hour12)),
      h('div.center.muted', longDate(now)),
    ]),

    timerActive() ? h('div.card', { onclick: () => { tab = 'timer'; rerender(); } }, [
      h('div.row.between', [
        h('div', [h('div.card-t', '⏳ مؤقّت يعمل'), h('div.card-s', state.time.running.label)]),
        h('b.mono', { style: { fontSize: '20px' } }, fmtCountdown(timerRemaining())),
      ]),
    ]) : null,

    h('div.card', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', up ? `⏰ ${up.alarm.label}` : '⏰ لا منبّه قادم'),
          h('div.card-s', up
            ? `${clock(up.alarm.hour, up.alarm.minute, state.settings.hour12)} · ${untilText(up.at - Date.now())}`
            : 'أضف منبّهًا ليوقظك في وقته بالضبط'),
        ]),
        h('button.btn.sm', { onclick: () => { tab = 'alarms'; rerender(); } }, up ? 'إدارة' : '＋ منبّه'),
      ]),
    ]),

    h('div.card', [
      h('div.row.between', { style: { marginBottom: '8px' } }, [
        h('div.card-t', `📋 مهام اليوم (${pending.length} متبقية)`),
        h('button.btn.sm', { onclick: () => openTaskEditor(newTask(), rerender) }, '＋'),
      ]),
      tasks.length
        ? h('div.list', tasks.slice(0, 4).map((t) => taskRow(t, dayKey(), rerender)))
        : h('div.muted', 'لا مهام اليوم — يوم خفيف أو فرصة لتخطيط شيء.'),
    ]),

    advice ? h('div.card', [
      h('div.card-t', '🌙 نومك'),
      h('div.card-s', advice.text),
      bed ? h('div.row', { style: { marginTop: '8px' } }, [
        h('span.badge.accent', `نوم ${clock(bed.hour, bed.minute, state.settings.hour12)}`),
        h('span.badge', `استيقاظ ${clock(state.time.sleep.wakeHour, state.time.sleep.wakeMinute, state.settings.hour12)}`),
      ]) : null,
    ]) : null,

    h('div.card', [
      h('div.row.between', [
        h('div.card-t', '📱 استخدامك اليوم'),
        h('b.mono', usage.text),
      ]),
      h('div.bar', { style: { marginTop: '8px' } }, h('i', {
        style: { width: `${Math.round(usage.ratio * 100)}%`, background: usage.over ? 'var(--danger)' : undefined },
      })),
      h('div.card-s', { style: { marginTop: '6px' } },
        usage.over
          ? `تجاوزت حدّك اليومي (${durMin(usage.limit)}). أغلق التطبيق وخذ استراحة.`
          : `حدّك اليومي ${durMin(usage.limit)} · فُتح ${usage.opens} مرّة`),
    ]),
  ]);
}

/* ─────────────────────── المنبّهات ─────────────────────── */

function alarmsTab(rerender) {
  const alarms = [...state.time.alarms].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

  return h('div', [
    h('button.btn.primary.block', { onclick: () => openAlarmEditor(newAlarm(), rerender) }, '＋ منبّه جديد'),

    alarms.length ? h('div.list', { style: { marginTop: '14px' } }, alarms.map((a) => {
      const at = nextFire(a);
      return h('div.item', [
        h('div.grow', { onclick: () => openAlarmEditor(a, rerender) }, [
          h('div', { style: { fontSize: '24px', fontWeight: '600', direction: 'ltr' } },
            clock(a.hour, a.minute, state.settings.hour12)),
          h('div.s', `${a.label} · ${describe(a.repeat)}`),
          a.enabled && at ? h('div.s', { style: { color: 'var(--accent)' } }, untilText(at - Date.now())) : null,
        ]),
        toggleSwitch(a.enabled, (on) => { toggleAlarm(a.id, on); rerender(); }),
      ]);
    })) : h('div', { style: { marginTop: '14px' } }, empty('⏰', 'لا منبّهات بعد')),

    state.time.alarms.length ? h('button.btn.ghost.block', {
      style: { marginTop: '14px' },
      onclick: async () => {
        if (!await confirmSheet('حذف كل المنبّهات', 'سيُلغى كل ما جدولته.')) return;
        [...state.time.alarms].forEach((a) => removeAlarm(a.id));
        rerender();
      },
    }, '🗑 حذف الكل') : null,
  ]);
}

function openAlarmEditor(alarm, onDone) {
  const draft = { ...alarm, repeat: normalize(alarm.repeat) };
  const body = h('div');
  const panel = sheet(alarm.label && state.time.alarms.some((a) => a.id === alarm.id) ? 'تعديل المنبّه' : 'منبّه جديد', body);

  function render() {
    fill(body, [
      h('div.time-pick', [
        h('input', {
          type: 'number', min: 0, max: 23, value: pad(draft.hour),
          onchange: (e) => { draft.hour = clampInt(e.target.value, 0, 23); render(); },
        }),
        h('span.colon', ':'),
        h('input', {
          type: 'number', min: 0, max: 59, value: pad(draft.minute),
          onchange: (e) => { draft.minute = clampInt(e.target.value, 0, 59); render(); },
        }),
      ]),

      h('input', {
        placeholder: 'اسم المنبّه', value: draft.label, style: { marginTop: '14px' },
        oninput: (e) => { draft.label = e.target.value; },
      }),

      h('h2.sec', 'التكرار'),
      h('div.row.between', [
        h('span.muted', describe(draft.repeat)),
        h('button.btn.sm', {
          onclick: () => openRepeatEditor(draft.repeat, (r) => { draft.repeat = r; render(); }, nextFire({ ...draft, enabled: true }) || Date.now()),
        }, 'تعديل'),
      ]),
      h('div.chips', { style: { marginTop: '8px' } }, [
        quickRepeat(draft, 'none', 'مرّة واحدة', render),
        quickRepeat(draft, 'daily', 'كل يوم', render),
        quickRepeatWeekly(draft, [0, 1, 2, 3, 4], 'أيام الدوام', render),
        quickRepeatWeekly(draft, [5, 6], 'العطلة', render),
      ]),

      h('h2.sec', 'النغمة'),
      h('div.row.between', [
        h('span.muted.ellipsis', draft.soundName || 'النغمة الافتراضية'),
        h('button.btn.sm', { onclick: () => pickSound(draft, render) }, 'اختر أغنية'),
      ]),

      h('h2.sec', 'خيارات'),
      settingRow('اهتزاز', null, toggleSwitch(draft.vibrate, (on) => { draft.vibrate = on; })),
      settingRow('تصاعد الصوت تدريجيًا', 'يبدأ خافتًا ويعلو', toggleSwitch(draft.gradual, (on) => { draft.gradual = on; })),
      settingRow('شاشة كاملة عند الرنين', 'تظهر فوق شاشة القفل', toggleSwitch(draft.fullScreen, (on) => { draft.fullScreen = on; })),

      h('h2.sec', 'الغفوة'),
      chipGroup([5, 9, 10, 15, 20].map((v) => ({ value: v, label: `${v} د` })), draft.snoozeMin, (v) => { draft.snoozeMin = v; }),

      h('h2.sec', 'أقصى مستوى صوت'),
      h('input', {
        type: 'range', min: 20, max: 100, value: Math.round(draft.volume * 100),
        oninput: (e) => { draft.volume = e.target.value / 100; },
      }),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        h('button.btn.danger', {
          onclick: async () => {
            if (!state.time.alarms.some((a) => a.id === draft.id)) { panel.close(); return; }
            if (!await confirmSheet('حذف المنبّه', 'سيُلغى نهائيًا.')) return;
            removeAlarm(draft.id); panel.close(); onDone?.();
          },
        }, '🗑 حذف'),
        h('button.btn.primary', {
          onclick: () => {
            draft.enabled = true;
            saveAlarm(draft);
            const at = nextFire(draft);
            toast(at ? `سيرنّ ${untilText(at - Date.now())}` : 'حُفظ المنبّه', 'ok');
            panel.close(); onDone?.();
          },
        }, '💾 حفظ'),
      ]),

      h('div.muted.center', { style: { marginTop: '10px', fontSize: '11.5px' } }, describeAlarm(draft)),
    ]);
  }

  render();
}

function quickRepeat(draft, type, label, render) {
  const on = draft.repeat.type === type;
  return h('button.chip' + (on ? '.on' : ''), {
    onclick: () => { draft.repeat = normalize({ type, anchor: Date.now() }); render(); },
  }, label);
}

function quickRepeatWeekly(draft, days, label, render) {
  const on = draft.repeat.type === 'weekly' && days.every((d) => draft.repeat.days.includes(d))
    && draft.repeat.days.length === days.length;
  return h('button.chip' + (on ? '.on' : ''), {
    onclick: () => { draft.repeat = normalize({ type: 'weekly', days: [...days] }); render(); },
  }, label);
}

function pickSound(draft, render) {
  const tracks = allTracks();
  sheet('نغمة المنبّه', ({ close }) => h('div', [
    h('div.item', {
      onclick: () => { draft.soundUri = ''; draft.soundName = 'النغمة الافتراضية'; close(); render(); },
    }, [h('div.grow', '🔔 النغمة الافتراضية للنظام')]),
    tracks.length
      ? h('div.list', { style: { marginTop: '8px' } }, tracks.slice(0, 300).map((t) => h('div.track-row', {
        onclick: () => { draft.soundUri = t.uri; draft.soundName = t.title; close(); render(); },
      }, [
        h('div.n', '♪'),
        h('div.grow', [h('div.t.ellipsis', t.title), h('div.s.ellipsis', t.artist)]),
      ])))
      : h('div.empty', 'لا أغانٍ محمّلة بعد — افتح قسم الأغاني وافحص الجهاز.'),
  ]));
}

const clampInt = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));

/* ─────────────────────── النوم ─────────────────────── */

function sleepTab(rerender) {
  const s = state.time.sleep;
  const beds = bedtimesFor(s.wakeHour, s.wakeMinute);
  const wakes = wakeTimesIfSleepingNow();
  const advice = sleepAdvice();

  return h('div', [
    advice ? h('div.card.glow', [h('div.card-t', 'توصية الآن'), h('div.card-s', advice.text)]) : null,

    h('h2.sec', 'أريد الاستيقاظ الساعة'),
    h('div.card', [
      h('div.time-pick', [
        h('input', {
          type: 'number', min: 0, max: 23, value: pad(s.wakeHour),
          onchange: (e) => { s.wakeHour = clampInt(e.target.value, 0, 23); save(); rerender(); },
        }),
        h('span.colon', ':'),
        h('input', {
          type: 'number', min: 0, max: 59, value: pad(s.wakeMinute),
          onchange: (e) => { s.wakeMinute = clampInt(e.target.value, 0, 59); save(); rerender(); },
        }),
      ]),
      h('div.center.muted', { style: { marginTop: '8px' } }, 'أفضل أوقات النوم لتكمل دورات كاملة'),
      h('div.list', { style: { marginTop: '10px' } }, beds.map((b) => h('div.sleep-row' + (b.best ? '.best' : ''), [
        h('div', [
          h('div.h', clock(b.hour, b.minute, state.settings.hour12)),
          h('div.muted', `${b.cycles} دورات · ${durMin(b.sleepMin)} نوم`),
        ]),
        h('div.row', { style: { gap: '6px' } }, [
          h('span.badge' + (b.cycles >= 5 ? '.ok' : b.cycles === 4 ? '.warn' : '.danger'), b.quality),
          h('button.btn.sm', {
            onclick: () => {
              const a = newAlarm({
                hour: s.wakeHour, minute: s.wakeMinute, label: 'الاستيقاظ',
                repeat: { type: 'daily' }, kind: 'bedtime',
              });
              saveAlarm(a);
              toast('أُضيف منبّه الاستيقاظ يوميًا', 'ok');
            },
          }, 'نبّهني'),
        ]),
      ]))),
    ]),

    h('h2.sec', 'لو نمتُ الآن'),
    h('div.card', h('div.list', wakes.map((w) => h('div.sleep-row' + (w.best ? '.best' : ''), [
      h('div', [
        h('div.h', clock(w.hour, w.minute, state.settings.hour12)),
        h('div.muted', `${w.cycles} دورات · ${durMin(w.sleepMin)}`),
      ]),
      h('button.btn.sm', {
        onclick: () => {
          const d = new Date(w.at);
          saveAlarm(newAlarm({ hour: d.getHours(), minute: d.getMinutes(), label: `استيقاظ بعد ${w.cycles} دورات` }));
          toast('ضُبط المنبّه', 'ok');
          rerender();
        },
      }, 'اضبط'),
    ])))),

    h('h2.sec', 'إعدادات النوم'),
    h('div.card', [
      numberRow('طول الدورة (دقيقة)', s.cycleMin, 60, 120, (v) => { s.cycleMin = v; save(); rerender(); }),
      numberRow('زمن الاستغراق في النوم', s.fallAsleepMin, 0, 60, (v) => { s.fallAsleepMin = v; save(); rerender(); }),
      numberRow('عدد الدورات المستهدفة', s.targetCycles, 3, 6, (v) => { s.targetCycles = v; save(); rerender(); }),
      numberRow('بدء الاسترخاء قبل النوم بـ', s.windDownMin, 0, 120, (v) => { s.windDownMin = v; save(); rerender(); }),
    ]),

    h('h2.sec', 'أساسيات نوم أفضل'),
    h('div.list', SLEEP_TIPS.map((t) => h('div.card.tight', [h('div.card-t', t.t), h('div.card-s', t.s)]))),
  ]);
}

function numberRow(label, value, min, max, onChange) {
  const out = h('b.mono', String(value));
  return h('div', { style: { marginBottom: '12px' } }, [
    h('div.row.between', [h('span.muted', label), out]),
    h('input', {
      type: 'range', min, max, value,
      oninput: (e) => { out.textContent = e.target.value; },
      onchange: (e) => onChange(Number(e.target.value)),
    }),
  ]);
}

/* ─────────────────────── يومي (الملخّص والاستخدام) ─────────────────────── */

function dayTab() {
  const live = liveSummary();
  const history = summaryHistory();
  const u = state.time.usage;
  const usage = usageStats();

  return h('div', [
    h('div.card.glow', [
      h('div.row.between', [
        h('div', [h('div.card-t', 'اليوم حتى الآن'), h('div.card-s', `${usage.text} داخل التطبيق · بدأت ${usage.since}`)]),
        h('div', { style: { fontSize: '30px', fontWeight: '700' } }, String(live.score)),
      ]),
      h('button.btn.sm.block', { style: { marginTop: '10px' }, onclick: () => showSummarySheet(live) }, 'اعرض الملخّص الكامل'),
    ]),

    h('h2.sec', 'حدود الاستخدام'),
    h('div.card', [
      numberRow('الحدّ اليومي (دقيقة)', u.dailyLimitMin, 30, 720, (v) => {
        u.dailyLimitMin = v;
        u.warnAtMin = [Math.round(v * 0.5), Math.round(v * 0.8), v];
        save();
        emit('usage');
      }),
      h('div.muted', `تحذيرات عند: ${(u.warnAtMin || []).map((m) => durMin(m)).join(' · ')}`),
      h('div.muted', { style: { marginTop: '6px' } }, 'يصلك تنبيه عند كل حدّ، وتحذير أقوى عند تجاوز الحدّ اليومي.'),
    ]),

    h('h2.sec', 'مهام قادمة'),
    (() => {
      const up = upcomingTasks(7);
      return up.length
        ? h('div.list', up.slice(0, 8).map(({ task, key }) => taskRow(task, key)))
        : h('div.muted', 'لا مهام في الأيام السبعة القادمة.');
    })(),

    h('h2.sec', 'ملخّصات سابقة'),
    history.length
      ? h('div.list', history.map((s) => summaryCard(s, () => showSummarySheet(s))))
      : h('div.muted', 'أول ملخّص يظهر بعد منتصف الليل.'),
  ]);
}
