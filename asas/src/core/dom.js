/**
 * أدوات DOM صغيرة — بديل خفيف عن أي إطار عمل.
 * h('div.card', { onclick }, [children])
 */

/** يبني عنصرًا من مُحدِّد مختصر مثل `div.card.tight#id`. */
export function h(sel, props = null, children = null) {
  if (props && (Array.isArray(props) || typeof props === 'string' || props instanceof Node)) {
    children = props;
    props = null;
  }
  const [head, ...classes] = String(sel).split('.');
  const [tag, id] = head.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');

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

  add(el, children);
  return el;
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

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** حقل إدخال معنون. */
export function field(label, input, hint) {
  return h('div.field', [h('label', label), input, hint ? h('div.hint', hint) : null]);
}

/** مفتاح تبديل (on/off). */
export function toggle(on, onChange) {
  const el = h('button.switch' + (on ? '.on' : ''), {
    type: 'button',
    role: 'switch',
    'aria-checked': on ? 'true' : 'false',
    onclick: () => {
      el.classList.toggle('on');
      const v = el.classList.contains('on');
      el.setAttribute('aria-checked', v ? 'true' : 'false');
      onChange(v);
    },
  });
  return el;
}

/** صف إعداد: عنوان + وصف + عنصر تحكّم. */
export function settingRow(title, sub, control) {
  return h('div.row-set', [
    h('div.grow', [h('div.t', title), sub ? h('div.s', sub) : null]),
    control,
  ]);
}

/** مجموعة اختيارات على شكل رقائق. */
export function chipGroup(options, value, onPick, { multi = false } = {}) {
  const wrap = h('div.chips');
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

/** حالة فارغة. */
export function empty(icon, text, action) {
  return h('div.empty', [h('div.big', icon), h('div', text), action || null]);
}

/** يؤجّل استدعاء دالة حتى يتوقف التكرار. */
export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
