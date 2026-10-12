/** المنبّهات: إنشاء، جدولة (تعمل والتطبيق مغلق)، تعديل، حذف. */

import { state, save, uid, emit } from '../../core/store.js';
import { Scheduler, isNative } from '../../core/native.js';
import { toast } from '../../core/ui.js';
import { clock } from '../../core/fmt.js';
import { nextFireFor, describe, normalize } from './repeat.js';

/** معرّف رقمي ثابت للمنبّه (AlarmManager يحتاج int). */
function numericId(alarm) {
  if (Number.isInteger(alarm.nid)) return alarm.nid;
  let hash = 0;
  for (const ch of String(alarm.id)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  alarm.nid = Math.abs(hash) % 100000 + 10000;
  return alarm.nid;
}

export function newAlarm(patch = {}) {
  const d = new Date(Date.now() + 3600000);
  return {
    id: uid('al_'),
    hour: patch.hour ?? d.getHours(),
    minute: patch.minute ?? 0,
    label: patch.label ?? 'منبّه',
    enabled: true,
    repeat: normalize(patch.repeat),
    soundUri: patch.soundUri ?? '',
    soundName: patch.soundName ?? 'النغمة الافتراضية',
    snoozeMin: patch.snoozeMin ?? 9,
    vibrate: patch.vibrate ?? true,
    gradual: patch.gradual ?? true,
    volume: patch.volume ?? 1,
    fullScreen: patch.fullScreen ?? true,
    kind: patch.kind ?? 'alarm',      // alarm | timer | task | commit | bedtime
    createdAt: Date.now(),
  };
}

export function saveAlarm(alarm) {
  const list = state.time.alarms;
  const i = list.findIndex((a) => a.id === alarm.id);
  if (i >= 0) list[i] = alarm; else list.push(alarm);
  save();
  scheduleAlarm(alarm);
  emit('alarms');
  return alarm;
}

export function removeAlarm(id) {
  const a = state.time.alarms.find((x) => x.id === id);
  if (a) Scheduler.cancel(numericId(a)).catch(() => {});
  state.time.alarms = state.time.alarms.filter((x) => x.id !== id);
  save();
  emit('alarms');
}

export function toggleAlarm(id, on) {
  const a = state.time.alarms.find((x) => x.id === id);
  if (!a) return;
  a.enabled = on;
  save();
  if (on) scheduleAlarm(a); else Scheduler.cancel(numericId(a)).catch(() => {});
  emit('alarms');
}

/** يحسب الموعد القادم لمنبّه. */
export function nextFire(alarm) {
  if (!alarm.enabled) return 0;
  return nextFireFor(alarm);
}

/** يجدول المنبّه في النظام. */
export function scheduleAlarm(alarm) {
  if (!alarm.enabled) return Promise.resolve();
  const at = nextFire(alarm);
  if (!at) return Promise.resolve();

  return Scheduler.schedule({
    id: numericId(alarm),
    at,
    title: alarm.label || 'منبّه',
    body: describeAlarm(alarm),
    soundUri: alarm.soundUri || '',
    vibrate: alarm.vibrate,
    gradual: alarm.gradual,
    volume: alarm.volume,
    snoozeMin: alarm.snoozeMin,
    fullScreen: alarm.fullScreen,
    silent: false,
    repeat: normalize(alarm.repeat),
  }).catch((err) => console.warn('[alarms] تعذّرت الجدولة', err));
}

export function describeAlarm(alarm) {
  return `${clock(alarm.hour, alarm.minute, state.settings.hour12)} · ${describe(alarm.repeat)}`;
}

/** تذكير بسيط (مهمة أو التزام) — إشعار بلا رنين كامل. */
export function scheduleReminder({ id, at, title, body, sound = '' }) {
  return Scheduler.schedule({
    id: typeof id === 'number' ? id : numericId({ id }),
    at, title, body,
    soundUri: sound,
    vibrate: true, gradual: false, volume: 0.7,
    snoozeMin: 5, fullScreen: false, silent: !sound,
    repeat: { type: 'none' },
  }).catch(() => {});
}

export function cancelReminder(id) {
  return Scheduler.cancel(typeof id === 'number' ? id : numericId({ id })).catch(() => {});
}

/** يُستدعى عند الإقلاع: يطلب الأذونات ويعيد جدولة كل المنبّهات النشطة. */
export async function initAlarms() {
  try {
    if (state.settings.notifications) await Scheduler.requestPermissions();
  } catch { /* المستخدم رفض */ }

  const active = state.time.alarms.filter((a) => a.enabled);
  await Promise.allSettled(active.map(scheduleAlarm));

  Scheduler.on((ev) => {
    if (!ev) return;
    if (ev.type === 'fired') {
      emit('alarms');
      const label = ev.title || 'منبّه';
      toast(`⏰ ${label}`);
    }
    if (ev.type === 'dismissed' || ev.type === 'snoozed') emit('alarms');
  });

  if (isNative()) {
    const r = await Scheduler.canScheduleExact().catch(() => null);
    if (r && r.canSchedule === false) {
      toast('فعّل «المنبّهات الدقيقة» من إعدادات النظام ليعمل المنبّه في وقته بالضبط', 'err');
    }
  }
}

/** أقرب منبّه قادم — للعرض في الشاشة الرئيسية. */
export function upcomingAlarm() {
  const items = state.time.alarms
    .filter((a) => a.enabled)
    .map((a) => ({ alarm: a, at: nextFire(a) }))
    .filter((x) => x.at > 0)
    .sort((a, b) => a.at - b.at);
  return items[0] || null;
}
