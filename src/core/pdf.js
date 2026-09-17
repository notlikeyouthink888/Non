/**
 * عارض PDF داخل Your World — قراءة وكتابة ورسم، بلا إنترنت وبلا تطبيق آخر.
 *
 * الترتيب مستقرّ: تُقاس أبعاد كل صفحة قبل العرض، فيأخذ كل صندوق مكانه الصحيح
 * من أول لحظة ولا تقفز الصفحات تحت إصبعك أثناء التمرير أو التكبير. التكبير
 * يحافظ على موضع القراءة بالضبط (يُحسب مرساة في مركز الشاشة ثم يُستعاد).
 *
 * الرسم: طبقة فوق كل صفحة تقبل قلم سامسونغ بضغطه، مع قلم ومُبرِز وممحاة
 * ونصّ وأشكال، و٢٤ لونًا، وتراجع وإعادة. المسارات تُخزَّن بإحداثيات نسبية
 * (٠..١ من الصفحة) فتبقى مضبوطة عند أي تكبير، وتُحفظ لكل ملف على حدة.
 */

import '../styles/pdf.css';
import { h, fill } from './dom.js';
import { idb } from './idb.js';
import { toast, haptic, confirmSheet, sheet, promptSheet } from './ui.js';

/* ─────────────────── المحرّك ─────────────────── */

let pdfjs = null;

async function engine() {
  if (pdfjs) return pdfjs;
  // بعض إصدارات WebView القديمة تفتقد هذه الدالة التي يعتمد عليها pdf.js
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers() {
      let resolve; let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  const [lib, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
  ]);
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjs = lib;
  return pdfjs;
}

/* ─────────────────── إعدادات الرسم ─────────────────── */

export const INK_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#0b0e14', '#374151',
  '#6b7280', '#9ca3af', '#e5e7eb', '#ffffff',
];

const WIDTHS = [1.2, 2.2, 4, 7, 12];
const MAX_LIVE_CANVAS = 12;        // أقصى عدد صفحات مرسومة في الذاكرة
const PAD = 10;                    // هامش جانبي حول الصفحة

const TOOLS = [
  { id: 'pen', icon: '🖊', label: 'قلم' },
  { id: 'marker', icon: '🖍', label: 'مُبرِز' },
  { id: 'line', icon: '📏', label: 'خط' },
  { id: 'rect', icon: '▭', label: 'إطار' },
  { id: 'text', icon: 'T', label: 'نصّ' },
  { id: 'erase', icon: '🧽', label: 'ممحاة' },
];

/* ─────────────────── تخزين التعليقات ─────────────────── */

const notesKey = (id) => `notes:${id}`;
const posKey = (id) => `pdfpos:${id}`;

async function loadNotes(id) {
  if (!id) return { pages: {} };
  const v = await idb.get('pdfnotes', notesKey(id));
  return v && typeof v === 'object' ? { pages: v.pages || {} } : { pages: {} };
}

const saveNotes = (id, notes) =>
  (id ? idb.set('pdfnotes', notesKey(id), { ...notes, updatedAt: Date.now() }) : Promise.resolve());

/** يحذف تعليقات ملف (يُستدعى عند حذف الملف نفسه). */
export const deletePdfNotes = (id) => idb.del('pdfnotes', notesKey(id));

/* ─────────────────── رسم المسارات ─────────────────── */

