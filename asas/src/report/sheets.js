/** أوراق التحرير: تحرير قسم (يدويًا أو بالذكاء الاصطناعي)، اختيار الصور، وبيانات الغلاف. */

import { h, fill, field, toggle, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { sheet, toast, confirmSheet } from '../core/ui.js';
import { aiReady, state, uid } from '../core/store.js';
import { putReport, deleteImages } from '../core/db.js';
import { SYSTEM, EDIT_ACTIONS, editPrompt } from '../ai/prompts.js';
import { streamText, aiErrorMessage, isTransientError } from '../ai/client.js';
import { holdAwake, retryTransient } from '../core/keepalive.js';
import { parseBlocks, wordsOf } from './md.js';
import { blocksToNodes } from './render.js';
import { coverPicker, hasCover, peopleFields, logosRow, coverDesign } from './covers.js';
import { formatControls } from './format.js';
import { findCandidates, verifyLoadable, storeCandidate, storeLocalFile } from '../images/pipeline.js';

/** يزيل عنوان القسم إن كرّره النموذج في بداية الرد. */
function cleanSection(text, heading) {
  return String(text || '')
    .replace(/^\s*##\s+.*\n+/, (m) => (m.includes(heading.slice(0, 6)) ? '' : m))
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/, '$1')
    .trim();
}

/* ── تحرير قسم ─────────────────────────────────── */

export function openSectionEditor(report, i, onSaved) {
  const sec = report.sections[i];
  const original = sec.md;
  let ctrl = null;

  const headIn = h('input', { value: sec.h });
  const ta = h('textarea', { value: sec.md, rows: 12, oninput: () => renderPreview() });
  const preview = h('div.preview-box.paper', { style: { margin: '0', padding: '6px 12px' } });
  const status = h('div.row', { style: { minHeight: '28px' } });
  const customIn = h('input', { placeholder: 'أو اكتب طلبك: مثلًا «أضف مثالًا محلولًا»' });

  function renderPreview() {
    fill(preview, h('div.rsec', blocksToNodes(parseBlocks(ta.value))));
  }

  async function runAI(instruction) {
    if (!aiReady()) { toast('فعّل الذكاء الاصطناعي من الإعدادات أولًا', 'err'); return; }
    ctrl?.abort();
    ctrl = new AbortController();
    const before = ta.value;
    setBusy(true);
    const awake = holdAwake('يحرّر القسم…');
    try {
      const res = await retryTransient(() => streamText({
        system: SYSTEM,
        prompt: editPrompt({
          title: report.title, typeId: report.typeId, sectionTitle: headIn.value.trim() || sec.h,
          md: before, otherHeadings: report.sections.map((s) => s.h).filter(Boolean), instruction, options: report.options,
        }),
        effort: state.ai.effort === 'high' ? 'medium' : state.ai.effort,
        maxTokens: 32000,
        signal: ctrl.signal,
        meta: { kind: 'edit', report: report.id, title: report.title },
        onText: (snap) => { ta.value = cleanSection(snap, sec.h); renderPreview(); },
        onPhase: (p) => fill(status, [h('div.spinner'), h('span.muted', p === 'thinking' ? 'يفكّر…' : 'يكتب…')]),
      }), {
        signal: ctrl.signal,
        tries: 3,
        isTransient: isTransientError,
        onRetry: () => fill(status, [h('div.spinner'), h('span.muted', 'انقطع الاتصال — يعيد المحاولة تلقائيًا…')]),
      });
      ta.value = cleanSection(res.text, sec.h);
      renderPreview();
      report.usage.cost = (report.usage.cost || 0) + (res.cost || 0);
      fill(status, [icon('check', 16), h('span.muted', 'تم — راجع النص ثم احفظ، أو تراجع.')]);
    } catch (err) {
      ta.value = before;
      renderPreview();
      fill(status, [icon('alert', 16), h('span.muted', aiErrorMessage(err))]);
    } finally {
      awake.release();
      setBusy(false);
    }
  }

  const actionBtns = EDIT_ACTIONS.map((a) => h('button.chip', { type: 'button', onclick: () => runAI(a.text) }, a.label));
  const goCustom = h('button.btn.sm', { type: 'button', onclick: () => { const v = customIn.value.trim(); if (v) runAI(v); } }, [icon('sparkles', 15), 'نفّذ']);
  const stopBtn = h('button.btn.sm.danger', { type: 'button', style: { display: 'none' }, onclick: () => ctrl?.abort() }, [icon('stop', 15), 'إيقاف']);

  function setBusy(b) {
    [...actionBtns, goCustom].forEach((x) => { x.disabled = b; });
    ta.disabled = b;
    stopBtn.style.display = b ? '' : 'none';
    if (!b && !status.textContent) fill(status, []);
  }

  const s = sheet('تحرير القسم', ({ close }) => h('div.editor', [
    field('عنوان القسم', headIn),
    aiReady()
      ? h('div', [h('div.muted', 'تحسين بالذكاء الاصطناعي:'), h('div.ai-actions', actionBtns), h('div.row', [customIn, goCustom, stopBtn])])
      : h('p.hint', 'فعّل الذكاء الاصطناعي من الإعدادات لإعادة صياغة القسم أو توسيعه أو اختصاره تلقائيًا.'),
    status,
    field('النص (يدعم: ### عنوان فرعي، 1. خطوة، - نقطة، جداول |...|، و[قيمة تحتاج تعديلًا])', ta),
    h('details.more-opts', { open: true }, [h('summary', [icon('eye', 18), 'معاينة']), preview]),
    h('div.grid2.mt', [
      h('button.btn.ghost', { type: 'button', onclick: () => { ta.value = original; renderPreview(); } }, [icon('refresh', 16), 'تراجع للأصل']),
      h('button.btn.primary', {
        type: 'button',
        onclick: async () => {
          sec.h = headIn.value.trim() || sec.h;
          sec.md = ta.value.trim();
          report.words = wordsOf(report.sections);
          await putReport(report);
          ctrl?.abort();
          close();
          onSaved?.();
          toast('حُفظ القسم', 'ok');
        },
      }, [icon('check', 16), 'حفظ']),
    ]),
  ]), { full: true, onClose: () => ctrl?.abort() });
  renderPreview();
  return s;
}

/* ── اختيار صورة ───────────────────────────────── */

export function openImagePicker(report, fig, onChanged) {
  let ctrl = null;
  const isAr = (s) => /[\u0600-\u06FF]/.test(s);
  const captionIn = h('input', { value: fig.caption || '' });
  const qIn = h('input', { value: fig.queries?.[0] || '', placeholder: 'عبارة بحث (يفضّل بالإنجليزية)', onkeydown: (e) => { if (e.key === 'Enter') search(); } });
  const grid = h('div.cands');
  const status = h('div.row.mt', { style: { minHeight: '24px' } });
  const fileIn = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: () => fromDevice() });

  function tile(c, src) {
    const img = h('img', { alt: c.title || '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    const el = h('button.cand', { type: 'button', title: [c.title, c.source].filter(Boolean).join(' — '), onclick: () => pick(c, el) }, img);
    img.onerror = () => el.remove(); // لا صور مكسورة: ما يفشل تحميله يختفي
    img.src = src;
    return el;
  }

  function showList(list, fromBlobs) {
    fill(grid, list.map((c) => tile(c, fromBlobs && c.thumbBlob ? URL.createObjectURL(c.thumbBlob) : c.thumb)));
    if (!list.length) fill(status, [icon('info', 16), h('span.muted', 'لا نتائج سليمة. جرّب عبارة أخرى (بالإنجليزية غالبًا أدق).')]);
  }

  async function search() {
    const q = qIn.value.trim();
    if (!q) return;
    ctrl?.abort();
    ctrl = new AbortController();
    fill(status, [h('div.spinner'), h('span.muted', 'يبحث ويتحقق من الصور…')]);
    fill(grid, []);
    try {
      const cands = await findCandidates({ queries: [q], arQuery: isAr(q) ? q : '', sources: { ...state.images.sources, openverse: true }, signal: ctrl.signal, max: 12 });
      const ok = await verifyLoadable(cands, { signal: ctrl.signal, need: 9 });
      fill(status, ok.length ? [icon('check', 16), h('span.muted', `${ok.length} صورة سليمة — اختر واحدة`)] : []);
      showList(ok, true);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      fill(status, [icon('alert', 16), h('span.muted', 'تعذّر البحث — تحقق من اتصالك بالإنترنت.')]);
    }
  }

  async function setImage(saved, credit) {
    const old = fig.img;
    Object.assign(fig, { img: saved.id, w: saved.w, h: saved.h, status: 'ok', note: '', credit, caption: captionIn.value.trim() || fig.caption });
    if (!report.figures.includes(fig)) report.figures.push(fig);
    await putReport(report);
    if (old && old !== saved.id) deleteImages([old]).catch(() => {});
    onChanged?.();
    s.close();
    toast('تم وضع الصورة', 'ok');
  }

  async function pick(c, el) {
    el.append(h('div.busy', h('div.spinner')));
    try {
      const saved = await storeCandidate(c);
      fig.cands = (fig.cands || []).filter((x) => x.display !== c.display).slice(0, 8);
      await setImage(saved, { source: c.source, author: c.author, license: c.license, page: c.page });
    } catch {
      el.remove();
      toast('تعذّر تنزيل هذه الصورة، اختر غيرها', 'err');
    }
  }

  async function fromDevice() {
    const f = fileIn.files?.[0];
    if (!f) return;
    try {
      const saved = await storeLocalFile(f);
      await setImage(saved, { source: 'صورة من جهاز المستخدم' });
    } catch (err) {
      toast(err.message || 'تعذّر قراءة الصورة', 'err');
    }
  }

  const s = sheet(fig.img ? 'استبدال الصورة' : 'اختيار صورة', () => h('div', [
    field('تعليق الصورة', captionIn),
    h('div.row', [qIn, h('button.btn.primary', { type: 'button', onclick: search }, [icon('search', 16), 'بحث'])]),
    status,
    grid,
    h('div.grid2.mt', [
      h('button.btn', { type: 'button', onclick: () => fileIn.click() }, [icon('upload', 16), 'من جهازك']),
      fig.img ? h('button.btn.danger', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmSheet('حذف الصورة', 'تُحذف الصورة من التقرير.'))) return;
          await removeFigure(report, fig);
          onChanged?.();
          s.close();
        },
      }, [icon('trash', 16), 'حذف']) : h('div'),
    ]),
    fileIn,
    h('p.hint', 'كل صورة تُنزَّل ويُتحقق من سلامتها قبل عرضها، وتُحفظ في جهازك مع مصدرها ورخصتها.'),
  ]), { full: true, onClose: () => ctrl?.abort() });

  if (fig.cands?.length) {
    fill(status, [icon('image', 16), h('span.muted', 'مرشحات سابقة — أو ابحث من جديد')]);
    showList(fig.cands.slice(0, 9), false);
  } else if (qIn.value) {
    search();
  }
  return s;
}

