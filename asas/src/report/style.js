/**
 * خيارات الكتابة: الأسلوب (طالب عادي، متميّز، أكاديمي)، واللغة (عربي، عربي بمصطلحات إنجليزية، إنجليزي)،
 * وهيكل الأقسام (ثابت حسب النوع أو عناوين حسب الموضوع كما في تقارير الطلبة)، وتنظيف مظهر الذكاء الاصطناعي.
 */

import { getType, sectionsOf, LEVELS } from '../data/types.js';

export const STYLES = LEVELS;

export const LANGS = [
  { value: 'mix', label: 'عربي + مصطلحات إنجليزية', hint: 'المصطلح الإنجليزي بين قوسين عند أول ذكر، كما تُدرَّس المواد' },
  { value: 'ar', label: 'عربي فقط', hint: 'بلا مصطلحات إنجليزية إلا الرموز والوحدات' },
  { value: 'en', label: 'English', hint: 'التقرير كله بالإنجليزية مع غلاف إنجليزي (يتطلب الذكاء الاصطناعي)' },
];

export const STRUCTURES = [
  { value: 'fixed', label: 'أقسام النوع المعتمدة', hint: 'مقدمة، هدف، نظرية، أجهزة، خطوات، نتائج، مناقشة… حسب نوع التقرير' },
  { value: 'free', label: 'عناوين حسب الموضوع', hint: 'عناوين خاصة بالموضوع كما في كثير من تقارير الطلبة، تبدأ بمقدمة وتنتهي بخاتمة ومصادر (يتطلب الذكاء الاصطناعي)' },
];

/** عناوين الأقسام بالإنجليزية كما في تقارير الطلبة. */
export const EN_HEADINGS = {
  'المقدمة': 'Introduction', 'الهدف من التجربة': 'Objective', 'النظرية': 'Theory', 'المواصفة المعتمدة': 'Standard Specification',
  'الأجهزة والأدوات': 'Apparatus', 'خطوات العمل': 'Procedure', 'الحسابات والنتائج': 'Calculations and Results', 'المناقشة': 'Discussion',
  'الاستنتاج': 'Conclusion', 'المصادر': 'References', 'الهدف من العمل': 'Objective', 'الأساس النظري': 'Theoretical Background',
  'طريقة العمل في الحقل': 'Field Procedure', 'سجل القراءات والحسابات': 'Field Book and Calculations', 'المناقشة ومصادر الخطأ': 'Discussion and Sources of Error',
  'التعاريف والمفاهيم الأساسية': 'Definitions and Basic Concepts', 'الأساس النظري والمعادلات': 'Theory and Equations', 'الأنواع والحالات': 'Types and Cases',
  'طريقة الحل خطوة بخطوة': 'Step-by-Step Solution Method', 'مثال محلول': 'Solved Example', 'التطبيقات في الهندسة المدنية': 'Applications in Civil Engineering',
  'الخاتمة': 'Conclusion', 'مقدمة مختصرة': 'Brief Introduction', 'القوانين المستخدمة': 'Equations Used', 'خطوات الحل العامة': 'General Solution Steps',
  'المسائل المحلولة': 'Solved Problems', 'أخطاء شائعة يجب تجنبها': 'Common Mistakes', 'أهم التعاريف': 'Key Definitions', 'القوانين والمعادلات': 'Laws and Equations',
  'خطوات الحل المختصرة': 'Solution Steps in Brief', 'مثال سريع': 'Quick Example', 'أسئلة متوقعة مع أجوبتها': 'Expected Questions with Answers',
  'ملاحظات مهمة': 'Important Notes', 'نبذة عن التجربة': 'About the Experiment', 'تفسير النتائج': 'Interpretation of Results',
  'أسئلة المناقشة وأجوبتها': 'Discussion Questions and Answers', 'مصادر الخطأ': 'Sources of Error', 'خطوات تقليل الخطأ': 'Reducing the Error',
  'المفهوم باختصار': 'The Concept in Brief', 'خطوات حل تطبيق نموذجي': 'Solving a Typical Application', 'مثال تطبيقي محلول': 'Worked Application',
  'تعريف موضوعَي المقارنة': 'Definitions', 'جدول المقارنة': 'Comparison Table', 'المزايا والعيوب': 'Advantages and Disadvantages',
  'خطوات اختيار الأنسب': 'How to Choose', 'الخلاصة': 'Summary', 'هدف المشروع': 'Project Objective', 'البيانات المعطاة': 'Given Data',
  'المنهجية خطوة بخطوة': 'Methodology', 'الحسابات': 'Calculations', 'النتائج': 'Results', 'الاستنتاجات والتوصيات': 'Conclusions and Recommendations',
  'معلومات الزيارة': 'Visit Information', 'وصف الموقع أو المشروع': 'Site Description', 'خطوات العمل المشاهدة': 'Observed Work Stages',
  'الأجهزة والمعدات': 'Equipment', 'الربط بالمادة الدراسية': 'Link to the Course', 'الملاحظات الفنية': 'Technical Observations',
  'الخاتمة والتوصيات': 'Conclusion and Recommendations', 'محاور العرض': 'Outline', 'الشرح التفصيلي': 'Detailed Explanation',
  'أمثلة وتطبيقات': 'Examples and Applications', 'أسئلة متوقعة من الحضور': 'Expected Questions', 'نبذة عن جهة التدريب': 'About the Training Organization',
  'وصف المشروع': 'Project Description', 'الأعمال التي شاركت فيها': 'Work I Took Part In', 'مراحل وخطوات التنفيذ': 'Construction Stages',
  'المعدات والمواد المستخدمة': 'Equipment and Materials', 'الفحوصات وضبط الجودة في الموقع': 'Site Testing and Quality Control',
  'إجراءات السلامة': 'Safety Procedures', 'المهارات والخبرات المكتسبة': 'Skills Gained',
};

