/**
 * الطبقات المنبثقة المشتركة: تنبيهات، أوراق سفلية، تأكيد، إدخال.
 * كل ورقة تُسجَّل في مكدّس حتى يغلقها زر الرجوع في أندرويد أو المتصفح.
 */

import { h, fill } from './dom.js';
import { icon } from './icons.js';

const toastRoot = () => document.getElementById('toast-root');
const sheetRoot = () => document.getElementById('sheet-root');

/** مكدّس الطبقات المفتوحة — أعلاها يُغلق أولًا عند الرجوع. */
const stack = [];

export function topModalClose() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasModal() { return stack.length > 0; }

export function toast(msg, kind = '', ms = 2600) {
  const el = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, msg);
  toastRoot().append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/**
 * ورقة منبثقة من الأسفل.
 * body: عنصر أو دالة تستقبل ({ close, setBody }).
 */
export function sheet(title, body, { onClose, wide = false, full = false } = {}) {
  const root = sheetRoot();
  const scrim = h('div.scrim', { onclick: () => close() });
  const panel = h('div.sheet' + (wide ? '.wide' : '') + (full ? '.full' : ''), { role: 'dialog', 'aria-modal': 'true' });
  let closed = false;
  const api = { close, panel, setBody, setTitle };
  let titleText = title;

  function head() {
    return h('div.sheet-head', [
      h('div.grab'),
      titleText ? h('h3', titleText) : null,
      h('button.icon-btn.sheet-x', { type: 'button', 'aria-label': 'إغلاق', onclick: () => close() }, icon('x', 20)),
    ]);
  }

  function setBody(content) {
    fill(panel, [head(), h('div.sheet-body', typeof content === 'function' ? content(api) : content)]);
  }

  function setTitle(t) { titleText = t; const el = panel.querySelector('.sheet-head h3'); if (el) el.textContent = t; }

  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    panel.classList.add('out');
    scrim.classList.add('out');
    setTimeout(() => { scrim.remove(); panel.remove(); }, 180);
    onClose?.();
  }

  setBody(body);
  root.append(scrim, panel);
  stack.push(api);
  return api;
}

export function confirmSheet(title, message, { danger = true, okText = 'تأكيد', cancelText = 'إلغاء' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    sheet(title, ({ close }) => h('div', [
      h('p.muted.lead', message),
      h('div.grid2.mt', [
        h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(false); } }, cancelText),
        h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => { decided = true; close(); resolve(true); } }, okText),
      ]),
    ]), { onClose: () => { if (!decided) resolve(false); } });
  });
}

/** إدخال نصي سريع في ورقة. */
export function promptSheet(title, { value = '', placeholder = '', multiline = false, okText = 'حفظ', hint = '' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const input = multiline
      ? h('textarea', { value, placeholder, rows: 5 })
      : h('input', { value, placeholder });
    sheet(title, ({ close }) => h('div', [
      hint ? h('p.muted', hint) : null,
      input,
      h('div.grid2.mt', [
        h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(null); } }, 'إلغاء'),
        h('button.btn.primary', { onclick: () => { decided = true; close(); resolve(input.value.trim()); } }, okText),
      ]),
    ]), { onClose: () => { if (!decided) resolve(null); } });
    setTimeout(() => input.focus(), 150);
  });
}

/** قائمة إجراءات سريعة. */
export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    let picked = false;
    sheet(title, ({ close }) => h('div.actions-list', actions.filter(Boolean).map((a) => h('button.action-item' + (a.danger ? '.danger' : ''), {
      type: 'button',
      onclick: () => { picked = true; close(); resolve(a.value); },
    }, [a.icon ? icon(a.icon, 20) : null, h('span.grow', a.label), a.sub ? h('span.muted', a.sub) : null]))),
    { onClose: () => { if (!picked) resolve(null); } });
  });
}

export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* غير مدعوم */ }
}

/** يطبّق السمة وحجم الخط. */
export function applyTheme(ui) {
  const root = document.documentElement;
  let theme = ui.theme;
  if (theme === 'auto') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  root.dataset.theme = theme;
  root.dataset.fs = ui.fontSize || 'm';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F6F7F9' : '#0E1116');
}
