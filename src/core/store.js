/**
 * تخزين محلي دائم — كل البيانات تبقى داخل الجهاز، بلا أي اتصال بالإنترنت.
 * يحفظ في localStorage مع كتابة مؤجّلة، ويبثّ تغييرات لمن يشترك.
 */

const KEY = 'yw.state.v1';
const listeners = new Set();
let saveTimer = null;

/** الحالة الابتدائية — أي مفتاح جديد يُدمج تلقائيًا عند الترقية. */
export const defaults = {
  meta: { createdAt: Date.now(), version: 1, lastOpenDay: null },

  music: {
    favorites: [],           // معرفات الأغاني المفضّلة
    playlists: [],           // { id, name, trackIds[] }
    recent: [],              // آخر ما شُغّل
    repeat: 'off',           // off | one | all
    shuffle: false,
    speed: 1,
    pitchLock: true,
    volume: 1,
    fadeMs: 0,
    effects: {
      enabled: false,
      preset: 'flat',
      bands: [0, 0, 0, 0, 0],  // dB لكل نطاق
      bass: 0,                 // 0..1000
      virtualizer: 0,          // 0..1000
      reverb: 'none',          // none | smallroom | mediumroom | largeroom | mediumhall | largehall | plate
      loudness: 0,             // mB
      monoMix: false,
      balance: 0,              // -1..1
    },
    lastTrackId: null,
    lastPosition: 0,
    sleepTimerMin: 0,
  },

  time: {
    alarms: [],              // { id, hour, minute, label, enabled, repeat, sound, snoozeMin, vibrate, gradual, volume }
    timers: [],              // مؤقتات محفوظة
    tasks: [],               // { id, title, note, date, time, done, priority, tag, remind, repeat }
    stopwatchLaps: [],
    sleep: {
      wakeHour: 7, wakeMinute: 0,
      cycleMin: 90, fallAsleepMin: 14, targetCycles: 5,
      windDownMin: 45, remindBedtime: true,
    },
    usage: {
      dailyLimitMin: 420,      // تحذير بعد 7 ساعات
      warnAtMin: [240, 360, 420],
      warned: [],
      days: {},                // 'YYYY-MM-DD' -> { ms, opens, sections:{} }
    },
    summaries: {},             // 'YYYY-MM-DD' -> ملخّص نهاية اليوم
    lastSummaryDay: null,
  },

  commit: {
    active: [],              // { id, libId, title, time, days[], streak, lastDone, history{} }
    log: {},                 // 'YYYY-MM-DD' -> [ids]
    customs: [],             // تمارين أضافها المستخدم
  },

  places: {
    items: [],               // { id, name, note, lat, lng, category, visited, createdAt, tags[] }
    home: null,              // { lat, lng }
    lastView: { lat: 33.3152, lng: 44.3661, zoom: 12 },
    tileCache: true,
  },

  growth: {
    done: [],                // [{ id, day, at }] لما أُنجز
    inProgress: [],
    notes: {},               // id -> ملاحظة
    focusIds: [],            // ما اخترته للتركيز عليه الآن
    dailyPick: null,         // { day, id }
    xp: 0,
  },

  settings: {
    theme: 'night',
    accent: '#7c5cff',
    haptics: true,
    notifications: true,
    startSection: 'music',
    keepAwakeInPlayer: false,
    weekStart: 6,            // السبت
    hour12: false,
  },
};

function deepMerge(base, patch) {
  if (Array.isArray(base) || base === null || typeof base !== 'object') {
    return patch === undefined ? base : patch;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    return deepMerge(structuredClone(defaults), JSON.parse(raw));
  } catch (err) {
    console.warn('[store] تعذّرت القراءة، سنبدأ من الحالة الابتدائية', err);
    return structuredClone(defaults);
  }
}

export const state = load();

/** يحفظ الحالة (مؤجَّل 250ms لتجميع التعديلات المتتابعة). */
export function save(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { console.warn('[store] تعذّر الحفظ', err); }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

/** يعدّل الحالة ثم يحفظ ويبثّ. */
export function update(fn, topic = '*') {
  fn(state);
  save();
  emit(topic);
}

export function subscribe(topic, fn) {
  const entry = { topic, fn };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

export function emit(topic = '*') {
  listeners.forEach((l) => {
    if (l.topic === '*' || l.topic === topic || topic === '*') {
      try { l.fn(topic); } catch (err) { console.warn('[store] مستمع فشل', err); }
    }
  });
}

/** معرّف قصير فريد. */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** تصدير كل البيانات كنص JSON للنسخ الاحتياطي. */
export function exportAll() {
  return JSON.stringify(state, null, 2);
}

/** استيراد نسخة احتياطية. */
export function importAll(json) {
  const parsed = JSON.parse(json);
  const merged = deepMerge(structuredClone(defaults), parsed);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, merged);
  save(true);
  emit('*');
}

export function resetAll() {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, structuredClone(defaults));
  save(true);
  emit('*');
}
