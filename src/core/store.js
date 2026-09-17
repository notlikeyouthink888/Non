/**
 * تخزين محلي دائم — كل البيانات تبقى داخل الجهاز، بلا أي اتصال بالإنترنت.
 *
 * الطبقة الأساسية IndexedDB (سعة كبيرة ولا تتأثّر بحدّ الـ 5 م.ب)، ومعها
 * مرآة في localStorage لإقلاع فوري قبل أن تفتح قاعدة البيانات. أي فشل في
 * الحفظ يُعلَن للمستخدم بدل أن يُبتلع بصمت، ويُجرَّب التقليم ثم إعادة الكتابة.
 * بعد كل حفظ ناجح تُؤخذ لقطة احتياطية دوّارة يمكن الرجوع إليها.
 */

import { idb } from './idb.js';

const KEY = 'yw.state.v1';
const DOC = 'main';
const listeners = new Set();
const errorHandlers = new Set();

let saveTimer = null;
let writing = null;        // وعد الكتابة الجارية
let dirty = false;         // تغيّرت الحالة بعد آخر كتابة
let ready = false;         // فُتحت قاعدة البيانات وقُرئت النسخة الأحدث
let lsBroken = false;      // امتلأ localStorage — نكتفي بـ IndexedDB
let idbBroken = false;     // تعذّرت الكتابة الدائمة — أُبلغ المستخدم مرّة
let lastBackupAt = 0;

