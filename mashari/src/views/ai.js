/**
 * واجهات الذكاء الاصطناعي (OpenRouter):
 *   - إعدادات المفتاح والنموذج
 *   - تبويب «تحليل» بصفحة المشروع: احتمالات النجاح والعوامل والأرقام والنصائح
 *   - صفحة الذكاء: اقتراح مشاريع جديدة، وتقييم احتمالات أقسام كاملة
 * الحكم الأخير يبقى للمستخدم: كل اقتراح يتضاف لدراسته بس إذا ضغط عليه.
 */

import { h, fill, chipGroup, empty } from '../core/dom.js';
import { state, uid } from '../core/store.js';
import { openPage, sheet, toast, haptic, confirmSheet } from '../core/ui.js';
import { emit } from '../core/bus.js';
import { ago, num } from '../core/text.js';
import {
  allCats, allProjects, catOf, typeOf, capOf, verdictOf, addProject, touch, CAPITALS,
} from '../model.js';
import {
  hasKey, getKey, setKey, freeModels, cachedModels, modelName, setModel, testConnection, errorMessage, isFatal,
} from '../ai/openrouter.js';
import { analyzeProject, scoreCategory, suggestIdeas, aiChance } from '../ai/tasks.js';
import { ring } from './parts.js';

/* ────────── أدوات ────────── */

/** مبلغ بعملة التحليل نفسه (حتى لو تغيّرت العملة بالإعدادات بعدين). */
function moneyIn(n, cur) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (cur === 'USD') return (n < 0 ? '-$' : '$') + num(Math.abs(n));
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const t = (x) => String(Math.round(x * 10) / 10);
  if (a >= 1e9) return `${sign}${t(a / 1e9)} مليار د.ع`;
  if (a >= 1e6) return `${sign}${t(a / 1e6)} مليون د.ع`;
  if (a >= 1e3) return `${sign}${t(a / 1e3)} ألف د.ع`;
  return `${sign}${num(a)} د.ع`;
}

const rangeText = (r, cur) => (r ? (r.min === r.max ? moneyIn(r.min, cur) : `${moneyIn(r.min, cur)} – ${moneyIn(r.max, cur)}`) : '—');

function loading(text, onCancel) {
  return h('div.card.ai-loading', [
    h('div.spinner'),
    h('div.grow', [h('div.card-t', text), h('div.card-s', 'النماذج المجانية ممكن تاخذ لحد دقيقة…')]),
    onCancel ? h('button.btn.sm', { type: 'button', onclick: onCancel }, 'إلغاء') : null,
  ]);
}

function errorCard(err, retry) {
  return h('div.card.ai-error', [
    h('div.card-t', '⚠️ ما اكتمل الطلب'),
    h('p.card-s', errorMessage(err)),
    h('div.grid2.mt', [
      retry ? h('button.btn', { type: 'button', onclick: retry }, '🔄 جرّب مرة ثانية') : null,
      h('button.btn.ghost', { type: 'button', onclick: () => openAiSettings() }, '⚙ إعدادات الذكاء'),
    ]),
  ]);
}

function needKeyCard(onReady) {
  return h('div.card.ai-setup', [
    h('div.ai-badge', '🤖'),
    h('div.card-t.center', 'شغّل الذكاء الاصطناعي'),
    h('p.muted.center', 'يحلل احتمالات نجاح المشاريع ويقترح أفكار جديدة. يحتاج مفتاح مجاني من OpenRouter وإنترنت.'),
    h('button.btn.primary.block', { type: 'button', onclick: () => openAiSettings({ onDone: onReady }) }, '🔑 حط مفتاح OpenRouter'),
  ]);
}

/* ────────── إعدادات الذكاء ────────── */

