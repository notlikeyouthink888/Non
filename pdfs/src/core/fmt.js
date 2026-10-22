const nf = new Intl.NumberFormat('ar');

export const n = (v) => nf.format(v);

export function bytes(b) {
  if (b < 1024) return `${n(b)} بايت`;
  if (b < 1024 * 1024) return `${n(Math.round(b / 1024))} ك.ب`;
  return `${new Intl.NumberFormat('ar', { maximumFractionDigits: 1 }).format(b / 1024 / 1024)} م.ب`;
}

export function pages(c) {
  if (c === 1) return 'صفحة واحدة';
  if (c === 2) return 'صفحتان';
  if (c >= 3 && c <= 10) return `${n(c)} صفحات`;
  return `${n(c)} صفحة`;
}

export function when(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `اليوم ${time}`;
  if (d.toDateString() === y.toDateString()) return `أمس ${time}`;
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** اسم ملف افتراضي مثل: مستند 2026-10-22 14-30 */
export function defaultName() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `مستند ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** يزيل المحارف الممنوعة في أسماء الملفات ويضيف .pdf */
export function fileName(name) {
  const base = String(name || 'pdfs').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'pdfs';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}
