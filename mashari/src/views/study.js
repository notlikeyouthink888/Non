/**
 * صفحة الدراسة: لمشروع أو لقطاع كامل أو للسوق العام.
 * فيها حكمك (ينجح / متردد / يفشل) ونسبة النجاح بتقديرك، الإيجابيات والسلبيات،
 * الملاحظات، الخريطة الذهنية، والحسبة (للمشاريع).
 */

import { h, fill, autoGrow } from '../core/dom.js';
import { state, uid, save, blankStudy } from '../core/store.js';
import { openPage, toast, promptSheet, confirmSheet, menuSheet, haptic } from '../core/ui.js';
import { emit } from '../core/bus.js';
import { Files } from '../core/native.js';
import { ago } from '../core/text.js';
import {
  VERDICTS, studyFor, touch, pruneStudy, getProject, catOf, typeOf, capOf, mapCount,
  allProjects, removeProject, resetProjectEdits, isSeed,
} from '../model.js';
import { QUESTIONS, SECTOR_QUESTIONS } from '../data/guide.js';
import { openMapEditor } from '../mindmap/editor.js';
import { mapPreview } from '../mindmap/render.js';
import { calcView } from './calc.js';
import { openProjectForm } from './projectForm.js';
import { studyText, refTitle, pointLabels } from './share.js';
import { projectRow } from './parts.js';
import { aiTab, openAiHub } from './ai.js';

/** معلومات العرض حسب نوع الدراسة. */
function describe(ref) {
  if (ref.kind === 'market') {
    return {
      icon: '🇮🇶', title: state.market.title, sub: 'نظرة عامة على السوق',
      desc: 'اكتب ملاحظاتك العامة: شنو الناس دا تطلب، شنو المشاريع اللي تنفتح وتسكّر، الأسعار، والفرص اللي شفتها.',
      verdictQ: 'شلون تشوف السوق هسه؟',
    };
  }
  if (ref.kind === 'sector') {
    const c = catOf(ref.id);
    const n = allProjects().filter((p) => p.cat === ref.id).length;
    return {
      icon: c.icon, title: `قطاع ${c.name}`, sub: `${n} فكرة بهذا القطاع`,
      desc: 'ادرس القطاع ككل: شنو ينجح بيه وشنو يفشل، وشنو الفرص والتحديات.',
      verdictQ: 'شلون تشوف هذا القطاع؟',
    };
  }
  const p = getProject(ref.id);
  if (!p) return null;
  const c = catOf(p.cat);
  const t = typeOf(p.type);
  const cap = capOf(p.cap);
  return {
    icon: p.icon || '💡', title: p.name, project: p,
    sub: `${c.icon} ${c.name} · ${t.icon} ${t.name}${cap ? ` · رأس مال ${cap.name}` : ''}`,
    desc: p.desc,
    verdictQ: 'حكمك على المشروع',
  };
}

