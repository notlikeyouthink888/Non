/**
 * عارض PDF داخل Your World نفسه — لا يخرج الملف إلى أي تطبيق آخر ولا إلى الشبكة.
 *
 *  • تمرير متواصل لكل الصفحات، تُرسَم الصفحة عند اقترابها من الشاشة فقط
 *    (كسول) فيفتح الملف الكبير فورًا ولا تمتلئ الذاكرة.
 *  • تكبير وتصغير، «ملء العرض»، وضغطتان سريعتان للتكبير.
 *  • انتقال إلى رقم صفحة، وبحث في نصّ الملف مع القفز إلى الصفحة.
 *  • يتذكّر آخر صفحة وقفت عندها في كل ملف.
 *
 * محرّك العرض pdf.js مُضمَّن داخل التطبيق (لا CDN) فيعمل دون إنترنت.
 */

import '../styles/pdf.css';
import { h, fill } from './dom.js';
import { idb } from './idb.js';
import { toast, haptic } from './ui.js';

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

const posKey = (id) => `pdfpos:${id}`;
const readPos = (id) => idb.get('state', posKey(id)).then((v) => Number(v) || 1).catch(() => 1);
const writePos = (id, page) => idb.set('state', posKey(id), page);

/**
 * يفتح ملف PDF محفوظًا داخل الجهاز.
 * @param {{ mediaId?: string, blob?: Blob, name?: string, onExternal?: () => void }} opts
 */
