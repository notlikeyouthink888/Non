/** تنسيق التواريخ والأرقام — أرقام لاتينية كما في التقارير الهندسية، وأشهر عراقية. */

const dateFmt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { month: 'short', day: 'numeric' });

export function fmtDate(ts = Date.now()) {
  try { return dateFmt.format(new Date(ts)); } catch { return new Date(ts).toLocaleDateString(); }
}

export function fmtShort(ts) {
  try { return shortFmt.format(new Date(ts)); } catch { return ''; }
}

/** «منذ ٥ دقائق» بأرقام لاتينية. */
export function ago(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'الآن';
  const m = Math.round(s / 60);
  if (m < 60) return `منذ ${m} ${m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? 'دقائق' : 'دقيقة'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `منذ ${h} ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? 'ساعات' : 'ساعة'}`;
  const d = Math.round(h / 24);
  if (d < 30) return `منذ ${d} ${d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? 'أيام' : 'يومًا'}`;
  return fmtDate(ts);
}

/** عدد الكلمات في نص (عربي أو إنجليزي). */
export function countWords(text) {
  return (String(text || '').match(/[\p{L}\p{N}]+/gu) || []).length;
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function fmtUSD(n) {
  const v = Number(n || 0);
  if (v === 0) return '$0';
  if (v < 0.01) return '< $0.01';
  return '$' + v.toFixed(v < 1 ? 3 : 2);
}

/** اسم ملف آمن من عنوان عربي. */
export function safeFileName(title, ext) {
  const base = String(title || 'تقرير')
    .replace(/[\\/:*?"<>|#%{}~&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'تقرير';
  return `${base}.${ext}`;
}
