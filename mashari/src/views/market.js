/** تبويب «السوق»: دراسة السوق بشكل عام، وكل قطاع (قسم) لحاله. */

import { h, fill } from '../core/dom.js';
import { state } from '../core/store.js';
import { allCats, allProjects, studyFor, hasContent, mapCount, verdictOf } from '../model.js';
import { openStudy } from './study.js';
import { studyPills, head } from './parts.js';

export function mountMarket(screen) {
  const market = studyFor({ kind: 'market' });
  const perCat = new Map();
  const studiedPerCat = new Map();
  for (const p of allProjects()) {
    perCat.set(p.cat, (perCat.get(p.cat) || 0) + 1);
    if (hasContent(state.studies[p.id])) studiedPerCat.set(p.cat, (studiedPerCat.get(p.cat) || 0) + 1);
  }

  const marketV = verdictOf(market?.verdict);
  fill(screen, [
    head('السوق', 'ادرس السوق بشكل عام، وبعدين كل قطاع لحاله'),

    h('button.card.market-card', { type: 'button', onclick: () => openStudy({ kind: 'market' }) }, [
      h('div.row', [
        h('span.market-flag', '🇮🇶'),
        h('div.grow', [
          h('div.card-t', state.market.title),
          h('div.card-s', hasContent(market)
            ? 'دراستك العامة للسوق — اضغط حتى تكمّل'
            : 'اكتب نظرتك العامة: شنو الناس تطلب، شنو ينفتح ويسكّر، الأسعار والفرص'),
        ]),
        marketV ? h('span.vb.' + marketV.cls, [h('b', marketV.icon), ' ', marketV.label]) : h('span.chev', '‹'),
      ]),
      studyPills(market),
    ]),

    h('h2.sec', 'القطاعات'),
    h('p.muted.sec-hint', 'كل قطاع إله دراسة: الفرص والتحديات، ملاحظات، وخريطة ذهنية. وداخله كل مشاريعه.'),
    h('div.sector-grid', allCats().filter((c) => perCat.get(c.id)).map((c) => {
      const s = state.sectors[c.id];
      const v = verdictOf(s?.verdict);
      const done = studiedPerCat.get(c.id) || 0;
      return h('button.sector' + (v ? '.v-' + v.id : ''), { type: 'button', onclick: () => openStudy({ kind: 'sector', id: c.id }) }, [
        h('span.sec-ico', c.icon),
        h('span.sec-name', c.name),
        h('span.sec-meta', `${perCat.get(c.id)} فكرة${done ? ` · درست ${done}` : ''}`),
        v ? h('span.vb.sm.' + v.cls, [v.icon, ' ', v.label]) : (mapCount(s) || s?.notes?.trim() ? h('span.vb.sm', '✍️ بديت') : null),
      ]);
    })),
  ]);
}
