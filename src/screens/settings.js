/** الإعدادات: الذكاء الاصطناعي، الصور، الغلاف، التصدير، المظهر، والبيانات. */

import { h, fill, field, toggle, chipGroup, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, update, save, MODELS, EFFORTS, aiReady, resetSettings } from '../core/store.js';
import { exportAll, importAll, clearAll } from '../core/db.js';
import { toast, confirmSheet } from '../core/ui.js';
import { fmtNum, fmtUSD } from '../core/fmt.js';
import { shareFile, openExternal } from '../core/native.js';
import { REPORT_TYPES } from '../data/types.js';
import { TOPICS } from '../data/topics.js';
import { KB } from '../data/kb/index.js';
import { testConnection, aiErrorMessage } from '../ai/client.js';

export default {
  mount(root) {
    const aiCard = h('div.card');
    root.append(h('div.wrap', [
      h('h1.page', 'الإعدادات'),
      h('p.sub', 'كل الإعدادات والتقارير محفوظة داخل جهازك فقط.'),
      h('h2.sec', [icon('sparkles', 18), 'الذكاء الاصطناعي']),
      aiCard,
      h('h2.sec', [icon('image', 18), 'الصور']),
      imagesCard(),
      h('h2.sec', [icon('file', 18), 'بيانات الغلاف الافتراضية']),
      coverCard(),
      h('h2.sec', [icon('word', 18), 'التصدير']),
      exportCard(),
      h('h2.sec', [icon('eye', 18), 'المظهر']),
      lookCard(),
      h('h2.sec', [icon('folder', 18), 'البيانات']),
      dataCard(),
      aboutCard(),
    ]));
    renderAI();

    function renderAI() {
      const a = state.ai;
      const status = h('div.notice' + (aiReady() ? '' : '.warn'), [
        icon(aiReady() ? 'check' : 'key', 18),
        h('div.grow', aiReady()
          ? `مفعّل — يكتب التقارير بنموذج ${MODELS.find((m) => m.id === a.model)?.name}.`
          : 'غير مفعّل. أضف مفتاح Claude API لتكتب التقارير بالذكاء الاصطناعي لأي عنوان، مع اقتراح العناوين والتحقق البصري من الصور.'),
      ]);

      const keyIn = h('input.ltr', {
        type: 'password', value: a.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false,
        oninput: () => { state.ai.apiKey = keyIn.value.trim(); save(); },
        onchange: () => renderAI(),
      });
      const eye = h('button.icon-btn', { type: 'button', 'aria-label': 'إظهار المفتاح', onclick: () => { keyIn.type = keyIn.type === 'password' ? 'text' : 'password'; } }, icon('eye', 18));
      const urlIn = h('input.ltr', { value: a.proxyUrl, placeholder: 'https://asas-proxy.example.workers.dev', oninput: () => { state.ai.proxyUrl = urlIn.value.trim(); save(); }, onchange: () => renderAI() });
      const tokIn = h('input.ltr', { value: a.proxyToken, placeholder: 'رمز التطبيق (اختياري)', oninput: () => { state.ai.proxyToken = tokIn.value.trim(); save(); } });

      const testOut = h('div.row', { style: { minHeight: '26px' } });
      const testBtn = h('button.btn.sm', {
        type: 'button',
        onclick: async () => {
          if (!aiReady()) { toast('أدخل المفتاح أو رابط الخادم أولًا', 'err'); return; }
          testBtn.disabled = true;
          fill(testOut, [h('div.spinner'), h('span.muted', 'يختبر الاتصال…')]);
          try {
            const r = await testConnection();
            fill(testOut, [icon('check', 16), h('span', { style: { color: 'var(--ok)' } }, r.msg || 'تم الاتصال بنجاح')]);
          } catch (err) {
            fill(testOut, [icon('alert', 16), h('span', { style: { color: 'var(--danger)' } }, aiErrorMessage(err))]);
          } finally { testBtn.disabled = false; }
        },
      }, [icon('bolt', 15), 'اختبار الاتصال']);

      const models = h('div.list', MODELS.map((m) => h('button.item' + (a.model === m.id ? '' : ''), {
        type: 'button',
        style: a.model === m.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : null,
        onclick: () => { update((s) => { s.ai.model = m.id; }, 'ai'); renderAI(); },
      }, [
        h('div.grow', [h('div.t', m.name), h('div.s', [h('span', m.note), h('span.badge', `$${m.inPrice} / $${m.outPrice} لكل مليون رمز`)])]),
        a.model === m.id ? icon('check', 20) : null,
      ])));

      const u = a.usage;
      fill(aiCard, [
        status,
        field('طريقة الاتصال', chipGroup([{ value: 'key', label: 'مفتاح API مباشر' }, { value: 'proxy', label: 'خادم وسيط' }], a.mode, (v) => { update((s) => { s.ai.mode = v; }, 'ai'); renderAI(); })),
        a.mode === 'key'
          ? field('مفتاح Claude API', h('div.row', [keyIn, eye]), h('span', [
            'احصل عليه من ',
            h('a', { href: '#', onclick: (e) => { e.preventDefault(); openExternal('https://console.anthropic.com/settings/keys'); } }, 'console.anthropic.com'),
            ' ← API Keys. يُحفظ في جهازك فقط ويُرسل مباشرة إلى Anthropic عند الإنشاء. لا تشارك التطبيق مع مفتاحك داخله.',
          ]))
          : h('div', [
            field('رابط الخادم الوسيط', urlIn, 'خادم صغير يحتفظ بالمفتاح بعيدًا عن الجهاز (ملف server/worker.js في المشروع) — مناسب إن أردت مشاركة التطبيق مع زملائك.'),
            field('رمز التطبيق', tokIn),
          ]),
        h('div.row.wrap', [testBtn, testOut]),
        h('div.field.mt', [h('label', 'النموذج'), models]),
        field('عمق التفكير', chipGroup(EFFORTS.map((e) => ({ value: e.value, label: e.label })), a.effort, (v) => { update((s) => { s.ai.effort = v; }, 'ai'); }), EFFORTS.map((e) => `${e.label}: ${e.hint}`).join(' • ')),
        settingRow('التحقق البصري من الصور', 'يرى الذكاء الاصطناعي الصور المرشّحة ويرفض غير المطابقة للموضوع', toggle(a.verifyImages, (v) => update((s) => { s.ai.verifyImages = v; }, 'ai'))),
        h('div.row-set', [
          h('div.grow', [h('div.t', 'الاستهلاك'), h('div.s', `${fmtNum(u.calls)} طلبًا • ${fmtNum(u.reports)} تقريرًا • ${fmtNum(u.input + u.output)} رمزًا • الكلفة التقريبية ${fmtUSD(u.cost)}`)]),
          h('button.btn.sm.ghost', { type: 'button', onclick: () => { update((s) => { s.ai.usage = { input: 0, output: 0, cost: 0, calls: 0, reports: 0 }; }, 'ai'); renderAI(); } }, 'تصفير'),
        ]),
      ]);
    }
  },
};

