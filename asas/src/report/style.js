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
export function planSections(typeId, cat, { lang = 'mix', structure = 'fixed', variant = 0 } = {}) {
  if (structure === 'free') return null;
  return sectionsOf(getType(typeId), cat).map((s) => {
    const base = lang === 'en' ? EN_HEADINGS[s.h] || s.h : s.h;
    return { ...s, ar: s.h, h: synonym(base, variant) };
  });
}

/* ── التنويع: حتى لا تتشابه تقارير الطلبة عند الأستاذ ───── */

export const VARIANTS = 12;
/** صيغة عشوائية جديدة (1…12). */
export const randomVariant = () => 1 + Math.floor(Math.random() * VARIANTS);

/** بدائل العناوين: الصيغة الأولى هي الأصلية. */
const SYN = {
  'المقدمة': ['المقدمة', 'مقدمة', 'تمهيد', 'مدخل', 'نبذة عن الموضوع'],
  'الهدف من التجربة': ['الهدف من التجربة', 'الغرض من التجربة', 'هدف الفحص', 'الغاية من التجربة'],
  'النظرية': ['النظرية', 'الجانب النظري', 'الخلفية النظرية', 'الأساس النظري للتجربة'],
  'المواصفة المعتمدة': ['المواصفة المعتمدة', 'المواصفات القياسية', 'المواصفة المستخدمة'],
  'الأجهزة والأدوات': ['الأجهزة والأدوات', 'الأدوات المستخدمة', 'الأجهزة المستعملة', 'المعدات والأدوات', 'الأجهزة والمواد'],
  'خطوات العمل': ['خطوات العمل', 'طريقة العمل', 'خطوات إجراء التجربة', 'طريقة إجراء الفحص', 'إجراءات العمل'],
  'الحسابات والنتائج': ['الحسابات والنتائج', 'النتائج والحسابات', 'القراءات والحسابات', 'جدول النتائج والحسابات'],
  'المناقشة': ['المناقشة', 'مناقشة النتائج', 'تحليل النتائج', 'المناقشة والتحليل'],
  'الاستنتاج': ['الاستنتاج', 'الاستنتاجات', 'ما توصلنا إليه', 'الخلاصة'],
  'الخاتمة': ['الخاتمة', 'الخلاصة', 'الاستنتاجات', 'ما خلصنا إليه', 'خاتمة التقرير'],
  'المصادر': ['المصادر', 'المراجع', 'قائمة المصادر', 'المصادر والمراجع'],
  'التعاريف والمفاهيم الأساسية': ['التعاريف والمفاهيم الأساسية', 'المفاهيم الأساسية', 'تعاريف مهمة', 'أهم المصطلحات'],
  'الأساس النظري والمعادلات': ['الأساس النظري والمعادلات', 'النظرية والقوانين', 'القوانين الأساسية', 'الجانب النظري والمعادلات'],
  'الأنواع والحالات': ['الأنواع والحالات', 'أنواعه وحالاته', 'التصنيف والحالات'],
  'طريقة الحل خطوة بخطوة': ['طريقة الحل خطوة بخطوة', 'خطوات الحل', 'كيف نحل المسألة'],
  'مثال محلول': ['مثال محلول', 'مثال تطبيقي', 'مسألة محلولة', 'تطبيق عددي'],
  'التطبيقات في الهندسة المدنية': ['التطبيقات في الهندسة المدنية', 'التطبيقات العملية', 'استخداماته في الهندسة المدنية', 'أهميته في الواقع العملي'],
  'الأهداف': ['الأهداف', 'هدف التقرير'],
  'الهدف من العمل': ['الهدف من العمل', 'الغرض من العمل الحقلي', 'هدف العمل'],
  'طريقة العمل في الحقل': ['طريقة العمل في الحقل', 'خطوات العمل الحقلي', 'إجراءات العمل في الموقع'],
  'المناقشة ومصادر الخطأ': ['المناقشة ومصادر الخطأ', 'مناقشة النتائج والأخطاء', 'التحليل ومصادر الخطأ'],
  'Introduction': ['Introduction', 'Background', 'Overview'],
  'Objective': ['Objective', 'Aim of the Test', 'Purpose'],
  'Theory': ['Theory', 'Theoretical Background', 'Basic Theory'],
  'Apparatus': ['Apparatus', 'Equipment', 'Tools and Apparatus'],
  'Procedure': ['Procedure', 'Test Procedure', 'Method'],
  'Calculations and Results': ['Calculations and Results', 'Results and Calculations', 'Results'],
  'Discussion': ['Discussion', 'Discussion of Results', 'Analysis and Discussion'],
  'Conclusion': ['Conclusion', 'Conclusions', 'Summary'],
  'References': ['References', 'Bibliography', 'Sources'],
};
const hash = (x) => [...String(x)].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7);
/** صيغة العنوان حسب رقم الصيغة (0 = الأصل). */
export function synonym(h, variant = 0) {
  const list = SYN[h];
  if (!list || !variant) return h;
  return list[(variant + hash(h)) % list.length];
}

