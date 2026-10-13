/** عناصر واجهة مشتركة بين الشاشات. */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { go, back } from '../core/nav.js';
import { state, aiReady } from '../core/store.js';
import { aiShortLabel } from '../ai/client.js';
import { getType, TYPE_BY_ID } from '../data/types.js';
import { CAT_BY_ID } from '../data/categories.js';
import { KB } from '../data/kb/index.js';
import { ago, fmtNum } from '../core/fmt.js';
import { bidi } from '../core/arabic.js';

/** شعار التطبيق: عمود على أساس متدرّج. */
export function brandMark(size = 30) {
  const wrap = h('div.brand-mark');
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs><rect x="27" y="10" width="10" height="24" rx="1.5" fill="url(#bm)"/><rect x="17" y="34" width="30" height="8" rx="1.5" fill="url(#bm)"/><rect x="9" y="42" width="46" height="9" rx="1.5" fill="url(#bm)"/><path d="M7 56h50" stroke="#38BDF8" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 4"/></svg>`;
  return wrap;
}

export function topbar(title, actions = [], { onBack } = {}) {
  return h('header.topbar', [
    h('button.icon-btn', { type: 'button', 'aria-label': 'رجوع', onclick: () => (onBack ? onBack() : back('/')) }, icon('back', 22)),
    h('div.t', bidi(title)),
    ...actions,
  ]);
}

/** حالة الذكاء الاصطناعي كشارة قابلة للنقر. */
export function aiPill() {
  const on = aiReady();
  return h('button.pill-ai' + (on ? '.on' : '.off'), { type: 'button', title: on ? 'الذكاء الاصطناعي مفعّل' : 'الذكاء الاصطناعي غير مفعّل', onclick: () => go('/settings') }, [
    icon(on ? 'sparkles' : 'offline', 15),
    on ? aiShortLabel() : 'غير مفعّل',
  ]);
}

export function kbBadge() {
  return h('span.badge.ok', [icon('check', 12), 'جاهز دون اتصال']);
}

/** عنصر عنوان من المكتبة. */
export function topicItem(t, { onClick, showCat = true } = {}) {
  const cat = CAT_BY_ID[t.cat];
  const type = TYPE_BY_ID[t.types[0]];
  return h('button.item', { type: 'button', onclick: onClick || (() => go(`/create?topic=${t.id}`)) }, [
    h('div.lead-ico', cat?.icon || '📄'),
    h('div.grow', [
      h('div.t', bidi(t.title)),
      h('div.s', [
        showCat && cat ? h('span', cat.short || cat.name) : null,
        type ? h('span.badge', `${type.icon} ${type.short}`) : null,
        KB[t.id] ? kbBadge() : null,
      ]),
    ]),
    icon('chevron', 18, 'chev'),
  ]);
}

const STATUS = {
  generating: ['badge.warn', 'قيد الإنشاء'],
  partial: ['badge.warn', 'غير مكتمل'],
  error: ['badge.danger', 'تعذّر الإنشاء'],
};

/** عنصر تقرير محفوظ. */
export function reportItem(r, { onMore } = {}) {
  const type = getType(r.typeId);
  const st = STATUS[r.status];
  return h('div.item', { role: 'button', tabindex: 0, onclick: () => go(`/report/${r.id}`) }, [
    h('div.lead-ico', type.icon),
    h('div.grow', [
      h('div.t', bidi(r.title)),
      h('div.s', [
        h('span', type.short),
        h('span', '•'),
        h('span', ago(r.updatedAt)),
        r.words ? h('span', `• ${fmtNum(r.words)} كلمة`) : null,
        r.source === 'ai' ? h('span.badge.accent', [icon('sparkles', 11), 'ذكاء اصطناعي']) : h('span.badge', 'دون اتصال'),
        st ? h('span.' + st[0], st[1]) : null,
      ]),
    ]),
    onMore ? h('button.icon-btn', { type: 'button', 'aria-label': 'خيارات', onclick: (e) => { e.stopPropagation(); onMore(r); } }, icon('more', 20)) : icon('chevron', 18, 'chev'),
  ]);
}

export function sectionTitle(text, more) {
  return h('h2.sec', [text, more ? h('button.more', { type: 'button', onclick: more.onClick }, more.label) : null]);
}

export function aiNeeded(message = 'هذه الميزة تحتاج تفعيل الذكاء الاصطناعي') {
  return h('div.notice.warn', [icon('key', 18), h('div.grow', [
    h('div', message),
    h('button.btn.sm.mt', { type: 'button', onclick: () => go('/settings') }, 'فعّله من الإعدادات'),
  ])]);
}

export function stateAI() { return state.ai; }
