/**
 * تعليمات الذكاء الاصطناعي.
 * SYSTEM ثابت تمامًا (بلا تواريخ أو متغيرات) حتى يُستفاد من التخزين المؤقت للطلبات.
 */

import { getType, sectionsOf, LENGTHS, LEVELS, REPORT_TYPES } from '../data/types.js';
import { catName, CATEGORIES } from '../data/categories.js';
import { mathPieces } from '../core/mathconv.js';
import { planSections, variantRules } from '../report/style.js';

export const SYSTEM = `أنت «أساس»: مهندس مدني وأستاذ جامعي خبير، تكتب تقارير طلبة المرحلة الثانية في أقسام الهندسة المدنية بالجامعات العراقية (جامعة بغداد، جامعة كربلاء، الجامعة التكنولوجية وغيرها) باللغة العربية الفصحى الواضحة، أو بالإنجليزية إن طُلب ذلك. مواد المرحلة الثانية: مقاومة المواد، والرياضيات الهندسية، وتكنولوجيا الخرسانة، والمساحة، وميكانيك الموائع.

# الدقة أولًا
- اكتب معلومات هندسية ورياضية صحيحة ومتعارفًا عليها فقط، كما تُدرَّس في الكتب المنهجية. لا تخترع أرقام مواصفات أو قيمًا عددية أو حدود قبول أو أسماء باحثين أو مراجع.
- اذكر رقم المواصفة (ASTM، BS EN، ACI، المواصفة القياسية العراقية) فقط عندما تكون متأكدًا منه.
- استعمل الوحدات الدولية (SI) والأرقام اللاتينية (0-9) في الأرقام والوحدات والمعادلات.
- إذا زُوّدت بملاحظات مرجعية موثوقة عن الموضوع فاعتمد عليها ولا تخالف أرقامها، ووسّع فيما لا يتعارض معها.
- راجع كل عملية حسابية قبل كتابتها، واكتب الحساب خطوة بخطوة مع الوحدات.

# قراءات الطالب
- إذا أعطاك الطالب قراءاته من المختبر أو الحقل فاستعملها كما هي في الجداول، واحسب منها النتائج خطوة بخطوة لقراءة واحدة على الأقل ثم لخّص البقية في الجدول، وعلّق على النتائج في المناقشة بناءً عليها.
- إذا لم يعطِ قراءات فلا تختلق قراءات كأنها حقيقية: اترك خانات القراءات في الجدول بين قوسين معقوفين بقيم نموذجية واقعية مثل [12.5]، واكتب مثالًا حسابيًا بعنوان «مثال توضيحي» بقيم نموذجية.
- كل بيانات لا تعرفها (أسماء، تواريخ، قراءات، أبعاد نماذج) ضعها بين قوسين معقوفين مثل [اسم المشرف] ليعرف الطالب أنها تحتاج تعديلًا. لا تستعمل الأقواس المعقوفة لأي غرض آخر.

# أسلوب تقارير الجامعة
- التزم بأسلوب الكتابة ولغة التقرير وطريقة العناوين المحددة في الطلب؛ فهي تعلو على أي عادة لديك.
- علمي ومنظّم ومباشر، دون عبارات إنشائية فارغة.
- في المناقشة: فسّر النتائج وقارنها بالقيم النظرية أو حدود المواصفة، واذكر مصادر الخطأ، وأجب عن أسئلة المناقشة المعتادة لهذه التجربة إجابات دقيقة.
- في الرياضيات: اكتب التعاريف والقوانين ثم الحلول خطوة بخطوة بترقيم واضح، وتحقق من الجواب بالتعويض حين يمكن.

# الخطوات
- كل تقرير له قسم خطوات يحتوي خطوات مرقّمة: خطوة واحدة في كل بند، تبدأ بفعل واضح، وبالترتيب الصحيح، مع القيم المهمة (أعداد الضربات، الأزمنة، المسافات...).

# التنسيق — مهم جدًا لأن التطبيق يحلّل النص آليًا
- ابدأ مباشرة بأول قسم مطلوب. لا تكتب عنوانًا رئيسيًا ولا أي كلام قبل الأقسام أو بعدها.
- اكتب الأقسام المطلوبة كلها بالترتيب نفسه وبالعناوين نفسها حرفيًا (أو العناوين التي تختارها إن طُلب منك اختيارها)، كل عنوان في سطر مستقل بصيغة: ## العنوان
- للعناوين الفرعية داخل القسم استعمل ### فقط.
- القوائم المرقّمة: 1. ثم 2. ... والنقطية تبدأ بـ - ثم مسافة.
- الجداول بصيغة Markdown: صف عناوين، ثم سطر |---|---|، ثم الصفوف. اكتب قبل الجدول سطرًا عريضًا يصفه مثل: **جدول (1): ...**
- المعادلات بصيغة LaTeX دائمًا، وكل معادلة في سطر داخل كتلة مستقلة بهذا الشكل تمامًا، ثم عرّف الرموز في قائمة بعدها:
\`\`\`eq
\\sigma = \\frac{P}{A_{0}}
\`\`\`
- القسمة تُكتب \\frac{البسط}{المقام} فقط، ولا تستعمل الشرطة المائلة «/» للقسمة أبدًا لا في المعادلات ولا في الحسابات. الأسس ^{} والدلائل السفلية _{} مثل f_{cu} وA_{0}، والجذر \\sqrt{}، والضرب \\times أو \\cdot، والوحدات \\mathrm{MPa}.
- لا تكتب أي كلمة عربية داخل المعادلة؛ ضع الشرح العربي في سطر قبل الكتلة أو بعدها.
- الرموز والمعادلات القصيرة داخل الجمل تُكتب بين علامتي دولار مثل: حيث $f_{cu}$ مقاومة الانضغاط.
- الحسابات خطوة بخطوة: كل خطوة معادلة كاملة بالأرقام والوحدات في سطر من كتلة eq، مثل: f_{cu} = \\frac{675000}{22500} = 30\\ \\mathrm{MPa}
- استعمل **العريض** للمصطلحات المهمة وللأسئلة باعتدال.
- الملاحظات والتحذيرات المهمة في سطر يبدأ بـ >
- لا تستعمل روابط أو صورًا أو رموزًا تعبيرية أو HTML أو أسطرًا فاصلة.

# المصادر
- اذكر فقط مواصفات معروفة وكتبًا منهجية حقيقية مشهورة بصيغة: المؤلف — العنوان — الناشر، دون روابط ودون أرقام طبعات أو سنوات إن لم تكن متأكدًا منها.`;

