/**
 * قسم المذاكرة — مجموعات ← صفحات ← عناصر.
 *
 * كل مجموعة تحوي صفحات مرقّمة بلا حدّ، وكل صفحة قائمة عناصر تُضاف بزرّ «＋»:
 * نص، عنوان، اقتباس، صورة، ملف PDF، أو ملاحظة رسم بالقلم.
 */

import '../../styles/study.css';
import { h, fill, empty } from '../../core/dom.js';
import { bytes } from '../../core/fmt.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, promptSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { saveMedia, mediaUrl, deleteMedia, pickFile } from '../../core/media.js';
import { openDrawing, drawingPreview, deleteDrawing } from '../../core/draw.js';
import { openFile } from '../../core/native.js';

const ICONS = ['📘', '📗', '📙', '📕', '🧪', '🧮', '🧬', '🌍', '🗣', '💻', '⚙️', '🎼'];
const COLORS = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#60a5fa', '#a78bfa'];

const TABS = [
  { id: 'groups', label: 'المجموعات' },
  { id: 'recent', label: 'الأخيرة' },
  { id: 'search', label: 'بحث' },
];

let tab = 'groups';
let openGroupId = null;
let openPageId = null;
let query = '';

export default {
  id: 'study',
  label: 'المذاكرة',
  icon: '📚',

  mount(root, params = {}) {
    if (params.tab) tab = params.tab;
    const content = h('div');
    const tabsEl = h('div.tabs');
    const headEl = h('div.head');

    TABS.forEach((t) => tabsEl.append(h('button', {
      dataset: { tab: t.id },
      onclick: () => {
        tab = t.id; openGroupId = null; openPageId = null;
        haptic(); sync(); render();
      },
    }, t.label)));

    fill(root, [headEl, tabsEl, content]);

    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));

    function render() {
      const inPage = !!openPageId;
      tabsEl.style.display = inPage || openGroupId ? 'none' : '';
      fill(headEl, inPage || openGroupId ? [] : [
        h('div', [h('h1', 'المذاكرة'), h('p', 'مجموعات وصفحات بلا حدّ — نص وصور وPDF ورسم')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]);
      fill(content, view(render));
    }

    sync();
    render();
    const off = subscribe('study', render);

    return {
      setTab: (t) => { tab = t; openGroupId = null; openPageId = null; sync(); render(); },
      unmount: off,
    };
  },
};

function view(rerender) {
  if (openPageId) return pageView(openPageId, rerender);
  if (openGroupId) return groupView(openGroupId, rerender);
  if (tab === 'recent') return recentTab(rerender);
  if (tab === 'search') return searchTab(rerender);
  return groupsTab(rerender);
}

/* ─────────────────── البيانات ─────────────────── */

const groups = () => state.study.groups;
const pagesOf = (gid) => state.study.pages.filter((p) => p.groupId === gid).sort((a, b) => a.n - b.n);
const pageById = (id) => state.study.pages.find((p) => p.id === id) || null;
const groupById = (id) => groups().find((g) => g.id === id) || null;

export function newGroup(patch = {}) {
  return {
    id: uid('g_'),
    name: '',
    icon: ICONS[groups().length % ICONS.length],
    color: COLORS[groups().length % COLORS.length],
    createdAt: Date.now(),
    ...patch,
  };
}

export function saveGroup(g) {
  const i = groups().findIndex((x) => x.id === g.id);
  if (i >= 0) groups()[i] = g; else groups().push(g);
  save();
  emit('study');
}

export async function removeGroup(id) {
  const pages = pagesOf(id);
  for (const p of pages) await removePage(p.id, true);
  state.study.groups = groups().filter((g) => g.id !== id);
  save();
  emit('study');
}

export function addPage(groupId) {
  const n = pagesOf(groupId).reduce((m, p) => Math.max(m, p.n), 0) + 1;
  const page = { id: uid('p_'), groupId, n, title: '', blocks: [], updatedAt: Date.now() };
  state.study.pages.push(page);
  save();
  emit('study');
  return page;
}

export async function removePage(id, quiet = false) {
  const p = pageById(id);
  if (p) {
    for (const b of p.blocks) await disposeBlock(b);
  }
  state.study.pages = state.study.pages.filter((x) => x.id !== id);
  save();
  if (!quiet) emit('study');
}

