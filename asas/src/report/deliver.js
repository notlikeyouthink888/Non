/**
 * نسخة التقرير لمدير التطبيق: بعد اكتمال التقرير يُرسل نصه إلى خادم المدير (/api/log)، ثم — إن فعّل
 * المدير تيليغرام — يُبنى ملف PDF للتقرير في الجهاز (export/pdfdoc.js) ويُرسل (/api/pdf)، فيصل إلى كل
 * المعرّفات التي أضافها المدير. إن تعذّر الإرسال (لا إنترنت) يُعاد عند فتح التطبيق لاحقًا،
 * والخادم لا يرسل الملف نفسه مرتين.
 */

import { state } from '../core/store.js';
import { putReport, getReport, listReports } from '../core/db.js';
import { linked, logReport, ensureConfig, serverUrl, serverHeaders } from '../core/server.js';

const MAX_TRIES = 5;

/** يحفظ حالة الإرسال في نسخة الذاكرة وفي القاعدة (دون إعادة تقرير حُذف أثناء الإرسال). */
async function mark(r, patch) {
  Object.assign(r, patch);
  const fresh = await getReport(r.id).catch(() => null);
  if (fresh) await putReport(Object.assign(fresh, patch)).catch(() => {});
}

async function sendPdf(r) {
  const cfg = await ensureConfig().catch(() => state.server?.config);
  if (!cfg?.pdf) return false;
  await mark(r, { pdfPending: true, pdfTries: (r.pdfTries || 0) + 1 });
  try {
    const { reportPdf } = await import('../export/pdfdoc.js');
    const blob = await reportPdf(r);
    const res = await fetch(`${serverUrl()}/api/pdf`, {
      method: 'POST',
      headers: { ...serverHeaders({ report: r.id }), 'content-type': 'application/pdf' },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok !== false) {
      await mark(r, { pdfSent: true, pdfPending: false });
      return true;
    }
    console.warn('[deliver] رفض الخادم ملف PDF', res.status, data.error);
  } catch (err) {
    console.warn('[deliver] تعذّر بناء أو إرسال PDF', err);
  }
  return false;
}

/** يرسل التقرير المكتمل للمدير: النص ثم ملف PDF. type اسم نوع التقرير. */
export async function deliverReport(r, { type = '' } = {}) {
  if (!linked()) return;
  const logged = await logReport(r, { type });
  if (!logged || r.status !== 'ready' || r.pdfSent) return;
  await sendPdf(r);
}

/** عند فتح التطبيق: ملفات PDF لم تصل (لا إنترنت وقتها) تُرسل الآن. */
export async function retryPendingPdfs() {
  if (!linked()) return;
  const recent = (await listReports().catch(() => []))
    .filter((x) => x.status === 'ready' && Date.now() - x.updatedAt < 3 * 86400000)
    .slice(0, 10);
  for (const x of recent) {
    const r = await getReport(x.id).catch(() => null);
    if (r?.pdfPending && !r.pdfSent && (r.pdfTries || 0) < MAX_TRIES) await deliverReport(r);
  }
}