/** سطر معادلة من القاعدة بصيغة LaTeX (التسمية والشرح العربي خارجها). */
function eqTeX(line) {
  return mathPieces(line).map((p) => (p.t === 'math' ? p.tex : p.t === 'label' ? `${p.s}:` : p.t === 'note' ? `(${p.parts.map((x) => x.text ?? `$${x.math}$`).join('')})` : p.s)).join(' ');
}

/** ملخّص مضغوط من قاعدة المعرفة يُمرَّر مرجعًا موثوقًا. */
export function kbBrief(kb) {
  if (!kb) return '';
  const out = [];
  const list = (label, arr, n = 14) => { if (arr?.length) out.push(`${label}:\n${arr.slice(0, n).map((x) => `- ${x}`).join('\n')}`); };
  if (kb.obj) out.push(`الهدف: ${kb.obj}`);
  if (kb.theory?.length) out.push(`النظرية:\n${kb.theory.join('\n')}`);
  list('التعاريف', kb.defs);
  list('المواصفات', kb.std);
  list('الأجهزة', kb.app);
  list('المعدات', kb.equip);
  list('المواد', kb.mat);
  list('الخطوات', kb.steps, 16);
  if (kb.calc?.eq?.length) out.push(`المعادلات (بصيغة LaTeX كما يجب أن تُكتب):\n${kb.calc.eq.map(eqTeX).join('\n')}${kb.calc.vars?.length ? '\n' + kb.calc.vars.join('\n') : ''}${kb.calc.example ? '\n' + kb.calc.example : ''}`);
  list('الحدود والقيم النموذجية', kb.limits);
  list('ضبط الجودة', kb.qc);
  list('ملاحظات ومصادر الخطأ', kb.notes, 8);
  list('مشاكل شائعة', kb.problems, 8);
  if (kb.disc?.length) out.push(`أسئلة المناقشة المعتادة مع أجوبتها:\n${kb.disc.map((d) => `- ${d.q}\n  ${d.a}`).join('\n')}`);
  if (kb.examples?.length) out.push(`أمثلة محلولة موثوقة:\n${kb.examples.map((e) => `- ${e.q}\n  الحل: ${(e.s || []).join(' ؛ ')}\n  الجواب: ${e.a}`).join('\n')}`);
  return out.join('\n\n');
}

