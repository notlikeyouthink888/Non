/**
 * محرّر الخريطة الذهنية باللمس:
 *   ضغطة = اختيار · ضغطتين = كتابة · ضغطة طويلة = قائمة · سحب الدائرة = تحريكها ويا فروعها
 *   سحب الفراغ = تحريك الخريطة · إصبعين = تكبير وتصغير
 */

import { h, svg, fill, toggle } from '../core/dom.js';
import { openPage, toast, sheet, promptSheet, confirmSheet, menuSheet, haptic } from '../core/ui.js';
import { Files } from '../core/native.js';
import { touch } from '../model.js';
import {
  ensureMap, nodeById, descendants, addChild, deleteNode, toggleLink,
  applyTemplate, importPoints, autoLayout, bounds, outline, labelOf, newMap, COLORS,
} from './model.js';
import { drawMap, makeRadius } from './render.js';

const MIN_K = 0.25;
const MAX_K = 2.6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const short = (t, n = 24) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

/**
 * يفتح المحرّر بصفحة كاملة.
 * points: عناوين نقل الإيجابيات/السلبيات { pros, cons } — حسب نوع الدراسة.
 */
export function openMapEditor({ study, rootLabel, subtitle = '', points = { pros: '✅ الإيجابيات', cons: '❌ السلبيات' }, onClose }) {
  const map = ensureMap(study);
  const radiusOf = makeRadius(rootLabel);
  const view = { x: 0, y: 0, k: 1 };
  const undoStack = [];
  let selected = null;
  let linkFrom = null;
  let els = { nodeEls: new Map(), linkEls: [] };
  let byId = new Map();
  let lastTap = null;

  const linksG = svg('g', { class: 'mm-links' });
  const nodesG = svg('g', { class: 'mm-nodes' });
  const world = svg('g', { class: 'mm-world' }, [
    svg('rect', { class: 'mm-bg', x: -10000, y: -10000, width: 20000, height: 20000, fill: 'url(#mm-dots)' }),
    linksG,
    nodesG,
  ]);
  const stage = svg('svg', { class: 'mm-svg', 'aria-label': 'الخريطة الذهنية' }, [
    svg('defs', null, [
      svg('pattern', { id: 'mm-dots', width: 28, height: 28, patternUnits: 'userSpaceOnUse' }, [
        svg('circle', { class: 'mm-dot', cx: 2, cy: 2, r: 1.4 }),
      ]),
    ]),
    world,
  ]);

  const undoBtn = h('button.btn.icon.ghost', { 'aria-label': 'تراجع', title: 'تراجع', onclick: undo }, '↶');
  const hint = h('div.mm-hint');
  const bar = h('div.mm-bar');
  const zoomBox = h('div.mm-zoom', [
    h('button', { type: 'button', 'aria-label': 'تكبير', onclick: () => zoomCenter(1.3) }, '＋'),
    h('button', { type: 'button', 'aria-label': 'تصغير', onclick: () => zoomCenter(1 / 1.3) }, '－'),
    h('button', { type: 'button', 'aria-label': 'توسيط الخريطة', onclick: () => fit(true) }, '⤢'),
  ]);

  openPage((el, { close }) => {
    fill(el, [
      h('header.page-head', [
        h('button.btn.icon.ghost', { 'aria-label': 'رجوع', onclick: close }, '→'),
        h('div.grow', [h('div.page-t', '🧠 الخريطة الذهنية'), h('div.page-s.ellipsis', subtitle || rootLabel)]),
        undoBtn,
        h('button.btn.icon.ghost', { 'aria-label': 'المزيد', onclick: more }, '⋯'),
      ]),
      h('div.mm-stage', [stage, hint, zoomBox]),
      bar,
    ]);
  }, { className: 'mm-page', onClose: () => onClose?.() });

  /* ────────── الرسم ────────── */

  function render() {
    byId = new Map(map.nodes.map((n) => [n.id, n]));
    els = drawMap(linksG, nodesG, map, rootLabel, { selected, linkFrom });
    updateUI();
  }

  function updatePositions(ids) {
    const set = new Set(ids);
    for (const id of ids) {
      const n = byId.get(id);
      els.nodeEls.get(id)?.setAttribute('transform', `translate(${n.x} ${n.y})`);
    }
    for (const L of els.linkEls) {
      if (!set.has(L.a) && !set.has(L.b)) continue;
      const a = byId.get(L.a);
      const b = byId.get(L.b);
      L.el.setAttribute('x1', a.x);
      L.el.setAttribute('y1', a.y);
      L.el.setAttribute('x2', b.x);
      L.el.setAttribute('y2', b.y);
    }
  }

  function applyView(animate = false) {
    world.classList.toggle('anim', animate);
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
  }

  const rect = () => stage.getBoundingClientRect();

  function fit(animate) {
    const r = rect();
    if (!r.width || !r.height) { requestAnimationFrame(() => fit(animate)); return; }
    const b = bounds(map, radiusOf);
    const pad = 36;
    const k = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.1), MIN_K, MAX_K);
    view.k = k;
    view.x = r.width / 2 - (b.x0 + b.w / 2) * k;
    view.y = r.height / 2 - (b.y0 + b.h / 2) * k;
    applyView(animate);
  }

  function zoomAt(cx, cy, factor, animate = false) {
    const r = rect();
    const k = clamp(view.k * factor, MIN_K, MAX_K);
    const wx = (cx - r.left - view.x) / view.k;
    const wy = (cy - r.top - view.y) / view.k;
    view.k = k;
    view.x = cx - r.left - wx * k;
    view.y = cy - r.top - wy * k;
    applyView(animate);
  }

  function zoomCenter(factor) {
    const r = rect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor, true);
  }

  function ensureVisible(n) {
    const r = rect();
    const rad = radiusOf(n) * view.k;
    const sx = n.x * view.k + view.x;
    const sy = n.y * view.k + view.y;
    const m = 24;
    if (sx - rad < m || sx + rad > r.width - m || sy - rad < m || sy + rad > r.height - m) {
      view.x = r.width / 2 - n.x * view.k;
      view.y = r.height / 2 - n.y * view.k;
      applyView(true);
    }
  }

  /* ────────── الواجهة حسب الحالة ────────── */

  function tool(icon, label, onClick, cls = '') {
    return h('button.mm-tool' + cls, { type: 'button', onclick: onClick }, [h('span.i', icon), h('span.l', label)]);
  }

  function updateUI() {
    undoBtn.disabled = !undoStack.length;
    const sel = selected && byId.get(selected);

    if (linkFrom) {
      hint.textContent = `🔗 اختر الدائرة اللي تريد تربطها ويا «${short(labelOf(byId.get(linkFrom), rootLabel), 18)}»`;
      hint.classList.add('on');
      fill(bar, [tool('✕', 'إلغاء الربط', () => { linkFrom = null; render(); })]);
      return;
    }

    hint.classList.toggle('on', map.nodes.length < 3 || !!sel);
    if (sel) hint.textContent = 'اسحب الدائرة حتى تحرّكها ويا فروعها · ضغطتين حتى تكتب';
    else hint.textContent = map.nodes.length < 2
      ? 'ابدأ بـ «＋ دائرة» · أو جرّب الفروع الجاهزة من ⋯'
      : 'اضغط على دائرة حتى تختارها · إصبعين للتكبير';

    if (!sel) {
      fill(bar, [
        tool('＋', 'دائرة جديدة', () => addTo('root'), '.main'),
        tool('🧩', 'فروع جاهزة', template),
        tool('🌀', 'ترتيب', layout),
      ]);
    } else if (sel.id === 'root') {
      fill(bar, [
        tool('＋', 'فرع', () => addTo(sel.id), '.main'),
        tool('✎', 'اسم المركز', () => editNode(sel.id)),
        tool('🔗', 'ربط', () => startLink(sel.id)),
      ]);
    } else {
      fill(bar, [
        tool('＋', 'فرع', () => addTo(sel.id), '.main'),
        tool('✎', 'كتابة', () => editNode(sel.id)),
        tool('🎨', 'لون', () => colorNode(sel.id)),
        tool('🔗', 'ربط', () => startLink(sel.id)),
        tool('🗑', 'حذف', () => removeNode(sel.id), '.danger'),
      ]);
    }
  }

  function select(id) {
    selected = id;
    for (const [nid, g] of els.nodeEls) g.classList.toggle('sel', nid === id);
    updateUI();
  }

  /* ────────── التعديلات ────────── */

  function pushUndo() {
    undoStack.push(JSON.stringify({ nodes: map.nodes, links: map.links }));
    if (undoStack.length > 40) undoStack.shift();
  }

  function undo() {
    const snap = undoStack.pop();
    if (!snap) return;
    const s = JSON.parse(snap);
    map.nodes = s.nodes;
    map.links = s.links;
    if (selected && !map.nodes.some((n) => n.id === selected)) selected = null;
    commit();
    render();
    haptic();
  }

  const commit = () => touch(study);

  async function addTo(parentId) {
    const t = await promptSheet('دائرة جديدة', {
      placeholder: 'اكتب الفكرة… مثلًا: الإيجار غالي بالمنطقة',
      multiline: true,
      okText: 'أضف',
    });
    if (!t) return;
    pushUndo();
    const n = addChild(map, parentId, t, radiusOf);
    commit();
    selected = n.id;
    render();
    ensureVisible(n);
    haptic();
  }

  async function editNode(id) {
    const n = byId.get(id);
    if (!n) return;
    const isRoot = id === 'root';
    const t = await promptSheet(isRoot ? 'اسم المركز' : 'تعديل الدائرة', {
      value: labelOf(n, rootLabel),
      multiline: !isRoot,
      hint: isRoot ? 'إذا تمسحه يرجع اسم المشروع' : '',
    });
    if (t === null || (!isRoot && !t)) return;
    pushUndo();
    n.t = isRoot ? (t && t !== rootLabel ? t : null) : t;
    commit();
    render();
  }

  function colorNode(id) {
    const n = byId.get(id);
    if (!n) return;
    let withKids = false;
    sheet('لون الدائرة', ({ close }) => h('div', [
      h('div.mm-colors', COLORS.map((c) => h('button.mm-color.c-' + c.id + (n.c === c.id ? '.on' : ''), {
        type: 'button',
        onclick: () => {
          pushUndo();
          const ids = withKids ? descendants(map, id) : [id];
          ids.forEach((x) => { const m = byId.get(x); if (m) m.c = c.id; });
          commit();
          close();
          render();
        },
      }, [h('i'), h('span', c.name)]))),
      h('div.item.mt', [h('div.grow', [h('div.t', 'لوّن فروعها ويّاها')]), toggle(false, (on) => { withKids = on; })]),
    ]));
  }

  async function removeNode(id) {
    const n = byId.get(id);
    if (!n || id === 'root') return;
    const count = descendants(map, id).length - 1;
    if (count > 0 && !await confirmSheet('حذف الدائرة', `راح تنحذف «${short(n.t)}» ويا فروعها (${count}).`, { okText: 'احذف' })) return;
    pushUndo();
    deleteNode(map, id);
    selected = n.p;
    commit();
    render();
    toast('انحذفت', '', { action: 'تراجع', onAction: undo });
  }

  function startLink(id) {
    linkFrom = id;
    render();
  }

  function finishLink(target) {
    const from = linkFrom;
    linkFrom = null;
    if (target === from) { render(); return; }
    pushUndo();
    const r = toggleLink(map, from, target);
    if (r === 'tree') {
      undoStack.pop();
      toast('هاي الدائرتين مربوطة أصلًا');
    } else {
      commit();
      toast(r === 'added' ? 'انربطت الدائرتين 🔗' : 'انشال الربط', 'ok');
      haptic();
    }
    selected = target;
    render();
  }

  function template() {
    pushUndo();
    const n = applyTemplate(map, radiusOf);
    if (!n) { undoStack.pop(); toast('الفروع الجاهزة موجودة أصلًا'); return; }
    commit();
    render();
    fit(true);
    toast(`انضافت ${n} فروع — عدّلها وكمّل عليها`, 'ok');
  }

  function importPts() {
    if (!study.pros.length && !study.cons.length) { toast('بعدك ما كاتب نقاط بصفحة الدراسة'); return; }
    pushUndo();
    const n = importPoints(map, study, radiusOf, points);
    if (!n) { undoStack.pop(); toast('كل النقاط موجودة بالخريطة'); return; }
    commit();
    render();
    fit(true);
    toast(`انضافت ${n} نقطة للخريطة`, 'ok');
  }

  function layout() {
    if (map.nodes.length < 2) { toast('أضف دوائر أول'); return; }
    pushUndo();
    autoLayout(map, radiusOf);
    commit();
    render();
    fit(true);
  }

  async function shareOutline() {
    const text = `🧠 خريطة: ${rootLabel}\n\n${outline(map, rootLabel)}`;
    const r = await Files.shareText(text, 'الخريطة الذهنية');
    if (r === 'copied') toast('انتسخت الخريطة كنص', 'ok');
  }

  async function clearAll() {
    if (!await confirmSheet('مسح الخريطة', 'راح تنمسح كل الدوائر ويبقى المركز بس.', { okText: 'امسح' })) return;
    pushUndo();
    const fresh = newMap();
    fresh.nodes[0].t = nodeById(map, 'root')?.t ?? null;
    map.nodes = fresh.nodes;
    map.links = [];
    selected = null;
    commit();
    render();
    fit(true);
    toast('انمسحت', '', { action: 'تراجع', onAction: undo });
  }

  function nodeMenu(id) {
    const n = byId.get(id);
    if (!n) return;
    const isRoot = id === 'root';
    menuSheet(short(labelOf(n, rootLabel), 40), [
      { icon: '＋', label: 'أضف فرع', onClick: () => addTo(id) },
      { icon: '✎', label: isRoot ? 'اسم المركز' : 'تعديل الكتابة', onClick: () => editNode(id) },
      !isRoot && { icon: '🎨', label: 'تغيير اللون', onClick: () => colorNode(id) },
      { icon: '🔗', label: 'ربط بدائرة ثانية', onClick: () => startLink(id) },
      !isRoot && { icon: '🗑', label: 'حذف', danger: true, onClick: () => removeNode(id) },
    ]);
  }

  function more() {
    menuSheet('الخريطة', [
      { icon: '🧩', label: 'أضف فروع جاهزة', sub: 'الزبائن، المنافسين، المكان، رأس المال، الأرباح، المخاطر…', onClick: template },
      { icon: '⚖️', label: 'انقل نقاط الدراسة للخريطة', sub: 'كل نقطة تصير دائرة خضراء أو حمراء', onClick: importPts },
      { icon: '🌀', label: 'رتّب الدوائر تلقائيًا', onClick: layout },
      { icon: '📤', label: 'شارك الخريطة كنص', onClick: shareOutline },
      { icon: '🗑', label: 'امسح الخريطة كلها', danger: true, onClick: clearAll },
    ]);
  }

  /* ────────── اللمس ────────── */

  const pts = new Map();
  let g = null; // الإيماءة الحالية

  function onTap(id) {
    if (linkFrom) {
      if (id) finishLink(id);
      else { linkFrom = null; render(); }
      return;
    }
    if (!id) { if (selected) select(null); return; }
    const now = Date.now();
    if (lastTap && lastTap.id === id && now - lastTap.t < 380) {
      lastTap = null;
      editNode(id);
      return;
    }
    lastTap = { id, t: now };
    select(id);
    haptic(6);
  }

  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  stage.addEventListener('pointerdown', (e) => {
    try { stage.setPointerCapture(e.pointerId); } catch { /* غير مدعوم */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;
    const nodeEl = e.target.closest?.('.mm-node');
    const id = nodeEl?.getAttribute('data-id') || null;
    g = { type: 'press', id, pid: e.pointerId, sx: e.clientX, sy: e.clientY };
    if (id) {
      g.timer = setTimeout(() => {
        if (g?.type !== 'press' || g.id !== id) return;
        g = { type: 'done' };
        select(id);
        haptic(18);
        nodeMenu(id);
      }, 520);
    }
  });

  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (g?.type === 'pinch') { movePinch(); return; }
    if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;

    if (g.type === 'press' && Math.hypot(dx, dy) > 7) {
      clearTimeout(g.timer);
      if (g.id && g.id !== 'root' && !linkFrom) {
        pushUndo();
        const ids = descendants(map, g.id);
        g = { ...g, type: 'drag', ids, start: ids.map((id) => { const n = byId.get(id); return { n, x: n.x, y: n.y }; }) };
        if (selected !== g.id) select(g.id);
      } else {
        g = { ...g, type: 'pan', vx: view.x, vy: view.y };
      }
    }
    if (g.type === 'drag') {
      for (const s of g.start) {
        s.n.x = Math.round(s.x + dx / view.k);
        s.n.y = Math.round(s.y + dy / view.k);
      }
      updatePositions(g.ids);
    } else if (g.type === 'pan') {
      view.x = g.vx + dx;
      view.y = g.vy + dy;
      applyView();
    }
  });

  function endPointer(e, cancelled) {
    pts.delete(e.pointerId);
    if (g?.type === 'pinch') {
      if (pts.size === 1) {
        const [pid, p] = [...pts.entries()][0];
        g = { type: 'pan', pid, sx: p.x, sy: p.y, vx: view.x, vy: view.y };
      } else if (!pts.size) g = null;
      return;
    }
    if (!g || g.pid !== e.pointerId) { if (!pts.size) g = null; return; }
    clearTimeout(g.timer);
    if (g.type === 'press' && !cancelled) onTap(g.id);
    else if (g.type === 'drag') {
      const moved = g.start.some((s) => s.n.x !== s.x || s.n.y !== s.y);
      if (moved) commit(); else undoStack.pop();
      updateUI();
    }
    g = null;
  }

  stage.addEventListener('pointerup', (e) => endPointer(e, false));
  stage.addEventListener('pointercancel', (e) => endPointer(e, true));

  function startPinch() {
    if (g?.type === 'drag') {
      const moved = g.start.some((s) => s.n.x !== s.x || s.n.y !== s.y);
      if (moved) commit(); else undoStack.pop();
    }
    clearTimeout(g?.timer);
    const [a, b] = [...pts.values()];
    g = {
      type: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      k0: view.k, x0: view.x, y0: view.y,
    };
  }

  function movePinch() {
    const [a, b] = [...pts.values()];
    if (!a || !b) return;
    const r = rect();
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const k = clamp((g.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0, MIN_K, MAX_K);
    const wx = (g.m0.x - r.left - g.x0) / g.k0;
    const wy = (g.m0.y - r.top - g.y0) / g.k0;
    view.k = k;
    view.x = m.x - r.left - wx * k;
    view.y = m.y - r.top - wy * k;
    applyView();
  }

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  render();
  requestAnimationFrame(() => fit(false));
}
