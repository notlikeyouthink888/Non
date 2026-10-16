/**
 * إبقاء التوليد حيًّا حين يخرج المستخدم من التطبيق:
 *  - في أندرويد خدمة أمامية (KeepAlivePlugin) بإشعار «أساس يكتب التقرير…» تمنع النظام من تجميد
 *    التطبيق وقطع شبكته ما دام التوليد جاريًا، وتُعلم المستخدم حين يجهز التقرير وهو خارجه.
 *  - في كل مكان: تتبّع الخروج والرجوع، فإن انقطع طلب بسبب الخروج أو ضعف الشبكة يُعاد تلقائيًا
 *    بعد الرجوع وعودة الاتصال بدل إظهار خطأ.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

const android = Capacitor.isNativePlatform?.() && Capacitor.getPlatform() === 'android';
const KeepAlive = android ? registerPlugin('KeepAlive') : null;
const quiet = (p) => { p?.catch?.(() => {}); };

let hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
let lastHiddenAt = hidden ? Date.now() : 0;
const waiters = new Set();

function setHidden(v) {
  if (v) {
    if (!hidden) lastHiddenAt = Date.now();
    hidden = true;
  } else {
    hidden = false;
    waiters.forEach((fn) => fn());
    waiters.clear();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setHidden(document.visibilityState === 'hidden'));
}
if (android) {
  try { quiet(App.addListener('appStateChange', ({ isActive }) => setHidden(!isActive))); } catch { /* بلا مستمع */ }
}

export const isHidden = () => hidden;
/** هل خرج المستخدم من التطبيق منذ اللحظة t (أو هو خارجه الآن)؟ */
export const leftSince = (t) => hidden || lastHiddenAt >= t;

const abortErr = () => new DOMException('aborted', 'AbortError');

function waitFor(ready, subscribe, signal) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortErr()); return; }
    const done = () => { off(); resolve(); };
    const onAbort = () => { off(); reject(abortErr()); };
    const unsub = subscribe(done);
    const off = () => { unsub(); signal?.removeEventListener('abort', onAbort); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** ينتظر رجوع المستخدم إلى التطبيق. */
export const whenVisible = (signal) => waitFor(() => !hidden, (fn) => { waiters.add(fn); return () => waiters.delete(fn); }, signal);

/** ينتظر عودة الاتصال بالإنترنت. */
export const whenOnline = (signal) => waitFor(
  () => typeof navigator === 'undefined' || navigator.onLine !== false,
  (fn) => { window.addEventListener('online', fn); return () => window.removeEventListener('online', fn); },
  signal,
);

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortErr()); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(abortErr()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

let holds = 0;

/**
 * يُبقي التطبيق يعمل في الخلفية حتى release(). text نص الإشعار.
 * release(doneText) يُظهر doneText إشعارًا إن انتهى العمل والمستخدم خارج التطبيق.
 */
export function holdAwake(text) {
  holds += 1;
  quiet(KeepAlive?.start({ text }));
  let released = false;
  return {
    update: (t) => { if (!released) quiet(KeepAlive?.update({ text: t })); },
    release: (doneText = '') => {
      if (released) return;
      released = true;
      holds = Math.max(0, holds - 1);
      if (!holds) quiet(KeepAlive?.stop({ done: hidden ? doneText : '' }));
    },
  };
}

/**
 * ينفّذ fn(attempt) ويعيد المحاولة إن فشل بخطأ شبكة عابر: ينتظر رجوع المستخدم للتطبيق وعودة
 * الاتصال ثم يعيد، حتى tries محاولات. onRetry({ attempt, background, err }) لعرض الحالة.
 */
export async function retryTransient(fn, { signal, tries = 3, isTransient, onRetry } = {}) {
  for (let i = 0; ; i++) {
    const t0 = Date.now();
    try {
      return await fn(i);
    } catch (err) {
      if (signal?.aborted || i >= tries - 1 || !isTransient?.(err)) throw err;
      const background = leftSince(t0);
      onRetry?.({ attempt: i + 1, background, err });
      await whenVisible(signal);
      await whenOnline(signal);
      await sleep(background ? 700 : 1500 * (i + 1), signal);
    }
  }
}
