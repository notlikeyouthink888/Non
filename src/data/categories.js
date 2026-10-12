/** أقسام الهندسة المدنية التي تُصنَّف تحتها العناوين. */

export const CATEGORIES = [
  { id: 'concrete', name: 'الخرسانة', icon: '🏗️', en: 'concrete', color: '#94a3b8' },
  { id: 'materials', name: 'مواد البناء: الإسمنت والركام والطابوق', short: 'مواد البناء', icon: '🧱', en: 'construction materials', color: '#f97316' },
  { id: 'soil', name: 'التربة وميكانيك التربة', short: 'التربة', icon: '⛰️', en: 'soil mechanics', color: '#a16207' },
  { id: 'foundations', name: 'الأسس والهندسة الجيوتقنية', short: 'الأسس', icon: '🏛️', en: 'foundations', color: '#78716c' },
  { id: 'steel', name: 'الحديد والمنشآت الفولاذية', short: 'الحديد', icon: '🔩', en: 'steel', color: '#64748b' },
  { id: 'roads', name: 'الطرق والأسفلت', short: 'الطرق', icon: '🛣️', en: 'highway engineering asphalt', color: '#334155' },
  { id: 'survey', name: 'المساحة', icon: '🧭', en: 'surveying', color: '#0ea5e9' },
  { id: 'construction', name: 'تنفيذ المباني وأعمال الموقع', short: 'تنفيذ المباني', icon: '🏢', en: 'building construction', color: '#eab308' },
  { id: 'finishing', name: 'التشطيبات والعزل', short: 'التشطيبات', icon: '🎨', en: 'finishing works', color: '#ec4899' },
  { id: 'water', name: 'الهيدروليك والري والسدود', short: 'الموارد المائية', icon: '💧', en: 'hydraulics irrigation', color: '#3b82f6' },
  { id: 'sanitary', name: 'الهندسة الصحية والبيئية', short: 'الصحية والبيئية', icon: '🚰', en: 'environmental engineering', color: '#14b8a6' },
  { id: 'bridges', name: 'الجسور والمنشآت الخاصة', short: 'الجسور', icon: '🌉', en: 'bridges', color: '#8b5cf6' },
  { id: 'structures', name: 'التحليل والتصميم الإنشائي', short: 'التصميم الإنشائي', icon: '📐', en: 'structural design', color: '#6366f1' },
  { id: 'repair', name: 'الفحص والتقييم والصيانة', short: 'الفحص والصيانة', icon: '🔧', en: 'structural repair', color: '#ef4444' },
  { id: 'management', name: 'إدارة المشاريع والكميات والعقود', short: 'إدارة المشاريع', icon: '📊', en: 'construction management', color: '#22c55e' },
  { id: 'safety', name: 'السلامة المهنية', short: 'السلامة', icon: '⛑️', en: 'construction safety', color: '#f59e0b' },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function catName(id, short = false) {
  const c = CAT_BY_ID[id];
  if (!c) return '';
  return short ? (c.short || c.name) : c.name;
}
