/**
 * لوحة مدير التطبيق: تتحكم بخادم «أساس» (server/worker.js) من التطبيق نفسه.
 * المفاتيح والتبديل بينها، النماذج التي تكتب للجميع، الحد اليومي وإيقاف الأجهزة،
 * تيليغرام، وسجل كل التقارير والمستخدمين.
 */

import { h, fill, field, toggle, chipGroup, settingRow } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { state, update, MODELS } from '../core/store.js';
import { REPORT_TYPES } from '../data/types.js';
import { toast, confirmSheet, sheet } from '../core/ui.js';
import { ago, fmtNum } from '../core/fmt.js';
import { bidi } from '../core/arabic.js';
import { adminApi, adminUrl } from '../core/server.js';
import { allModels } from '../ai/openrouter.js';
import { parseBlocks } from '../report/md.js';
import { blocksToNodes } from '../report/render.js';
import { topbar } from './common.js';

const STATUS_TEXT = {
  ok: 'يعمل', daily: 'انتهت حصة اليوم', minute: 'حد الدقيقة', credits: 'انتهى الرصيد', invalid: 'مرفوض', off: 'موقوف',
};
const time = (t) => new Date(t).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* بديل */ }
  const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  return !!ok;
}

/** ورقة إدخال نص بسيطة؛ تعيد القيمة أو null عند الإلغاء. */
function promptSheet(title, hint, value = '') {
  return new Promise((resolve) => {
    let done = false;
    const inp = h('input', { value });
    const sh = sheet(title, ({ close }) => h('div', [
      hint ? h('p.hint', hint) : null,
      inp,
      h('div.grid2.mt', [
        h('button.btn.ghost', { type: 'button', onclick: () => close() }, 'إلغاء'),
        h('button.btn.primary', { type: 'button', onclick: () => { done = true; resolve(inp.value); close(); } }, 'حفظ'),
      ]),
    ]), { onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => inp.focus(), 50);
    return sh;
  });
}

export default {
  mount(root) {
    const body = h('div.wrap.admin');
    root.append(topbar('لوحة مدير التطبيق', [
      h('button.icon-btn', { type: 'button', 'aria-label': 'تحديث', onclick: () => load() }, icon('refresh', 20)),
    ]), body);
    let st = null;

    /* ── الدخول ── */
    function loginView(err = '') {
      const urlIn = h('input.ltr', { value: state.admin.url || state.server.url || '', placeholder: 'https://asas-server.اسمك.workers.dev', autocapitalize: 'off', spellcheck: false, name: 'admin-url' });
      const pwIn = h('input.ltr', { type: 'password', value: state.admin.password || '', placeholder: 'كلمة سر المدير (ADMIN_PASSWORD)', name: 'admin-password' });
      const out = h('div.row', { style: { minHeight: '24px' } }, err ? [icon('alert', 16), h('span', { style: { color: 'var(--danger)' } }, err)] : []);
      fill(body, [
        h('p.sub', 'خادمك يحفظ مفاتيح API ويوزّعها على الناس دون أن يروها، وأنت تتحكم بكل شيء من هنا.'),
        h('div.card', [
          field('رابط الخادم', urlIn),
          field('كلمة سر المدير', pwIn),
          out,
          h('button.btn.primary.block', {
            type: 'button',
            onclick: async () => {
              fill(out, [h('div.spinner'), h('span.muted', 'يتصل…')]);
              try {
                const url = urlIn.value.trim().replace(/\/+$/, '');
                await adminApi('/state', { url, password: pwIn.value });
                update((s) => { s.admin = { url, password: pwIn.value }; }, 'admin');
                load();
              } catch (e) { fill(out, [icon('alert', 16), h('span', { style: { color: 'var(--danger)' } }, e.message)]); }
            },
          }, [icon('shield', 16), 'دخول']),
        ]),
        setupGuide(),
      ]);
    }

    function setupGuide() {
      return h('details.more-opts', [
        h('summary', [icon('info', 18), 'كيف أنشئ الخادم؟ (مجاني، مرة واحدة)']),
        h('ol.steps-mini', [
          h('li', 'سجّل مجانًا في dash.cloudflare.com.'),
          h('li', 'Storage & Databases ← D1 ← Create ← الاسم asas-db.'),
          h('li', 'Workers & Pages ← Create ← Worker ← الاسم asas-server ← Deploy.'),
          h('li', 'Edit code ← احذف ما فيه والصق كود الخادم (الزر بالأسفل) ← Deploy.'),
          h('li', 'إعدادات الـ Worker ← Bindings ← Add ← D1 database ← الاسم DB ← asas-db.'),
          h('li', 'إعدادات الـ Worker ← Variables and Secrets ← Add ← Secret ← ADMIN_PASSWORD = كلمة سر تختارها.'),
          h('li', 'انسخ رابط الـ Worker (ينتهي بـ workers.dev) وادخل به هنا بكلمة السر.'),
          h('li', 'لنسخة عامة يفتحها الناس جاهزة: ضع الرابط في GitHub ← Settings ← Variables ← ASAS_SERVER_URL، فيُبنى التطبيق مربوطًا بخادمك.'),
        ]),
        h('button.btn.block', {
          type: 'button',
          onclick: async () => {
            const { default: src } = await import('../../server/worker.js?raw');
            toast((await copy(src)) ? 'نُسخ كود الخادم ✓ الصقه في Edit code' : 'تعذّر النسخ', 'ok');
          },
        }, [icon('copy', 16), 'انسخ كود الخادم']),
      ]);
    }

    async function load() {
      if (!adminUrl() || !state.admin.password) { loginView(); return; }
      if (!st) fill(body, h('div.row', [h('div.spinner'), h('span.muted', 'يحمّل…')]));
      try {
        st = await adminApi('/state');
        render();
      } catch (e) {
        loginView(e.message);
      }
    }

    /** يحفظ الإعدادات؛ لا يعيد رسم اللوحة إلا حين يلزم حتى لا يضيع ما يُكتب في خانات أخرى. */
    const save = async (patch, msg = 'حُفظ ✓', { redraw = false } = {}) => {
      try {
        const r = await adminApi('/config', { method: 'PUT', body: patch });
        st.config = r.config;
        toast(msg, 'ok');
        if (redraw) render();
      } catch (e) { toast(e.message, 'err'); }
    };

    function render() {
      const s = st.stats;
      const live = st.keys.filter((k) => k.provider === (st.config.provider === 'anthropic' ? 'anthropic' : 'openrouter') && k.status === 'ok');
      fill(body, [
        h('div.stats4', [
          stat(s.reportsToday, 'تقارير اليوم'), stat(s.reportsTotal, 'كل التقارير'), stat(s.devices, 'المستخدمون'), stat(live.length, 'مفاتيح تعمل'),
        ]),
        !live.length ? h('div.notice.warn', [icon('alert', 18), h('div.grow', 'لا يوجد مفتاح يعمل الآن لطريقة الكتابة المختارة — أضف مفتاحًا حتى يكتب التطبيق للناس.')]) : null,
        h('h2.sec', [icon('key', 18), 'مفاتيح API']),
        keysCard(),
        h('h2.sec', [icon('sparkles', 18), 'النماذج التي تكتب للجميع']),
        modelsCard(),
        h('h2.sec', [icon('sliders', 18), 'القواعد']),
        rulesCard(),
        h('h2.sec', [icon('bolt', 18), 'تنبيهات تيليغرام']),
        telegramCard(),
        h('h2.sec', [icon('file', 18), 'التقارير']),
        reportsCard(),
        h('h2.sec', [icon('list', 18), 'المستخدمون']),
        devicesCard(),
        h('div.card', [
          h('div.row.between', [h('span.muted.ltr', adminUrl()), h('button.btn.sm.ghost', { type: 'button', onclick: () => { update((x) => { x.admin = { url: x.admin.url, password: '' }; }, 'admin'); st = null; loginView(); } }, 'خروج')]),
        ]),
        setupGuide(),
      ]);
    }

    const stat = (n, label) => h('div.stat', [h('strong', fmtNum(n)), h('span', label)]);

    /* ── المفاتيح ── */
    function keysCard() {
      const card = h('div.card');
      const keyRow = (k) => {
        const status = STATUS_TEXT[k.status] || k.status;
        const when = k.until && k.until < 9e14 ? ` — يرجع ${time(k.until)}` : '';
        const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg, 'ok'); await load(); } catch (e) { toast(e.message, 'err'); } };
        return h('div.key-row', { dataset: { id: k.id } }, [
          h('div.grow', [
            h('div.t', [k.label, ' ', h('span.badge', k.provider === 'anthropic' ? 'Claude' : 'OpenRouter'), ' ', h('span.ltr.muted', k.hint)]),
            h('div.s', [h('span.kst' + (k.status === 'ok' ? '.ok' : '.bad'), status + when), ` • اليوم ${fmtNum(k.today)} • الكل ${fmtNum(k.uses)}`]),
            k.note ? h('div.s.muted.note', k.note.slice(0, 140)) : null,
          ]),
          h('div.key-acts', [
            h('button.btn.sm', { type: 'button', onclick: () => act(async () => { const r = await adminApi(`/keys/${k.id}/test`, { method: 'POST' }); toast(r.ok ? `«${k.label}»: ${r.info}` : `«${k.label}» لا يعمل: ${r.info}`, r.ok ? 'ok' : 'err', 4000); }) }, 'اختبار'),
            k.status !== 'ok' && k.status !== 'off' ? h('button.btn.sm', { type: 'button', onclick: () => act(() => adminApi(`/keys/${k.id}`, { method: 'PATCH', body: { reset: true } }), 'أُعيد تفعيله') }, 'إعادة تفعيل') : null,
            toggle(k.enabled, (v) => act(() => adminApi(`/keys/${k.id}`, { method: 'PATCH', body: { enabled: v } }))),
            h('button.icon-btn', {
              type: 'button', 'aria-label': 'حذف',
              onclick: async () => { if (await confirmSheet('حذف المفتاح', `يُحذف «${k.label}» من الخادم.`)) act(() => adminApi(`/keys/${k.id}`, { method: 'DELETE' }), 'حُذف'); },
            }, icon('trash', 18)),
          ]),
        ]);
      };
      let prov = st.config.provider === 'anthropic' ? 'anthropic' : 'openrouter';
      const labelIn = h('input', { placeholder: 'اسم للتمييز (مثلًا: حسابي الثاني)', name: 'key-label' });
      const keyIn = h('input.ltr', { placeholder: 'sk-or-v1-… أو sk-ant-api03-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, name: 'key-secret' });
      fill(card, [
        st.keys.length ? h('div.keys', st.keys.map(keyRow)) : h('p.hint', 'لا توجد مفاتيح بعد.'),
        h('div.hint', 'يستعمل الخادم المفاتيح بالترتيب: حين تنتهي حصة مفتاح أو رصيده ينتقل تلقائيًا إلى التالي ويرسل لك تنبيهًا، ويرجع للمفتاح بعد تجدد حصته.'),
        h('div.add-key', [
          field('مفتاح جديد', chipGroup([{ value: 'openrouter', label: 'OpenRouter' }, { value: 'anthropic', label: 'Claude' }], prov, (v) => { prov = v; })),
          labelIn,
          keyIn,
          h('button.btn.primary.block', {
            type: 'button',
            onclick: async () => {
              try {
                await adminApi('/keys', { method: 'POST', body: { provider: prov, label: labelIn.value, secret: keyIn.value } });
                toast('أُضيف المفتاح ✓', 'ok');
                await load();
              } catch (e) { toast(e.message, 'err'); }
            },
          }, [icon('plus', 16), 'أضف المفتاح']),
        ]),
      ]);
      return card;
    }

    /* ── النماذج ── */
    function modelsCard() {
      const card = h('div.card');
      const cfg = st.config;
      const draw = () => {
        const chain = cfg.textModels || [];
        fill(card, [
          field('الكتابة للمستخدمين عبر', chipGroup([{ value: 'openrouter', label: 'OpenRouter (مجاني أو مدفوع)' }, { value: 'anthropic', label: 'Claude' }], cfg.provider, (v) => save({ provider: v }, 'تغيّرت طريقة الكتابة ✓', { redraw: true }))),
          cfg.provider === 'anthropic'
            ? field('نموذج Claude', chipGroup(MODELS.map((m) => ({ value: m.id, label: m.name.replace('Claude ', '') })), cfg.claudeModel, (v) => save({ claudeModel: v }, 'حُفظ ✓', { redraw: true })), 'يحتاج مفتاح Claude برصيد. Haiku الأرخص بكثير، وOpus الأدق.')
            : h('div', [
              h('label.lbl', 'نماذج الكتابة (بالترتيب، حتى ثلاثة — الثاني والثالث بدائل تلقائية)'),
              chain.length
                ? h('div.list', chain.map((m, i) => h('div.item.static', [
                  h('div.grow', [h('div.t', `${i + 1}. ${m.name}`), h('div.s.ltr', m.id)]),
                  h('button.icon-btn', { type: 'button', 'aria-label': 'إزالة', onclick: () => save({ textModels: chain.filter((x) => x.id !== m.id) }, 'حُذف ✓', { redraw: true }) }, icon('x', 18)),
                ])))
                : h('p.hint', 'لم تختر نموذجًا: سيُستعمل الموجّه المجاني التلقائي (openrouter/free).'),
              chain.length < 3 ? h('button.btn.block.mt', { type: 'button', onclick: () => pickModel((m) => save({ textModels: [...chain, m] }, 'أُضيف النموذج ✓', { redraw: true })) }, [icon('plus', 16), 'أضف نموذج كتابة']) : null,
              h('div.row-set.mt', [
                h('div.grow', [h('div.t', 'نموذج التحقق من الصور'), h('div.s', cfg.visionModel ? cfg.visionModel.name : 'تلقائي (الموجّه المجاني)')]),
                h('button.btn.sm', { type: 'button', onclick: () => pickModel((m) => save({ visionModel: m }, 'حُفظ ✓', { redraw: true }), { vision: true }) }, 'اختيار'),
              ]),
            ]),
        ]);
      };
      draw();
      return card;
    }

    /** يختار نموذجًا من قائمة OpenRouter الحيّة (المجانية أولًا). */
    function pickModel(onPick, { vision = false } = {}) {
      let freeOnly = true;
      let q = '';
      let list = [];
      const box = h('div.list');
      const draw = () => {
        const shown = list.filter((m) => (!vision || m.vision) && (!freeOnly || m.free) && (!q || `${m.id} ${m.name}`.toLowerCase().includes(q))).slice(0, 60);
        fill(box, shown.length ? shown.map((m) => h('button.item', {
          type: 'button',
          onclick: () => { sh.close(); onPick({ id: m.id, name: m.name, vision: m.vision, structured: m.structured, json: m.json, ctx: m.ctx, maxOut: m.maxOut }); },
        }, [h('div.grow', [h('div.t', m.name), h('div.s', [h('span.ltr', m.id), m.free ? h('span.badge.ok', 'مجاني') : h('span.badge', 'مدفوع'), m.vision ? h('span.badge', 'يرى الصور') : null])])])) : h('p.hint', 'لا نتائج.'));
      };
      const sh = sheet(vision ? 'نموذج التحقق من الصور' : 'أضف نموذج كتابة', [
        h('input', { placeholder: 'ابحث: deepseek، qwen، gemini…', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } }),
        h('div.mt', chipGroup([{ value: 'free', label: 'المجانية فقط' }, { value: 'all', label: 'كل النماذج' }], 'free', (v) => { freeOnly = v === 'free'; draw(); })),
        h('p.hint', 'النماذج المدفوعة تحتاج رصيدًا في حساب OpenRouter الذي أضفت مفتاحه.'),
        box,
      ], { full: true });
      fill(box, h('div.row', [h('div.spinner'), h('span.muted', 'يجلب قائمة النماذج من OpenRouter…')]));
      allModels().then((l) => { list = l; draw(); }).catch(() => fill(box, h('p.hint', 'تعذّر جلب القائمة. تحقق من الإنترنت.')));
    }

    /* ── القواعد ── */
    function rulesCard() {
      const cfg = st.config;
      const nameIn = h('input', { value: cfg.appName || '', placeholder: 'أساس' });
      const noticeIn = h('textarea', { rows: 2, value: cfg.notice || '', placeholder: 'مثلًا: الخدمة مجانية لطلبة المرحلة الثانية — للتواصل: …' });
      // أنواع التقارير المتاحة للمستخدمين العاديين (الباقي للمدير وحده)
      const sel = new Set(Array.isArray(cfg.publicTypes) ? cfg.publicTypes : ['theory']);
      const typesBox = h('div.chips-wrap');
      const drawTypes = () => fill(typesBox, REPORT_TYPES.map((t) => h('button.chip' + (sel.has(t.id) ? '.on' : ''), {
        type: 'button',
        onclick: () => { if (sel.has(t.id)) sel.delete(t.id); else sel.add(t.id); drawTypes(); save({ publicTypes: [...sel] }); },
      }, `${t.icon} ${t.name}`)));
      drawTypes();
      return h('div.card', [
        field('أنواع التقارير المتاحة للمستخدمين', typesBox, 'ما لا تختاره يبقى لك وحدك (جهاز المدير). الافتراضي: تقرير نظري (بحث) فقط.'),
        field('الحد اليومي لكل مستخدم', chipGroup([3, 5, 10, 20, 50, 0].map((n) => ({ value: n, label: n ? `${n} تقارير` : 'بلا حد' })), cfg.dailyLimit, (v) => save({ dailyLimit: v })), 'يحمي مفاتيحك من الاستهلاك الزائد. تعديل قسم أو صور التقرير لا يُحسب تقريرًا جديدًا.'),
        settingRow('قبول مستخدمين جدد', 'أطفئه لتغلق التسجيل على من استعمل التطبيق سابقًا فقط', toggle(cfg.open, (v) => save({ open: v }))),
        settingRow('إلزام الكل بخادمك', 'يخفي خيارات المفاتيح الأخرى عند المستخدمين', toggle(cfg.lock, (v) => save({ lock: v }))),
        field('اسم التطبيق', nameIn),
        field('رسالة للمستخدمين', noticeIn, 'تظهر في الإعدادات وصفحة إنشاء التقرير.'),
        h('button.btn.block', { type: 'button', onclick: () => save({ appName: nameIn.value, notice: noticeIn.value }) }, 'حفظ الاسم والرسالة'),
      ]);
    }

    /* ── تيليغرام ── */
    function telegramCard() {
      const cfg = st.config;
      const tokIn = h('input.ltr', { value: cfg.telegram.hasToken ? cfg.telegram.token : '', placeholder: '123456789:ABC… (من @BotFather)', autocomplete: 'off', name: 'tg-token' });
      const chatIn = h('input.ltr', { value: cfg.telegram.chat || '', placeholder: 'رقم المحادثة (من @userinfobot)', name: 'tg-chat' });
      const n = cfg.notify;
      return h('div.card', [
        h('ol.steps-mini', [
          h('li', 'في تيليغرام افتح @BotFather ← /newbot ← اختر اسمًا، وانسخ الرمز (token).'),
          h('li', 'افتح بوتك واضغط Start، ثم افتح @userinfobot وانسخ رقمك (Id).'),
          h('li', 'الصقهما هنا واحفظ، ثم «رسالة تجربة».'),
        ]),
        field('رمز البوت', tokIn),
        field('رقم المحادثة', chatIn),
        settingRow('كل تقرير جديد (مع ملف نصه)', null, toggle(n.reports, (v) => save({ notify: { reports: v } }))),
        settingRow('انتهاء حصة مفتاح أو رصيده', null, toggle(n.keys, (v) => save({ notify: { keys: v } }))),
        settingRow('مستخدم جديد', null, toggle(n.users, (v) => save({ notify: { users: v } }))),
        h('div.grid2', [
          h('button.btn.primary', { type: 'button', onclick: () => save({ telegram: { token: tokIn.value, chat: chatIn.value } }, 'حُفظ تيليغرام ✓') }, 'حفظ'),
          h('button.btn', {
            type: 'button',
            onclick: async () => {
              try { await adminApi('/telegram/test', { method: 'POST' }); toast('وصلت رسالة التجربة ✓', 'ok'); } catch (e) { toast(`لم تصل: ${e.message}`, 'err', 4000); }
            },
          }, 'رسالة تجربة'),
        ]),
      ]);
    }

    /* ── التقارير ── */
    function reportsCard(device = null) {
      const card = h('div.card');
      const list = h('div.list.reports');
      let last = 9e15;
      const more = h('button.btn.sm.ghost.block', { type: 'button', onclick: () => page() }, 'المزيد');
      const row = (r) => h('button.item', { type: 'button', onclick: () => openReport(r.id) }, [
        h('div.grow', [
          h('div.t', bidi(r.title || 'بلا عنوان')),
          h('div.s', [h('span', r.name || 'بلا اسم'), r.type ? h('span.badge', r.type) : null, r.subject ? h('span', r.subject) : null, h('span', `${fmtNum(r.words)} كلمة`), h('span', ago(r.ts)), r.status !== 'ready' ? h('span.badge', r.status === 'error' ? 'فشل' : 'ناقص') : null]),
        ]),
        icon('chevron', 18, 'chev'),
      ]);
      async function page() {
        try {
          const { reports } = await adminApi(`/reports?before=${last}&limit=20${device ? `&device=${encodeURIComponent(device)}` : ''}`);
          reports.forEach((r) => list.append(row(r)));
          if (reports.length) last = reports[reports.length - 1].ts;
          more.style.display = reports.length < 20 ? 'none' : '';
          if (!list.children.length) fill(list, h('p.hint', 'لم يُنشئ أحد تقريرًا بعد.'));
        } catch (e) { toast(e.message, 'err'); }
      }
      fill(card, [list, more]);
      page();
      return card;
    }

    async function openReport(id) {
      let r;
      try { ({ report: r } = await adminApi(`/reports/${encodeURIComponent(id)}`)); } catch (e) { toast(e.message, 'err'); return; }
      const sh = sheet(r.title || 'تقرير', [
        h('div.notice', [icon('info', 18), h('div.grow', [
          h('div', `${r.name || 'بلا اسم'}${r.people ? ` — ${r.people}` : ''}`),
          h('div.muted', [r.type, r.subject, r.uni].filter(Boolean).join(' • ')),
          h('div.muted', `${fmtNum(r.words)} كلمة • ${r.model || 'دون اتصال'} • ${new Date(r.ts).toLocaleString('ar-IQ')}`),
        ])]),
        h('div.paper.admin-paper', blocksToNodes(parseBlocks(r.text || ''))),
        h('div.grid2.mt', [
          h('button.btn', { type: 'button', onclick: async () => toast((await copy(`# ${r.title}\n\n${r.text}`)) ? 'نُسخ النص ✓' : 'تعذّر النسخ', 'ok') }, [icon('copy', 16), 'نسخ النص']),
          h('button.btn.danger', {
            type: 'button',
            onclick: async () => {
              if (!(await confirmSheet('حذف من السجل', 'يُحذف التقرير من سجل الخادم فقط (لا من جهاز صاحبه).'))) return;
              try { await adminApi(`/reports/${encodeURIComponent(r.id)}`, { method: 'DELETE' }); sh.close(); load(); } catch (e) { toast(e.message, 'err'); }
            },
          }, [icon('trash', 16), 'حذف']),
        ]),
      ], { full: true });
    }

    /* ── المستخدمون ── */
    function devicesCard() {
      const card = h('div.card');
      fill(card, h('div.row', [h('div.spinner'), h('span.muted', 'يحمّل…')]));
      adminApi('/devices').then(({ devices }) => {
        const row = (d) => {
          const nameEl = h('div.t', d.name || 'بلا اسم');
          const rename = async () => {
            const v = await promptSheet('اسم المستخدم', 'غيّر الاسم الذي يظهر لك لهذا المستخدم', d.name || '');
            if (v == null || v.trim() === (d.name || '')) return;
            try { await adminApi(`/devices/${encodeURIComponent(d.id)}`, { method: 'PATCH', body: { name: v.trim() } }); d.name = v.trim(); nameEl.textContent = d.name || 'بلا اسم'; toast('تغيّر الاسم ✓', 'ok'); } catch (e) { toast(e.message, 'err'); }
          };
          return h('div.item.static', { dataset: { device: d.id } }, [
            h('div.grow', [
              h('div.row', { style: { gap: '6px' } }, [nameEl, h('button.icon-btn.sm', { type: 'button', 'aria-label': 'تعديل الاسم', onclick: rename }, icon('edit', 15))]),
              h('div.s', [h('span', `${fmtNum(d.reports)} تقرير`), h('span', `اليوم ${d.today}`), h('span', `آخر استعمال ${ago(d.last_seen)}`), d.platform ? h('span.badge', d.platform) : null, d.blocked ? h('span.badge', 'موقوف') : null]),
            ]),
            h('button.btn.sm.ghost', { type: 'button', onclick: () => sheet(`تقارير ${d.name || 'المستخدم'}`, [reportsCard(d.id)], { full: true }) }, 'تقاريره'),
            h('label.row', { style: { gap: '6px', fontSize: '12px' } }, ['إيقاف', toggle(d.blocked, async (v) => {
              try { await adminApi(`/devices/${encodeURIComponent(d.id)}`, { method: 'PATCH', body: { blocked: v } }); toast(v ? 'أُوقف هذا المستخدم' : 'أُعيد تفعيله', 'ok'); } catch (e) { toast(e.message, 'err'); }
            })]),
          ]);
        };
        fill(card, devices.length ? h('div.list', devices.map(row)) : h('p.hint', 'لا يوجد مستخدمون بعد.'));
      }).catch((e) => fill(card, h('p.hint', e.message)));
      return card;
    }

    load();
  },
};
