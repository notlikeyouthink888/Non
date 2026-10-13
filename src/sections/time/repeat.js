/**
 * محرّك التكرار — نسخة جافاسكربت مطابقة لـ RepeatRule.java.
 *
 * القاعدة: { type, days[], interval, anchor, from, until, months[] }
 *   none    — مرّة واحدة
 *   daily   — كل يوم
 *   weekly  — أيام محددة من الأسبوع (0 الأحد … 6 السبت)
 *   everyN  — كل N يوم ابتداءً من anchor
 *   monthly — نفس يوم الشهر
 *   yearly  — نفس اليوم والشهر
 *
 * ويمكن حصر أي قاعدة داخل نافذة (from/until) أو داخل أشهر معيّنة (months = 1..12)
 * لتحقيق أشياء مثل: «كل ٤ أيام طوال هذا الشهر» أو «كل ٣ أيام في تموز فقط».
 */

import { AR_DAYS_SHORT, AR_MONTHS, durMin } from '../../core/fmt.js';

export const NONE = { type: 'none', days: [], interval: 1, anchor: 0, from: 0, until: 0, months: [] };

export function normalize(rule) {
  return { ...NONE, ...(rule || {}) };
}

export function repeats(rule) {
  return normalize(rule).type !== 'none';
}

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / 86400000);

/**
 * أقرب موعد تالٍ بعد `after` مع الحفاظ على ساعة/دقيقة `previousFireAt`.
 * يعيد 0 إذا انتهت نافذة التكرار.
 */
export function nextAfter(rule, previousFireAt, after = Date.now()) {
  const r = normalize(rule);
  if (r.type === 'none') return 0;

  const base = new Date(previousFireAt);
  const c = new Date(Math.max(previousFireAt, after));
  c.setHours(base.getHours(), base.getMinutes(), 0, 0);
  if (c.getTime() <= after) c.setDate(c.getDate() + 1);

  for (let guard = 0; guard < 800; guard++) {
    const t = c.getTime();
    if (r.until > 0 && t > r.until) return 0;
    if (t > after && matches(r, c, previousFireAt)) return t;
    c.setDate(c.getDate() + 1);
  }
  return 0;
}

export function matches(rule, date, anchorFallback = Date.now()) {
  const r = normalize(rule);
  const t = date.getTime();
  if (r.from > 0 && t < r.from) return false;
  if (r.until > 0 && t > r.until) return false;
  if (r.months.length && !r.months.includes(date.getMonth() + 1)) return false;

  const a = new Date(r.anchor > 0 ? r.anchor : anchorFallback);

  switch (r.type) {
    case 'daily': return true;
    case 'weekly': return !r.days.length || r.days.includes(date.getDay());
    case 'everyN': {
      const diff = daysBetween(a, date);
      return diff >= 0 && diff % Math.max(1, r.interval) === 0;
    }
    case 'monthly': return date.getDate() === a.getDate();
    case 'yearly': return date.getDate() === a.getDate() && date.getMonth() === a.getMonth();
    default: return false;
  }
}

/** المواعيد القادمة (للمعاينة في الواجهة). */
export function preview(rule, fireAt, count = 5) {
  const out = [];
  let cursor = Date.now();
  let prev = fireAt;
  if (fireAt > cursor) { out.push(fireAt); cursor = fireAt; }
  for (let i = out.length; i < count; i++) {
    const next = nextAfter(rule, prev, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
    prev = next;
  }
  return out;
}

/** وصف عربي للقاعدة. */
export function describe(rule) {
  const r = normalize(rule);
  let base;
  switch (r.type) {
    case 'none': base = 'مرّة واحدة'; break;
    case 'daily': base = 'كل يوم'; break;
    case 'weekly':
      base = r.days.length === 7 ? 'كل يوم'
        : r.days.length ? `أيام: ${r.days.slice().sort().map((d) => AR_DAYS_SHORT[d]).join('، ')}`
          : 'أسبوعيًا';
      break;
    case 'everyN': base = r.interval === 1 ? 'كل يوم' : `كل ${r.interval} أيام`; break;
    case 'monthly': base = 'كل شهر في نفس اليوم'; break;
    case 'yearly': base = 'كل سنة في نفس التاريخ'; break;
    default: base = 'مرّة واحدة';
  }

  const scope = [];
  if (r.months.length && r.months.length < 12) {
    scope.push(`في ${r.months.map((m) => AR_MONTHS[m - 1]).join('، ')}`);
  }
  if (r.until > 0) {
    const d = new Date(r.until);
    scope.push(`حتى ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }
  return scope.length ? `${base} — ${scope.join(' ')}` : base;
}

/* ── نطاقات جاهزة تُستعمل في الواجهة ── */

export function scopeEndOfMonth(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  return d.getTime();
}

export function scopeEndOfYear(from = new Date()) {
  return new Date(from.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
}

export function scopeDays(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** وقت الإطلاق التالي لمنبّه (ساعة/دقيقة + قاعدة التكرار). */
export function nextFireFor({ hour, minute, repeat }, from = Date.now()) {
  const candidate = new Date(from);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= from) candidate.setDate(candidate.getDate() + 1);

  const rule = normalize(repeat);
  if (rule.type === 'none') {
    const oneShot = new Date(from);
    oneShot.setHours(hour, minute, 0, 0);
    if (oneShot.getTime() <= from) oneShot.setDate(oneShot.getDate() + 1);
    return oneShot.getTime();
  }

  // ابحث عن أول يوم مطابق للقاعدة
  const cursor = new Date(from);
  cursor.setHours(hour, minute, 0, 0);
  if (cursor.getTime() <= from) cursor.setDate(cursor.getDate() + 1);

  for (let i = 0; i < 800; i++) {
    if (rule.until > 0 && cursor.getTime() > rule.until) return 0;
    if (matches(rule, cursor, rule.anchor || from)) return cursor.getTime();
    cursor.setDate(cursor.getDate() + 1);
  }
  return candidate.getTime();
}

export const untilLabel = (ms) => (ms > 0 ? durMin((ms - Date.now()) / 60000) : '—');
