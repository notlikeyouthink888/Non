/**
 * عرض التقرير: متابعة الإنشاء مباشرة، التحرير، الصور، والتصدير إلى Word وPDF والمشاركة.
 */

import { h, fill, empty } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { replace } from '../core/nav.js';
import { aiReady, uid } from '../core/store.js';
import { modelLabel, aiShortLabel } from '../ai/client.js';
import { getReport, putReport, deleteReport, deleteImages, imageIdsOf } from '../core/db.js';
import { toast, actionSheet, confirmSheet } from '../core/ui.js';
import { fmtDate, fmtNum, fmtUSD, safeFileName } from '../core/fmt.js';
import { shareFile, saveFile, printPage, isNative } from '../core/native.js';
import { loadMath } from '../core/math.js';
import { getType } from '../data/types.js';
import { bidi } from '../core/arabic.js';
import { jobOf, subscribeJob, startGeneration, cancelJob, settleFigures, PHASES } from '../report/pipeline.js';
import { renderCover, renderToc, renderSection } from '../report/render.js';
import { figureNumbers, figuresOf } from '../report/model.js';
import { openSectionEditor, openImagePicker, openCoverEditor, openAddFigure, removeFigure } from '../report/sheets.js';
import { toPlainText } from '../export/text.js';
import { topbar } from './common.js';

