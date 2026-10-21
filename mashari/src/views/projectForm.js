/** ورقة إضافة مشروع جديد أو تعديل معلومات مشروع. */

import { h, chipGroup, field } from '../core/dom.js';
import { sheet, toast, promptSheet, haptic } from '../core/ui.js';
import { allCats, addProject, updateProject, addCustomCat, TYPES, CAPITALS } from '../model.js';
import { PICK_ICONS } from '../data/guide.js';

/**
 * existing: مشروع للتعديل أو null للإضافة.
 * onSaved(project) يُستدعى بعد الحفظ.
 */
export function openProjectForm(existing = null, { onSaved, defaultCat, draft } = {}) {
  const d = {
    name: existing?.name || '',
    icon: existing?.icon || '💡',
    cat: existing?.cat || defaultCat || 'trade',
    type: existing?.type || 'shop',
    cap: existing?.cap || 1,
    desc: existing?.desc || '',
    ...draft,
  };

  sheet(existing ? 'تعديل المشروع' : 'مشروع جديد', ({ close }) => {
    const name = h('input', { value: d.name, placeholder: 'مثلًا: محل بيع نظارات شمسية', maxLength: 80 });
    name.addEventListener('input', () => { d.name = name.value; });

    const icon = h('input.icon-in', { value: d.icon, maxLength: 4, 'aria-label': 'أيقونة' });
    icon.addEventListener('input', () => { d.icon = icon.value.trim() || '💡'; });
    const picks = h('div.chips.scroll', PICK_ICONS.map((ic) => h('button.chip.ico-chip', {
      type: 'button',
      onclick: () => { d.icon = ic; icon.value = ic; haptic(); },
    }, ic)));

    const desc = h('textarea', { value: d.desc, placeholder: 'شنو المشروع؟ شنو يبيع أو يقدّم؟', rows: 2, maxLength: 300 });
    desc.addEventListener('input', () => { d.desc = desc.value; });

    const cats = allCats().map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
    const catChips = chipGroup(cats, d.cat, (v) => { d.cat = v; });
    const newCat = h('button.chip.accent', {
      type: 'button',
      onclick: async () => {
        const nm = await promptSheet('قسم جديد', { placeholder: 'مثلًا: مشاريع إلكترونية', okText: 'أضف القسم' });
        if (!nm) return;
        const c = addCustomCat(nm);
        d.cat = c.id;
        // نعيد فتح النموذج بنفس اللي كتبته حتى يظهر القسم الجديد
        close();
        openProjectForm(existing, { onSaved, draft: d });
      },
    }, '＋ قسم جديد');
    catChips.append(newCat);

    const save = () => {
      d.name = d.name.trim();
      if (!d.name) { toast('اكتب اسم المشروع', 'err'); name.focus(); return; }
      let project;
      if (existing) {
        updateProject(existing.id, { name: d.name, icon: d.icon, cat: d.cat, type: d.type, cap: d.cap, desc: d.desc.trim() });
        project = { ...existing, ...d };
      } else {
        project = addProject({ name: d.name, icon: d.icon, cat: d.cat, type: d.type, cap: d.cap, desc: d.desc.trim() });
      }
      close();
      toast(existing ? 'انحفظ التعديل' : 'انضاف المشروع — هسه ادرسه', 'ok');
      onSaved?.(project);
    };

    setTimeout(() => { if (!existing) name.focus(); }, 180);

    return h('div.form', [
      h('div.row.name-row', [icon, h('div.grow', name)]),
      picks,
      field('القسم', catChips),
      field('النوع', chipGroup(TYPES.map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` })), d.type, (v) => { d.type = v; })),
      field('رأس المال التقريبي', chipGroup(CAPITALS.map((c) => ({ value: c.id, label: c.name })), d.cap, (v) => { d.cap = v; }),
        CAPITALS.map((c) => `${c.name}: ${c.hint.replace('تقريبًا ', '')}`).join(' · ')),
      field('وصف قصير (اختياري)', desc),
      h('button.btn.primary.block', { type: 'button', onclick: save }, existing ? '💾 احفظ' : '＋ أضف المشروع'),
    ]);
  });
}