export function openAiSettings({ onDone } = {}) {
  sheet('🤖 الذكاء الاصطناعي (OpenRouter)', ({ close }) => {
    const input = h('input.key-in', {
      type: 'password', value: getKey(), placeholder: 'sk-or-v1-…', dir: 'ltr',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'مفتاح OpenRouter',
    });
    const showBtn = h('button.btn.sm', {
      type: 'button',
      onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; showBtn.textContent = input.type === 'password' ? 'إظهار' : 'إخفاء'; },
    }, 'إظهار');
    const status = h('div.ai-status');
    const select = h('select.model-sel', { 'aria-label': 'النموذج' });

    const fillModels = (list) => {
      fill(select, [
        h('option', { value: 'auto' }, 'تلقائي (أفضل نموذج مجاني) — مستحسن'),
        ...list.map((m) => h('option', { value: m.id }, m.name)),
      ]);
      select.value = list.some((m) => m.id === state.ai.model) ? state.ai.model : 'auto';
    };
    fillModels(cachedModels());
    select.addEventListener('change', () => { setModel(select.value); toast(`النموذج: ${modelName(select.value)}`); });

    const refresh = async (force) => {
      status.textContent = 'دا أجيب قائمة النماذج المجانية…';
      try {
        const list = await freeModels({ force });
        fillModels(list);
        status.textContent = `بيها ${list.length} نموذج مجاني هسه.`;
      } catch (err) {
        status.textContent = errorMessage(err);
      }
    };

    const saveAndTest = async () => {
      const k = input.value.trim();
      if (!k) { toast('الصق المفتاح أول', 'err'); input.focus(); return; }
      setKey(k);
      status.textContent = '⏳ دا أجرّب الاتصال…';
      status.className = 'ai-status';
      try {
        const msg = await testConnection();
        status.textContent = msg;
        status.className = 'ai-status ok';
        fillModels(cachedModels());
        emit('changed');
        onDone?.();
      } catch (err) {
        status.textContent = errorMessage(err);
        status.className = 'ai-status err';
      }
    };

    if (!cachedModels().length) refresh(false);

    return h('div.ai-settings', [
      h('ol.steps', [
        h('li', ['سجّل بموقع ', h('a', { href: 'https://openrouter.ai', target: '_blank', rel: 'noopener' }, 'openrouter.ai'), ' (ممكن بحساب گوگل) — مجاني.']),
        h('li', ['افتح ', h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener' }, 'openrouter.ai/keys'), ' ← Create Key ← انسخ المفتاح.']),
        h('li', ['افتح ', h('a', { href: 'https://openrouter.ai/settings/privacy', target: '_blank', rel: 'noopener' }, 'إعدادات الخصوصية'), ' وفعّل السماح بالنماذج المجانية (', h('bdi', 'Free models'), ').']),
        h('li', 'الصق المفتاح هنا واضغط «احفظ وجرّب».'),
      ]),
      h('div.field', [h('label', 'مفتاح OpenRouter'), h('div.row', [input, showBtn])]),
      h('div.grid2', [
        h('button.btn.primary', { type: 'button', onclick: saveAndTest }, '💾 احفظ وجرّب'),
        h('button.btn.danger', {
          type: 'button',
          onclick: async () => {
            if (!hasKey()) { close(); return; }
            if (!await confirmSheet('شيل المفتاح', 'راح ينشال المفتاح من التلفون، والتحليلات المحفوظة تبقى.', { okText: 'شيله' })) return;
            setKey('');
            input.value = '';
            status.textContent = 'انشال المفتاح.';
            emit('changed');
          },
        }, '🗑 شيل المفتاح'),
      ]),
      status,
      h('div.field.mt', [
        h('label', 'النموذج'),
        select,
        h('div.row.between.hint', [
          h('span.muted', 'إذا واحد توقّف، يتحوّل تلقائيًا لبديل مجاني.'),
          h('button.link', { type: 'button', onclick: () => refresh(true) }, '↻ حدّث القائمة'),
        ]),
      ]),
      h('div.card.tight.mt', [
        h('div.card-s', '🔒 المفتاح ينحفظ بتلفونك بس، وما يطلع ويا النسخة الاحتياطية. معلومات المشروع تنرسل لـ OpenRouter بس لما تضغط زر تحليل أو اقتراح.'),
        h('div.card-s.mt', '📶 الحساب المجاني: 20 طلب بالدقيقة و50 طلب باليوم (1000 إذا شريت رصيد 10 دولار مرة وحدة).'),
      ]),
    ]);
  });
}

/* ────────── تبويب التحليل بصفحة المشروع ────────── */

const running = new Map(); // projectId -> { ctrl }
const failed = new Map(); // projectId -> آخر خطأ
const mounted = new Map(); // projectId -> آخر تبويب مرسوم { wrap, rerender }

/** يرسم تبويب «تحليل» داخل صفحة المشروع. rerender يعيد رسم الصفحة. */
export function aiTab(p, study, rerender) {
  const wrap = h('div.ai-tab');
  const entry = state.ai.analyses[p.id];
  const job = running.get(p.id);
  mounted.set(p.id, { wrap, rerender });

  const start = () => {
    const ctrl = new AbortController();
    const j = { ctrl, error: null };
    running.set(p.id, j);
    rerender();
    analyzeProject(p, { signal: ctrl.signal })
      .then(() => { toast('خلص التحليل 🤖', 'ok'); haptic(18); })
      .catch((err) => { if (err?.name !== 'AbortError') j.error = err; })
      .finally(() => {
        running.delete(p.id);
        if (j.error) failed.set(p.id, j.error); else failed.delete(p.id);
        // التبويب ينعاد رسمه أثناء الانتظار، فنحدّث آخر نسخة ظاهرة منه
        const m = mounted.get(p.id);
        if (m?.wrap.isConnected) m.rerender();
      });
  };

  if (!hasKey() && !entry) return fill(wrap, needKeyCard(rerender));
  if (job) return fill(wrap, loading('🤖 دا يحلل المشروع ويحسب الاحتمالات…', () => { job.ctrl.abort(); }));

  const err = failed.get(p.id);
  if (!entry) {
    return fill(wrap, [
      err ? errorCard(err, start) : null,
      h('div.card.ai-intro', [
        h('div.ai-badge', '🤖'),
        h('div.card-t.center', 'خلي الذكاء يحلل المشروع'),
        h('p.muted.center', 'يحسب احتمال النجاح، واحتمالات الربح والخسارة بعد سنة، ويقيّم الطلب والمنافسة والمخاطر، ويقدّر رأس المال والربح بالشهر، وينطيك نصائح. ياخذ بعين الاعتبار اللي كتبته بدراستك.'),
        h('button.btn.primary.block', { type: 'button', onclick: start }, '🤖 حلّل احتمالات المشروع'),
      ]),
    ]);
  }
  return fill(wrap, [err ? errorCard(err, start) : null, analysisView(p, study, entry, rerender, start)]);
}

function analysisView(p, study, entry, rerender, again) {
  const d = entry.data;
  const v = verdictOf(d.verdict);
  const sc = d.scenarios;

  const adopt = (key, text) => {
    if (study[key].some((x) => x.t === text)) return false;
    study[key].push({ id: uid('pt'), t: text });
    touch(study);
    return true;
  };

  const pointsCard = (key, title, items) => {
    if (!items.length) return null;
    const rows = items.map((t) => {
      const added = study[key].some((x) => x.t === t);
      const btn = h('button.adopt' + (added ? '.done' : ''), {
        type: 'button', 'aria-label': 'أضفها لدراستي',
        onclick: () => {
          if (adopt(key, t)) { btn.classList.add('done'); btn.textContent = '✓'; haptic(); toast('انضافت لدراستك'); }
        },
      }, added ? '✓' : '＋');
      return h('div.ai-pt', [h('span.grow', t), btn]);
    });
    return h('div.card.ai-points.' + key, [
      h('div.row.between', [
        h('div.card-t', title),
        h('button.link', {
          type: 'button',
          onclick: () => { const n = items.filter((t) => adopt(key, t)).length; toast(n ? `انضافت ${n} نقطة لدراستك` : 'كلها موجودة أصلًا'); rerender(); },
        }, 'أضف الكل'),
      ]),
      h('div', rows),
      h('div.muted.hint', '＋ تضيف النقطة لدراستك — إنت تقرر شنو تاخذ.'),
    ]);
  };

  const listCard = (title, items, extra = null) => (items.length ? h('div.card', [
    h('div.card-t', title),
    h('ul.ai-list', items.map((t) => h('li', t))),
    extra,
  ]) : null);

  return h('div', [
    h('div.card.glow.ai-hero', [
      ring(d.chance, { size: 86, stroke: 9, cls: 'ai-ring' }),
      h('div.grow', [
        h('div.muted', 'احتمال النجاح حسب الذكاء'),
        v ? h('span.vb.' + v.cls, [h('b', v.icon), ' رأيه: ', v.label]) : null,
        d.summary ? h('p.ai-sum', d.summary) : null,
      ]),
    ]),

    h('div.card', [
      h('div.card-t', '🎲 احتمالات النتيجة بعد سنة'),
      h('div.scen-bar', [
        sc.strong ? h('i.s-strong', { style: { width: `${sc.strong}%` } }) : null,
        sc.average ? h('i.s-avg', { style: { width: `${sc.average}%` } }) : null,
        sc.loss ? h('i.s-loss', { style: { width: `${sc.loss}%` } }) : null,
      ]),
      h('div.scen-legend', [
        h('span', [h('i.s-strong'), '🚀 ربح قوي ويتوسّع ', h('bdi', `${sc.strong}%`)]),
        h('span', [h('i.s-avg'), '⚖️ يغطي نفسه بربح بسيط ', h('bdi', `${sc.average}%`)]),
        h('span', [h('i.s-loss'), '📉 يخسر أو يسكّر ', h('bdi', `${sc.loss}%`)]),
      ]),
    ]),

    d.factors.length ? h('div.card', [
      h('div.card-t', '📊 العوامل'),
      h('div.factors', d.factors.map((f) => h('div.factor', [
        h('div.row.between', [h('b', f.name), h('span.f-score', `${f.score}/10`)]),
        h('div.f-bar', [h('i' + (f.score >= 7 ? '.good' : f.score >= 4 ? '.mid' : '.bad'), { style: { width: `${f.score * 10}%` } })]),
        f.note ? h('div.muted', f.note) : null,
      ]))),
      h('div.muted.hint', '10 دائمًا الأحسن للمشروع (مثلًا منافسة 10 = منافسة قليلة).'),
    ]) : null,

    h('div.grid2.ai-money', [
      h('div.res', [h('div.muted', '🏗 تكاليف البداية'), h('div.res-v', rangeText(d.capital, entry.cur))]),
      h('div.res', [h('div.muted', '💵 صافي الربح بالشهر'), h('div.res-v', rangeText(d.monthlyProfit, entry.cur))]),
    ]),

    pointsCard('pros', '✅ إيجابيات يشوفها الذكاء', d.pros),
    pointsCard('cons', '❌ سلبيات يشوفها الذكاء', d.cons),
    listCard('⚠️ أهم المخاطر', d.risks),
    listCard('💡 نصائح حتى ينجح', d.tips),
    listCard('🔍 تأكد منها بنفسك بالسوق', d.checks, d.checks.length ? h('button.btn.sm.mt', {
      type: 'button',
      onclick: () => {
        const block = `🔍 أتأكد منها بالسوق (من الذكاء):\n${d.checks.map((c) => `• ${c}`).join('\n')}`;
        if (study.notes.includes(block)) { toast('موجودة بملاحظاتك'); return; }
        study.notes = study.notes.trim() ? `${study.notes.trimEnd()}\n\n${block}` : block;
        touch(study);
        toast('انضافت لملاحظاتك 📝', 'ok');
      },
    }, '📝 أضفها لملاحظاتي') : null),

    h('div.ai-foot', [
      h('div.muted', `🤖 ${modelName(entry.model)} · ${ago(entry.at)}`),
      h('button.btn.sm', { type: 'button', onclick: again }, '🔄 حلّل من جديد'),
    ]),
    h('p.muted.center.ai-note', 'هذا رأي ذكاء اصطناعي حسب معلومات عامة وممكن يغلط — الحكم الأخير إلك بعد ما تشوف السوق بنفسك.'),
  ]);
}

/* ────────── صفحة الذكاء: أفكار جديدة + تقييم الاحتمالات ────────── */

const ideasForm = { cat: 'all', budget: 0, city: '', note: '', count: 6 };
let lastIdeas = null; // { ideas, model, added: Set }

/**
 * opts: { tab: 'ideas' | 'scores', cat }
 */
export function openAiHub({ tab: startTab = 'ideas', cat, onClose } = {}) {
  let tab = startTab;
  if (cat) ideasForm.cat = cat;
  let scoreCat = cat || allCats()[0].id;
  let ideasJob = null;
  let ideasErr = null;
  let scoreJob = null; // { ctrl, label }
  let scoreErr = null;

  openPage((page, { close }) => {
    const body = h('div.page-body');
    fill(page, [
      h('header.page-head', [
        h('button.btn.icon.ghost', { 'aria-label': 'رجوع', onclick: close }, '→'),
        h('div.grow', [h('div.page-t', '🤖 الذكاء الاصطناعي'), h('div.page-s', `OpenRouter · ${modelName(state.ai.model)}`)]),
        h('button.btn.icon.ghost', { 'aria-label': 'إعدادات الذكاء', onclick: () => openAiSettings({ onDone: render }) }, '⚙'),
      ]),
      body,
    ]);

    function render() {
      if (!page.isConnected) return;
      const tabs = h('div.tabs', [
        { id: 'ideas', label: '💡 مشاريع جديدة' },
        { id: 'scores', label: '🎲 احتمالات النجاح' },
      ].map((t) => h('button' + (t.id === tab ? '.on' : ''), { type: 'button', onclick: () => { tab = t.id; render(); } }, t.label)));
      fill(body, [
        !hasKey() ? needKeyCard(render) : null,
        tabs,
        tab === 'ideas' ? ideasView() : scoresView(),
      ]);
    }

    /* ── اقتراح مشاريع ── */

    function ideasView() {
      const f = ideasForm;
      const city = h('input', { value: f.city, placeholder: 'مثلًا: البصرة، الكرادة، أربيل…', maxLength: 60 });
      city.addEventListener('input', () => { f.city = city.value; });
      const note = h('textarea', { value: f.note, rows: 2, maxLength: 300, placeholder: 'مثلًا: أريد شي من البيت، أو مشروع للبنات، أو أشتغل بيه بالليل…' });
      note.addEventListener('input', () => { f.note = note.value; });

      const run = () => {
        if (!hasKey()) { openAiSettings({ onDone: render }); return; }
        const ctrl = new AbortController();
        ideasJob = { ctrl };
        ideasErr = null;
        render();
        suggestIdeas({ ...f }, { signal: ctrl.signal })
          .then((r) => { lastIdeas = { ...r, added: new Map() }; haptic(18); })
          .catch((err) => { if (err?.name !== 'AbortError') ideasErr = err; })
          .finally(() => { ideasJob = null; render(); });
      };

      return h('div', [
        h('div.card', [
          h('div.card-t', 'اقترح عليّ أفكار مشاريع'),
          h('div.card-s', 'الذكاء يقترح مشاريع موجودة أو مطلوبة بالعراق ومو موجودة بقائمتك، وإنت تختار شنو تضيف.'),
          h('div.flabel', 'القسم'),
          chipGroup([{ value: 'all', label: 'أي قسم' }, ...allCats().map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))],
            f.cat, (v) => { f.cat = v; }, { scroll: true }),
          h('div.flabel', 'رأس المال اللي عندك'),
          chipGroup([{ value: 0, label: 'أي مبلغ' }, ...CAPITALS.map((c) => ({ value: c.id, label: c.name }))], f.budget, (v) => { f.budget = v; }),
          h('div.flabel', 'المدينة أو المنطقة (اختياري)'),
          city,
          h('div.flabel', 'شي تريده بالمشروع (اختياري)'),
          note,
          h('div.flabel', 'كم فكرة'),
          chipGroup([3, 6, 10].map((n) => ({ value: n, label: String(n) })), f.count, (v) => { f.count = v; }),
          h('button.btn.primary.block.mt', { type: 'button', onclick: run, disabled: !!ideasJob }, '🤖 اقترح'),
        ]),
        ideasJob ? loading('🤖 دا يفكر بأفكار جديدة…', () => ideasJob?.ctrl.abort()) : null,
        ideasErr ? errorCard(ideasErr, run) : null,
        !ideasJob && lastIdeas ? ideasResults() : null,
      ]);
    }

    function addIdea(idea) {
      const p = addProject({ name: idea.name, icon: idea.icon, cat: idea.cat, type: idea.type, cap: idea.cap, desc: idea.desc, ai: true });
      if (idea.chance !== null) state.ai.quick[p.id] = { at: Date.now(), chance: idea.chance, reason: idea.why, model: lastIdeas.model };
      lastIdeas.added.set(idea.name, p.id);
      emit('changed');
      return p;
    }

    function ideasResults() {
      const { ideas, added } = lastIdeas;
      const left = ideas.filter((i) => !added.has(i.name));
      return h('div', [
        h('div.row.between.result-line', [
          h('span', `${ideas.length} أفكار من ${modelName(lastIdeas.model)}`),
          left.length > 1 ? h('button.link', {
            type: 'button',
            onclick: () => { left.forEach(addIdea); toast(`انضافت ${left.length} مشاريع لقائمتك`, 'ok'); render(); },
          }, 'أضف الكل') : null,
        ]),
        h('div.list', ideas.map((i) => {
          const pid = added.get(i.name);
          const t = typeOf(i.type);
          return h('div.card.idea', [
            h('div.row', [
              h('span.pic', i.icon),
              h('div.grow', [
                h('div.card-t', i.name),
                h('div.card-s', `${catOf(i.cat).icon} ${catOf(i.cat).name} · ${t.icon} ${t.name} · رأس مال ${capOf(i.cap)?.name || '—'}`),
              ]),
              i.chance !== null ? h('span.sp.ai', `🤖 ${i.chance}%`) : null,
            ]),
            i.desc ? h('p.idea-d', i.desc) : null,
            i.why ? h('p.idea-why', ['💡 ', i.why]) : null,
            pid
              ? h('div.row.between', [
                h('span.added', '✓ انضاف لقائمتك'),
                h('button.link', { type: 'button', onclick: () => openProjectStudy(pid) }, 'ادرسه ‹'),
              ])
              : h('button.btn.block', { type: 'button', onclick: () => { addIdea(i); haptic(); toast('انضاف لقائمتك', 'ok'); render(); } }, '＋ أضفه لقائمتي'),
          ]);
        })),
      ]);
    }

    /* ── تقييم الاحتمالات ── */

    function scoresView() {
      const cats = allCats().filter((c) => allProjects().some((p) => p.cat === c.id));
      const runCats = async (ids) => {
        if (!hasKey()) { openAiSettings({ onDone: render }); return; }
        const ctrl = new AbortController();
        scoreJob = { ctrl, label: '' };
        scoreErr = null;
        let done = 0;
        try {
          for (let i = 0; i < ids.length; i++) {
            scoreJob.label = ids.length > 1 ? `قسم ${i + 1} من ${ids.length}: ${catOf(ids[i]).name}` : catOf(ids[i]).name;
            render();
            try {
              done += await scoreCategory(ids[i], { signal: ctrl.signal });
            } catch (err) {
              if (err?.name === 'AbortError' || isFatal(err) || ids.length === 1) throw err;
              scoreErr = err; // قسم واحد فشل: نكمل الباقي
            }
            // نبقى تحت حد 20 طلب بالدقيقة
            if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 3500));
            if (ctrl.signal.aborted) break;
          }
          if (done) { toast(`تقيّم ${done} مشروع 🎲`, 'ok'); haptic(18); }
        } catch (err) {
          if (err?.name !== 'AbortError') scoreErr = err;
        } finally {
          scoreJob = null;
          emit('changed');
          render();
        }
      };

      const scored = allProjects()
        .map((p) => ({ p, c: aiChance(p.id), q: state.ai.quick[p.id] }))
        .filter((x) => x.c !== null);
      const inCat = scored.filter((x) => x.p.cat === scoreCat).sort((a, b) => b.c - a.c);
      const top = [...scored].sort((a, b) => b.c - a.c).slice(0, 10);

      const row = ({ p, c, q }) => h('button.score-row', { type: 'button', onclick: () => openProjectStudy(p.id) }, [
        h('span.pic', p.icon),
        h('span.grow', [h('span.pt', p.name), q?.reason ? h('span.ps', q.reason) : null]),
        h('span.sp.ai' + (c >= 65 ? '.hi' : c < 40 ? '.lo' : ''), `${c}%`),
      ]);

      return h('div', [
        h('div.card', [
          h('div.card-t', 'قيّم احتمال نجاح كل مشروع'),
          h('div.card-s', 'الذكاء ينطي كل مشروع بالقسم نسبة نجاح تقريبية وسبب مختصر، وتبين بالقائمة جنب المشروع (🤖 70%). للتحليل الكامل افتح المشروع ← تبويب «تحليل».'),
          h('div.flabel', 'القسم'),
          chipGroup(cats.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })), scoreCat, (v) => { scoreCat = v; render(); }, { scroll: true }),
          h('div.grid2.mt', [
            h('button.btn.primary', { type: 'button', disabled: !!scoreJob, onclick: () => runCats([scoreCat]) }, '🎲 قيّم هذا القسم'),
            h('button.btn', {
              type: 'button', disabled: !!scoreJob,
              onclick: async () => {
                if (!await confirmSheet('قيّم كل الأقسام', `راح يرسل ${cats.length} طلب تقريبًا من حصتك اليومية (الحساب المجاني 50 طلب باليوم)، وياخذ كم دقيقة.`, { okText: 'يلا', danger: false })) return;
                runCats(cats.map((c) => c.id));
              },
            }, '🌍 كل الأقسام'),
          ]),
        ]),
        scoreJob ? loading(`🎲 دا يقيّم… ${scoreJob.label}`, () => scoreJob?.ctrl.abort()) : null,
        scoreErr ? errorCard(scoreErr, () => runCats([scoreCat])) : null,
        inCat.length ? h('h2.sec', `${catOf(scoreCat).icon} ${catOf(scoreCat).name} — حسب الاحتمال`) : null,
        inCat.length ? h('div.list', inCat.map(row)) : (!scoreJob ? empty('🎲', 'بعد ما تقيّم هذا القسم. اضغط «قيّم هذا القسم».') : null),
        top.length ? h('h2.sec', '🏆 الأعلى احتمالًا بكل القائمة') : null,
        top.length ? h('div.list', top.map(row)) : null,
      ]);
    }

    render();
  }, { onClose });
}

/** يفتح دراسة مشروع (استيراد متأخر حتى ما يصير استيراد دائري ويا صفحة الدراسة). */
async function openProjectStudy(id) {
  const { openStudy } = await import('./study.js');
  openStudy({ kind: 'project', id }, { tab: 'study' });
}
