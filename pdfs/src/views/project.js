/** شاشة المستند: شبكة الصفحات، الترتيب بالسحب، إجراءات جماعية، ثم الإنشاء. */
import { h, fill, icon } from '../core/dom.js';
import { actions, confirmBox, promptBox, toast } from '../core/ui.js';
import { n, pages as pagesLabel } from '../core/fmt.js';
import { FILTERS, rotateEdits } from '../core/image.js';
import {
  draft, onChange, thumbnail, setName, removePage, duplicatePage, movePage,
  reversePages, updateAll, discardDraft,
} from '../core/project.js';
import { push, pop } from '../app.js';
import { pickAndImport } from './pick.js';
import { editorScreen } from './editor.js';
import { exportSheet } from './export.js';

export function projectScreen() {
  const grid = h('div.page-grid');
  const nameBtn = h('button.title-btn', { type: 'button', dir: 'auto', onclick: rename });
  const makeBtn = h('button.btn.primary.wide', { type: 'button', onclick: () => exportSheet({ onDone: () => pop() }) });

  async function rename() {
    const v = await promptBox('اسم الملف', draft.name);
    if (v) setName(v);
  }

  function addMenu() {
    actions('إضافة صفحات', [
      { icon: 'image', label: 'من المعرض', run: () => pickAndImport({ camera: false }) },
      { icon: 'camera', label: 'من الكاميرا', run: () => pickAndImport({ camera: true }) },
    ]);
  }

  function pageMenu(p, i) {
    const last = draft.pages.length - 1;
    actions(`الصفحة ${n(i + 1)}`, [
      { icon: 'crop', label: 'قصّ وتعديل', run: () => push(editorScreen, p.id) },
      { icon: 'rotr', label: 'تدوير يمينًا', run: () => updateAll((q) => (q.id === p.id ? rotateEdits(q, 1) : {})) },
      { icon: 'copy', label: 'تكرار الصفحة', run: () => duplicatePage(p.id) },
      i > 0 && { icon: 'first', label: 'نقل إلى البداية', run: () => movePage(i, 0) },
      i < last && { icon: 'last', label: 'نقل إلى النهاية', run: () => movePage(i, last) },
      { icon: 'trash', label: 'حذف الصفحة', danger: true, run: () => removePage(p.id) },
    ]);
  }

  function bulkMenu() {
    actions('كل الصفحات', [
      { icon: 'rotr', label: 'تدوير الكل يمينًا', run: () => updateAll((q) => rotateEdits(q, 1)) },
      { icon: 'rotl', label: 'تدوير الكل يسارًا', run: () => updateAll((q) => rotateEdits(q, -1)) },
      { icon: 'filter', label: 'فلتر للكل…', run: filterAll },
      { icon: 'swap', label: 'عكس الترتيب', run: reversePages },
      { icon: 'trash', label: 'حذف المسودة', danger: true, run: async () => {
        if (await confirmBox('حذف كل الصفحات والخروج؟', { ok: 'حذف', danger: true })) {
          await discardDraft();
          pop();
        }
      } },
    ]);
  }

  function filterAll() {
    actions('تطبيق فلتر على كل الصفحات', FILTERS.map((f) => ({
      icon: 'filter',
      label: f.label,
      run: () => { updateAll(() => ({ filter: f.id })); toast(`طُبّق «${f.label}» على كل الصفحات`); },
    })));
  }

  /* ── بطاقة الصفحة مع السحب للترتيب ── */
  function card(p, i) {
    const img = h('img', { alt: `الصفحة ${i + 1}`, draggable: false });
    thumbnail(p).then((u) => { img.src = u; }).catch(() => {});
    const el = h('div.page-card', { 'data-id': p.id }, [
      h('button.page-open', { type: 'button', 'aria-label': `تعديل الصفحة ${i + 1}` }, img),
      h('span.page-num', n(i + 1)),
      p.filter !== 'none' ? h('span.page-tag', FILTERS.find((f) => f.id === p.filter)?.label) : null,
      h('button.page-more', { type: 'button', 'aria-label': 'خيارات', onclick: (e) => { e.stopPropagation(); pageMenu(p, i); } }, icon('more', 18)),
    ]);
    sortable(el, p.id);
    return el;
  }

  let drag = null;
  function sortable(el, id) {
    const open = el.querySelector('.page-open');
    let timer = null, sx = 0, sy = 0, moved = false;

    open.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      sx = e.clientX; sy = e.clientY; moved = false;
      timer = setTimeout(() => startDrag(e), 320);
    });
    open.addEventListener('pointermove', (e) => {
      if (drag) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { moved = true; clearTimeout(timer); }
    });
    const cancel = () => clearTimeout(timer);
    open.addEventListener('pointerup', cancel);
    open.addEventListener('pointercancel', cancel);
    open.addEventListener('click', () => {
      if (moved || drag || el.dataset.justDragged) { delete el.dataset.justDragged; return; }
      push(editorScreen, id);
    });
    open.addEventListener('contextmenu', (e) => e.preventDefault());
    // يمنع التمرير أثناء السحب حتى لا يلغي المتصفّح الإيماءة
    open.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

    function startDrag(e) {
      const from = draft.pages.findIndex((q) => q.id === id);
      const r = el.getBoundingClientRect();
      drag = { id, from, to: from, ox: e.clientX - r.left, oy: e.clientY - r.top };
      el.classList.add('dragging');
      el.style.width = `${r.width}px`;
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      const ph = h('div.page-card.placeholder');
      ph.style.height = `${r.height}px`;
      el.before(ph);
      drag.ph = ph;
      navigator.vibrate?.(15);
      open.setPointerCapture?.(e.pointerId);

      const onMove = (ev) => {
        ev.preventDefault();
        el.style.left = `${ev.clientX - drag.ox}px`;
        el.style.top = `${ev.clientY - drag.oy}px`;
        // أقرب بطاقة تحت الإصبع
        const others = [...grid.querySelectorAll('.page-card:not(.dragging):not(.placeholder)')];
        let target = null;
        for (const o of others) {
          const rr = o.getBoundingClientRect();
          if (ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top && ev.clientY <= rr.bottom) { target = o; break; }
        }
        if (target) {
          const rr = target.getBoundingClientRect();
          // في الاتجاه من اليمين لليسار: النصف الأيمن = قبل
          const before = ev.clientX > rr.left + rr.width / 2;
          if (before) target.before(ph); else target.after(ph);
        }
        // تمرير تلقائي قرب الحواف
        const edge = 70;
        if (ev.clientY < edge) window.scrollBy(0, -12);
        else if (ev.clientY > innerHeight - edge) window.scrollBy(0, 12);
      };
      const onUp = () => {
        open.removeEventListener('pointermove', onMove);
        open.removeEventListener('pointerup', onUp);
        open.removeEventListener('pointercancel', onUp);
        const seq = [...grid.children].filter((c) => c !== el);
        const to = seq.indexOf(ph);
        ph.remove();
        el.classList.remove('dragging');
        el.style.cssText = '';
        el.dataset.justDragged = '1';
        setTimeout(() => delete el.dataset.justDragged, 50);
        const f = drag.from;
        drag = null;
        if (to >= 0 && to !== f) movePage(f, to);
        else render();
      };
      open.addEventListener('pointermove', onMove, { passive: false });
      open.addEventListener('pointerup', onUp);
      open.addEventListener('pointercancel', onUp);
    }
  }

  function render() {
    nameBtn.replaceChildren(h('span', draft.name || 'بلا اسم'), icon('edit', 16));
    const count = draft.pages.length;
    makeBtn.disabled = !count;
    fill(makeBtn, [icon('file', 20), h('span', count ? `إنشاء PDF · ${pagesLabel(count)}` : 'أضف صفحات أولًا')]);
    fill(grid, [
      ...draft.pages.map((p, i) => card(p, i)),
      h('button.page-card.add', { type: 'button', onclick: addMenu }, [icon('plus', 30), h('span', 'إضافة')]),
    ]);
  }

  const off = onChange(() => { if (!drag) render(); });

  const el = h('div.screen.project', [
    h('header.topbar', [
      h('button.icon-btn', { type: 'button', 'aria-label': 'رجوع', onclick: () => pop() }, icon('back')),
      nameBtn,
      h('button.icon-btn', { type: 'button', 'aria-label': 'إجراءات لكل الصفحات', onclick: bulkMenu }, icon('more')),
    ]),
    h('p.hint.muted.small', 'اضغط على صفحة لقصّها وتعديلها · اضغط مطوّلًا ثم اسحب لتغيير الترتيب'),
    grid,
    h('div.bottom-bar', makeBtn),
  ]);

  render();
  return { el, onShow: render, destroy: off };
}