/** تعليمات كل أسلوب كتابة. */
const STYLE_RULES = {
  natural: [
    'اكتب كما يكتب طالب عادي في المرحلة الثانية تقريره بنفسه ليسلّمه لأستاذ المادة:',
    '- لغة بسيطة وسليمة، جمل قصيرة ومتوسطة، وكلمات مألوفة لا معجمية ولا فخمة.',
    '- فقرات متصلة في المقدمة والنظرية والمناقشة والخاتمة، والقوائم فقط للأجهزة والخطوات والنتائج.',
    '- صيغة «نحن» عند وصف ما جرى في المختبر أو الحقل: قمنا بـ…، لاحظنا أن…، استعملنا…',
    '- مقدمة قصيرة تدخل في الموضوع مباشرة، وخاتمة من 3 إلى 5 جمل أو نقاط بما استفدناه فعلًا.',
    '- لا مبالغة ولا إنشاء: لا «في عالم اليوم» ولا «يلعب دورًا محوريًا» ولا «تجدر الإشارة» ولا «في الختام».',
  ],
  student: [
    'اكتب كما يكتب طالب متميّز تقريره المقدَّم لأستاذ المادة: علمي ومنظّم ومباشر وواضح، مع شرح المصطلحات المهمة.',
  ],
  academic: [
    'اكتب بأسلوب أكاديمي رصين: تعريفات دقيقة، ونظرية أعمق مع الاشتقاق حين يفيد، ولغة علمية محكمة دون حشو.',
  ],
};

/** قواعد الكتابة الطبيعية (تقليل مظهر الذكاء الاصطناعي). */
const HUMAN_RULES = [
  '# كتابة طبيعية لا تبدو مولّدة آليًا',
  '- نوّع أطوال الجمل وبداياتها، ولا تجعل الفقرات متماثلة البناء، ولا تكرر الفكرة نفسها بصيغ مختلفة.',
  '- لا تستعمل الشرطة الطويلة (—) ولا علامات التنصيص «» ولا الرموز التعبيرية ولا التشكيل.',
  '- قلّل الخط العريض جدًا: فقط للعناوين الداخلية في أول السطر مثل **تعريف:** و**مثال:** و**ملاحظة:** و**الحل:**.',
  '- لا تختم كل قسم بجملة تلخيص، ولا تبدأ القسم بإعادة عنوانه.',
  '- لا تذكر أنك نموذج ذكاء اصطناعي ولا تخاطب القارئ.',
].join('\n');

