/** التنقّل بالروابط (#/...) — منفصل عن الشِل لتجنّب الاستيراد الدائري. */

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

/** انتقال إلى مسار جديد (يُضاف للسجل). */
export function go(path) {
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

/** استبدال المسار الحالي دون إضافة للسجل. */
export function replace(path) {
  history.replaceState(null, '', '#' + path);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** تحديث الرابط دون إعادة بناء الشاشة (لحفظ نص البحث مثلًا). */
export function setQuiet(path) {
  history.replaceState(null, '', '#' + path);
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else replace(fallback);
}

export function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
}