export function openStudy(ref, { tab: startTab = 'study', onClose } = {}) {
  if (!describe(ref)) { toast('المشروع مو موجود', 'err'); return; }
  const study = studyFor(ref, true);
  const L = pointLabels(ref);
  let tab = startTab;

  openPage((page, { close }) => {
    const headT = h('div.page-t.ellipsis');
    const headS = h('div.page-s.ellipsis');
    const starBtn = ref.kind === 'project'
      ? h('button.btn.icon.ghost.star-btn', { 'aria-label': 'مفضّل', onclick: toggleStar })
      : null;
    const body = h('div.page-body');

    fill(page, [
      h('header.page-head', [
        h('button.btn.icon.ghost', { 'aria-label': 'رجوع', onclick: close }, '→'),
        h('div.grow', [headT, headS]),
        starBtn,
        h('button.btn.icon.ghost', { 'aria-label': 'المزيد', onclick: more }, '⋯'),
      ]),
      body,
    ]);

    function toggleStar() {
      study.star = !study.star;
      touch(study);
      haptic();
      paintStar();
      toast(study.star ? 'انضاف للمفضّلة ⭐' : 'انشال من المفضّلة');
    }

    function paintStar() {
      if (!starBtn) return;
      starBtn.textContent = study.star ? '★' : '☆';
      starBtn.classList.toggle('on', study.star);
    }

    /* ────────── الأجزاء ────────── */

    function hero(info) {
      return h('div.hero', [
        h('div.hero-ico', info.icon),
        h('div.grow', [
          h('h1.hero-t', info.title),
          h('div.hero-s', info.sub),
          info.desc ? h('p.hero-d', info.desc) : null,
        ]),
      ]);
    }

    function tabsBar() {
      const items = [
        { id: 'study', label: '📝 الدراسة' },
        { id: 'map', label: `🧠 الخريطة${mapCount(study) ? ` (${mapCount(study)})` : ''}` },
        ref.kind === 'project' ? { id: 'calc', label: '🧮 الحسبة' } : null,
        ref.kind === 'project' ? { id: 'ai', label: '🤖 تحليل' } : null,
        ref.kind === 'sector' ? { id: 'list', label: '📋 المشاريع' } : null,
      ].filter(Boolean);
      return h('div.tabs', items.map((t) => h('button' + (t.id === tab ? '.on' : ''), {
        type: 'button',
        onclick: () => { tab = t.id; render(); body.scrollTop = 0; },
      }, t.label)));
    }

    function verdictCard(info) {
      const valueEl = h('b.chance-v');
      const range = h('input', { type: 'range', min: 0, max: 100, step: 5, value: study.chance ?? 50, 'aria-label': 'نسبة النجاح' });
      const clearBtn = h('button.link', { type: 'button' }, 'مسح');
      const paint = () => {
        const set = study.chance !== null;
        valueEl.textContent = set ? `${study.chance}%` : 'ما حددت';
        range.classList.toggle('unset', !set);
        clearBtn.style.visibility = set ? 'visible' : 'hidden';
        range.style.setProperty('--fill', `${set ? study.chance : 0}%`);
      };
      range.addEventListener('input', () => { study.chance = Number(range.value); paint(); touch(study); });
      clearBtn.addEventListener('click', () => { study.chance = null; range.value = 50; paint(); touch(study); });
      paint();

      return h('div.card.verdict-card', [
        h('div.card-t', info.verdictQ),
        h('div.vgrid', VERDICTS.map((v) => h('button.vbtn.' + v.cls + (study.verdict === v.id ? '.on' : ''), {
          type: 'button',
          onclick: () => {
            study.verdict = study.verdict === v.id ? null : v.id;
            touch(study);
            haptic(14);
            render();
          },
        }, [h('span.vi', v.icon), h('span', v.label)]))),
        h('div.chance', [
          h('div.row.between', [h('span.muted', 'نسبة النجاح بتقديرك'), h('span.row', [valueEl, clearBtn])]),
          range,
        ]),
      ]);
    }

    function pointsCard(key, title, icon, placeholder) {
      const list = study[key];
      const listEl = h('div.plist');
      const count = h('span.count');
      const paintList = () => {
        count.textContent = list.length ? String(list.length) : '';
        fill(listEl, list.length ? list.map((it, i) => h('div.prow', [
          h('span.pdot', icon),
          h('button.ptext', {
            type: 'button',
            onclick: async () => {
              const t = await promptSheet('تعديل النقطة', { value: it.t, multiline: true });
              if (t === null) return;
              if (!t) { list.splice(i, 1); } else it.t = t;
              touch(study);
              paintList();
            },
          }, it.t),
          h('button.x', {
            type: 'button', 'aria-label': 'حذف',
            onclick: () => {
              const [gone] = list.splice(i, 1);
              touch(study);
              paintList();
              toast('انحذفت النقطة', '', { action: 'تراجع', onAction: () => { list.splice(i, 0, gone); touch(study); paintList(); } });
            },
          }, '✕'),
        ])) : h('div.pempty', 'ما كو نقاط بعد'));
      };
      const input = h('input', { placeholder, maxLength: 300, enterKeyHint: 'enter' });
      const add = () => {
        const t = input.value.trim();
        if (!t) { input.focus(); return; }
        list.push({ id: uid('pt'), t });
        input.value = '';
        touch(study);
        haptic();
        paintList();
        input.focus();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      paintList();
      return h('div.card.points.' + key, [
        h('div.row.between', [h('div.card-t', [icon, ' ', title]), count]),
        listEl,
        h('div.padd', [input, h('button.btn.add-btn', { type: 'button', 'aria-label': 'أضف', onclick: add }, '＋')]),
      ]);
    }

    let notesEl = null;
    function notesCard() {
      notesEl = autoGrow(h('textarea.notes', {
        value: study.notes,
        placeholder: 'اكتب ملاحظاتك: شنو شفت بالسوق، أسعار، أماكن، أسماء موردين، كلام الناس…',
        rows: 4,
      }));
      notesEl.addEventListener('input', () => { study.notes = notesEl.value; touch(study); });
      return h('div.card', [h('div.card-t', '📝 ملاحظات'), notesEl]);
    }

    function questionsCard() {
      const qs = ref.kind === 'project' ? QUESTIONS : SECTOR_QUESTIONS;
      return h('details.card.qcard', [
        h('summary', [h('span', '💡 أسئلة تساعدك بالدراسة'), h('span.muted', 'اضغط سؤال حتى ينضاف لملاحظاتك')]),
        h('div.qlist', qs.map((q) => h('button.qitem', {
          type: 'button',
          onclick: () => {
            const line = `${q.icon} ${q.q}\n`;
            study.notes = study.notes.trim() ? `${study.notes.trimEnd()}\n\n${line}` : line;
            touch(study);
            if (notesEl) {
              notesEl.value = study.notes;
              notesEl.dispatchEvent(new Event('input'));
              notesEl.focus();
              notesEl.setSelectionRange(notesEl.value.length, notesEl.value.length);
              notesEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            haptic();
          },
        }, [h('span', q.icon), h('span.grow', q.q), h('span.plus', '＋')]))),
      ]);
    }

    function mapTab(info) {
      const n = mapCount(study);
      const openEditor = () => openMapEditor({
        study,
        rootLabel: info.title,
        subtitle: info.title,
        points: { pros: `${L.prosIcon} ${L.pros}`, cons: `${L.consIcon} ${L.cons}` },
        onClose: () => render(),
      });
      if (!n) {
        return h('div.card.map-empty', [
          h('div.map-art', [h('i.a'), h('i.b'), h('i.c'), h('i.d'), h('span', '🧠')]),
          h('div.card-t.center', 'ارسم أفكارك كدوائر متصلة'),
          h('p.muted.center', 'بالنص اسم المشروع، وإنت تضيف حواليه دوائر: الزبائن، المنافسين، المكان، الأرباح… وتربطها ببعض مثل ما تريد.'),
          h('button.btn.primary.block', { type: 'button', onclick: openEditor }, '＋ افتح الخريطة وابدأ'),
        ]);
      }
      return h('div', [
        h('button.card.map-card', { type: 'button', onclick: openEditor, 'aria-label': 'افتح الخريطة' }, [
          mapPreview(study.map, info.title),
          h('div.map-meta', [
            h('span', `🔵 ${n} دائرة`),
            study.map.links.length ? h('span', `🔗 ${study.map.links.length} ربط`) : null,
            h('span.grow'),
            h('span.link', 'افتح وعدّل ‹'),
          ]),
        ]),
        h('div.grid2', [
          h('button.btn', { type: 'button', onclick: openEditor }, '✏️ عدّل الخريطة'),
          h('button.btn', { type: 'button', onclick: share }, '📤 شارك الدراسة'),
        ]),
      ]);
    }

    function listTab() {
      const items = allProjects().filter((p) => p.cat === ref.id);
      const openProject = (id) => openStudy({ kind: 'project', id }, { onClose: () => render() });
      const rows = items.map((p) => projectRow(p, (pp) => openProject(pp.id)));
      return h('div', [
        h('div.grid2.ai-row', [
          h('button.btn', { type: 'button', onclick: () => openAiHub({ tab: 'scores', cat: ref.id, onClose: render }) }, '🎲 قيّم الاحتمالات'),
          h('button.btn', { type: 'button', onclick: () => openAiHub({ tab: 'ideas', cat: ref.id, onClose: render }) }, '💡 اقترح أفكار'),
        ]),
        h('div.list', rows),
        h('button.btn.block.mt', {
          type: 'button',
          onclick: () => openProjectForm(null, { defaultCat: ref.id, onSaved: (p) => { render(); openProject(p.id); } }),
        }, '＋ أضف فكرة لهذا القطاع'),
      ]);
    }

    function render() {
      const info = describe(ref);
      if (!info) { close(); return; }
      headT.textContent = info.title;
      headS.textContent = ref.kind === 'project' ? catOf(info.project.cat).name : info.sub;
      paintStar();
      let content;
      if (tab === 'map') content = mapTab(info);
      else if (tab === 'calc' && ref.kind === 'project') content = calcView(study);
      else if (tab === 'ai' && ref.kind === 'project') content = aiTab(info.project, study, render);
      else if (tab === 'list' && ref.kind === 'sector') content = listTab();
      else {
        content = h('div', [
          verdictCard(info),
          pointsCard('pros', L.pros, L.prosIcon, ref.kind === 'project' ? 'أضف إيجابية… مثلًا: الطلب عالي بالمنطقة' : 'أضف فرصة…'),
          pointsCard('cons', L.cons, L.consIcon, ref.kind === 'project' ? 'أضف سلبية… مثلًا: المنافسة هواية' : 'أضف تحدّي…'),
          notesCard(),
          questionsCard(),
          study.updatedAt && study.updatedAt !== study.createdAt
            ? h('div.muted.center.updated', `آخر تعديل ${ago(study.updatedAt)}`) : null,
        ]);
      }
      fill(body, [hero(info), tabsBar(), content]);
    }

    /* ────────── القائمة ────────── */

    async function share() {
      const r = await Files.shareText(studyText(ref), refTitle(ref));
      if (r === 'copied') toast('انتسخت الدراسة — الصقها وين ما تريد', 'ok');
      else if (r === 'failed') toast('ما گدرت أشارك', 'err');
    }

    function more() {
      const info = describe(ref);
      const p = info?.project;
      menuSheet(info?.title || '', [
        { icon: '📤', label: 'شارك الدراسة كنص', sub: 'واتساب، تلگرام، أو انسخها', onClick: share },
        p && {
          icon: '✏️', label: 'عدّل معلومات المشروع', sub: 'الاسم، القسم، النوع، رأس المال، الوصف',
          onClick: () => openProjectForm(p, { onSaved: () => render() }),
        },
        p?.edited && {
          icon: '↩️', label: 'رجّع المعلومات الأصلية',
          onClick: () => { resetProjectEdits(p.id); render(); toast('رجعت المعلومات الأصلية'); },
        },
        ref.kind === 'market' && {
          icon: '✏️', label: 'غيّر اسم السوق', sub: 'مثلًا: السوق العراقي — البصرة',
          onClick: async () => {
            const t = await promptSheet('اسم السوق', { value: state.market.title });
            if (!t) return;
            state.market.title = t;
            save();
            render();
          },
        },
        {
          icon: '🧹', label: 'امسح الدراسة', sub: 'الحكم والنقاط والملاحظات والخريطة والحسبة', danger: true,
          onClick: async () => {
            if (!await confirmSheet('مسح الدراسة', `راح تنمسح كل دراستك لـ«${info.title}».`, { okText: 'امسح' })) return;
            const fresh = blankStudy();
            fresh.star = study.star;
            Object.assign(study, fresh);
            touch(study);
            render();
            toast('انمسحت الدراسة');
          },
        },
        p && {
          icon: isSeed(p.id) ? '🙈' : '🗑',
          label: isSeed(p.id) ? 'أخفِ المشروع من القائمة' : 'احذف المشروع',
          sub: isSeed(p.id) ? 'تگدر ترجّعه من الإعدادات' : 'ينحذف ويا دراسته',
          danger: true,
          onClick: async () => {
            const seed = isSeed(p.id);
            if (!seed && !await confirmSheet('حذف المشروع', `راح ينحذف «${p.name}» ويا دراسته.`, { okText: 'احذف' })) return;
            removeProject(p.id);
            close();
            toast(seed ? 'انخفى المشروع — ترجّعه من الإعدادات' : 'انحذف المشروع');
          },
        },
      ]);
    }

    render();
  }, {
    onClose: () => {
      pruneStudy(ref);
      emit('changed');
      onClose?.();
    },
  });
}
