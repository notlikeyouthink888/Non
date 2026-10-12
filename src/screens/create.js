/**
 * إنشاء تقرير: العنوان، نوع التقرير، الطول والمستوى والصور، تفاصيل إضافية، وبيانات الغلاف.
 */

import { h, fill, chipGroup, field } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { replace } from '../core/nav.js';
import { state, update, aiReady, modelInfo } from '../core/store.js';
import { putReport } from '../core/db.js';
import { toast } from '../core/ui.js';
import { REPORT_TYPES, TYPE_BY_ID, LENGTHS, LEVELS, getType } from '../data/types.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { CAT_BY_ID } from '../data/categories.js';
import { KB } from '../data/kb/index.js';
import { newReport } from '../report/model.js';
import { startGeneration } from '../report/pipeline.js';
import { topbar, kbBadge } from './common.js';
import { bidi } from '../core/arabic.js';

const DETAIL_HINTS = {
  lab: 'مثال: أجرينا الفحص في مختبر الكلية على خلطة 1:2:4 ونسبة ماء 0.5، وكان الهطول 85 ملم… (اكتب قراءاتك ليستعملها التقرير كما هي)',
  training: 'مثال: تدرّبت في شركة … على مشروع بناية من 4 طوابق في بغداد لمدة 4 أسابيع، وشاركت في صب السقف وفحص الحديد…',
  visit: 'مثال: زيارة لمشروع جسر … بتاريخ … مع الأستاذ …، وشاهدنا صب دعامة ونصب العتبات…',
  daily: 'مثال: مشروع مدرسة 12 صفًا، اليوم صُبّ سقف الطابق الأول (85 م³)، العمال 30، الطقس حار 45°م…',
  progress: 'مثال: مدة العقد 12 شهرًا، المنجز حتى الآن 40%، والتأخير بسبب تأخر صرف السلف…',
  inspection: 'مثال: استلام حديد سقف الطابق الثاني — بلاطة 20 سم وتسليح Φ12 كل 15 سم…',
  boq: 'مثال: دار 200 م² طابق واحد، أسس شريطية عرض 80 سم، جدران 24 سم…',
  design: "مثال: عتبة بسيطة الإسناد فضاؤها 6 م، حمل ميت 20 kN/m وحي 12 kN/m، f'c = 25 MPa…",
};

