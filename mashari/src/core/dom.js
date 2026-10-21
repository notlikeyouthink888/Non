/**
 * أدوات DOM صغيرة — بديل خفيف عن أي إطار عمل.
 * h('div.card', { onclick }, [children])
 */

/** يبني عنصرًا من مُحدِّد مختصر مثل `div.card.tight#id`. */
export function h(sel, props = null, children = null) {
  if (props && (Array.isArray(props) || typeof props === 'string' || typeof props === 'number' || props instanceof Node)) {
    children = props;
    props = null;
  }
  const [head, ...classes] = String(sel).split('.');
  const [tag, id] = head.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  applyProps(el, props);
  add(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** عنصر SVG: svg('circle', { r: 10, class: 'dot' }) */
export function svg(tag, attrs = null, children = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list' && typeof v !== 'object') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function add(parent, child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) { child.forEach((c) => add(parent, c)); return; }
  parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

/** يفرّغ عنصرًا ثم يضيف محتوى جديدًا. */
export function fill(el, children) {
  el.replaceChildren();
  add(el, children);
  return el;
}

/** مجموعة اختيارات على شكل رقائق. */
export function chipGroup(options, value, onPick, { multi = false, scroll = false } = {}) {
  const wrap = h('div.chips' + (scroll ? '.scroll' : ''));
  const selected = multi ? new Set(value || []) : value;
  options.forEach((opt) => {
    const val = opt.value ?? opt;
    const on = multi ? selected.has(val) : val === selected;
    const chip = h('button.chip' + (on ? '.on' : ''), {
      type: 'button',
      onclick: () => {
        if (multi) {
          chip.classList.toggle('on');
          if (selected.has(val)) selected.delete(val); else selected.add(val);
          onPick([...selected]);
        } else {
          [...wrap.children].forEach((c) => c.classList.remove('on'));
          chip.classList.add('on');
          onPick(val);
        }
      },
    }, opt.label ?? String(opt));
    wrap.append(chip);
  });
  return wrap;
}

/** مفتاح تبديل (on/off). */
export function toggle(on, onChange) {
  const el = h('button.switch' + (on ? '.on' : ''), {
    type: 'button',
    role: 'switch',
    'aria-checked': String(!!on),
    onclick: () => {
      el.classList.toggle('on');
      const now = el.classList.contains('on');
      el.setAttribute('aria-checked', String(now));
      onChange(now);
    },
  });
  return el;
}

/** صف إعداد: عنوان + وصف + عنصر تحكّم. */
export function settingRow(title, sub, control) {
  return h('div.item', [
    h('div.grow', [h('div.t', title), sub ? h('div.s', sub) : null]),
    control,
  ]);
}

/** حقل إدخال معنون. */
export function field(label, input, hint) {
  return h('div.field', [h('label', label), input, hint ? h('div.muted.hint', hint) : null]);
}

/** حالة فارغة. */
export function empty(icon, text, action = null) {
  return h('div.empty', [h('span.big', icon), h('div', text), action]);
}

/** يكبّر حقل النص تلقائيًا مع الكتابة. */
export function autoGrow(textarea) {
  const fit = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight + 2, 900) + 'px';
  };
  textarea.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return textarea;
}
