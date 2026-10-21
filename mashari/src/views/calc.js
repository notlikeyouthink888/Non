/** الحسبة: تكاليف البداية، المصاريف الشهرية، الدخل المتوقع، والنتيجة (صافي الربح ومدة رجوع رأس المال). */

import { h, fill, chipGroup } from '../core/dom.js';
import { uid } from '../core/store.js';
import { parseNum, money, moneyShort, num, currencySymbol } from '../core/text.js';
import { haptic } from '../core/ui.js';
import { touch, calcTotals } from '../model.js';
import { SETUP_ITEMS, MONTHLY_ITEMS } from '../data/guide.js';

function ensureCalc(study) {
  if (!study.calc) study.calc = { setup: [], monthly: [], mode: 'daily', daily: null, margin: null, days: 30, direct: null };
  return study.calc;
}

/** حقل مبلغ: يقبل الأرقام العربية، ويرتّب الفواصل عند الخروج منه. */
function amountInput(value, onValue, placeholder = '0') {
  const input = h('input.amount', {
    type: 'text', inputMode: 'decimal', placeholder, dir: 'ltr',
    value: value ? num(value, 2) : '',
  });
  input.addEventListener('input', () => onValue(parseNum(input.value)));
  input.addEventListener('blur', () => {
    const n = parseNum(input.value);
    input.value = n ? num(n, 2) : '';
  });
  input.addEventListener('focus', () => input.select());
  return input;
}

