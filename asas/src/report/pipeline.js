/**
 * خط إنتاج التقرير: كتابة النص (ذكاء اصطناعي متدفق أو قاعدة المعرفة دون اتصال)
 * بالتوازي مع تخطيط الصور والبحث عنها والتحقق منها ثم حفظ كل شيء في الجهاز.
 * المهام النشطة محفوظة في الذاكرة حتى تعود الشاشة لمتابعتها لو غادرها المستخدم.
 */

import { state, aiReady, uid, save } from '../core/store.js';
import { putReport } from '../core/db.js';
import { getKB } from '../data/kb/index.js';
import { TOPIC_BY_ID } from '../data/topics.js';
import { getType, sectionsOf } from '../data/types.js';
import { SYSTEM, reportPrompt, figurePrompt, FIGURE_SCHEMA, verifyContent, VERIFY_SCHEMA } from '../ai/prompts.js';
import { streamText, jsonCall, aiErrorMessage, activeModelId, visionLimits, isTransientError } from '../ai/client.js';
import { holdAwake, retryTransient } from '../core/keepalive.js';
import { splitSections, wordsOf, normalizeHeadings } from './md.js';
import { composeOffline, planFiguresOffline } from './compose.js';
import { missingSections } from './model.js';
import { planSections, humanize, isRefsHeading, applyContent } from './style.js';
import { findCandidates, verifyLoadable, storeCandidate, toBase64Jpeg, slimCandidate, pool } from '../images/pipeline.js';

const jobs = new Map();

export const PHASES = [
  { id: 'write', label: 'كتابة التقرير' },
  { id: 'plan', label: 'تخطيط الصور' },
  { id: 'search', label: 'البحث عن الصور وتنزيلها' },
  { id: 'check', label: 'التحقق من مطابقة الصور' },
  { id: 'save', label: 'الحفظ في الجهاز' },
];

export function jobOf(id) { return jobs.get(id) || null; }

export function subscribeJob(job, fn) {
  job.listeners.add(fn);
  return () => job.listeners.delete(fn);
}

function emit(job, type) {
  job.listeners.forEach((fn) => { try { fn(type, job); } catch (err) { console.warn('[pipeline] مستمع فشل', err); } });
}

function setPhase(job, id, status, detail = '') {
  job.phases[id] = { status, detail };
  if (status === 'run') job.awake?.update(detail || `${PHASES.find((p) => p.id === id)?.label || ''}…`);
  emit(job, 'phase');
}

/* ── الاستمرار بعد انقطاع الاتصال ─────────────────── */

const headingsOf = (t) => [...String(t).matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());

