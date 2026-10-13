/**
 * الجامعات المعتمدة لصفحة الغلاف. القيم قابلة للتعديل من الإعدادات أو من الغلاف نفسه،
 * لأن أسماء الكليات والأقسام تتغير أحيانًا مع إعادة الهيكلة.
 */

export const UNIVERSITIES = [
  { id: 'baghdad', name: 'جامعة بغداد', short: 'بغداد', college: 'كلية الهندسة', department: 'قسم الهندسة المدنية' },
  { id: 'karbala', name: 'جامعة كربلاء', short: 'كربلاء', college: 'كلية الهندسة', department: 'قسم الهندسة المدنية' },
  { id: 'uot', name: 'الجامعة التكنولوجية', short: 'التكنولوجية', college: '', department: 'قسم الهندسة المدنية' },
];

export const UNI_BY_ID = Object.fromEntries(UNIVERSITIES.map((u) => [u.id, u]));

export const STAGE = 'الثانية';

/** السنة الدراسية الحالية: تبدأ في أيلول. */
export function academicYear(d = new Date()) {
  const start = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}–${start + 1}`;
}
