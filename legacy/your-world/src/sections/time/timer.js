/** المؤقّت التنازلي وساعة الإيقاف — يستمران وإن أُغلق التطبيق (منبّه مجدول في النظام). */

import { h, fill, chipGroup } from '../../core/dom.js';
import { durMin, pad } from '../../core/fmt.js';
import { state, save, uid, emit } from '../../core/store.js';
import { toast, haptic, sheet } from '../../core/ui.js';
import { Scheduler } from '../../core/native.js';
import { normalize, describe } from './repeat.js';
import { openRepeatEditor } from './repeatUI.js';

const PRESETS = [1, 3, 5, 10, 15, 20, 25, 30, 45, 60];

/** الحالة الجارية للمؤقّت (محفوظة حتى تنجو من إغلاق التطبيق). */
function timerState() {
  if (!state.time.running) {
    state.time.running = { endAt: 0, totalMs: 0, label: '', paused: false, remainingMs: 0, nid: 77001, repeat: { type: 'none' } };
  }
  return state.time.running;
}

export function startTimer(minutes, { label = 'المؤقّت', repeat = null, seconds = 0 } = {}) {
  const t = timerState();
  const totalMs = Math.round(minutes * 60000 + seconds * 1000);
  if (totalMs <= 0) return;

  t.totalMs = totalMs;
  t.endAt = Date.now() + totalMs;
  t.label = label;
  t.paused = false;
  t.remainingMs = totalMs;
  t.repeat = normalize(repeat);
  save();

  Scheduler.schedule({
    id: t.nid,
    at: t.endAt,
    title: label || 'انتهى المؤقّت',
    body: `انتهت ${durMin(totalMs / 60000)}`,
    soundUri: '',
    vibrate: true, gradual: false, volume: 1,
    snoozeMin: 5, fullScreen: true, silent: false,
    repeat: t.repeat,
  }).catch(() => {});

  emit('timer');
  toast(`بدأ المؤقّت: ${durMin(totalMs / 60000)}`, 'ok');
}

export function pauseTimer() {
  const t = timerState();
  if (!t.endAt || t.paused) return;
  t.remainingMs = Math.max(0, t.endAt - Date.now());
  t.paused = true;
  save();
  Scheduler.cancel(t.nid).catch(() => {});
  emit('timer');
}

export function resumeTimer() {
  const t = timerState();
  if (!t.paused) return;
  t.endAt = Date.now() + t.remainingMs;
  t.paused = false;
  save();
  Scheduler.schedule({
    id: t.nid, at: t.endAt, title: t.label || 'انتهى المؤقّت', body: '',
    vibrate: true, gradual: false, volume: 1, snoozeMin: 5,
    fullScreen: true, silent: false, repeat: t.repeat,
  }).catch(() => {});
  emit('timer');
}

export function stopTimer() {
  const t = timerState();
  t.endAt = 0; t.paused = false; t.remainingMs = 0; t.totalMs = 0;
  save();
  Scheduler.cancel(t.nid).catch(() => {});
  emit('timer');
}

export function timerRemaining() {
  const t = timerState();
  if (!t.endAt) return 0;
  return t.paused ? t.remainingMs : Math.max(0, t.endAt - Date.now());
}

export const timerActive = () => timerState().endAt > 0;

/* ─────────────── ساعة الإيقاف ─────────────── */

const sw = { startedAt: 0, elapsed: 0, running: false, laps: [] };

export function swToggle() {
  if (sw.running) {
    sw.elapsed += Date.now() - sw.startedAt;
    sw.running = false;
  } else {
    sw.startedAt = Date.now();
    sw.running = true;
  }
  emit('timer');
}

export function swReset() { sw.startedAt = 0; sw.elapsed = 0; sw.running = false; sw.laps = []; emit('timer'); }
export function swLap() {
  const t = swElapsed();
  const prev = sw.laps.length ? sw.laps[0].total : 0;
  sw.laps.unshift({ n: sw.laps.length + 1, total: t, split: t - prev });
  emit('timer');
}
export function swElapsed() { return sw.elapsed + (sw.running ? Date.now() - sw.startedAt : 0); }
export const stopwatch = sw;

