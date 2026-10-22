/** إجراءات الملف المحفوظ: فتح، مشاركة، حفظ في الجهاز، تعديل، إعادة تسمية، حذف. */
import { h, icon } from '../core/dom.js';
import { sheet, toast, confirmBox, promptBox } from '../core/ui.js';
import { blobs, docs, gc } from '../core/db.js';
import { shareFile, saveToDevice, openFile } from '../core/native.js';
import { bytes, pages, when, fileName } from '../core/fmt.js';
import { editDoc, hasDraft, draft } from '../core/project.js';

async function pdfOf(doc) {
  const b = await blobs.get(doc.pdf);
  if (!b) throw new Error('الملف غير موجود');
  return b;
}

const fail = (e) => toast(`تعذّر: ${e?.message || e}`, 'error');

export async function shareDoc(doc) {
  try { await shareFile(await pdfOf(doc), fileName(doc.name)); } catch (e) { fail(e); }
}

export async function saveDoc(doc) {
  try {
    const where = await saveToDevice(await pdfOf(doc), fileName(doc.name));
    toast(`حُفظ في ${where}`, 'ok');
  } catch (e) { fail(e); }
}

export async function openDoc(doc) {
  try { await openFile(await pdfOf(doc), fileName(doc.name)); } catch (e) { fail(e); }
}

export async function renameDoc(doc) {
  const name = await promptBox('إعادة تسمية', doc.name);
  if (!name || name === doc.name) return false;
  await docs.put({ ...doc, name, updated: Date.now() });
  if (draft.docId === doc.id) draft.name = name;
  return true;
}

export async function deleteDoc(doc) {
  if (!await confirmBox(`حذف «${doc.name}» نهائيًا؟`, { ok: 'حذف', danger: true })) return false;
  await docs.del(doc.id);
  await gc();
  toast('حُذف الملف');
  return true;
}

/**
 * ورقة تفاصيل الملف.
 * @param {object} doc
 * @param {{onChanged: Function, onEdit: Function}} hooks
 */
export function docSheet(doc, { onChanged, onEdit }) {
  const thumb = h('img.doc-hero-img', { alt: '' });
  blobs.get(doc.thumb).then((b) => { if (b) thumb.src = URL.createObjectURL(b); });

  const btn = (ic, label, run, cls = '') => h('button.big-action', { type: 'button', class: cls, onclick: run }, [icon(ic, 24), h('span', label)]);

  return sheet(({ close }) => [
    h('div.doc-hero', [
      h('div.doc-hero-thumb', thumb),
      h('div.doc-hero-info', [
        h('h3', { dir: 'auto' }, doc.name),
        h('p.muted', `${pages(doc.pageCount)} · ${bytes(doc.size)}`),
        h('p.muted.small', `آخر تعديل ${when(doc.updated)}`),
      ]),
    ]),
    h('div.action-grid', [
      btn('open', 'فتح', () => openDoc(doc), 'accent'),
      btn('share', 'مشاركة', () => shareDoc(doc)),
      btn('download', 'حفظ في الجهاز', () => saveDoc(doc)),
    ]),
    h('div.menu', [
      h('button.menu-item', {
        type: 'button',
        onclick: async () => {
          if (hasDraft() && draft.docId !== doc.id &&
            !await confirmBox('لديك مسودة غير محفوظة. فتح هذا الملف للتعديل سيستبدلها. متابعة؟', { ok: 'متابعة' })) return;
          await editDoc(doc);
          close();
          onEdit();
        },
      }, [icon('edit'), h('span', 'تعديل الصفحات')]),
      h('button.menu-item', {
        type: 'button',
        onclick: async () => { if (await renameDoc(doc)) { close(); onChanged(); } },
      }, [icon('file'), h('span', 'إعادة تسمية')]),
      h('button.menu-item.danger', {
        type: 'button',
        onclick: async () => { if (await deleteDoc(doc)) { close(); onChanged(); } },
      }, [icon('trash'), h('span', 'حذف')]),
    ]),
  ]);
}
