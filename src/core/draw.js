/**
 * محرّر رسم احترافي يعمل بقلم سامسونغ (S Pen) وبالإصبع.
 *
 *  • يقرأ ضغط القلم (pressure) فتتغيّر سماكة الخط طبيعيًا.
 *  • رفض راحة اليد: ما دام القلم يعمل، تُتجاهَل لمسات الإصبع للرسم
 *    ويبقى الإصبع للتحريك والتكبير.
 *  • أدوات: قلم، مُبرِز شفّاف، ممحاة (تحذف المسار كاملًا)، مسطرة خط مستقيم.
 *  • لوح يمتد للأسفل بلا نهاية (زر «صفحة أخرى»).
 *  • يُحفظ كمسارات (vector) في IndexedDB فيبقى خفيفًا وقابلًا للتعديل لاحقًا،
 *    مع معاينة PNG تُعرض داخل البطاقات.
 */

import '../styles/draw.css';
import { h, fill } from './dom.js';
import { idb } from './idb.js';
import { uid } from './store.js';
import { toast, haptic } from './ui.js';

export const PEN_COLORS = [
  '#e9edf5', '#7c5cff', '#22d3ee', '#34d399',
  '#fbbf24', '#f87171', '#f472b6', '#0b0e14',
];
const WIDTHS = [1.6, 3, 6, 11];
const PAGE_W = 1240;
const PAGE_H = 1750;

/* ─────────────────── التخزين ─────────────────── */

/** يقرأ رسمًا محفوظًا: { strokes, pages, updatedAt } */
export async function loadDrawing(id) {
  if (!id) return null;
  return (await idb.get('drawings', id)) || null;
}

export async function saveDrawing(id, data) {
  await idb.set('drawings', id, data);
}

export async function deleteDrawing(id) {
  if (!id) return;
  await idb.del('drawings', id);
  await idb.del('blobs', `${id}.preview`);
}

