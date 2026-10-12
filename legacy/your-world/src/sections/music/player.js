/**
 * متحكّم التشغيل: يمرّر قائمة التشغيل كاملة إلى المحرّك الأصلي
 * حتى يستمر العمل والشاشة مقفلة (مع إشعار وأزرار تحكّم على شاشة القفل).
 */

import { Player, toSrc } from '../../core/native.js';
import { state, save, emit } from '../../core/store.js';
import { trackById, allTracks } from './library.js';

const listeners = new Set();

export const now = {
  queue: [],           // مسارات القائمة الحالية
  index: 0,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  queueName: '',
};

export const EQ_PRESETS = {
  flat: { label: 'مسطّح', bands: [0, 0, 0, 0, 0] },
  bass: { label: 'باس قوي', bands: [8, 5, 0, -1, 1] },
  vocal: { label: 'صوت واضح', bands: [-2, 0, 5, 4, 1] },
  treble: { label: 'حادّ', bands: [-3, -1, 0, 4, 7] },
  rock: { label: 'روك', bands: [5, 2, -1, 3, 5] },
  pop: { label: 'بوب', bands: [2, 4, 3, 1, 0] },
  night: { label: 'ليلي هادئ', bands: [3, 1, 0, -2, -4] },
  podcast: { label: 'حديث/بودكاست', bands: [-4, 1, 6, 3, -1] },
  full: { label: 'ممتلئ', bands: [6, 3, 1, 3, 6] },
};

export const REVERBS = [
  { value: 'none', label: 'بلا' },
  { value: 'smallroom', label: 'غرفة صغيرة' },
  { value: 'mediumroom', label: 'غرفة متوسطة' },
  { value: 'largeroom', label: 'غرفة كبيرة' },
  { value: 'mediumhall', label: 'قاعة متوسطة' },
  { value: 'largehall', label: 'قاعة كبيرة' },
  { value: 'plate', label: 'صفيحة' },
];

export const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function onPlayer(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function fire() { listeners.forEach((fn) => fn(now)); }

export function currentTrack() { return now.queue[now.index] || null; }

/** يهيّئ الجسر ويستعيد آخر جلسة. */
export async function initPlayer() {
  Player.on((ev) => {
    if (!ev) return;
    if (typeof ev.playing === 'boolean') now.playing = ev.playing;
    if (Number.isInteger(ev.index) && ev.index >= 0) now.index = ev.index;
    if (Number.isFinite(ev.positionMs)) now.positionMs = ev.positionMs;
    if (Number.isFinite(ev.durationMs) && ev.durationMs > 0) now.durationMs = ev.durationMs;
    if (now.playing && currentTrack()) rememberPosition();
    fire();
    emit('player');
  });

  const m = state.music;
  await applyAudioSettings();
  await Player.setRepeat(m.repeat);
  await Player.setShuffle(m.shuffle);
  await Player.setSpeed(m.speed, m.pitchLock);
  await Player.setVolume(m.volume, m.effects.balance);
}

/** يشغّل قائمة (مصفوفة مسارات) ابتداءً من فهرس. */
export async function playQueue(tracks, index = 0, name = '') {
  now.queue = tracks.filter(Boolean);
  now.index = Math.max(0, Math.min(index, now.queue.length - 1));
  now.queueName = name;
  if (!now.queue.length) return;

  const payload = now.queue.map((t) => ({
    id: t.id, uri: toSrc(t.uri), rawUri: t.uri,
    title: t.title, artist: t.artist, album: t.album,
    durationMs: t.durationMs, artUri: t.artUri ? toSrc(t.artUri) : null,
  }));

  await Player.setQueue(payload, now.index, true);
  now.playing = true;
  pushRecent(now.queue[now.index]);
  rememberPosition();
  fire();
}

export async function playTrack(track, contextTracks = null, name = '') {
  const list = contextTracks?.length ? contextTracks : [track];
  const idx = list.findIndex((t) => t.id === track.id);
  return playQueue(list, idx < 0 ? 0 : idx, name);
}

export const toggle = () => Player.toggle();
export const play = () => Player.play();
export const pause = () => Player.pause();
export const next = () => Player.next();
export const prev = () => Player.prev();
export const seek = (ms) => Player.seek(ms);
export const seekBy = (ms) => Player.seekBy(ms);

export function setRepeat(mode) {
  state.music.repeat = mode; save();
  Player.setRepeat(mode);
  emit('player');
}

export function cycleRepeat() {
  const order = ['off', 'all', 'one'];
  setRepeat(order[(order.indexOf(state.music.repeat) + 1) % order.length]);
  return state.music.repeat;
}

export function setShuffle(on) {
  state.music.shuffle = !!on; save();
  Player.setShuffle(!!on);
  emit('player');
}

export function setSpeed(speed) {
  state.music.speed = speed; save();
  Player.setSpeed(speed, state.music.pitchLock);
  emit('player');
}

export function setPitchLock(on) {
  state.music.pitchLock = !!on; save();
  Player.setSpeed(state.music.speed, !!on);
}

export function setVolume(v) {
  state.music.volume = v; save();
  Player.setVolume(v, state.music.effects.balance);
}

/** يطبّق كل مؤثرات الصوت المحفوظة على المحرّك. */
export function applyAudioSettings() {
  const fx = state.music.effects;
  return Player.setEffects({
    enabled: fx.enabled,
    bands: fx.bands,
    bass: fx.bass,
    virtualizer: fx.virtualizer,
    reverb: fx.reverb,
    loudness: fx.loudness,
    monoMix: fx.monoMix,
    balance: fx.balance,
  });
}

export function updateEffects(patch) {
  Object.assign(state.music.effects, patch);
  save();
  applyAudioSettings();
  emit('player');
}

export function setSleepTimer(minutes) {
  state.music.sleepTimerMin = minutes; save();
  Player.setSleepTimer(minutes);
  emit('player');
}

/* ── المفضّلة والقوائم ── */

export function isFavorite(id) { return state.music.favorites.includes(id); }

export function toggleFavorite(id) {
  const f = state.music.favorites;
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.unshift(id);
  save();
  emit('player');
  return i < 0;
}

export function favoriteTracks() {
  return state.music.favorites.map(trackById).filter(Boolean);
}

export function recentTracks(limit = 30) {
  return state.music.recent.slice(0, limit).map(trackById).filter(Boolean);
}

function pushRecent(track) {
  if (!track) return;
  const r = state.music.recent;
  const i = r.indexOf(track.id);
  if (i >= 0) r.splice(i, 1);
  r.unshift(track.id);
  if (r.length > 100) r.length = 100;
  save();
}

function rememberPosition() {
  const t = currentTrack();
  if (!t) return;
  state.music.lastTrackId = t.id;
  state.music.lastPosition = now.positionMs;
  save();
}

/** يعيد بناء قائمة من كل المكتبة (للتشغيل العشوائي الكامل). */
export function shuffleAll() {
  const list = [...allTracks()];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  setShuffle(true);
  return playQueue(list, 0, 'عشوائي — كل الأغاني');
}
