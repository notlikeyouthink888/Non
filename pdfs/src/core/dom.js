/** إنشاء عناصر بأسلوب hyperscript: h('div.card#x', {onclick}, [children]) */
export function h(sel, props, children) {
  if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) {
    children = props;
    props = null;
  }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) children.forEach((c) => append(el, c));
  else el.append(children instanceof Node ? children : String(children));
}

export function fill(el, children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** أيقونات SVG خطّية صغيرة. */
const PATHS = {
  back: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  share: 'M12 4v11M8 8l4-4 4 4M5 13v6h14v-6',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  rotl: 'M4 8V4M4 8h4M4.5 8A8 8 0 1 1 6 16.5',
  rotr: 'M20 8V4M20 8h-4M19.5 8A8 8 0 1 0 18 16.5',
  flip: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  crop: 'M7 3v14h14M3 7h14v14',
  filter: 'M12 3a9 9 0 1 0 0 18V3zM12 3a9 9 0 0 1 0 18',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  check: 'M5 12l5 5 9-10',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  first: 'M17 6l-6 6 6 6M7 6v12',
  last: 'M7 6l6 6-6 6M17 6v12',
  swap: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
};

export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ic');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', PATHS[name] || PATHS.file);
  svg.append(p);
  return svg;
}

/** مجموعة أزرار اختيار واحد. */
export function chips(options, value, onChange) {
  const wrap = h('div.chips', { role: 'radiogroup' });
  const render = (v) => {
    fill(wrap, options.map((o) => h('button.chip', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.id === v),
      class: o.id === v ? 'on' : '',
      onclick: () => { render(o.id); onChange(o.id); },
    }, o.label)));
  };
  render(value);
  return wrap;
}

export function toggle(value, onChange) {
  const el = h('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(!!value) });
  el.addEventListener('click', () => {
    const v = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return el;
}