const LANG_RULES = {
  mix: 'اللغة: العربية، مع المصطلح الإنجليزي بين قوسين عند أول ذكر للمصطلحات المهمة مثل: قابلية التشغيل (Workability)، لأن المواد تُدرَّس بالإنجليزية.',
  ar: 'اللغة: العربية فقط. لا تكتب مصطلحات إنجليزية بين قوسين إلا نادرًا جدًا عند الضرورة؛ الرموز والوحدات والمعادلات تبقى بالحروف اللاتينية.',
  en: 'LANGUAGE: Write the ENTIRE report in English only (clear academic English of a second-year civil engineering student at an Iraqi university). Section headings, tables, captions and equations explanations all in English. Do not write any Arabic.',
};

/** خيارات المحتوى: النقاط والجداول. */
function contentRules(o, en) {
  const out = [];
  if (o.lists === 'none') out.push(en ? '- Do NOT use bullet or numbered lists at all: write everything as connected paragraphs; write procedure steps as sentences starting with First, Second, Then….' : '- لا تستعمل أي نقاط أو قوائم مرقّمة إطلاقًا: كل المحتوى فقرات متصلة، والخطوات جمل متتابعة تبدأ بـ «أولًا، ثانيًا، ثم…».');
  else if (o.lists === 'few') out.push(en ? '- Use lists only for the procedure steps; everything else in paragraphs.' : '- قلّل النقاط جدًا: القوائم للخطوات فقط، وكل ما عداها فقرات.');
  if (o.tables === false) out.push(en ? '- Do NOT use any tables; present readings and results in sentences.' : '- لا تستعمل أي جداول؛ اكتب القراءات والنتائج في جمل.');
  return out.length ? `${en ? '# Content' : '# المحتوى'}\n${out.join('\n')}` : '';
}

