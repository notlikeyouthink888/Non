/** إعدادات التطبيق: المظهر، التنبيهات، النسخ الاحتياطي، ومعلومات الخصوصية. */

import { h, fill, chipGroup, settingRow, toggle as toggleSwitch } from './dom.js';
import {
  state, save, flush, exportAll, importAll, resetAll, emit,
  listSnapshots, restoreSnapshot, deleteSnapshot, snapshot, describeBackup,
} from './store.js';
import { sheet, toast, confirmSheet, applyAccent } from './ui.js';
import { Scheduler, isNative, saveToDownloads, listBackupFiles, readTextFile } from './native.js';
import { durMin, longDate } from './fmt.js';

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
          { value: 'music', label: '♪ الأغاني' },
          { value: 'time', label: '⏰ الوقت' },
          { value: 's2', label: '🧭 نظام S2' },
          { value: 'study', label: '📚 المذاكرة' },
          { value: 'workout', label: '🏋 التمارين' },
          { value: 'money', label: '💰 المصاريف' },
          { value: 'commit', label: '🎯 التزاماتي' },
          { value: 'places', label: '🗺 الأماكن' },
          { value: 'room', label: '🛏 غرفتي' },
          { value: 'growth', label: '📈 الإنتاجية' },
        ], s.startSection, (v) => { s.startSection = v; save(); }),
      ]),

      h('h2.sec', 'العملة'),
      chipGroup(['د.ع', 'ر.س', 'د.إ', 'ج.م', '$', '€'], state.money.currency, (v) => {
        state.money.currency = v; save(); emit('money'); onChange?.();
      }),

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
      h('button.btn.primary.block', { onclick: () => openBackups(onChange) }, '🗄 النسخ الاحتياطي والاسترجاع'),
      h('button.btn.danger.block', {
        style: { marginTop: '10px' },
        onclick: async () => {
          if (!await confirmSheet('مسح كل البيانات', 'ستُحذف كل المنبّهات والمهام والأماكن والتقدّم. تُؤخذ نسخة قبل المسح يمكن الرجوع إليها.')) return;
          await resetAll();
          toast('أُعيد التطبيق إلى حالته الأولى', 'ok');
          onChange?.();
        },
      }, '🗑 مسح كل البيانات'),

      h('h2.sec', 'عن التطبيق'),
      h('div.card.tight', [
        h('div.card-t', 'Your World'),
        h('div.card-s', 'عشرة أقسام: أغانيك، وقتك، نظام S2، مذاكرتك، تمارينك، مصاريفك، التزاماتك، أماكنك، غرفتك، وإنتاجيتك — '
          + 'وكلّها تعمل دون إنترنت. الشبكة تُستعمل فقط إن طلبت تنزيل صور خريطة لمنطقتك.'),
      ]),
    ]);
  }

  render();
}

/* ─────────────────── النسخ الاحتياطي ─────────────────── */

const bytesLabel = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`);

function stamp(at) {
  const d = new Date(at);
  return `${longDate(d)} · ${d.toTimeString().slice(0, 5)}`;
}

/** مركز النسخ: احفظ، ابحث عمّا في جهازك، استرجع من ملف أو من لقطة تلقائية. */
export function openBackups(onChange) {
  const body = h('div');
  sheet('النسخ الاحتياطي', body);

  const done = () => { applyAccent(state.settings.accent); render(); onChange?.(); };

  async function render() {
    const snaps = await listSnapshots();

    fill(body, [
      h('div.card.tight', h('div.card-s',
        'نسختك ملف JSON يحوي كل ما كتبته: التمارين والمهام والمنبّهات والمصاريف والمذاكرة. '
        + 'الصور والفيديو والرسوم تبقى في تخزين الجهاز ولا تدخل الملف.')),

      h('h2.sec', 'احفظ نسخة الآن'),
      h('button.btn.primary.block', { onclick: () => doExport() }, '⬆ احفظ في مجلّد التنزيلات'),
      h('button.btn.block', { style: { marginTop: '8px' }, onclick: () => showText() }, '📋 اعرض النصّ لأنسخه بنفسي'),

      h('h2.sec', 'استرجاع'),
      h('button.btn.block', { onclick: () => findOnDevice(done) }, '🔎 ابحث عن نسخي في الجهاز'),
      h('button.btn.block', { style: { marginTop: '8px' }, onclick: () => doImport(done) }, '📂 اختر ملف نسخة يدويًا'),

      h('h2.sec', `نسخ تلقائية داخل التطبيق (${snaps.length})`),
      h('div.card.tight', h('div.card-s',
        'التطبيق يأخذ لقطة من بياناتك كل بضع ساعات وقبل كل عملية خطرة. هذه اللقطات داخل التطبيق نفسه.')),
      snaps.length
        ? h('div.list', { style: { marginTop: '10px' } }, snaps.map((s) => h('div.card.tight', [
          h('div.row.between', [
            h('div', [
              h('div.card-t', stamp(s.at)),
              h('div.card-s', `${s.kind === 'auto' ? 'تلقائية' : 'قبل عملية'} · ${bytesLabel(s.size)}`),
            ]),
            h('div.row', { style: { gap: '6px' } }, [
              h('button.btn.sm.primary', {
                onclick: async () => {
                  if (!await confirmSheet('استرجاع هذه اللقطة', 'ستحلّ محلّ بياناتك الحالية (تُؤخذ لقطة قبلها).')) return;
                  await restoreSnapshot(s.key);
                  toast('رجعت بياناتك', 'ok');
                  done();
                },
              }, '↺ استرجع'),
              h('button.btn.sm.ghost', {
                onclick: async () => { await deleteSnapshot(s.key); render(); },
              }, '✕'),
            ]),
          ]),
        ])))
        : h('div.muted', { style: { marginTop: '8px' } }, 'لا لقطات بعد — ستظهر تلقائيًا مع الاستعمال.'),
      h('button.btn.block', {
        style: { marginTop: '10px' },
        onclick: async () => { await snapshot('manual'); toast('أُخذت لقطة', 'ok'); render(); },
      }, '＋ خذ لقطة الآن'),
    ]);
  }

  render();
}

async function doExport() {
  await flush();
  const data = exportAll();
  const name = `your-world-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // على أندرويد نكتب الملف فعليًا في التنزيلات ونخبر المستخدم بمكانه
  try {
    const path = await saveToDownloads({ name, text: data });
    if (path) {
      sheet('حُفظت نسختك', h('div', [
        h('div.card.tight', [
          h('div.card-t', 'مكان الملف'),
          h('div.card-s', { style: { direction: 'ltr', textAlign: 'left' } }, path),
        ]),
        h('p.muted', { style: { marginTop: '10px' } },
          'افتح تطبيق «ملفاتي» ← التنزيلات ← YourWorld لتجده. يمكنك نسخه إلى أي مكان آخر للأمان.'),
      ]));
      return;
    }
  } catch (err) {
    console.warn('[backup]', err);
  }

  // المتصفّح: تنزيل عادي
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
    showText();
  }
}

