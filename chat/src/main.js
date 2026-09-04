/**
 * محاورة — عميل محادثة يتصل بأي نموذج متوافق مع OpenAI.
 * التطبيق وسيط فقط: لا يفرض أي قيود ولا يعدّل ما ترسله أو تستلمه،
 * ولا يرسل أي بيانات لأي جهة عدا نقطة النهاية التي تحدّدها أنت.
 */
import { store, PRESETS, DEFAULT_SETTINGS } from './store.js';
import { chat, listModels, ApiError } from './api.js';
import { openSetup, setupDone, markSetupDone } from './setup.js';
import { openModelPicker } from './models.js';
import './style.css';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

let settings = store.getSettings();
let activeId = store.getActiveId();
let controller = null;
let busy = false;

/* ================= الهيكل ================= */
document.getElementById('app').innerHTML = `
  <header>
    <button class="iconbtn" id="btnMenu" title="المحادثات">☰</button>
    <span class="dot" id="dot" title="حالة الاتصال"></span>
    <span class="title" id="title">محاورة</span>
    <button class="iconbtn" id="btnNew" title="محادثة جديدة">✚</button>
    <button class="iconbtn" id="btnSettings" title="الإعدادات">⚙</button>
  </header>
  <div id="messages"></div>
  <div id="composer">
    <textarea id="input" rows="1" placeholder="اكتب رسالتك…" enterkeyhint="send"></textarea>
    <button id="send" title="إرسال">➤</button>
  </div>

  <div class="sheet" id="sheetConvos"><div class="panel">
    <h3>المحادثات <button class="iconbtn" data-close>✕</button></h3>
    <button class="btn" id="newConvo">✚ محادثة جديدة</button>
    <div id="convoList" style="margin-top:12px"></div>
    <div style="margin-top:20px;display:flex;gap:8px">
      <button class="btn ghost" id="exportBtn">تصدير الكل</button>
      <button class="btn ghost" id="importBtn">استيراد</button>
    </div>
    <input type="file" id="importFile" accept=".json" hidden>
  </div></div>

  <div class="sheet right" id="sheetSettings"><div class="panel">
    <h3>الإعدادات <button class="iconbtn" data-close>✕</button></h3>

    <label>الخدمة</label>
    <select id="sPreset"></select>
    <div class="hint" id="presetHint"></div>

    <label>نقطة النهاية (Base URL)</label>
    <input type="text" id="sBaseUrl" dir="ltr" placeholder="http://192.168.1.100:11434/v1">

    <label>مفتاح API (اتركه فارغاً للخوادم المحلية)</label>
    <input type="password" id="sApiKey" dir="ltr" placeholder="sk-…">

    <label>النموذج</label>
    <div class="row">
      <input type="text" id="sModel" dir="ltr" placeholder="llama3.1:8b">
      <button class="iconbtn fit" id="btnBrowse" title="تصفّح نماذج OpenRouter">⌕</button>
      <button class="iconbtn fit" id="btnModels" title="جلب النماذج من الخادم الحالي">⟳</button>
    </div>
    <select id="sModelList" style="margin-top:8px;display:none"></select>

    <label>تعليمات النظام (System Prompt)</label>
    <textarea id="sSystem" placeholder="حدّد شخصية النموذج وأسلوبه…"></textarea>
    <div class="hint">هذا الحقل هو ما يتحكّم فعلياً بأسلوب النموذج وحدوده. مع النماذج المحلية أنت من يقرّر محتواه بالكامل.</div>

    <label>العشوائية (Temperature) — <span class="val" id="vTemp"></span></label>
    <input type="range" id="sTemp" min="0" max="2" step="0.05">

    <label>Top P — <span class="val" id="vTopP"></span></label>
    <input type="range" id="sTopP" min="0.1" max="1" step="0.01">

    <label>أقصى عدد وحدات في الرد</label>
    <input type="number" id="sMaxTokens" min="64" max="32768" step="64" dir="ltr">

    <label>عدد الرسائل المُرسلة كسياق</label>
    <input type="number" id="sKeep" min="2" max="100" step="2" dir="ltr">

    <label class="row" style="margin-top:16px">
      <span style="flex:1">بثّ الرد حرفاً بحرف</span>
      <input type="checkbox" id="sStream" class="fit" style="width:20px;height:20px">
    </label>

    <button class="btn ghost" id="rerunSetup" style="margin-top:18px">↻ إعادة تشغيل معالج الإعداد</button>

    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn" id="saveSettings">حفظ</button>
      <button class="btn ghost fit" id="testConn" style="flex:0 0 auto">اختبار</button>
    </div>
    <div id="testResult"></div>

    <div class="hint warn" style="margin-top:18px">
      <b>للاتصال بنموذج على كمبيوترك:</b><br>
      1. شغّل Ollama بـ <code dir="ltr">OLLAMA_HOST=0.0.0.0 ollama serve</code><br>
      2. اعرف آيبي الكمبيوتر (<code dir="ltr">ipconfig</code> أو <code dir="ltr">ip a</code>)<br>
      3. الجهازان على نفس الواي فاي<br>
      4. ضع <code dir="ltr">http://الآيبي:11434/v1</code> بالأعلى
    </div>
  </div></div>
`;

