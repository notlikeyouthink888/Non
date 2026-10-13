/** الإعدادات: الذكاء الاصطناعي، الصور، الغلاف، التصدير، المظهر، والبيانات. */

import { h, fill, field, toggle, chipGroup, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, update, save, MODELS, EFFORTS, PROVIDERS, aiReady, cleanKey, resetSettings } from '../core/store.js';
import { exportAll, importAll, clearAll } from '../core/db.js';
import { toast, confirmSheet } from '../core/ui.js';
import { fmtNum, fmtUSD } from '../core/fmt.js';
import { shareFile, openExternal } from '../core/native.js';
import { REPORT_TYPES } from '../data/types.js';
import { TOPICS } from '../data/topics.js';
import { KB } from '../data/kb/index.js';
import { UNIVERSITIES, UNI_BY_ID } from '../data/universities.js';
import { testConnection, aiErrorMessage } from '../ai/client.js';
import { coverPicker, pickLogo } from '../report/covers.js';
import { freeModels, cachedModels, modelName } from '../ai/openrouter.js';

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
      const status = h('div.notice');
      const refreshStatus = () => {
        const on = aiReady();
        status.className = 'notice' + (on ? '' : ' warn');
        fill(status, [
          icon(on ? 'check' : 'key', 18),
          h('div.grow', on
            ? (a.provider === 'openrouter'
              ? `مفعّل مجانًا عبر OpenRouter — نموذج الكتابة: ${modelName(a.openrouter.model)}.`
              : `مفعّل — يكتب التقارير بنموذج ${MODELS.find((m) => m.id === a.model)?.name}.`)
            : (a.provider === 'openrouter'
              ? 'غير مفعّل. أنشئ مفتاح OpenRouter المجاني والصقه هنا لتكتب التقارير بالذكاء الاصطناعي لأي عنوان.'
              : 'غير مفعّل. أضف مفتاح Claude API لتكتب التقارير بالذكاء الاصطناعي لأي عنوان، مع اقتراح العناوين والتحقق البصري من الصور.')),
        ]);
      };
      refreshStatus();

      const providers = h('div.prov-grid', PROVIDERS.map((p) => h('button.prov' + (a.provider === p.id ? '.on' : ''), {
        type: 'button',
        onclick: () => { if (a.provider !== p.id) { update((s) => { s.ai.provider = p.id; }, 'ai'); renderAI(); } },
      }, [
        h('div.row.between', [h('strong', p.name), h('span.badge' + (p.id === 'openrouter' ? '.ok' : ''), p.badge)]),
        h('div.s', p.note),
      ])));

      const testOut = h('div.row', { style: { minHeight: '26px' } });
      const testBtn = h('button.btn.sm', {
        type: 'button',
        onclick: async () => {
          syncAll(); // نقرأ ما في الخانة فعلًا قبل الاختبار
          if (!aiReady()) {
            toast(a.provider === 'openrouter' ? 'الصق مفتاح OpenRouter أولًا' : a.mode === 'proxy' ? 'أدخل رابط الخادم أولًا' : 'الصق مفتاح Claude أولًا', 'err');
            return;
          }
          testBtn.disabled = true;
          fill(testOut, [h('div.spinner'), h('span.muted', 'يختبر الاتصال…')]);
          try {
            const r = await testConnection();
            fill(testOut, [icon('check', 16), h('span', { style: { color: 'var(--ok)' } }, r.msg || 'تم الاتصال بنجاح')]);
            if (a.provider === 'openrouter') renderModels();
          } catch (err) {
            fill(testOut, [icon('alert', 16), h('span', { style: { color: 'var(--danger)' } }, aiErrorMessage(err))]);
          } finally { testBtn.disabled = false; }
        },
      }, [icon('bolt', 15), 'اختبار الاتصال']);

      const syncers = [];
      const syncAll = () => syncers.forEach((f) => f());
      /** خانة مفتاح لا تعتمد على حدث واحد: تُقرأ عند الكتابة واللصق والخروج منها وقبل الاختبار. */
      function keyField(get, set, placeholder) {
        const inp = h('input.ltr.secret', {
          type: 'text', value: get(), placeholder, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
          spellcheck: false, name: 'asas-api-key', 'aria-label': 'مفتاح API',
        });
        const sync = () => {
          const v = cleanKey(inp.value);
          if (v !== cleanKey(get())) { set(v); save(); refreshStatus(); }
        };
        syncers.push(sync);
        ['input', 'change', 'keyup', 'blur', 'compositionend'].forEach((ev) => inp.addEventListener(ev, sync));
        inp.addEventListener('paste', () => setTimeout(sync, 0));
        const eye = h('button.icon-btn', {
          type: 'button', 'aria-label': 'إظهار المفتاح',
          onclick: () => inp.classList.toggle('show'),
        }, icon('eye', 18));
        return h('div.row', [inp, eye]);
      }
      const link = (url, text) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); openExternal(url); } }, text);

      const modelsBox = h('div.list');
      const visionBox = h('div');
      async function renderModels(force = false) {
        const cur = state.ai.openrouter;
        const shown = cachedModels();
        if (!shown.length || force) fill(modelsBox, h('div.row', [h('div.spinner'), h('span.muted', 'يجلب قائمة النماذج المجانية الحالية…')]));
        let list = shown;
        try { list = await freeModels({ force }); } catch {
          if (!list.length) { fill(modelsBox, h('div.notice.warn', [icon('alert', 18), h('div.grow', 'تعذّر جلب قائمة النماذج الآن. سيُستعمل الاختيار التلقائي (الموجّه المجاني) حتى تتصل بالإنترنت.')])); }
        }
        if (!list.length) return;
        const item = (id, title, sub, badges = []) => h('button.item', {
          type: 'button',
          style: cur.model === id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : null,
          onclick: () => { update((s) => { s.ai.openrouter.model = id; }, 'ai'); refreshStatus(); renderModels(); },
        }, [
          h('div.grow', [h('div.t', title), h('div.s', [...badges.map((b) => h('span.badge', b)), sub ? h('span', sub) : null])]),
          cur.model === id ? icon('check', 20) : null,
        ]);
        fill(modelsBox, [
          item('auto', 'تلقائي — الأفضل المتاح الآن', `يبدأ بـ ${list[0].name}، ويتحوّل تلقائيًا إلى بديل إن ازدحم`, ['مقترح']),
          ...list.slice(0, 14).map((m) => item(m.id, m.name, m.id.replace(/:free$/, ''), [
            m.ctx ? `سياق ${Math.round(m.ctx / 1000)} ألف` : null, m.vision ? 'يرى الصور' : null,
          ].filter(Boolean))),
        ]);
        const vis = list.filter((m) => m.vision);
        const sel = h('select', { onchange: () => update((s) => { s.ai.openrouter.visionModel = sel.value; }, 'ai') }, [
          h('option', { value: 'auto', selected: cur.visionModel === 'auto' }, vis.length ? `تلقائي (${vis[0].name})` : 'تلقائي'),
          ...vis.map((m) => h('option', { value: m.id, selected: cur.visionModel === m.id }, m.name)),
        ]);
        fill(visionBox, field('نموذج التحقق من الصور', sel, vis.length
          ? `${vis.length} نماذج مجانية تستطيع رؤية الصور. يُراجع كل صورتين في طلب واحد.`
          : 'لا يوجد الآن نموذج مجاني يرى الصور؛ سيُستعمل الموجّه المجاني، وإن تعذّر تُعتمد الصور بالترتيب التلقائي.'));
      }

      const u = a.usage;
      const usageRow = h('div.row-set', [
        h('div.grow', [h('div.t', 'الاستهلاك'), h('div.s', `${fmtNum(u.calls)} طلبًا • ${fmtNum(u.reports)} تقريرًا • ${fmtNum(u.input + u.output)} رمزًا • الكلفة التقريبية ${fmtUSD(u.cost)}`)]),
        h('button.btn.sm.ghost', { type: 'button', onclick: () => { update((s) => { s.ai.usage = { input: 0, output: 0, cost: 0, calls: 0, reports: 0 }; }, 'ai'); renderAI(); } }, 'تصفير'),
      ]);
      const verifyRow = settingRow('التحقق البصري من الصور', 'يرى الذكاء الاصطناعي الصور المرشّحة ويرفض غير المطابقة للموضوع', toggle(a.verifyImages, (v) => update((s) => { s.ai.verifyImages = v; }, 'ai')));

      if (a.provider === 'openrouter') {
        fill(aiCard, [
          status,
          field('مزوّد الذكاء الاصطناعي', providers),
          h('ol.steps-mini', [
            h('li', ['سجّل مجانًا في ', link('https://openrouter.ai/keys', 'openrouter.ai/keys'), ' ثم Create Key وانسخ المفتاح (يبدأ بـ sk-or-).']),
            h('li', ['من ', link('https://openrouter.ai/settings/privacy', 'openrouter.ai/settings/privacy'), ' فعّل السماح بالنماذج المجانية (Free model publication)، وإلا تُرفض الطلبات.']),
            h('li', 'الصق المفتاح هنا ثم اضغط «اختبار الاتصال».'),
          ]),
          field('مفتاح OpenRouter', keyField(() => state.ai.openrouter.apiKey, (v) => { state.ai.openrouter.apiKey = v; }, 'sk-or-v1-…'),
            'يُحفظ في جهازك فقط ويُرسل مباشرة إلى OpenRouter. لا تشارك التطبيق أو صورة الشاشة والمفتاح ظاهر.'),
          h('div.row.wrap', [testBtn, testOut]),
          h('div.field.mt', [
            h('div.row.between', [h('label', 'نموذج الكتابة'), h('button.btn.sm.ghost', { type: 'button', onclick: () => renderModels(true) }, [icon('refresh', 14), 'تحديث القائمة'])]),
            modelsBox,
            h('div.hint', 'القائمة تُجلب حيّة من OpenRouter لأن النماذج المجانية تتغيّر باستمرار، ومرتّبة حسب الجودة المتوقعة للكتابة العربية. كل طلب يحمل بديلين تلقائيين.'),
          ]),
          visionBox,
          h('div.notice', [icon('info', 18), h('div.grow', 'حدود النماذج المجانية: 20 طلبًا في الدقيقة و50 طلبًا في اليوم، وتصير 1000 في اليوم بعد شراء رصيد بقيمة 10 دولارات مرة واحدة. التقرير الواحد يستهلك من طلبين إلى أربعة. اختبار الاتصال يستهلك طلبًا واحدًا.')]),
          verifyRow,
          usageRow,
        ]);
        renderModels();
        return;
      }

      const urlIn = h('input.ltr', { value: a.proxyUrl, placeholder: 'https://asas-proxy.example.workers.dev', autocapitalize: 'off', spellcheck: false });
      const syncUrl = () => { const v = urlIn.value.trim(); if (v !== a.proxyUrl) { state.ai.proxyUrl = v; save(); refreshStatus(); } };
      ['input', 'change', 'blur', 'keyup'].forEach((ev) => urlIn.addEventListener(ev, syncUrl));
      syncers.push(syncUrl);
      const tokIn = h('input.ltr', { value: a.proxyToken, placeholder: 'رمز التطبيق (اختياري)', oninput: () => { state.ai.proxyToken = tokIn.value.trim(); save(); } });

      const models = h('div.list', MODELS.map((m) => h('button.item', {
        type: 'button',
        style: a.model === m.id ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : null,
        onclick: () => { syncAll(); update((s) => { s.ai.model = m.id; }, 'ai'); renderAI(); },
      }, [
        h('div.grow', [h('div.t', m.name), h('div.s', [h('span', m.note), h('span.badge', `$${m.inPrice} / $${m.outPrice} لكل مليون رمز`)])]),
        a.model === m.id ? icon('check', 20) : null,
      ])));

      fill(aiCard, [
        status,
        field('مزوّد الذكاء الاصطناعي', providers),
        field('طريقة الاتصال', chipGroup([{ value: 'key', label: 'مفتاح API مباشر' }, { value: 'proxy', label: 'خادم وسيط' }], a.mode, (v) => { syncAll(); update((s) => { s.ai.mode = v; }, 'ai'); renderAI(); })),
        a.mode === 'key'
          ? field('مفتاح Claude API', keyField(() => state.ai.apiKey, (v) => { state.ai.apiKey = v; }, 'sk-ant-api03-…'), h('span', [
            'من ', link('https://console.anthropic.com/settings/keys', 'console.anthropic.com'),
            ' ← API Keys (يبدأ بـ sk-ant-api) مع رصيد مدفوع. يُحفظ في جهازك فقط ويُرسل مباشرة إلى Anthropic. لا تشارك التطبيق أو صورة الشاشة والمفتاح ظاهر.',
          ]))
          : h('div', [
            field('رابط الخادم الوسيط', urlIn, 'خادم صغير يحتفظ بالمفتاح بعيدًا عن الجهاز (ملف server/worker.js في المشروع) — مناسب إن أردت مشاركة التطبيق مع زملائك.'),
            field('رمز التطبيق', tokIn),
          ]),
        h('div.row.wrap', [testBtn, testOut]),
        h('div.field.mt', [h('label', 'النموذج'), models]),
        field('عمق التفكير', chipGroup(EFFORTS.map((e) => ({ value: e.value, label: e.label })), a.effort, (v) => { update((s) => { s.ai.effort = v; }, 'ai'); }), EFFORTS.map((e) => `${e.label}: ${e.hint}`).join(' • ')),
        verifyRow,
        usageRow,
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
  const box = h('div.card');
  const inp = (k, label, ph = '') => field(label, h('input', { value: c[k] || '', placeholder: ph, oninput: (e) => { state.cover[k] = e.target.value; save(); } }));
  function render() {
    const other = !UNI_BY_ID[c.uni];
    fill(box, [
      field('الجامعة', chipGroup(
        [...UNIVERSITIES.map((u) => ({ value: u.id, label: u.name })), { value: 'other', label: 'أخرى' }],
        other ? 'other' : c.uni,
        (v) => {
          update((st) => {
            if (v === 'other') Object.assign(st.cover, { uni: 'other', university: '', college: '' });
            else { const u = UNI_BY_ID[v]; Object.assign(st.cover, { uni: u.id, university: u.name, college: u.college, department: u.department }); }
          }, 'cover');
          render();
        },
      ), 'تملأ اسم الجامعة والكلية والقسم في غلاف كل تقرير، ويمكنك تعديلها لكل تقرير.'),
      other ? h('div.grid2', [inp('university', 'اسم الجامعة'), inp('college', 'الكلية')]) : null,
      h('div.grid2', [inp('department', 'القسم'), inp('stage', 'المرحلة', 'الثانية')]),
      h('div.grid2', [inp('author', 'اسمك', 'يظهر في الغلاف'), inp('group', 'الشعبة / المجموعة')]),
      inp('supervisor', 'المشرف (اختياري)'),
      settingRow('ترويسة الوزارة', 'جمهورية العراق — وزارة التعليم العالي والبحث العلمي', toggle(c.ministry !== false, (v) => update((st) => { st.cover.ministry = v; }, 'cover'))),
      settingRow('صفحة غلاف للتقارير الجديدة', 'تستطيع إلغاءها أو تغيير نمطها لكل تقرير', toggle(c.enabled !== false, (v) => { update((st) => { st.cover.enabled = v; }, 'cover'); render(); })),
      c.enabled !== false ? field('نمط الغلاف الافتراضي', coverPicker(sample, c.style || 'classic', (v) => update((st) => { st.cover.style = v; }, 'cover'))) : null,
      h('div.logo-row', [
        c.logo ? h('img', { src: c.logo, alt: 'الشعار' }) : null,
        h('button.btn.sm', {
          type: 'button',
          onclick: async () => {
            try {
              const l = await pickLogo();
              if (l) { update((st) => { st.cover.logo = l.src; st.cover.logoAR = l.ar; }, 'cover'); render(); }
            } catch { toast('تعذّرت قراءة الصورة', 'err'); }
          },
        }, [icon('image', 15), c.logo ? 'تغيير شعار الجامعة' : 'شعار الجامعة (اختياري)']),
        c.logo ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { update((st) => { st.cover.logo = ''; }, 'cover'); render(); } }, 'إزالة') : null,
      ]),
    ]);
  }
  // تقرير نموذجي لمعاينة الأنماط ببيانات الطالب المحفوظة
  const sample = () => ({
    title: 'فحص الشد للحديد (Tension Test)', typeId: 'lab', catId: 'strength', options: { cover: true },
    meta: { ...state.cover, coverStyle: state.cover.style, subject: 'مقاومة المواد', expNo: '3', date: '', year: '', submitDate: '' },
  });
  render();
  return box;
}

