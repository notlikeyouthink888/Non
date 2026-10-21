/** أدوات النص والأرقام: بحث عربي متسامح، وتنسيق مبالغ بالدينار أو الدولار. */

import { state } from './store.js';

const TASHKEEL = /[ً-ٰٟـ]/g;

/** يوحّد الكتابة حتى يلگي البحث «بنجرجي» لو كتبت «بنچرچي» وهكذا. */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/چ/g, 'ج')
    .replace(/[گک]/g, 'ك')
    .replace(/پ/g, 'ب')
    .replace(/ڤ/g, 'ف')
    .replace(/\s+/g, ' ')
    .trim();
}

/** يطابق كل كلمات البحث (بأي ترتيب) داخل نص مُوحَّد. */
export function matches(haystackNorm, query) {
  const words = norm(query).split(' ').filter(Boolean);
  return words.every((w) => haystackNorm.includes(w));
}

const DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9,
  '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };

/** يقرأ رقمًا من إدخال المستخدم (يقبل الأرقام العربية والفواصل). يعيد null إذا فارغ. */
export function parseNum(input) {
  const s = String(input ?? '')
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .replace(/[٫]/g, '.')
    .replace(/[,٬،\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 1500000 → 1,500,000 */
export const num = (n, digits = 0) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: digits });

export function currencySymbol() {
  return state.settings.currency === 'USD' ? '$' : 'د.ع';
}

/** مبلغ كامل: «1,500,000 د.ع» أو «$1,250». */
export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (state.settings.currency === 'USD') return (n < 0 ? '-$' : '$') + num(Math.abs(n), 2);
  return `${num(n)} د.ع`;
}

/** مبلغ مختصر: «1.5 مليون» أو «750 ألف». */
export function moneyShort(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (state.settings.currency === 'USD') return money(n);
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${trim(a / 1e9)} مليار`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)} مليون`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)} ألف`;
  return `${sign}${num(a)} د.ع`;
}

const trim = (x) => String(Math.round(x * 100) / 100);

/** «قبل ٣ أيام» وأمثالها. */
export function ago(ms) {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'هسه';
  if (min < 60) return `قبل ${min} دقيقة`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 30) return `قبل ${days} يوم`;
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** اليوم كنص للأسماء: 2026-10-21 */
export function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
