/**
 * إنشاء تقرير: العنوان والمادة ونوع التقرير، ورقم التجربة وقراءات الطالب،
 * والطول والأسلوب والصور، وبيانات الغلاف بصيغة الجامعة.
 */

import { h, fill, chipGroup, field, toggle, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { replace } from '../core/nav.js';
import { state, update, aiReady, modelInfo } from '../core/store.js';
import { linked, typeAllowed } from '../core/server.js';
import { putReport } from '../core/db.js';
import { toast } from '../core/ui.js';
import { REPORT_TYPES, TYPE_BY_ID, LENGTHS, LEVELS, getType } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { CATEGORIES, CAT_BY_ID } from '../data/categories.js';
import { UNIVERSITIES, UNI_BY_ID, academicYear } from '../data/universities.js';
import { KB } from '../data/kb/index.js';
import { detectType, searchSubjects } from '../search/index.js';
import { newReport } from '../report/model.js';
import { startGeneration } from '../report/pipeline.js';
import { topbar, kbBadge } from './common.js';
import { modelName } from '../ai/openrouter.js';
import { coverPicker, COVER_BY_ID, peopleFields, logosRow, coverDesign } from '../report/covers.js';
import { bidi } from '../core/arabic.js';
import { LANGS, STRUCTURES, LISTS, VARIANTS, randomVariant } from '../report/style.js';
import { fmtOf } from '../report/format.js';
import { fmtDate } from '../core/fmt.js';

const DETAIL_HINTS = {
  lab: 'مثال: أجرينا التجربة على نموذجين، وطلب الأستاذ التركيز على مقارنة النتائج بالمواصفة… (اختياري)',
  field: 'مثال: العمل في حديقة الكلية، والمسار مغلق على النقطة الثابتة BM1 قرب البوابة… (اختياري)',
  solved: 'مثال: أريد 5 مسائل متدرجة، منها مسألتان من نوع امتحانات السنوات السابقة… (اختياري)',
  summary: 'مثال: الفصل الثالث فقط، مع التركيز على القوانين والأسئلة المتوقعة… (اختياري)',
  project: 'مثال: المقاومة المطلوبة 30 MPa، والهطول 75–100 ملم، والركام نهري مقاسه الأقصى 19 ملم… (اختياري)',
  visit: 'مثال: زيارة معمل خرسانة جاهزة في … بتاريخ … مع الأستاذ …، وشاهدنا… (اختياري)',
  training: 'مثال: تدرّبت في … على مشروع بناية من 4 طوابق لمدة 4 أسابيع وشاركت في… (اختياري)',
};

export default {
  mount(root, { query }) {
    const topic = TOPIC_BY_ID[query.get('topic')] || null;
    const kb = topic ? KB[topic.id] : null;
    const imgHint = query.get('img') || '';
    const qTitle = query.get('title') || '';

    const st = {
      title: qTitle || topic?.title || '',
      catId: topic?.cat || searchSubjects(qTitle)[0]?.id || null,
      typeId: TYPE_BY_ID[query.get('type')] ? query.get('type') : topic?.types[0] || detectType(qTitle) || 'theory',
      length: state.prefs.length,
      level: LEVELS.some((l) => l.value === state.prefs.level) ? state.prefs.level : LEVELS[0].value,
      lang: state.prefs.lang || 'mix',
      structure: state.prefs.structure || 'fixed',
      human: state.prefs.human !== false,
      lists: state.prefs.lists || 'mix',
      tables: state.prefs.tables !== false,
      numbering: fmtOf(null).numbering,
      variant: randomVariant(),
      images: null,
      details: '',
      readings: '',
      meta: (({ enabled, style, ...cv }) => ({ ...cv, coverStyle: style || 'classic', expNo: '', date: fmtDate(), submitDate: '', year: academicYear(), org: '', project: '', location: '' }))(state.cover),
      cover: state.cover.enabled !== false,
      saveCover: false,
    };
    // المستخدم العادي في نسخة الخادم لا يرى إلا الأنواع التي أتاحها المدير؛ غيرها يُبدَّل بأول نوع مسموح
    if (!typeAllowed(st.typeId)) {
      st.typeId = (REPORT_TYPES.find((t) => typeAllowed(t.id)) || TYPE_BY_ID.theory).id;
    }
    st.images = getType(st.typeId).figures;

    const titleIn = h('textarea', { rows: 2, value: st.title, placeholder: 'مثال: فحص الشد للحديد (Tension Test)', oninput: () => { st.title = titleIn.value; } });
    const typeDesc = h('p.hint');
    const typesGrid = h('div.grid-types');
    const subjBox = h('div');
    const readingsBox = h('div');
    const imgCount = h('span', String(st.images));
    const detailsIn = h('textarea', { rows: 3, oninput: () => { st.details = detailsIn.value; } });
    const metaBox = h('div');

    const suggested = new Set(topic?.types || []);

    function renderSubjects() {
      if (topic) { fill(subjBox, null); return; }
      fill(subjBox, field('المادة', chipGroup(
        [...CATEGORIES.map((c) => ({ value: c.id, label: `${c.icon} ${c.short}` })), { value: '', label: 'غير ذلك' }],
        st.catId || '',
        (v) => { st.catId = v || null; },
      ), 'تحدد المادة أقسام التقرير ومراجعه، وتظهر في الغلاف.'));
    }

    function renderTypes() {
      const ordered = REPORT_TYPES.filter((t) => typeAllowed(t.id)).sort((a, b) => (suggested.has(b.id) ? 1 : 0) - (suggested.has(a.id) ? 1 : 0));
      fill(typesGrid, ordered.map((t) => h('button.type-card' + (t.id === st.typeId ? '.on' : ''), {
        type: 'button',
        onclick: () => {
          st.typeId = t.id;
          st.images = t.figures;
          imgCount.textContent = String(st.images);
          renderTypes();
          renderWriting();
          renderReadings();
          renderMeta();
        },
      }, [
        h('span.em', t.icon),
        h('span.nm', bidi(t.name)),
        suggested.has(t.id) ? h('span.tag', 'مقترح') : null,
      ])));
      const t = getType(st.typeId);
      typeDesc.textContent = bidi(`${t.desc} — مناسب لـ: ${t.forWho}`);
      detailsIn.placeholder = DETAIL_HINTS[t.id] || 'أي ملاحظات تريد أن يراعيها التقرير: نقاط يركّز عليها الأستاذ، أجزاء من المنهج… (اختياري)';
    }

    function renderReadings() {
      const t = getType(st.typeId);
      if (!t.readings) { fill(readingsBox, null); return; }
      const ai = aiReady();
      const expIn = h('input', { value: st.meta.expNo, inputmode: 'numeric', placeholder: 'مثال: 3', oninput: (e) => { st.meta.expNo = e.target.value; } });
      const readIn = h('textarea', {
        rows: 4,
        value: st.readings,
        placeholder: kb?.readings ? `اكتب: ${kb.readings}` : 'اكتب قراءاتك كما في ورقة المختبر أو دفتر الحقل',
        oninput: () => { st.readings = readIn.value; },
      });
      fill(readingsBox, [
        h('h2.sec', t.id === 'project' ? 'بيانات المشروع' : 'قراءاتك'),
        t.id === 'project' ? null : field(t.id === 'field' ? 'رقم العمل الحقلي' : 'رقم التجربة', expIn),
        field(t.id === 'project' ? 'المعطيات' : 'القراءات (اختياري)', readIn,
          ai ? 'يكتب الذكاء الاصطناعي الجداول بقراءاتك ويحسب منها النتائج خطوة بخطوة ويناقشها. إن تركتها فارغة تُترك خانات الجدول بين [ ] لتملأها.'
            : 'دون ذكاء اصطناعي يُبنى التقرير من المحتوى الجاهز وتبقى خانات الجدول فارغة لتملأها بقراءاتك.'),
      ]);
    }

    function metaInput(key, label, ph = '') {
      return field(label, h('input', { value: st.meta[key] || '', placeholder: ph, oninput: (e) => { st.meta[key] = e.target.value; } }));
    }

    const coverSum = h('span');
    const updateCoverSum = () => { coverSum.textContent = `الغلاف — ${st.cover ? COVER_BY_ID[st.meta.coverStyle]?.name || '' : 'بدون غلاف'} • ${st.meta.university || 'الجامعة'}`; };
    const previewReport = () => ({
      title: st.title.trim() || 'عنوان التقرير', typeId: st.typeId, catId: st.catId, options: { cover: true, lang: st.lang },
      meta: { ...st.meta, subject: CAT_BY_ID[st.catId]?.name || '' },
    });

    function renderMeta() {
      const site = ['training', 'visit'].includes(st.typeId);
      const labLike = ['lab', 'field'].includes(st.typeId);
      const other = !UNI_BY_ID[st.meta.uni];
      updateCoverSum();
      const picker = st.cover ? coverPicker(previewReport, st.meta.coverStyle, (v) => { st.meta.coverStyle = v; updateCoverSum(); }) : null;
      fill(metaBox, [
        settingRow('صفحة غلاف', st.cover ? 'غلاف بالنمط المختار في العرض وPDF وWord' : 'التقرير يبدأ بالعنوان مباشرة دون صفحة غلاف', toggle(st.cover, (v) => { st.cover = v; renderMeta(); })),
        st.cover ? field('نمط الغلاف', picker, 'المعاينة ببيانات تقريرك؛ تستطيع تغيير النمط لاحقًا من «تعديل العنوان وبيانات الغلاف».') : null,
        st.cover ? coverDesign(st.meta, () => picker.refresh()) : null,
        st.cover ? logosRow(st.meta, renderMeta, () => toast('تعذّرت قراءة الصورة', 'err')) : null,
        field('الجامعة', chipGroup(
          [...UNIVERSITIES.map((u) => ({ value: u.id, label: u.name })), { value: 'other', label: 'أخرى' }],
          other ? 'other' : st.meta.uni,
          (v) => {
            if (v === 'other') Object.assign(st.meta, { uni: 'other', university: '', college: '' });
            else { const u = UNI_BY_ID[v]; Object.assign(st.meta, { uni: u.id, university: u.name, college: u.college, department: u.department }); }
            renderMeta();
          },
        )),
        other ? h('div.grid2', [metaInput('university', 'اسم الجامعة'), metaInput('college', 'الكلية')]) : null,
        h('div.grid2', [metaInput('department', 'القسم'), metaInput('stage', 'المرحلة', 'الثانية')]),
        h('div.grid2', [metaInput('author', 'اسم الطالب', 'اسمك الثلاثي'), metaInput('group', 'الشعبة / المجموعة', 'مثال: أ')]),
        h('div.grid2', [metaInput('supervisor', 'بإشراف', 'اسم الأستاذ أو المشرف'), metaInput('date', labLike ? 'تاريخ التجربة' : 'التاريخ')]),
        labLike ? h('div.grid2', [metaInput('submitDate', 'تاريخ التسليم', 'اختياري'), h('div')]) : null,
        ...peopleFields(st.meta),
        site ? h('div.grid2', [metaInput('org', 'الجهة / الشركة'), metaInput('location', 'الموقع')]) : null,
        h('label.row', { style: { gap: '8px', fontSize: '13px' } }, [
          h('input', { type: 'checkbox', checked: st.saveCover, onchange: (e) => { st.saveCover = e.target.checked; } }),
          'احفظ هذه البيانات لتقاريري القادمة',
        ]),
      ]);
    }

    /** خيارات الكتابة: الأسلوب واللغة والعناوين والكتابة الطبيعية. */
    const writingBox = h('div');
    function renderWriting() {
      const ai = aiReady();
      const lv = LEVELS.find((l) => l.value === st.level) || LEVELS[0];
      const lg = LANGS.find((l) => l.value === st.lang) || LANGS[0];
      const sr = STRUCTURES.find((x) => x.value === st.structure) || STRUCTURES[0];
      fill(writingBox, [
        field('الأسلوب', chipGroup(LEVELS.map((l) => ({ value: l.value, label: l.label })), st.level, (v) => { st.level = v; renderWriting(); }), lv.hint),
        field('اللغة', chipGroup(LANGS.map((l) => ({ value: l.value, label: l.label })), st.lang, (v) => { st.lang = v; renderWriting(); renderMeta(); }),
          st.lang === 'en' && !ai ? 'الإنجليزية تحتاج الذكاء الاصطناعي؛ النسخة دون اتصال بالعربية.' : lg.hint),
        field('عناوين الأقسام', chipGroup(STRUCTURES.map((x) => ({ value: x.value, label: x.label })), st.structure, (v) => { st.structure = v; renderWriting(); }), sr.hint),
        settingRow('كتابة طبيعية كأنها من الطالب', 'بلا عبارات قالبية ولا شرطات طويلة ولا «» ولا تشكيل، وعريض أقل', toggle(st.human, (v) => { st.human = v; })),
        h('h2.sec', 'محتوى التقرير'),
        field('النقاط', chipGroup(LISTS.map((x) => ({ value: x.value, label: x.label })), st.lists, (v) => { st.lists = v; renderWriting(); }), LISTS.find((x) => x.value === st.lists)?.hint),
        settingRow('جداول', st.tables ? 'جداول للقراءات والنتائج والمقارنات' : 'بلا جداول: القراءات والنتائج تُكتب في جمل', toggle(st.tables, (v) => { st.tables = v; renderWriting(); })),
        settingRow('صور', st.images > 0 ? `${st.images} صورة — غيّر العدد من «عدد الصور»` : 'بلا صور', toggle(st.images > 0, (v) => { st.images = v ? Math.max(1, getType(st.typeId).figures || 2) : 0; imgCount.textContent = String(st.images); renderWriting(); })),
        settingRow('ترقيم الأقسام', st.numbering ? '1. المقدمة، 2. … (وشكل الترقيم من «التنسيق»)' : 'عناوين بلا أرقام', toggle(st.numbering, (v) => { st.numbering = v; })),
        h('div.row-set', [
          h('div.grow', [h('div.t', `تنويع الصياغة: الصيغة ${st.variant} من ${VARIANTS}`), h('div.s', 'لكل تقرير صيغة مختلفة في العناوين والمقدمة والخاتمة وترتيب النقاط، حتى لا يتشابه تقريرك مع تقارير زملائك')]),
          h('button.btn.sm', { type: 'button', onclick: () => { let v; do v = randomVariant(); while (v === st.variant); st.variant = v; renderWriting(); } }, '🎲 صيغة أخرى'),
        ]),
      ]);
    }

    const ai = aiReady();
    const genAI = h('button.btn.primary.lg.block', { type: 'button', onclick: () => start('ai') }, [icon('sparkles', 20), 'أنشئ التقرير بالذكاء الاصطناعي']);
    const genOff = h('button.btn' + (ai ? '.ghost' : '.primary.lg') + '.block', { type: 'button', onclick: () => start('offline') }, [
      icon(ai ? 'offline' : 'file', 18),
      ai ? 'نسخة دون اتصال' : (kb ? 'أنشئ التقرير (محتوى كامل دون اتصال)' : 'أنشئ قالبًا منظّمًا دون اتصال'),
    ]);

    const cat = topic ? CAT_BY_ID[topic.cat] : null;
    root.append(
      topbar('تقرير جديد'),
      h('div.wrap', [
        h('div.mt'),
        field('عنوان التقرير', titleIn),
        topic ? h('div.row.wrap.mb', [
          h('span.badge', `${cat?.icon || ''} ${cat?.name || ''}`),
          kb ? kbBadge() : h('span.badge', 'قالب دون اتصال'),
        ]) : null,
        subjBox,

        h('h2.sec', 'نوع التقرير'),
        typesGrid,
        typeDesc,

        readingsBox,

        h('h2.sec', 'الخيارات'),
        field('الطول', chipGroup(LENGTHS.map((l) => ({ value: l.value, label: `${l.label} (${l.words.split(' ')[0]}+ كلمة)` })), st.length, (v) => { st.length = v; })),
        writingBox,
        h('div.row-set', [
          h('div.grow', [h('div.t', 'عدد الصور'), h('div.s', state.images.enabled ? 'صور حقيقية من ويكيبيديا وويكيميديا كومنز يتحقق منها التطبيق' : 'جلب الصور معطّل من الإعدادات')]),
          h('div.stepper', [
            h('button', { type: 'button', 'aria-label': 'إنقاص', onclick: () => { st.images = Math.max(0, st.images - 1); imgCount.textContent = String(st.images); } }, '−'),
            imgCount,
            h('button', { type: 'button', 'aria-label': 'زيادة', onclick: () => { st.images = Math.min(6, st.images + 1); imgCount.textContent = String(st.images); } }, '+'),
          ]),
        ]),

        h('details.more-opts.mt', { open: !!qTitle && !topic }, [
          h('summary', [icon('edit', 18), 'ملاحظات إضافية للذكاء الاصطناعي (اختياري)']),
          detailsIn,
          h('p.hint', 'كلما أعطيت تفاصيل حقيقية كان التقرير أقرب لما يطلبه أستاذك. ما لا تذكره يُكتب بين أقواس [ ] لتعدّله.'),
        ]),
        h('details.more-opts', [
          h('summary', [icon('file', 18), coverSum]),
          metaBox,
        ]),

        linked() && state.server.config?.notice ? h('div.notice.srv-note', [icon('info', 18), h('div.grow', state.server.config.notice)]) : null,
        linked() ? h('p.hint', 'تقاريرك تُحفظ لدى مدير التطبيق.') : null,
        ai && state.ai.provider === 'server'
          ? h('p.hint', `سيُكتب عبر خادم التطبيق دون أي مفتاح، بالنموذج الذي اختاره المدير${state.server.config?.dailyLimit ? ` — حدّك اليومي ${state.server.config.dailyLimit} تقارير` : ''}.`)
          : ai
          ? h('p.hint', state.ai.provider === 'openrouter'
            ? `سيُكتب مجانًا عبر OpenRouter مع بديلين تلقائيين إن ازدحم النموذج. النماذج المجانية أقل دقة من Claude في الحسابات، فراجع الأرقام. نموذج الكتابة: ${modelName(state.ai.openrouter.model)}`
            : `سيُكتب بنموذج ${modelInfo().name} بمستوى تفكير «${{ low: 'سريع', medium: 'متوازن', high: 'عميق' }[state.ai.effort]}». يمكنك تغييرهما من الإعدادات.`)
          : h('div.notice.warn', [icon('key', 18), h('div.grow', [
            kb ? 'هذا الموضوع له محتوى كامل دون اتصال مع أسئلة المناقشة. ' : 'دون ذكاء اصطناعي ستحصل على قالب بهيكل النوع وإرشادات لكل قسم. ',
            'لتقرير يُكتب بقراءاتك ولأي عنوان فعّل الذكاء الاصطناعي من الإعدادات.',
          ])]),
      ]),
      h('div.dock', h('div.wrap', { style: { flexDirection: 'column' } }, [ai ? genAI : null, genOff])),
    );

    renderSubjects();
    renderWriting();
    renderTypes();
    renderReadings();
    renderMeta();

    async function start(mode) {
      const title = st.title.trim();
      if (title.length < 3) { toast('اكتب عنوانًا للتقرير أولًا', 'err'); titleIn.focus(); return; }
      update((s) => {
        s.prefs.length = st.length;
        s.prefs.level = st.level;
        s.prefs.lang = st.lang;
        s.prefs.structure = st.structure;
        s.prefs.human = st.human;
        s.prefs.lists = st.lists;
        s.prefs.tables = st.tables;
        if (st.saveCover) {
          ['uni', 'university', 'college', 'department', 'stage', 'author', 'group', 'supervisor', 'supTitle', 'students', 'ministry', 'logo', 'logoAR', 'logo2', 'logo2AR', 'coverColor', 'coverAccent', 'hide', 'labels'].forEach((k) => { s.cover[k] = st.meta[k] ?? s.cover[k]; });
          s.cover.style = st.meta.coverStyle;
          s.cover.enabled = st.cover;
        }
      }, 'prefs');
      const report = newReport({
        title,
        typeId: st.typeId,
        topicId: topic?.id || null,
        options: { length: st.length, level: st.level, lang: st.lang, structure: st.structure, human: st.human, lists: st.lists, tables: st.tables, variant: st.variant, numbering: st.numbering, images: state.images.enabled ? st.images : 0, details: st.details, readings: st.readings, catId: st.catId, cover: st.cover },
        meta: { ...st.meta, subject: CAT_BY_ID[st.catId]?.name || '' },
      });
      if (imgHint) report.imgHint = imgHint;
      await putReport(report);
      startGeneration(report, mode);
      replace(`/report/${report.id}`);
    }
  },
};