async function disposeBlock(b) {
  if (b.type === 'image' || b.type === 'file') { if (b.mediaId) await deleteMedia(b.mediaId); }
  if (b.type === 'draw' && b.drawingId) await deleteDrawing(b.drawingId);
}

/**
 * يحفظ الصفحة. التعديلات النصّية تُحفظ بصمت (بلا إعادة رسم)
 * حتى لا يُستبدل عنصر تحت إصبع المستخدم أثناء الكتابة.
 */
function touchPage(p, { silent = false } = {}) {
  p.updatedAt = Date.now();
  save();
  if (!silent) emit('study');
}

/* ─────────────────── المجموعات ─────────────────── */

function groupsTab(rerender) {
  const list = groups();

  return h('div', [
    h('button.btn.primary.block', { onclick: () => openGroupEditor(newGroup(), rerender) }, '＋ مجموعة جديدة'),

    list.length
      ? h('div.grp-grid', { style: { marginTop: '14px' } }, list.map((g) => {
        const pages = pagesOf(g.id);
        const blocks = pages.reduce((s, p) => s + p.blocks.length, 0);
        return h('div.grp', {
          style: { borderColor: `color-mix(in srgb, ${g.color} 45%, var(--line))` },
          onclick: () => { openGroupId = g.id; state.study.lastGroup = g.id; save(); rerender(); },
        }, [
          h('span.e', g.icon),
          h('div.nm', g.name),
          h('div.ct', `${pages.length} صفحة · ${blocks} عنصر`),
          h('div.bar2', { style: { background: g.color, opacity: .8 } }),
        ]);
      }))
      : h('div', { style: { marginTop: '20px' } },
        empty('📚', 'ابدأ بمجموعة — مثلًا مادة دراسية، أو موضوع تريد إتقانه.')),
  ]);
}

function openGroupEditor(group, rerender) {
  const draft = { ...group };
  const exists = groups().some((g) => g.id === group.id);
  const body = h('div');
  const panel = sheet(exists ? 'تعديل المجموعة' : 'مجموعة جديدة', body);

  function render() {
    fill(body, [
      h('input', {
        placeholder: 'اسم المجموعة (مثلًا: رياضيات)', value: draft.name,
        oninput: (e) => { draft.name = e.target.value; },
      }),

      h('h2.sec', 'الرمز'),
      h('div.chips', ICONS.map((ic) => h('button.chip' + (ic === draft.icon ? '.on' : ''), {
        style: { fontSize: '17px' },
        onclick: () => { draft.icon = ic; render(); },
      }, ic))),

      h('h2.sec', 'اللون'),
      h('div.swatches', COLORS.map((c) => h('button.swatch' + (c === draft.color ? '.on' : ''), {
        style: { background: c },
        onclick: () => { draft.color = c; render(); },
      }))),

      h('div.grid2', { style: { marginTop: '16px' } }, [
        exists
          ? h('button.btn.danger', {
            onclick: async () => {
              if (!await confirmSheet('حذف المجموعة', `ستُحذف «${draft.name}» وكل صفحاتها.`)) return;
              await removeGroup(draft.id);
              panel.close(); rerender();
            },
          }, '🗑 حذف')
          : h('button.btn.ghost', { onclick: () => panel.close() }, 'إلغاء'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.name.trim()) { toast('اكتب اسم المجموعة', 'err'); return; }
            saveGroup(draft);
            panel.close();
            rerender();
          },
        }, '💾 حفظ'),
      ]),
    ]);
  }

  render();
}

/* ─────────────────── داخل المجموعة ─────────────────── */

