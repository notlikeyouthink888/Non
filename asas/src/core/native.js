/**
 * الجسر نحو أندرويد عبر Capacitor، مع بدائل ويب كاملة:
 * حفظ الملفات ومشاركتها، الطباعة إلى PDF، وزر الرجوع.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** إضافة الطباعة المكتوبة يدويًا في أندرويد (PrintManager). */
const Printer = registerPlugin('Printer');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function webDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function writeCache(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  const res = await Filesystem.writeFile({ path: `exports/${filename}`, data, directory: Directory.Cache, recursive: true });
  return res.uri;
}

/** مشاركة ملف (واتساب، تلغرام، الحفظ في الملفات...). */
export async function shareFile(blob, filename, title = 'تقرير') {
  if (isNative) {
    const uri = await writeCache(blob, filename);
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, files: [uri], dialogTitle: 'مشاركة التقرير' });
    return 'shared';
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
  }
  webDownload(blob, filename);
  return 'downloaded';
}

/** حفظ ملف في الجهاز: مجلد المستندات في أندرويد أو التنزيل في المتصفح. */
export async function saveFile(blob, filename) {
  if (!isNative) { webDownload(blob, filename); return { where: 'التنزيلات' }; }
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: `Asas/${filename}`, data, directory: Directory.Documents, recursive: true });
    return { where: 'Documents/Asas' };
  } catch (err) {
    console.warn('[native] تعذّر الحفظ في المستندات، سننتقل للمشاركة', err);
    await shareFile(blob, filename);
    return { where: 'المشاركة' };
  }
}

/** طباعة الصفحة الحالية (تقرير بتنسيق الطباعة) أو حفظها PDF. */
export async function printPage(name = 'تقرير') {
  if (isNative) {
    await Printer.print({ name });
    return;
  }
  window.print();
}

/** ربط زر الرجوع في أندرويد. */
export async function onBackButton(handler) {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', handler);
}

export async function exitApp() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.exitApp();
}

/** فتح رابط خارجي في المتصفح. */
export function openExternal(url) {
  window.open(url, '_blank', 'noopener');
}