/** الحالة الابتدائية — أي مفتاح جديد يُدمج تلقائيًا عند الترقية. */
export const defaults = {
  meta: { createdAt: Date.now(), version: 2, lastOpenDay: null, savedAt: 0, saves: 0 },

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

  workout: {
    // برنامج ثابت من ثلاثة أيام، كل يوم ٨ خانات تمارين
    days: [
      { id: 'd1', name: 'اليوم الأول', slots: [] },
      { id: 'd2', name: 'اليوم الثاني', slots: [] },
      { id: 'd3', name: 'اليوم الثالث', slots: [] },
    ],
    // slots[i] = { n, title, note, media: [{id,type,mime,name}], sets, reps, rest, done }
    log: {},                 // 'YYYY-MM-DD' -> { dayId, doneSlots: [n] }
    protein: {
      targetG: 120,          // الهدف اليومي بالغرام
      weightKg: 70,
      perKg: 1.7,            // غرام لكل كغم (مرجع شائع لمن يتمرّن)
      plans: {},             // dayId -> [{ id, name, grams, when }]  ما يجب أخذه
      log: {},               // 'YYYY-MM-DD' -> [{ id, name, grams, at }]  ما أُكل فعلًا
      customFoods: [],       // { id, name, cat, per100, piece, pieceLabel }  أطعمة أضافها المستخدم
      edits: {},             // اسم الطعام -> per100 بعد تعديل المستخدم
    },
  },

  improve: {
    // مجالات التطوير — مثل أيام التمارين لكن بلا حدّ لعدد العناصر
    areas: [
      { id: 'a1', name: 'العقل والمعرفة', icon: '🧠' },
      { id: 'a2', name: 'الجسد والصحّة', icon: '💪' },
      { id: 'a3', name: 'مهارة أتعلّمها', icon: '🛠' },
      { id: 'a4', name: 'الروح والعادات', icon: '🕌' },
      { id: 'a5', name: 'العمل والمال', icon: '💼' },
      { id: 'a6', name: 'الناس حولي', icon: '🤝' },
    ],
    // { id, areaId, title, note, media[], drawing, needs[], target, calendar, createdAt, order }
    items: [],
    log: {},              // 'YYYY-MM-DD' -> [itemId]  ما أُنجز فعلًا
    proofs: {},           // 'itemId|YYYY-MM-DD' -> { at, note, mediaId }  دليل الإنجاز
    requireProof: true,   // لا يُحسب الإنجاز إلا بتأكيد
  },

  s2: {
    // السبت=6، الأحد=0، الاثنين=1، الثلاثاء=2، الأربعاء=3، الخميس=4، الجمعة=5
    workDays: [6, 0, 1, 2, 3],
    work: { start: '06:30', end: '14:30', title: 'الدوام', enabled: true },
    blocks: [],          // { id, scope:'work'|'off'|0..6, start, end, cat, title, note, drawing, workoutDay }
    gym: { days: [1, 3, 5], link: false, map: {} },   // يوم الأسبوع → معرّف يوم التمارين
    startHour: 5,        // بداية عرض الخط الزمني
  },

  study: {
    groups: [],          // { id, name, icon, color, createdAt }
    pages: [],           // { id, groupId, n, title, blocks: [], updatedAt }
    lastGroup: null,
  },

  money: {
    currency: 'د.ع',
    items: [],               // { id, name, price, qty, category, date, lastsDays, note, photo, recurring }
    budgets: {},             // category -> حدّ شهري
    monthStartDay: 1,
  },

  room: {
    items: [],               // { id, name, note, zone, priority, price, status, order, photo, link }
    zones: ['المكتب', 'السرير', 'الجدار', 'الأرضية', 'الإضاءة', 'التخزين', 'عام'],
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
    navPinned: ['music', 'time', 'workout', 'money'],   // أقسام الشريط السفلي
    renamed: {},                                        // معرّف الأغنية -> الاسم الذي اخترته
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

function hydrate(raw) {
  return deepMerge(structuredClone(defaults), raw || {});
}

/** إقلاع فوري من مرآة localStorage حتى تكتمل قراءة IndexedDB. */
function loadMirror() {
  try {
    const raw = localStorage.getItem(KEY);
    return hydrate(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('[store] تعذّرت قراءة المرآة، سنبدأ من الحالة الابتدائية', err);
    return structuredClone(defaults);
  }
}

export const state = loadMirror();

function replaceState(next) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
}

/** مقياس خشن لكم البيانات في نسخة — يُستعمل حارسًا ضدّ استبدال نسخة بأفقر منها. */
function contentScore(s) {
  const n = (v) => (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
  return (s?.workout?.days || []).reduce((t, d) => t + n(d.slots), 0)
    + n(s?.time?.alarms) + n(s?.time?.tasks) + n(s?.study?.pages)
    + n(s?.money?.items) + n(s?.places?.items) + n(s?.room?.items)
    + n(s?.s2?.blocks) + n(s?.commit?.active) + n(s?.growth?.done);
}

/**
 * يفتح التخزين الدائم ويستعيد أحدث نسخة. يُنتظَر مرّة واحدة عند الإقلاع
 * قبل رسم الواجهة، فلا يظهر للمستخدم أي بيانات قديمة ثم تُستبدل.
 */
export async function initStore() {
  if (ready) return state;
  try {
    const doc = await idb.read('state', DOC);
    if (doc && typeof doc === 'object') {
      const mine = Number(state.meta?.savedAt || 0);
      const theirs = Number(doc.meta?.savedAt || 0);
      // مرآة من نسخة أقدم من التطبيق لا تحمل طابعًا زمنيًا؛ لا نسمح بأن تمحوها
      // نسخة أفقر منها في IndexedDB. عدا ذلك، IndexedDB هو المرجع.
      const legacyMirror = mine === 0 && contentScore(state) > 0;
      const poorer = legacyMirror && contentScore(doc) < contentScore(state);
      if (theirs >= mine && !poorer) replaceState(hydrate(doc));
    }
    lastBackupAt = Number((await idb.read('backups', 'lastAt').catch(() => 0)) || 0);
  } catch (err) {
    idbBroken = true;
    console.warn('[store] تعذّر فتح التخزين الدائم — سنعتمد المرآة وحدها', err);
  }
  ready = true;
  if (dirty) save(true);
  return state;
}

/** يشترك في أخطاء الحفظ (تُعرض للمستخدم بدل أن تُبتلع). */
export function onStoreError(fn) {
  errorHandlers.add(fn);
  return () => errorHandlers.delete(fn);
}

function reportError(message, err) {
  console.warn('[store]', message, err);
  errorHandlers.forEach((fn) => { try { fn(message, err); } catch { /* تجاهل */ } });
}

/** يقلّم السجلّات التي تنمو بلا حدّ حتى لا تمتلئ المساحة. */
export function prune() {
  const keepLast = (obj, n) => {
    const keys = Object.keys(obj || {}).sort();
    if (keys.length <= n) return 0;
    const drop = keys.slice(0, keys.length - n);
    drop.forEach((k) => delete obj[k]);
    return drop.length;
  };

  let removed = 0;
  removed += keepLast(state.time?.usage?.days, 180);
  removed += keepLast(state.time?.summaries, 90);
  removed += keepLast(state.workout?.log, 400);
  removed += keepLast(state.workout?.protein?.log, 400);
  removed += keepLast(state.commit?.log, 400);

  if (state.music?.recent?.length > 120) {
    removed += state.music.recent.length - 120;
    state.music.recent = state.music.recent.slice(0, 120);
  }
  if (state.time?.stopwatchLaps?.length > 200) {
    removed += state.time.stopwatchLaps.length - 200;
    state.time.stopwatchLaps = state.time.stopwatchLaps.slice(-200);
  }
  if (state.growth?.done?.length > 800) {
    removed += state.growth.done.length - 800;
    state.growth.done = state.growth.done.slice(-800);
  }
  return removed;
}

function serialize() {
  state.meta = state.meta || {};
  state.meta.savedAt = Date.now();
  state.meta.saves = (state.meta.saves || 0) + 1;
  return JSON.stringify(state);
}

function mirror(json) {
  if (lsBroken) return;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // امتلأت المساحة. نُبقي القيمة القديمة (أفضل من لا شيء إن تعطّل IndexedDB)
    // ونتوقّف عن المحاولة حتى لا تبطؤ كل كتابة. IndexedDB هو المرجع أصلًا.
    lsBroken = true;
  }
}

async function writeNow(pre) {
  if (!ready) return;                     // ستُكتب فور انتهاء initStore
  dirty = false;
  const doc = pre || JSON.parse(serialize());

  if (idbBroken) {
    // لا مرجع دائم: المرآة وحدها. إن سقطت هي أيضًا فالمستخدم يعرف.
    if (lsBroken) reportError('تعذّر حفظ بياناتك — لا مساحة متاحة في الجهاز.', null);
    return;
  }

  try {
    await idb.put('state', DOC, doc);
  } catch (err) {
    // غالبًا امتلاء المساحة: نقلّم ثم نعيد المحاولة مرّة واحدة
    const removed = prune();
    try {
      await idb.put('state', DOC, JSON.parse(JSON.stringify(state)));
      if (removed) console.info(`[store] حُرّرت مساحة بحذف ${removed} سجلًّا قديمًا`);
    } catch (err2) {
      idbBroken = true;                   // نُبلّغ مرّة واحدة لا مع كل ضغطة
      reportError('تعذّر حفظ بياناتك — المساحة ممتلئة. احذف ملفات من التطبيق أو الجهاز.', err2);
      return;
    }
  }
  await maybeBackup(doc);
}

/** لقطة احتياطية كل ٦ ساعات، نحتفظ بآخر ١٢ لقطة. */
async function maybeBackup(snapshot) {
  const now = Date.now();
  if (now - lastBackupAt < 6 * 3600 * 1000) return;
  lastBackupAt = now;
  try {
    await idb.put('backups', `auto_${now}`, {
      at: now, kind: 'auto', size: JSON.stringify(snapshot).length, data: snapshot,
    });
    await idb.put('backups', 'lastAt', now);
    const keys = (await idb.keys('backups')).filter((k) => String(k).startsWith('auto_')).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 12))) await idb.del('backups', k);
  } catch (err) {
    console.warn('[store] تعذّرت اللقطة الاحتياطية', err);
  }
}

