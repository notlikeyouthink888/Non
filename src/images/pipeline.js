/**
 * خط الصور «دون أخطاء»:
 *  1) جمع مرشحين من عدة مصادر لكل صورة مطلوبة.
 *  2) استبعاد الشعارات والخرائط والأيقونات والصور الصغيرة أو الغريبة الأبعاد.
 *  3) تنزيل كل مرشح فعليًا والتحقق من أنه صورة سليمة قابلة للفك — ما يفشل يُحذف.
 *  4) (اختياري) يراجع الذكاء الاصطناعي المرشحين بصريًا ويختار المطابق للموضوع فعلًا.
 *  5) تُخزَّن الصورة المختارة في الجهاز (IndexedDB) فلا تنكسر لاحقًا حتى بلا إنترنت.
 */

import { commonsSearch, wikipediaImages, openverseSearch } from './sources.js';
import { putImage } from '../core/db.js';
import { uid } from '../core/store.js';

const BAD = /\b(logo|icon|flag|coat of arms|emblem|seal|signature|stamp|banner|qr code|clip ?art|cartoon|locator|location map|map of|svg|wordmark|portrait of)\b/i;
const OK_MIME = /^image\/(jpeg|png|webp)$/;

export function acceptable(c) {
  if (!c?.display) return false;
  if (c.mime && !OK_MIME.test(c.mime)) return false;
  if (c.width && c.height) {
    if (c.width < 400 || c.height < 250) return false;
    const r = c.width / c.height;
    if (r < 0.45 || r > 2.8) return false;
  }
  if (BAD.test(`${c.title} ${c.desc}`)) return false;
  return true;
}

/** درجة صلة تقريبية من تطابق كلمات البحث مع عنوان الصورة ووصفها. */
function relevance(c, query, rank) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const hay = `${c.title} ${c.desc}`.toLowerCase();
  const hit = words.filter((w) => hay.includes(w)).length;
  return hit / Math.max(1, words.length) * 3 + (c.via === 'wikipedia' ? 1.2 : 0) - rank * 0.04;
}

/** يجمع مرشحين لصورة واحدة من المصادر المفعّلة. */
export async function findCandidates({ queries, arQuery = '', sources, signal, max = 10 }) {
  const out = [];
  const seen = new Set();
  const push = (list, q) => list.forEach((c, i) => {
    const key = c.display.replace(/\/\d+px-/, '/');
    if (seen.has(key) || !acceptable(c)) return;
    seen.add(key);
    out.push({ ...c, score: relevance(c, q, out.length + i), query: q });
  });

  for (const q of queries.filter(Boolean).slice(0, 3)) {
    if (signal?.aborted) break;
    const tasks = [];
    if (sources.wikipedia) tasks.push(wikipediaImages(q, { signal }).then((l) => push(l, q)));
    if (sources.commons) tasks.push(commonsSearch(q, { signal }).then((l) => push(l, q)));
    await Promise.allSettled(tasks);
    if (out.length >= max) break;
  }
  if (out.length < 4 && arQuery && sources.wikipedia && !signal?.aborted) {
    await wikipediaImages(arQuery, { lang: 'ar', signal }).then((l) => push(l, queries[0] || arQuery)).catch(() => {});
  }
  if (out.length < 4 && sources.openverse && !signal?.aborted) {
    await openverseSearch(queries[0], { signal }).then((l) => push(l, queries[0])).catch(() => {});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** ينزّل ملفًا بمهلة زمنية ويتأكد أنه صورة حقيقية. */
export async function fetchImageBlob(url, { signal, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type) || blob.size < 3000) throw new Error('ليس ملف صورة');
    return blob;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** يفك الصورة فعليًا (يكشف الملفات التالفة) ويعيد أبعادها. */
export async function decodeSize(blob) {
  const bmp = await createImageBitmap(blob);
  const size = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  if (size.w < 160 || size.h < 120) throw new Error('صورة صغيرة جدًا');
  return size;
}

/** يصغّر الصورة إلى عرض أقصى ويعيدها JPEG. */
export async function downscale(blob, maxSide = 1280, quality = 0.86) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.type === 'image/jpeg') { const r = { blob, w: bmp.width, h: bmp.height }; bmp.close?.(); return r; }
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { blob: out || blob, w, h };
}

export async function toBase64Jpeg(blob, maxSide = 384) {
  const { blob: small } = await downscale(blob, maxSide, 0.72);
  const buf = new Uint8Array(await small.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** ينفّذ مهام بتوازٍ محدود. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await fn(items[i], i); } catch (err) { results[i] = { error: err }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * يتحقق من المرشحين بتنزيل نسخهم المصغّرة: يبقي فقط ما يُحمَّل ويُفك بنجاح.
 * يعيد المرشحين السليمين مع thumbBlob.
 */
export async function verifyLoadable(cands, { signal, need = 4 } = {}) {
  const ok = [];
  const res = await pool(cands, 4, async (c) => {
    if (ok.length >= need + 2 || signal?.aborted) return null;
    const blob = await fetchImageBlob(c.thumb, { signal, timeout: 12000 });
    await decodeSize(blob);
    const v = { ...c, thumbBlob: blob };
    ok.push(v);
    return v;
  });
  return res.filter((r) => r && !r.error).slice(0, need + 2);
}

/**
 * يحفظ المرشح المختار: ينزّل النسخة الكبيرة (مع بديل عند الفشل)،
 * يصغّرها لحجم مناسب للتقارير، ويخزّنها. يعيد معرّف الصورة.
 */
export async function storeCandidate(c, { signal } = {}) {
  let blob = null;
  for (const url of [c.display, c.fallback, c.thumb].filter(Boolean)) {
    try {
      blob = await fetchImageBlob(url, { signal, timeout: 20000 });
      await decodeSize(blob);
      break;
    } catch { blob = null; }
  }
  if (!blob && c.thumbBlob) blob = c.thumbBlob;
  if (!blob) throw new Error('تعذّر تنزيل الصورة');
  const small = await downscale(blob, 1280, 0.86);
  const id = uid('img_');
  await putImage({
    id, blob: small.blob, w: small.w, h: small.h, mime: small.blob.type,
    source: c.source, title: c.title, author: c.author, license: c.license, page: c.page,
    query: c.query || '', addedAt: Date.now(),
  });
  return { id, w: small.w, h: small.h };
}

/** يحفظ صورة اختارها المستخدم من جهازه. */
export async function storeLocalFile(file) {
  if (!/^image\//.test(file.type)) throw new Error('الملف ليس صورة');
  await decodeSize(file);
  const small = await downscale(file, 1600, 0.88);
  const id = uid('img_');
  await putImage({
    id, blob: small.blob, w: small.w, h: small.h, mime: small.blob.type,
    source: 'صورة من جهاز المستخدم', title: file.name || '', author: '', license: '', page: '', query: '', addedAt: Date.now(),
  });
  return { id, w: small.w, h: small.h };
}

/** نسخة خفيفة من المرشح تُحفظ مع التقرير لإتاحة الاستبدال لاحقًا. */
export function slimCandidate(c) {
  const { thumbBlob, score, ...rest } = c;
  return rest;
}