function exportCard() {
  const e = state.exportOpts;
  const fonts = ['Simplified Arabic', 'Traditional Arabic', 'Arial', 'Sakkal Majalla', 'Calibri', 'Times New Roman'];
  const sel = h('select', { onchange: () => update((s) => { s.exportOpts.wordFont = sel.value; }, 'export') }, fonts.map((f) => h('option', { value: f, selected: f === e.wordFont }, f)));
  return h('div.card', [
    field('خط ملف Word', sel, 'الخط المعتاد في تقارير الجامعات العراقية: Simplified Arabic بحجم 14.'),
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
    h('p.muted', `تقارير طلبة المرحلة الثانية في الهندسة المدنية بالعربية — مقاومة المواد، الرياضيات الهندسية، تكنولوجيا الخرسانة، المساحة، ميكانيك الموائع: ${REPORT_TYPES.length} نوعًا من التقارير، و${TOPICS.length} تجربة وموضوعًا بمحتوى كامل يعمل دون إنترنت مع أسئلة المناقشة. الكتابة بالذكاء الاصطناعي عبر OpenRouter المجاني أو Claude، والصور من ويكيبيديا وويكيميديا كومنز وOpenverse مع ذكر مصادرها.`),
    h('p.hint', 'تذكير: راجع كل تقرير قبل تسليمه، وتحقق من الأرقام والمواصفات المطلوبة في مادتك أو مشروعك، وعدّل ما بين الأقواس [ ].'),
  ]);
}