export default {
  mount(root, { query }) {
    const topic = TOPIC_BY_ID[query.get('topic')] || null;
    const kb = topic ? KB[topic.id] : null;
    const imgHint = query.get('img') || '';

    const st = {
      title: query.get('title') || topic?.title || '',
      typeId: TYPE_BY_ID[query.get('type')] ? query.get('type') : topic?.types[0] || 'research',
      length: state.prefs.length,
      level: state.prefs.level,
      images: null,
      details: '',
      meta: { ...state.cover, org: '', project: '', location: '' },
    };
    st.images = getType(st.typeId).figures;

    const titleIn = h('textarea', { rows: 2, value: st.title, placeholder: 'مثال: فحص الهطول للخرسانة الطرية', oninput: () => { st.title = titleIn.value; } });
    const typeDesc = h('p.hint');
    const typesGrid = h('div.grid-types');
    const imgCount = h('span', String(st.images));
    const detailsIn = h('textarea', { rows: 4, oninput: () => { st.details = detailsIn.value; } });
    const metaBox = h('div');

    const suggested = new Set(topic?.types || []);
    function renderTypes() {
      const ordered = [...REPORT_TYPES].sort((a, b) => (suggested.has(b.id) ? 1 : 0) - (suggested.has(a.id) ? 1 : 0));
      fill(typesGrid, ordered.map((t) => h('button.type-card' + (t.id === st.typeId ? '.on' : ''), {
        type: 'button',
        onclick: () => {
          st.typeId = t.id;
          st.images = t.figures;
          imgCount.textContent = String(st.images);
          renderTypes();
          renderMeta();
        },
      }, [
        h('span.em', t.icon),
        h('span.nm', bidi(t.name)),
        suggested.has(t.id) ? h('span.tag', 'مقترح') : null,
      ])));
      const t = getType(st.typeId);
      typeDesc.textContent = bidi(`${t.desc} — مناسب لـ: ${t.forWho}`);
      detailsIn.placeholder = DETAIL_HINTS[t.id] || 'أي تفاصيل تريد أن يراعيها التقرير: المرحلة الدراسية، نقاط يركّز عليها، معلومات المشروع… (اختياري)';
    }

    function metaInput(key, label, ph = '') {
      return field(label, h('input', { value: st.meta[key] || '', placeholder: ph, oninput: (e) => { st.meta[key] = e.target.value; } }));
    }

    function renderMeta() {
      const site = ['training', 'visit', 'daily', 'progress', 'inspection', 'method', 'qc', 'safety', 'assessment', 'geotech', 'boq', 'failure'].includes(st.typeId);
      fill(metaBox, [
        site ? h('div.grid2', [metaInput('org', 'الجهة / الشركة'), metaInput('project', 'اسم المشروع')]) : null,
        site ? metaInput('location', 'الموقع', 'مثال: بغداد — الكرادة') : null,
        h('div.grid2', [metaInput('author', 'إعداد', 'اسمك'), metaInput('stage', 'المرحلة', 'مثال: الثالثة')]),
        h('div.grid2', [metaInput('university', 'الجامعة'), metaInput('college', 'الكلية')]),
        h('div.grid2', [metaInput('department', 'القسم'), metaInput('supervisor', 'إشراف')]),
        h('label.row', { style: { gap: '8px', fontSize: '13px' } }, [
          h('input', { type: 'checkbox', onchange: (e) => { st.saveCover = e.target.checked; } }),
          'احفظ هذه البيانات لتقاريري القادمة',
        ]),
      ]);
    }

    const ai = aiReady();
    const genAI = h('button.btn.primary.lg.block', { type: 'button', onclick: () => start('ai') }, [icon('sparkles', 20), 'أنشئ التقرير بالذكاء الاصطناعي']);
    const genOff = h('button.btn' + (ai ? '.ghost' : '.primary.lg') + '.block', { type: 'button', onclick: () => start('offline') }, [
      icon(ai ? 'offline' : 'file', 18),
      ai ? 'نسخة دون اتصال' : (kb ? 'أنشئ التقرير (محتوى كامل دون اتصال)' : 'أنشئ قالبًا منظّمًا دون اتصال'),
    ]);

    root.append(
      topbar('تقرير جديد'),
      h('div.wrap', [
        h('div.mt'),
        field('عنوان التقرير', titleIn),
        topic ? h('div.row.wrap.mb', [
          h('span.badge', `${CAT_BY_ID[topic.cat]?.icon || ''} ${CAT_BY_ID[topic.cat]?.short || CAT_BY_ID[topic.cat]?.name || ''}`),
          kb ? kbBadge() : h('span.badge', 'قالب دون اتصال'),
        ]) : null,

        h('h2.sec', 'نوع التقرير'),
        typesGrid,
        typeDesc,

        h('h2.sec', 'الخيارات'),
        field('الطول', chipGroup(LENGTHS.map((l) => ({ value: l.value, label: `${l.label} (${l.words.split(' ')[0]}+ كلمة)` })), st.length, (v) => { st.length = v; })),
        field('المستوى', chipGroup(LEVELS.map((l) => ({ value: l.value, label: l.label })), st.level, (v) => { st.level = v; })),
        h('div.row-set', [
          h('div.grow', [h('div.t', 'عدد الصور'), h('div.s', state.images.enabled ? 'صور حقيقية من ويكيبيديا وويكيميديا كومنز يتحقق منها التطبيق' : 'جلب الصور معطّل من الإعدادات')]),
          h('div.stepper', [
            h('button', { type: 'button', 'aria-label': 'إنقاص', onclick: () => { st.images = Math.max(0, st.images - 1); imgCount.textContent = String(st.images); } }, '−'),
            imgCount,
            h('button', { type: 'button', 'aria-label': 'زيادة', onclick: () => { st.images = Math.min(6, st.images + 1); imgCount.textContent = String(st.images); } }, '+'),
          ]),
        ]),

        h('details.more-opts.mt', { open: !!query.get('title') && !topic }, [
          h('summary', [icon('edit', 18), 'تفاصيل إضافية للذكاء الاصطناعي (اختياري)']),
          detailsIn,
          h('p.hint', 'كلما أعطيت تفاصيل حقيقية (قراءاتك، اسم المشروع، ما شاهدته) كان التقرير أدق وأقرب لعملك. ما لا تذكره يُكتب بين أقواس [ ] لتعدّله.'),
        ]),
        h('details.more-opts', [
          h('summary', [icon('file', 18), 'بيانات الغلاف']),
          metaBox,
        ]),

        ai
          ? h('p.hint', `سيُكتب بنموذج ${modelInfo().name} بمستوى تفكير «${{ low: 'سريع', medium: 'متوازن', high: 'عميق' }[state.ai.effort]}». يمكنك تغييرهما من الإعدادات.`)
          : h('div.notice.warn', [icon('key', 18), h('div.grow', [
            kb ? 'هذا الموضوع له محتوى كامل دون اتصال. ' : 'دون ذكاء اصطناعي ستحصل على قالب بهيكل النوع وإرشادات لكل قسم. ',
            'لتقرير مكتوب بالكامل لأي عنوان فعّل الذكاء الاصطناعي من الإعدادات.',
          ])]),
      ]),
      h('div.dock', h('div.wrap', { style: { flexDirection: 'column' } }, [ai ? genAI : null, genOff])),
    );

    renderTypes();
    renderMeta();

    async function start(mode) {
      const title = st.title.trim();
      if (title.length < 3) { toast('اكتب عنوانًا للتقرير أولًا', 'err'); titleIn.focus(); return; }
      update((s) => {
        s.prefs.length = st.length;
        s.prefs.level = st.level;
        if (st.saveCover) ['author', 'university', 'college', 'department', 'stage', 'supervisor'].forEach((k) => { s.cover[k] = st.meta[k] || ''; });
      }, 'prefs');
      const report = newReport({
        title,
        typeId: st.typeId,
        topicId: topic?.id || null,
        options: { length: st.length, level: st.level, images: state.images.enabled ? st.images : 0, details: st.details, catId: topic?.cat },
        meta: st.meta,
      });
      if (imgHint) report.imgHint = imgHint;
      await putReport(report);
      startGeneration(report, mode);
      replace(`/report/${report.id}`);
    }
  },
};