/** يرسم مسارات صفحة على سياق، بمقياس صندوق العرض (w×h بالبكسل). */
function paintInk(ctx, strokes, w, hgt, dpr = 1) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const s of strokes || []) {
    if (s.type === 'text') {
      const size = (s.size || 0.025) * hgt;
      ctx.fillStyle = s.color;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';
      String(s.text || '').split('\n').forEach((line, i) => {
        ctx.fillText(line, s.x * w, s.y * hgt + i * size * 1.25);
      });
      continue;
    }

    const pts = s.pts || [];
    if (!pts.length) continue;
    const marker = s.tool === 'marker';
    const lw = marker ? s.w * 4.5 : s.w;      // المُبرِز عريض وشفّاف كالحقيقي
    ctx.globalAlpha = marker ? 0.3 : 1;
    ctx.lineCap = marker ? 'butt' : 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;

    if (s.tool === 'rect' && pts.length >= 2) {
      const a = pts[0]; const b = pts[pts.length - 1];
      ctx.lineWidth = lw;
      ctx.strokeRect(a[0] * w, a[1] * hgt, (b[0] - a[0]) * w, (b[1] - a[1]) * hgt);
      continue;
    }

    if (s.tool === 'line' && pts.length >= 2) {
      const a = pts[0]; const b = pts[pts.length - 1];
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(a[0] * w, a[1] * hgt);
      ctx.lineTo(b[0] * w, b[1] * hgt);
      ctx.stroke();
      continue;
    }

    // قلم حرّ: سماكة متغيّرة مع ضغط القلم
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      ctx.lineWidth = marker ? lw : s.w * (0.45 + 1.1 * (p1[2] ?? 0.5));
      ctx.beginPath();
      ctx.moveTo(p0[0] * w, p0[1] * hgt);
      ctx.lineTo(p1[0] * w, p1[1] * hgt);
      ctx.stroke();
    }
    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[0][0] * w, pts[0][1] * hgt, lw * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** أقرب مسافة بين نقطة ومسار (بإحداثيات نسبية مصحّحة بنسبة الصفحة). */