/* ─────────────── الواجهة ─────────────── */

export function timerTab() {
  const root = h('div');
  let mode = 'timer';

  const modeTabs = h('div.tabs', [
    h('button.on', { onclick: () => setMode('timer'), dataset: { m: 'timer' } }, 'المؤقّت'),
    h('button', { onclick: () => setMode('sw'), dataset: { m: 'sw' } }, 'ساعة الإيقاف'),
  ]);

  function setMode(m) {
    mode = m;
    [...modeTabs.children].forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    render();
  }

  const body = h('div');
  fill(root, [modeTabs, body]);

  function render() {
    fill(body, mode === 'timer' ? timerView(render) : stopwatchView(render));
  }

  render();
  const iv = setInterval(() => {
    if (!document.body.contains(root)) { clearInterval(iv); return; }
    const el = root.querySelector('[data-live]');
    if (!el) return;
    if (mode === 'timer') {
      const left = timerRemaining();
      el.textContent = fmtCountdown(left);
      const ring = root.querySelector('[data-ring]');
      const t = timerState();
      if (ring && t.totalMs) {
        const frac = left / t.totalMs;
        ring.style.strokeDashoffset = String(628 * (1 - frac));
      }
      if (timerActive() && left <= 0) { stopTimer(); render(); }
    } else {
      el.textContent = fmtStopwatch(swElapsed());
    }
  }, 200);

  return root;
}

function fmtCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const hh = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function fmtStopwatch(ms) {
  const cs = Math.floor(ms / 10) % 100;
  return `${fmtCountdown(ms)}.${pad(cs)}`;
}

