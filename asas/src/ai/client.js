/**
 * واجهة الذكاء الاصطناعي الموحّدة: تختار المزوّد حسب الإعدادات.
 *  - OpenRouter (ai/openrouter.js): نماذج مجانية.
 *  - Claude (ai/claude.js): عميل Anthropic الرسمي، الأدق.
 * بقية التطبيق يستدعي هذه الدوال فقط ولا يعرف أي مزوّد يعمل.
 */

import { state, modelInfo, MODELS } from '../core/store.js';
import { fetchConfig, serverProvider } from '../core/server.js';
import * as claude from './claude.js';
import * as or from './openrouter.js';

// فرع DeepSeek يعمل عبر حساب OpenRouter المربوط بنماذج DeepSeek فقط،
// و«خادم التطبيق» يمر بطبقة OpenRouter أو Claude حسب ما اختاره المدير
const isSrv = () => state.ai.provider === 'server';
const isOR = () => state.ai.provider === 'openrouter' || state.ai.provider === 'deepseek' || (isSrv() && serverProvider() !== 'anthropic');
const isDS = () => state.ai.provider === 'deepseek';

export const streamText = (opts) => (isOR() ? or.streamText(opts) : claude.streamText(opts));
export const jsonCall = (opts) => (isOR() ? or.jsonCall(opts) : claude.jsonCall(opts));
export async function testConnection(signal) {
  if (!isSrv()) return isOR() ? or.testConnection(signal) : claude.testConnection(signal);
  const cfg = await fetchConfig({ signal });
  if (!cfg.ready) throw new or.ORError(503, 'ASAS: الخادم متصل، لكن المدير لم يضف مفتاحًا يعمل بعد.');
  const model = cfg.models?.map((m) => m.name).join('، ') || 'تلقائي';
  return { msg: `متصل بخادم ${cfg.appName || 'التطبيق'} — يكتب بـ ${model}${cfg.dailyLimit ? ` — حدّك اليومي ${cfg.dailyLimit} تقارير (استعملت ${cfg.usedToday})` : ''}` };
}

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
  if (isSrv()) return `srv:${serverProvider() === 'anthropic' ? state.server.config?.claudeModel || '' : state.server.config?.models?.[0]?.id || 'auto'}`;
  if (isDS()) return `ds:${state.ai.deepseek?.model || 'auto'}`;
  return isOR() ? `or:${state.ai.openrouter.model || 'auto'}` : state.ai.model;
}

/** اسم مقروء لنموذج محفوظ مع تقرير. */
export function modelLabel(id) {
  if (!id) return '';
  if (id.startsWith('or:')) return `OpenRouter — ${or.modelName(id.slice(3))}`;
  if (id.startsWith('srv:')) {
    const m = id.slice(4);
    return `خادم التطبيق — ${MODELS.find((x) => x.id === m)?.name || state.server.config?.models?.find((x) => x.id === m)?.name || or.modelName(m)}`;
  }
  if (id.startsWith('ds:')) return `DeepSeek — ${id.slice(3) === 'auto' ? 'تلقائي' : or.modelName(id.slice(3))}`;
  return MODELS.find((m) => id.startsWith(m.id))?.name || id;
}

/** نص مختصر لشارة الحالة في الرأس. */
export function aiShortLabel() {
  if (isSrv()) return 'خادم التطبيق';
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
