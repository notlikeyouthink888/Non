/**
 * ربط الحساب بلا نسخ مفاتيح (OAuth PKCE من OpenRouter): يفتح صفحة تسجيل الدخول (Google أو بريد…)،
 * ثم يعود إلى التطبيق برمز يُبادَل بمفتاح يُحفظ في الجهاز. يستعمله فرع DeepSeek.
 * DeepSeek نفسه لا يتيح لتطبيقات أخرى الكتابة بحساب موقعه، فالنماذج تصل عبر حساب OpenRouter المجاني.
 */

import { state, save } from '../core/store.js';
import { exchangeCode } from './openrouter.js';

const VKEY = 'asas.pkce';

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** رابط العودة: صفحة الإعدادات في التطبيق نفسه. */
export function callbackUrl() {
  return `${location.origin}${location.pathname}#/settings`;
}

/** يبدأ الربط: يحفظ المتحقِّق ثم ينتقل إلى صفحة تسجيل الدخول. */
export async function startLink(provider = 'deepseek') {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = b64url(digest);
  localStorage.setItem(VKEY, JSON.stringify({ verifier, provider, at: Date.now() }));
  const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl())}&code_challenge=${challenge}&code_challenge_method=S256`;
  location.assign(url);
}

/** رمز العودة إن وُجد في الرابط (قبل # أو داخله). */
function codeInUrl() {
  const fromSearch = new URLSearchParams(location.search).get('code');
  if (fromSearch) return fromSearch;
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('code') : null;
}

/**
 * يكمل الربط عند العودة: يبادل الرمز بمفتاح ويفعّل المزوّد.
 * @returns {Promise<null | { ok: boolean, msg: string }>}
 */
export async function handleCallback() {
  const code = codeInUrl();
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(VKEY) || 'null'); } catch { pending = null; }
  if (!code || !pending?.verifier) return null;
  localStorage.removeItem(VKEY);
  // يُزال الرمز من الرابط حتى لا يُعاد استعماله
  history.replaceState(null, '', `${location.origin}${location.pathname}#/settings`);
  try {
    const key = await exchangeCode(code, pending.verifier);
    state.ai.openrouter.apiKey = key;
    state.ai.provider = pending.provider || 'deepseek';
    state.ai.deepseek = { ...(state.ai.deepseek || {}), linked: true };
    save(true);
    return { ok: true, msg: 'رُبط حسابك وتفعّل DeepSeek ✓' };
  } catch (err) {
    return { ok: false, msg: `تعذّر إكمال الربط: ${err.message || ''}` };
  }
}

/** يفك الربط (يحذف المفتاح المحفوظ). */
export function unlink() {
  state.ai.openrouter.apiKey = '';
  state.ai.deepseek = { ...(state.ai.deepseek || {}), linked: false };
  save(true);
}