/** نص طلب كتابة التقرير. */
export function reportPrompt({ title, typeId, cat, options = {}, details = '', readings = '', kb = null, meta = {} }) {
  const type = getType(typeId);
  const lang = options.lang || 'mix';
  const en = lang === 'en';
  const free = options.structure === 'free';
  const secs = planSections(typeId, cat, { lang, structure: options.structure, variant: options.variant || 0 });
  const length = LENGTHS.find((l) => l.value === options.length) || LENGTHS[1];
  const level = LEVELS.find((l) => l.value === options.level) || LEVELS[0];
  const uni = [meta.university, meta.college, meta.department].filter(Boolean).join(' — ');
  const sectionsText = secs
    ? secs.map((s, i) => `${i + 1}. ${s.h} (${s.opt ? 'اختياري: اكتبه إن كان له مضمون حقيقي في هذا الموضوع وإلا فاحذفه بعنوانه — ' : ''}${s.g})`).join('\n')
    : null;
  const freeText = en
    ? 'Choose the section headings yourself to suit THIS topic specifically (6 to 10 sections), as students do in their reports: start with "## Introduction", end with "## Conclusion" then "## References", and in between use topic-specific headings (e.g. "Types of …", "Properties of …", "Factors Affecting …", "Test Procedure", "Worked Example"). Each heading on its own line as ## Heading.'
    : 'اختر أنت عناوين الأقسام بما يناسب هذا الموضوع تحديدًا (من 6 إلى 10 أقسام) كما يفعل الطلبة في تقاريرهم: ابدأ بـ «## المقدمة» واختم بـ «## الخاتمة» ثم «## المصادر»، وبينها عناوين خاصة بالموضوع (مثل: أنواع …، خواص …، العوامل المؤثرة في …، طريقة الفحص، مثال محلول). كل عنوان في سطر بصيغة ## العنوان.';
  const parts = [
    'اكتب تقريرًا جامعيًا كاملًا بالمواصفات الآتية:',
    `العنوان: ${title}`,
    `نوع التقرير: ${type.name} — ${type.desc}`,
    cat ? `المادة: ${catName(cat)} — المرحلة ${meta.stage || 'الثانية'}` : `المرحلة ${meta.stage || 'الثانية'} — قسم الهندسة المدنية`,
    uni ? `الجهة: ${uni} (التزم بالمصطلحات والأسلوب المعتاد في تقارير هذا القسم)` : '',
    meta.expNo ? `رقم التجربة أو التقرير: ${meta.expNo}` : '',
    `# الأسلوب: ${level.label}\n${(STYLE_RULES[level.value] || STYLE_RULES.student).join('\n')}`,
    options.human !== false ? HUMAN_RULES : '',
    LANG_RULES[lang] || LANG_RULES.mix,
    contentRules(options, en),
    variantRules(options.variant || 0, en),
    `الطول المطلوب: ${length.label} — نحو ${length.words}`,
    secs
      ? `الأقسام المطلوبة بالترتيب (اكتب كل عنوان حرفيًا بعد ##، وما بين القوسين إرشاد لمحتواه فلا تكتبه${en ? '، واكتب المحتوى بالإنجليزية' : ''}):\n${sectionsText}`
      : `${freeText}\n${en ? 'The report must still cover' : 'ويجب أن يغطي التقرير مع ذلك'}: ${sectionsOf(type, cat).filter((s) => !s.opt).map((s) => s.h).join('، ')}`,
    type.steps && secs ? `الخطوات المرقّمة الرئيسية تكون في قسم «${secs.find((s) => s.ar === type.steps)?.h || type.steps}».` : '',
    cat === 'math' || ['theory', 'solved', 'summary'].includes(type.id)
      ? (en ? 'In explanations use bold inline labels at the start of lines: **Definition:**, **Example:**, **Note:**, **Solution:**.' : 'في الشرح استعمل عناوين داخلية عريضة في أول السطر كما في تقارير الطلبة: **تعريف:** و**مثال:** و**ملاحظة:** و**الحل:**.')
      : '',
  ];
  const known = Object.entries({
    'الجهة أو الشركة': meta.org,
    'اسم المشروع': meta.project,
    'الموقع': meta.location,
    'التاريخ': meta.date,
  }).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (known.length) parts.push(`بيانات معروفة يجب استعمالها:\n${known.join('\n')}`);
  if (readings.trim()) parts.push(`قراءات الطالب الفعلية (استعملها كما هي في الجداول واحسب منها النتائج):\n${readings.trim()}`);
  else if (type.readings) parts.push('لم يُعطِ الطالب قراءات: اترك خانات القراءات في الجدول بين أقواس معقوفة بقيم نموذجية، واكتب مثالًا حسابيًا توضيحيًا.');
  if (details.trim()) parts.push(`ملاحظات من الطالب يجب مراعاتها:\n${details.trim()}`);
  if (kb) parts.push(`ملاحظات مرجعية موثوقة عن الموضوع (اعتمد عليها ولا تخالفها${en ? '، واكتبها بالإنجليزية' : ''}):\n${kbBrief(kb)}`);
  parts.push(secs ? `ابدأ الآن مباشرة بالسطر: ## ${secs[0].h}` : `ابدأ الآن مباشرة بالسطر: ## ${en ? 'Introduction' : 'المقدمة'}`);
  return parts.filter(Boolean).join('\n\n');
}

/* ── تخطيط الصور ─────────────────────────────────── */

export const FIGURE_SCHEMA = {
  type: 'object',
  properties: {
    figures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'integer' },
          caption_ar: { type: 'string' },
          queries_en: { type: 'array', items: { type: 'string' } },
          must_show: { type: 'string' },
        },
        required: ['section', 'caption_ar', 'queries_en', 'must_show'],
        additionalProperties: false,
      },
    },
  },
  required: ['figures'],
  additionalProperties: false,
};

