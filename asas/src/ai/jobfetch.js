/**
 * بث يُستأنف عبر خادم التطبيق: الخادم يكتب التقرير بنفسه (ReportJob في server/worker.js)
 * والتطبيق يقرأ منه. إن انقطع الاتصال — خروج من التطبيق، شبكة ضعيفة، تبدّل الواي فاي أو البيانات —
 * يعيد الاتصال تلقائيًا ويكمل من آخر بايت وصله (x-asas-from)، فلا يُعاد شيء ولا يظهر خطأ،
 * والكتابة في الخادم لا تتوقف أصلًا أثناء الانقطاع.
 * يختم الخادم البث بسطر «: asas-end»؛ أي انتهاء قبله انقطاع يُستأنف منه.
 * إن رد خادم قديم بلا x-asas-job يُعاد رده كما هو (بث عادي بلا استئناف).
 */

import { whenOnline, sleep } from '../core/keepalive.js';

const END = new TextEncoder().encode('\n: asas-end\n\n');
const GIVE_UP = 25 * 60000; // لا نستسلم قبل 25 دقيقة بلا أي بايت جديد
const STALL = 40000;        // الخادم يرسل ping كل 15 ثانية؛ لا شيء لهذه المدة = اتصال معلّق
const FIRST = 90000;        // الخادم ينتظر أول رد من المزوّد حتى دقيقة قبل أن يجيب

export const newJobId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/** انتهت المهمة في الخادم (أو لم يعد يعرفها): خطأ شبكة عابر يكمل بعده الكاتب بطلب جديد من حيث وصل. */
export class JobGoneError extends TypeError {
  constructor(why = 'job gone') {
    super(`network: ${why}`);
    this.jobGone = true;
  }
}

const abortError = () => new DOMException('aborted', 'AbortError');

/** قراءة بمهلة: إن علِق الاتصال يُقطع ليُعاد فتحه. */
function readOrStall(reader, ctrl) {
  const rd = reader.read();
  rd.catch(() => {});
  let t;
  const stall = new Promise((_, reject) => {
    t = setTimeout(() => { try { ctrl.abort(); } catch { /* مغلق */ } reject(new TypeError('network: stalled')); }, STALL);
  });
  return Promise.race([rd, stall]).finally(() => clearTimeout(t));
}

/**
 * مثل fetch لطلب بث عبر الخادم، لكن جسم الرد يستأنف نفسه بعد أي انقطاع.
 * onReconnect(n): n محاولة إعادة الاتصال الحالية، و0 حين تعود البيانات بالتدفق.
 */
export async function resumableFetch(url, init = {}, { jobId, signal, onReconnect } = {}) {
  let got = 0;
  let tries = 0;
  let giveUp = Date.now() + GIVE_UP;
  const tail = new Uint8Array(END.length);
  let filled = 0;

  const remember = (v) => {
    if (v.byteLength >= END.length) tail.set(v.subarray(v.byteLength - END.length));
    else { tail.copyWithin(0, v.byteLength); tail.set(v, END.length - v.byteLength); }
    filled = Math.min(END.length, filled + v.byteLength);
  };
  const sealed = () => filled === END.length && tail.every((b, i) => b === END[i]);

  const backoff = async () => {
    tries += 1;
    onReconnect?.(tries);
    await whenOnline(signal);
    await sleep(Math.min(1000 * 2 ** Math.min(tries - 1, 4), 12000), signal);
  };

  /** يفتح اتصالًا يقرأ من البايت got، ويعيد المحاولة ما دام الخطأ في الشبكة نفسها. */
  const connect = async () => {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const headers = new Headers(init.headers);
      headers.set('x-asas-job', jobId);
      headers.set('x-asas-from', String(got));
      const t = setTimeout(() => ctrl.abort(), FIRST);
      try {
        const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
        clearTimeout(t);
        return { res, ctrl, off: () => signal?.removeEventListener('abort', onAbort) };
      } catch (err) {
        clearTimeout(t);
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) throw err;
        if (Date.now() > giveUp) throw err;
        await backoff();
      }
    }
  };

  let cur = await connect();
  // خطأ (الحصة، الإيقاف…) أو خادم قديم بلا مهام: الرد كما هو
  if (!cur.res.ok || !cur.res.headers.get('x-asas-job') || !cur.res.body) return cur.res;
  const first = cur.res;
  let reader = first.body.getReader();
  let resumed = false;

  const body = new ReadableStream({
    async pull(controller) {
      for (;;) {
        let r = null;
        try {
          r = await readOrStall(reader, cur.ctrl);
        } catch (err) {
          if (signal?.aborted) { cur.off(); controller.error(err); return; }
        }
        if (r && !r.done) {
          if (!r.value?.byteLength) continue;
          got += r.value.byteLength;
          remember(r.value);
          giveUp = Date.now() + GIVE_UP;
          if (resumed) { resumed = false; tries = 0; onReconnect?.(0); }
          controller.enqueue(r.value);
          return;
        }
        if (r?.done && sealed()) { cur.off(); controller.close(); return; }
        // انقطع قبل الختم: نعيد الاتصال ونكمل من آخر بايت وصل
        cur.off();
        try { cur.ctrl.abort(); } catch { /* مغلق */ }
        try {
          if (Date.now() > giveUp) throw new TypeError('network: gave up');
          await backoff();
          for (;;) {
            cur = await connect();
            if (cur.res.ok && cur.res.headers.get('x-asas-job') && cur.res.body) break;
            cur.off();
            const st = cur.res.status;
            // المهمة انتهت صلاحيتها أو أُعيد تشغيل الخادم بلا مهام: يكمل الكاتب بطلب جديد من حيث وصل
            if (st === 410 || cur.res.ok || st === 401 || st === 403) throw new JobGoneError(`HTTP ${st}`);
            if (Date.now() > giveUp) throw new TypeError(`network: HTTP ${st}`);
            await backoff();
          }
          reader = cur.res.body.getReader();
          resumed = true;
        } catch (err) {
          controller.error(err);
          return;
        }
      }
    },
    cancel() {
      cur.off();
      try { cur.ctrl.abort(); } catch { /* مغلق */ }
    },
  });
  return new Response(body, { status: first.status, statusText: first.statusText, headers: first.headers });
}