export default {
  mount(root, { params }) {
    const id = params[0];
    let report = null;
    let job = null;
    let unsub = null;
    let timer = null;
    let secEls = [];
    let secSig = [];

    const titleEl = h('div.t', 'التقرير');
    const moreBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'خيارات', onclick: () => more() }, icon('more', 22));
    const top = topbar('', [moreBtn]);
    top.querySelector('.t').replaceWith(titleEl);

    const genPanel = h('div.card.gen-panel.no-print', { style: { display: 'none' } });
    const notices = h('div.no-print');
    const paper = h('article.paper');
    const footer = h('div.muted.no-print', { style: { textAlign: 'center', padding: '6px 0 20px', lineHeight: '1.9' } });
    const btnWord = h('button.btn.primary', { type: 'button', onclick: () => exportWord() }, [icon('word', 18), 'Word']);
    const btnPdf = h('button.btn', { type: 'button', onclick: () => exportPdf() }, [icon('pdf', 18), 'PDF']);
    const btnShare = h('button.btn', { type: 'button', onclick: () => shareMenu() }, [icon('share', 18), 'مشاركة']);
    const dock = h('div.dock.no-print', h('div.wrap', [btnWord, btnPdf, btnShare]));

    root.append(top, h('div.wrap', [genPanel, notices, paper, footer]), dock);

    const handlers = {
      onEdit: (i) => openSectionEditor(report, i, () => renderAll()),
      onReplace: (fig) => openImagePicker(report, fig, () => renderAll()),
      onSearch: (fig) => openImagePicker(report, fig, () => renderAll()),
      onRemove: async (fig) => {
        if (!(await confirmSheet('حذف الصورة', `حذف «${fig.caption}» من التقرير؟`))) return;
        await removeFigure(report, fig);
        renderAll();
      },
    };

    load();

    async function load() {
      job = jobOf(id);
      report = job ? job.report : await getReport(id);
      if (!report) {
        fill(paper, empty('📄', 'التقرير غير موجود — ربما حُذف.', h('button.btn.primary', { type: 'button', onclick: () => replace('/library') }, 'تقاريري')));
        dock.remove();
        return;
      }
      if (!job && report.status === 'generating') {
        report.status = 'partial';
        report.error = 'توقف إنشاء التقرير قبل اكتماله (ربما أُغلق التطبيق). يمكنك إعادة إنشائه من القائمة.';
        settleFigures(report);
        await putReport(report);
      } else if (!job && report.figures?.some((f) => f.status === 'pending' || f.status === 'searching')) {
        settleFigures(report);
        await putReport(report);
      }
      if (job) attach(job);
      renderAll();
    }

    function attach(j) {
      unsub?.();
      job = j;
      unsub = subscribeJob(j, (type) => {
        if (type === 'text' || type === 'figures') renderSections();
        else if (type === 'phase') renderGen();
        else if (type === 'done') {
          unsub?.();
          job = null;
          clearInterval(timer);
          renderAll();
          if (report.status === 'ready') toast('اكتمل التقرير ✓', 'ok');
          else if (report.error) toast(report.error, 'err', 4200);
        }
      });
      clearInterval(timer);
      timer = setInterval(renderGen, 1000);
    }

    function busy() { return !!job; }

    /* ── العرض ────────────────────────────────── */

    function renderAll() {
      titleEl.textContent = bidi(report.title);
      secEls = [];
      secSig = [];
      fill(paper, [renderCover(report), renderToc(report), h('div.secs')]);
      renderSections();
      renderNotices();
      renderGen();
      renderFooter();
      [btnWord, btnPdf, btnShare].forEach((b) => { b.disabled = busy() || !report.sections.length; });
    }

    function sigOf(i) {
      const s = report.sections[i];
      const figs = figuresOf(report, i, { all: true }).map((f) => `${f.id}:${f.status}:${f.img}:${f.caption}`).join(',');
      return `${s.h}\u0000${s.md}\u0000${figs}\u0000${busy() && i === report.sections.length - 1}`;
    }

    function renderSections() {
      const host = paper.querySelector('.secs');
      if (!host) return;
      const nums = figureNumbers(report);
      const n = report.sections.length;
      for (let i = 0; i < n; i++) {
        const sig = sigOf(i);
        if (secSig[i] === sig) continue;
        const live = busy() && job?.phases.write.status === 'run' && i === n - 1;
        const el = renderSection(report, i, { live, editable: !busy(), handlers, numbers: nums });
        if (secEls[i]) secEls[i].replaceWith(el); else host.append(el);
        secEls[i] = el;
        secSig[i] = sig;
      }
      while (secEls.length > n) { secEls.pop().remove(); secSig.pop(); }
      if (!n && busy()) {
        fill(host, h('div', [0, 1, 2].map((k) => h('div.skeleton', { style: { height: k ? '14px' : '22px', width: k ? '90%' : '45%', margin: '14px 0' } }))));
      }
      // تحديث الفهرس عند ظهور أقسام جديدة
      const toc = paper.querySelector('.toc');
      const newToc = renderToc(report);
      if (toc && newToc) toc.replaceWith(newToc);
      else if (!toc && newToc) paper.querySelector('.cover, .cover-off')?.after(newToc);
    }

    function renderGen() {
      if (!job) { genPanel.style.display = 'none'; return; }
      genPanel.style.display = '';
      const secs = Math.round((Date.now() - job.startedAt) / 1000);
      const phases = PHASES.map((p) => {
        const ph = job.phases[p.id];
        const cls = ph.status === 'run' ? '.run' : ph.status === 'done' ? '.done' : ph.status === 'skip' ? '.skip' : ph.status === 'error' ? '.error' : '';
        const dot = ph.status === 'run' ? h('div.spinner') : h('div.dot', ph.status === 'done' ? icon('check', 12) : null);
        return h('div.phase' + cls, [dot, h('span', p.label), ph.detail ? h('span.d', ph.detail) : null]);
      });
      fill(genPanel, [
        h('div.row.between', [
          h('div.row', [icon('sparkles', 18), h('strong', job.mode === 'images' ? 'يجلب الصور…' : 'يُنشئ التقرير…')]),
          h('span.muted', `${secs} ث${report.words ? ` • ${fmtNum(report.words)} كلمة` : ''}`),
        ]),
        h('div.phases.mt', phases),
        h('button.btn.sm.danger.mt', { type: 'button', onclick: () => cancelJob(report.id) }, [icon('stop', 15), 'إيقاف']),
      ]);
    }

    function renderNotices() {
      const items = [];
      if (report.error && !busy()) {
        items.push(h('div.notice.err', [icon('alert', 18), h('div.grow', [
          h('div', report.error),
          h('div.row.wrap.mt', [
            aiReady() ? h('button.btn.sm.primary', { type: 'button', onclick: () => regenerate('ai') }, [icon('refresh', 15), 'أعد المحاولة']) : null,
            h('button.btn.sm', { type: 'button', onclick: () => regenerate('offline') }, 'نسخة دون اتصال'),
          ]),
        ])]));
      }
      (report.notes || []).forEach((n) => items.push(h('div.notice.warn', [icon('info', 18), h('div.grow', n)])));
      if (!busy() && report.source === 'offline' && aiReady() && report.status === 'ready') {
        items.push(h('div.notice', [icon('sparkles', 18), h('div.grow', [
          'هذه نسخة دون اتصال. يمكن للذكاء الاصطناعي إعادة كتابتها تقريرًا كاملًا أدق وأغنى.',
          h('div', h('button.btn.sm.primary.mt', { type: 'button', onclick: () => regenerate('ai') }, [icon('sparkles', 15), 'حسّنه بالذكاء الاصطناعي'])),
        ])]));
      }
      const missing = (report.figures || []).filter((f) => !f.img && f.status === 'none').length;
      if (!busy() && missing && report.figures.length) {
        items.push(h('div.notice', [icon('image', 18), h('div.grow', [
          `${missing} صورة لم تُوضع لعدم وجود صورة مطابقة مؤكدة (التطبيق لا يضع صورة خاطئة).`,
          h('div', h('button.btn.sm.mt', { type: 'button', onclick: () => refetchImages() }, [icon('refresh', 15), 'أعد البحث عن الصور'])),
        ])]));
      }
      fill(notices, items);
    }

    function renderFooter() {
      const type = getType(report.typeId);
      const m = report.model ? modelLabel(report.model) : null;
      fill(footer, [
        h('div', `${type.icon} ${type.name} • ${fmtNum(report.words || 0)} كلمة • ${fmtDate(report.createdAt)}`),
        h('div', report.source === 'ai' ? `كتبه الذكاء الاصطناعي (${m || aiShortLabel()})${report.usage?.cost ? ` • الكلفة التقريبية ${fmtUSD(report.usage.cost)}` : ''}` : 'أُنشئ دون اتصال من قاعدة المعرفة'),
        h('div', 'راجع التقرير وعدّل ما بين الأقواس [ ] قبل تسليمه.'),
      ]);
    }

    /* ── الإجراءات ─────────────────────────────── */

    async function regenerate(mode) {
      if (busy()) return;
      if (report.sections.length && !(await confirmSheet('إعادة الإنشاء', 'سيُستبدل نص التقرير الحالي وصوره بنسخة جديدة. هل تريد المتابعة؟', { danger: false, okText: 'أعد الإنشاء' }))) return;
      const oldImgs = imageIdsOf(report);
      report.sections = [];
      report.figures = [];
      await deleteImages(oldImgs).catch(() => {});
      attach(startGeneration(report, mode));
      renderAll();
    }

    async function refetchImages() {
      if (busy()) return;
      attach(startGeneration(report, 'images'));
      renderAll();
    }

    async function more() {
      if (!report) return;
      const a = await actionSheet('خيارات التقرير', [
        { value: 'cover', label: 'تعديل العنوان وبيانات الغلاف', icon: 'edit' },
        { value: 'addimg', label: 'إضافة صورة', icon: 'image' },
        { value: 'refetch', label: 'إعادة البحث عن الصور الناقصة', icon: 'refresh' },
        aiReady() ? { value: 'regen', label: 'إعادة كتابته بالذكاء الاصطناعي', icon: 'sparkles' } : null,
        { value: 'copy', label: 'نسخ النص', icon: 'copy' },
        { value: 'dup', label: 'إنشاء نسخة', icon: 'layers' },
        { value: 'delete', label: 'حذف التقرير', icon: 'trash', danger: true },
      ]);
      if (!a) return;
      if (busy() && a !== 'copy') { toast('انتظر حتى يكتمل الإنشاء'); return; }
      if (a === 'cover') openCoverEditor(report, () => renderAll());
      else if (a === 'addimg') openAddFigure(report, () => renderAll());
      else if (a === 'refetch') refetchImages();
      else if (a === 'regen') regenerate('ai');
      else if (a === 'copy') {
        try { await navigator.clipboard.writeText(toPlainText(report)); toast('نُسخ نص التقرير', 'ok'); }
        catch { toast('تعذّر النسخ', 'err'); }
      } else if (a === 'dup') {
        const copy = structuredClone(report);
        copy.id = uid('r_');
        copy.title = report.title + ' (نسخة)';
        copy.figures = []; // الصور تبقى مملوكة للأصل
        copy.createdAt = Date.now();
        await putReport(copy);
        replace(`/report/${copy.id}`);
      } else if (a === 'delete') {
        if (!(await confirmSheet('حذف التقرير', `سيُحذف «${report.title}» وصوره نهائيًا.`, { okText: 'احذف' }))) return;
        await deleteReport(report.id);
        toast('حُذف التقرير');
        replace('/library');
      }
    }

    async function buildWord() {
      toast('يجهّز ملف Word…', '', 1500);
      const { buildDocx } = await import('../export/docx.js');
      return buildDocx(report);
    }

    async function exportWord() {
      try {
        const blob = await buildWord();
        const name = safeFileName(report.title, 'docx');
        if (isNative) {
          const choice = await actionSheet('ملف Word جاهز', [
            { value: 'share', label: 'مشاركة / فتح بتطبيق آخر', icon: 'share' },
            { value: 'save', label: 'حفظ في مجلد المستندات', icon: 'download' },
          ]);
          if (choice === 'share') await shareFile(blob, name, report.title);
          else if (choice === 'save') { const r = await saveFile(blob, name); toast(`حُفظ في ${r.where}`, 'ok'); }
        } else {
          await saveFile(blob, name);
          toast('نُزّل ملف Word', 'ok');
        }
      } catch (err) {
        console.error(err);
        toast('تعذّر إنشاء ملف Word: ' + (err.message || ''), 'err');
      }
    }

    async function exportPdf() {
      // ننتظر تحميل كل الصور قبل الطباعة حتى لا تظهر فارغة في PDF
      const imgs = [...paper.querySelectorAll('img')];
      await Promise.all(imgs.map((im) => (im.complete ? null : im.decode?.().catch(() => {}))));
      // والمعادلات كذلك: تُرسم قبل الطباعة
      if (paper.querySelector('.mx-wait')) { await loadMath().catch(() => {}); await new Promise((r) => requestAnimationFrame(() => r())); }
      try {
        await printPage(report.title);
        if (isNative) toast('اختر «حفظ بتنسيق PDF» في نافذة الطباعة', '', 3500);
      } catch (err) {
        toast('تعذّرت الطباعة: ' + (err.message || ''), 'err');
      }
    }

    async function shareMenu() {
      const a = await actionSheet('مشاركة التقرير', [
        { value: 'word', label: 'مشاركة ملف Word', icon: 'word' },
        { value: 'text', label: 'مشاركة النص فقط', icon: 'file' },
        { value: 'copy', label: 'نسخ النص', icon: 'copy' },
      ]);
      if (a === 'word') {
        try { await shareFile(await buildWord(), safeFileName(report.title, 'docx'), report.title); }
        catch (err) { toast('تعذّرت المشاركة: ' + (err.message || ''), 'err'); }
      } else if (a === 'text') {
        const text = toPlainText(report);
        if (navigator.share) { try { await navigator.share({ title: report.title, text }); } catch { /* ألغى المستخدم */ } }
        else { await shareFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), safeFileName(report.title, 'txt'), report.title); }
      } else if (a === 'copy') {
        try { await navigator.clipboard.writeText(toPlainText(report)); toast('نُسخ النص', 'ok'); } catch { toast('تعذّر النسخ', 'err'); }
      }
    }

    return () => {
      unsub?.();
      clearInterval(timer);
    };
  },
};