export async function removeFigure(report, fig) {
  report.figures = report.figures.filter((f) => f.id !== fig.id);
  if (fig.img) await deleteImages([fig.img]).catch(() => {});
  await putReport(report);
}

/** إضافة صورة جديدة لقسم يختاره المستخدم. */
export function openAddFigure(report, onChanged) {
  const select = h('select', report.sections.map((s, i) => h('option', { value: i }, s.h || `القسم ${i + 1}`)));
  const cap = h('input', { placeholder: 'تعليق الصورة', value: report.title });
  const q = h('input', { placeholder: 'عبارة بحث بالإنجليزية (اختياري)' });
  sheet('إضافة صورة', ({ close }) => h('div', [
    field('القسم', select),
    field('التعليق', cap),
    field('البحث', q, 'اتركه فارغًا لتختار صورة من جهازك'),
    h('button.btn.primary.block.mt', {
      type: 'button',
      onclick: () => {
        const i = Number(select.value);
        const fig = { id: uid('fig_'), sec: i, secTitle: report.sections[i]?.h || '', caption: cap.value.trim() || report.title, queries: q.value.trim() ? [q.value.trim()] : [], mustShow: '', img: null, cands: [], status: 'none', note: '' };
        close();
        setTimeout(() => openImagePicker(report, fig, onChanged), 200);
      },
    }, 'متابعة'),
  ]));
}

