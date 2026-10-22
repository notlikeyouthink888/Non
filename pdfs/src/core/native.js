/**
 * الجسر نحو أندرويد: مشاركة الملف، حفظه في «التنزيلات»، فتحه بتطبيق آخر،
 * واستقبال الصور المشارَكة من تطبيقات أخرى. في المتصفّح بدائل ويب لكل منها.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();

/** إضافة أندرويد الخاصة بالتطبيق (android/.../PdfsPlugin.java). */
const Pdfs = registerPlugin('Pdfs');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** يكتب الملف في مجلّد مؤقّت ويعيد عنوانه. */
async function toCache(blob, name) {
  const path = `out/${name}`;
  const res = await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  return res.uri;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const cancelled = (e) => /cancel|abort/i.test(String(e?.message || e?.name || e));

/** @returns {Promise<boolean>} false إن ألغى المستخدم */
export async function shareFile(blob, name, type = 'application/pdf') {
  if (isNative) {
    const uri = await toCache(blob, name);
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'مشاركة عبر' });
    } catch (e) {
      if (cancelled(e)) return false;
      throw e;
    }
    return true;
  }
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  download(blob, name);
  return true;
}

/** يحفظ نسخة في مجلّد التنزيلات/pdfs ويعيد وصفًا لمكانها. */
export async function saveToDevice(blob, name) {
  if (isNative) {
    const uri = await toCache(blob, name);
    const res = await Pdfs.saveToDownloads({ uri, name });
    return res.location || 'التنزيلات/pdfs';
  }
  download(blob, name);
  return 'التنزيلات';
}

export async function openFile(blob, name) {
  if (isNative) {
    const uri = await toCache(blob, name);
    await Pdfs.open({ uri, mime: 'application/pdf' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) download(blob, name);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** يستدعي fn بقائمة ملفات صور كلّما شارك المستخدم صورًا مع التطبيق. */
export function onSharedImages(fn) {
  if (!isNative) return;
  const pull = async () => {
    try {
      const { items = [] } = await Pdfs.takeShared();
      if (!items.length) return;
      const files = [];
      for (const it of items) {
        const r = await fetch(Capacitor.convertFileSrc(it.uri));
        const b = await r.blob();
        files.push(new File([b], it.name || 'image.jpg', { type: it.mime || b.type || 'image/jpeg' }));
      }
      fn(files);
    } catch (e) {
      console.warn('shared images', e);
    }
  };
  Pdfs.addListener('shared', pull);
  pull();
}

export function onBackButton(fn) {
  if (isNative) App.addListener('backButton', fn);
}

export function exitApp() {
  if (isNative) App.exitApp();
}

export async function cleanCache() {
  if (!isNative) return;
  try { await Filesystem.rmdir({ path: 'out', directory: Directory.Cache, recursive: true }); } catch { /* غير موجود */ }
}