function showText() {
  const data = exportAll();
  sheet('نسخة احتياطية', h('div', [
    h('p.muted', 'انسخ هذا النص واحفظه في مكان آمن (ملاحظات، رسالة لنفسك…).'),
    h('textarea', { value: data, style: { minHeight: '220px' }, readonly: true }),
    h('button.btn.block', {
      style: { marginTop: '10px' },
      onclick: async () => {
        try { await navigator.clipboard.writeText(data); toast('نُسخ', 'ok'); }
        catch { toast('انسخه يدويًا', 'err'); }
      },
    }, '📋 انسخ الكل'),
  ]));
}

/** يبحث في الجهاز عن أي ملف نسخة قديمة ويعرضها للاسترجاع. */
async function findOnDevice(done) {
  const body = h('div', h('div.muted', 'جارٍ البحث في الجهاز…'));
  sheet('نسخي في الجهاز', body);

  let files = [];
  try { files = await listBackupFiles(); } catch { /* نعرض الفراغ */ }

  if (!files.length) {
    fill(body, [
      h('div.card.tight', [
        h('div.card-t', 'لم أجد ملف نسخة'),
        h('div.card-s',
          'قد تكون النسخة السابقة لم تُكتب أصلًا: الإصدار القديم كان يطلب من المتصفّح تنزيل الملف، '
          + 'وهذا لا ينجح دائمًا داخل التطبيق. من الآن فصاعدًا يُكتب الملف مباشرة في التنزيلات.'),
      ]),
      h('p.muted', { style: { marginTop: '10px' } },
        'بياناتك لم تضِع: هي داخل التطبيق كما هي، ويمكنك أخذ نسخة الآن. '
        + 'وإن كنت تذكر أنك حفظت الملف في مكان ما، اختره يدويًا.'),
      h('button.btn.primary.block', { style: { marginTop: '10px' }, onclick: () => doImport(done) },
        '📂 اختر الملف يدويًا'),
    ]);
    return;
  }

  fill(body, [
    h('p.muted', `وجدت ${files.length} ملفًا. اختر واحدًا لعرض ما فيه قبل الاسترجاع.`),
    h('div.list', { style: { marginTop: '10px' } }, files.map((f) => h('div.card.tight', [
      h('div.row.between', [
        h('div', { style: { minWidth: '0' } }, [
          h('div.card-t.ellipsis', f.name),
          h('div.card-s', `${stamp(f.modified)} · ${bytesLabel(f.size)} · ${f.where || ''}`),
        ]),
        h('button.btn.sm.primary', { onclick: () => previewFile(f, done) }, 'افتح'),
      ]),
    ]))),
  ]);
}

async function previewFile(f, done, preParsed = null) {
  let parsed = preParsed;
  if (!parsed) {
    let text = null;
    try { text = await readTextFile(f.uri); } catch { /* نعرض الخطأ */ }
    if (!text) { toast('تعذّرت قراءة الملف', 'err'); return; }
    try { parsed = JSON.parse(text); } catch { toast('الملف ليس نسخة صالحة', 'err'); return; }
  }

  sheet(f.name, h('div', [
    h('div.card.glow', [
      h('div.card-t', 'ما في هذه النسخة'),
      h('div.card-s', describeBackup(parsed)),
    ]),
    h('h2.sec', 'كيف أسترجعها؟'),
    h('button.btn.primary.block', {
      onclick: async () => {
        if (!await confirmSheet('استبدال بياناتي', 'سيحلّ محتوى النسخة محلّ بياناتك الحالية. تُؤخذ لقطة قبلها.')) return;
        await importAll(parsed);
        toast('رجعت نسختك', 'ok');
        done?.();
      },
    }, '↺ استبدل بياناتي بهذه النسخة'),
    h('button.btn.block', {
      style: { marginTop: '8px' },
      onclick: async () => {
        await importAll(parsed, { merge: true });
        toast('دُمجت النسخة مع بياناتك', 'ok');
        done?.();
      },
    }, '⊕ ادمجها مع ما عندي الآن'),
    h('p.muted', { style: { marginTop: '10px' } },
      'الدمج يحافظ على ما أضفته بعد النسخة، ويملأ ما كان ناقصًا منها.'),
  ]));
}

function doImport(done) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await previewFile({ name: file.name, size: file.size, modified: file.lastModified }, done, parsed);
    } catch {
      toast('ملف غير صالح', 'err');
    }
  };
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}