function groupView(gid, rerender) {
  const g = groupById(gid);
  if (!g) { openGroupId = null; return h('div'); }
  const pages = pagesOf(gid);

  return h('div', [
    h('div.pg-head', [
      h('button', { onclick: () => { openGroupId = null; rerender(); } }, '›'),
      h('div.grow', [
        h('div.t', `${g.icon} ${g.name}`),
        h('div.s', `${pages.length} صفحة`),
      ]),
      h('button', { title: 'تعديل', onclick: () => openGroupEditor(g, rerender) }, '✎'),
    ]),

    h('button.btn.primary.block', {
      onclick: () => { const p = addPage(gid); openPageId = p.id; rerender(); },
    }, '＋ صفحة جديدة'),

    pages.length
      ? h('div.list', { style: { marginTop: '12px' } }, pages.map((p) => h('div.page-row', {
        onclick: () => { openPageId = p.id; rerender(); },
      }, [
        h('div.num', String(p.n)),
        h('div.grow', [
          h('div.t', p.title || `صفحة ${p.n}`),
          h('div.s', p.blocks.length ? summarize(p) : 'فارغة — اضغط لتبدأ'),
        ]),
        h('span.muted', '‹'),
      ])))
      : h('div', { style: { marginTop: '20px' } }, empty('📄', 'لا صفحات — أضف الصفحة الأولى.')),
  ]);
}

function summarize(p) {
  const counts = {};
  p.blocks.forEach((b) => { counts[b.type] = (counts[b.type] || 0) + 1; });
  const names = { text: 'نص', head: 'عنوان', quote: 'اقتباس', image: 'صورة', file: 'ملف', draw: 'رسم' };
  return Object.entries(counts).map(([k, v]) => `${v} ${names[k] || k}`).join(' · ');
}

/* ─────────────────── الصفحة ─────────────────── */

function pageView(pid, rerender) {
  const p = pageById(pid);
  if (!p) { openPageId = null; return h('div'); }
  const g = groupById(p.groupId);
  const pages = pagesOf(p.groupId);
  const idx = pages.findIndex((x) => x.id === pid);

  const wrap = h('div');

  fill(wrap, [
    h('div.pg-head', [
      h('button', { onclick: () => { openPageId = null; rerender(); } }, '›'),
      h('div.grow', [
        h('input', {
          value: p.title, placeholder: `صفحة ${p.n}`,
          style: { background: 'transparent', border: 'none', padding: '0', fontWeight: '700', fontSize: '16px' },
          oninput: (e) => { p.title = e.target.value; },
          onchange: () => touchPage(p, { silent: true }),
        }),
        h('div.s', `${g ? g.icon + ' ' + g.name : ''} · صفحة ${p.n} من ${pages.length}`),
      ]),
      h('button', { title: 'خيارات', onclick: () => pageMenu(p, rerender) }, '⋯'),
    ]),

    p.blocks.length
      ? h('div', p.blocks.map((b, i) => blockView(p, b, i, rerender)))
      : h('div.muted.center', { style: { padding: '18px 0' } }, 'الصفحة فارغة — أضف أول عنصر من الأزرار بالأسفل.'),

    h('div.add-strip', [
      addBtn('📝', 'نص', () => addBlock(p, { type: 'text', text: '' }, rerender)),
      addBtn('🔠', 'عنوان', () => addBlock(p, { type: 'head', text: '' }, rerender)),
      addBtn('🖼', 'صورة', () => attachImage(p, rerender)),
      addBtn('📄', 'PDF', () => attachFile(p, rerender)),
      addBtn('✍️', 'رسم', () => addDrawBlock(p, rerender)),
    ]),

    pages.length > 1 ? h('div.row', { style: { gap: '8px' } }, [
      h('button.btn.grow' + (idx <= 0 ? '.ghost' : ''), {
        disabled: idx <= 0,
        onclick: () => { openPageId = pages[idx - 1].id; rerender(); },
      }, '› السابقة'),
      h('button.btn.grow' + (idx >= pages.length - 1 ? '.ghost' : ''), {
        disabled: idx >= pages.length - 1,
        onclick: () => { openPageId = pages[idx + 1].id; rerender(); },
      }, 'التالية ‹'),
    ]) : null,

    h('button.btn.ghost.block', {
      style: { marginTop: '10px' },
      onclick: () => { const np = addPage(p.groupId); openPageId = np.id; rerender(); },
    }, '＋ صفحة جديدة في هذه المجموعة'),
  ]);

  return wrap;
}

const addBtn = (icon, label, onclick) =>
  h('button', { onclick: () => { haptic(); onclick(); } }, [h('span.e', icon), h('span', label)]);

function addBlock(p, block, rerender) {
  p.blocks.push({ id: uid('bl_'), ...block });
  touchPage(p);
  rerender();
}