/** طرق بدء المقدمة (للذكاء الاصطناعي). */
const INTRO_STYLES = [
  'ابدأ المقدمة بتعريف مباشر وبسيط للموضوع',
  'ابدأ المقدمة بسؤال عملي يطرحه المهندس في الموقع',
  'ابدأ المقدمة بمثال من مشروع بناء حقيقي يوضح أهمية الموضوع',
  'ابدأ المقدمة بأهمية المادة أو الظاهرة في المنشآت',
  'ابدأ المقدمة بلمحة تاريخية قصيرة صحيحة عن الموضوع',
  'ابدأ المقدمة بالمشكلة الهندسية التي يحلها هذا الموضوع',
  'ابدأ المقدمة بربط الموضوع بما درسناه في المحاضرات',
  'ابدأ المقدمة بوصف ما يحدث فعلًا للمادة أو النموذج',
  'ابدأ المقدمة بمقارنة بين حالتين توضح الفكرة',
  'ابدأ المقدمة بالمواصفة أو الطريقة المعتمدة التي تنظّم الموضوع',
  'ابدأ المقدمة بسبب إجراء هذا الفحص أو الحساب في المشاريع',
  'ابدأ المقدمة بجملة قصيرة عن الموضوع ثم وسّعها بالتدريج',
];
/** أشكال الخاتمة. */
const CONCL_STYLES = [
  'الخاتمة نقاط مرقّمة قصيرة بما توصلنا إليه',
  'الخاتمة فقرة واحدة متصلة',
  'الخاتمة فقرتان: ما وجدناه، ثم توصية عملية',
  'ابدأ الخاتمة بالنتيجة الرئيسية بالأرقام ثم فسّرها',
  'الخاتمة تقارن النتيجة بحدود المواصفة أو بالقيم النموذجية',
  'الخاتمة تذكر ما تعلمناه من التجربة أو الموضوع',
  'الخاتمة توصيات لتحسين التجربة أو العمل',
  'الخاتمة تربط النتيجة بالتطبيق في الموقع',
  'الخاتمة ثلاث جمل فقط واضحة',
  'الخاتمة نقاط غير مرقّمة',
  'الخاتمة تبدأ بالهدف ثم هل تحقق ولماذا',
  'الخاتمة تذكر مصادر الخطأ المؤثرة ثم الخلاصة',
];
/** تعليمات تنويع لصيغة معيّنة. */
export function variantRules(variant, en = false) {
  if (!variant) return '';
  const k = (variant - 1) % VARIANTS;
  return [
    `# صيغة هذا التقرير رقم ${variant} (حتى لا يشبه تقارير زملاء الطالب)`,
    `- ${INTRO_STYLES[k]}.`,
    `- ${CONCL_STYLES[(k * 5 + 3) % VARIANTS]}.`,
    `- ${['رتّب الأفكار داخل كل قسم ترتيبًا خاصًا بك', 'اختر أمثلة ومفردات مختلفة عن المعتاد', 'نوّع بين الجمل القصيرة والمتوسطة', 'اذكر ملاحظة شخصية واحدة على الأقل من التجربة أو الدراسة'][k % 4]}، ولا تنسخ صياغة الكتب حرفيًا.`,
    en ? '- Write all of this in English.' : '',
  ].filter(Boolean).join('\n');
}

/* ── خيارات المحتوى: النقاط والجداول ─────────────────── */

