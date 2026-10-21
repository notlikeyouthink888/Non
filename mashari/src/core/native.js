/**
 * جسر صغير نحو أندرويد (Capacitor)، مع بدائل ويب حتى يشتغل التطبيق بالمتصفح أيضًا.
 *
 * الإضافات:
 *   Files — حفظ ملف بمكان تختاره، فتح ملف، ومشاركة ملف أو نص (android/.../FilesPlugin.java)
 *   App   — زر الرجوع وحالة التطبيق (@capacitor/app)
 */

const Cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

export const isNative = () => !!Cap()?.isNativePlatform?.();

function plugin(name) {
  return Cap()?.Plugins?.[name] ?? null;
}

function download(filename, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const Files = {
  /** يحفظ نصًا بملف يختار مكانه المستخدم. يعيد true إذا انحفظ. */
  async save(filename, data, mime = 'application/json') {
    const p = plugin('Files');
    if (p) {
      const r = await p.saveFile({ filename, data, mime });
      return !!r?.saved;
    }
    download(filename, data, mime);
    return true;
  },

  /** يفتح ملفًا نصيًا يختاره المستخدم. يعيد { name, data } أو null عند الإلغاء. */
  async open(accept = 'application/json,.json,text/plain') {
    const p = plugin('Files');
    if (p) {
      const r = await p.openFile({});
      return r && typeof r.data === 'string' ? { name: r.name || '', data: r.data } : null;
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        resolve(file ? { name: file.name, data: await file.text() } : null);
      });
      input.addEventListener('cancel', () => { input.remove(); resolve(null); });
      document.body.append(input);
      input.click();
    });
  },

  /** يشارك ملفًا (تلگرام، واتساب، درايف…). */
  async shareFile(filename, data, { title = 'مشاركة', mime = 'application/json' } = {}) {
    const p = plugin('Files');
    if (p) {
      await p.shareFile({ filename, data, mime, title });
      return true;
    }
    try {
      const file = new File([data], filename, { type: mime });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return true;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return false;
    }
    download(filename, data, mime);
    return true;
  },

  /** يشارك نصًا. يعيد shared | copied | cancel | failed */
  async shareText(text, title = 'مشاركة') {
    const p = plugin('Files');
    if (p) {
      await p.shareText({ text, title });
      return 'shared';
    }
    try {
      if (navigator.share) {
        await navigator.share({ text, title });
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancel';
    }
    return (await copyText(text)) ? 'copied' : 'failed';
  },
};

/** ينسخ نصًا للحافظة. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* نجرّب الطريقة القديمة */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export const System = {
  /** زر الرجوع في أندرويد (وزر Esc بالمتصفح). */
  onBack(fn) {
    const app = plugin('App');
    if (app) app.addListener('backButton', fn);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fn(); });
  },

  /** يصغّر التطبيق (مثل سلوك أندرويد الطبيعي عند الرجوع من الشاشة الرئيسية). */
  minimize() {
    plugin('App')?.minimizeApp?.();
  },

  /** عند خروج التطبيق للخلفية — حتى نحفظ فورًا. */
  onPause(fn) {
    document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
    plugin('App')?.addListener?.('appStateChange', ({ isActive }) => { if (!isActive) fn(); });
  },
};
