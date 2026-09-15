/** غلاف صغير حول IndexedDB لتخزين البيانات الكبيرة (مكتبة الأغاني، بلاطات الخريطة). */

const DB = 'yourworld';
const VERSION = 3;
const STORES = ['library', 'tiles', 'blobs', 'drawings', 'state', 'backups'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('لا يدعم الجهاز IndexedDB'));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  /** كتابة تُظهر الخطأ بدل ابتلاعه — تُستعمل لحفظ الحالة والنسخ الاحتياطية. */
  put: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)),
  read: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()).catch(() => []),

  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)).catch(() => undefined),
  set: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)).catch(() => undefined),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()).catch(() => undefined),
  keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()).catch(() => []),
  async count(store) {
    try { return await tx(store, 'readonly', (s) => s.count()); } catch { return 0; }
  },
};
