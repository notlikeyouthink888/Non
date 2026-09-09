/**
 * بديل الويب للمنبّهات: مؤقتات داخل الصفحة + Notification API.
 * (في أندرويد تتولّى إضافة Scheduler الأصلية العمل عبر AlarmManager فتعمل والتطبيق مغلق.)
 */

export function createWebScheduler() {
  const timers = new Map();
  const handlers = new Set();

  function fire(alarm) {
    timers.delete(alarm.id);
    handlers.forEach((fn) => fn({ type: 'alarm', ...alarm }));
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(alarm.title || 'منبّه', { body: alarm.body || '', tag: String(alarm.id) }); }
      catch { /* بعض المتصفحات تمنع الإشعار خارج service worker */ }
    }
  }

  return {
    async requestPermissions() {
      if (typeof Notification === 'undefined') return { granted: false };
      const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      return { granted: r === 'granted' };
    },
    async canScheduleExact() { return { canSchedule: false }; },
    async openExactAlarmSettings() { return {}; },

    async schedule(alarm) {
      const delay = alarm.at - Date.now();
      if (timers.has(alarm.id)) clearTimeout(timers.get(alarm.id));
      if (delay <= 0) { fire(alarm); return { scheduled: false }; }
      // setTimeout يقبل حتى ~24.8 يوم فقط
      timers.set(alarm.id, setTimeout(() => fire(alarm), Math.min(delay, 2 ** 31 - 1)));
      return { scheduled: true };
    },

    async cancel({ id }) {
      clearTimeout(timers.get(id));
      timers.delete(id);
      return {};
    },

    async cancelAll() {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      return {};
    },

    async listPending() { return { ids: [...timers.keys()] }; },

    async notify(n) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(n.title || '', { body: n.body || '' }); } catch { /* تجاهل */ }
      }
      return {};
    },

    on(fn) { handlers.add(fn); return () => handlers.delete(fn); },
  };
}