/**
 * يحفظ الحالة. مؤجَّل 250ms لتجميع التعديلات المتتابعة،
 * و`immediate` يكتب حالًا (عند الخروج أو بعد عملية مهمّة).
 */
export function save(immediate = false) {
  dirty = true;
  clearTimeout(saveTimer);
  if (immediate) {
    // المرآة تُكتب فورًا وبشكل متزامن: إن أُغلق التطبيق في هذه اللحظة لا يضيع شيء.
    const json = serialize();
    mirror(json);
    const snap = JSON.parse(json);
    writing = Promise.resolve(writing).then(() => writeNow(snap), () => writeNow(snap));
    return writing;
  }
  saveTimer = setTimeout(() => {
    const json = serialize();
    mirror(json);
    const snap = JSON.parse(json);
    writing = Promise.resolve(writing).then(() => writeNow(snap), () => writeNow(snap));
  }, 250);
  return writing || Promise.resolve();
}

/** ينتظر انتهاء أي كتابة معلّقة (يُستعمل قبل التصدير أو الخروج). */
export async function flush() {
  clearTimeout(saveTimer);
  if (dirty) await save(true);
  await writing;
}

/** لقطات احتياطية محفوظة داخل الجهاز، الأحدث أولًا. */
export async function listSnapshots() {
  try {
    const keys = (await idb.keys('backups')).filter((k) => String(k).startsWith('auto_') || String(k).startsWith('manual_'));
    const out = [];
    for (const k of keys) {
      const v = await idb.get('backups', k);
      if (v?.data) out.push({ key: k, at: v.at, kind: v.kind || 'auto', size: v.size || 0 });
    }
    return out.sort((a, b) => b.at - a.at);
  } catch { return []; }
}