export async function openPdf({ mediaId, blob, name = 'ملف', onExternal = null }) {
  const data = blob || (mediaId ? await idb.get('blobs', mediaId) : null);
  if (!data) { toast('تعذّر فتح الملف', 'err'); return null; }

  const stage = h('div.pdf-stage');
  const pageInfo = h('div.sub', 'جارٍ الفتح…');
  const title = h('div.ttl.ellipsis', name);
  const zoomLabel = h('b.mono', '100%');
  const searchBar = h('div.pdf-search', { hidden: true });

  const overlay = h('div.pdf-overlay', [
    h('div.pdf-top', [
      h('button', { title: 'إغلاق', onclick: () => close() }, '✕'),
      h('div.grow', { style: { minWidth: '0' } }, [title, pageInfo]),
      h('button', { title: 'بحث', onclick: () => toggleSearch() }, '🔎'),
      onExternal ? h('button', { title: 'فتح بتطبيق آخر', onclick: () => onExternal() }, '↗') : null,
    ]),
    searchBar,
    stage,
    h('div.pdf-bottom', [
      h('button', { title: 'السابقة', onclick: () => step(-1) }, '‹'),
      h('button', { title: 'تصغير', onclick: () => setZoom(zoom / 1.25) }, '−'),
      zoomLabel,
      h('button', { title: 'تكبير', onclick: () => setZoom(zoom * 1.25) }, '＋'),
      h('button', { title: 'ملء العرض', onclick: () => fitWidth() }, '⤢'),
      h('button', { title: 'اذهب إلى صفحة', onclick: () => jumpTo() }, '#'),
      h('button', { title: 'التالية', onclick: () => step(1) }, '›'),
    ]),
  ]);

  document.body.append(overlay);

  let doc = null;
  let zoom = 1;
  let baseScale = 1;          // المقياس الذي يملأ العرض
  let pages = [];             // { n, el, canvas, rendered, task, w, h }
  let current = 0;
  let observer = null;
  let closed = false;
  const textCache = new Map();

  function close() {
    closed = true;
    observer?.disconnect();
    pages.forEach((p) => { try { p.task?.cancel(); } catch { /* تجاهل */ } });
    if (doc) { try { doc.destroy(); } catch { /* تجاهل */ } }
    overlay.remove();
    document.removeEventListener('keydown', onKey);
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
    doc = await lib.getDocument({
      data: buf,
      isEvalSupported: false,
      standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).href,
    }).promise;
  } catch (err) {
    console.warn('[pdf]', err);
    fill(stage, [h('div.pdf-err', [
      h('p', 'تعذّر عرض هذا الملف داخل التطبيق.'),
      h('p.muted', String(err?.message || err)),
      onExternal ? h('button.btn', { onclick: () => { close(); onExternal(); } }, 'افتحه بتطبيق آخر') : null,
    ])]);
    return { close };
  }
  if (closed) return null;

  const total = doc.numPages;
  const first = await doc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  baseScale = Math.max(0.2, (stage.clientWidth - 16) / vp1.width);

  // هياكل الصفحات بأبعادها الصحيحة قبل الرسم، فلا يقفز التمرير
  pages = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const canvas = h('canvas');
    const el = h('div.pdf-page', { dataset: { n: String(n) } }, [canvas, h('div.pn', String(n))]);
    return { n, el, canvas, rendered: false, task: null, vp: null };
  });
  fill(stage, pages.map((p) => p.el));

  applyZoom();

  observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const n = Number(en.target.dataset.n);
      const p = pages[n - 1];
      if (!p) return;
      if (en.isIntersecting) {
        renderPage(p);
        if (en.intersectionRatio > 0.4) setCurrent(n);
      }
    });
  }, { root: stage, rootMargin: '600px 0px', threshold: [0, 0.45] });
  pages.forEach((p) => observer.observe(p.el));

  const saved = mediaId ? await readPos(mediaId) : 1;
  if (saved > 1 && saved <= total) goTo(saved, false);
  else setCurrent(1);

  /* ─────────── الرسم ─────────── */

  async function renderPage(p) {
    if (p.rendered || closed) return;
    p.rendered = true;
    try {
      const page = await doc.getPage(p.n);
      const scale = baseScale * zoom;
      const vp = page.getViewport({ scale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      p.canvas.width = Math.floor(vp.width * dpr);
      p.canvas.height = Math.floor(vp.height * dpr);
      p.canvas.style.width = `${Math.floor(vp.width)}px`;
      p.canvas.style.height = `${Math.floor(vp.height)}px`;
      const ctx = p.canvas.getContext('2d', { alpha: false });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.task = page.render({ canvasContext: ctx, viewport: vp });
      await p.task.promise;
      p.el.classList.add('ready');
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') p.rendered = false;
    }
  }

  /** يضبط أبعاد كل الصفحات حسب التكبير الحالي (قبل رسمها). */
  async function applyZoom() {
    const scale = baseScale * zoom;
    const vp = first.getViewport({ scale });
    pages.forEach((p) => {
      p.el.style.width = `${Math.floor(vp.width)}px`;
      p.el.style.minHeight = `${Math.floor(vp.height)}px`;
    });
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  /** يلغي ما رُسم ويعيد بناء الصفحات بالمقياس الجديد، ويبقى عند نفس الصفحة. */
  function refresh() {
    const at = current;
    pages.forEach((p) => {
      try { p.task?.cancel(); } catch { /* تجاهل */ }
      p.rendered = false;
      p.el.classList.remove('ready');
    });
    applyZoom();
    goTo(at, false);
    renderPage(pages[at - 1]);
    haptic();
  }

  function setZoom(z) {
    const next = Math.min(5, Math.max(0.35, z));
    if (Math.abs(next - zoom) < 0.01) return;
    zoom = next;
    refresh();
  }

  function fitWidth() {
    baseScale = Math.max(0.2, (stage.clientWidth - 16) / vp1.width);
    zoom = 1;
    refresh();
  }

  function setCurrent(n) {
    if (n === current) return;
    current = n;
    pageInfo.textContent = `صفحة ${n} من ${total}`;
    if (mediaId) writePos(mediaId, n);
  }

  function goTo(n, smooth = true) {
    const p = pages[Math.min(total, Math.max(1, n)) - 1];
    if (!p) return;
    renderPage(p);
    p.el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(p.n);
  }

  function step(d) { goTo(current + d); }

  function jumpTo() {
    const input = h('input', { type: 'number', min: 1, max: total, value: current, inputmode: 'numeric' });
    const box = h('div.pdf-jump', [
      h('span.muted', `من ١ إلى ${total}`),
      input,
      h('button.btn.sm.primary', {
        onclick: () => { goTo(Number(input.value) || 1); box.remove(); },
      }, 'اذهب'),
      h('button.btn.sm.ghost', { onclick: () => box.remove() }, '✕'),
    ]);
    overlay.append(box);
    input.focus();
    input.select();
  }

  /* ─────────── البحث ─────────── */

  function toggleSearch() {
    searchBar.hidden = !searchBar.hidden;
    if (searchBar.hidden) { fill(searchBar, []); return; }

    const q = h('input', { type: 'search', placeholder: 'ابحث في نصّ الملف…' });
    const results = h('div.pdf-hits');
    fill(searchBar, [
      h('div.row', { style: { gap: '8px' } }, [
        q,
        h('button.btn.sm.primary', { onclick: () => run() }, 'ابحث'),
      ]),
      results,
    ]);
    q.focus();
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

    async function run() {
      const needle = q.value.trim();
      if (needle.length < 2) { toast('اكتب كلمتين على الأقل', 'err'); return; }
      fill(results, [h('div.muted', 'جارٍ البحث…')]);
      const hits = [];
      for (let n = 1; n <= total && hits.length < 60; n++) {
        let text = textCache.get(n);
        if (text == null) {
          try {
            const page = await doc.getPage(n);
            const tc = await page.getTextContent();
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

  /* ─────────── ضغطتان للتكبير ─────────── */

  let lastTap = 0;
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastTap < 300) setZoom(zoom > 1.2 ? 1 : 2);
    lastTap = now;
  });

  return { close, goTo };
}