export function figurePrompt({ title, typeId, cat, count, kb, lang = 'mix' }) {
  const type = getType(typeId);
  const secs = sectionsOf(type, cat).map((s, i) => `${i}. ${s.h}`).join('\n');
  return [
    `خطّط ${count} صورة توضيحية لتقرير هندسي بعنوان «${title}» (${type.name}).`,
    `أقسام التقرير (الرقم ثم العنوان):\n${secs}`,
    'المطلوب صور حقيقية (صور فوتوغرافية أو مخططات واضحة) يمكن إيجادها في ويكيميديا كومنز وويكيبيديا، تخدم فهم الموضوع: أجهزة المختبر أو الأجهزة المساحية، مراحل العمل، النموذج قبل الفحص وبعده، شكل الفشل، المخطط التوضيحي للنظرية...',
    'وزّع الصور على أقسام مختلفة قدر الإمكان واختر القسم الأنسب لكل صورة.',
    'لكل صورة:\n- section: رقم القسم\n- caption_ar: تعليق عربي قصير دقيق لما تُظهره الصورة (بلا كلمة «شكل» وبلا ترقيم)\n- queries_en: ثلاث عبارات بحث إنجليزية قصيرة (2 إلى 4 كلمات) من الأدق إلى الأعم\n- must_show: وصف إنجليزي قصير لما يجب أن يظهر في الصورة حتى تُعدّ صحيحة',
    kb?.img?.length ? `عبارات بحث جُرّبت سابقًا لهذا الموضوع: ${kb.img.join('، ')}` : '',
    lang === 'en' ? 'التقرير بالإنجليزية: اكتب caption_ar بالإنجليزية أيضًا.' : '',
  ].filter(Boolean).join('\n\n');
}

/* ── التحقق من الصور بالرؤية ─────────────────────── */

export const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    choices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          figure: { type: 'integer' },
          best: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['figure', 'best', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['choices'],
  additionalProperties: false,
};

/**
 * يبني محتوى رسالة تحتوي الصور المرشحة لكل شكل.
 * figs: [{ caption, mustShow, cands: [{ b64 }] }]
 */
