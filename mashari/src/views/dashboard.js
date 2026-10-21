/** تبويب «دراستي»: وين وصلت، شنو حكمت، أعلى المشاريع بتقديرك، والمقارنة. */

import { h, fill, empty } from '../core/dom.js';
import { state } from '../core/store.js';
import { emit } from '../core/bus.js';
import { toast } from '../core/ui.js';
import { Files } from '../core/native.js';
import { moneyShort, ago } from '../core/text.js';
import { VERDICTS, studiedProjects, countProjects, allCats, allProjects, calcTotals, calcHasData } from '../model.js';
import { openStudy } from './study.js';
import { openCompare } from './compare.js';
import { reportText } from './share.js';
import { ring, projectRow, head } from './parts.js';

const VERDICT_RANK = { win: 0, maybe: 1, lose: 2 };

export function mountDashboard(screen) {
  const items = studiedProjects();
  const total = countProjects();
  const judged = items.filter(({ s }) => s.verdict);
  const open = (p) => openStudy({ kind: 'project', id: p.id });

  if (!items.length) {
    fill(screen, [
      head('دراستي', 'هنا تبيّن خلاصة دراستك'),
      h('div.card.intro', [
        h('div.intro-art', '📊'),
        h('div.card-t.center', 'بعدك ما درست أي مشروع'),
        h('p.muted.center', 'افتح أي فكرة من قائمة المشاريع، واكتب حكمك (ينجح أو يفشل)، الإيجابيات والسلبيات، ملاحظاتك، وارسم خريطتها. كل شي ينحفظ بجهازك.'),
        h('button.btn.primary.block', { type: 'button', onclick: () => emit('go', { tab: 'projects' }) }, '📋 روح لقائمة المشاريع'),
      ]),
    ]);
    return;
  }

  const counts = Object.fromEntries(VERDICTS.map((v) => [v.id, judged.filter(({ s }) => s.verdict === v.id).length]));
  const pct = total ? (judged.length / total) * 100 : 0;

  const top = judged.filter(({ s }) => s.verdict !== 'lose')
    .sort((a, b) => (VERDICT_RANK[a.s.verdict] - VERDICT_RANK[b.s.verdict])
      || ((b.s.chance ?? -1) - (a.s.chance ?? -1))
      || (b.s.updatedAt - a.s.updatedAt))
    .slice(0, 8);
  const stars = items.filter(({ s }) => s.star);
  const recent = [...items].sort((a, b) => b.s.updatedAt - a.s.updatedAt).slice(0, 6);

  const goFilter = (verdict) => emit('go', { tab: 'projects', filter: { verdict, q: '', cat: 'all' } });

  async function shareReport() {
    const r = await Files.shareText(reportText(), 'ملخص دراستي');
    if (r === 'copied') toast('انتسخ الملخص', 'ok');
  }

  fill(screen, [
    head('دراستي', `${state.market.title} · آخر تعديل ${ago(recent[0].s.updatedAt)}`),

    h('div.card.glow.progress-card', [
      ring(pct, { size: 76, stroke: 8, label: `${judged.length}` }),
      h('div.grow', [
        h('div.card-t', `حكمت على ${judged.length} من ${total} فكرة`),
        h('div.card-s', `فتحت ودرست ${items.length} مشروع${items.length - judged.length ? ` · ${items.length - judged.length} بعدها بلا حكم` : ''}`),
        h('div.bar.mt', [h('i', { style: { width: `${Math.max(2, pct)}%` } })]),
      ]),
    ]),

    h('div.grid3.vstats', VERDICTS.map((v) => h('button.vstat.' + v.cls, { type: 'button', onclick: () => goFilter(v.id) }, [
      h('span.vi', v.icon),
      h('b', String(counts[v.id])),
      h('span', v.label),
    ]))),

    top.length ? h('h2.sec', '🏆 الأعلى بتقديرك') : null,
    top.length ? h('div.list', top.map(({ p, s }, i) => {
      const t = calcHasData(s.calc) ? calcTotals(s.calc) : null;
      const row = projectRow(p, open);
      row.prepend(h('span.rank', String(i + 1)));
      if (t?.net !== null && t?.net !== undefined) {
        row.querySelector('.grow').append(h('span.ps.money', `صافي ${moneyShort(t.net)} بالشهر${t.payback ? ` · يرجع خلال ${Math.ceil(t.payback)} شهر` : ''}`));
      }
      return row;
    })) : null,

    h('div.grid2.mt', [
      h('button.btn', { type: 'button', onclick: () => openCompare() }, '⚖️ قارن بين مشاريع'),
      h('button.btn', { type: 'button', onclick: shareReport }, '📤 شارك الملخص'),
    ]),

    stars.length ? h('h2.sec', `⭐ المفضّلة (${stars.length})`) : null,
    stars.length ? h('div.list', stars.map(({ p }) => projectRow(p, open))) : null,

    h('h2.sec', '📊 حسب الأقسام'),
    h('div.card.cats-card', catRows(items)),

    h('h2.sec', '🕘 آخر ما اشتغلت عليه'),
    h('div.list', recent.map(({ p }) => projectRow(p, open))),
  ]);
}

function catRows(items) {
  const byCat = new Map();
  allProjects().forEach((p) => byCat.set(p.cat, { total: (byCat.get(p.cat)?.total || 0) + 1, win: 0, maybe: 0, lose: 0, studied: 0 }));
  for (const { p, s } of items) {
    const row = byCat.get(p.cat);
    if (!row) continue;
    row.studied++;
    if (s.verdict) row[s.verdict]++;
  }
  const rows = allCats()
    .filter((c) => byCat.get(c.id)?.studied)
    .map((c) => {
      const r = byCat.get(c.id);
      const seg = (n, cls) => (n ? h('i.' + cls, { style: { width: `${(n / r.total) * 100}%` } }) : null);
      return h('button.catrow', { type: 'button', onclick: () => openStudy({ kind: 'sector', id: c.id }) }, [
        h('div.row.between', [h('span', `${c.icon} ${c.name}`), h('span.muted', `${r.studied}/${r.total}`)]),
        h('div.stack', [seg(r.win, 'ok'), seg(r.maybe, 'warn'), seg(r.lose, 'danger'), seg(r.studied - r.win - r.maybe - r.lose, 'plain')]),
      ]);
    });
  return rows.length ? rows : [empty('📁', 'ماكو أقسام مدروسة بعد')];
}