function nearStroke(s, x, y, ratio) {
  const pts = s.type === 'text' ? [[s.x, s.y]] : (s.pts || []);
  let best = Infinity;
  for (const p of pts) {
    const dx = (p[0] - x);
    const dy = (p[1] - y) * ratio;
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/* ─────────────────── العارض ─────────────────── */

/**
 * يفتح ملف PDF محفوظًا داخل الجهاز.
 * @param {{ mediaId?: string, blob?: Blob, name?: string, onExternal?: () => void }} opts
 */
export async function openPdf(opts) {
  const { mediaId, blob, name = 'ملف', onExternal = null } = opts;
  const data = blob || (mediaId ? await idb.get('blobs', mediaId) : null);
  if (!data) { toast('تعذّر فتح الملف', 'err'); return null; }

  // تفضيلات العارض محفوظة بين الجلسات
  const exactText = (await idb.get('state', 'pdfExactText')) !== false;
  let zoomLocked = (await idb.get('state', 'pdfLockZoom')) !== false;

  /* الهيكل */
  const stage = h('div.pdf-stage');
  const pagesEl = h('div.pdf-pages');
  stage.append(pagesEl);

  const title = h('div.ttl.ellipsis', name);
  const pageInfo = h('div.sub', 'جارٍ الفتح…');
  const zoomLabel = h('b.mono', '100%');
  const searchBar = h('div.pdf-bar', { hidden: true });
  const inkBar = h('div.pdf-ink', { hidden: true });
  const thumbsBar = h('div.pdf-thumbs', { hidden: true });
  const panelBar = h('div.pdf-panel', { hidden: true });

  const modeBtn = h('button', { title: 'الرسم والكتابة', onclick: () => setMode(mode === 'read' ? 'ink' : 'read') }, '✍️');

  const overlay = h('div.pdf-overlay', [
    h('div.pdf-top', [
      h('button', { title: 'إغلاق', onclick: () => close() }, '✕'),
      h('div.grow', { style: { minWidth: '0' } }, [title, pageInfo]),
      h('button', { title: 'الصفحات', onclick: () => toggleThumbs() }, '☰'),
      h('button', { title: 'بحث', onclick: () => toggleSearch() }, '🔎'),
      modeBtn,
    ]),
    searchBar,
    panelBar,
    thumbsBar,
    stage,
    inkBar,
    h('div.pdf-bottom', [
      h('button', { title: 'الصفحة السابقة', onclick: () => step(-1) }, '‹'),
      h('button', { title: 'تصغير', onclick: () => setZoom(zoom / 1.25) }, '−'),
      h('button.wide', { title: 'اذهب إلى صفحة', onclick: () => jumpTo() }, zoomLabel),
      h('button', { title: 'تكبير', onclick: () => setZoom(zoom * 1.25) }, '＋'),
      h('button', { title: 'ملء العرض', onclick: () => fitWidth() }, '⤢'),
      h('button', { title: 'الصفحة التالية', onclick: () => step(1) }, '›'),
    ]),
  ]);

  document.body.append(overlay);

  /* الحالة */
  let doc = null;
  let pages = [];             // { n, el, canvas, ink, w, h, box:{w,h}, rendered, task }
  let zoom = 1;
  let fitScale = 1;           // مقياس ملء العرض
  let current = 0;
  let closed = false;
  let mode = 'read';
  let observer = null;
  const textCache = new Map();

  let notes = { pages: {} };
  let tool = 'pen';
  let color = INK_COLORS[0];
  let width = WIDTHS[1];
  const undoStack = [];
  const redoStack = [];

  // حالة داخلية تُستعمل من دوال تُستدعى قبل موضعها النصّي، فتُعرَّف هنا أوّلًا
  const pending = [];          // صفحات بانتظار الرسم
  const active = new Map();    // مؤشّرات اللمس الجارية (للتكبير بإصبعين)
  let running = 0;
  let rerenderTimer = null;
  let trimTimer = null;
  let saveTimer = null;
  let scrollRaf = 0;
  let pinch = null;
  let lastTap = 0;
  let drawing = null;          // المسار الجاري رسمه الآن: { p, stroke } أو { p, erase }

  const strokesOf = (n) => (notes.pages[n] = notes.pages[n] || []);

  function close() {
    closed = true;
    observer?.disconnect();
    pages.forEach((p) => cancel(p));
    if (doc) { try { doc.destroy(); } catch { /* تجاهل */ } }
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (mediaId) saveNotes(mediaId, notes);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(1);
    else if (e.key === 'ArrowRight') step(-1);
  }
  document.addEventListener('keydown', onKey);

  /* ─────────── التحميل ─────────── */

  try {
    const lib = await engine();
    const buf = await data.arrayBuffer();
    if (closed) return null;
    const base = document.baseURI;
    doc = await lib.getDocument({
      data: buf,
      isEvalSupported: false,
      standardFontDataUrl: new URL('pdfjs/standard_fonts/', base).href,
      // جداول الترميز لازمة للخطوط العريضة (CID) وإلا ظهرت حروف ناقصة
      cMapUrl: new URL('pdfjs/cmaps/', base).href,
      cMapPacked: true,
      // لا نثق بخطوط النظام: بدائلها في أندرويد تكسر تشكيل العربية
      useSystemFonts: false,
      /**
       * «النصّ الدقيق»: يرسم كل حرف من مخطّطات الخطّ المضمَّن في الملف مباشرة،
       * فلا يمرّ عبر محرّك الخطوط في WebView. هذا ما يمنع تبعثر الحروف العربية
       * وسقوط بعضها (وهو ما يصيب اللاتيني أيضًا: clay تصير chy). أبطأ قليلًا
       * لكنّه مطابق للملف الأصلي.
       */
      disableFontFace: exactText,
    }).promise;
  } catch (err) {
    console.warn('[pdf]', err);
    fill(pagesEl, [h('div.pdf-err', [
      h('p', 'تعذّر عرض هذا الملف داخل التطبيق.'),
      h('p.muted', String(err?.message || err)),
      onExternal ? h('button.btn', { onclick: () => { close(); onExternal(); } }, 'افتحه بتطبيق آخر') : null,
    ])]);
    return { close };
  }
  if (closed) return null;

  const total = doc.numPages;
  notes = await loadNotes(mediaId);

  // قياس كل الصفحات قبل العرض — هذا ما يجعل الترتيب ثابتًا ولا تقفز الصفحات
  pageInfo.textContent = `قياس ${total} صفحة…`;
  const sizes = [];
  for (let n = 1; n <= total; n++) {
    try {
      const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
      sizes.push({ w: vp.width, h: vp.height });
    } catch {
      sizes.push(sizes[0] || { w: 595, h: 842 });
    }
    if (n % 25 === 0) pageInfo.textContent = `قياس الصفحات… ${n}/${total}`;
    if (closed) return null;
  }

  pages = sizes.map((s, i) => {
    const n = i + 1;
    const canvas = h('canvas.pdf-canvas');
    const ink = h('canvas.pdf-inkcv');
    const el = h('div.pdf-page', { dataset: { n: String(n) } }, [canvas, ink, h('div.pn', String(n))]);
    return { n, el, canvas, ink, w: s.w, h: s.h, box: { w: 0, h: 0 }, rendered: false, task: null, scale: 0 };
  });
  fill(pagesEl, pages.map((p) => p.el));

  computeFit();
  layout();

  observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const p = pages[Number(en.target.dataset.n) - 1];
      if (p && en.isIntersecting) queue(p);
    });
  }, { root: stage, rootMargin: '400px 0px', threshold: 0 });
  pages.forEach((p) => observer.observe(p.el));

  const saved = mediaId ? Number(await idb.get('state', posKey(mediaId))) || 1 : 1;
  setCurrent(1);
  if (saved > 1 && saved <= total) goTo(saved, false);
  bindInk();
  buildThumbs();
  renderPanel();

  /* ─────────── المقاس والتخطيط ─────────── */

  /**
   * كل صفحة تملأ عرض الشاشة بمقياسها الخاصّ — هكذا تبدو الصفحات منتظمة
   * على الهاتف حتى لو اختلفت أحجامها داخل الملف (عمودية وأفقية معًا).
   */
  function computeFit() {
    const avail = Math.max(120, stage.clientWidth - PAD * 2);
    fitScale = avail;                       // العرض المتاح؛ مقياس كل صفحة = fitScale / p.w
    pages.forEach((p) => { p.fit = avail / p.w; });
  }

  // تعريف دالة (لا ثابت) لأنّها تُستدعى قبل هذا الموضع في تسلسل الإقلاع
  function scaleOf(p) { return (p.fit || 1) * zoom; }

  /** يضبط صناديق الصفحات حسب التكبير الحالي دون إعادة رسم (فوري). */
  function layout() {
    for (const p of pages) {
      const s = scaleOf(p);
      p.box.w = Math.round(p.w * s);
      p.box.h = Math.round(p.h * s);
      p.el.style.width = `${p.box.w}px`;
      p.el.style.height = `${p.box.h}px`;
      p.canvas.style.width = `${p.box.w}px`;
      p.canvas.style.height = `${p.box.h}px`;
      p.ink.style.width = `${p.box.w}px`;
      p.ink.style.height = `${p.box.h}px`;
    }
    zoomLabel.textContent = `${Math.round(zoom * 100)}% · ${current || 1}/${total}`;
  }

  /** مرساة القراءة: أي صفحة في منتصف الشاشة وأين منها بالضبط. */
  function anchor() {
    const mid = stage.scrollTop + stage.clientHeight / 2;
    for (const p of pages) {
      const top = p.el.offsetTop;
      if (mid <= top + p.el.offsetHeight) {
        return { n: p.n, frac: (mid - top) / Math.max(1, p.el.offsetHeight) };
      }
    }
    return { n: total, frac: 0.5 };
  }

  function restore(a) {
    const p = pages[a.n - 1];
    if (!p) return;
    stage.scrollTop = p.el.offsetTop + a.frac * p.el.offsetHeight - stage.clientHeight / 2;
  }

  function setZoom(z, keep = null) {
    const next = Math.min(6, Math.max(0.3, z));
    if (Math.abs(next - zoom) < 0.005) return;
    const a = keep || anchor();
    zoom = next;
    layout();
    restore(a);
    repaintAllInk();
    scheduleRerender();
    haptic();
  }

  function fitWidth() {
    const a = anchor();
    computeFit();
    zoom = 1;
    layout();
    restore(a);
    repaintAllInk();
    scheduleRerender();
  }

  /* ─────────── رسم الصفحات ─────────── */

  function scheduleRerender() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      // أعِد رسم ما يظهر الآن فقط بالمقياس الجديد
      for (const p of pages) if (p.rendered && Math.abs(p.scale - scaleOf(p)) > 0.01) p.rendered = false;
      visiblePages().forEach(queue);
    }, 180);
  }

  function visiblePages() {
    const top = stage.scrollTop - 400;
    const bottom = stage.scrollTop + stage.clientHeight + 400;
    return pages.filter((p) => p.el.offsetTop + p.el.offsetHeight > top && p.el.offsetTop < bottom);
  }

  function cancel(p) {
    try { p.task?.cancel(); } catch { /* تجاهل */ }
    p.task = null;
  }

  /** يفرّغ لوحات الصفحات البعيدة حتى لا تمتلئ الذاكرة في الملفات الكبيرة. */
  function trim() {
    const live = pages.filter((p) => p.rendered);
    if (live.length <= MAX_LIVE_CANVAS) return;
    live
      .sort((a, b) => Math.abs(a.n - current) - Math.abs(b.n - current))
      .slice(MAX_LIVE_CANVAS)
      .forEach((p) => {
        cancel(p);
        p.rendered = false;
        p.scale = 0;
        p.canvas.width = 0;
        p.canvas.height = 0;
        p.el.classList.remove('ready');
      });
  }

  function queue(p) {
    if (p.rendered || closed || pending.includes(p)) return;
    pending.push(p);
    pump();
  }

  function pump() {
    while (running < 2 && pending.length) {
      // الأقرب إلى الصفحة الحالية أولًا
      pending.sort((a, b) => Math.abs(a.n - current) - Math.abs(b.n - current));
      const p = pending.shift();
      running++;
      renderPage(p).finally(() => { running--; pump(); });
    }
  }

  async function renderPage(p) {
    if (p.rendered || closed) return;
    const scale = scaleOf(p);
    p.rendered = true;
    p.scale = scale;
    try {
      const page = await doc.getPage(p.n);
      const vp = page.getViewport({ scale });
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      p.canvas.width = Math.round(vp.width * dpr);
      p.canvas.height = Math.round(vp.height * dpr);
      const ctx = p.canvas.getContext('2d', { alpha: false });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.task = page.render({ canvasContext: ctx, viewport: vp });
      await p.task.promise;
      p.el.classList.add('ready');
      paintPageInk(p);
      trim();
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') { p.rendered = false; p.scale = 0; }
    } finally {
      p.task = null;
    }
  }

  /* ─────────── التنقّل ─────────── */

  function setCurrent(n) {
    if (n === current) return;
    current = n;
    pageInfo.textContent = `صفحة ${n} من ${total}`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}% · ${n}/${total}`;
    if (mediaId) idb.set('state', posKey(mediaId), n);
    [...thumbsBar.children].forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
    const on = thumbsBar.querySelector('.on');
    if (on && !thumbsBar.hidden) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function goTo(n, smooth = true) {
    const p = pages[Math.min(total, Math.max(1, n)) - 1];
    if (!p) return;
    queue(p);
    stage.scrollTo({ top: p.el.offsetTop - PAD, behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(p.n);
  }

  function step(d) { goTo(current + d); }

  async function jumpTo() {
    const v = await promptSheet(`اذهب إلى صفحة (١–${total})`, { value: String(current), okText: 'اذهب' });
    if (v) goTo(Number(v) || 1);
  }

  // الصفحة الحالية تُشتقّ من موضع التمرير نفسه — أدقّ وأثبت من ترتيب أحداث المراقب
  stage.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      setCurrent(anchor().n);
      scheduleTrim();
    });
  }, { passive: true });

  function scheduleTrim() { clearTimeout(trimTimer); trimTimer = setTimeout(trim, 500); }

  /* ─────────── المصغّرات ─────────── */

  function buildThumbs() {
    fill(thumbsBar, pages.map((p) => h('button.pdf-thumb', {
      dataset: { n: String(p.n) },
      onclick: () => goTo(p.n),
    }, [
      h('span.box', { style: { aspectRatio: `${p.w} / ${p.h}` } }),
      h('span.n', String(p.n)),
    ])));
  }

  function toggleThumbs() {
    thumbsBar.hidden = !thumbsBar.hidden;
    panelBar.hidden = thumbsBar.hidden;
    if (!thumbsBar.hidden) setTimeout(() => thumbsBar.querySelector('.on')?.scrollIntoView({ inline: 'center' }), 30);
  }

  /**
   * مفتاح جودة النصّ. «دقيق» يرسم الحروف من مخطّطات خطّ الملف نفسه فلا يتدخّل
   * محرّك خطوط النظام — وهو ما يمنع تبعثر العربية وسقوط حروف. تغييره يعيد فتح
   * الملف لأنّ الخيار يُقرَأ عند التحميل.
   */
  function renderPanel() {
    fill(panelBar, [
      h('div.row.between', [
        h('div', { style: { minWidth: '0' } }, [
          h('b', { style: { fontSize: '12.5px' } }, exactText ? 'النصّ: دقيق' : 'النصّ: سريع'),
          h('div.muted', { style: { fontSize: '10.5px' } }, exactText
            ? 'يرسم الحروف من خطّ الملف — أدقّ للعربية'
            : 'يستعمل خطوط النظام — أسرع وقد يبعثر العربية'),
        ]),
        h('button.btn.sm', {
          onclick: async () => {
            await idb.set('state', 'pdfExactText', !exactText);
            toast('يُعاد فتح الملف…');
            close();
            openPdf(opts);
          },
        }, exactText ? 'جرّب السريع' : 'جرّب الدقيق'),
      ]),
    ]);
  }

  /* ─────────── البحث ─────────── */

  function toggleSearch() {
    searchBar.hidden = !searchBar.hidden;
    if (searchBar.hidden) { fill(searchBar, []); return; }

    const q = h('input', { type: 'search', placeholder: 'ابحث في نصّ الملف…' });
    const results = h('div.pdf-hits');
    fill(searchBar, [
      h('div.row', { style: { gap: '8px' } }, [q, h('button.btn.sm.primary', { onclick: () => run() }, 'ابحث')]),
      results,
    ]);
    q.focus();
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

    async function run() {
      const needle = q.value.trim();
      if (needle.length < 2) { toast('اكتب حرفين على الأقل', 'err'); return; }
      fill(results, [h('div.muted', 'جارٍ البحث…')]);
      const hits = [];
      for (let n = 1; n <= total && hits.length < 60; n++) {
        let text = textCache.get(n);
        if (text == null) {
          try {
            const tc = await (await doc.getPage(n)).getTextContent();
            text = tc.items.map((it) => it.str).join(' ');
          } catch { text = ''; }
          textCache.set(n, text);
        }
        const i = text.indexOf(needle);
        if (i >= 0) hits.push({ n, snippet: text.slice(Math.max(0, i - 40), i + needle.length + 40) });
      }
      fill(results, hits.length
        ? hits.map((hit) => h('button.pdf-hit', {
          onclick: () => { goTo(hit.n); searchBar.hidden = true; },
        }, [h('b', `ص ${hit.n}`), h('span.ellipsis', `…${hit.snippet}…`)]))
        : [h('div.muted', 'لا نتيجة. بعض الملفات صور ممسوحة بلا نصّ قابل للبحث.')]);
    }
  }

  /* ─────────── الرسم والكتابة ─────────── */


  function paintPageInk(p) {
    const list = notes.pages[p.n];
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (!list?.length && p.ink.width === 0) return;
    p.ink.width = Math.max(1, Math.round(p.box.w * dpr));
    p.ink.height = Math.max(1, Math.round(p.box.h * dpr));
    paintInk(p.ink.getContext('2d'), list, p.box.w, p.box.h, dpr);
  }

  function repaintAllInk() { pages.forEach(paintPageInk); }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNotes(mediaId, notes), 400);
  }

  function pushUndo(n) {
    undoStack.push({ n, before: JSON.parse(JSON.stringify(notes.pages[n] || [])) });
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    refreshInkBar();
  }

  function undo() {
    const e = undoStack.pop();
    if (!e) return;
    redoStack.push({ n: e.n, before: JSON.parse(JSON.stringify(notes.pages[e.n] || [])) });
    notes.pages[e.n] = e.before;
    paintPageInk(pages[e.n - 1]);
    persist(); refreshInkBar();
  }

  function redo() {
    const e = redoStack.pop();
    if (!e) return;
    undoStack.push({ n: e.n, before: JSON.parse(JSON.stringify(notes.pages[e.n] || [])) });
    notes.pages[e.n] = e.before;
    paintPageInk(pages[e.n - 1]);
    persist(); refreshInkBar();
  }

  function setMode(m) {
    mode = m;
    overlay.classList.toggle('inking', m === 'ink');
    inkBar.hidden = m !== 'ink';
    modeBtn.classList.toggle('on', m === 'ink');
    modeBtn.textContent = m === 'ink' ? '📖' : '✍️';
    modeBtn.title = m === 'ink' ? 'وضع القراءة' : 'الرسم والكتابة';
    if (m === 'ink') { refreshInkBar(); repaintAllInk(); }
    haptic();
  }

  function refreshInkBar() {
    fill(inkBar, [
      h('div.row.tools', TOOLS.map((t) => h('button' + (tool === t.id ? '.on' : ''), {
        title: t.label, onclick: () => { tool = t.id; refreshInkBar(); },
      }, t.icon))),

      h('div.row.tools', [
        ...WIDTHS.map((w) => h('button.w' + (width === w ? '.on' : ''), {
          title: `سماكة ${w}`, onclick: () => { width = w; refreshInkBar(); },
        }, h('i', { style: { width: `${Math.min(18, 4 + w)}px`, height: `${Math.min(18, 4 + w)}px`, background: color } }))),
        h('div.grow'),
        h('button' + (zoomLocked ? '.on' : ''), {
          title: zoomLocked ? 'التكبير مقفل — اضغط لفتحه' : 'اقفل التكبير أثناء الرسم',
          onclick: () => setZoomLock(!zoomLocked),
        }, zoomLocked ? '🔒' : '🔓'),
        h('button', { title: 'تراجع', disabled: !undoStack.length, onclick: undo }, '↶'),
        h('button', { title: 'إعادة', disabled: !redoStack.length, onclick: redo }, '↷'),
        h('button', { title: 'امسح الصفحة', onclick: clearPage }, '🗑'),
      ]),

      h('div.pdf-colors', INK_COLORS.map((c) => h('button' + (color === c ? '.on' : ''), {
        style: { background: c }, title: c, onclick: () => { color = c; refreshInkBar(); },
      }))),
    ]);
  }

  /** قفل التكبير: يمنع التصغير والتكبير بإصبعين ويُبقي التمرير. */
  function setZoomLock(on) {
    zoomLocked = on;
    idb.set('state', 'pdfLockZoom', on);
    refreshInkBar();
    toast(on ? 'قُفل التكبير — الرسم وحده' : 'فُتح التكبير', 'ok');
    haptic();
  }

  async function clearPage() {
    if (!notes.pages[current]?.length) { toast('لا رسم في هذه الصفحة', 'err'); return; }
    if (!await confirmSheet('امسح رسم الصفحة', `سيُحذف كل ما رسمته في صفحة ${current}.`)) return;
    pushUndo(current);
    notes.pages[current] = [];
    paintPageInk(pages[current - 1]);
    persist();
  }

  /** يحوّل حدث المؤشّر إلى إحداثيات نسبية داخل صفحة. */
  function local(p, e) {
    const r = p.ink.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      e.pressure > 0 && e.pointerType === 'pen' ? e.pressure : 0.5,
    ];
  }

  function bindInk() {
    let penSeen = false;

    pages.forEach((p) => {
      p.ink.addEventListener('pointerdown', (e) => {
        if (mode !== 'ink') return;
        if (e.pointerType === 'pen' && !penSeen) { penSeen = true; overlay.classList.add('pen'); }
        // رفض راحة اليد: بعد أوّل لمسة قلم يبقى الإصبع للتمرير فقط
        if (penSeen && e.pointerType === 'touch') return;
        e.preventDefault();

        const pt = local(p, e);

        if (tool === 'text') { addText(p, pt); return; }

        if (tool === 'erase') {
          pushUndo(p.n);
          drawing = { p, erase: true, type: e.pointerType };
          eraseAt(p, pt);
          return;
        }

        pushUndo(p.n);
        const stroke = { tool, color, w: width, pts: [pt] };
        strokesOf(p.n).push(stroke);
        drawing = { p, stroke, type: e.pointerType };
        p.ink.setPointerCapture(e.pointerId);
        paintPageInk(p);
      });

      p.ink.addEventListener('pointermove', (e) => {
        if (!drawing || drawing.p !== p) return;
        e.preventDefault();
        const pt = local(p, e);
        if (drawing.erase) { eraseAt(p, pt); return; }
        const pts = drawing.stroke.pts;
        const last = pts[pts.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.0015) return;
        pts.push(pt);
        paintPageInk(p);
      });

      const end = () => {
        if (!drawing) return;
        if (drawing.stroke && drawing.stroke.pts.length === 0) strokesOf(p.n).pop();
        drawing = null;
        persist();
      };
      p.ink.addEventListener('pointerup', end);
      p.ink.addEventListener('pointercancel', end);
      p.ink.addEventListener('pointerleave', end);
    });
  }

  /** يُلغي المسار الجاري (عند وضع إصبع ثانٍ للتمرير أو التكبير). */
  function abortStroke() {
    if (!drawing) return;
    const { p, stroke } = drawing;
    drawing = null;
    if (stroke) {
      const list = notes.pages[p.n] || [];
      const i = list.indexOf(stroke);
      if (i >= 0) list.splice(i, 1);
      undoStack.pop();
      paintPageInk(p);
      refreshInkBar();
    }
  }

  function eraseAt(p, pt) {
    const list = notes.pages[p.n] || [];
    const ratio = p.box.h / Math.max(1, p.box.w);
    const hit = 0.02;
    const kept = list.filter((s) => nearStroke(s, pt[0], pt[1], ratio) > hit);
    if (kept.length !== list.length) {
      notes.pages[p.n] = kept;
      paintPageInk(p);
    }
  }

  async function addText(p, pt) {
    const v = await promptSheet('اكتب على الصفحة', { multiline: true, okText: 'أضف' });
    if (!v || !v.trim()) return;
    pushUndo(p.n);
    strokesOf(p.n).push({ type: 'text', x: pt[0], y: pt[1], text: v.trim(), color, size: 0.012 + width * 0.004 });
    paintPageInk(p);
    persist();
  }

  /* ─────────── التكبير بإصبعين ─────────── */


  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;

    // القلم يرسم الآن: كل لمسة إصبع هي راحة يد — تُتجاهَل تمامًا،
    // فلا تُلغي المسار ولا تُشغّل التكبير.
    if (drawing && drawing.type === 'pen') return;

    active.set(e.pointerId, e);
    if (active.size === 2) {
      abortStroke();            // إصبعان يعنيان تمريرًا وتكبيرًا، لا رسمًا
      const [a, b] = [...active.values()];
      pinch = {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        midY: (a.clientY + b.clientY) / 2,
        z: zoom, a: anchor(),
      };
    }
  }, { passive: true });

  stage.addEventListener('pointermove', (e) => {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, e);
    if (!pinch || active.size < 2) return;
    const [a, b] = [...active.values()];

    // إصبعان = تمرير أيضًا، فيمكن التنقّل حتى ووضع الرسم مفتوح
    const midY = (a.clientY + b.clientY) / 2;
    const dy = midY - pinch.midY;
    if (Math.abs(dy) > 0.5) {
      stage.scrollTop -= dy;
      pinch.midY = midY;
      pinch.a = anchor();
    }

    if (mode === 'ink' && zoomLocked) return;   // القفل يخصّ الرسم: يوقف التكبير ويُبقي التمرير

    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = Math.min(6, Math.max(0.3, pinch.z * (d / Math.max(1, pinch.d))));
    if (Math.abs(next - zoom) < 0.01) return;
    zoom = next;
    layout();
    restore(pinch.a);
  }, { passive: true });

  function endPinch(e) {
    active.delete(e.pointerId);
    if (active.size < 2 && pinch) {
      pinch = null;
      repaintAllInk();
      scheduleRerender();
    }
  }
  stage.addEventListener('pointerup', endPinch, { passive: true });
  stage.addEventListener('pointercancel', endPinch, { passive: true });

  /* ─────────── ضغطتان للتكبير ─────────── */

  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' || mode === 'ink' || active.size) return;
    const now = Date.now();
    if (now - lastTap < 280) setZoom(zoom > 1.2 ? 1 : 2.2);
    lastTap = now;
  });

  window.addEventListener('resize', () => {
    if (closed) return;
    const a = anchor();
    computeFit();
    layout();
    restore(a);
    repaintAllInk();
    scheduleRerender();
  });

  return { close, goTo, setMode };
}

/** يعرض معلومات ملاحظات ملف (للاستعمال في الواجهات). */
export async function pdfNotesCount(mediaId) {
  const n = await loadNotes(mediaId);
  return Object.values(n.pages).reduce((s, arr) => s + (arr?.length || 0), 0);
}

/** ورقة معلومات سريعة عن ميزات العارض. */
export function pdfHelpSheet() {
  sheet('عارض الملفات', h('div', [
    h('div.card.tight', h('div.card-s', 'اسحب لتقرأ، وقرّب بإصبعين أو بضغطتين سريعتين.')),
    h('div.card.tight', h('div.card-s', 'زرّ ✍️ يفتح الرسم: قلم ومُبرِز وخط وإطار ونصّ وممحاة، و٢٤ لونًا.')),
    h('div.card.tight', h('div.card-s', 'رسمك يُحفظ لكل صفحة ويبقى مع الملف.')),
    h('div.card.tight', h('div.card-s', 'زرّ ☰ يعرض شريط الصفحات للتنقّل السريع، و🔎 يبحث في النصّ.')),
  ]));
}
