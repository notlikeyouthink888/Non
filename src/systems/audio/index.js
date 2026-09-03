/**
 * وحدة الصوت: مشهد صوتي إجرائي بالكامل عبر WebAudio (بلا ملفات خارجية).
 * أزيز مرور، رياح، عصافير نهارًا، صراصير ليلًا، نقرات واجهة.
 */
import { clamp, lerp, smoothstep } from '../../core/math.js';

export default {
  name: 'audio',
  deps: [],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.muted = true;                 // يبدأ صامتًا حتى تفاعل المستخدم (سياسة المتصفحات)
    this.volume = 0.55;
    this.started = false;
    this.night = 0;

    this.api = {
      start: () => this.start(),
      setMuted: (v) => this.setMuted(v),
      setVolume: (v) => { this.volume = clamp(v, 0, 1); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; },
      click: (kind) => this.click(kind),
      isRunning: () => !!this.actx && this.actx.state === 'running',
    };

    const kick = () => { this.start(); };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    ctx.bus.on('time:changed:done', ({ night }) => { this.night = night; this._balance(); });
  },

  start() {
    if (this.started) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.actx = new AC();
      this.started = true;
      const a = this.actx;
      this.master = a.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(a.destination);

      // ضوضاء بيضاء مُعاد استخدامها
      const len = a.sampleRate * 3;
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;      // ضوضاء بنّية
        d[i] = last * 3.2;
      }
      this.noiseBuf = buf;

      // 1) أزيز المرور (ضوضاء ممرّرة منخفضًا)
      this.traffic = this._noiseChain({ type: 'lowpass', freq: 520, q: 0.7, gain: 0.10 });
      // 2) رياح (ضوضاء ممرّرة نطاقيًا مع تعديل بطيء)
      this.wind = this._noiseChain({ type: 'bandpass', freq: 900, q: 0.6, gain: 0.05 });
      const lfo = a.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = a.createGain(); lfoG.gain.value = 0.035;
      lfo.connect(lfoG); lfoG.connect(this.wind.gain.gain); lfo.start();

      // 3) طبقة ليلية (طنين منخفض + صراصير)
      this.hum = this._noiseChain({ type: 'lowpass', freq: 180, q: 1.0, gain: 0.0 });
      this._scheduleChirps();
      this._balance();
    } catch (e) {
      this.ctx.log.warn('[audio] init failed', e);
    }
  },

  _noiseChain({ type, freq, q, gain }) {
    const a = this.actx;
    const src = a.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { src, filter: f, gain: g };
  },

  /** عصافير نهارًا / صراصير ليلًا */
  _scheduleChirps() {
    const a = this.actx;
    const tick = () => {
      if (!this.actx || this.actx.state === 'closed') return;
      const isNight = this.night > 0.5;
      const t = a.currentTime + 0.02;
      if (!this.muted) {
        if (isNight) {
          for (let i = 0; i < 2; i++) this._chirp(t + i * 0.09, 4200 + Math.random() * 900, 0.045, 0.020);
        } else if (Math.random() < 0.65) {
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) this._chirp(t + i * 0.075, 2400 + Math.random() * 2200, 0.07, 0.030);
        }
      }
      this._chirpTimer = setTimeout(tick, this.night > 0.5 ? 700 + Math.random() * 500 : 1400 + Math.random() * 2600);
    };
    this._chirpTimer = setTimeout(tick, 1500);
  },

  _chirp(t, freq, dur, amp) {
    const a = this.actx;
    const o = a.createOscillator(); o.type = 'sine';
    const g = a.createGain();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.35, t + dur * 0.5);
    o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  click(kind = 'ui') {
    if (!this.actx || this.muted) return;
    const a = this.actx, t = a.currentTime + 0.005;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = kind === 'build' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(kind === 'build' ? 320 : 740, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'build' ? 180 : 520, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.11);
  },

  setMuted(v) {
    this.muted = !!v;
    if (!this.started && !v) this.start();
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    if (this.actx?.state === 'suspended' && !this.muted) this.actx.resume();
    this.ctx.bus.emit('audio:muted', { muted: this.muted });
  },

  _balance() {
    if (!this.started) return;
    const n = this.night;
    const cars = this.ctx.world.agents.cars.length;
    const trafficLevel = clamp(cars / 220, 0, 1) * lerp(1.0, 0.35, n);
    if (this.traffic) this.traffic.gain.gain.value = 0.02 + trafficLevel * 0.11;
    if (this.traffic) this.traffic.filter.frequency.value = lerp(380, 640, trafficLevel);
    if (this.hum) this.hum.gain.gain.value = n * 0.05;
    if (this.wind) this.wind.gain.gain.value = 0.035 + this.ctx.world.weather.windSpeed * 0.006;
  },

  update(dt, ctx) {
    this._acc = (this._acc || 0) + dt;
    if (this._acc > 1.5) { this._acc = 0; this._balance(); }
  },

  showcase(ctx) {},
  stats() { return { started: this.started, muted: this.muted, state: this.actx?.state || 'none' }; },
  dispose() {
    clearTimeout(this._chirpTimer);
    try { this.actx?.close(); } catch {}
  },
};
