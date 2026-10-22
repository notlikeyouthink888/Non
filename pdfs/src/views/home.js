/** الشاشة الرئيسية: بدء مستند جديد، متابعة المسودة، و«ملفاتي». */
import { h, fill, icon } from '../core/dom.js';
import { actions, confirmBox } from '../core/ui.js';
import { blobs, docs } from '../core/db.js';
import { bytes, pages, when } from '../core/fmt.js';
import { draft, hasDraft, newDraft, discardDraft, thumbnail } from '../core/project.js';
import { push } from '../app.js';
import { pickAndImport } from './pick.js';
import { docSheet, shareDoc } from './docs.js';
import { projectScreen } from './project.js';
import { settingsSheet } from './settings.js';

export function homeScreen() {
  const draftSlot = h('div');
  const list = h('div.doc-list');
  const countEl = h('span.count');
  const search = h('input.field.search', { type: 'search', placeholder: 'ابحث في ملفاتك', dir: 'auto' });
  const searchWrap = h('div.search-wrap', { hidden: true }, [icon('search', 18), search]);
  let all = [];
  const urls = [];

  async function start(camera) {
    const go = async () => {
      if (!hasDraft()) newDraft();
      if (await pickAndImport({ camera })) push(projectScreen);
    };
    if (!hasDraft()) return go();
    actions('لديك مسودة مفتوحة', [
      { icon: 'plus', label: `إضافة إلى «${draft.name}»`, run: go },
      { icon: 'file', label: 'بدء مستند جديد', run: async () => {
        if (!draft.docId && !await confirmBox('ستُحذف صور المسودة الحالية. متابعة؟', { ok: 'مستند جديد', danger: true })) return;
        await discardDraft();
        go();
      } },
    ]);
  }

  function renderDraft() {
    if (!hasDraft()) return fill(draftSlot, null);
    const img = h('img', { alt: '' });
    thumbnail(draft.pages[0], 200).then((u) => { img.src = u; }).catch(() => {});
    fill(draftSlot, h('div.draft-card', [
      h('button.draft-main', { type: 'button', onclick: () => push(projectScreen) }, [
        h('div.draft-thumb', img),
        h('div.draft-info', [
          h('strong', draft.docId ? 'تعديل غير مكتمل' : 'مسودة غير مكتملة'),
          h('span.muted', { dir: 'auto' }, `${draft.name} · ${pages(draft.pages.length)}`),
        ]),
        h('span.pill', 'متابعة'),
      ]),
      h('button.icon-btn.subtle', {
        type: 'button',
        'aria-label': 'تجاهل المسودة',
        onclick: async () => {
          if (await confirmBox('تجاهل المسودة وحذف صورها؟', { ok: 'تجاهل', danger: true })) {
            await discardDraft();
            renderDraft();
          }
        },
      }, icon('close', 18)),
    ]));
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const shown = q ? all.filter((d) => d.name.toLowerCase().includes(q)) : all;
    countEl.textContent = all.length ? String(all.length) : '';
    searchWrap.hidden = all.length < 4;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));

    if (!all.length) {
      return fill(list, h('div.empty', [
        h('div.empty-art', icon('file', 40)),
        h('p', 'لا توجد ملفات بعد'),
        h('p.muted.small', 'اختر صورًا من المعرض أو التقط صورة، وسنحوّلها إلى PDF خلال ثوانٍ.'),
      ]));
    }
    if (!shown.length) return fill(list, h('p.muted.center', 'لا نتائج'));

    fill(list, shown.map((d) => {
      const img = h('img', { alt: '', loading: 'lazy' });
      blobs.get(d.thumb).then((b) => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        urls.push(u);
        img.src = u;
      });
      return h('div.doc-row', [
        h('button.doc-main', { type: 'button', onclick: () => openSheet(d) }, [
          h('div.doc-thumb', img),
          h('div.doc-info', [
            h('strong', { dir: 'auto' }, d.name),
            h('span.muted.small', `${pages(d.pageCount)} · ${bytes(d.size)} · ${when(d.updated)}`),
          ]),
        ]),
        h('button.icon-btn', { type: 'button', 'aria-label': 'مشاركة', onclick: () => shareDoc(d) }, icon('share', 20)),
      ]);
    }));
  }

  function openSheet(d) {
    docSheet(d, { onChanged: refresh, onEdit: () => push(projectScreen) });
  }

  async function refresh() {
    all = await docs.all();
    renderDraft();
    renderList();
  }

  search.addEventListener('input', renderList);

  const el = h('div.screen.home', [
    h('header.topbar', [
      h('div.brand', [h('span.brand-mark', icon('file', 20)), h('span.brand-name', 'pdfs')]),
      h('button.icon-btn', { type: 'button', 'aria-label': 'الإعدادات', onclick: () => settingsSheet(refresh) }, icon('settings')),
    ]),
    h('section.hero', [
      h('h1', 'من صورك إلى PDF'),
      h('p.muted', 'قصّ، دوّر، حسّن، ثم احفظ وشارك — كل شيء داخل جهازك.'),
    ]),
    h('div.start-grid', [
      h('button.start-card.primary', { type: 'button', onclick: () => start(false) }, [
        h('span.start-ic', icon('image', 28)),
        h('strong', 'من المعرض'),
        h('span', 'اختر صورة أو أكثر'),
      ]),
      h('button.start-card', { type: 'button', onclick: () => start(true) }, [
        h('span.start-ic', icon('camera', 28)),
        h('strong', 'الكاميرا'),
        h('span', 'صوّر مستندًا الآن'),
      ]),
    ]),
    draftSlot,
    h('div.section-head', [h('h2', ['ملفاتي ', countEl])]),
    searchWrap,
    list,
  ]);

  refresh();
  return {
    el,
    onShow: refresh,
    destroy: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