/** لقطة يدوية قبل عملية خطرة (استيراد، مسح). */
export async function snapshot(kind = 'manual') {
  const now = Date.now();
  try {
    const json = JSON.stringify(state);
    await idb.put('backups', `manual_${now}`, { at: now, kind, size: json.length, data: JSON.parse(json) });
    const keys = (await idb.keys('backups')).filter((k) => String(k).startsWith('manual_')).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 8))) await idb.del('backups', k);
    return true;
  } catch { return false; }
}

export async function restoreSnapshot(key) {
  const v = await idb.get('backups', key);
  if (!v?.data) return false;
  await snapshot('before-restore');
  replaceState(hydrate(v.data));
  await save(true);
  emit('*');
  return true;
}

export async function deleteSnapshot(key) {
  await idb.del('backups', key);
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

/**
 * استيراد نسخة احتياطية. تُؤخذ لقطة للحالة الحالية أولًا حتى يمكن التراجع،
 * و`merge` يدمج النسخة مع ما هو موجود بدل استبداله (مفيد لاسترجاع التمارين
 * وحدها دون فقدان ما أُضيف بعدها).
 */
export async function importAll(json, { merge = false } = {}) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || typeof parsed !== 'object') throw new Error('ملف غير صالح');
  await snapshot('before-import');
  const base = merge ? structuredClone(state) : structuredClone(defaults);
  replaceState(deepMerge(base, parsed));
  await save(true);
  emit('*');
}

/** ما الذي تحتويه نسخة احتياطية — لعرضه قبل الاستيراد. */
export function describeBackup(obj) {
  const n = (v) => (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
  const slots = (obj?.workout?.days || []).reduce((s, d) => s + n(d.slots), 0);
  return [
    slots ? `${slots} تمرين` : null,
    n(obj?.time?.alarms) ? `${n(obj.time.alarms)} منبّه` : null,
    n(obj?.time?.tasks) ? `${n(obj.time.tasks)} مهمّة` : null,
    n(obj?.study?.pages) ? `${n(obj.study.pages)} صفحة مذاكرة` : null,
    n(obj?.money?.items) ? `${n(obj.money.items)} مصروف` : null,
    n(obj?.places?.items) ? `${n(obj.places.items)} مكان` : null,
    n(obj?.room?.items) ? `${n(obj.room.items)} غرض غرفة` : null,
    n(obj?.s2?.blocks) ? `${n(obj.s2.blocks)} كتلة S2` : null,
  ].filter(Boolean).join(' · ') || 'نسخة فارغة';
}

export async function resetAll() {
  await snapshot('before-reset');
  replaceState(structuredClone(defaults));
  await save(true);
  emit('*');
}