/* ================= أدوات العرض ================= */
function toast(msg, isErr = false) {
  const t = el('div', 'toast' + (isErr ? ' err' : ''), msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/** عرض آمن للنص مع دعم كتل الكود — لا نستخدم innerHTML للمحتوى */
function renderContent(node, text) {
  node.textContent = '';
  const parts = String(text).split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const pre = el('pre');
      const code = el('code');
      code.textContent = part.replace(/^[a-zA-Z0-9+#-]*\n/, '');
      pre.appendChild(code);
      node.appendChild(pre);
    } else if (part) {
      // كود سطري `...`
      const seg = part.split(/`/);
      seg.forEach((s, j) => {
        if (!s) return;
        if (j % 2 === 1) node.appendChild(el('code', null, s));
        else node.appendChild(document.createTextNode(s));
      });
    }
  });
}

function messageNode(role, text, { streaming = false } = {}) {
  const wrap = el('div', 'msg ' + (role === 'user' ? 'user' : role === 'error' ? 'err' : 'bot'));
  if (role !== 'error') wrap.appendChild(el('div', 'who', role === 'user' ? 'أنت' : settings.model || 'النموذج'));
  const body = el('div', 'body');
  renderContent(body, text);
  wrap.appendChild(body);
  wrap._body = body;
  if (streaming) body.appendChild(el('span', 'cursor'));
  if (role !== 'error') {
    const tools = el('div', 'msgtools');
    const copy = el('button', null, 'نسخ');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast('نُسخ'); }
      catch { toast('تعذّر النسخ', true); }
    };
    tools.appendChild(copy);
    wrap.appendChild(tools);
    wrap._tools = tools;
  }
  return wrap;
}

function scrollDown(force = false) {
  const m = $('#messages');
  const near = m.scrollHeight - m.scrollTop - m.clientHeight < 160;
  if (force || near) m.scrollTop = m.scrollHeight;
}

function renderMessages() {
  const m = $('#messages');
  m.innerHTML = '';
  const c = activeId ? store.getConvo(activeId) : null;
  $('#title').textContent = c?.title || 'محاورة';

  if (!c || !c.messages.length) {
    const e = el('div', 'empty');
    e.appendChild(el('h2', null, 'محاورة'));
    const p1 = el('p', null, 'عميل محادثة يتصل بأي نموذج ذكاء اصطناعي تختاره — محلي على جهازك أو عبر خدمة.');
    const p2 = el('p', null, 'التطبيق لا يفرض أي قيود؛ ما تحصل عليه يحدّده النموذج الذي تتصل به وتعليمات النظام التي تكتبها.');
    e.append(p1, p2);
    const chips = el('div', null);
    ['اشرحلي شلون أشغّل Ollama', 'اكتبلي قصة قصيرة', 'ساعدني بكود بايثون'].forEach((t) => {
      const ch = el('span', 'chip', t);
      ch.onclick = () => { $('#input').value = t; $('#input').focus(); autosize(); };
      chips.appendChild(ch);
    });
    e.appendChild(chips);
    const cfg = el('p', null, `الخدمة الحالية: ${settings.model || '—'}`);
    cfg.style.marginTop = '18px';
    cfg.style.fontSize = '12px';
    e.appendChild(cfg);
    m.appendChild(e);
    return;
  }
  for (const msg of c.messages) m.appendChild(messageNode(msg.role, msg.content));
  scrollDown(true);
}

function renderConvoList() {
  const list = $('#convoList');
  list.innerHTML = '';
  const convos = store.getConvos();
  if (!convos.length) { list.appendChild(el('div', 'hint', 'لا توجد محادثات بعد.')); return; }
  for (const c of convos) {
    const row = el('div', 'convo' + (c.id === activeId ? ' active' : ''));
    const t = el('div', 't', c.title);
    const d = el('div', 'd', new Date(c.updatedAt).toLocaleDateString('ar'));
    const x = el('button', 'x', '🗑');
    x.onclick = (ev) => {
      ev.stopPropagation();
      store.deleteConvo(c.id);
      activeId = store.getActiveId();
      renderConvoList(); renderMessages();
    };
    row.append(t, d, x);
    row.onclick = () => {
      activeId = c.id; store.setActiveId(c.id);
      renderConvoList(); renderMessages();
      $('#sheetConvos').classList.remove('open');
    };
    list.appendChild(row);
  }
}

/* ================= الإعدادات ================= */
function fillSettingsForm() {
  const sel = $('#sPreset');
  sel.innerHTML = '';
  for (const p of PRESETS) {
    const o = el('option', null, p.name);
    o.value = p.id;
    sel.appendChild(o);
  }
  sel.value = settings.preset;
  $('#presetHint').textContent = PRESETS.find((p) => p.id === settings.preset)?.hint || '';
  $('#sBaseUrl').value = settings.baseUrl;
  $('#sApiKey').value = settings.apiKey;
  $('#sModel').value = settings.model;
  $('#sSystem').value = settings.systemPrompt;
  $('#sTemp').value = settings.temperature;
  $('#vTemp').textContent = settings.temperature;
  $('#sTopP').value = settings.topP;
  $('#vTopP').textContent = settings.topP;
  $('#sMaxTokens').value = settings.maxTokens;
  $('#sKeep').value = settings.keepContext;
  $('#sStream').checked = settings.stream;
}

function readSettingsForm() {
  return {
    ...settings,
    preset: $('#sPreset').value,
    baseUrl: $('#sBaseUrl').value.trim(),
    apiKey: $('#sApiKey').value.trim(),
    model: $('#sModel').value.trim(),
    systemPrompt: $('#sSystem').value,
    temperature: +$('#sTemp').value,
    topP: +$('#sTopP').value,
    maxTokens: +$('#sMaxTokens').value,
    keepContext: +$('#sKeep').value,
    stream: $('#sStream').checked,
  };
}

/* ================= الإرسال ================= */
function autosize() {
  const i = $('#input');
  i.style.height = 'auto';
  i.style.height = Math.min(i.scrollHeight, window.innerHeight * 0.4) + 'px';
}

async function send() {
  if (busy) { controller?.abort(); return; }
  const input = $('#input');
  const text = input.value.trim();
  if (!text) return;
  if (!settings.baseUrl) { openSettings(); toast('حدّد نقطة النهاية أولاً', true); return; }

  if (!activeId) { const c = store.newConvo(text.slice(0, 40)); activeId = c.id; }
  let convo = store.getConvo(activeId);
  if (!convo) { convo = store.newConvo(text.slice(0, 40)); activeId = convo.id; }
  if (convo.messages.length === 0) store.updateConvo(activeId, { title: text.slice(0, 40) });

  const msgs = [...convo.messages, { role: 'user', content: text }];
  store.updateConvo(activeId, { messages: msgs });

  input.value = ''; autosize();
  const m = $('#messages');
  if (m.querySelector('.empty')) m.innerHTML = '';
  m.appendChild(messageNode('user', text));
  scrollDown(true);

  const botNode = messageNode('assistant', '', { streaming: true });
  m.appendChild(botNode);
  scrollDown(true);

  busy = true;
  const btn = $('#send');
  btn.textContent = '■'; btn.classList.add('stop');
  controller = new AbortController();

  // سياق محدود العدد + تعليمات النظام
  const ctx = msgs.slice(-Math.max(2, settings.keepContext));
  const payload = settings.systemPrompt?.trim()
    ? [{ role: 'system', content: settings.systemPrompt }, ...ctx]
    : ctx;

  let full = '';
  try {
    full = await chat({
      messages: payload,
      settings,
      signal: controller.signal,
      onToken: (_d, f) => {
        renderContent(botNode._body, f);
        botNode._body.appendChild(el('span', 'cursor'));
        scrollDown();
      },
    });
    renderContent(botNode._body, full || '(رد فارغ)');
    setDot(true);
    const updated = [...store.getConvo(activeId).messages, { role: 'assistant', content: full }];
    store.updateConvo(activeId, { messages: updated });
    // زر النسخ يعمل على النص النهائي
    if (botNode._tools) botNode._tools.firstChild.onclick = async () => {
      try { await navigator.clipboard.writeText(full); toast('نُسخ'); } catch { toast('تعذّر النسخ', true); }
    };
  } catch (err) {
    botNode.remove();
    if (err?.name === 'AbortError') {
      if (full) {
        const partial = messageNode('assistant', full + '\n\n[أُوقف]');
        m.appendChild(partial);
        const updated = [...store.getConvo(activeId).messages, { role: 'assistant', content: full }];
        store.updateConvo(activeId, { messages: updated });
      }
    } else {
      setDot(false);
      const detail = err instanceof ApiError && err.body ? '\n\n' + err.body : '';
      m.appendChild(messageNode('error', (err.message || String(err)) + detail));
    }
  } finally {
    busy = false; controller = null;
    btn.textContent = '➤'; btn.classList.remove('stop');
    scrollDown();
    renderConvoList();
  }
}

function setDot(ok) {
  const d = $('#dot');
  d.classList.toggle('ok', ok === true);
  d.classList.toggle('err', ok === false);
}

/* ================= الربط ================= */
function openSettings() { fillSettingsForm(); $('#sheetSettings').classList.add('open'); }

$('#btnMenu').onclick = () => { renderConvoList(); $('#sheetConvos').classList.add('open'); };
$('#btnSettings').onclick = openSettings;
$('#btnNew').onclick = () => { const c = store.newConvo(); activeId = c.id; renderMessages(); renderConvoList(); };
$('#newConvo').onclick = () => { const c = store.newConvo(); activeId = c.id; renderMessages(); renderConvoList(); $('#sheetConvos').classList.remove('open'); };
$('#send').onclick = send;

document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => b.closest('.sheet').classList.remove('open'); });
document.querySelectorAll('.sheet').forEach((s) => { s.onclick = (e) => { if (e.target === s) s.classList.remove('open'); }; });

$('#input').addEventListener('input', autosize);
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth > 820) { e.preventDefault(); send(); }
});

$('#sPreset').onchange = () => {
  const p = PRESETS.find((x) => x.id === $('#sPreset').value);
  if (!p) return;
  $('#presetHint').textContent = p.hint;
  if (p.id !== 'custom') { $('#sBaseUrl').value = p.baseUrl; $('#sModel').value = p.model; }
};
$('#sTemp').oninput = () => { $('#vTemp').textContent = $('#sTemp').value; };
$('#sTopP').oninput = () => { $('#vTopP').textContent = $('#sTopP').value; };

$('#saveSettings').onclick = () => {
  settings = readSettingsForm();
  store.saveSettings(settings);
  $('#sheetSettings').classList.remove('open');
  toast('حُفظت الإعدادات');
  renderMessages();
};

$('#testConn').onclick = async () => {
  const s = readSettingsForm();
  const box = $('#testResult');
  box.innerHTML = '';
  const h = el('div', 'hint', 'جارٍ الاختبار…');
  box.appendChild(h);
  try {
    let got = '';
    await chat({ messages: [{ role: 'user', content: 'قل: تم' }], settings: { ...s, stream: false, maxTokens: 24 },
      onToken: (_d, f) => { got = f; } });
    h.className = 'hint';
    h.textContent = '✅ الاتصال ناجح. رد النموذج: ' + (got.slice(0, 90) || '(فارغ)');
    setDot(true);
  } catch (err) {
    h.className = 'hint warn';
    h.textContent = '❌ ' + (err.message || err) + (err.body ? '\n' + err.body : '');
    setDot(false);
  }
};

$('#btnBrowse').onclick = () => openModelPicker({
  current: $('#sModel').value.trim(),
  onPick: (id) => {
    $('#sModel').value = id;
    // النماذج بصيغة provider/model تخصّ OpenRouter
    if (id.includes('/') && !$('#sBaseUrl').value.includes('openrouter')) {
      $('#sBaseUrl').value = 'https://openrouter.ai/api/v1';
      $('#sPreset').value = 'openrouter';
      toast('ضُبطت نقطة النهاية على OpenRouter');
    }
  },
});

$('#btnModels').onclick = async () => {
  const s = readSettingsForm();
  try {
    const models = await listModels(s);
    const sel = $('#sModelList');
    sel.innerHTML = '';
    sel.style.display = 'block';
    models.forEach((m) => { const o = el('option', null, m); o.value = m; sel.appendChild(o); });
    sel.onchange = () => { $('#sModel').value = sel.value; };
    if (models.length) { sel.value = models.includes(s.model) ? s.model : models[0]; $('#sModel').value = sel.value; }
    toast(`وُجد ${models.length} نموذج`);
  } catch (err) { toast('تعذّر جلب النماذج: ' + (err.message || err), true); }
};

$('#exportBtn').onclick = () => {
  const blob = new Blob([store.exportAll()], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `muhawara-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('صُدِّرت المحادثات');
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    store.importAll(await f.text());
    settings = store.getSettings();
    activeId = store.getActiveId() || store.getConvos()[0]?.id || null;
    renderConvoList(); renderMessages();
    toast('تم الاستيراد');
  } catch { toast('ملف غير صالح', true); }
  e.target.value = '';
};

$('#rerunSetup').onclick = () => {
  $('#sheetSettings').classList.remove('open');
  openSetup({ settings, canSkip: true, onFinish: (cfg) => {
    if (cfg) { settings = { ...settings, ...cfg }; store.saveSettings(settings); setDot(true); toast('جاهز — ابدأ المحادثة'); }
    else openSettings();
    renderMessages();
  } });
};

/* ================= الإقلاع ================= */
if (!store.getConvos().length) { const c = store.newConvo(); activeId = c.id; }
if (!activeId) activeId = store.getConvos()[0]?.id || null;
renderMessages();
autosize();
document.getElementById('boot')?.remove();

// أول تشغيل: التطبيق عميل بلا نموذج بداخله، فبدون إعداد لا يعمل إطلاقاً.
if (!setupDone()) {
  openSetup({ settings, canSkip: true, onFinish: (cfg) => {
    if (cfg) { settings = { ...settings, ...cfg }; store.saveSettings(settings); setDot(true); toast('جاهز — ابدأ المحادثة'); }
    else openSettings();
    renderMessages();
  } });
}
