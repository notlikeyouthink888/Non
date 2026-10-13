/**
 * الرئيسية: بحث في مكتبة العناوين، وإن لم تجد عنوانك:
 * اكتب التقرير بعنوانك مباشرة، أو دع الذكاء الاصطناعي يقترح عناوين.
 */

import { h, fill, debounce, empty } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go, setQuiet, qs } from '../core/nav.js';
import { state, aiReady, pushRecent } from '../core/store.js';
import { listReports } from '../core/db.js';
import { toast } from '../core/ui.js';
import { REPORT_TYPES, TYPE_BY_ID } from '../data/types.js';
import { CATEGORIES } from '../data/categories.js';
import { TOPICS, topicsOf } from '../data/topics.js';
import { KB } from '../data/kb/index.js';
import { searchTopics, searchTypes, detectType, isWeak, featured } from '../search/index.js';
import { jsonCall, aiErrorMessage } from '../ai/client.js';
import { SYSTEM, titlesPrompt, TITLES_SCHEMA } from '../ai/prompts.js';
import { brandMark, aiPill, topicItem, reportItem, sectionTitle } from './common.js';
import { bidi } from '../core/arabic.js';

export default {
  mount(root, { query }) {
    const initial = query.get('q') || '';
    let aiCtrl = null;
    const suggestionsCache = new Map();

    const input = h('input', {
      type: 'search', value: initial, placeholder: 'ابحث عن عنوان تقرير أو اكتب أي موضوع…',
      enterkeyhint: 'search', autocomplete: 'off', 'aria-label': 'بحث',
      oninput: () => { clearBtn.style.visibility = input.value ? 'visible' : 'hidden'; onType(); },
      onkeydown: (e) => { if (e.key === 'Enter') { input.blur(); pushRecent(input.value); } },
    });
    const clearBtn = h('button.icon-btn', {
      type: 'button', 'aria-label': 'مسح', style: { visibility: initial ? 'visible' : 'hidden' },
      onclick: () => { input.value = ''; clearBtn.style.visibility = 'hidden'; render(); input.focus(); },
    }, icon('x', 18));

    const body = h('div');
    const wrap = h('div.wrap', [
      h('div.hero', [
        h('div.row.between', [
          h('div.brand', [brandMark(30), h('div', [h('div.brand-name', 'أساس'), h('div.brand-sub', 'تقارير الهندسة المدنية بالعربية')])]),
          aiPill(),
        ]),
      ]),
      h('div.search.mt', [icon('search', 20), input, clearBtn]),
      body,
    ]);
    root.append(wrap);

    const onType = debounce(() => render(), 160);

    function render() {
      const q = input.value.trim();
      setQuiet('/' + qs({ q }));
      if (q.length >= 2) renderResults(q);
      else renderHome();
    }

    /* ── الرئيسية دون بحث ─────────────────────── */
    async function renderHome() {
      aiCtrl?.abort();
      const recent = state.recent.length ? h('div.recent', state.recent.map((r) => h('button.chip.sm', { type: 'button', onclick: () => { input.value = r; clearBtn.style.visibility = 'visible'; render(); } }, r))) : null;

      const intro = !aiReady() ? h('div.card.accent.mt', [
        h('h3', 'اكتب أي تقرير بالذكاء الاصطناعي'),
        h('p.muted', `التطبيق يعمل الآن دون اتصال: ${Object.keys(KB).length} موضوعًا بمحتوى كامل وقوالب منظّمة لباقي العناوين. لتقرير كامل لأي عنوان مع صور متحقَّق منها، أضف مفتاح Claude من الإعدادات.`),
        h('button.btn.primary.sm.mt', { type: 'button', onclick: () => go('/settings') }, [icon('key', 16), 'تفعيل الذكاء الاصطناعي']),
      ]) : null;

      const types = h('div.grid-types', REPORT_TYPES.map((t) => h('button.type-card', {
        type: 'button', onclick: () => go(`/create?type=${t.id}`), title: t.desc,
      }, [h('span.em', t.icon), h('span.nm', bidi(t.name))])));

      const cats = h('div.cats', CATEGORIES.map((c) => h('button.cat-card', { type: 'button', onclick: () => go(`/browse/${c.id}`) }, [
        h('span.em', c.icon),
        h('div.grow', [h('div.nm', c.short || c.name), h('div.ct', `${topicsOf(c.id).length} عنوانًا`)]),
      ])));

      const recentReports = h('div.list');
      fill(body, [
        recent,
        intro,
        sectionTitle(`أنواع التقارير (${REPORT_TYPES.length})`),
        types,
        sectionTitle('آخر تقاريرك', { label: 'الكل', onClick: () => go('/library') }),
        recentReports,
        sectionTitle(`الأقسام — ${TOPICS.length} عنوانًا`, { label: 'تصفّح', onClick: () => go('/browse') }),
        cats,
        sectionTitle('مواضيع جاهزة دون اتصال'),
        h('div.list', featured(6).map((t) => topicItem(t))),
      ]);

      const list = await listReports().catch(() => []);
      if (list.length) fill(recentReports, list.slice(0, 3).map((r) => reportItem(r)));
      else fill(recentReports, h('div.muted', { style: { padding: '4px 2px' } }, 'لم تُنشئ أي تقرير بعد — ابحث عن عنوان أو اختر نوعًا للبدء.'));
    }

    /* ── نتائج البحث ──────────────────────────── */
    function renderResults(q) {
      const results = searchTopics(q, { limit: 30 });
      const types = searchTypes(q);
      const typeHint = detectType(q);
      const weak = isWeak(results);

      const custom = h('button.item', {
        type: 'button', style: { borderColor: 'var(--accent)' },
        onclick: () => { pushRecent(q); go('/create' + qs({ title: q, type: typeHint })); },
      }, [
        h('div.lead-ico', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' } }, icon('edit', 20)),
        h('div.grow', [h('div.t', `اكتب تقريرًا بعنوان «${q}»`), h('div.s', aiReady() ? 'يكتبه الذكاء الاصطناعي كاملًا مع الخطوات والصور' : 'قالب منظّم دون اتصال — أو فعّل الذكاء الاصطناعي لتقرير كامل')]),
        icon('chevron', 18, 'chev'),
      ]);

      const aiBox = h('div');
      const notFound = h('div.card.soft.mt', [
        h('div.row', [icon('sparkles', 20), h('h3.grow', weak ? 'لم تجد العنوان المناسب؟' : 'تريد عناوين أخرى؟')]),
        h('p.muted', { style: { margin: '6px 0 10px' } }, 'يقترح الذكاء الاصطناعي عناوين دقيقة لما كتبته مع أنسب نوع تقرير لكل عنوان.'),
        h('button.btn.primary.sm', { type: 'button', onclick: () => suggest(q, aiBox) }, [icon('sparkles', 16), 'اقترح عناوين بالذكاء الاصطناعي']),
        aiBox,
      ]);

      fill(body, [
        h('div.list.mt', [custom]),
        types.length ? h('div', [
          sectionTitle('أنواع تقارير مطابقة'),
          h('div.hscroll', types.map((t) => h('button.chip', { type: 'button', onclick: () => go('/create' + qs({ type: t.id })) }, `${t.icon} ${t.name}`))),
        ]) : null,
        weak ? notFound : null,
        results.length ? sectionTitle(`نتائج من المكتبة (${results.length})`) : null,
        results.length
          ? h('div.list', results.map((r) => topicItem(r.topic, { onClick: () => { pushRecent(q); go('/create' + qs({ topic: r.topic.id, type: typeHint })); } })))
          : empty('🔎', 'لا يوجد عنوان مطابق في المكتبة.'),
        !weak && results.length ? notFound : null,
      ]);
      if (suggestionsCache.has(q)) showSuggestions(suggestionsCache.get(q), aiBox);
    }

    async function suggest(q, box) {
      if (!aiReady()) {
        fill(box, h('div.notice.warn.mt', [icon('key', 18), h('div.grow', [
          'اقتراح العناوين يحتاج تفعيل الذكاء الاصطناعي. يمكنك الآن كتابة التقرير بعنوانك مباشرة.',
          h('div', h('button.btn.sm.mt', { type: 'button', onclick: () => go('/settings') }, 'فتح الإعدادات')),
        ])]));
        return;
      }
      aiCtrl?.abort();
      aiCtrl = new AbortController();
      fill(box, h('div.row.mt', [h('div.spinner'), h('span.muted', 'يفكّر في عناوين مناسبة…')]));
      try {
        const res = await jsonCall({ system: SYSTEM, prompt: titlesPrompt(q), schema: TITLES_SCHEMA, effort: 'low', signal: aiCtrl.signal });
        const list = (res.titles || []).filter((t) => t.title);
        suggestionsCache.set(q, list);
        showSuggestions(list, box);
      } catch (err) {
        if (aiCtrl.signal.aborted) return;
        fill(box, h('div.notice.err.mt', [icon('alert', 18), h('div.grow', aiErrorMessage(err))]));
      }
    }

    function showSuggestions(list, box) {
      fill(box, h('div.list.mt', list.map((s) => {
        const type = TYPE_BY_ID[s.type] || TYPE_BY_ID.research;
        return h('button.item', { type: 'button', onclick: () => go('/create' + qs({ title: s.title, type: type.id, img: s.image_en })) }, [
          h('div.lead-ico', type.icon),
          h('div.grow', [h('div.t', bidi(s.title)), h('div.s', [h('span.badge', type.short), h('span', s.why)])]),
          icon('chevron', 18, 'chev'),
        ]);
      })));
      if (!list.length) toast('لم تصل اقتراحات، جرّب صياغة أخرى');
    }

    render();

    return () => aiCtrl?.abort();
  },
};