function blockView(p, b, i, rerender) {
  const tools = h('div.tools', [
    i > 0 ? h('button', { title: 'أعلى', onclick: () => { move(p, i, -1); rerender(); } }, '▲') : null,
    i < p.blocks.length - 1 ? h('button', { title: 'أسفل', onclick: () => { move(p, i, 1); rerender(); } }, '▼') : null,
    h('button', {
      title: 'حذف',
      onclick: async () => {
        if (!await confirmSheet('حذف العنصر', 'سيُحذف هذا العنصر من الصفحة.')) return;
        await disposeBlock(b);
        p.blocks.splice(i, 1);
        touchPage(p);
        rerender();
      },
    }, '✕'),
  ]);

  if (b.type === 'text' || b.type === 'head' || b.type === 'quote') {
    const cls = b.type === 'head' ? '.blk.head1' : b.type === 'quote' ? '.blk.quote' : '.blk.text';
    const area = h('textarea.pg-editor', {
      value: b.text,
      placeholder: b.type === 'head' ? 'عنوان…' : 'اكتب هنا…',
      rows: Math.max(2, String(b.text || '').split('\n').length),
      oninput: (e) => {
        b.text = e.target.value;
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      },
      onchange: () => touchPage(p, { silent: true }),
    });
    if (b.type === 'head') area.style.fontSize = '19px';
    setTimeout(() => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; }, 0);
    return h(cls, [tools, area]);
  }

  if (b.type === 'image') {
    const box = h('div.blk', [tools, h('div.muted', 'جارٍ فتح الصورة…')]);
    mediaUrl(b.mediaId).then((url) => {
      fill(box, [tools, url
        ? h('img', { src: url, alt: b.name || '', onclick: () => openImage(url, b.name) })
        : h('div.muted', 'تعذّر فتح الصورة')]);
    });
    return box;
  }

  if (b.type === 'file') {
    return h('div.blk', [
      tools,
      h('div.file', {
        onclick: () => openStoredFile(b),
      }, [
        h('div.fi', b.mime?.includes('pdf') ? '📕' : '📄'),
        h('div.grow', [
          h('div.fn.ellipsis', b.name || 'ملف'),
          h('div.fs', `${bytes(b.size)} · اضغط للفتح`),
        ]),
        h('span.muted', '‹'),
      ]),
    ]);
  }

  if (b.type === 'draw') {
    const box = h('div.blk', [tools, h('div.muted', 'ملاحظة رسم')]);
    drawingPreview(b.drawingId).then((url) => {
      fill(box, [
        tools,
        url
          ? h('img.draw-thumb', { src: url, alt: 'رسم', onclick: () => editDraw(p, b, rerender) })
          : h('div.draw-chip', { onclick: () => editDraw(p, b, rerender) }, '✍️ افتح ملاحظة الرسم'),
        h('button.btn.sm.ghost.block', {
          style: { marginTop: '8px' },
          onclick: () => editDraw(p, b, rerender),
        }, '✍️ تعديل الرسم'),
      ]);
    });
    return box;
  }

  return h('div.blk', [tools, h('div.muted', 'عنصر غير معروف')]);
}

function move(p, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= p.blocks.length) return;
  [p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]];
  touchPage(p);
}

function editDraw(p, b, rerender) {
  openDrawing({
    id: b.drawingId,
    title: p.title || `صفحة ${p.n}`,
    onSave: (id) => { b.drawingId = id; touchPage(p); rerender(); },
  });
}

function addDrawBlock(p, rerender) {
  const block = { id: uid('bl_'), type: 'draw', drawingId: null };
  p.blocks.push(block);
  touchPage(p);
  openDrawing({
    title: p.title || `صفحة ${p.n}`,
    onSave: (id) => { block.drawingId = id; touchPage(p); rerender(); },
  });
}

async function attachImage(p, rerender) {
  const file = await pickFile('image');
  if (!file) return;
  try {
    const m = await saveMedia(file);
    addBlock(p, { type: 'image', mediaId: m.id, name: m.name, size: m.size }, rerender);
  } catch (err) {
    toast(err.message || 'تعذّر حفظ الصورة', 'err');
  }
}

async function attachFile(p, rerender) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf,.txt,.doc,.docx,.ppt,.pptx';
  input.onchange = async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { toast('الملف أكبر من ٦٠ م.ب', 'err'); return; }
    try {
      const m = await saveMedia(file);
      addBlock(p, { type: 'file', mediaId: m.id, name: file.name, size: file.size, mime: file.type }, rerender);
      toast('أُضيف الملف', 'ok');
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الملف', 'err');
    }
  };
  document.body.append(input);
  input.click();
}

