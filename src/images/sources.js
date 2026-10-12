/**
 * مصادر الصور المفتوحة (بلا مفاتيح، وتدعم CORS من المتصفح):
 *  - ويكيبيديا: الصورة الرئيسية لأقرب المقالات للموضوع (أعلى صلة عادةً).
 *  - ويكيميديا كومنز: بحث مباشر في ملفات الصور مع الرخصة والمؤلف.
 *  - Openverse: محرك صور برخص المشاع الإبداعي (مصدر احتياطي).
 * كل نتيجة تحمل مصدرها ومؤلفها ورخصتها لتُذكر تحت الصورة.
 */

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const OPENVERSE = 'https://api.openverse.org/v1/images/';

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** يغيّر عرض صورة مصغّرة في ويكيميديا (…/960px-Name.jpg ← …/330px-Name.jpg). */
export function resizeWiki(url, width) {
  if (!url) return url;
  return url.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`);
}

async function getJSON(url, signal, timeout = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

const II_PROPS = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiurlwidth: '960',
  iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|ObjectName',
};

function fromCommonsPage(p, via) {
  const ii = p?.imageinfo?.[0];
  if (!ii?.url) return null;
  const meta = ii.extmetadata || {};
  const display = ii.thumburl || ii.url;
  return {
    id: 'wm:' + (p.pageid || p.title),
    via,
    source: via === 'wikipedia' ? 'ويكيبيديا / ويكيميديا كومنز' : 'ويكيميديا كومنز',
    title: String(p.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
    desc: strip(meta.ImageDescription?.value || meta.ObjectName?.value).slice(0, 240),
    thumb: ii.thumburl ? resizeWiki(ii.thumburl, 330) : ii.url,
    display,
    width: ii.width || 0,
    height: ii.height || 0,
    mime: ii.mime || '',
    page: ii.descriptionurl || '',
    author: strip(meta.Artist?.value).slice(0, 100),
    license: strip(meta.LicenseShortName?.value) || 'رخصة حرة',
  };
}

/** بحث في ملفات ويكيميديا كومنز. */
export async function commonsSearch(query, { limit = 14, signal } = {}) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
    ...II_PROPS,
  });
  const data = await getJSON(`${COMMONS}?${params}`, signal);
  const pages = data?.query?.pages || [];
  return pages
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .map((p) => fromCommonsPage(p, 'commons'))
    .filter(Boolean);
}

/** معلومات ملفات معيّنة بأسمائها من كومنز. */
export async function commonsInfo(fileNames, { signal, via = 'commons' } = {}) {
  if (!fileNames.length) return [];
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    titles: fileNames.map((n) => (n.startsWith('File:') ? n : 'File:' + n)).join('|'),
    ...II_PROPS,
  });
  const data = await getJSON(`${COMMONS}?${params}`, signal);
  const pages = data?.query?.pages || [];
  const order = new Map(fileNames.map((n, i) => [n.replace(/^File:/, '').replace(/_/g, ' '), i]));
  return pages
    .map((p) => fromCommonsPage(p, via))
    .filter(Boolean)
    .sort((a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99));
}

/** الصور الرئيسية لأقرب مقالات ويكيبيديا للموضوع. */
export async function wikipediaImages(query, { lang = 'en', limit = 6, signal } = {}) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: String(limit),
    prop: 'pageimages', piprop: 'name', pilicense: 'free',
  });
  const data = await getJSON(`https://${lang}.wikipedia.org/w/api.php?${params}`, signal);
  const pages = (data?.query?.pages || []).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const names = [...new Set(pages.map((p) => p.pageimage).filter(Boolean))];
  if (!names.length) return [];
  return commonsInfo(names, { signal, via: 'wikipedia' });
}

/** بحث Openverse (صور برخص المشاع الإبداعي من مواقع متعددة). */
export async function openverseSearch(query, { limit = 12, signal } = {}) {
  const params = new URLSearchParams({ q: query, page_size: String(limit), mature: 'false' });
  const data = await getJSON(`${OPENVERSE}?${params}`, signal);
  return (data?.results || []).map((r) => ({
    id: 'ov:' + r.id,
    via: 'openverse',
    source: r.source ? `Openverse / ${r.source}` : 'Openverse',
    title: r.title || '',
    desc: (r.tags || []).map((t) => t.name).slice(0, 10).join(', '),
    thumb: r.thumbnail || r.url,
    display: r.url,
    fallback: r.thumbnail,
    width: r.width || 0,
    height: r.height || 0,
    mime: r.filetype ? `image/${r.filetype === 'jpg' ? 'jpeg' : r.filetype}` : '',
    page: r.foreign_landing_url || '',
    author: r.creator || '',
    license: ovLicense(r.license, r.license_version),
  }));
}

function ovLicense(l, v) {
  const id = String(l || '').toLowerCase();
  if (id === 'cc0') return 'CC0';
  if (id === 'pdm') return 'ملكية عامة';
  return id ? `CC ${id.toUpperCase()} ${v || ''}`.trim() : 'رخصة حرة';
}
