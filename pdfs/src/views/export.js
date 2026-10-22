/** خيارات الإنشاء ثم ورقة النتيجة (مشاركة، حفظ، فتح). */
import { h, icon, chips, toggle } from '../core/dom.js';
import { sheet, busy, toast } from '../core/ui.js';
import { PAGE_SIZES } from '../core/pdf.js';
import { settings, QUALITY } from '../core/settings.js';
import { bytes, pages } from '../core/fmt.js';
import { draft, exportDraft, setName, discardDraft } from '../core/project.js';
import { shareDoc, saveDoc, openDoc } from './docs.js';

const SIZE_OPTS = Object.entries(PAGE_SIZES).map(([id, s]) => ({ id, label: s.label }));
const ORIENT_OPTS = [
  { id: 'auto', label: 'تلقائي' },
  { id: 'portrait', label: 'عمودي' },
  { id: 'landscape', label: 'أفقي' },
];
const MARGIN_OPTS = [
  { id: 'none', label: 'بلا هوامش' },
  { id: 'small', label: 'صغيرة' },
  { id: 'large', label: 'كبيرة' },
];
const QUALITY_OPTS = Object.entries(QUALITY).map(([id, q]) => ({ id, label: q.label }));

const field = (label, control, hint) => h('div.field-group', [h('div.field-label', label), control, hint ? h('div.muted.small', hint) : null]);

export function exportSheet({ onDone }) {
  const opts = {
    size: settings.size,
    orientation: settings.orientation,
    margin: settings.margin,
    quality: settings.quality,
    pageNumbers: settings.pageNumbers,
  };

  sheet(({ close }) => {
    const name = h('input.field', { value: draft.name, dir: 'auto', placeholder: 'اسم الملف' });
    const orient = field('الاتجاه', chips(ORIENT_OPTS, opts.orientation, (v) => { opts.orientation = v; }));
    const syncOrient = () => { orient.hidden = opts.size === 'fit'; };
    syncOrient();

    const create = async () => {
      setName(name.value.trim() || draft.name);
      // نتذكّر آخر اختيار كافتراضي للمرّة القادمة
      Object.assign(settings, opts);
      close();
      const b = busy('جارٍ الإنشاء…');
      let doc;
      try {
        doc = await exportDraft({ ...opts }, (p, t) => b.set(p, t));
      } catch (e) {
        b.done();
        toast(`تعذّر إنشاء الملف: ${e?.message || e}`, 'error');
        return;
      }
      b.done();
      resultSheet(doc, onDone);
    };

    return [
      field('اسم الملف', name),
      field('حجم الصفحة', chips(SIZE_OPTS, opts.size, (v) => { opts.size = v; syncOrient(); })),
      orient,
      field('الهوامش', chips(MARGIN_OPTS, opts.margin, (v) => { opts.margin = v; })),
      field('الجودة', chips(QUALITY_OPTS, opts.quality, (v) => { opts.quality = v; }), 'الجودة الأقل تعطي ملفًا أصغر يسهل إرساله.'),
      h('div.setting-row', [h('span', 'ترقيم الصفحات'), toggle(opts.pageNumbers, (v) => { opts.pageNumbers = v; })]),
      h('button.btn.primary.wide', { type: 'button', onclick: create }, [icon('file', 20), h('span', `إنشاء PDF · ${pages(draft.pages.length)}`)]),
    ];
  }, { title: 'إعدادات الملف' });
}

function resultSheet(doc, onDone) {
  const btn = (ic, label, run, cls = '') => h('button.big-action', { type: 'button', class: cls, onclick: run }, [icon(ic, 26), h('span', label)]);
  sheet(({ close }) => [
    h('div.result', [
      h('div.result-ic', icon('check', 34)),
      h('h3', { dir: 'auto' }, doc.name),
      h('p.muted', `${pages(doc.pageCount)} · ${bytes(doc.size)} · محفوظ في «ملفاتي»`),
    ]),
    h('div.action-grid', [
      btn('share', 'مشاركة', () => shareDoc(doc), 'accent'),
      btn('download', 'حفظ في الجهاز', () => saveDoc(doc)),
      btn('open', 'فتح', () => openDoc(doc)),
    ]),
    h('div.row-btns', [
      h('button.btn', { type: 'button', onclick: () => close() }, 'متابعة التعديل'),
      h('button.btn.primary', {
        type: 'button',
        onclick: async () => { close(); await discardDraft(); onDone(); },
      }, 'تم'),
    ]),
  ], { title: 'جاهز ✓' });
}
