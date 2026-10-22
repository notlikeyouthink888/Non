/** الإعدادات: المظهر، الافتراضيات، المساحة المستعملة، ومسح البيانات. */
import { h, chips, toggle } from '../core/dom.js';
import { sheet, confirmBox, toast } from '../core/ui.js';
import { settings, resetSettings } from '../core/settings.js';
import { FILTERS } from '../core/image.js';
import { wipe } from '../core/db.js';
import { bytes } from '../core/fmt.js';
import { discardDraft } from '../core/project.js';
import { cleanCache } from '../core/native.js';

export function settingsSheet(onChanged) {
  sheet(({ close }) => {
    const usage = h('span.muted', '…');
    navigator.storage?.estimate?.().then((e) => { usage.textContent = bytes(e.usage || 0); }).catch(() => { usage.textContent = '—'; });

    return [
      h('div.field-group', [
        h('div.field-label', 'المظهر'),
        chips([
          { id: 'auto', label: 'حسب الجهاز' },
          { id: 'light', label: 'فاتح' },
          { id: 'dark', label: 'داكن' },
        ], settings.theme, (v) => { settings.theme = v; }),
      ]),
      h('div.field-group', [
        h('div.field-label', 'فلتر تلقائي للصور الجديدة'),
        chips(FILTERS, settings.autoFilter, (v) => { settings.autoFilter = v; }),
        h('div.muted.small', 'اختر «مستند» إن كنت تصوّر أوراقًا غالبًا.'),
      ]),
      h('div.setting-row', [h('span', 'ترقيم الصفحات افتراضيًا'), toggle(settings.pageNumbers, (v) => { settings.pageNumbers = v; })]),
      h('div.setting-row', [h('span', 'المساحة المستعملة'), usage]),
      h('button.btn.danger.wide', {
        type: 'button',
        onclick: async () => {
          if (!await confirmBox('حذف كل الملفات والمسودة والإعدادات من هذا التطبيق؟ لا يمكن التراجع.', { ok: 'حذف الكل', danger: true })) return;
          await wipe();
          await discardDraft();
          await cleanCache();
          resetSettings();
          close();
          toast('تم مسح كل البيانات');
          onChanged();
        },
      }, 'مسح كل البيانات'),
      h('p.about.muted.small', 'pdfs 1.0 · يعمل دون إنترنت · ملفاتك لا تغادر جهازك إلا حين تشاركها أنت.'),
    ];
  }, { title: 'الإعدادات' });
}
