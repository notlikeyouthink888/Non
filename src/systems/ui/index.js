/**
 * وحدة واجهة المستخدم: HUD عربي RTL — إحصاءات، ساعة ووقت، شريط أدوات، لوحة تشخيص، إشعارات.
 * مصمّمة للّمس أولًا (أهداف كبيرة) وتعمل على الأندرويد.
 */
import { CSS } from './style.js';
import { ZONE, ZONE_NAMES_AR, QUALITY } from '../../core/config.js';
import { clamp } from '../../core/math.js';

const fmt = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(Math.round(n));

export default {
  name: 'ui',
  deps: [],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    const root = document.getElementById('ui-root') || document.body;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.style = style;

    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="topbar">
        <div class="pane" id="stats">
          <div class="stat"><i>👥</i><b id="s-pop">0</b><span>سكان</span></div>
          <div class="stat"><i>💼</i><b id="s-jobs">0</b><span>وظائف</span></div>
          <div class="stat"><i>💰</i><b id="s-funds">0</b><span>الخزينة</span></div>
          <div class="stat"><i>😊</i><b id="s-happy">0%</b><span>الرضا</span></div>
          <div class="stat"><i>🏙️</i><b id="s-bld">0</b><span>مبانٍ</span></div>
          <div class="stat"><i>🚗</i><b id="s-cars">0</b><span>مركبات</span></div>
        </div>
        <div class="pane" id="clock">
          <button class="btn sm" id="b-play" title="تشغيل/إيقاف الزمن">⏯</button>
          <div class="t" id="s-time">15:00</div>
          <input id="timeSlider" type="range" min="0" max="24" step="0.05" value="15" />
          <button class="btn sm" id="b-speed" title="سرعة المحاكاة">×1</button>
        </div>
      </div>

      <div id="side">
        <button class="btn" id="b-diag" title="لوحة التشخيص (F3)">📊</button>
        <button class="btn" id="b-zones" title="عرض طبقة المناطق">🗺️</button>
        <button class="btn" id="b-audio" title="الصوت">🔇</button>
        <button class="btn" id="b-quality" title="مستوى الجودة">⚙️</button>
        <button class="btn" id="b-cam" title="زوايا الكاميرا">🎥</button>
      </div>

      <div class="pane" id="diag"></div>

      <div class="pane" id="toolbar">
        <div class="group">
          <div class="tool on" data-tool="none"><div class="ic">🖐️</div><div class="lb">تحريك</div></div>
        </div>
        <div class="group">
          <div class="tool" data-tool="road" data-road="0"><div class="ic">🛣️</div><div class="lb">زقاق</div></div>
          <div class="tool" data-tool="road" data-road="1"><div class="ic">🛣️</div><div class="lb">شارع</div></div>
          <div class="tool" data-tool="road" data-road="2"><div class="ic">🛤️</div><div class="lb">جادة</div></div>
          <div class="tool" data-tool="road" data-road="3"><div class="ic">🏎️</div><div class="lb">سريع</div></div>
        </div>
        <div class="group">
          <div class="tool" data-tool="zone" data-zone="1"><div class="ic">🏠</div><div class="lb">سكني</div></div>
          <div class="tool" data-tool="zone" data-zone="2"><div class="ic">🏬</div><div class="lb">تجاري</div></div>
          <div class="tool" data-tool="zone" data-zone="4"><div class="ic">🏢</div><div class="lb">مكاتب</div></div>
          <div class="tool" data-tool="zone" data-zone="3"><div class="ic">🏭</div><div class="lb">صناعي</div></div>
          <div class="tool" data-tool="zone" data-zone="5"><div class="ic">🌳</div><div class="lb">حديقة</div></div>
        </div>
        <div class="group">
          <div class="tool" data-tool="bulldoze"><div class="ic">🚜</div><div class="lb">هدم</div></div>
          <div class="tool" data-tool="build"><div class="ic">🏗️</div><div class="lb">تعمير</div></div>
        </div>
      </div>

      <div id="hint"></div>
      <div id="toasts"></div>
    `;
    root.appendChild(hud);
    this.hud = hud;
    this.el = (id) => hud.querySelector('#' + id);

    this._bind();
    this._lastUpdate = 0;

    this.api = {
      notify: (text, kind) => this.notify(text, kind),
      setHint: (t) => this.setHint(t),
      selectTool: (t) => this._selectToolButton(t),
      toggleDiag: () => this.el('b-diag').click(),
      hud,
    };

    ctx.bus.on('ui:notify', ({ text, kind }) => this.notify(text, kind));
    ctx.bus.on('module:error', ({ name, error }) => this.notify(`تعطّلت وحدة «${name}»: ${error}`, 'err'));
    ctx.bus.on('app:ready', ({ ms }) => this.notify(`جاهز خلال ${Math.round(ms)} مللي ثانية`, 'ok'));
  },

  _bind() {
    const ctx = this.ctx, bus = ctx.bus;

    // الوقت
    const slider = this.el('timeSlider');
    slider.addEventListener('input', () => {
      ctx.time.setFlowing(false);
      ctx.time.setHour(+slider.value);
      this.el('b-play').classList.remove('on');
    });
    this.el('b-play').addEventListener('click', (e) => {
      ctx.time.setFlowing(!ctx.time.flowing);
      e.currentTarget.classList.toggle('on', ctx.time.flowing);
      ctx.module('audio')?.api.click('ui');
    });
    const speeds = [1, 2, 4, 0];
    let si = 0;
    this.el('b-speed').addEventListener('click', (e) => {
      si = (si + 1) % speeds.length;
      ctx.time.setSimSpeed(speeds[si]);
      e.currentTarget.textContent = speeds[si] === 0 ? '⏸' : '×' + speeds[si];
    });

    // الأدوات
    this.hud.querySelectorAll('.tool').forEach((el) => {
      el.addEventListener('click', () => {
        this.hud.querySelectorAll('.tool').forEach((t) => t.classList.remove('on'));
        el.classList.add('on');
        const tool = el.dataset.tool;
        const opt = { roadType: +(el.dataset.road ?? 1), zone: +(el.dataset.zone ?? 0) };
        bus.emit('tool:selected', { tool, ...opt });
        ctx.module('audio')?.api.click('ui');
        const hints = {
          none: 'اسحب للتحريك • إصبعان للتقريب والتدوير',
          road: 'انقر لبدء الطريق ثم انقر للإنهاء • زر يمين/إلغاء للتراجع',
          zone: 'اسحب لرسم المنطقة على جانبي الطرق',
          bulldoze: 'انقر على مبنى أو طريق لإزالته',
          build: 'يبني المباني على القطع المزوّنة',
        };
        this.setHint(hints[tool] || '');
      });
    });

    // اللوحة الجانبية
    this.el('b-diag').addEventListener('click', (e) => {
      const d = this.el('diag');
      d.classList.toggle('show');
      e.currentTarget.classList.toggle('on', d.classList.contains('show'));
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'F3') { e.preventDefault(); this.el('b-diag').click(); } });

    this.el('b-zones').addEventListener('click', (e) => {
      const z = ctx.module('zoning');
      if (!z?.api) return;
      const on = !z.overlayVisible;
      z.api.showOverlay(on);
      e.currentTarget.classList.toggle('on', on);
    });

    this.el('b-audio').addEventListener('click', (e) => {
      const a = ctx.module('audio');
      if (!a?.api) return;
      const muted = !a.muted;
      a.api.setMuted(muted);
      e.currentTarget.textContent = muted ? '🔇' : '🔊';
      e.currentTarget.classList.toggle('on', !muted);
    });

    const qNames = Object.keys(QUALITY);
    this.el('b-quality').addEventListener('click', () => {
      const cur = qNames.indexOf(ctx.app.qualityName);
      const next = qNames[(cur + 1) % qNames.length];
      ctx.app.setQuality(next);
      this.notify('مستوى الجودة: ' + next);
    });

    const presets = ['overview', 'downtown', 'street', 'aerial', 'waterfront', 'suburb', 'skyline'];
    let pi = 0;
    this.el('b-cam').addEventListener('click', () => {
      pi = (pi + 1) % presets.length;
      ctx.cameraRig.setPreset(presets[pi]);
      this.notify('الكاميرا: ' + presets[pi]);
    });
  },

  setHint(t) {
    const h = this.el('hint');
    h.textContent = t || '';
    h.classList.toggle('show', !!t);
  },

  _selectToolButton(tool) {
    this.hud.querySelectorAll('.tool').forEach((t) => t.classList.toggle('on', t.dataset.tool === tool));
  },

  notify(text, kind = 'info') {
    const wrap = this.el('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : kind === 'warn' ? ' warn' : '');
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
    while (wrap.children.length > 4) wrap.firstChild.remove();
  },

  update(dt, ctx) {
    this._acc = (this._acc || 0) + dt;
    if (this._acc < 0.25) return;
    this._acc = 0;
    const s = ctx.world.stats;
    this.el('s-pop').textContent = fmt(s.population);
    this.el('s-jobs').textContent = fmt(s.jobs);
    this.el('s-funds').textContent = fmt(s.funds);
    this.el('s-happy').textContent = Math.round(s.happiness * 100) + '%';
    this.el('s-bld').textContent = fmt(ctx.world.buildings.length);
    this.el('s-cars').textContent = fmt(ctx.world.agents.cars.length);
    this.el('s-time').textContent = ctx.time.label();
    const sl = this.el('timeSlider');
    if (document.activeElement !== sl) sl.value = ctx.time.hour;

    const d = this.el('diag');
    if (d.classList.contains('show')) {
      const st = ctx.app.stats();
      const mods = Object.entries(st.modules).map(([k, v]) =>
        `<div><span class="k">${k}</span> <span class="${v.state === 'ready' ? 'ok' : 'bad'}">${v.state}</span></div>`).join('');
      d.innerHTML = `
        <div><span class="k">fps</span> <span class="v">${st.fps}</span> <span class="k">ms</span> <span class="v">${st.frameMs}</span> <span class="k">p95</span> <span class="v">${st.frameMsP95}</span></div>
        <div><span class="k">draws</span> <span class="v ${st.drawCalls > 1500 ? 'bad' : 'ok'}">${st.drawCalls}</span> <span class="k">tris</span> <span class="v">${fmt(st.triangles)}</span></div>
        <div><span class="k">progs</span> <span class="v">${st.programs}</span> <span class="k">tex</span> <span class="v">${st.textures}</span> (${st.textureMB}MB)</div>
        <div><span class="k">quality</span> <span class="v">${st.quality}</span> <span class="k">seed</span> <span class="v">${st.seed}</span></div>
        <div><span class="k">gl</span> <span class="v">${(st.gl.renderer || '').slice(0, 42)}</span></div>
        <div><span class="k">errors</span> <span class="v ${st.consoleErrors.length ? 'bad' : 'ok'}">${st.consoleErrors.length}</span></div>
        <hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:6px 0">
        ${mods}`;
    }
  },

  showcase(ctx) { this.notify('عرض واجهة المستخدم'); },
  stats() { return { visible: !!this.hud }; },
  dispose() { this.hud?.remove(); this.style?.remove(); },
};
