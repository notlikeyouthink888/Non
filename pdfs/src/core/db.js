/**
 * التخزين المحلي في IndexedDB:
 *  - blobs: الصور الأصلية وملفات PDF والمصغّرات (مفتاح ← Blob)
 *  - docs:  بيانات الملفات المحفوظة
 *  - kv:    المسودة الحالية وما شابه
 * لا شيء يغادر الجهاز.
 */

const DB_NAME = 'pdfs';
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('أُلغيت العملية'));
  });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const blobs = {
  get: (k) => tx('blobs', 'readonly', (s) => s.get(k)),
  put: (k, v) => tx('blobs', 'readwrite', (s) => s.put(v, k)),
  del: (k) => tx('blobs', 'readwrite', (s) => s.delete(k)),
  keys: () => tx('blobs', 'readonly', (s) => s.getAllKeys()),
};

export const kv = {
  get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  put: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
  del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
};

export const docs = {
  all: async () => ((await tx('docs', 'readonly', (s) => s.getAll())) || []).sort((a, b) => b.updated - a.updated),
  get: (id) => tx('docs', 'readonly', (s) => s.get(id)),
  put: (d) => tx('docs', 'readwrite', (s) => s.put(d)),
  del: (id) => tx('docs', 'readwrite', (s) => s.delete(id)),
};

/** يحذف كل Blob لا تشير إليه المسودة ولا أيّ ملف محفوظ. */
export async function gc() {
  const used = new Set();
  const draft = await kv.get('draft');
  draft?.pages?.forEach((p) => used.add(p.src));
  for (const d of await docs.all()) {
    used.add(d.pdf);
    used.add(d.thumb);
    d.pages?.forEach((p) => used.add(p.src));
  }
  for (const k of await blobs.keys()) {
    if (!used.has(k)) await blobs.del(k);
  }
}

export async function wipe() {
  const db = await open();
  db.close();
  dbp = null;
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}