export function verifyContent(title, figs) {
  const content = [{
    type: 'text',
    text: `أنت تراجع صور تقرير هندسي بعنوان «${title}». لكل صورة مطلوبة عدة مرشحات. اختر لكل صورة رقم المرشح الذي يُظهر فعلًا المطلوب بوضوح وبشكل صحيح هندسيًا، أو -1 إن لم يكن أيٌّ منها مناسبًا. ارفض الشعارات والخرائط والصور غير المتعلقة والصور التي تُظهر شيئًا مختلفًا عن المطلوب ولو كان قريبًا منه. اكتب السبب بالعربية في جملة قصيرة.`,
  }];
  figs.forEach((f, i) => {
    content.push({ type: 'text', text: `\nالصورة المطلوبة رقم ${i}: ${f.caption}\nيجب أن تُظهر: ${f.mustShow || f.caption}` });
    f.cands.forEach((c, j) => {
      content.push({ type: 'text', text: `المرشح ${j} للصورة ${i}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.b64 } });
    });
  });
  content.push({ type: 'text', text: 'أعد لكل صورة مطلوبة: figure (رقمها)، best (رقم المرشح أو -1)، reason.' });
  return content;
}

/* ── اقتراح العناوين ─────────────────────────────── */

export const TITLES_SCHEMA = {
  type: 'object',
  properties: {
    titles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: REPORT_TYPES.map((t) => t.id) },
          why: { type: 'string' },
          image_en: { type: 'string' },
        },
        required: ['title', 'type', 'why', 'image_en'],
        additionalProperties: false,
      },
    },
  },
  required: ['titles'],
  additionalProperties: false,
};

export function titlesPrompt(q) {
  const types = REPORT_TYPES.map((t) => `${t.id}: ${t.name}`).join('\n');
  return [
    `طالب في المرحلة الثانية بقسم الهندسة المدنية يبحث عن عنوان تقرير ولم يجده في مكتبة التطبيق. ما كتبه: «${q}»`,
    `مواد المرحلة الثانية: ${CATEGORIES.map((c) => `${c.name} (${c.enName})`).join('، ')}.`,
    'اقترح 8 عناوين تقارير جامعية عربية دقيقة ومتنوعة وذات صلة مباشرة بما كتبه، ضمن مفردات هذه المواد قدر الإمكان، مع المصطلح الإنجليزي بين قوسين عند الحاجة. إن كان ما كتبه عنوانًا صالحًا فاجعله الأول بصياغة محسّنة. نوّع أنواع التقارير حين يناسب ذلك.',
    `أنواع التقارير المتاحة (استعمل المعرّف في الحقل type):\n${types}`,
    'لكل عنوان: title (العنوان بالعربية)، type، why (سطر واحد بما سيغطيه التقرير)، image_en (عبارة بحث إنجليزية قصيرة لصورة الموضوع).',
  ].join('\n\n');
}

/* ── تحرير قسم ───────────────────────────────────── */

export const EDIT_ACTIONS = [
  { id: 'rewrite', label: 'أعد الصياغة', text: 'أعد صياغة القسم بأسلوب أوضح وأكثر احترافية دون تغيير معلوماته الصحيحة.' },
  { id: 'expand', label: 'وسّع', text: 'وسّع القسم بتفاصيل فنية إضافية دقيقة وأمثلة عملية حتى يصبح بنحو ضعف طوله.' },
  { id: 'shorten', label: 'اختصر', text: 'اختصر القسم إلى نحو نصف طوله مع الإبقاء على أهم المعلومات والخطوات.' },
  { id: 'simplify', label: 'بسّط', text: 'بسّط لغة القسم لطالب في المرحلة الثانية مع شرح المصطلحات.' },
  { id: 'terms', label: 'أضف المصطلحات الإنجليزية', text: 'أضف المصطلح الإنجليزي بين قوسين بعد كل مصطلح فني مهم عند أول ذكر له، دون تغيير بقية النص.' },
  { id: 'steps', label: 'فصّل الخطوات', text: 'اجعل الخطوات أكثر تفصيلًا ودقة وأضف ما ينقصها بالترتيب الصحيح، مع القيم المهمة.' },
  { id: 'table', label: 'أضف جدولًا', text: 'أضف إلى القسم جدولًا منظمًا مناسبًا لمحتواه مع سطر عنوان للجدول.' },
  { id: 'fix', label: 'صحّح اللغة', text: 'صحّح الأخطاء اللغوية والإملائية والفنية فقط دون تغيير المحتوى أو طوله.' },
  { id: 'math', label: 'رتّب المعادلات', text: 'أعد كتابة كل المعادلات والحسابات بصيغة LaTeX صحيحة: كل معادلة في سطر داخل كتلة ```eq، والقسمة \\frac{}{} دائمًا بلا «/»، والدلائل السفلية _{} والأسس ^{}، والرموز داخل الجمل بين $…$. لا تغيّر بقية النص.' },
];

export function editPrompt({ title, typeId, sectionTitle, md, otherHeadings, instruction, options = {} }) {
  const type = getType(typeId);
  return [
    `هذا قسم من تقرير «${title}» (${type.name}).`,
    `بقية أقسام التقرير للسياق: ${otherHeadings.join('، ')}`,
    `القسم المطلوب تعديله: «${sectionTitle}»`,
    `محتواه الحالي:\n<<<\n${md}\n>>>`,
    `التعليمات: ${instruction}`,
    options.lang === 'en' ? 'The report is in English: write the new content in English.' : '',
    options.human !== false ? 'اكتب بأسلوب طبيعي كأنه من الطالب: بلا شرطات طويلة ولا «» ولا عبارات قالبية، والعريض قليل.' : '',
    'اكتب المحتوى الجديد لهذا القسم فقط وبقواعد التنسيق نفسها، دون كتابة عنوان القسم (##) ودون أي تعليق قبله أو بعده.',
  ].filter(Boolean).join('\n\n');
}
