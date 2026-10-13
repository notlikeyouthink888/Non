/**
 * تعليمات الذكاء الاصطناعي.
 * SYSTEM ثابت تمامًا (بلا تواريخ أو متغيرات) حتى يُستفاد من التخزين المؤقت للطلبات.
 */

import { getType, LENGTHS, LEVELS, REPORT_TYPES } from '../data/types.js';
import { catName } from '../data/categories.js';

export const SYSTEM = `أنت «أساس»: مهندس مدني خبير وكاتب تقارير هندسية أكاديمية وفنية باللغة العربية الفصحى الواضحة، تكتب لطلبة الهندسة المدنية والمهندسين في العراق والعالم العربي.

# الدقة أولًا
- اكتب معلومات هندسية صحيحة ومتعارفًا عليها فقط. لا تخترع أرقام مواصفات أو قيمًا عددية أو حدود قبول أو أسماء باحثين أو مراجع.
- اذكر رقم المواصفة (ASTM، AASHTO، BS EN، ACI، المواصفة القياسية العراقية، المواصفات العامة للطرق والجسور SCRB...) فقط عندما تكون متأكدًا منه، وإلا فاكتب «حسب المواصفة المعتمدة في المشروع».
- استعمل الوحدات الدولية (SI) والأرقام اللاتينية (0-9) في الأرقام والوحدات والمعادلات.
- إذا زُوّدت بملاحظات مرجعية موثوقة عن الموضوع فاعتمد عليها ولا تخالف أرقامها، ووسّع فيما لا يتعارض معها.
- البيانات التي لا تعرفها (أسماء أشخاص أو شركات، تواريخ، قراءات مختبرية فعلية، كميات موقع، مبالغ) لا تختلقها كأنها حقيقية: ضع قيمة نموذجية واقعية بين قوسين معقوفين مثل [25 عاملًا] أو [اسم المشروع] ليعرف المستخدم أنها تحتاج تعديلًا. لا تستعمل الأقواس المعقوفة لأي غرض آخر.

# الخطوات
- كل تقرير يحتوي خطوات عملية مرقّمة في القسم المخصص لها: خطوة واحدة في كل بند، تبدأ بفعل واضح، وبالترتيب الصحيح للتنفيذ، مع ذكر القيم المهمة (أعداد الضربات، الأزمنة، درجات الحرارة...) حين تكون معروفة.

# التنسيق — مهم جدًا لأن التطبيق يحلّل النص آليًا
- ابدأ مباشرة بأول قسم مطلوب. لا تكتب عنوانًا رئيسيًا ولا أي كلام قبل الأقسام أو بعدها.
- اكتب الأقسام المطلوبة كلها بالترتيب نفسه وبالعناوين نفسها حرفيًا، كل عنوان في سطر مستقل بصيغة: ## العنوان
- للعناوين الفرعية داخل القسم استعمل ### فقط.
- القوائم المرقّمة: 1. ثم 2. ... والنقطية تبدأ بـ - ثم مسافة.
- الجداول بصيغة Markdown: صف عناوين، ثم سطر |---|---|، ثم الصفوف. اكتب قبل الجدول سطرًا عريضًا يصفه مثل: **جدول (1): ...**
- ضع كل معادلة في كتلة مستقلة بهذا الشكل تمامًا ثم عرّف الرموز في قائمة بعدها:
\`\`\`eq
w = (W2 − W3) / (W3 − W1) × 100
\`\`\`
- استعمل **العريض** للمصطلحات المهمة باعتدال، واذكر المصطلح الإنجليزي بين قوسين عند أول ذكر، مثل: قابلية التشغيل (Workability).
- الملاحظات والتحذيرات المهمة في سطر يبدأ بـ >
- لا تستعمل روابط أو صورًا أو رموزًا تعبيرية أو HTML أو أسطرًا فاصلة.

# الأسلوب
- لغة عربية فصحى سليمة، جمل واضحة مترابطة، دون حشو أو تكرار أو عبارات إنشائية فارغة.
- التزم بمستوى القارئ والطول المطلوبين.
- في قسم المصادر اذكر فقط مواصفات معروفة وكتبًا مرجعية مشهورة حقيقية بصيغة: المؤلف — العنوان — الناشر، دون روابط ودون سنوات أو طبعات إن لم تكن متأكدًا منها.`;

