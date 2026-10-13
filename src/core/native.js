/**
 * جسر إلى الإضافات الأصلية في أندرويد (Capacitor)، مع بدائل ويب كاملة
 * حتى يعمل التطبيق داخل المتصفّح أثناء التطوير.
 *
 * الإضافات الأصلية (android/app/src/main/java/com/yourworld/app/plugins):
 *   MusicLibrary — قراءة أغاني الجهاز من MediaStore
 *   Player       — تشغيل بالخلفية + إشعار وشاشة قفل + سرعة + مؤثرات
 *   Scheduler    — منبهات دقيقة وإشعارات
 */

const Cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);

export const isNative = () => !!Cap()?.isNativePlatform?.();

/** يحوّل مسار/‏content URI إلى رابط يقرأه WebView. */
export function toSrc(uri) {
  const c = Cap();
  if (c?.convertFileSrc) return c.convertFileSrc(uri);
  return uri;
}

function plugin(name) {
  const c = Cap();
  if (!c) return null;
  if (c.Plugins?.[name]) return c.Plugins[name];
  try { return c.registerPlugin?.(name) ?? null; } catch { return null; }
}

/* ────────────────────────── مكتبة الأغاني ────────────────────────── */

let webLib = null; // بديل الويب: أغانٍ يختارها المستخدم يدويًا

export const Music = {
  /** يطلب إذن قراءة الصوت. يعيد true عند القبول. */
  async requestPermission() {
    const p = plugin('MusicLibrary');
    if (!p) return true;
    const r = await p.requestPermission();
    return !!r?.granted;
  },

  async hasPermission() {
    const p = plugin('MusicLibrary');
    if (!p) return true;
    const r = await p.hasPermission();
    return !!r?.granted;
  },

  /**
   * يمسح كل أغاني الجهاز.
   * @returns {Promise<Array<{id,title,artist,album,durationMs,uri,artUri,size,year,track,path,addedAt}>>}
   */
  async scan(opts = {}) {
    const p = plugin('MusicLibrary');
    if (p) {
      const r = await p.scan({ minDurationMs: opts.minDurationMs ?? 20000 });
      return r?.tracks ?? [];
    }
    return webLib ? webLib.tracks : [];
  },

  /** بديل الويب: اختيار ملفات/مجلد من المتصفّح. */
  async pickFromBrowser() {
    const { pickAudioFiles } = await import('./webfallback/library.js');
    webLib = await pickAudioFiles(webLib);
    return webLib.tracks;
  },

  isBrowserFallback() { return !plugin('MusicLibrary'); },
};

/* ────────────────────────── المشغّل ────────────────────────── */

let webPlayer = null;
async function fallbackPlayer() {
  if (!webPlayer) {
    const { createWebPlayer } = await import('./webfallback/player.js');
    webPlayer = createWebPlayer();
    playerHandlers.forEach((fn) => webPlayer.on(fn));
  }
  return webPlayer;
}

const playerHandlers = new Set();

async function callPlayer(method, args = {}) {
  const p = plugin('Player');
  if (p) return p[method](args);
  const w = await fallbackPlayer();
  return w[method]?.(args);
}

export const Player = {
  /** يضبط قائمة التشغيل كاملة داخل المحرّك (حتى يكمل التشغيل والشاشة مقفلة). */
  setQueue: (tracks, index = 0, autoPlay = true) =>
    callPlayer('setQueue', { tracks, index, autoPlay }),

  play: () => callPlayer('play'),
  pause: () => callPlayer('pause'),
  toggle: () => callPlayer('toggle'),
  next: () => callPlayer('next'),
  prev: () => callPlayer('prev'),
  stop: () => callPlayer('stop'),
  seek: (positionMs) => callPlayer('seek', { positionMs }),
  seekBy: (deltaMs) => callPlayer('seekBy', { deltaMs }),
  setSpeed: (speed, preservePitch = true) => callPlayer('setSpeed', { speed, preservePitch }),
  setRepeat: (mode) => callPlayer('setRepeat', { mode }),          // off | one | all
  setShuffle: (on) => callPlayer('setShuffle', { shuffle: !!on }),
  setVolume: (volume, balance = 0) => callPlayer('setVolume', { volume, balance }),
  setEffects: (effects) => callPlayer('setEffects', effects),
  setSleepTimer: (minutes) => callPlayer('setSleepTimer', { minutes }),
  getState: () => callPlayer('getState'),

  /** يشترك في تحديثات الحالة: { playing, index, positionMs, durationMs, trackId } */
  on(fn) {
    playerHandlers.add(fn);
    const p = plugin('Player');
    if (p) {
      p.addListener('state', fn);
      p.addListener('trackChanged', fn);
    } else if (webPlayer) {
      webPlayer.on(fn);
    } else {
      fallbackPlayer();
    }
    return () => playerHandlers.delete(fn);
  },
};

