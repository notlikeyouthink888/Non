/** تنسيق الأوقات والتواريخ بالعربية — بلا اعتماد على أي شبكة. */

export const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const AR_DAYS_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

export const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' بالتوقيت المحلي. */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 14:05 أو 2:05 م حسب الإعداد. */
export function clock(h, m, hour12 = false) {
  if (!hour12) return `${pad(h)}:${pad(m)}`;
  const period = h < 12 ? 'ص' : 'م';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${period}`;
}

export function clockOf(date, hour12 = false) {
  return clock(date.getHours(), date.getMinutes(), hour12);
}

/** مدّة بالمللي ثانية → mm:ss أو h:mm:ss */
export function dur(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60, m = Math.floor(total / 60) % 60, hh = Math.floor(total / 3600);
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** مدّة بالدقائق → «3 س 20 د» */
export function durMin(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} س ${m} د`;
  if (h) return `${h} س`;
  return `${m} د`;
}

export function durMs(ms) {
  return durMin(ms / 60000);
}

/** تاريخ مقروء: «الإثنين 3 آذار» */
export function longDate(d) {
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

export function shortDate(d) {
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

/** «اليوم» / «غدًا» / «أمس» أو التاريخ. */
export function relativeDay(d, now = new Date()) {
  if (sameDay(d, now)) return 'اليوم';
  if (sameDay(d, addDays(now, 1))) return 'غدًا';
  if (sameDay(d, addDays(now, -1))) return 'أمس';
  const diff = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff > 1 && diff < 7) return `${AR_DAYS[d.getDay()]} القادم`;
  return longDate(d);
}

/** «بعد 3 س 12 د» لفارق زمني بالمللي. */
export function untilText(ms) {
  if (ms <= 0) return 'الآن';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'بعد أقل من دقيقة';
  const d = Math.floor(min / 1440);
  if (d >= 1) return `بعد ${d} يوم${d > 1 ? 'ًا' : ''} و${durMin(min % 1440)}`;
  return `بعد ${durMin(min)}`;
}

/** حجم بالبايت → نص. */
export function bytes(n) {
  if (!n) return '—';
  const u = ['ب', 'ك.ب', 'م.ب', 'غ.ب'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** أرقام بفواصل. */
export const num = (n) => Number(n || 0).toLocaleString('en-US');
