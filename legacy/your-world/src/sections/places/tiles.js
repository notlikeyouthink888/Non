/**
 * بلاطات الخريطة — تُقرأ من الذاكرة المحلية (IndexedDB) دائمًا.
 * التنزيل من الإنترنت اختياري تمامًا ويحدث فقط حين يطلبه المستخدم صراحةً
 * («نزّل خريطة هذه المنطقة»)، ثم تعمل بعدها دون إنترنت إلى الأبد.
 */

import { idb } from '../../core/idb.js';

const SOURCE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const memory = new Map();          // z/x/y -> ImageBitmap|HTMLImageElement
const missing = new Set();         // ما لا يوجد محليًا حتى لا نعيد المحاولة
let loading = 0;

const key = (z, x, y) => `${z}/${x}/${y}`;

/** بلاطة جاهزة للرسم فورًا، أو null. */
export function tileNow(z, x, y) {
  return memory.get(key(z, x, y)) || null;
}

export function isMissing(z, x, y) {
  return missing.has(key(z, x, y));
}

/** يحمّل بلاطة من التخزين المحلي (لا شبكة). */
export async function ensureTile(z, x, y, onReady) {
  const k = key(z, x, y);
  if (memory.has(k) || missing.has(k) || loading > 24) return;
  loading++;
  try {
    const blob = await idb.get('tiles', k);
    if (!blob) { missing.add(k); return; }
    const bmp = await toBitmap(blob);
    memory.set(k, bmp);
    onReady?.();
  } catch {
    missing.add(k);
  } finally {
    loading--;
  }
}

async function toBitmap(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  return img;
}

export async function cachedCount() { return idb.count('tiles'); }

export async function clearTiles() {
  memory.clear();
  missing.clear();
  await idb.clear('tiles');
}

/**
 * ينزّل بلاطات منطقة (يحتاج إنترنت مرّة واحدة فقط).
 * bounds: { minLat, maxLat, minLng, maxLng }، ومستويات التكبير من zFrom إلى zTo.
 */
export async function downloadArea(bounds, zFrom, zTo, onProgress) {
  const jobs = [];
  for (let z = zFrom; z <= zTo; z++) {
    const x1 = lngTile(bounds.minLng, z);
    const x2 = lngTile(bounds.maxLng, z);
    const y1 = latTile(bounds.maxLat, z);
    const y2 = latTile(bounds.minLat, z);
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) jobs.push({ z, x, y });
    }
  }

  let done = 0;
  let failed = 0;
  const limit = 4;

  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const k = key(job.z, job.x, job.y);
      try {
        if (!(await idb.get('tiles', k))) {
          const url = SOURCE.replace('{z}', job.z).replace('{x}', job.x).replace('{y}', job.y);
          const res = await fetch(url, { headers: { Accept: 'image/png' } });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          await idb.set('tiles', k, blob);
          missing.delete(k);
        }
      } catch {
        failed++;
      }
      done++;
      onProgress?.(done, done + jobs.length, failed);
    }
  }

  const total = jobs.length;
  await Promise.all(Array.from({ length: limit }, worker));
  return { total, failed };
}

/** يقدّر عدد البلاطات قبل التنزيل. */
export function estimateTiles(bounds, zFrom, zTo) {
  let n = 0;
  for (let z = zFrom; z <= zTo; z++) {
    const w = lngTile(bounds.maxLng, z) - lngTile(bounds.minLng, z) + 1;
    const hgt = latTile(bounds.minLat, z) - latTile(bounds.maxLat, z) + 1;
    n += Math.max(0, w) * Math.max(0, hgt);
  }
  return n;
}

const lngTile = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const latTile = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export const TILE_SOURCE_NAME = 'OpenStreetMap';
