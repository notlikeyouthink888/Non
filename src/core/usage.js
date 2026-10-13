/**
 * تتبّع وقت الاستخدام + التحذير بعد ساعات محدّدة + ملخّص نهاية اليوم عند منتصف الليل.
 * كل شيء محلي بالكامل.
 */

import { state, save, update, emit } from './store.js';
import { dayKey, durMin, pad } from './fmt.js';
import { toast } from './ui.js';
import { Scheduler } from './native.js';
import { buildSummary } from '../sections/time/summary.js';

let active = true;
let tickTimer = null;
let lastTick = Date.now();
let currentSection = 'music';
const summaryListeners = new Set();

export function onSummaryReady(fn) { summaryListeners.add(fn); return () => summaryListeners.delete(fn); }

export function today() {
  const key = dayKey();
  const days = state.time.usage.days;
  if (!days[key]) days[key] = { ms: 0, opens: 0, sections: {}, firstOpen: Date.now(), lastSeen: Date.now() };
  return days[key];
}

export function setSection(id) {
  currentSection = id;
}

/** يبدأ حلقة العدّ (كل 15 ثانية، وتُحفظ الحالة كل دقيقة). */
export function startUsage() {
  const day = today();
  day.opens += 1;
  save();
  lastTick = Date.now();

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    lastTick = Date.now();
  });
  window.addEventListener('pagehide', () => { flush(); save(true); });

  tickTimer = setInterval(tick, 15000);
  tick();
  checkDayRollover();
  setInterval(checkDayRollover, 60000);
}

function flush() {
  const now = Date.now();
  const delta = now - lastTick;
  lastTick = now;
  if (!active || delta <= 0 || delta > 120000) return 0;
  const day = today();
  day.ms += delta;
  day.lastSeen = now;
  day.sections[currentSection] = (day.sections[currentSection] || 0) + delta;
  return delta;
}

function tick() {
  flush();
  checkWarnings();
  save();
}

/** تحذير الاستخدام المطوّل (٤، ٦، ٧ ساعات افتراضيًا وقابلة للتعديل). */
function checkWarnings() {
  const u = state.time.usage;
  const minutes = today().ms / 60000;
  const key = dayKey();
  if (u.warnedDay !== key) { u.warnedDay = key; u.warned = []; }

  for (const threshold of [...(u.warnAtMin || [])].sort((a, b) => a - b)) {
    if (minutes >= threshold && !u.warned.includes(threshold)) {
      u.warned.push(threshold);
      save();
      const over = threshold >= (u.dailyLimitMin || 420);
      const msg = over
        ? `تجاوزت حدّك اليومي (${durMin(threshold)}) على التطبيق. خُذ راحة حقيقية.`
        : `مضى ${durMin(threshold)} من الاستخدام اليوم.`;
      toast(msg, over ? 'err' : '');
      if (state.settings.notifications) {
        Scheduler.notify({
          id: 900000 + threshold,
          title: over ? 'حان وقت التوقّف' : 'تنبيه استخدام',
          body: msg,
        }).catch(() => {});
      }
      emit('usage');
    }
  }
}

/** عند تجاوز منتصف الليل: يولّد ملخّص اليوم المنتهي ويحفظه. */
export function checkDayRollover() {
  const key = dayKey();
  const last = state.time.meta?.lastDay ?? state.meta.lastOpenDay;
  if (!last) { state.meta.lastOpenDay = key; save(); return; }
  if (last === key) return;

  // يوم جديد بدأ — لخّص اليوم السابق
  const summary = buildSummary(last);
  update((s) => {
    s.time.summaries[last] = summary;
    s.time.lastSummaryDay = last;
    s.meta.lastOpenDay = key;
    s.time.usage.warned = [];
  }, 'summary');

  summaryListeners.forEach((fn) => fn(summary));
}

/** إحصاءات سريعة لعرضها في الواجهة. */
export function usageStats() {
  flush();
  const day = today();
  const mins = day.ms / 60000;
  const limit = state.time.usage.dailyLimitMin || 420;
  return {
    ms: day.ms,
    minutes: mins,
    text: durMin(mins),
    opens: day.opens,
    limit,
    ratio: Math.min(1, mins / limit),
    over: mins >= limit,
    sections: day.sections,
    since: day.firstOpen ? `${pad(new Date(day.firstOpen).getHours())}:${pad(new Date(day.firstOpen).getMinutes())}` : '—',
  };
}

export function stopUsage() {
  clearInterval(tickTimer);
  flush();
  save(true);
}