function timerView(rerender) {
  const t = timerState();
  const active = timerActive();
  const left = timerRemaining();
  const frac = t.totalMs ? left / t.totalMs : 0;

  if (active) {
    return h('div', [
      h('div.dial', [
        h('svg', { viewBox: '0 0 220 220', html: `
          <circle cx="110" cy="110" r="100" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
          <circle data-ring cx="110" cy="110" r="100" fill="none" stroke="var(--accent)" stroke-width="10"
            stroke-linecap="round" stroke-dasharray="628" stroke-dashoffset="${628 * (1 - frac)}"/>` }),
        h('div.inner', [
          h('div.big-clock', { dataset: { live: '1' } }, fmtCountdown(left)),
          h('div.muted', t.label || 'المؤقّت'),
        ]),
      ]),
      t.repeat && t.repeat.type !== 'none'
        ? h('div.center.muted', { style: { marginBottom: '10px' } }, `🔁 ${describe(t.repeat)}`) : null,
      h('div.grid2', [
        h('button.btn', { onclick: () => { haptic(); t.paused ? resumeTimer() : pauseTimer(); rerender(); } },
          t.paused ? '▶ متابعة' : '⏸ إيقاف مؤقت'),
        h('button.btn.danger', { onclick: () => { haptic(); stopTimer(); rerender(); } }, '⏹ إلغاء'),
      ]),
      h('div.chips', { style: { marginTop: '12px', justifyContent: 'center' } }, [1, 5, 10].map((m) =>
        h('button.chip', {
          onclick: () => {
            const s2 = timerState();
            s2.endAt += m * 60000; s2.totalMs += m * 60000; save();
            Scheduler.schedule({ id: s2.nid, at: s2.endAt, title: s2.label, body: '', vibrate: true, fullScreen: true, snoozeMin: 5, volume: 1, repeat: s2.repeat }).catch(() => {});
            rerender();
          },
        }, `+${m} د`))),
    ]);
  }

  let custom = { min: 10, sec: 0, label: 'المؤقّت', repeat: { type: 'none' } };
  const repeatLine = h('div.muted', describe(custom.repeat));

  const minInput = h('input', { type: 'number', min: 0, max: 999, value: 10, oninput: (e) => { custom.min = Number(e.target.value) || 0; } });
  const secInput = h('input', { type: 'number', min: 0, max: 59, value: 0, oninput: (e) => { custom.sec = Number(e.target.value) || 0; } });

  return h('div', [
    h('h2.sec', 'مدد سريعة'),
    h('div.grid3', PRESETS.map((m) => h('button.btn', {
      onclick: () => { haptic(); startTimer(m); rerender(); },
    }, `${m} د`))),

    h('h2.sec', 'مدّة مخصّصة'),
    h('div.card', [
      h('div.time-pick', [minInput, h('span.colon', ':'), secInput]),
      h('div.row.between', { style: { marginTop: '10px' } }, [h('span.muted', 'دقائق : ثوانٍ'), h('span')]),
      h('input', { placeholder: 'اسم المؤقّت (اختياري)', style: { marginTop: '8px' }, oninput: (e) => { custom.label = e.target.value || 'المؤقّت'; } }),
      h('div.row.between', { style: { marginTop: '10px' } }, [
        h('div', [h('div.muted', 'التكرار'), repeatLine]),
        h('button.btn.sm', {
          onclick: () => openRepeatEditor(custom.repeat, (r) => {
            custom.repeat = r;
            repeatLine.textContent = describe(r);
          }),
        }, 'تعديل'),
      ]),
      h('button.btn.primary.block', {
        style: { marginTop: '12px' },
        onclick: () => { startTimer(custom.min, { label: custom.label, seconds: custom.sec, repeat: custom.repeat }); rerender(); },
      }, '▶ ابدأ'),
    ]),

    state.time.timers.length ? h('div', [
      h('h2.sec', 'مؤقتاتي المحفوظة'),
      h('div.list', state.time.timers.map((x) => h('div.item', [
        h('div.grow', { onclick: () => { startTimer(x.minutes, { label: x.label, repeat: x.repeat }); rerender(); } }, [
          h('div.t', x.label),
          h('div.s', `${durMin(x.minutes)} · ${describe(x.repeat)}`),
        ]),
        h('button.btn.sm.ghost', {
          onclick: () => { state.time.timers = state.time.timers.filter((y) => y.id !== x.id); save(); rerender(); },
        }, '✕'),
      ]))),
    ]) : null,

    h('button.btn.ghost.block', {
      style: { marginTop: '12px' },
      onclick: () => {
        state.time.timers.push({ id: uid('tm_'), label: custom.label, minutes: custom.min + custom.sec / 60, repeat: custom.repeat });
        save(); toast('حُفظ المؤقّت', 'ok'); rerender();
      },
    }, '💾 احفظ هذه المدّة'),
  ]);
}

function stopwatchView(rerender) {
  return h('div', [
    h('div.big-clock', { dataset: { live: '1' }, style: { margin: '26px 0' } }, fmtStopwatch(swElapsed())),
    h('div.grid2', [
      h('button.btn.primary', { onclick: () => { haptic(); swToggle(); rerender(); } }, sw.running ? '⏸ إيقاف' : '▶ تشغيل'),
      sw.running
        ? h('button.btn', { onclick: () => { haptic(); swLap(); rerender(); } }, '⏱ لفّة')
        : h('button.btn.ghost', { onclick: () => { swReset(); rerender(); } }, '↺ تصفير'),
    ]),
    sw.laps.length ? h('div.card.laps', { style: { marginTop: '14px' } },
      sw.laps.map((l) => h('div.lap', [
        h('span.muted', `لفّة ${l.n}`),
        h('span.mono', fmtStopwatch(l.split)),
        h('span.muted.mono', fmtStopwatch(l.total)),
      ]))) : null,
  ]);
}

/** ورقة سريعة لبدء مؤقّت من أي مكان. */
export function quickTimerSheet() {
  sheet('مؤقّت سريع', ({ close }) => h('div', [
    chipGroup(PRESETS.map((m) => ({ value: m, label: `${m} د` })), null, (m) => { startTimer(m); close(); }),
  ]));
}

export { fmtCountdown };
