/**
 * متصفّح نماذج OpenRouter — يجلب القائمة الحيّة ويعرض السعر والسياق،
 * ويميّز المجاني تماماً. يتيح البحث والاختيار بضغطة.
 */
const CATALOG = 'https://openrouter.ai/api/v1/models';
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

let cache = null;

/** نماذج مقترحة تظهر بالأعلى (تُطابق بالمعرّف الدقيق) */
export const FEATURED = [
  { id: 'aion-labs/aion-2.0', why: 'أدوار وسرد قصصي — DeepSeek V3.2 مُحسَّن' },
  { id: 'aion-labs/aion-3.0-mini', why: 'أحدث وأرخص من 2.0' },
  { id: 'aion-labs/aion-3.0', why: 'الأقوى في العائلة (وأغلاها)' },
  { id: 'aion-labs/aion-rp-llama-3.1-8b', why: 'متخصّص بتقمّص الشخصيات' },
];

export async function fetchModels({ force = false } = {}) {
  if (cache && !force) return cache;
  const res = await fetch(CATALOG);
  if (!res.ok) throw new Error(`تعذّر جلب قائمة النماذج (${res.status})`);
  const data = await res.json();
  cache = (data.data || []).map((m) => {
    const pin = Number(m.pricing?.prompt || 0) * 1e6;
    const pout = Number(m.pricing?.completion || 0) * 1e6;
    return {
      id: m.id,
      name: m.name || m.id,
      ctx: m.context_length || 0,
      pin, pout,
      free: pin === 0 && pout === 0,
      desc: (m.description || '').slice(0, 220),
    };
  });
  return cache;
}

const fmtCtx = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));
const fmtPrice = (m) => (m.free ? 'مجاني' : `$${m.pin.toFixed(2)} / $${m.pout.toFixed(2)}`);

/**
 * يفتح لوحة اختيار نموذج.
 * @param {object} o
 * @param {string} o.current المعرّف الحالي
 * @param {(id:string)=>void} o.onPick
 */
export function openModelPicker({ current, onPick }) {
  const root = el('div', 'mp');
  root.innerHTML = `
    <div class="mp-panel">
      <div class="mp-head">
        <input class="mp-search" type="text" placeholder="ابحث… (مثال: aion أو free)" />
        <button class="mp-close">✕</button>
      </div>
      <div class="mp-filters">
        <button class="mp-chip on" data-f="featured">مقترحة</button>
        <button class="mp-chip" data-f="free">مجانية</button>
        <button class="mp-chip" data-f="all">الكل</button>
      </div>
      <div class="mp-list"><div class="mp-empty">جارٍ التحميل…</div></div>
      <div class="mp-note">الأسعار لكل مليون وحدة (إدخال / إخراج). المصدر: OpenRouter مباشرةً.</div>
    </div>`;
  document.body.appendChild(root);

  const list = root.querySelector('.mp-list');
  const search = root.querySelector('.mp-search');
  let filter = 'featured';
  let all = [];

  const close = () => root.remove();
  root.querySelector('.mp-close').onclick = close;
  root.onclick = (e) => { if (e.target === root) close(); };

  function render() {
    const q = search.value.trim().toLowerCase();
    let items = all;
    if (filter === 'free') items = items.filter((m) => m.free);
    if (filter === 'featured') {
      const ids = FEATURED.map((f) => f.id);
      items = ids.map((id) => all.find((m) => m.id === id)).filter(Boolean);
      // أضف أفضل المجانية بعدها
      const topFree = all.filter((m) => m.free).sort((a, b) => b.ctx - a.ctx).slice(0, 8);
      items = [...items, ...topFree];
    }
    if (q) items = all.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));

    list.innerHTML = '';
    if (!items.length) { list.appendChild(el('div', 'mp-empty', 'ما لقيت شي.')); return; }

    for (const m of items.slice(0, 90)) {
      const row = el('button', 'mp-row' + (m.id === current ? ' on' : ''));
      const top = el('div', 'mp-top');
      top.appendChild(el('span', 'mp-name', m.name));
      if (m.free) top.appendChild(el('span', 'mp-badge free', 'مجاني'));
      row.appendChild(top);
      row.appendChild(el('div', 'mp-id', m.id));
      const meta = el('div', 'mp-meta');
      meta.appendChild(el('span', null, 'سياق ' + fmtCtx(m.ctx)));
      meta.appendChild(el('span', null, fmtPrice(m)));
      const feat = FEATURED.find((f) => f.id === m.id);
      if (feat) meta.appendChild(el('span', 'mp-why', feat.why));
      row.appendChild(meta);
      row.onclick = () => { onPick(m.id); close(); };
      list.appendChild(row);
    }
  }

  root.querySelectorAll('.mp-chip').forEach((c) => {
    c.onclick = () => {
      root.querySelectorAll('.mp-chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      filter = c.dataset.f;
      search.value = '';
      render();
    };
  });
  search.oninput = render;

  fetchModels()
    .then((ms) => { all = ms; render(); })
    .catch((err) => { list.innerHTML = ''; list.appendChild(el('div', 'mp-empty', err.message)); });

  return root;
}