export function calcView(study) {
  const c = ensureCalc(study);
  const wrap = h('div.calc');
  const out = {};
  let focusId = null;

  const changed = () => { touch(study); updateTotals(); };

  function itemsCard(key, title, sub, quick) {
    const items = c[key];
    const rows = items.map((it) => {
      const name = h('input.iname', { value: it.name || '', placeholder: 'البند', maxLength: 60 });
      name.addEventListener('input', () => { it.name = name.value; touch(study); });
      const amt = amountInput(it.amount, (v) => { it.amount = v; changed(); });
      if (focusId === it.id) requestAnimationFrame(() => (it.name ? amt : name).focus());
      return h('div.irow', [
        name,
        amt,
        h('button.x', {
          type: 'button', 'aria-label': 'حذف البند',
          onclick: () => { c[key] = c[key].filter((x) => x.id !== it.id); touch(study); render(); },
        }, '✕'),
      ]);
    });
    const used = new Set(items.map((it) => it.name));
    const addItem = (name = '') => {
      const it = { id: uid('i'), name, amount: null };
      c[key].push(it);
      focusId = it.id;
      touch(study);
      haptic();
      render();
    };
    out[key] = h('b.mono');
    return h('div.card', [
      h('div.card-t', title),
      h('div.card-s', sub),
      rows.length ? h('div.irows', rows) : null,
      h('div.chips.mt', [
        ...quick.filter((q) => !used.has(q)).map((q) => h('button.chip.sm', { type: 'button', onclick: () => addItem(q) }, '＋ ' + q)),
        h('button.chip.sm.accent', { type: 'button', onclick: () => addItem('') }, '＋ بند ثاني'),
      ]),
      h('div.total', [h('span', 'المجموع'), out[key]]),
    ]);
  }

  function incomeCard() {
    const body = h('div');
    const renderBody = () => {
      if (c.mode === 'direct') {
        fill(body, [
          h('div.field', [
            h('label', `الربح الشهري قبل المصاريف (${currencySymbol()})`),
            amountInput(c.direct, (v) => { c.direct = v; changed(); }, 'مثلًا 3,000,000'),
            h('div.muted.hint', 'مفيد للمشاريع اللي دخلها شهري: مولدة، اشتراكات، إيجارات…'),
          ]),
        ]);
      } else {
        const margin = h('input.amount', { type: 'text', inputMode: 'decimal', dir: 'ltr', placeholder: 'مثلًا 25', value: c.margin ?? '' });
        margin.addEventListener('input', () => { const v = parseNum(margin.value); c.margin = v === null ? null : Math.max(0, Math.min(100, v)); changed(); });
        const days = h('input.amount', { type: 'text', inputMode: 'numeric', dir: 'ltr', value: c.days ?? 30 });
        days.addEventListener('input', () => { const v = parseNum(days.value); c.days = v === null ? 30 : Math.max(1, Math.min(31, Math.round(v))); changed(); });
        fill(body, [
          h('div.field', [
            h('label', `مبيعات اليوم المتوقعة (${currencySymbol()})`),
            amountInput(c.daily, (v) => { c.daily = v; changed(); }, 'مثلًا 400,000'),
          ]),
          h('div.grid2', [
            h('div.field', [h('label', 'نسبة الربح من البيع %'), margin]),
            h('div.field', [h('label', 'أيام الشغل بالشهر'), days]),
          ]),
        ]);
      }
    };
    renderBody();
    out.gross = h('b.mono');
    return h('div.card', [
      h('div.card-t', '💵 الدخل المتوقع'),
      chipGroup([
        { value: 'daily', label: 'حسب البيع اليومي' },
        { value: 'direct', label: 'أكتب الربح الشهري' },
      ], c.mode || 'daily', (v) => { c.mode = v; touch(study); renderBody(); updateTotals(); }),
      h('div.mt', body),
      h('div.total', [h('span', 'الربح قبل المصاريف بالشهر'), out.gross]),
    ]);
  }

  function resultCard() {
    out.net = h('div.big-num.mono');
    out.netLabel = h('div.muted');
    out.payback = h('div.res-v');
    out.yearly = h('div.res-v');
    out.breakEven = h('div.muted.hint');
    return h('div.card.result', [
      h('div.card-t', '📊 النتيجة'),
      h('div.res-main', [out.netLabel, out.net]),
      h('div.grid2.res-grid', [
        h('div.res', [h('div.muted', 'يرجع رأس المال خلال'), out.payback]),
        h('div.res', [h('div.muted', 'الربح بالسنة'), out.yearly]),
      ]),
      out.breakEven,
      h('div.muted.hint', 'حسبة تقريبية حسب الأرقام اللي كتبتها — غيّرها وشوف الفرق.'),
    ]);
  }

  function updateTotals() {
    const t = calcTotals(c);
    if (out.setup) out.setup.textContent = money(t.setup);
    if (out.monthly) out.monthly.textContent = money(t.monthly);
    if (out.gross) out.gross.textContent = t.gross === null ? '—' : money(t.gross);
    if (!out.net) return;
    if (t.net === null) {
      out.netLabel.textContent = 'صافي الربح الشهري';
      out.net.textContent = '—';
      out.net.className = 'big-num mono';
    } else {
      out.netLabel.textContent = t.net >= 0 ? 'صافي الربح الشهري' : 'خسارة شهرية';
      out.net.textContent = money(Math.abs(t.net));
      out.net.className = 'big-num mono ' + (t.net >= 0 ? 'pos' : 'neg');
    }
    out.payback.textContent = t.payback
      ? (t.payback < 1 ? 'أقل من شهر' : `${num(t.payback, 1)} شهر${t.payback >= 12 ? ` (≈ ${num(t.payback / 12, 1)} سنة)` : ''}`)
      : (t.net !== null && t.net <= 0 ? 'ما يرجع بهالأرقام' : '—');
    out.yearly.textContent = t.net === null ? '—' : moneyShort(t.net * 12);
    out.breakEven.textContent = t.breakEvenDaily
      ? `⚖️ حتى تغطي المصاريف الشهرية لازم تبيع تقريبًا ${moneyShort(t.breakEvenDaily)} باليوم.`
      : '';
  }

  function render() {
    fill(wrap, [
      itemsCard('setup', '🏗 تكاليف البداية', 'تندفع مرة وحدة: إيجار مقدّم، ديكور، بضاعة، أجهزة…', SETUP_ITEMS),
      itemsCard('monthly', '🧾 المصاريف الشهرية', 'تتكرر كل شهر: إيجار، رواتب، مولدة، إعلانات…', MONTHLY_ITEMS),
      incomeCard(),
      resultCard(),
    ]);
    updateTotals();
    focusId = null;
  }

  render();
  return wrap;
}