function imagesCard() {
  const s = state.images;
  return h('div.card', [
    settingRow('جلب صور للتقارير', 'صور حقيقية برخص حرة تُنزَّل ويُتحقق منها ثم تُحفظ في جهازك', toggle(s.enabled, (v) => update((st) => { st.images.enabled = v; }, 'images'))),
    settingRow('ويكيبيديا', 'الصورة الرئيسية لأقرب المقالات للموضوع', toggle(s.sources.wikipedia, (v) => update((st) => { st.images.sources.wikipedia = v; }, 'images'))),
    settingRow('ويكيميديا كومنز', 'أكبر مكتبة صور حرة، مع اسم المؤلف والرخصة', toggle(s.sources.commons, (v) => update((st) => { st.images.sources.commons = v; }, 'images'))),
    settingRow('Openverse', 'مصدر احتياطي لصور المشاع الإبداعي', toggle(s.sources.openverse, (v) => update((st) => { st.images.sources.openverse = v; }, 'images'))),
  ]);
}

function coverCard() {
  const c = state.cover;
  const inp = (k, label, ph = '') => field(label, h('input', { value: c[k] || '', placeholder: ph, oninput: (e) => { state.cover[k] = e.target.value; save(); } }));
  return h('div.card', [
    h('div.grid2', [inp('author', 'اسمك', 'يظهر في الغلاف'), inp('stage', 'المرحلة', 'مثال: الثالثة')]),
    h('div.grid2', [inp('university', 'الجامعة', 'مثال: جامعة بغداد'), inp('college', 'الكلية')]),
    h('div.grid2', [inp('department', 'القسم'), inp('supervisor', 'المشرف')]),
  ]);
}