/** ملخّص مضغوط من قاعدة المعرفة يُمرَّر مرجعًا موثوقًا. */
export function kbBrief(kb) {
  if (!kb) return '';
  const out = [];
  const list = (label, arr, n = 14) => { if (arr?.length) out.push(`${label}:\n${arr.slice(0, n).map((x) => `- ${x}`).join('\n')}`); };
  if (kb.obj) out.push(`الهدف: ${kb.obj}`);
  list('المواصفات', kb.std);
  list('الأجهزة', kb.app);
  list('المعدات', kb.equip);
  list('المواد', kb.mat);
  list('الخطوات', kb.steps, 16);
  if (kb.calc?.eq?.length) out.push(`المعادلات:\n${kb.calc.eq.join('\n')}${kb.calc.vars?.length ? '\n' + kb.calc.vars.join('\n') : ''}${kb.calc.example ? '\n' + kb.calc.example : ''}`);
  list('الحدود والقيم النموذجية', kb.limits);
  list('ضبط الجودة', kb.qc);
  list('ملاحظات ومصادر الخطأ', kb.notes, 8);
  list('مشاكل شائعة', kb.problems, 8);
  return out.join('\n\n');
}

/** نص طلب كتابة التقرير. */
export function reportPrompt({ title, typeId, cat, options = {}, details = '', kb = null, meta = {} }) {
  const type = getType(typeId);
  const length = LENGTHS.find((l) => l.value === options.length) || LENGTHS[1];
  const level = LEVELS.find((l) => l.value === options.level) || LEVELS[0];
  const sections = type.sections.map((s, i) => `${i + 1}. ${s.h} (${s.g})`).join('\n');
  const parts = [
    'اكتب تقريرًا هندسيًا كاملًا بالمواصفات الآتية:',
    `العنوان: ${title}`,
    `نوع التقرير: ${type.name} — ${type.desc}`,
    cat ? `المجال: ${catName(cat)}` : '',
    `مستوى القارئ: ${level.label} (${level.hint})`,
    `الطول المطلوب: ${length.label} — نحو ${length.words}`,
    `الأقسام المطلوبة بالترتيب (اكتب كل عنوان حرفيًا بعد ##، وما بين القوسين إرشاد لمحتواه فلا تكتبه):\n${sections}`,
    `الخطوات المرقّمة الرئيسية تكون في قسم «${type.steps}».`,
  ];
  const known = Object.entries({
    'الجهة أو الشركة': meta.org,
    'اسم المشروع': meta.project,
    'الموقع': meta.location,
    'التاريخ': meta.date,
  }).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (known.length) parts.push(`بيانات معروفة يجب استعمالها:\n${known.join('\n')}`);
  if (details.trim()) parts.push(`تفاصيل وملاحظات من المستخدم يجب مراعاتها (ومنها قراءات أو نتائج فعلية إن وُجدت فاستعملها كما هي):\n${details.trim()}`);
  if (kb) parts.push(`ملاحظات مرجعية موثوقة عن الموضوع (اعتمد عليها ولا تخالفها):\n${kbBrief(kb)}`);
  parts.push(`ابدأ الآن مباشرة بالسطر: ## ${type.sections[0].h}`);
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

export function figurePrompt({ title, typeId, count, kb }) {
  const type = getType(typeId);
  const secs = type.sections.map((s, i) => `${i}. ${s.h}`).join('\n');
  return [
    `خطّط ${count} صورة توضيحية لتقرير هندسي بعنوان «${title}» (${type.name}).`,
    `أقسام التقرير (الرقم ثم العنوان):\n${secs}`,
    'المطلوب صور حقيقية (صور فوتوغرافية أو مخططات واضحة) يمكن إيجادها في ويكيميديا كومنز وويكيبيديا، تخدم فهم الموضوع: الأجهزة، مراحل العمل، المنشأ أو المادة نفسها، شكل الفشل...',
    'وزّع الصور على أقسام مختلفة قدر الإمكان واختر القسم الأنسب لكل صورة.',
    'لكل صورة:\n- section: رقم القسم\n- caption_ar: تعليق عربي قصير دقيق لما تُظهره الصورة (بلا كلمة «شكل» وبلا ترقيم)\n- queries_en: ثلاث عبارات بحث إنجليزية قصيرة (2 إلى 4 كلمات) من الأدق إلى الأعم\n- must_show: وصف إنجليزي قصير لما يجب أن يظهر في الصورة حتى تُعدّ صحيحة',
    kb?.img?.length ? `عبارات بحث جُرّبت سابقًا لهذا الموضوع: ${kb.img.join('، ')}` : '',
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
    `مستخدم يبحث عن عنوان تقرير في الهندسة المدنية ولم يجده في مكتبة التطبيق. ما كتبه: «${q}»`,
    'اقترح 8 عناوين تقارير عربية دقيقة ومتنوعة وذات صلة مباشرة بما كتبه. إن كان ما كتبه عنوانًا صالحًا فاجعله الأول بصياغة محسّنة. نوّع أنواع التقارير حين يناسب ذلك.',
    `أنواع التقارير المتاحة (استعمل المعرّف في الحقل type):\n${types}`,
    'لكل عنوان: title (العنوان بالعربية)، type، why (سطر واحد بما سيغطيه التقرير)، image_en (عبارة بحث إنجليزية قصيرة لصورة الموضوع).',
  ].join('\n\n');
}

/* ── تحرير قسم ───────────────────────────────────── */

export const EDIT_ACTIONS = [
  { id: 'rewrite', label: 'أعد الصياغة', text: 'أعد صياغة القسم بأسلوب أوضح وأكثر احترافية دون تغيير معلوماته الصحيحة.' },
  { id: 'expand', label: 'وسّع', text: 'وسّع القسم بتفاصيل فنية إضافية دقيقة وأمثلة عملية حتى يصبح بنحو ضعف طوله.' },
  { id: 'shorten', label: 'اختصر', text: 'اختصر القسم إلى نحو نصف طوله مع الإبقاء على أهم المعلومات والخطوات.' },
  { id: 'simplify', label: 'بسّط', text: 'بسّط لغة القسم لطالب في المرحلة الأولى مع شرح المصطلحات.' },
  { id: 'steps', label: 'فصّل الخطوات', text: 'اجعل الخطوات أكثر تفصيلًا ودقة وأضف ما ينقصها بالترتيب الصحيح، مع القيم المهمة.' },
  { id: 'table', label: 'أضف جدولًا', text: 'أضف إلى القسم جدولًا منظمًا مناسبًا لمحتواه مع سطر عنوان للجدول.' },
  { id: 'fix', label: 'صحّح اللغة', text: 'صحّح الأخطاء اللغوية والإملائية والفنية فقط دون تغيير المحتوى أو طوله.' },
];

export function editPrompt({ title, typeId, sectionTitle, md, otherHeadings, instruction }) {
  const type = getType(typeId);
  return [
    `هذا قسم من تقرير «${title}» (${type.name}).`,
    `بقية أقسام التقرير للسياق: ${otherHeadings.join('، ')}`,
    `القسم المطلوب تعديله: «${sectionTitle}»`,
    `محتواه الحالي:\n<<<\n${md}\n>>>`,
    `التعليمات: ${instruction}`,
    'اكتب المحتوى الجديد لهذا القسم فقط وبقواعد التنسيق نفسها، دون كتابة عنوان القسم (##) ودون أي تعليق قبله أو بعده.',
  ].join('\n\n');
}
