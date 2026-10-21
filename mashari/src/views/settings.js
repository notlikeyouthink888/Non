/** الإعدادات: المظهر، العملة، النسخ الاحتياطي، المشاريع المخفية، ومسح الدراسة. */

import { h, fill, chipGroup, settingRow, toggle } from '../core/dom.js';
import { state, save, exportAll, importAll, resetAll } from '../core/store.js';
import { sheet, toast, confirmSheet, applyTheme } from '../core/ui.js';
import { emit } from '../core/bus.js';
import { Files, isNative } from '../core/native.js';
import { today } from '../core/text.js';
import { hiddenProjects, restoreProject, studiedProjects, countProjects } from '../model.js';
import { PROJECTS } from '../data/projects.js';

const backupName = () => `dirasat-mashari-${today()}.json`;

export function openSettings() {
  const body = h('div.settings');
  sheet('الإعدادات', body);

  function render() {
    const s = state.settings;
    const hidden = hiddenProjects();
    fill(body, [
      h('h2.sec', 'المظهر'),
      chipGroup([
        { value: 'dark', label: '🌙 داكن' },
        { value: 'light', label: '☀️ فاتح' },
        { value: 'auto', label: '📱 حسب الجهاز' },
      ], s.theme, (v) => { s.theme = v; applyTheme(v); save(); }),

      h('h2.sec', 'العملة بالحسبة'),
      chipGroup([
        { value: 'IQD', label: 'دينار عراقي (د.ع)' },
        { value: 'USD', label: 'دولار ($)' },
      ], s.currency, (v) => { s.currency = v; save(); emit('changed'); }),

      h('h2.sec', 'اللمس'),
      settingRow('اهتزاز خفيف عند الضغط', null, toggle(s.haptics, (on) => { s.haptics = on; save(); })),

      h('h2.sec', 'بياناتي'),
      h('div.card.tight', [
        h('div.card-s', `كل دراستك محفوظة بجهازك فقط (${studiedProjects().length} مشروع مدروس). `
          + 'احفظ نسخة بين فترة وفترة حتى ما تضيع إذا بدّلت التلفون أو مسحت التطبيق.'),
      ]),
      h('div.grid2', [
        h('button.btn', { type: 'button', onclick: doSave }, '💾 احفظ نسخة'),
        h('button.btn', { type: 'button', onclick: doShare }, '📤 أرسل النسخة'),
      ]),
      h('button.btn.block.mt', { type: 'button', onclick: () => doImport(render) }, '📥 رجّع نسخة محفوظة'),

      h('h2.sec', `المشاريع المخفية (${hidden.length})`),
      hidden.length
        ? h('div.list', hidden.map((p) => h('div.item', [
          h('span.n', p.icon),
          h('div.grow', [h('div.t', p.name)]),
          h('button.btn.sm', { type: 'button', onclick: () => { restoreProject(p.id); emit('changed'); render(); toast('رجع للقائمة', 'ok'); } }, 'رجّعه'),
        ])))
        : h('div.muted', 'ما مخفي شي. أي فكرة من القاعدة تگدر تخفيها من صفحتها.'),

      h('h2.sec', 'منطقة الخطر'),
      h('button.btn.danger.block', {
        type: 'button',
        onclick: async () => {
          if (!await confirmSheet('مسح كل الدراسة', 'راح تنمسح كل الأحكام والنقاط والملاحظات والخرائط والحسبات والمشاريع اللي أضفتها. ما يمكن التراجع — احفظ نسخة قبلها.', { okText: 'امسح كلشي' })) return;
          resetAll();
          applyTheme();
          emit('changed');
          render();
          toast('انمسح كلشي ورجع التطبيق جديد', 'ok');
        },
      }, '🗑 امسح كل الدراسة'),

      h('h2.sec', 'عن التطبيق'),
      h('div.card.tight', [
        h('div.card-t', 'دراسة مشاريع'),
        h('div.card-s', `${PROJECTS.length} فكرة مشروع من السوق العراقي (يظهر هسه ${countProjects()})، `
          + 'وإنت اللي تقرر: ينجح لو يفشل، الإيجابيات والسلبيات، الملاحظات، الحسبة، والخريطة الذهنية. '
          + 'يشتغل بدون إنترنت، وبدون حساب.'),
      ]),
    ]);
  }

  render();
}

async function doSave() {
  try {
    const ok = await Files.save(backupName(), exportAll());
    if (ok) toast(isNative() ? 'انحفظت النسخة بالمكان اللي اخترته' : 'نزلت النسخة', 'ok');
  } catch (err) {
    toast('ما انحفظت النسخة: ' + (err?.message || ''), 'err');
  }
}

async function doShare() {
  try {
    await Files.shareFile(backupName(), exportAll(), { title: 'نسخة دراسة المشاريع' });
  } catch (err) {
    toast('ما گدرت أرسل النسخة: ' + (err?.message || ''), 'err');
  }
}

async function doImport(render) {
  let file;
  try {
    file = await Files.open();
  } catch (err) {
    toast('ما گدرت أفتح الملف: ' + (err?.message || ''), 'err');
    return;
  }
  if (!file) return;
  if (!await confirmSheet('رجّع النسخة', 'راح تتبدّل دراستك الحالية بالنسخة اللي اخترتها.', { okText: 'رجّعها', danger: false })) return;
  try {
    importAll(file.data);
    applyTheme();
    emit('changed');
    render();
    toast('رجعت النسخة', 'ok');
  } catch {
    toast('هذا الملف مو نسخة من التطبيق', 'err');
  }
}