function exportCard() {
  const e = state.exportOpts;
  const fonts = ['Simplified Arabic', 'Traditional Arabic', 'Arial', 'Sakkal Majalla', 'Calibri', 'Times New Roman'];
  const sel = h('select', { onchange: () => update((s) => { s.exportOpts.wordFont = sel.value; }, 'export') }, fonts.map((f) => h('option', { value: f, selected: f === e.wordFont }, f)));
  return h('div.card', [
    field('خط ملف Word', sel, 'الخط المعتاد في تقارير الجامعات العراقية: Simplified Arabic بحجم 14.'),
    settingRow('صفحة الغلاف', 'العنوان والجامعة واسم الطالب والمشرف', toggle(e.cover, (v) => update((s) => { s.exportOpts.cover = v; }, 'export'))),
    settingRow('فهرس المحتويات', null, toggle(e.toc, (v) => update((s) => { s.exportOpts.toc = v; }, 'export'))),
    settingRow('ذكر مصدر الصور ورخصتها', 'مستحسن أكاديميًا ومطلوب في بعض الرخص', toggle(e.attribution, (v) => update((s) => { s.exportOpts.attribution = v; }, 'export'))),
  ]);
}

function lookCard() {
  return h('div.card', [
    field('السمة', chipGroup([{ value: 'dark', label: 'داكنة' }, { value: 'light', label: 'فاتحة' }, { value: 'auto', label: 'حسب الجهاز' }], state.ui.theme, (v) => update((s) => { s.ui.theme = v; }, 'ui'))),
    field('حجم الخط', chipGroup([{ value: 's', label: 'صغير' }, { value: 'm', label: 'متوسط' }, { value: 'l', label: 'كبير' }], state.ui.fontSize, (v) => update((s) => { s.ui.fontSize = v; }, 'ui'))),
  ]);
}

function dataCard() {
  const fileIn = h('input', {
    type: 'file', accept: 'application/json,.json', style: { display: 'none' },
    onchange: async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      try {
        const n = await importAll(JSON.parse(await f.text()));
        toast(`استُعيد ${n} تقريرًا`, 'ok');
      } catch (err) {
        toast('ملف غير صالح: ' + (err.message || ''), 'err');
      }
      fileIn.value = '';
    },
  });
  return h('div.card', [
    settingRow('نسخة احتياطية', 'كل التقارير وصورها في ملف واحد', h('button.btn.sm', {
      type: 'button',
      onclick: async () => {
        try {
          const data = await exportAll();
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          await shareFile(blob, `asas-backup-${new Date().toISOString().slice(0, 10)}.json`, 'نسخة احتياطية');
        } catch (err) { toast('تعذّر إنشاء النسخة: ' + (err.message || ''), 'err'); }
      },
    }, [icon('download', 15), 'تصدير'])),
    settingRow('استعادة نسخة', null, h('button.btn.sm', { type: 'button', onclick: () => fileIn.click() }, [icon('upload', 15), 'استيراد'])),
    settingRow('حذف كل التقارير', 'لا يمكن التراجع', h('button.btn.sm.danger', {
      type: 'button',
      onclick: async () => {
        if (!(await confirmSheet('حذف كل التقارير', 'ستُحذف كل التقارير والصور المحفوظة في جهازك نهائيًا.', { okText: 'احذف الكل' }))) return;
        await clearAll();
        toast('حُذفت كل التقارير');
      },
    }, 'حذف')),
    settingRow('إعادة ضبط الإعدادات', 'يمسح المفتاح وكل التفضيلات', h('button.btn.sm.danger', {
      type: 'button',
      onclick: async () => {
        if (!(await confirmSheet('إعادة الضبط', 'ستعود كل الإعدادات لوضعها الأصلي ويُمسح مفتاح API.'))) return;
        resetSettings();
        location.reload();
      },
    }, 'ضبط')),
    fileIn,
  ]);
}

function aboutCard() {
  return h('div.card.soft.mt', [
    h('h3', 'أساس 1.0'),
    h('p.muted', `تقارير الهندسة المدنية بالعربية: ${REPORT_TYPES.length} نوعًا من التقارير، و${TOPICS.length} عنوانًا جاهزًا، و${Object.keys(KB).length} موضوعًا بمحتوى كامل يعمل دون إنترنت. الكتابة بالذكاء الاصطناعي عبر Claude، والصور من ويكيبيديا وويكيميديا كومنز وOpenverse مع ذكر مصادرها.`),
    h('p.hint', 'تذكير: راجع كل تقرير قبل تسليمه، وتحقق من الأرقام والمواصفات المطلوبة في مادتك أو مشروعك، وعدّل ما بين الأقواس [ ].'),
  ]);
}
