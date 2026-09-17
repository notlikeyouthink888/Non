/**
 * تخزين الصور والفيديو داخل الجهاز (IndexedDB) — لا رفع ولا شبكة.
 * الصور تُصغَّر قبل الحفظ لتوفير المساحة، والفيديو يُحفظ كما هو مع حدّ أعلى.
 */

import { idb } from './idb.js';
import { uid } from './store.js';

const MAX_IMAGE_PX = 1600;
const IMAGE_QUALITY = 0.82;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;   // 200 م.ب

const urlCache = new Map();   // id -> objectURL

/**
 * يحفظ ملفًا ويعيد معرّفه.
 * `maxBytes` يرفع أو يخفض الحدّ لحالة معيّنة (فيديو طويل في قسم التطوير مثلًا).
 */
export async function saveMedia(file, { maxBytes = MAX_VIDEO_BYTES } = {}) {
  if (!file) return null;
  const isImage = file.type.startsWith('image/');
  const blob = isImage ? await shrinkImage(file) : file;

  if (!isImage && blob.size > maxBytes) {
    throw new Error(`الملف كبير (${(blob.size / 1048576).toFixed(0)} م.ب). الحدّ ${Math.round(maxBytes / 1048576)} م.ب.`);
  }

  const id = uid(isImage ? 'img_' : 'vid_');
  await idb.set('blobs', id, blob);
  return { id, type: isImage ? 'image' : 'video', mime: blob.type || file.type, size: blob.size, name: file.name };
}

/** رابط عرض للوسيط (يُعاد استعماله). */
export async function mediaUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await idb.get('blobs', id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteMedia(id) {
  if (!id) return;
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
  await idb.del('blobs', id);
}

/** مساحة الوسائط المستعملة تقريبًا. */
export async function mediaUsage() {
  try {
    const keys = await idb.keys('blobs');
    let bytes = 0;
    for (const k of keys) {
      const b = await idb.get('blobs', k);
      bytes += b?.size || 0;
    }
    return { count: keys.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** يصغّر الصورة إلى أقصى بُعد مع الحفاظ على النسبة. */
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_PX / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 900 * 1024) { bitmap.close?.(); return file; }

    const w = Math.round(bitmap.width * scale);
    const hh = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hh;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, hh);
    bitmap.close?.();

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;   // إن فشل التصغير نحفظ الأصل
  }
}

/**
 * يفتح منتقي ملفات ويعيد الملف المختار.
 * kind: 'image' | 'video' | 'any'
 */
export function pickFile(kind = 'image', { camera = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'image/*,video/*';
    if (camera) input.capture = 'environment';
    input.style.display = 'none';
    input.onchange = () => { resolve(input.files?.[0] || null); input.remove(); };
    document.body.append(input);
    input.click();
    // إن ألغى المستخدم لا يُطلق حدث — ننظّف لاحقًا
    setTimeout(() => { if (document.body.contains(input)) input.remove(); }, 120000);
  });
}
