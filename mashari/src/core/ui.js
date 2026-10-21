/** طبقات الواجهة المشتركة: تنبيهات، أوراق منبثقة، قوائم، تأكيد، اهتزاز، وزر الرجوع. */

import { h, fill } from './dom.js';
import { state } from './store.js';

/* ────────── سجلّ الطبقات (حتى يسكّر زر الرجوع آخر شي انفتح) ────────── */

const layers = [];

/** يسجّل طبقة تنغلق بزر الرجوع. يعيد دالة تشيلها من السجل. */
export function registerLayer(close) {
  layers.push(close);
  return () => {
    const i = layers.lastIndexOf(close);
    if (i >= 0) layers.splice(i, 1);
  };
}

/** يسكّر آخر طبقة مفتوحة. يعيد false إذا ماكو شي مفتوح. */
export function closeTopLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top();
  return true;
}

/**
 * صفحة كاملة فوق الشاشة (دراسة مشروع، الخريطة، المقارنة…).
 * build(el, { close }) يبني محتواها. زر الرجوع يسكّرها.
 */
export function openPage(build, { onClose, className = '' } = {}) {
  const root = document.getElementById('layer-root');
  const el = h('div.page' + (className ? '.' + className : ''));
  let closed = false;
  const unregister = registerLayer(() => close());
  function close() {
    if (closed) return;
    closed = true;
    unregister();
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
    onClose?.();
  }
  root.append(el);
  build(el, { close });
  return { el, close };
}

/* ────────── التنبيهات ────────── */

export function toast(msg, kind = '', { action, onAction, ms = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  const el = h('div.toast' + (kind ? '.' + kind : ''), [
    h('span', msg),
    action ? h('button.toast-act', { onclick: () => { onAction?.(); dismiss(); } }, action) : null,
  ]);
  root.append(el);
  let gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }
  setTimeout(dismiss, action ? ms + 1800 : ms);
  return dismiss;
}

/* ────────── الأوراق المنبثقة ────────── */

/**
 * ورقة من الأسفل. body: عنصر أو دالة تستقبل ({ close, setBody }).
 */
export function sheet(title, body, { onClose, wide = false } = {}) {
  const root = document.getElementById('sheet-root');
  const scrim = h('div.scrim', { onclick: () => close() });
  const panel = h('div.sheet' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' });
  let closed = false;
  const unregister = registerLayer(() => close());
  const api = { close, panel, setBody };

  function setBody(content) {
    fill(panel, [
      h('div.grab'),
      title ? h('h3', title) : null,
      typeof content === 'function' ? content(api) : content,
    ]);
  }

  function close() {
    if (closed) return;
    closed = true;
    unregister();
    scrim.classList.add('out');
    panel.classList.add('out');
    setTimeout(() => { scrim.remove(); panel.remove(); }, 190);
    onClose?.();
  }

  setBody(body);
  root.append(scrim, panel);
  return api;
}

export function confirmSheet(title, message, { danger = true, okText = 'تأكيد', cancelText = 'إلغاء' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    sheet(title, ({ close }) => h('div', [
      h('p.sheet-msg', message),
      h('div.grid2', [
        h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(false); } }, cancelText),
        h('button.btn' + (danger ? '.danger' : '.primary'), {
          onclick: () => { decided = true; close(); resolve(true); },
        }, okText),
      ]),
    ]), { onClose: () => { if (!decided) resolve(false); } });
  });
}

/** إدخال نصي سريع. يعيد النص أو null عند الإلغاء. */
export function promptSheet(title, { value = '', placeholder = '', multiline = false, okText = 'حفظ', hint = '', maxLength = 400 } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const input = multiline
      ? h('textarea', { value, placeholder, maxLength, rows: 3 })
      : h('input', { value, placeholder, maxLength, enterKeyHint: 'done' });
    const submit = (close) => { decided = true; close(); resolve(input.value.trim()); };
    sheet(title, ({ close }) => {
      if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(close); } });
      return h('div', [
        input,
        hint ? h('div.muted.hint', hint) : null,
        h('div.grid2', { style: { marginTop: '14px' } }, [
          h('button.btn.ghost', { onclick: () => { decided = true; close(); resolve(null); } }, 'إلغاء'),
          h('button.btn.primary', { onclick: () => submit(close) }, okText),
        ]),
      ]);
    }, { onClose: () => { if (!decided) resolve(null); } });
    setTimeout(() => {
      input.focus();
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch { /* غير مدعوم */ }
    }, 160);
  });
}

/** قائمة إجراءات: [{ icon, label, sub, danger, onClick }] */
export function menuSheet(title, items) {
  return sheet(title, ({ close }) => h('div.menu', items.filter(Boolean).map((it) =>
    h('button.menu-item' + (it.danger ? '.danger' : ''), {
      type: 'button',
      onclick: () => { close(); it.onClick?.(); },
    }, [
      h('span.mi-ico', it.icon || '•'),
      h('span.grow', [h('span.mi-t', it.label), it.sub ? h('span.mi-s', it.sub) : null]),
    ]),
  )));
}

/* ────────── متفرقات ────────── */

/** اهتزاز خفيف عند التفاعل (حسب إعداد المستخدم). */
export function haptic(ms = 10) {
  if (!state.settings.haptics) return;
  try { navigator.vibrate?.(ms); } catch { /* غير مدعوم */ }
}

const lightQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/** يطبّق المظهر: داكن، فاتح، أو حسب الجهاز. */
export function applyTheme(theme = state.settings.theme) {
  const resolved = theme === 'auto' ? (lightQuery?.matches ? 'light' : 'dark') : theme;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#F4F6FA' : '#0D1117');
}

lightQuery?.addEventListener?.('change', () => {
  if (state.settings.theme === 'auto') applyTheme('auto');
});