/** معاينة PNG كرابط عرض، أو null. */
export async function drawingPreview(id) {
  if (!id) return null;
  const blob = await idb.get('blobs', `${id}.preview`);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function drawingInfo(id) {
  const d = await loadDrawing(id);
  if (!d) return null;
  return { strokes: d.strokes?.length || 0, pages: d.pages || 1, updatedAt: d.updatedAt || 0 };
}

/* ─────────────────── الرسم على لوحة ─────────────────── */

/** يرسم كل المسارات على سياق معيّن (يُستعمل للعرض والمعاينة). */
export function paintStrokes(ctx, strokes, { background = '#0f141d', width, height } = {}) {
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const s of strokes) {
    if (!s.points?.length) continue;
    ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;

    if (s.points.length === 1) {
      const [x, y, p] = s.points[0];
      ctx.beginPath();
      ctx.arc(x, y, (s.width * (0.4 + p * 0.8)) / 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      continue;
    }

    // مقاطع منفصلة حتى تتغيّر السماكة مع ضغط القلم
    for (let i = 1; i < s.points.length; i++) {
      const [x0, y0, p0] = s.points[i - 1];
      const [x1, y1, p1] = s.points[i];
      ctx.lineWidth = s.width * (0.4 + ((p0 + p1) / 2) * 0.8);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** يبني معاينة PNG ويحفظها بجانب الرسم. */
async function buildPreview(id, strokes, pages) {
  const w = 620;
  const h = Math.round((PAGE_H * pages * w) / PAGE_W);
  const maxH = 900;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.min(maxH, h);
  const ctx = canvas.getContext('2d');
  const scale = w / PAGE_W;
  ctx.fillStyle = '#0f141d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  paintStrokes(ctx, strokes, { background: null });

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (blob) await idb.set('blobs', `${id}.preview`, blob);
}

/* ─────────────────── المحرّر ─────────────────── */

/**
 * يفتح محرّر الرسم بملء الشاشة.
 * @param {{ id?: string, title?: string, onSave?: (id) => void }} opts
 */
export function openDrawing({ id, title = 'ملاحظة رسم', onSave } = {}) {
  const drawingId = id || uid('dr_');

  // تُملأ من التخزين بعد ظهور اللوحة مباشرة، فلا ينتظر المستخدم فتحها
  const strokes = [];
  const undone = [];
  let pages = 1;
  let loaded = false;

  let tool = 'pen';
  let color = PEN_COLORS[0];
  let width = WIDTHS[1];
  let straight = false;

  // تحويل العرض: إزاحة وتكبير
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let fitted = false;

  let penSeen = false;          // هل استُعمل قلم في هذه الجلسة؟
  let dirty = false;

  const canvas = h('canvas.draw-canvas');
  const ctx = canvas.getContext('2d');
  const hint = h('div.draw-hint', 'ارسم بالقلم · حرّك وكبّر بإصبعين');

  const overlay = h('div.draw-overlay');
  const undoBtn = h('button', { title: 'تراجع', onclick: doUndo }, '↶');
  const redoBtn = h('button', { title: 'إعادة', onclick: doRedo }, '↷');
  const info = h('div.sub', '');

  /* ── القياس والرسم ── */
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    if (!fitted) { fitToWidth(); fitted = true; }
    redraw();
  }

  function fitToWidth() {
    const rect = canvas.getBoundingClientRect();
    scale = (rect.width - 16) / PAGE_W;
    offX = 8;
    offY = 8;
  }

  const toWorld = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - offX) / scale, y: (cy - r.top - offY) / scale };
  };

  function redraw() {
    const w = canvas.width / dpr;
    const hgt = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f141d';
    ctx.fillRect(0, 0, w, hgt);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // ورق الصفحات
    const totalH = PAGE_H * pages;
    ctx.fillStyle = '#141a26';
    ctx.fillRect(0, 0, PAGE_W, totalH);

    // خطوط مسطّرة خفيفة
    ctx.strokeStyle = 'rgba(154,166,189,.09)';
    ctx.lineWidth = 1 / scale;
    for (let y = 60; y < totalH; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
    // فواصل الصفحات
    ctx.strokeStyle = 'rgba(124,92,255,.35)';
    ctx.lineWidth = 2 / scale;
    for (let p = 1; p < pages; p++) {
      ctx.beginPath();
      ctx.moveTo(0, PAGE_H * p);
      ctx.lineTo(PAGE_W, PAGE_H * p);
      ctx.stroke();
    }

    paintStrokes(ctx, strokes, { background: null });
    ctx.restore();

    undoBtn.disabled = !strokes.length;
    redoBtn.disabled = !undone.length;
    info.textContent = `${strokes.length} خط · ${pages} صفحة`;
  }

  /* ── الإدخال ── */
  const pointers = new Map();
  let drawingStroke = null;
  let pinchStart = 0;
  let pinchScale = 1;
  let pinchMid = null;

  const isDrawPointer = (e) => {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse') return true;
    // الإصبع يرسم فقط إن لم يُستعمل قلم في هذه الجلسة (رفض راحة اليد)
    return e.pointerType === 'touch' && !penSeen && pointers.size <= 1;
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (e.pointerType === 'pen') {
      penSeen = true;
      hint.style.opacity = '0';
    }

    if (pointers.size === 2) {
      // بدء تكبير/تحريك — ألغِ أي خط بدأ بالخطأ
      if (drawingStroke) {
        strokes.pop();
        drawingStroke = null;
        redraw();
      }
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchScale = scale;
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }

    if (pointers.size === 1 && isDrawPointer(e)) {
      const p = toWorld(e.clientX, e.clientY);
      drawingStroke = {
        tool, color,
        width: tool === 'marker' ? width * 2.6 : width,
        points: [[p.x, p.y, pressureOf(e)]],
      };
      if (tool === 'eraser') {
        drawingStroke = null;
        eraseAt(p);
      } else {
        strokes.push(drawingStroke);
        undone.length = 0;
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = Math.max(0.25, Math.min(6, pinchScale * (d / pinchStart)));
      const r = canvas.getBoundingClientRect();
      // ثبّت النقطة الوسطى أثناء التكبير
      const wx = (pinchMid.x - r.left - offX) / scale;
      const wy = (pinchMid.y - r.top - offY) / scale;
      scale = next;
      offX = mid.x - r.left - wx * scale;
      offY = mid.y - r.top - wy * scale;
      pinchMid = mid;
      redraw();
      return;
    }

    if (drawingStroke) {
      const p = toWorld(e.clientX, e.clientY);
      const pts = drawingStroke.points;
      if (straight) {
        pts.length = 1;
        pts.push([p.x, p.y, pressureOf(e)]);
        redraw();
      } else {
        const last = pts[pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) * scale < 1.2) return;
        pts.push([p.x, p.y, pressureOf(e)]);
        drawLastSegment(drawingStroke);
      }
      dirty = true;
      return;
    }

    if (tool === 'eraser' && pointers.size === 1 && isDrawPointer(e)) {
      eraseAt(toWorld(e.clientX, e.clientY));
      return;
    }

    // إصبع واحد بلا رسم = تحريك
    if (pointers.size === 1 && !drawingStroke && e.pointerType === 'touch') {
      offX += dx;
      offY += dy;
      redraw();
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { pinchStart = 0; pinchMid = null; }
    if (drawingStroke) {
      // أسقط الخطوط الفارغة
      if (drawingStroke.points.length < 1) strokes.pop();
      drawingStroke = null;
      dirty = true;
      redraw();
      autoGrow();
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (drawingStroke) endPointer(e); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const wx = (e.clientX - r.left - offX) / scale;
    const wy = (e.clientY - r.top - offY) / scale;
    scale = Math.max(0.25, Math.min(6, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
    offX = e.clientX - r.left - wx * scale;
    offY = e.clientY - r.top - wy * scale;
    redraw();
  }, { passive: false });

  /** ضغط القلم: يعطي سماكة طبيعية. اللمس والفأرة بضغط ثابت. */
  function pressureOf(e) {
    if (e.pointerType === 'pen' && e.pressure > 0) return Math.max(0.08, Math.min(1, e.pressure));
    return 0.55;
  }

  /** يرسم آخر مقطع فقط (أسرع من إعادة الرسم كاملًا). */
  function drawLastSegment(s) {
    const pts = s.points;
    if (pts.length < 2) return;
    const [x0, y0, p0] = pts[pts.length - 2];
    const [x1, y1, p1] = pts[pts.length - 1];
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * (0.4 + ((p0 + p1) / 2) * 0.8);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  /** الممحاة تحذف أي مسار يمرّ قربه المؤشّر. */
  function eraseAt(p) {
    const r = 14 / scale;
    let changed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < r + s.width / 2)) {
        strokes.splice(i, 1);
        changed = true;
      }
    }
    if (changed) { dirty = true; haptic(8); redraw(); }
  }

  /** يضيف صفحة تلقائيًا إن اقترب الرسم من القاع. */
  function autoGrow() {
    const deepest = strokes.reduce((m, s) => Math.max(m, ...s.points.map(([, y]) => y)), 0);
    if (deepest > PAGE_H * pages - 200) {
      pages += 1;
      redraw();
    }
  }

  function doUndo() {
    if (!strokes.length) return;
    undone.push(strokes.pop());
    dirty = true;
    haptic(10);
    redraw();
  }

  function doRedo() {
    if (!undone.length) return;
    strokes.push(undone.pop());
    dirty = true;
    haptic(10);
    redraw();
  }

  async function commit() {
    if (!loaded) return;            // لا نكتب فوق رسم لم يُقرأ بعد
    await saveDrawing(drawingId, { strokes, pages, updatedAt: Date.now() });
    await buildPreview(drawingId, strokes, pages);
    dirty = false;
  }

  function close() {
    cancelAnimationFrame(resizeRaf);
    ro.disconnect();
    overlay.remove();
    document.body.style.overflow = '';
  }

  /* ── الواجهة ── */
  const toolBtn = (id, icon, label) => h('button' + (tool === id ? '.on' : ''), {
    title: label, dataset: { tool: id },
    onclick: () => {
      tool = id;
      straight = id === 'line';
      if (id === 'line') tool = 'pen';
      syncTools();
      haptic();
    },
  }, icon);

  const toolsRow = h('div.draw-tools');
  const swatchRow = h('div.swatches');
  const widthRow = h('div.widths');

  function syncTools() {
    [...toolsRow.children].forEach((b) => {
      const t = b.dataset.tool;
      if (!t) return;
      const active = t === 'line' ? straight : (tool === t && !straight);
      b.classList.toggle('on', active);
    });
    [...swatchRow.children].forEach((s) => s.classList.toggle('on', s.dataset.color === color));
    [...widthRow.children].forEach((w) => w.classList.toggle('on', Number(w.dataset.w) === width));
  }

  fill(toolsRow, [
    toolBtn('pen', '✏️', 'قلم'),
    toolBtn('marker', '🖍', 'مُبرِز'),
    toolBtn('eraser', '🧽', 'ممحاة'),
    toolBtn('line', '📏', 'خط مستقيم'),
    h('button', { title: 'ملاءمة العرض', onclick: () => { fitToWidth(); redraw(); } }, '⤢'),
    h('button', { title: 'صفحة أخرى', onclick: () => { pages += 1; redraw(); dirty = true; toast('أُضيفت صفحة', 'ok'); } }, '➕📄'),
  ]);

  PEN_COLORS.forEach((c) => swatchRow.append(h('button.swatch' + (c === color ? '.on' : ''), {
    style: { background: c }, dataset: { color: c },
    onclick: () => { color = c; if (tool === 'eraser') tool = 'pen'; syncTools(); haptic(); },
  })));

  WIDTHS.forEach((w) => widthRow.append(h('button.width-dot' + (w === width ? '.on' : ''), {
    dataset: { w: String(w) },
    onclick: () => { width = w; syncTools(); haptic(); },
  }, h('i', { style: { width: `${Math.min(18, w * 1.6)}px`, height: `${Math.min(18, w * 1.6)}px` } }))));

  fill(overlay, [
    h('div.draw-top', [
      h('button', {
        title: 'إغلاق',
        onclick: async () => {
          if (dirty) await commit();
          close();
          onSave?.(drawingId);
        },
      }, '✕'),
      h('div.grow', [h('div.ttl', title), info]),
      undoBtn,
      redoBtn,
      h('button.primary', {
        onclick: async () => {
          await commit();
          toast('حُفظ الرسم', 'ok');
          close();
          onSave?.(drawingId);
        },
      }, 'حفظ'),
    ]),

    h('div.draw-stage', [canvas, hint]),

    h('div.draw-bottom', [
      toolsRow,
      h('div.row', { style: { gap: '10px' } }, [swatchRow]),
      widthRow,
    ]),
  ]);

  document.body.append(overlay);
  document.body.style.overflow = 'hidden';

  // تأجيل القياس إلى الإطار التالي يمنع تحذير «حلقة ResizeObserver»
  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(resize);
  });
  ro.observe(canvas);
  setTimeout(resize, 0);
  setTimeout(() => { hint.style.opacity = '0'; }, 4000);

  // تحميل المحفوظ بعد الفتح
  loadDrawing(drawingId).then((saved) => {
    if (saved?.strokes?.length) strokes.push(...structuredClone(saved.strokes));
    if (saved?.pages) pages = saved.pages;
    loaded = true;
    redraw();
  }).catch(() => { loaded = true; });

  return { id: drawingId, close };
}

/* ─────────────────── عناصر جاهزة للأقسام ─────────────────── */

/**
 * زر «ملاحظة رسم» يصلح لأي قسم: يفتح المحرّر ويحفظ المعرّف عبر onChange.
 */
export function drawButton({ id, title, label = '✍️ ملاحظة رسم', onChange }) {
  return h('button.btn.block', {
    onclick: () => openDrawing({ id, title, onSave: (newId) => onChange?.(newId) }),
  }, id ? '✍️ افتح ملاحظة الرسم' : label);
}

/** معاينة رسم داخل بطاقة (تُحمَّل بشكل غير متزامن). */
export function drawPreview(id, { onClick, title = 'ملاحظة رسم' } = {}) {
  const box = h('div', { style: { marginTop: '10px' } });
  if (!id) return box;
  drawingPreview(id).then((url) => {
    if (!url) return;
    fill(box, h('img.draw-thumb', {
      src: url, alt: title,
      onclick: () => (onClick ? onClick() : openDrawing({ id, title })),
    }));
  });
  return box;
}
