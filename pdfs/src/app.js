/** الشِل: مكدّس شاشات بسيط مربوط بزرّ الرجوع. */
import { fill } from './core/dom.js';
import { pushBack, handleBack } from './core/ui.js';
import { onBackButton, exitApp } from './core/native.js';

const stack = [];
let root;

export function mount(el) {
  root = el;
  onBackButton(() => { if (!handleBack()) exitApp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') handleBack(); });
}

function show() {
  const top = stack[stack.length - 1];
  fill(root, top.view.el);
  top.view.onShow?.();
}

/** يعرض شاشة جديدة فوق الحالية. */
export function push(screen, ...args) {
  const prev = stack[stack.length - 1];
  prev?.view.onHide?.();
  const view = screen(...args);
  const entry = { view, screen };
  const onBack = () => {
    // الشاشة قد تعترض الرجوع (مثلًا لتسأل عن حفظ التعديلات)؛
    // نعيد تسجيلها أولًا كي تبقى أيّ ورقة تفتحها فوقها في المكدّس
    entry.unBack = pushBack(onBack);
    if (view.onBack?.() === false) return;
    entry.unBack();
    pop(true);
  };
  entry.unBack = pushBack(onBack);
  stack.push(entry);
  show();
  root.scrollTop = 0;
}

/** يغلق الشاشة الحالية. */
export function pop(fromBack = false) {
  if (stack.length <= 1) return;
  const entry = stack.pop();
  if (!fromBack) entry.unBack();
  entry.view.destroy?.();
  show();
}

/** يستبدل كل المكدّس بشاشة واحدة. */
export function reset(screen, ...args) {
  while (stack.length) {
    const e = stack.pop();
    e.unBack?.();
    e.view.destroy?.();
  }
  const view = screen(...args);
  stack.push({ view, screen });
  show();
}

/** هل الشاشة المعروضة الآن من هذا النوع؟ */
export const isTop = (screen) => stack[stack.length - 1]?.screen === screen;
