/** طبقة واجهة مشتركة: إشعارات، أوراق سفلية، تأكيد، إدخال، ومكدّس زرّ الرجوع. */
import { h, fill, icon } from './dom.js';

/* ───── مكدّس الرجوع ───── */
const backStack = [];
export function pushBack(fn) {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}
/** يعيد true إن عالج الرجوع، وfalse إن لم يبقَ ما يُغلق. */
export function handleBack() {
  const fn = backStack.pop();
  if (!fn) return false;
  fn();
  return true;
}

/* ───── إشعار قصير ───── */
let toastTimer;
export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  fill(root, h('div.toast', { class: kind, role: 'status' }, msg));
  toastTimer = setTimeout(() => root.replaceChildren(), 2600);
}

/* ───── ورقة سفلية ───── */
export function sheet(build, { title, onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const body = h('div.sheet-body');
  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' }, [
    h('div.sheet-grab'),
    title ? h('div.sheet-head', [
      h('h2', title),
      h('button.icon-btn', { type: 'button', 'aria-label': 'إغلاق', onclick: () => close() }, icon('close')),
    ]) : null,
    body,
  ]);
  const scrim = h('div.scrim', { onclick: () => close() });
  const wrap = h('div.sheet-wrap', [scrim, panel]);
  let closed = false;
  const unBack = pushBack(() => close(true));

  function close(fromBack = false) {
    if (closed) return;
    closed = true;
    if (!fromBack) unBack();
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    onClose?.();
  }

  const api = { close, body, panel };
  const content = build(api);
  if (content) fill(body, content);
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return api;
}

/** قائمة إجراءات: [{icon, label, danger, run}] */
export function actions(title, items) {
  return sheet(({ close }) => h('div.menu', items.filter(Boolean).map((it) =>
    h('button.menu-item', {
      type: 'button',
      class: it.danger ? 'danger' : '',
      onclick: () => { close(); it.run(); },
    }, [icon(it.icon), h('span', it.label)]))), { title });
}

export function confirmBox(message, { ok = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    sheet(({ close }) => [
      h('p.sheet-msg', message),
      h('div.row-btns', [
        h('button.btn', { type: 'button', onclick: () => close() }, 'إلغاء'),
        h('button.btn.primary', {
          type: 'button',
          class: danger ? 'danger' : '',
          onclick: () => { answered = true; resolve(true); close(); },
        }, ok),
      ]),
    ], { onClose: () => { if (!answered) resolve(false); } });
  });
}

export function promptBox(title, value = '', { ok = 'حفظ', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    sheet(({ close }) => {
      const input = h('input.field', { value, placeholder, dir: 'auto', enterkeyhint: 'done' });
      const submit = () => {
        const v = input.value.trim();
        if (!v) return input.focus();
        done = true;
        resolve(v);
        close();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      setTimeout(() => { input.focus(); input.select(); }, 250);
      return [
        input,
        h('div.row-btns', [
          h('button.btn', { type: 'button', onclick: () => close() }, 'إلغاء'),
          h('button.btn.primary', { type: 'button', onclick: submit }, ok),
        ]),
      ];
    }, { title, onClose: () => { if (!done) resolve(null); } });
  });
}

/* ───── شاشة انتظار بنسبة تقدّم ───── */
export function busy(label) {
  const bar = h('div.busy-bar-fill');
  const text = h('div.busy-text', label);
  const el = h('div.busy', { role: 'alert', 'aria-busy': 'true' }, [
    h('div.busy-card', [h('div.spinner'), text, h('div.busy-bar', bar)]),
  ]);
  document.body.append(el);
  const unBack = pushBack(() => {}); // الرجوع معطّل أثناء العمل
  return {
    set(p, t) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
      if (t) text.textContent = t;
    },
    done() { unBack(); el.remove(); },
  };
}
