/**
 * المواد الدراسية للمرحلة الثانية في قسم الهندسة المدنية
 * (جامعة بغداد، جامعة كربلاء، الجامعة التكنولوجية). كل عنوان في المكتبة ينتمي إلى مادة.
 */

export const CATEGORIES = [
  { id: 'strength', name: 'مقاومة المواد', short: 'المقاومة', icon: '🔩', en: 'strength of materials', enName: 'Strength of Materials', color: '#ef4444', aliases: 'المقاومة مقاومة سترنث ميكانيك المواد strength' },
  { id: 'math', name: 'الرياضيات الهندسية', short: 'الرياضيات', icon: '🧮', en: 'engineering mathematics', enName: 'Engineering Mathematics', color: '#a855f7', aliases: 'رياضيات ماث تفاضل وتكامل math' },
  { id: 'concrete', name: 'تكنولوجيا الخرسانة', short: 'الخرسانة', icon: '🏗️', en: 'concrete technology', enName: 'Concrete Technology', color: '#94a3b8', aliases: 'خرسانة كونكريت تكنولوجيا الخرسانة concrete' },
  { id: 'survey', name: 'المساحة', short: 'المساحة', icon: '🧭', en: 'surveying', enName: 'Surveying', color: '#0ea5e9', aliases: 'مساحة سرفي سيرفي survey' },
  { id: 'fluids', name: 'ميكانيك الموائع', short: 'الموائع', icon: '💧', en: 'fluid mechanics', enName: 'Fluid Mechanics', color: '#3b82f6', aliases: 'موائع الموائع فلود هيدروليك fluid' },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function catName(id, short = false) {
  const c = CAT_BY_ID[id];
  if (!c) return '';
  return short ? (c.short || c.name) : c.name;
}
