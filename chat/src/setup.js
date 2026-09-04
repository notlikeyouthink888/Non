/**
 * معالج الإعداد الأول — يظهر عند أول تشغيل.
 * السبب: التطبيق عميل فقط ولا يحتوي نموذجاً بداخله، فبدون توصيله بخادم لا يعمل إطلاقاً.
 * هذا المعالج يوصلك لأقصر طريق يشتغل، ولا يُغلق إلا بعد نجاح اختبار حقيقي.
 */
import { chat } from './api.js';
import { openModelPicker } from './models.js';

const K_DONE = 'mh.setup.done.v1';
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

export const setupDone = () => { try { return localStorage.getItem(K_DONE) === '1'; } catch { return false; } };
export const markSetupDone = () => { try { localStorage.setItem(K_DONE, '1'); } catch {} };

/**
 * @param {object} o
 * @param {object} o.settings الإعدادات الحالية
 * @param {(s:object)=>void} o.onFinish تُستدعى بالإعدادات الجديدة عند النجاح
 * @param {boolean} o.canSkip السماح بالإغلاق بدون إكمال
 */
export function openSetup({ settings, onFinish, canSkip = false }) {
  const root = el('div', 'setup');
  root.innerHTML = `
    <div class="setup-card">
      <div class="setup-body" id="stepBody"></div>
    </div>`;
  document.body.appendChild(root);
  const body = root.querySelector('#stepBody');
  const draft = { ...settings };

  const close = () => root.remove();

  /* ---------- الخطوة 1: الاختيار ---------- */
  function step1() {
    body.innerHTML = '';
    body.appendChild(el('div', 'setup-logo', '💬'));
    body.appendChild(el('h2', null, 'خطوة وحدة وتشتغل'));
    const p = el('p', 'setup-lead');
    p.textContent = 'هذا التطبيق مثل الريموت — ما بيه ذكاء اصطناعي بداخله. لازم توصله بـ«دماغ». اختر وحدة من الثنتين:';
    body.appendChild(p);

    const optA = el('button', 'setup-opt');
    optA.innerHTML = `
      <div class="oi">⚡</div>
      <div class="ot">
        <b>الأسرع — مفتاح مجاني</b>
        <span>يشتغل خلال دقيقتين. نموذج قوي وسريع، مجاني ضمن حد يومي كبير. يحتاج إنترنت.</span>
      </div>`;
    optA.onclick = () => stepGroq();

    const optB = el('button', 'setup-opt');
    optB.innerHTML = `
      <div class="oi">🖥️</div>
      <div class="ot">
        <b>على كمبيوترك — بلا أي حدود</b>
        <span>بلا حدود رسائل، بلا اشتراك، بلا إنترنت، وبلا رقابة. يحتاج كمبيوتر ونصف ساعة إعداد.</span>
      </div>`;
    optB.onclick = () => stepOllama();

    const optC = el('button', 'setup-opt');
    optC.innerHTML = `
      <div class="oi">🧠</div>
      <div class="ot">
        <b>OpenRouter — أكبر مكتبة نماذج</b>
        <span>مئات النماذج بمكان واحد، بضمنها <code>aion-2.0</code> للأدوار والسرد، ونماذج مجانية تماماً. بمفتاح واحد.</span>
      </div>`;
    optC.onclick = () => stepOpenRouter();

    const optD = el('button', 'setup-opt');
    optD.innerHTML = `
      <div class="oi">📱</div>
      <div class="ot">
        <b>على الموبايل نفسه — بلا إنترنت نهائياً</b>
        <span>النموذج ينزل داخل جهازك ويشتغل بدون شبكة. يحتاج جهاز قوي (8 جيجا رام فأكثر) و3–5 جيجا مساحة، والرد أبطأ.</span>
      </div>`;
    optD.onclick = () => stepOnDevice();

    body.append(optA, optB, optC, optD);

    if (canSkip) {
      const skip = el('button', 'setup-skip', 'أعرف شنو أسوي — افتح الإعدادات');
      skip.onclick = () => { markSetupDone(); close(); onFinish(null); };
      body.appendChild(skip);
    }
  }

  /* ---------- مسار Groq ---------- */
  function stepGroq() {
    draft.preset = 'groq';
    draft.baseUrl = 'https://api.groq.com/openai/v1';
    draft.model = 'llama-3.3-70b-versatile';
    body.innerHTML = '';
    body.appendChild(back(step1));
    body.appendChild(el('h2', null, 'مفتاح Groq المجاني'));

    const steps = el('ol', 'setup-steps');
    [
      'افتح <b>console.groq.com</b> بالمتصفح وسجّل دخول (بحساب جوجل أسرع شي).',
      'من القائمة اختر <b>API Keys</b> ← <b>Create API Key</b>.',
      'انسخ المفتاح (يبدأ بـ <code>gsk_</code>) وألصقه تحت.',
    ].forEach((h) => { const li = el('li'); li.innerHTML = h; steps.appendChild(li); });
    body.appendChild(steps);

    const open = el('button', 'setup-link', '↗ افتح console.groq.com');
    open.onclick = () => window.open('https://console.groq.com/keys', '_blank');
    body.appendChild(open);

    const inp = el('input');
    inp.type = 'text'; inp.dir = 'ltr'; inp.placeholder = 'gsk_...';
    inp.className = 'setup-input';
    inp.value = draft.apiKey?.startsWith('gsk_') ? draft.apiKey : '';
    body.appendChild(inp);

    body.appendChild(testRow(() => {
      draft.apiKey = inp.value.trim();
      if (!draft.apiKey) throw new Error('الصق المفتاح أولاً.');
      return draft;
    }));
  }

  /* ---------- مسار Ollama ---------- */
  function stepOllama() {
    draft.preset = 'ollama';
    body.innerHTML = '';
    body.appendChild(back(step1));
    body.appendChild(el('h2', null, 'Ollama على كمبيوترك'));

    const steps = el('ol', 'setup-steps');
    [
      'على الكمبيوتر: نصّب <b>Ollama</b> من <code>ollama.com</code>',
      'نزّل نموذج: <code dir="ltr">ollama pull llama3.1:8b</code>',
      'شغّله على الشبكة:<br><code dir="ltr">OLLAMA_HOST=0.0.0.0 ollama serve</code><br><small>على ويندوز: أضف <code dir="ltr">OLLAMA_HOST=0.0.0.0</code> بمتغيرات البيئة وأعد التشغيل.</small>',
      'اعرف آيبي الكمبيوتر: <code dir="ltr">ipconfig</code> (ويندوز) أو <code dir="ltr">ip a</code> (لينكس)',
      '<b>الموبايل والكمبيوتر لازم على نفس الواي فاي.</b>',
    ].forEach((h) => { const li = el('li'); li.innerHTML = h; steps.appendChild(li); });
    body.appendChild(steps);

    const ipRow = el('div', 'setup-iprow');
    const ip = el('input');
    ip.type = 'text'; ip.dir = 'ltr'; ip.placeholder = '192.168.1.7';
    ip.className = 'setup-input';
    const m = /(\d+\.\d+\.\d+\.\d+)/.exec(draft.baseUrl || '');
    ip.value = m && m[1] !== '192.168.1.100' ? m[1] : '';
    const lbl = el('span', 'setup-iplbl', 'آيبي الكمبيوتر');
    ipRow.append(lbl, ip);
    body.appendChild(ipRow);

    const mdl = el('input');
    mdl.type = 'text'; mdl.dir = 'ltr'; mdl.placeholder = 'llama3.1:8b';
    mdl.className = 'setup-input';
    mdl.value = draft.model && !draft.model.includes('/') ? draft.model : 'llama3.1:8b';
    body.appendChild(el('div', 'setup-iplbl', 'اسم النموذج'));
    body.appendChild(mdl);

    body.appendChild(testRow(() => {
      const v = ip.value.trim();
      if (!v) throw new Error('اكتب آيبي الكمبيوتر أولاً.');
      if (/^(localhost|127\.0\.0\.1)$/i.test(v)) throw new Error('لا تستخدم localhost — هذا يعني الموبايل نفسه. اكتب آيبي الكمبيوتر (مثل 192.168.1.7).');
      draft.baseUrl = `http://${v}:11434/v1`;
      draft.model = mdl.value.trim() || 'llama3.1:8b';
      draft.apiKey = '';
      return draft;
    }));
  }

  /* ---------- مسار OpenRouter ---------- */
  function stepOpenRouter() {
    draft.preset = 'openrouter';
    draft.baseUrl = 'https://openrouter.ai/api/v1';
    if (!draft.model || !draft.model.includes('/')) draft.model = 'aion-labs/aion-2.0';
    body.innerHTML = '';
    body.appendChild(back(step1));
    body.appendChild(el('h2', null, 'OpenRouter'));

    const steps = el('ol', 'setup-steps');
    [
      'افتح <b>openrouter.ai</b> وسجّل دخول.',
      'من <b>Keys</b> أنشئ مفتاحاً وانسخه (يبدأ بـ <code>sk-or-</code>).',
      'ألصقه تحت، ثم اختر النموذج.',
    ].forEach((h) => { const li = el('li'); li.innerHTML = h; steps.appendChild(li); });
    body.appendChild(steps);

    const open = el('button', 'setup-link', '↗ افتح openrouter.ai/keys');
    open.onclick = () => window.open('https://openrouter.ai/keys', '_blank');
    body.appendChild(open);

    const inp = el('input');
    inp.type = 'text'; inp.dir = 'ltr'; inp.placeholder = 'sk-or-v1-...';
    inp.className = 'setup-input';
    inp.value = draft.apiKey?.startsWith('sk-or') ? draft.apiKey : '';
    body.appendChild(inp);

    body.appendChild(el('div', 'setup-iplbl', 'النموذج'));
    const pick = el('button', 'setup-link');
    pick.style.marginBottom = '6px';
    const setLabel = () => { pick.textContent = '⌕ ' + draft.model; };
    setLabel();
    pick.onclick = () => openModelPicker({ current: draft.model, onPick: (id) => { draft.model = id; setLabel(); } });
    body.appendChild(pick);

    const note = el('div', 'setup-status');
    note.textContent = 'النماذج المُعلَّمة «مجاني» لا تُحاسَب. غيرها تحتاج رصيداً في حسابك (أغلبها رخيص جداً).';
    body.appendChild(note);

    body.appendChild(testRow(() => {
      draft.apiKey = inp.value.trim();
      if (!draft.apiKey) throw new Error('الصق المفتاح أولاً.');
      if (!draft.model) throw new Error('اختر نموذجاً.');
      return draft;
    }));
  }

  /* ---------- مسار التشغيل على الموبايل نفسه ---------- */
  function stepOnDevice() {
    draft.preset = 'custom';
    draft.apiKey = '';
    body.innerHTML = '';
    body.appendChild(back(step1));
    body.appendChild(el('h2', null, 'النموذج داخل موبايلك'));

    const lead = el('p', 'setup-lead');
    lead.textContent = 'تشغّل خادماً صغيراً داخل الجهاز عبر Termux، وهذا التطبيق يتصل به محلياً. بعد التنزيل ما يحتاج إنترنت إطلاقاً.';
    body.appendChild(lead);

    const steps = el('ol', 'setup-steps');
    [
      'نصّب <b>Termux</b> من <b>F-Droid</b> (نسخة جوجل بلاي قديمة ومعطّلة).',
      'بداخل Termux نفّذ:<br><code dir="ltr">pkg update && pkg install -y git cmake clang</code>',
      'ابنِ llama.cpp:<br><code dir="ltr">git clone https://github.com/ggml-org/llama.cpp</code><br><code dir="ltr">cd llama.cpp && cmake -B build && cmake --build build -j4</code>',
      'نزّل نموذجاً (اختر حسب رامك — انظر الجدول تحت):<br><code dir="ltr">curl -L -o m.gguf "رابط_الملف"</code>',
      'شغّل الخادم:<br><code dir="ltr">./build/bin/llama-server -m m.gguf --port 8080 -c 4096</code>',
      '<b>خلّي Termux شغّالاً بالخلفية</b> وارجع هنا واضغط «اختبر واحفظ».',
    ].forEach((h) => { const li = el('li'); li.innerHTML = h; steps.appendChild(li); });
    body.appendChild(steps);

    const tbl = el('div', 'setup-table');
    tbl.innerHTML = `
      <div class="st-row st-head"><span>النموذج</span><span>الحجم</span><span>رام الجهاز</span></div>
      <div class="st-row"><span>Llama-3.2-1B Q4</span><span>0.8 جيجا</span><span>4+ جيجا</span></div>
      <div class="st-row"><span>Llama-3.2-3B Q4</span><span>2.0 جيجا</span><span>6+ جيجا</span></div>
      <div class="st-row hi"><span>Aion-RP-8B Q3_K_S</span><span>3.7 جيجا</span><span>8+ جيجا</span></div>
      <div class="st-row hi"><span>Aion-RP-8B Q4_K</span><span>4.9 جيجا</span><span>12+ جيجا</span></div>`;
    body.appendChild(tbl);

    const note = el('div', 'setup-status');
    note.textContent = 'Aion-RP-Llama-3.1-8B من نفس مختبر aion، متخصّص بتقمّص الشخصيات ومنشور كملفات GGUF. النموذجان aion-2.0 و aion-3.0 غير منشورين كأوزان ولا يمكن تشغيلهما محلياً.';
    body.appendChild(note);

    const open = el('button', 'setup-link', '↗ صفحة ملفات Aion-RP-8B على Hugging Face');
    open.onclick = () => window.open('https://huggingface.co/aion-labs/Aion-RP-Llama-3.1-8B-GGUF/tree/main', '_blank');
    body.appendChild(open);

    body.appendChild(el('div', 'setup-iplbl', 'منفذ الخادم المحلي'));
    const port = el('input');
    port.type = 'text'; port.dir = 'ltr'; port.value = '8080'; port.className = 'setup-input';
    body.appendChild(port);

    body.appendChild(testRow(() => {
      const pt = (port.value.trim() || '8080').replace(/\D/g, '');
      draft.baseUrl = `http://127.0.0.1:${pt}/v1`;
      draft.model = 'local';
      return draft;
    }));
  }

  /* ---------- عناصر مشتركة ---------- */
  function back(fn) {
    const b = el('button', 'setup-back', '‹ رجوع');
    b.onclick = fn;
    return b;
  }

  function testRow(collect) {
    const wrap = el('div');
    const status = el('div', 'setup-status');
    const btn = el('button', 'setup-go', 'اختبر واحفظ');
    btn.onclick = async () => {
      let cfg;
      try { cfg = collect(); }
      catch (e) { status.className = 'setup-status err'; status.textContent = e.message; return; }

      btn.disabled = true;
      status.className = 'setup-status';
      status.textContent = 'جارٍ الاختبار…';
      try {
        let got = '';
        await chat({
          messages: [{ role: 'user', content: 'قل كلمة: تم' }],
          settings: { ...cfg, stream: false, maxTokens: 24 },
          onToken: (_d, f) => { got = f; },
        });
        status.className = 'setup-status ok';
        status.textContent = '✅ اشتغل! رد النموذج: ' + (got.slice(0, 60) || '(فارغ)');
        markSetupDone();
        setTimeout(() => { close(); onFinish({ ...cfg }); }, 900);
      } catch (err) {
        status.className = 'setup-status err';
        status.textContent = '❌ ' + (err.message || err);
        btn.disabled = false;
      }
    };
    wrap.append(btn, status);
    return wrap;
  }

  step1();
  return root;
}
