/**
 * واجهة الذكاء الاصطناعي الموحّدة: تختار المزوّد حسب الإعدادات.
 *  - OpenRouter (ai/openrouter.js): نماذج مجانية.
 *  - Claude (ai/claude.js): عميل Anthropic الرسمي، الأدق.
 * بقية التطبيق يستدعي هذه الدوال فقط ولا يعرف أي مزوّد يعمل.
 */

import { state, modelInfo, MODELS } from '../core/store.js';
import * as claude from './claude.js';
import * as or from './openrouter.js';

// فرع DeepSeek يعمل عبر حساب OpenRouter المربوط بنماذج DeepSeek فقط
const isOR = () => state.ai.provider === 'openrouter' || state.ai.provider === 'deepseek';
const isDS = () => state.ai.provider === 'deepseek';

export const streamText = (opts) => (isOR() ? or.streamText(opts) : claude.streamText(opts));
export const jsonCall = (opts) => (isOR() ? or.jsonCall(opts) : claude.jsonCall(opts));
export const testConnection = (signal) => (isOR() ? or.testConnection(signal) : claude.testConnection(signal));

/** رسالة عربية للخطأ حسب المزوّد الذي أطلقه (لا حسب الإعداد الحالي). */
export function aiErrorMessage(err) {
  return err instanceof or.ORError ? or.errorMessage(err) : claude.aiErrorMessage(err);
}

/** خطأ شبكة عابر (من أي مزوّد) تصح إعادة محاولته تلقائيًا. */
export function isTransientError(err) {
  return err instanceof or.ORError || err instanceof TypeError ? or.isTransient(err) : claude.isTransient(err);
}

/** معرّف النموذج المستعمل الآن (يُحفظ مع التقرير). */
export function activeModelId() {
  if (isDS()) return `ds:${state.ai.deepseek?.model || 'auto'}`;
  return isOR() ? `or:${state.ai.openrouter.model || 'auto'}` : state.ai.model;
}

/** اسم مقروء لنموذج محفوظ مع تقرير. */
export function modelLabel(id) {
  if (!id) return '';
  if (id.startsWith('or:')) return `OpenRouter — ${or.modelName(id.slice(3))}`;
  if (id.startsWith('ds:')) return `DeepSeek — ${id.slice(3) === 'auto' ? 'تلقائي' : or.modelName(id.slice(3))}`;
  return MODELS.find((m) => id.startsWith(m.id))?.name || id;
}

/** نص مختصر لشارة الحالة في الرأس. */
export function aiShortLabel() {
  if (isDS()) return `DeepSeek · ${or.modelName(state.ai.deepseek?.model || 'auto')}`;
  if (isOR()) return `مجاني · ${or.modelName(state.ai.openrouter.model)}`;
  return modelInfo().name.replace('Claude ', '');
}

/**
 * حدود التحقق البصري في الطلب الواحد: النماذج المجانية تقبل صورًا أقل،
 * فتُقسَّم المراجعة على دفعات صغيرة.
 */
export function visionLimits() {
  return isOR() ? { candsPerFig: 3, figsPerCall: 2 } : { candsPerFig: 4, figsPerCall: 8 };
}
