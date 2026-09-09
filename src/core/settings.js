/** إعدادات التطبيق: المظهر، التنبيهات، النسخ الاحتياطي، ومعلومات الخصوصية. */

import { h, fill, chipGroup, settingRow, toggle as toggleSwitch } from './dom.js';
import { state, save, exportAll, importAll, resetAll, emit } from './store.js';
import { sheet, toast, confirmSheet, applyAccent } from './ui.js';
import { Scheduler, isNative } from './native.js';
import { durMin } from './fmt.js';

const ACCENTS = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#60a5fa'];

export function openSettings(onChange) {
  const body = h('div');
  sheet('الإعدادات', body);

  function render() {
    const s = state.settings;

    fill(body, [
      h('h2.sec', 'المظهر'),
      h('div.chips', ACCENTS.map((c) => h('button.chip' + (s.accent === c ? '.on' : ''), {
        style: { background: c, borderColor: c, color: '#0b0e14', fontWeight: '700' },
        onclick: () => { s.accent = c; applyAccent(c); save(); render(); onChange?.(); },
      }, s.accent === c ? '✓' : '‏'))),

      h('h2.sec', 'الوقت'),
      settingRow('نظام ١٢ ساعة (ص/م)', null, toggleSwitch(s.hour12, (on) => { s.hour12 = on; save(); onChange?.(); })),
      h('div.field', { style: { marginTop: '10px' } }, [
        h('label', 'أول أيام الأسبوع'),
        chipGroup(
          [{ value: 6, label: 'السبت' }, { value: 0, label: 'الأحد' }, { value: 1, label: 'الإثنين' }],
          s.weekStart,
          (v) => { s.weekStart = v; save(); onChange?.(); },
        ),
      ]),

      h('h2.sec', 'التنبيهات'),
      settingRow('تفعيل الإشعارات', 'المنبّهات والتذكيرات وتحذير الاستخدام',
        toggleSwitch(s.notifications, async (on) => {
          s.notifications = on; save();
          if (on) await Scheduler.requestPermissions().catch(() => {});
        })),
      settingRow('اهتزاز عند اللمس', null, toggleSwitch(s.haptics, (on) => { s.haptics = on; save(); })),
      isNative() ? h('button.btn.ghost.block', {
        style: { marginTop: '10px' },
        onclick: () => Scheduler.openExactAlarmSettings(),
      }, '⚙ إعدادات المنبّهات الدقيقة في النظام') : null,

      h('h2.sec', 'البدء'),
      h('div.field', [
        h('label', 'القسم الذي يفتح أولًا'),
        chipGroup([
          { value: 'music', label: 'الأغاني' },
          { value: 'time', label: 'الوقت' },
          { value: 'commit', label: 'التزاماتي' },
          { value: 'places', label: 'الأماكن' },
          { value: 'growth', label: 'الإنتاجية' },
        ], s.startSection, (v) => { s.startSection = v; save(); }),
      ]),

      h('h2.sec', 'حدّ الاستخدام اليومي'),
      h('div.card.tight', [
        h('div.row.between', [
          h('span.muted', 'تحذير بعد'),
          h('b.mono', durMin(state.time.usage.dailyLimitMin)),
        ]),
        h('input', {
          type: 'range', min: 60, max: 720, step: 30, value: state.time.usage.dailyLimitMin,
          onchange: (e) => {
            const v = Number(e.target.value);
            state.time.usage.dailyLimitMin = v;
            state.time.usage.warnAtMin = [Math.round(v * 0.5), Math.round(v * 0.8), v];
            save(); emit('usage'); render();
          },
        }),
      ]),

      h('h2.sec', 'بياناتي'),
      h('div.card.tight', [
        h('div.card-s', 'كل بياناتك محفوظة داخل جهازك فقط. لا حساب، ولا خادم، ولا مزامنة.'),
      ]),
      h('div.grid2', [
        h('button.btn', { onclick: doExport }, '⬆ تصدير نسخة'),
        h('button.btn', { onclick: () => doImport(render, onChange) }, '⬇ استيراد نسخة'),
      ]),
      h('button.btn.danger.block', {
        style: { marginTop: '10px' },
        onclick: async () => {
          if (!await confirmSheet('مسح كل البيانات', 'ستُحذف كل المنبّهات والمهام والأماكن والتقدّم. لا يمكن التراجع.')) return;
          resetAll();
          toast('أُعيد التطبيق إلى حالته الأولى', 'ok');
          onChange?.();
        },
      }, '🗑 مسح كل البيانات'),

      h('h2.sec', 'عن التطبيق'),
      h('div.card.tight', [
        h('div.card-t', 'Your World'),
        h('div.card-s', 'خمسة أقسام: أغانيك، وقتك، التزاماتك، أماكنك، وإنتاجيتك — '
          + 'وكلّها تعمل دون إنترنت. الشبكة تُستعمل فقط إن طلبت تنزيل صور خريطة لمنطقتك.'),
      ]),
    ]);
  }

  render();
}

function doExport() {
  const data = exportAll();
  const name = `your-world-backup-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('صُدّرت نسختك', 'ok');
  } catch {
    // بديل: عرض النص لنسخه يدويًا
    sheet('نسخة احتياطية', h('div', [
      h('p.muted', 'انسخ هذا النص واحفظه في مكان آمن.'),
      h('textarea', { value: data, style: { minHeight: '220px' }, readonly: true }),
    ]));
  }
}

function doImport(render, onChange) {
  const input = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      importAll(await file.text());
      applyAccent(state.settings.accent);
      toast('اُستوردت النسخة', 'ok');
      render();
      onChange?.();
    } catch {
      toast('ملف غير صالح', 'err');
    }
  };
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}
