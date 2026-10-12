/**
 * IndexedDB: التقارير الكاملة والصور (Blob) — تبقى داخل الجهاز
 * فتظهر التقارير وصورها دائمًا حتى بلا إنترنت، ودون صور مكسورة.
 */

const DB_NAME = 'asas';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('reports')) {
        const s = db.createObjectStore('reports', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ── التقارير ───────────────────────────────────── */

export function putReport(report) {
  report.updatedAt = Date.now();
  return tx('reports', 'readwrite', (s) => req2p(s.put(structuredClone(report))));
}

export function getReport(id) {
  return tx('reports', 'readonly', (s) => req2p(s.get(id)));
}

export async function deleteReport(id) {
  const r = await getReport(id);
  if (r) await deleteImages(imageIdsOf(r));
  return tx('reports', 'readwrite', (s) => req2p(s.delete(id)));
}

/** قائمة مختصرة بكل التقارير، الأحدث أولًا. */
export async function listReports() {
  const all = await tx('reports', 'readonly', (s) => req2p(s.getAll()));
  return (all || [])
    .map((r) => ({
      id: r.id, title: r.title, typeId: r.typeId, catId: r.catId, source: r.source,
      createdAt: r.createdAt, updatedAt: r.updatedAt, words: r.words || 0,
      status: r.status, figures: (r.figures || []).filter((f) => f.img).length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function imageIdsOf(report) {
  const ids = new Set();
  (report.figures || []).forEach((f) => { if (f.img) ids.add(f.img); });
  return [...ids];
}

/* ── الصور ──────────────────────────────────────── */

const urlCache = new Map();

export function putImage(rec) {
  return tx('images', 'readwrite', (s) => req2p(s.put(rec)));
}

export function getImage(id) {
  return tx('images', 'readonly', (s) => req2p(s.get(id)));
}

export async function deleteImages(ids) {
  if (!ids?.length) return;
  ids.forEach((id) => {
    const u = urlCache.get(id);
    if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
  });
  await tx('images', 'readwrite', (s) => Promise.all(ids.map((id) => req2p(s.delete(id)))));
}

/** رابط عرض محلي (blob:) لصورة مخزّنة. */
export async function imageURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await getImage(id);
  if (!rec?.blob) return null;
  const u = URL.createObjectURL(rec.blob);
  urlCache.set(id, u);
  return u;
}

/** نسخة احتياطية كاملة (التقارير + الصور كـ base64). */
export async function exportAll() {
  const reports = await tx('reports', 'readonly', (s) => req2p(s.getAll()));
  const images = await tx('images', 'readonly', (s) => req2p(s.getAll()));
  const imgs = await Promise.all((images || []).map(async (im) => ({ ...im, blob: undefined, data: await blobToDataURL(im.blob) })));
  return { app: 'asas', version: 1, at: Date.now(), reports, images: imgs };
}

export async function importAll(data) {
  if (!data || data.app !== 'asas') throw new Error('ملف غير صالح');
  for (const im of data.images || []) {
    const blob = await (await fetch(im.data)).blob();
    const rec = { ...im, blob };
    delete rec.data;
    await putImage(rec);
  }
  for (const r of data.reports || []) {
    await tx('reports', 'readwrite', (s) => req2p(s.put(r)));
  }
  return (data.reports || []).length;
}

export async function clearAll() {
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  await tx('reports', 'readwrite', (s) => req2p(s.clear()));
  await tx('images', 'readwrite', (s) => req2p(s.clear()));
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