export const isEnglish = (r) => (r?.options?.lang || 'mix') === 'en';
export const isFree = (r) => (r?.options?.structure || 'fixed') === 'free';

/**
 * الأقسام المطلوبة بلغة التقرير. null حين تكون العناوين حرّة حسب الموضوع.
 * @returns {{ h: string, g: string, opt?: boolean, ar: string }[] | null}
 */
export function planSections(typeId, cat, { lang = 'mix', structure = 'fixed' } = {}) {
  if (structure === 'free') return null;
  return sectionsOf(getType(typeId), cat).map((s) => ({ ...s, ar: s.h, h: lang === 'en' ? EN_HEADINGS[s.h] || s.h : s.h }));
}

/* ── تنظيف مظهر الذكاء الاصطناعي ───────────────────── */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{FE0F}]/gu;
/** التشكيل الذي لا يكتبه الطلبة عادةً (يُبقى على الشدة وتنوين الفتح). */
const HARAKAT = /[\u064C-\u0650\u0652]/g;
/** عبارات قالبية تكثر في كتابة النماذج وتقلّ في كتابة الطلبة: تُحذف أو تُختصر. */
const CLICHES = [
  [/(^|[.!؟\n]\s*)في عالم[^،.]*،\s*/g, '$1'],
  [/(?:وتجدر|تجدر) الإشارة (?:هنا )?(?:إلى )?أنّ?\s*/g, ''],
  [/(?:ومن|من) الجدير بالذكر أنّ?\s*/g, ''],
  [/(^|[.!؟\n]\s*)(?:وفي الختام|في الختام|ختامًا|وختامًا)،?\s*/g, '$1'],
  [/يلعب دورًا (?:محوريًا|حيويًا|بارزًا|جوهريًا)/g, 'له دور مهم'],
  [/بشكل (?:كبير|ملحوظ|فعّال) (?:جدًا )?/g, ''],
  [/(?:الجدير بالذكر أن|مما لا شك فيه أن)\s*/g, ''],
];

/**
 * يجعل النص أقرب لكتابة الطالب: بلا رموز تعبيرية ولا تشكيل ولا شرطات طويلة متكررة
 * ولا علامات «» ولا عبارات قالبية، وعريض أقل. لا يمسّ المعادلات والجداول والمصادر.
 */