export const LISTS = [
  { value: 'mix', label: 'نقاط وفقرات', hint: 'نقاط للأجهزة والخطوات والنتائج، وفقرات للشرح' },
  { value: 'few', label: 'نقاط قليلة', hint: 'فقرات في الغالب، والنقاط للخطوات فقط' },
  { value: 'none', label: 'فقرات بلا نقاط', hint: 'كل شيء فقرات متصلة، والخطوات «أولًا… ثانيًا…»' },
];
const ORD = ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا', 'خامسًا', 'سادسًا', 'سابعًا', 'ثامنًا', 'تاسعًا', 'عاشرًا'];
const ORD_EN = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
const endDot = (t) => (/[.!؟?:]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
const noDot = (t) => t.trim().replace(/[.،؛,;]+$/, '');

/** قائمة إلى فقرة: المرقّمة بـ «أولًا… ثانيًا…»، والنقطية بالعطف إن كانت قصيرة. */
function listToProse(items, ordered, en, variant = 0) {
  if (ordered) {
    const words = en ? ORD_EN : ORD;
    const link = en ? ['Then', 'After that', 'Next'] : ['ثم', 'بعد ذلك', 'وبعدها'];
    return items.map((t, k) => (k < words.length && (variant + k) % 3 !== 2
      ? `${words[k]}${en ? ',' : '،'} ${endDot(t)}`
      : `${link[(variant + k) % link.length]}${en ? ',' : ''} ${endDot(t)}`)).join(' ');
  }
  const short = items.every((t) => t.length < 70 && !/[.؟!]\s/.test(t));
  if (short && items.length > 1) {
    const and = en ? ', and ' : '، و';
    return endDot(items.slice(0, -1).map(noDot).join(en ? ', ' : '، ') + and + noDot(items[items.length - 1]));
  }
  return items.map(endDot).join(' ');
}

/** جدول Markdown إلى جمل: «رقم النموذج 1: الهطول [85]، الملاحظات هطول حقيقي.» */
function tableToProse(head, rows, en) {
  return rows.map((r) => endDot(r.map((c, i) => (c && c !== '—' ? `${head[i]}${en ? ': ' : ': '}${c}` : '')).filter(Boolean).join(en ? ', ' : '، '))).join(' ');
}

/**
 * يطبّق خيارات المحتوى على نص قسم: بلا نقاط أو نقاط قليلة، وبلا جداول.
 * لا يمسّ كتل المعادلات. variant ينوّع صياغة التحويل.
 */
export function applyContent(md, { lists = 'mix', tables = true, lang = 'mix', variant = 0 } = {}) {
  if (lists === 'mix' && tables !== false) return md;
  const en = lang === 'en';
  const lines = String(md || '').split('\n');
  const out = [];
  let i = 0;
  const OLR = /^\s*(?:\d+|[٠-٩]+)[.)\-–]\s+(.*)$/;
  const ULR = /^\s*[-*•●▪]\s+(.*)$/;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) { // كتلة معادلات كما هي
      out.push(l); i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) out.push(lines[i++]);
      if (i < lines.length) out.push(lines[i++]);
      continue;
    }
    // جدول
    if (tables === false && /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const split = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = split(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(split(lines[i++]));
      // سطر عنوان الجدول قبله يصبح جملة عادية
      while (out.length && !out[out.length - 1].trim()) out.pop();
      if (out.length && /^\*\*(?:جدول|Table)[^*]*\*\*\s*:?\s*$/.test(out[out.length - 1].trim())) out.pop();
      while (out.length && !out[out.length - 1].trim()) out.pop();
      out.push('', tableToProse(head, rows, en), '');
      continue;
    }
    // قائمة
    const isOL = OLR.test(l);
    if ((isOL || ULR.test(l)) && lists !== 'mix') {
      const items = [];
      const ordered = isOL;
      while (i < lines.length && (ordered ? OLR.test(lines[i]) : ULR.test(lines[i]) || /^\s{2,}[-*]\s/.test(lines[i]))) {
        const m = lines[i].match(ordered ? OLR : ULR) || lines[i].match(ULR);
        items.push(m[1].trim());
        i++;
        // سطر فارغ بين عناصر القائمة نفسها
        if (!lines[i]?.trim() && (ordered ? OLR.test(lines[i + 1] || '') : ULR.test(lines[i + 1] || ''))) i++;
      }
      const keep = lists === 'few' && (ordered || items.length > 3);
      if (keep) out.push(...items.map((t, k) => (ordered ? `${k + 1}. ${t}` : `- ${t}`)));
      else out.push(listToProse(items, ordered, en, variant));
      continue;
    }
    out.push(l);
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
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