/* ────────────────────────── المنبّهات والإشعارات ────────────────────────── */

let webSched = null;
async function fallbackScheduler() {
  if (!webSched) {
    const { createWebScheduler } = await import('./webfallback/scheduler.js');
    webSched = createWebScheduler();
  }
  return webSched;
}

async function callSched(method, args = {}) {
  const p = plugin('Scheduler');
  if (p) return p[method](args);
  const w = await fallbackScheduler();
  return w[method]?.(args);
}

export const Scheduler = {
  /** أذونات الإشعارات + المنبهات الدقيقة. */
  requestPermissions: () => callSched('requestPermissions'),
  canScheduleExact: () => callSched('canScheduleExact'),
  openExactAlarmSettings: () => callSched('openExactAlarmSettings'),

  /**
   * يجدول منبهًا.
   * alarm: { id, at (ms), title, body, soundUri, vibrate, snoozeMin, fullScreen, gradual, volume, repeat }
   */
  schedule: (alarm) => callSched('schedule', alarm),
  cancel: (id) => callSched('cancel', { id }),
  cancelAll: () => callSched('cancelAll'),
  listPending: () => callSched('listPending'),

  /** إشعار فوري. */
  notify: (n) => callSched('notify', n),

  /** يشترك في أحداث المنبّه (تم التنبيه / غفوة / إيقاف). */
  on(fn) {
    const p = plugin('Scheduler');
    if (p) { p.addListener('alarm', fn); return () => {}; }
    fallbackScheduler().then((w) => w.on(fn));
    return () => {};
  },
};

/* ────────────────────────── الموقع ────────────────────────── */

export const Location = {
  /** موقع الجهاز عبر GPS — يعمل دون إنترنت. */
  current({ timeout = 15000, highAccuracy = true } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('لا يدعم الجهاز تحديد الموقع'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(new Error(err.message || 'تعذّر تحديد الموقع')),
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: 30000 },
      );
    });
  },

  watch(cb, onError) {
    if (!navigator.geolocation) { onError?.(new Error('لا يدعم الجهاز تحديد الموقع')); return () => {}; }
    const id = navigator.geolocation.watchPosition(
      (pos) => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading }),
      (err) => onError?.(new Error(err.message)),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  },
};

/* ────────────────────────── أدوات النظام ────────────────────────── */

export const System = {
  /** يمنع إطفاء الشاشة (أثناء التمرين مثلًا). */
  async keepAwake(on) {
    if (!('wakeLock' in navigator)) return null;
    try {
      if (on) return await navigator.wakeLock.request('screen');
    } catch { /* مرفوض */ }
    return null;
  },

  /** زر الرجوع في أندرويد. */
  onBack(fn) {
    const app = plugin('App');
    if (app) { app.addListener('backButton', fn); return; }
    window.addEventListener('popstate', fn);
  },

  /** تغيّر حالة التطبيق (أمامية/خلفية) — يُستعمل لحساب وقت الاستخدام. */
  onAppState(fn) {
    const app = plugin('App');
    if (app) { app.addListener('appStateChange', ({ isActive }) => fn(isActive)); return; }
    document.addEventListener('visibilitychange', () => fn(!document.hidden));
  },
};