/* ── بيانات الغلاف ─────────────────────────────── */

export function openCoverEditor(report, onSaved) {
  const m = { coverStyle: 'classic', ...report.meta };
  let coverOn = hasCover(report, state.exportOpts.cover !== false);
  const titleIn = h('textarea', { rows: 2, value: report.title });
  const inp = (k, label, ph = '') => field(label, h('input', { value: m[k] || '', placeholder: ph, oninput: (e) => { m[k] = e.target.value; } }));
  const labLike = ['lab', 'field'].includes(report.typeId);
  const coverBox = h('div');
  const preview = () => ({ ...report, title: titleIn.value.trim() || report.title, meta: { ...m }, options: { ...report.options, cover: true } });
  function renderCoverBox() {
    const picker = coverOn ? coverPicker(preview, m.coverStyle, (v) => { m.coverStyle = v; }) : null;
    fill(coverBox, [
      settingRow('صفحة غلاف', coverOn ? 'غلاف بالنمط المختار' : 'التقرير يبدأ بالعنوان مباشرة', toggle(coverOn, (v) => { coverOn = v; renderCoverBox(); })),
      coverOn ? field('نمط الغلاف', picker) : null,
      coverOn ? coverDesign(m, () => picker.refresh()) : null,
      coverOn ? logosRow(m, renderCoverBox, () => toast('تعذّرت قراءة الصورة', 'err')) : null,
    ]);
  }
  renderCoverBox();
  sheet('العنوان وبيانات الغلاف', ({ close }) => h('div', [
    field('العنوان', titleIn),
    coverBox,
    h('div.grid2', [inp('university', 'الجامعة'), inp('college', 'الكلية')]),
    h('div.grid2', [inp('department', 'القسم'), inp('subject', 'المادة')]),
    h('div.grid2', [inp('stage', 'المرحلة'), inp('group', 'الشعبة / المجموعة')]),
    h('div.grid2', [inp('expNo', 'رقم التجربة'), inp('author', 'اسم الطالب')]),
    h('div.grid2', [inp('supervisor', 'بإشراف'), inp('date', labLike ? 'تاريخ التجربة' : 'التاريخ')]),
    ...peopleFields(m),
    h('div.grid2', [labLike ? inp('submitDate', 'تاريخ التسليم') : inp('org', 'الجهة (للتدريب والزيارة)'), inp('year', 'السنة الدراسية')]),
    h('button.btn.primary.block.mt', {
      type: 'button',
      onclick: async () => {
        report.title = titleIn.value.trim() || report.title;
        report.meta = m;
        report.options = { ...report.options, cover: coverOn };
        await putReport(report);
        close();
        onSaved?.();
      },
    }, [icon('check', 16), 'حفظ']),
  ]), { full: true });
}


/** تنسيق التقرير: الإطار والألوان والعناوين والخط والمسافات والترقيم. يُطبَّق بزر «حفظ التغييرات». */
export function openFormatSheet(report, onChanged) {
  const sh = sheet('التنسيق والشكل', [
    h('p.hint', 'اختر ثم اضغط «حفظ التغييرات» ليُطبَّق على هذا التقرير في العرض وPDF وWord. القيم الافتراضية للتقارير الجديدة من الإعدادات.'),
    formatControls(() => report.format || {}, async (f) => {
      report.format = { ...(report.format || {}), ...f };
      report.updatedAt = Date.now();
      await putReport(report).catch(() => {});
      sh.close();
      onChanged?.();
      toast('طُبّق التنسيق ✓', 'ok');
    }),
  ], { full: true });
}
