/**
 * المسودة الحالية: قائمة صفحات (صورة أصلية + تعديلات) تُحفظ تلقائيًا
 * فلا يضيع عملك إن أُغلق التطبيق. تصدير المسودة يولّد PDF ويحفظه في «ملفاتي».
 */
import { blobs, docs, kv, uid, gc } from './db.js';
import { importImage, newPageEdits, renderEdits, sourceBitmap, toBlob } from './image.js';
import { buildPdf } from './pdf.js';
import { settings, QUALITY } from './settings.js';
import { defaultName } from './fmt.js';

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

/** @type {{name: string, docId: string|null, pages: object[]}} */
export let draft = { name: '', docId: null, pages: [] };

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (draft.pages.length) kv.put('draft', draft);
    else kv.del('draft');
  }, 150);
}
function changed() { persist(); emit(); }

export async function loadDraft() {
  const d = await kv.get('draft');
  if (d?.pages?.length) draft = d;
  return draft;
}

export function hasDraft() { return draft.pages.length > 0; }

export function newDraft() {
  draft = { name: defaultName(), docId: null, pages: [] };
  changed();
}

export async function discardDraft() {
  draft = { name: '', docId: null, pages: [] };
  await kv.del('draft');
  emit();
  gc().catch(() => {});
}

export function setName(name) { draft.name = name; changed(); }

/** يستورد ملفات صور ويضيفها في آخر المسودة. */
export async function addFiles(files, onProgress) {
  const list = [...files].filter((f) => !f.type || f.type.startsWith('image/'));
  let ok = 0, failed = 0;
  if (!draft.name) draft.name = defaultName();
  for (let i = 0; i < list.length; i++) {
    onProgress?.(i / list.length, i + 1, list.length);
    try {
      const { blob, w, h } = await importImage(list[i]);
      const src = 'src-' + uid();
      await blobs.put(src, blob);
      const page = { id: uid(), src, w, h, ...newPageEdits() };
      if (settings.autoFilter !== 'none') page.filter = settings.autoFilter;
      draft.pages.push(page);
      ok++;
    } catch (e) {
      console.warn('import failed', list[i]?.name, e);
      failed++;
    }
  }
  onProgress?.(1, list.length, list.length);
  changed();
  return { ok, failed };
}

export function pageIndex(id) { return draft.pages.findIndex((p) => p.id === id); }

export function updatePage(id, edits) {
  const i = pageIndex(id);
  if (i < 0) return;
  draft.pages[i] = { ...draft.pages[i], ...edits };
  changed();
}

export function updateAll(fn) {
  draft.pages = draft.pages.map((p) => ({ ...p, ...fn(p) }));
  changed();
}

export function removePage(id) {
  draft.pages = draft.pages.filter((p) => p.id !== id);
  changed();
}

export function duplicatePage(id) {
  const i = pageIndex(id);
  if (i < 0) return;
  draft.pages.splice(i + 1, 0, { ...structuredClone(draft.pages[i]), id: uid() });
  changed();
}

export function movePage(from, to) {
  if (from === to || from < 0 || to < 0 || from >= draft.pages.length || to >= draft.pages.length) return;
  const [p] = draft.pages.splice(from, 1);
  draft.pages.splice(to, 0, p);
  changed();
}

export function reversePages() {
  draft.pages.reverse();
  changed();
}

/** يفتح ملفًا محفوظًا للتعديل بنقل صفحاته إلى المسودة. */
export async function editDoc(doc) {
  draft = { name: doc.name, docId: doc.id, pages: structuredClone(doc.pages || []) };
  changed();
}

/* ───── المصغّرات ───── */

const thumbCache = new Map();
const editKey = (p) => [p.src, p.rotation, p.flipH, p.crop.x, p.crop.y, p.crop.w, p.crop.h, p.filter, p.brightness, p.contrast].join('|');

export async function thumbnail(page, size = 420) {
  const key = editKey(page) + '|' + size;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const bmp = await sourceBitmap(page.src, await blobs.get(page.src));
  const c = renderEdits(bmp, page, { maxDim: size });
  const url = URL.createObjectURL(await toBlob(c, 'image/jpeg', 0.8));
  thumbCache.set(key, url);
  if (thumbCache.size > 300) {
    const [k, v] = thumbCache.entries().next().value;
    URL.revokeObjectURL(v);
    thumbCache.delete(k);
  }
  return url;
}

/* ───── التصدير ───── */

/**
 * يبني ملف PDF من المسودة ويحفظه في «ملفاتي».
 * @returns {Promise<object>} سجلّ الملف المحفوظ
 */
export async function exportDraft(opts, onProgress) {
  const q = QUALITY[opts.quality] || QUALITY.high;
  const images = [];
  let firstThumb = null;
  const pages = draft.pages;

  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i / (pages.length + 1), `معالجة الصفحة ${i + 1} من ${pages.length}`);
    const p = pages[i];
    const bmp = await sourceBitmap(p.src, await blobs.get(p.src));
    const c = renderEdits(bmp, p, { maxDim: q.max });
    const jpeg = new Uint8Array(await (await toBlob(c, 'image/jpeg', q.q)).arrayBuffer());
    images.push({ jpeg, w: c.width, h: c.height });
    if (i === 0) {
      const t = renderEdits(bmp, p, { maxDim: 360 });
      firstThumb = await toBlob(t, 'image/jpeg', 0.8);
    }
    // نترك المتصفّح يتنفّس بين الصفحات
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.(pages.length / (pages.length + 1), 'إنشاء ملف PDF…');
  const pdf = buildPdf(images, { ...opts, title: draft.name });

  const prev = draft.docId ? await docs.get(draft.docId) : null;
  const id = prev?.id || uid();
  const pdfKey = 'pdf-' + uid();
  const thumbKey = 'thumb-' + uid();
  await blobs.put(pdfKey, pdf);
  await blobs.put(thumbKey, firstThumb);

  const now = Date.now();
  const doc = {
    id,
    name: draft.name || defaultName(),
    pages: structuredClone(pages),
    pageCount: pages.length,
    size: pdf.size,
    pdf: pdfKey,
    thumb: thumbKey,
    opts,
    created: prev?.created || now,
    updated: now,
  };
  await docs.put(doc);
  draft.docId = id;
  persist();
  onProgress?.(1, 'تم');
  gc().catch(() => {});
  return doc;
}
