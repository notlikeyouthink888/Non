/**
 * مكتبة الأغاني: مسح كل أغاني الجهاز وتخزينها محليًا (IndexedDB)
 * حتى لا يُعاد المسح في كل فتح. لا اتصال بالإنترنت إطلاقًا.
 *
 * «تحديث» يطلب من النظام إعادة فحص مجلّدات التنزيل (تيليجرام، واتساب، Download)
 * ثم يعيد القراءة من MediaStore ويخبرك بعدد الأغاني الجديدة.
 */

import { Music, isNative } from '../../core/native.js';
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

  return { tracks, added };
}

/** بديل المتصفّح: إضافة ملفات يدويًا. */
export async function addFromBrowser() {
  const before = new Set(tracks.map((t) => t.id));
  const found = await Music.pickFromBrowser();
  tracks = normalize(found);
  lastNewIds = tracks.filter((t) => !before.has(t.id)).map((t) => t.id);
  loaded = true;
  emit('library');
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
