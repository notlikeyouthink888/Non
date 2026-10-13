/**
 * مكتبة الأغاني: مسح كل أغاني الجهاز وتخزينها محليًا (IndexedDB)
 * حتى لا يُعاد المسح في كل فتح. لا اتصال بالإنترنت إطلاقًا.
 */

import { Music, isNative } from '../../core/native.js';
import { idb } from '../../core/idb.js';
import { emit } from '../../core/store.js';

const CACHE_KEY = 'tracks.v1';

let tracks = [];
let loaded = false;
let scanning = false;

export function allTracks() { return tracks; }
export function isScanning() { return scanning; }
export function isLoaded() { return loaded; }
export function trackById(id) { return tracks.find((t) => t.id === id) || null; }

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

/** يمسح الجهاز من جديد. */
export async function scanLibrary() {
  if (scanning) return tracks;
  scanning = true;
  emit('library');
  try {
    if (isNative()) {
      const ok = await Music.hasPermission() || await Music.requestPermission();
      if (!ok) { scanning = false; emit('library'); return tracks; }
    }
    const found = await Music.scan({ minDurationMs: 15000 });
    tracks = normalize(found);
    loaded = true;
    await idb.set('library', CACHE_KEY, { tracks, at: Date.now() });
  } catch (err) {
    console.warn('[library] فشل المسح', err);
  } finally {
    scanning = false;
    emit('library');
  }
  return tracks;
}

/** بديل المتصفّح: إضافة ملفات يدويًا. */
export async function addFromBrowser() {
  const found = await Music.pickFromBrowser();
  tracks = normalize(found);
  loaded = true;
  emit('library');
  return tracks;
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
    .sort((a, b) => a.title.localeCompare(b.title, 'ar'));
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
});
