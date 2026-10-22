/** إعدادات المستخدم في localStorage مع قيم افتراضية تُدمج عند كل إقلاع. */

const KEY = 'pdfs.settings';

const defaults = {
  theme: 'auto', // auto | light | dark
  size: 'a4',
  orientation: 'auto',
  margin: 'small',
  quality: 'high',
  pageNumbers: false,
  autoFilter: 'none', // فلتر يُطبَّق على الصور الجديدة
};

export const QUALITY = {
  high: { label: 'عالية', max: 2800, q: 0.9 },
  medium: { label: 'متوسطة', max: 2000, q: 0.8 },
  small: { label: 'حجم صغير', max: 1400, q: 0.66 },
};

let current;
try {
  current = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  current = { ...defaults };
}

export const settings = new Proxy(current, {
  set(t, k, v) {
    t[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* التخزين ممتلئ أو معطّل */ }
    if (k === 'theme') applyTheme();
    return true;
  },
});

export function applyTheme() {
  const t = current.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* لا شيء */ }
  Object.assign(current, defaults);
  applyTheme();
}
