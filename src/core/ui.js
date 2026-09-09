/** طبقات الواجهة المشتركة: تنبيهات، أوراق منبثقة، تأكيد، اهتزاز. */

import { h, fill } from './dom.js';
import { state } from './store.js';

const toastRoot = () => document.getElementById('toast-root');
const sheetRoot = () => document.getElementById('sheet-root');

export function toast(msg, kind = '') {
  const el = h('div.toast' + (kind ? '.' + kind : ''), msg);
  toastRoot().append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

/**
 * ورقة منبثقة من الأسفل.
 * body: عنصر أو دالة تستقبل ({ close }).
 */
export function sheet(title, body, { onClose } = {}) {
  const root = sheetRoot();
  const scrim = h('div.scrim', { onclick: () => close() });
  const panel = h('div.sheet');
  const api = { close, panel, setBody };

  function setBody(content) {
    fill(panel, [
      h('div.grab'),
      title ? h('h3', title) : null,
      typeof content === 'function' ? content(api) : content,
    ]);
  }

  function close() {
    scrim.remove();
    panel.remove();
    onClose?.();
  }

  setBody(body);
  root.append(scrim, panel);
  return api;
}

export function confirmSheet(title, message, { danger = true, okText = 'تأكيد' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const s = sheet(title, ({ close }) => h('div', [
      h('p.muted', { style: { marginTop: '0' } }, message),
      h('div.grid2', { style: { marginTop: '14px' } }, [
        h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(false); } }, 'إلغاء'),
        h('button.btn' + (danger ? '.danger' : '.primary'), {
          onclick: () => { decided = true; close(); resolve(true); },
        }, okText),
      ]),
    ]), { onClose: () => { if (!decided) resolve(false); } });
    return s;
  });
}

/** إدخال نصي سريع في ورقة. */
export function promptSheet(title, { value = '', placeholder = '', multiline = false, okText = 'حفظ' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const input = multiline
      ? h('textarea', { value, placeholder })
      : h('input', { value, placeholder });
    sheet(title, ({ close }) => h('div', [
      input,
      h('div.grid2', { style: { marginTop: '14px' } }, [
        h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(null); } }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => { decided = true; close(); resolve(input.value.trim()); },
        }, okText),
      ]),
    ]), { onClose: () => { if (!decided) resolve(null); } });
    setTimeout(() => input.focus(), 120);
  });
}

/** اهتزاز خفيف عند التفاعل (يُحترم إعداد المستخدم). */
export function haptic(ms = 12) {
  if (!state.settings.haptics) return;
  try { navigator.vibrate?.(ms); } catch { /* غير مدعوم */ }
}

/** يطبّق لون التمييز المختار على المتغيّرات. */
export function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
}
