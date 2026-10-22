/** محرّر الصفحة: قصّ بنسب جاهزة أو حرّ، تدوير، قلب، فلاتر، سطوع وتباين. */
import { h, fill, icon, chips } from '../core/dom.js';
import { confirmBox } from '../core/ui.js';
import { n } from '../core/fmt.js';
import { blobs } from '../core/db.js';
import {
  FILTERS, FULL_CROP, renderEdits, rotateEdits, flipEdits, rotatedSize, sourceBitmap, toBlob,
} from '../core/image.js';
import { draft, pageIndex, updatePage } from '../core/project.js';
import { pop } from '../app.js';

const RATIOS = [
  { id: 'free', label: 'حرّ', r: null },
  { id: '1:1', label: '١:١', r: 1 },
  { id: '3:4', label: '٣:٤', r: 3 / 4 },
  { id: '4:3', label: '٤:٣', r: 4 / 3 },
  { id: 'a4', label: 'A4', r: 1 / Math.SQRT2 },
  { id: 'a4l', label: 'A4 أفقي', r: Math.SQRT2 },
  { id: '16:9', label: '١٦:٩', r: 16 / 9 },
];

const MIN = 36; // أصغر ضلع للقص بالبكسل المعروض

export function editorScreen(pageId) {
  let id = pageId;
  let page, e, bmp, ratio = null, tab = 'crop', dirty = false;
  let img = { x: 0, y: 0, w: 1, h: 1 }; // مكان الصورة المعروضة داخل المسرح
  let renderToken = 0;

  const title = h('div.editor-title');
  const prevBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'الصفحة السابقة', onclick: () => go(-1) }, icon('back', 20));
  const nextBtn = h('button.icon-btn.flip-x', { type: 'button', 'aria-label': 'الصفحة التالية', onclick: () => go(1) }, icon('back', 20));
  const view = h('canvas.editor-canvas');
  const box = h('div.crop-box', [
    h('div.crop-grid'),
    ...['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'].map((k) => h(`div.handle.h-${k}`, { 'data-h': k })),
  ]);
  const stage = h('div.stage', [view, box]);
  const panel = h('div.editor-panel');
  const tabs = h('div.editor-tabs');

  /* ── تحميل صفحة ── */
  async function load(pid) {
    id = pid;
    page = draft.pages[pageIndex(id)];
    if (!page) return pop();
    e = structuredClone({ rotation: page.rotation, flipH: page.flipH, crop: page.crop, filter: page.filter, brightness: page.brightness, contrast: page.contrast });
    dirty = false;
    ratio = null;
    const i = pageIndex(id);
    title.textContent = `الصفحة ${n(i + 1)} من ${n(draft.pages.length)}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === draft.pages.length - 1;
    bmp = await sourceBitmap(page.src, await blobs.get(page.src));
    await redraw();
    renderPanel();
  }

  function commit() {
    if (dirty) updatePage(id, e);
    dirty = false;
  }

  function go(d) {
    const i = pageIndex(id) + d;
    if (i < 0 || i >= draft.pages.length) return;
    commit();
    load(draft.pages[i].id);
  }

  /* ── الرسم ── */
  async function redraw() {
    const token = ++renderToken;
    await new Promise((r) => requestAnimationFrame(r));
    if (token !== renderToken || !bmp) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxDim = Math.max(stage.clientWidth, stage.clientHeight) * dpr;
    const c = renderEdits(bmp, e, { maxDim: Math.min(1800, maxDim || 1200), crop: false });
    view.width = c.width;
    view.height = c.height;
    view.getContext('2d').drawImage(c, 0, 0);
    layout();
  }

  function layout() {
    const pad = 22;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    const k = Math.min((sw - pad * 2) / view.width, (sh - pad * 2) / view.height);
    img = { w: view.width * k, h: view.height * k };
    img.x = (sw - img.w) / 2;
    img.y = (sh - img.h) / 2;
    Object.assign(view.style, { left: `${img.x}px`, top: `${img.y}px`, width: `${img.w}px`, height: `${img.h}px` });
    placeBox();
  }

  function placeBox() {
    const c = e.crop;
    Object.assign(box.style, {
      left: `${img.x + c.x * img.w}px`,
      top: `${img.y + c.y * img.h}px`,
      width: `${c.w * img.w}px`,
      height: `${c.h * img.h}px`,
    });
    box.hidden = tab !== 'crop';
    box.classList.toggle('locked', ratio != null);
  }

  /* ── تفاعل القص ── */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let gesture = null;

  box.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const hd = ev.target.dataset.h || 'move';
    if (ratio != null && hd.length === 1) return; // مع النسبة المقفلة: الزوايا فقط
    const c = e.crop;
    gesture = {
      hd,
      sx: ev.clientX,
      sy: ev.clientY,
      b: { x: c.x * img.w, y: c.y * img.h, w: c.w * img.w, h: c.h * img.h },
    };
    box.setPointerCapture(ev.pointerId);
    box.classList.add('active');
  });

  box.addEventListener('pointermove', (ev) => {
    if (!gesture) return;
    const dx = ev.clientX - gesture.sx, dy = ev.clientY - gesture.sy;
    const { b, hd } = gesture;
    const W = img.w, H = img.h;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;

    if (hd === 'move') {
      const nx = clamp(b.x + dx, 0, W - b.w), ny = clamp(b.y + dy, 0, H - b.h);
      x1 = nx; y1 = ny; x2 = nx + b.w; y2 = ny + b.h;
    } else {
      const L = hd.includes('l'), R = hd.includes('r'), T = hd.includes('t'), B = hd.includes('b');
      if (L) x1 = clamp(x1 + dx, 0, x2 - MIN);
      if (R) x2 = clamp(x2 + dx, x1 + MIN, W);
      if (T) y1 = clamp(y1 + dy, 0, y2 - MIN);
      if (B) y2 = clamp(y2 + dy, y1 + MIN, H);
      if (ratio != null) {
        const ax = L ? b.x + b.w : b.x, ay = T ? b.y + b.h : b.y; // الزاوية المقابلة ثابتة
        let w = x2 - x1, h = y2 - y1;
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
        const maxW = L ? ax : W - ax, maxH = T ? ay : H - ay;
        if (w > maxW) { w = maxW; h = w / ratio; }
        if (h > maxH) { h = maxH; w = h * ratio; }
        x1 = L ? ax - w : ax; x2 = x1 + w;
        y1 = T ? ay - h : ay; y2 = y1 + h;
      }
    }
    e.crop = { x: x1 / W, y: y1 / H, w: (x2 - x1) / W, h: (y2 - y1) / H };
    dirty = true;
    placeBox();
  });

  const endGesture = () => { gesture = null; box.classList.remove('active'); };
  box.addEventListener('pointerup', endGesture);
  box.addEventListener('pointercancel', endGesture);

  function applyRatio(rid) {
    ratio = RATIOS.find((r) => r.id === rid)?.r ?? null;
    if (ratio != null) {
      const R = rotatedSize(bmp.width, bmp.height, e.rotation);
      const iw = R.w, ih = R.h;
      let w = iw, hh = iw / ratio;
      if (hh > ih) { hh = ih; w = ih * ratio; }
      e.crop = { x: (iw - w) / 2 / iw, y: (ih - hh) / 2 / ih, w: w / iw, h: hh / ih };
      dirty = true;
    }
    placeBox();
  }

  /* ── الألواح ── */
  function tool(ic, label, run) {
    return h('button.tool', { type: 'button', onclick: run }, [icon(ic, 22), h('span', label)]);
  }

  function cropPanel() {
    return [
      chips(RATIOS.map(({ id: i, label }) => ({ id: i, label })), RATIOS.find((r) => r.r === ratio)?.id || 'free', applyRatio),
      h('div.tools', [
        tool('rotl', 'يسار', () => { e = rotateEdits(e, -1); ratio = null; dirty = true; redraw(); renderPanel(); }),
        tool('rotr', 'يمين', () => { e = rotateEdits(e, 1); ratio = null; dirty = true; redraw(); renderPanel(); }),
        tool('flip', 'قلب', () => { e = flipEdits(e); dirty = true; redraw(); }),
        tool('crop', 'كامل الصورة', () => { e.crop = { ...FULL_CROP }; ratio = null; dirty = true; placeBox(); renderPanel(); }),
      ]),
    ];
  }

  let previewUrls = [];
  function filterPanel() {
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    previewUrls = [];
    const row = h('div.filters');
    for (const f of FILTERS) {
      const im = h('img', { alt: '' });
      const btn = h('button.filter', {
        type: 'button',
        class: e.filter === f.id ? 'on' : '',
        'aria-pressed': String(e.filter === f.id),
        onclick: () => { e.filter = f.id; dirty = true; redraw(); renderPanel(); },
      }, [h('div.filter-img', im), h('span', f.label)]);
      row.append(btn);
      // معاينة صغيرة للفلتر على الجزء المقصوص
      setTimeout(async () => {
        const c = renderEdits(bmp, { ...e, filter: f.id }, { maxDim: 140 });
        const u = URL.createObjectURL(await toBlob(c, 'image/jpeg', 0.75));
        previewUrls.push(u);
        im.src = u;
      }, 0);
    }
    return row;
  }

  function slider(label, key) {
    const out = h('output', n(e[key]));
    const input = h('input.range', { type: 'range', min: -100, max: 100, step: 1, value: e[key], 'aria-label': label });
    input.addEventListener('input', () => {
      e[key] = Number(input.value);
      out.textContent = n(e[key]);
      dirty = true;
      redraw();
    });
    return h('label.slider', [h('div.slider-head', [h('span', label), out]), input]);
  }

  function adjustPanel() {
    return [
      slider('السطوع', 'brightness'),
      slider('التباين', 'contrast'),
      h('button.btn.small', {
        type: 'button',
        onclick: () => { e.brightness = 0; e.contrast = 0; dirty = true; redraw(); renderPanel(); },
      }, 'إعادة الضبط'),
    ];
  }

  function renderPanel() {
    fill(tabs, [
      ['crop', 'crop', 'قصّ'],
      ['filter', 'filter', 'فلاتر'],
      ['adjust', 'sliders', 'ضبط'],
    ].map(([k, ic, label]) => h('button.etab', {
      type: 'button',
      class: tab === k ? 'on' : '',
      onclick: () => { tab = k; renderPanel(); placeBox(); },
    }, [icon(ic, 20), h('span', label)])));
    fill(panel, tab === 'crop' ? cropPanel() : tab === 'filter' ? filterPanel() : adjustPanel());
  }

  /* ── الخروج ── */
  function done() {
    commit();
    pop();
  }

  function cancel() {
    if (!dirty) return true;
    confirmBox('تجاهل التعديلات على هذه الصفحة؟', { ok: 'تجاهل', danger: true }).then((yes) => {
      if (yes) { dirty = false; pop(); }
    });
    return false;
  }

  const el = h('div.screen.editor', [
    h('header.topbar.dark', [
      h('button.icon-btn', { type: 'button', 'aria-label': 'إلغاء', onclick: () => { if (cancel()) pop(); } }, icon('close')),
      h('div.editor-nav', [prevBtn, title, nextBtn]),
      h('button.icon-btn.accent', { type: 'button', 'aria-label': 'تم', onclick: done }, icon('check')),
    ]),
    stage,
    h('div.editor-bottom', [panel, tabs]),
  ]);

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  load(id);

  return {
    el,
    onBack: cancel,
    destroy: () => {
      ro.disconnect();
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