/** ما كُتب حتى آخر فقرة كاملة (بلا جدول أو معادلة مقطوعة)، ليُكمَل منه بعد الانقطاع. */
export function keepWritten(text) {
  let t = String(text || '').trimEnd();
  const cut = t.lastIndexOf('\n\n');
  if (cut > t.length * 0.5) t = t.slice(0, cut).trimEnd();
  if ((t.match(/^```/gm) || []).length % 2) t = t.slice(0, t.lastIndexOf('```')).trimEnd();
  return t;
}

/** يصل التكملة بما كُتب: يحذف عنوانًا مكرّرًا للقسم الأخير أو عنوان التقرير إن أعاده النموذج. */
export function joinContinuation(kept, cont) {
  if (!kept) return cont;
  let c = String(cont || '').trimStart().replace(/^#\s+[^\n]*\n+/, '');
  const lastH = headingsOf(kept).pop();
  const m = c.match(/^##\s+(.+)\n*/);
  if (m && lastH && m[1].trim() === lastH) c = c.slice(m[0].length);
  return `${kept.trimEnd()}\n\n${c.trimStart()}`;
}

function continuePrompt(base, kept, en) {
  const heads = headingsOf(kept);
  return `${base}

# تكملة بعد انقطاع الاتصال
انقطع الاتصال أثناء كتابة هذا التقرير. الأقسام التي بدأت كتابتها: ${heads.join('، ') || '—'}.
هذا آخر ما كُتب حرفيًا (لا تُعِده):
<<<
${kept.slice(-3500)}
>>>
أكمل التقرير من بعد هذا النص مباشرة وبنفس اللغة والأسلوب: ابدأ بالفقرة أو القسم التالي، ولا تكرر أي شيء كُتب، ولا تكتب أي تعليق عن الانقطاع.${en ? '\nContinue in English exactly where the text stops; never repeat what was already written.' : ''}`;
}

/**
 * يبدأ توليد تقرير جديد أو إعادة توليده.
 * mode: 'ai' | 'offline'
 */
export function startGeneration(report, mode = 'ai') {
  const job = {
    id: report.id,
    report,
    mode,
    phases: Object.fromEntries(PHASES.map((p) => [p.id, { status: 'wait', detail: '' }])),
    listeners: new Set(),
    ctrl: new AbortController(),
    startedAt: Date.now(),
    done: false,
  };
  jobs.set(report.id, job);
  // يبقى التطبيق يعمل (وشبكته متصلة) لو خرج المستخدم منه أثناء الكتابة
  job.awake = holdAwake(mode === 'images' ? 'يجلب صور التقرير…' : `يكتب «${report.title.slice(0, 40)}»…`);
  job.promise = run(job)
    .catch((err) => {
      const r = job.report;
      settleFigures(r);
      if (job.mode === 'images') {
        // فشل جلب الصور لا يمسّ النص: يبقى التقرير جاهزًا
        r.status = 'ready';
        if (!job.ctrl.signal.aborted) r.notes = [...(r.notes || []), 'تعذّر جلب الصور الآن — تحقق من الاتصال ثم أعد المحاولة.'];
        return putReport(r);
      }
      r.error = job.ctrl.signal.aborted ? 'أُلغي التوليد.' : aiErrorMessage(err);
      r.status = r.sections.some((s) => s.md.trim()) ? 'partial' : 'error';
      job.ctrl.abort(); // نوقف جلب الصور الجاري لتقرير لم يكتمل
      return putReport(r);
    })
    .finally(() => {
      const st = job.report.status;
      job.awake.release(st === 'ready' ? `التقرير جاهز ✓ — ${job.report.title.slice(0, 50)}` : job.ctrl.signal.aborted ? '' : 'توقف التقرير — افتح التطبيق للمتابعة');
      job.done = true;
      jobs.delete(report.id);
      emit(job, 'done');
    });
  return job;
}

export function cancelJob(id) {
  jobs.get(id)?.ctrl.abort();
}

async function run(job) {
  if (job.mode === 'images') return runImagesOnly(job);
  const r = job.report;
  const signal = job.ctrl.signal;
  const kb = getKB(r.topicId);
  const topic = r.topicId ? TOPIC_BY_ID[r.topicId] : null;
  const useAI = job.mode === 'ai' && aiReady();

  r.status = 'generating';
  r.error = '';
  r.notes = [];
  r.source = useAI ? 'ai' : 'offline';
  // دون اتصال: المحتوى عربي بأقسام النوع، فتُسجَّل الخيارات الفعلية قبل تخطيط الصور
  const offNotes = [];
  if (!useAI && r.options.lang === 'en') { r.options.lang = 'mix'; offNotes.push('النسخة دون اتصال بالعربية فقط؛ للتقرير بالإنجليزية أنشئه بالذكاء الاصطناعي.'); }
  if (!useAI && r.options.structure === 'free') { r.options.structure = 'fixed'; offNotes.push('العناوين حسب الموضوع تحتاج الذكاء الاصطناعي؛ استُعملت أقسام النوع المعتمدة.'); }
  /** تنظيف الكتابة ثم خيارات المحتوى (بلا نقاط، بلا جداول) على كل الأقسام عدا المصادر. */
  const finish = (secs) => secs.map((s) => {
    if (isRefsHeading(s.h)) return s;
    let md = r.options.human !== false ? humanize(s.md, r.options) : s.md;
    md = applyContent(md, r.options);
    return { ...s, md };
  });
  r.model = useAI ? activeModelId() : null;
  await putReport(r);

  let lastSave = 0;
  const saveSoon = () => {
    const now = Date.now();
    if (now - lastSave > 2500) { lastSave = now; putReport(r).catch(() => {}); }
  };

  // ── الصور تعمل بالتوازي مع الكتابة ──
  const wantImages = state.images.enabled && r.options.images > 0;
  const imagesFlow = wantImages
    ? planFigures(job, { useAI, kb, topic, signal }).then((figs) => runImages(job, figs, { useAI, signal }))
    : Promise.resolve().then(() => { ['plan', 'search', 'check'].forEach((p) => setPhase(job, p, 'skip')); });
  imagesFlow.catch(() => {}); // يُعالَج لاحقًا؛ هذا يمنع «وعد مرفوض» إن فشلت الكتابة أولًا

  // ── الكتابة ──
  setPhase(job, 'write', 'run', useAI ? 'يتصل بالذكاء الاصطناعي…' : 'يبني التقرير من قاعدة المعرفة…');
  if (useAI) {
    const titles = (planSections(r.typeId, r.catId, r.options) || []).map((s) => s.h);
    let pending = null;
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (pending === null) return;
      r.sections = splitSections(normalizeHeadings(pending, titles));
      r.words = wordsOf(r.sections);
      pending = null;
      emit(job, 'text');
      saveSoon();
    };
    const basePrompt = reportPrompt({ title: r.title, typeId: r.typeId, cat: r.catId, options: r.options, details: r.options.details, readings: r.options.readings || '', kb, meta: r.meta });
    // إن انقطع الاتصال (خروج من التطبيق أو شبكة ضعيفة) نحتفظ بما كُتب ونكمل منه تلقائيًا بعد عودة الاتصال
    let kept = '';
    let last = '';
    const res = await retryTransient(async () => {
      const out = await streamText({
        system: SYSTEM,
        prompt: kept ? continuePrompt(basePrompt, kept, r.options.lang === 'en') : basePrompt,
        effort: state.ai.effort,
        maxTokens: 64000,
        signal,
        onText: (snap) => {
          last = joinContinuation(kept, snap);
          pending = last;
          if (!raf) raf = setTimeout(flush, 120);
        },
        onPhase: (p) => setPhase(job, 'write', 'run', p === 'thinking' ? (kept ? 'يكمل من حيث توقف…' : 'يفكّر ويخطط للتقرير…') : p === 'fallback' ? 'تحويل الطلب إلى نموذج بديل…' : 'يكتب التقرير…'),
      });
      return { ...out, text: joinContinuation(kept, out.text) };
    }, {
      signal,
      tries: 4,
      isTransient: isTransientError,
      onRetry: ({ background }) => {
        const k = keepWritten(last.length > kept.length ? last : kept);
        kept = k.length >= 400 ? k : '';
        r.retries = (r.retries || 0) + 1;
        setPhase(job, 'write', 'run', background
          ? 'انقطع الاتصال أثناء خروجك من التطبيق — سيكمل تلقائيًا من حيث توقف'
          : 'انقطع الاتصال — يعيد المحاولة ويكمل من حيث توقف…');
      },
    });
    clearTimeout(raf);
    r.sections = splitSections(normalizeHeadings(res.text, titles));
    r.sections = finish(r.sections);
    r.words = wordsOf(r.sections);
    r.usage.cost = (r.usage.cost || 0) + (res.cost || 0);
    r.usage.output = (r.usage.output || 0) + (res.usage?.output_tokens || 0);
    if (res.model) r.model = res.model;
    if (res.stopReason === 'max_tokens') r.notes.push('توقف التوليد عند الحد الأقصى للطول، وقد يكون القسم الأخير ناقصًا. يمكنك إعادة توليد القسم من أدوات التحرير.');
    const miss = missingSections(r);
    if (miss.length) r.notes.push(`أقسام لم تظهر بعنوانها المتوقع: ${miss.join('، ')}`);
    emit(job, 'text');
    setPhase(job, 'write', 'done', `${r.words} كلمة`);
  } else {
    const { sections, coverage } = composeOffline({ title: r.title, typeId: r.typeId, cat: r.catId, kb, meta: r.meta, variant: r.options.variant || 0 });
    r.sections = finish(sections);
    r.notes.push(...offNotes);
    r.words = wordsOf(sections);
    if (coverage < 0.6) r.notes.push('هذه نسخة دون اتصال: بعض الأقسام قالب بإرشادات بين أقواس معقوفة لتكملها، أو فعّل الذكاء الاصطناعي لكتابة التقرير كاملًا.');
    emit(job, 'text');
    setPhase(job, 'write', 'done', kb ? 'من قاعدة المعرفة' : 'قالب منظّم');
  }
  await putReport(r);

  // ── انتظار الصور ثم الحفظ ──
  await imagesFlow.catch((err) => {
    if (signal.aborted) throw err;
    console.warn('[pipeline] الصور', err);
    setPhase(job, 'search', 'error', 'تعذّر جلب الصور — يمكنك إعادة المحاولة لاحقًا');
  });
  setPhase(job, 'save', 'run');
  r.status = 'ready';
  r.words = wordsOf(r.sections);
  await putReport(r);
  if (useAI) { state.ai.usage.reports += 1; save(); }
  setPhase(job, 'save', 'done');
}

/** يحدد الصور المطلوبة: من الذكاء الاصطناعي أو من قاعدة المعرفة. */
async function planFigures(job, { useAI, kb, topic, signal, count: wanted = null }) {
  const r = job.report;
  const count = Math.max(0, Math.min(6, wanted ?? r.options.images));
  // عناوين الأقسام كما ستُكتب (بلغة التقرير وصيغته) حتى تُطابَق الصور بأقسامها
  const secs = planSections(r.typeId, r.catId, r.options) || sectionsOf(getType(r.typeId), r.catId);
  setPhase(job, 'plan', 'run');
  let figs = [];
  if (useAI) {
    try {
      const res = await retryTransient(() => jsonCall({
        system: SYSTEM,
        prompt: figurePrompt({ title: r.title, typeId: r.typeId, cat: r.catId, count, kb, lang: r.options.lang }),
        schema: FIGURE_SCHEMA,
        effort: 'low',
        signal,
      }), { signal, tries: 2, isTransient: isTransientError });
      figs = (res.figures || []).slice(0, count).map((f) => ({
        sec: Math.max(0, Math.min(secs.length - 1, f.section | 0)),
        secTitle: secs[Math.max(0, Math.min(secs.length - 1, f.section | 0))].h,
        caption: String(f.caption_ar || r.title).trim(),
        queries: (f.queries_en || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3),
        mustShow: f.must_show || '',
      })).filter((f) => f.queries.length);
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn('[pipeline] تخطيط الصور بالذكاء الاصطناعي فشل', err);
    }
  }
  if (!figs.length) {
    figs = planFiguresOffline({ typeId: r.typeId, cat: r.catId, count, kb, topic, title: r.title })
      .map((f) => ({ ...f, secTitle: secs[f.sec]?.h || '' }));
    if (!figs.length) {
      // عنوان مخصّص دون قاعدة معرفة ولا ذكاء: نبحث بالعنوان نفسه
      figs = [{ sec: 0, secTitle: secs[0].h, caption: r.title, queries: [r.imgHint, r.title].filter(Boolean), mustShow: '' }];
    }
  }
  setPhase(job, 'plan', 'done', `${figs.length} صورة`);
  return figs;
}

async function runImages(job, figs, { useAI, signal, append = false }) {
  const r = job.report;
  const sources = state.images.sources;
  const targets = figs.map((f) => (f.id
    ? Object.assign(f, { status: 'pending', note: '' })
    : { id: uid('fig_'), ...f, img: null, cands: [], status: 'pending', note: '' }));
  r.figures = append ? [...r.figures.filter((f) => !targets.includes(f)), ...targets] : targets;
  emit(job, 'figures');

  setPhase(job, 'search', 'run', 'يبحث في ويكيبيديا وويكيميديا كومنز…');
  const working = new Map();
  await pool(targets, 2, async (fig) => {
    fig.status = 'searching';
    emit(job, 'figures');
    try {
      const cands = await retryTransient(
        () => findCandidates({ queries: fig.queries, arQuery: /[\u0600-\u06FF]/.test(fig.caption) ? fig.caption : '', sources, signal }),
        { signal, tries: 2, isTransient: (e) => e?.name !== 'AbortError' },
      );
      const ok = await verifyLoadable(cands, { signal, need: 4 });
      working.set(fig.id, ok);
      if (!ok.length) { fig.status = 'none'; fig.note = 'لم نجد صورة سليمة مطابقة'; }
    } catch {
      fig.status = 'none';
      fig.note = 'تعذّر الوصول إلى مصادر الصور';
    }
    emit(job, 'figures');
  });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const found = targets.filter((f) => working.get(f.id)?.length);
  setPhase(job, 'search', 'done', `${found.length} من ${targets.length}`);

  // الاختيار: الذكاء الاصطناعي يرى المرشحين ويحكم، وإلا فالترتيب التلقائي
  const choice = new Map(found.map((f) => [f.id, 0]));
  if (useAI && state.ai.verifyImages && found.length) {
    setPhase(job, 'check', 'run', 'الذكاء الاصطناعي يراجع الصور بصريًا…');
    // النماذج المجانية تقبل صورًا أقل في الطلب الواحد، فتُراجَع الصور على دفعات
    const { candsPerFig, figsPerCall } = visionLimits();
    try {
      let rejected = 0;
      for (let i = 0; i < found.length; i += figsPerCall) {
        const batch = found.slice(i, i + figsPerCall);
        const payload = await Promise.all(batch.map(async (f) => ({
          caption: f.caption,
          mustShow: f.mustShow,
          cands: await Promise.all(working.get(f.id).slice(0, candsPerFig).map(async (c) => ({ b64: await toBase64Jpeg(c.thumbBlob) }))),
        })));
        const res = await retryTransient(() => jsonCall({ system: SYSTEM, content: verifyContent(r.title, payload), schema: VERIFY_SCHEMA, effort: 'low', signal }), { signal, tries: 2, isTransient: isTransientError });
        for (const ch of res.choices || []) {
          const f = batch[ch.figure];
          if (!f) continue;
          const n = working.get(f.id).slice(0, candsPerFig).length;
          if (ch.best >= 0 && ch.best < n) choice.set(f.id, ch.best);
          else { choice.set(f.id, -1); rejected++; f.status = 'none'; f.note = ch.reason || 'لا يوجد مرشح مطابق للموضوع'; }
        }
      }
      setPhase(job, 'check', 'done', rejected ? `استُبعدت ${rejected} صورة غير مطابقة` : 'كل الصور مطابقة');
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn('[pipeline] التحقق البصري فشل', err);
      setPhase(job, 'check', 'error', 'تعذّر التحقق الذكي — اعتُمد الترتيب التلقائي');
    }
  } else {
    setPhase(job, 'check', 'skip', useAI ? 'التحقق الذكي معطّل' : 'يحتاج الذكاء الاصطناعي');
  }

  // التخزين في الجهاز مع بديل إن فشل تنزيل المختار
  await pool(found, 2, async (f) => {
    const list = working.get(f.id);
    const idx = choice.get(f.id);
    f.cands = list.map(slimCandidate);
    if (idx < 0) { emit(job, 'figures'); return; }
    const order = [list[idx], ...list.filter((_, i) => i !== idx)];
    for (const c of order) {
      try {
        const saved = await storeCandidate(c, { signal });
        Object.assign(f, { img: saved.id, w: saved.w, h: saved.h, status: 'ok', note: '', credit: { source: c.source, author: c.author, license: c.license, page: c.page } });
        break;
      } catch (err) {
        if (signal.aborted) throw err;
      }
    }
    if (!f.img) { f.status = 'none'; f.note = 'تعذّر تنزيل الصورة'; }
    emit(job, 'figures');
  });
  settleFigures(r);
  emit(job, 'figures');
  await putReport(r);
}

/** لا تبقى صورة «قيد البحث» إلى الأبد: ما لم يكتمل يُعلَّم بلا صورة. */
export function settleFigures(r) {
  (r.figures || []).forEach((f) => {
    if (!f.img && (f.status === 'pending' || f.status === 'searching')) {
      f.status = 'none';
      f.note = f.note || 'لم يكتمل البحث عن الصورة';
    }
  });
}

/** إعادة البحث عن الصور الناقصة فقط دون المساس بالنص. */
async function runImagesOnly(job) {
  const r = job.report;
  const signal = job.ctrl.signal;
  const useAI = aiReady();
  // النص لا يتغيّر، فيبقى التقرير «جاهزًا» حتى لو أُغلق التطبيق أثناء جلب الصور
  setPhase(job, 'write', 'skip', 'النص محفوظ كما هو');
  let targets = r.figures.filter((f) => !f.img);
  if (!targets.length) {
    const kb = getKB(r.topicId);
    const topic = r.topicId ? TOPIC_BY_ID[r.topicId] : null;
    targets = await planFigures(job, { useAI, kb, topic, signal, count: r.options.images || getType(r.typeId).figures });
  } else {
    setPhase(job, 'plan', 'skip', 'مواضع الصور محددة مسبقًا');
  }
  await runImages(job, targets, { useAI, signal, append: true });
  r.status = 'ready';
  setPhase(job, 'save', 'run');
  await putReport(r);
  setPhase(job, 'save', 'done');
}
