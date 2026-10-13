/** محرّر قاعدة التكرار — يغطّي: يومي، أيام أسبوع، كل N يوم، شهري، سنوي، مع نطاق زمني. */

import { h, fill, chipGroup } from '../../core/dom.js';
import { AR_DAYS_SHORT, AR_MONTHS, longDate } from '../../core/fmt.js';
import { sheet } from '../../core/ui.js';
import { normalize, describe, preview, scopeEndOfMonth, scopeEndOfYear, scopeDays } from './repeat.js';

const TYPES = [
  { value: 'none', label: 'مرّة واحدة' },
  { value: 'daily', label: 'كل يوم' },
  { value: 'weekly', label: 'أيام الأسبوع' },
  { value: 'everyN', label: 'كل N يوم' },
  { value: 'monthly', label: 'شهريًا' },
  { value: 'yearly', label: 'سنويًا' },
];

const SCOPES = [
  { value: 'forever', label: 'بلا نهاية' },
  { value: 'month', label: 'حتى نهاية هذا الشهر' },
  { value: 'year', label: 'حتى نهاية السنة' },
  { value: 'days', label: 'لعدد أيام' },
  { value: 'months', label: 'في أشهر محدّدة' },
];

/**
 * يفتح المحرّر. onSave يستقبل القاعدة الجديدة.
 * fireAt: وقت الإطلاق المرجعي لعرض المعاينة.
 */
export function openRepeatEditor(rule, onSave, fireAt = Date.now()) {
  const r = normalize(rule);
  if (!r.anchor) r.anchor = fireAt;
  let scope = r.months.length ? 'months'
    : r.until > 0 ? (r.until === scopeEndOfMonth() ? 'month' : r.until === scopeEndOfYear() ? 'year' : 'days')
      : 'forever';
  let scopeDaysCount = 30;

  const body = h('div');
  const panel = sheet('التكرار', body);

  function apply() {
    if (scope === 'forever') { r.until = 0; r.months = []; }
    else if (scope === 'month') { r.until = scopeEndOfMonth(); r.months = []; }
    else if (scope === 'year') { r.until = scopeEndOfYear(); r.months = []; }
    else if (scope === 'days') { r.until = scopeDays(scopeDaysCount); r.months = []; }
    else if (scope === 'months') { r.until = 0; }
  }

  function render() {
    apply();
    const upcoming = preview(r, fireAt, 5);

    fill(body, [
      chipGroup(TYPES, r.type, (v) => { r.type = v; render(); }),

      r.type === 'weekly' ? h('div', [
        h('h2.sec', 'الأيام'),
        chipGroup(
          AR_DAYS_SHORT.map((d, i) => ({ value: i, label: d })),
          r.days,
          (days) => { r.days = days; render(); },
          { multi: true },
        ),
      ]) : null,

      r.type === 'everyN' ? h('div', [
        h('h2.sec', 'الفاصل'),
        h('div.row', [
          h('span.muted', 'كل'),
          h('input', {
            type: 'number', min: 1, max: 365, value: r.interval,
            style: { width: '90px' },
            oninput: (e) => { r.interval = Math.max(1, Number(e.target.value) || 1); },
            onchange: render,
          }),
          h('span.muted', 'يوم — ابتداءً من'),
          h('b', longDate(new Date(r.anchor))),
        ]),
        h('div.chips', { style: { marginTop: '8px' } }, [2, 3, 4, 5, 7, 10, 14, 21, 30].map((n) =>
          h('button.chip' + (r.interval === n ? '.on' : ''), {
            onclick: () => { r.interval = n; render(); },
          }, `كل ${n}`))),
      ]) : null,

      r.type !== 'none' ? h('div', [
        h('h2.sec', 'نطاق التطبيق'),
        chipGroup(SCOPES, scope, (v) => { scope = v; render(); }),

        scope === 'days' ? h('div.row', { style: { marginTop: '10px' } }, [
          h('span.muted', 'لمدة'),
          h('input', {
            type: 'number', min: 1, max: 3650, value: scopeDaysCount, style: { width: '100px' },
            oninput: (e) => { scopeDaysCount = Math.max(1, Number(e.target.value) || 1); },
            onchange: render,
          }),
          h('span.muted', 'يومًا'),
        ]) : null,

        scope === 'months' ? h('div', { style: { marginTop: '10px' } }, [
          chipGroup(
            AR_MONTHS.map((m, i) => ({ value: i + 1, label: m })),
            r.months,
            (months) => { r.months = months; render(); },
            { multi: true },
          ),
        ]) : null,
      ]) : null,

      h('div.card.tight', { style: { marginTop: '14px' } }, [
        h('div.card-t', describe(r)),
        upcoming.length
          ? h('div.card-s', ['المواعيد القادمة: ', upcoming.map((t) => longDate(new Date(t))).join(' · ')])
          : h('div.card-s', 'لا مواعيد ضمن النطاق المحدّد'),
      ]),

      h('button.btn.primary.block', {
        style: { marginTop: '12px' },
        onclick: () => {
          apply();
          onSave(normalize(r));
          panel.close();
        },
      }, 'حفظ'),
    ]);
  }

  render();
}