export function humanize(md, { lang = 'mix' } = {}) {
  const lines = String(md || '').split('\n');
  let inFence = false;
  return lines.map((l) => {
    if (/^\s*```/.test(l)) { inFence = !inFence; return l; }
    if (inFence || /^\s*\|/.test(l) || /^\s*\$\$/.test(l)) return l;
    // لا نمسّ ما بين $…$
    return l.split(/(\$[^$]+\$)/g).map((part, i) => {
      if (i % 2 === 1) return part;
      let s = part.replace(EMOJI, '');
      if (lang !== 'en') {
        s = s.replace(HARAKAT, '').replace(/ـ/g, '');
        s = s.replace(/«([^»]{1,80})»/g, '"$1"');
        // الشرطة الطويلة الاعتراضية بين كلمتين ← فاصلة (إلا في سطر مصدر: المؤلف — العنوان)
        if ((s.match(/—/g) || []).length <= 2) s = s.replace(/([\u0600-\u06FF)])\s+—\s+(?=[\u0600-\u06FF(])/g, '$1، ');
        for (const [re, to] of CLICHES) s = s.replace(re, to);
      } else {
        s = s.replace(/\s+—\s+/g, ', ').replace(/\b(?:Moreover|Furthermore|Additionally), /g, 'Also, ').replace(/\bIn conclusion, /g, '');
      }
      return s;
    }).join('');
  }).map(lessBold).join('\n');
}

/** يبقي العريض في أول السطر (عناوين داخلية مثل **مثال:**) ويحذف الزائد منه في وسط الفقرات. */
function lessBold(line) {
  const m = line.match(/\*\*/g);
  if (!m || m.length < 4) return line;
  let k = 0;
  return line.replace(/\*\*([^*]+)\*\*/g, (all, x) => (k++ === 0 && /^\s*(?:[-*]\s+|\d+[.)]\s+)?\*\*/.test(line) ? all : x));
}

/** هل القسم قسم مصادر (لا يُنظَّف)؟ */
export const isRefsHeading = (h) => /^(?:المصادر|المراجع|References|Bibliography)$/i.test(String(h || '').trim());

/* ── نصوص الغلاف والتقرير بالإنجليزية ───────────────── */

export const TYPE_EN = {
  lab: 'Laboratory Report', field: 'Field Work Report', theory: 'Report', solved: 'Solved Problems', summary: 'Exam Summary',
  discussion: 'Discussion Questions', applications: 'Engineering Applications Report', compare: 'Comparison Report',
  project: 'Course Project', visit: 'Scientific Visit Report', seminar: 'Seminar', training: 'Summer Training Report',
};

const AR_EN = {
  'جامعة بغداد': 'University of Baghdad', 'جامعة كربلاء': 'University of Kerbala', 'الجامعة التكنولوجية': 'University of Technology',
  'جامعة البصرة': 'University of Basrah', 'جامعة الموصل': 'University of Mosul', 'الجامعة المستنصرية': 'Mustansiriyah University',
  'جامعة الكوفة': 'University of Kufa', 'جامعة بابل': 'University of Babylon', 'جامعة واسط': 'University of Wasit',
  'كلية الهندسة': 'College of Engineering', 'قسم الهندسة المدنية': 'Civil Engineering Department',
  'الأولى': 'First', 'الثانية': 'Second', 'الثالثة': 'Third', 'الرابعة': 'Fourth',
};
/** يترجم الأسماء المعروفة (الجامعة والكلية والقسم والمرحلة) ويبقي غيرها كما كتبها الطالب. */
export const toEN = (x) => (x && AR_EN[String(x).trim()]) || x;

const MONTHS = [['كانون الثاني', 'January'], ['شباط', 'February'], ['آذار', 'March'], ['نيسان', 'April'], ['أيار', 'May'], ['حزيران', 'June'],
  ['تموز', 'July'], ['آب', 'August'], ['أيلول', 'September'], ['تشرين الأول', 'October'], ['تشرين الثاني', 'November'], ['كانون الأول', 'December'],
  ['يناير', 'January'], ['فبراير', 'February'], ['مارس', 'March'], ['أبريل', 'April'], ['مايو', 'May'], ['يونيو', 'June'], ['يوليو', 'July'],
  ['أغسطس', 'August'], ['سبتمبر', 'September'], ['أكتوبر', 'October'], ['نوفمبر', 'November'], ['ديسمبر', 'December']];
/** تاريخ بأسماء الأشهر العربية ← بالإنجليزية: «13 تشرين الأول 2026» ← «13 October 2026». */
export function dateEN(x) {
  let s = String(x || '');
  for (const [ar, en] of MONTHS) s = s.split(ar).join(en);
  return s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, ' ').trim();
}