/** يفتح الملف بعارض النظام (PDF مثلًا)، وإن تعذّر يفتحه في نافذة. */
async function openStoredFile(b) {
  const url = await mediaUrl(b.mediaId);
  if (!url) { toast('تعذّر فتح الملف', 'err'); return; }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ok = await openFile({ name: b.name || 'file.pdf', mime: b.mime || 'application/pdf', blob });
    if (ok) return;
  } catch { /* نكمل إلى البديل */ }
  window.open(url, '_blank');
}

function openImage(url, name) {
  sheet(name || 'صورة', h('div', [
    h('img', { src: url, alt: '', style: { width: '100%', borderRadius: '12px', display: 'block' } }),
  ]));
}

function pageMenu(p, rerender) {
  sheet(p.title || `صفحة ${p.n}`, ({ close }) => h('div.list', [
    h('div.item', {
      onclick: async () => {
        close();
        const t = await promptSheet('عنوان الصفحة', { value: p.title });
        if (t !== null) { p.title = t; touchPage(p); rerender(); }
      },
    }, [h('div.grow', '✎ غيّر عنوان الصفحة')]),
    h('div.item', {
      onclick: () => { close(); addBlock(p, { type: 'quote', text: '' }, rerender); },
    }, [h('div.grow', '❝ أضف اقتباسًا')]),
    h('div.item', {
      onclick: async () => {
        close();
        if (!await confirmSheet('حذف الصفحة', `ستُحذف «${p.title || `صفحة ${p.n}`}» بكل عناصرها.`)) return;
        await removePage(p.id);
        openPageId = null;
        rerender();
      },
    }, [h('div.grow', { style: { color: 'var(--danger)' } }, '🗑 احذف الصفحة')]),
  ]));
}

/* ─────────────────── الأخيرة والبحث ─────────────────── */

function recentTab(rerender) {
  const recent = [...state.study.pages].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 25);
  if (!recent.length) return empty('🕐', 'لا صفحات بعد.');

  return h('div.list', recent.map((p) => {
    const g = groupById(p.groupId);
    return h('div.page-row', {
      onclick: () => { openGroupId = p.groupId; openPageId = p.id; rerender(); },
    }, [
      h('div.num', { style: { background: `color-mix(in srgb, ${g?.color || '#7c5cff'} 25%, var(--surface-2))` } }, g?.icon || '📄'),
      h('div.grow', [
        h('div.t', p.title || `صفحة ${p.n}`),
        h('div.s', `${g?.name || ''} · ${p.blocks.length} عنصر`),
      ]),
    ]);
  }));
}

function searchTab(rerender) {
  const q = query.trim().toLowerCase();
  const hits = q
    ? state.study.pages.filter((p) =>
      (p.title || '').toLowerCase().includes(q)
      || p.blocks.some((b) => (b.text || '').toLowerCase().includes(q) || (b.name || '').toLowerCase().includes(q)))
    : [];

  return h('div', [
    h('input', {
      type: 'search', placeholder: 'ابحث في كل صفحاتك…', value: query,
      oninput: (e) => { query = e.target.value; rerender(); },
    }),
    q
      ? (hits.length
        ? h('div.list', { style: { marginTop: '14px' } }, hits.map((p) => {
          const g = groupById(p.groupId);
          const snippet = p.blocks.map((b) => b.text || '').find((t) => t.toLowerCase().includes(q)) || '';
          return h('div.page-row', {
            onclick: () => { openGroupId = p.groupId; openPageId = p.id; rerender(); },
          }, [
            h('div.num', g?.icon || '📄'),
            h('div.grow', [
              h('div.t', p.title || `صفحة ${p.n}`),
              h('div.s.ellipsis', snippet.slice(0, 80) || g?.name || ''),
            ]),
          ]);
        }))
        : h('div', { style: { marginTop: '20px' } }, empty('🔍', 'لا نتائج')))
      : h('div.muted.center', { style: { marginTop: '20px' } }, 'اكتب كلمة للبحث في عناوين الصفحات ونصوصها.'),
  ]);
}
