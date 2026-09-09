/**
 * بديل الويب للمشغّل — يحاكي نفس واجهة الإضافة الأصلية:
 * قائمة تشغيل، تكرار، عشوائي، سرعة، مؤثرات عبر Web Audio، ومؤقّت نوم.
 */

export function createWebPlayer() {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';

  const handlers = new Set();
  const st = {
    tracks: [], index: 0, playing: false,
    repeat: 'off', shuffle: false, order: [], speed: 1,
    volume: 1, balance: 0, sleepAt: 0,
  };

  /* ── سلسلة Web Audio للمؤثرات ── */
  let ctx = null, source = null, chain = null;

  function ensureCtx() {
    if (ctx) return chain;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    source = ctx.createMediaElementSource(audio);
    const freqs = [60, 250, 1000, 4000, 12000];
    const bands = freqs.map((f, i) => {
      const n = ctx.createBiquadFilter();
      n.type = i === 0 ? 'lowshelf' : i === freqs.length - 1 ? 'highshelf' : 'peaking';
      n.frequency.value = f;
      n.Q.value = 1;
      n.gain.value = 0;
      return n;
    });
    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const gain = ctx.createGain();
    const conv = ctx.createConvolver();
    const wet = ctx.createGain(); wet.gain.value = 0;
    const dry = ctx.createGain(); dry.gain.value = 1;

    let node = source;
    bands.forEach((b) => { node.connect(b); node = b; });
    node.connect(bass);
    let tail = bass;
    if (pan) { tail.connect(pan); tail = pan; }
    tail.connect(dry).connect(gain);
    tail.connect(conv); conv.connect(wet); wet.connect(gain);
    gain.connect(ctx.destination);

    chain = { bands, bass, pan, gain, conv, wet, dry };
    return chain;
  }

  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  /* ── الترتيب ── */
  function rebuildOrder() {
    st.order = st.tracks.map((_, i) => i);
    if (st.shuffle) {
      for (let i = st.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.order[i], st.order[j]] = [st.order[j], st.order[i]];
      }
      const cur = st.order.indexOf(st.index);
      if (cur > 0) [st.order[0], st.order[cur]] = [st.order[cur], st.order[0]];
    }
  }

  function step(delta) {
    if (!st.tracks.length) return -1;
    const pos = st.order.indexOf(st.index);
    let nextPos = pos + delta;
    if (nextPos >= st.order.length) {
      if (st.repeat === 'off') return -1;
      nextPos = 0;
    }
    if (nextPos < 0) nextPos = st.order.length - 1;
    return st.order[nextPos];
  }

  function loadIndex(i, autoPlay) {
    const t = st.tracks[i];
    if (!t) return;
    st.index = i;
    audio.src = t.uri;
    audio.playbackRate = st.speed;
    audio.preservesPitch = true;
    if (autoPlay) audio.play().catch(() => {});
    emit('trackChanged');
    updateMediaSession(t);
  }

  function updateMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: t.title || 'أغنية', artist: t.artist || '', album: t.album || '',
      artwork: t.artUri ? [{ src: t.artUri, sizes: '512x512' }] : [],
    });
    const map = { play: api.play, pause: api.pause, nexttrack: api.next, previoustrack: api.prev };
    for (const [k, fn] of Object.entries(map)) {
      try { navigator.mediaSession.setActionHandler(k, () => fn()); } catch { /* غير مدعوم */ }
    }
  }

  function emit(type = 'state') {
    const payload = {
      type,
      playing: !audio.paused,
      index: st.index,
      trackId: st.tracks[st.index]?.id ?? null,
      positionMs: Math.round((audio.currentTime || 0) * 1000),
      durationMs: Math.round((audio.duration || 0) * 1000) || st.tracks[st.index]?.durationMs || 0,
      speed: st.speed, repeat: st.repeat, shuffle: st.shuffle,
    };
    handlers.forEach((fn) => fn(payload));
  }

  audio.addEventListener('ended', () => {
    if (st.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    const n = step(1);
    if (n >= 0) loadIndex(n, true); else emit();
  });
  audio.addEventListener('play', () => emit());
  audio.addEventListener('pause', () => emit());
  audio.addEventListener('timeupdate', () => {
    if (st.sleepAt && Date.now() >= st.sleepAt) { st.sleepAt = 0; audio.pause(); }
    emit();
  });

  const api = {
    setQueue({ tracks, index = 0, autoPlay = true }) {
      st.tracks = tracks || [];
      st.index = Math.max(0, Math.min(index, st.tracks.length - 1));
      rebuildOrder();
      loadIndex(st.index, autoPlay);
    },
    play() { ensureCtx(); ctx?.resume?.(); return audio.play().catch(() => {}); },
    pause() { audio.pause(); },
    toggle() { return audio.paused ? api.play() : api.pause(); },
    next() { const n = step(1); if (n >= 0) loadIndex(n, true); },
    prev() {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      const n = step(-1); if (n >= 0) loadIndex(n, true);
    },
    stop() { audio.pause(); audio.currentTime = 0; emit(); },
    seek({ positionMs }) { audio.currentTime = positionMs / 1000; emit(); },
    seekBy({ deltaMs }) { audio.currentTime = Math.max(0, audio.currentTime + deltaMs / 1000); emit(); },
    setSpeed({ speed, preservePitch = true }) {
      st.speed = speed; audio.playbackRate = speed; audio.preservesPitch = preservePitch; emit();
    },
    setRepeat({ mode }) { st.repeat = mode; emit(); },
    setShuffle({ shuffle }) { st.shuffle = shuffle; rebuildOrder(); emit(); },
    setVolume({ volume, balance = 0 }) {
      st.volume = volume; st.balance = balance; audio.volume = Math.max(0, Math.min(1, volume));
      const c = ensureCtx();
      if (c?.pan) c.pan.pan.value = Math.max(-1, Math.min(1, balance));
    },
    setEffects(fx) {
      const c = ensureCtx();
      if (!c) return;
      if (!fx || fx.enabled === false) {
        c.bands.forEach((b) => { b.gain.value = 0; });
        c.bass.gain.value = 0; c.wet.gain.value = 0; c.dry.gain.value = 1;
        return;
      }
      (fx.bands || []).forEach((g, i) => { if (c.bands[i]) c.bands[i].gain.value = g; });
      c.bass.gain.value = (fx.bass || 0) / 1000 * 15;
      const reverbMix = { none: 0, smallroom: .12, mediumroom: .2, largeroom: .3, mediumhall: .38, largehall: .5, plate: .45 }[fx.reverb || 'none'] || 0;
      if (reverbMix > 0) {
        c.conv.buffer = impulse(reverbMix * 4, 2.4);
        c.wet.gain.value = reverbMix; c.dry.gain.value = 1 - reverbMix * .5;
      } else { c.wet.gain.value = 0; c.dry.gain.value = 1; }
      if (c.pan) c.pan.pan.value = Math.max(-1, Math.min(1, fx.balance || 0));
    },
    setSleepTimer({ minutes }) { st.sleepAt = minutes > 0 ? Date.now() + minutes * 60000 : 0; },
    getState() {
      return Promise.resolve({
        playing: !audio.paused, index: st.index, trackId: st.tracks[st.index]?.id ?? null,
        positionMs: Math.round((audio.currentTime || 0) * 1000),
        durationMs: Math.round((audio.duration || 0) * 1000),
        speed: st.speed, repeat: st.repeat, shuffle: st.shuffle,
      });
    },
    on(fn) { handlers.add(fn); return () => handlers.delete(fn); },
  };

  return api;
}
