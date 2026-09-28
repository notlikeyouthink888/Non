/**
 * مكتبة الأغاني: مسح كل أغاني الجهاز وتخزينها محليًا (IndexedDB)
 * حتى لا يُعاد المسح في كل فتح. لا اتصال بالإنترنت إطلاقًا.
 *
 * «تحديث» يطلب من النظام إعادة فحص مجلّدات التنزيل (تيليجرام، واتساب، Download)
 * ثم يعيد القراءة من MediaStore ويخبرك بعدد الأغاني الجديدة.
 */

import { Music, isNative, isDesktop } from '../../core/native.js';
import { idb } from '../../core/idb.js';
import { emit, state, save } from '../../core/store.js';

const CACHE_KEY = 'tracks.v1';

let tracks = [];
let loaded = false;
let scanning = false;
let lastNewIds = [];

export function allTracks() { return tracks; }
export function isScanning() { return scanning; }
export function isLoaded() { return loaded; }
export function trackById(id) { return tracks.find((t) => t.id === id) || null; }
export function newlyFound() { return lastNewIds.map(trackById).filter(Boolean); }

/* ── الأسماء التي غيّرها المستخدم ── */

/** الاسم المعروض: ما اخترته أنت إن وُجد، وإلا الاسم الأصلي. */
export function displayTitle(track) {
  if (!track) return '';
  return state.settings.renamed?.[track.id] || track.title;
}

export function renameTrack(id, name) {
  const renamed = state.settings.renamed || (state.settings.renamed = {});
  const clean = (name || '').trim();
  const track = tracks.find((t) => t.id === id);
  if (!clean || clean === track?.title) delete renamed[id];
  else renamed[id] = clean;
  save();
  emit('library');
}

export function isRenamed(id) { return !!state.settings.renamed?.[id]; }

export function originalTitle(id) { return tracks.find((t) => t.id === id)?.title || ''; }

/* ── التحميل والمسح ── */

/** يحمّل النسخة المخزّنة، وإن لم توجد يمسح الجهاز. */
export async function loadLibrary({ forceScan = false } = {}) {
  if (!forceScan) {
    const cached = await idb.get('library', CACHE_KEY);
    if (cached?.tracks?.length) {
      tracks = cached.tracks;
      loaded = true;
      emit('library');
      return tracks;
    }
  }
  return scanLibrary();
}

/**
 * يمسح الجهاز من جديد.
 * @param {{ deep?: boolean }} opts  deep: يطلب من النظام إعادة فهرسة المجلّدات أولًا
 * @returns {Promise<{ tracks, added: number }>}
 */
export async function scanLibrary({ deep = false } = {}) {
  if (scanning) return { tracks, added: 0 };
  scanning = true;
  emit('library');

  const before = new Set(tracks.map((t) => t.id));
  let added = 0;

  try {
    if (isNative()) {
      const ok = await Music.hasPermission() || await Music.requestPermission();
      if (!ok) { scanning = false; emit('library'); return { tracks, added: 0 }; }
      if (deep) await Music.refresh().catch(() => {});
    }

    const found = await Music.scan({ minDurationMs: 15000 });
    const next = normalize(found);

    if (next.length || !tracks.length) {
      lastNewIds = next.filter((t) => !before.has(t.id)).map((t) => t.id);
      added = lastNewIds.length;
      tracks = next;
      loaded = true;
      await idb.set('library', CACHE_KEY, { tracks, at: Date.now() });
    }
  } catch (err) {
    console.warn('[library] فشل المسح', err);
  } finally {
    scanning = false;
    emit('library');
  }

  if (isDesktop()) fillDurations();
  return { tracks, added };
}

/**
 * على الحاسبة نقرأ أسماء الملفات فقط (سريع)، فتبقى المدد صفرًا.
 * هنا نكملها في الخلفية بقراءة ترويسة كل ملف عبر عنصر صوت واحد،
 * ونحدّث المكتبة على دفعات حتى لا نُرهق الواجهة.
 */
let durationsRun = 0;

async function fillDurations() {
  const run = ++durationsRun;
  const probe = new Audio();
  probe.preload = 'metadata';
  let changed = 0;

  for (const t of tracks) {
    if (run !== durationsRun) return;           // بدأ مسح جديد
    if (t.durationMs) continue;
    // eslint-disable-next-line no-await-in-loop
    const ms = await readDuration(probe, t.uri);
    if (ms) { t.durationMs = ms; changed++; }
    if (changed && changed % 25 === 0) { emit('library'); }
  }

  if (run !== durationsRun) return;
  if (changed) {
    emit('library');
    await idb.set('library', CACHE_KEY, { tracks, at: Date.now() });
  }
}

function readDuration(probe, uri) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clear(); resolve(v); } };
    const onMeta = () => finish(Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0);
    const onErr = () => finish(0);
    const timer = setTimeout(() => finish(0), 4000);
    function clear() {
      clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onMeta);
      probe.removeEventListener('error', onErr);
    }
    probe.addEventListener('loadedmetadata', onMeta);
    probe.addEventListener('error', onErr);
    probe.src = uri;
  });
}

/** بديل المتصفّح: إضافة ملفات يدويًا. */
export async function addFromBrowser() {
  const before = new Set(tracks.map((t) => t.id));
  const found = await Music.pickFromBrowser();
  tracks = normalize(found);
  lastNewIds = tracks.filter((t) => !before.has(t.id)).map((t) => t.id);
  loaded = true;
  emit('library');
  if (isDesktop()) fillDurations();
  return { tracks, added: lastNewIds.length };
}

function normalize(list) {
  return (list || [])
    .filter((t) => t && t.uri)
    .map((t) => ({
      id: String(t.id),
      title: (t.title || 'بلا عنوان').trim(),
      artist: (t.artist && t.artist !== '<unknown>' ? t.artist : 'فنّان غير معروف').trim(),
      album: (t.album || '').trim(),
      durationMs: Number(t.durationMs) || 0,
      uri: t.uri,
      artUri: t.artUri || null,
      size: Number(t.size) || 0,
      year: t.year || null,
      path: t.path || '',
      addedAt: Number(t.addedAt) || 0,
    }))
    .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'ar'));
}

/* ── تجميعات ── */

export function byArtist() {
  const map = new Map();
  tracks.forEach((t) => {
    if (!map.has(t.artist)) map.set(t.artist, []);
    map.get(t.artist).push(t);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
}

export function byAlbum() {
  const map = new Map();
  tracks.forEach((t) => {
    const key = t.album || 'بلا ألبوم';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
}

export function search(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return tracks;
  return tracks.filter((t) =>
    displayTitle(t).toLowerCase().includes(needle) ||
    t.title.toLowerCase().includes(needle) ||
    t.artist.toLowerCase().includes(needle) ||
    t.album.toLowerCase().includes(needle));
}

export function recentlyAdded(limit = 40) {
  return [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit);
}

export const libraryStats = () => ({
  count: tracks.length,
  totalMs: tracks.reduce((s, t) => s + t.durationMs, 0),
  artists: new Set(tracks.map((t) => t.artist)).size,
  albums: new Set(tracks.map((t) => t.album).filter(Boolean)).size,
  bytes: tracks.reduce((s, t) => s + (t.size || 0), 0),
  renamed: Object.keys(state.settings.renamed || {}).length,
});
