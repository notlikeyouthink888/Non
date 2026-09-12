/** القسم الأول: الأغاني — المكتبة، المفضّلة، القوائم، الفنانون. */

import '../../styles/music.css';
import { h, fill, empty } from '../../core/dom.js';
import { dur, durMs, bytes } from '../../core/fmt.js';
import { state, save, uid, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, promptSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { isNative } from '../../core/native.js';
import {
  loadLibrary, scanLibrary, addFromBrowser, allTracks, search, byArtist, byAlbum,
  recentlyAdded, libraryStats, isScanning, isLoaded, trackById,
  displayTitle, renameTrack, isRenamed, originalTitle, newlyFound,
} from './library.js';
import {
  playTrack, playQueue, shuffleAll, now, onPlayer, isFavorite, toggleFavorite,
  favoriteTracks, recentTracks,
} from './player.js';
import { openNowPlaying } from './now.js';
import { openEffects } from './effects.js';

const TABS = [
  { id: 'tracks', label: 'كل الأغاني' },
  { id: 'new', label: 'الجديد' },
  { id: 'favorites', label: 'المفضّلة' },
  { id: 'playlists', label: 'القوائم' },
  { id: 'artists', label: 'الفنانون' },
  { id: 'albums', label: 'الألبومات' },
];

let tab = 'tracks';
let query = '';

export default {
  id: 'music',
  label: 'الأغاني',
  icon: '♪',

  mount(root, params = {}) {
    if (params.tab) tab = params.tab;
    const content = h('div');
    const tabsEl = h('div.tabs');

    const searchInput = h('input', {
      type: 'search', placeholder: 'ابحث في أغانيك…', value: query,
      oninput: (e) => { query = e.target.value; renderContent(); },
    });

    fill(root, [
      h('div.head', [
        h('div', [h('h1', 'أغانيك'), h('p', 'كل ما في جهازك — دون إنترنت')]),
        h('div.row', { style: { gap: '6px' } }, [
          h('button.btn.icon', { title: 'المؤثرات', onclick: () => openEffects() }, '🎚'),
          h('button.btn.icon', { title: 'تحديث المكتبة', onclick: () => rescan() }, '⟳'),
          h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(() => renderContent()) }, '⚙'),
        ]),
      ]),
      searchInput,
      h('div', { style: { height: '12px' } }),
      tabsEl,
      content,
    ]);

    TABS.forEach((t) => tabsEl.append(h('button', {
      onclick: () => { tab = t.id; haptic(); syncTabs(); renderContent(); },
      dataset: { tab: t.id },
    }, t.label)));

    function syncTabs() {
      [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    }

    async function rescan() {
      if (isNative()) {
        toast('جارٍ البحث عن ملفات جديدة…');
        const { added } = await scanLibrary({ deep: true });
        if (added > 0) {
          toast(`وُجدت ${added} أغنية جديدة`, 'ok');
          tab = 'new';
          syncTabs();
        } else {
          toast(`لا جديد · ${allTracks().length} أغنية`, 'ok');
        }
      } else {
        await addFromBrowser();
      }
      renderContent();
    }

    function renderContent() {
      fill(content, buildTab(tab, query, renderContent, rescan));
    }

    syncTabs();
    renderContent();

    // أول تحميل للمكتبة
    if (!isLoaded()) loadLibrary().then(renderContent);

    const offs = [
      subscribe('library', renderContent),
      onPlayer(() => {
        [...content.querySelectorAll('.track-row')].forEach((row) => {
          row.classList.toggle('playing', row.dataset.id === now.queue[now.index]?.id);
        });
      }),
    ];

    return {
      setTab: (t) => { tab = t; syncTabs(); renderContent(); },
      unmount: () => offs.forEach((f) => f?.()),
    };
  },
};

/* ─────────────────────────── التبويبات ─────────────────────────── */

function buildTab(which, q, rerender, rescan) {
  const tracks = allTracks();

  if (!tracks.length) {
    return h('div', [
      isScanning()
        ? h('div.card', h('div.scan-state', [h('div.spin'), 'جارٍ فحص أغاني الجهاز…']))
        : h('div.card', [
          empty('🎵', isNative()
            ? 'لم يُعثر على أغانٍ بعد. اسمح بالوصول إلى ملفات الصوت ثم افحص الجهاز.'
            : 'أنت في المتصفّح — اختر ملفات صوتية لتجربة المشغّل. على أندرويد تُقرأ كل أغاني الجهاز تلقائيًا.'),
          h('button.btn.primary.block', { onclick: rescan }, isNative() ? 'افحص الجهاز الآن' : 'اختر ملفات'),
        ]),
    ]);
  }

  if (which === 'tracks') return tracksTab(q, rerender);
  if (which === 'new') return newTab(rerender, rescan);
  if (which === 'favorites') return favoritesTab(rerender);
  if (which === 'playlists') return playlistsTab(rerender);
  if (which === 'artists') return groupTab(byArtist(), '👤', rerender);
  if (which === 'albums') return groupTab(byAlbum(), '💿', rerender);
  return null;
}

function tracksTab(q, rerender) {
  const list = search(q);
  const st = libraryStats();
  const recent = recentTracks(8);

  return h('div', [
    !q ? h('div.card.glow', [
      h('div.row.between', [
        h('div', [
          h('div.card-t', `${st.count} أغنية`),
          h('div.card-s', `${st.artists} فنّان · ${durMs(st.totalMs)} · ${bytes(st.bytes)}`),
        ]),
        h('button.btn.primary.sm', { onclick: () => shuffleAll() }, '🔀 شغّل عشوائيًا'),
      ]),
    ]) : null,

    !q && recent.length ? h('div', [
      h('h2.sec', 'آخر ما استمعت إليه'),
      h('div.list', recent.slice(0, 5).map((t) => trackRow(t, recent, 'آخر ما شُغّل', rerender))),
    ]) : null,

    h('h2.sec', q ? `نتائج البحث (${list.length})` : 'كل الأغاني'),
    list.length
      ? h('div.list', list.map((t) => trackRow(t, list, q ? 'نتائج البحث' : 'كل الأغاني', rerender)))
      : empty('🔍', 'لا نتائج مطابقة'),
  ]);
}

/** تبويب «الجديد»: ما ظهر بعد آخر تحديث + أحدث ما أُضيف إلى الجهاز. */
function newTab(rerender, rescan) {
  const fresh = newlyFound();
  const recent = recentlyAdded(30);

  return h('div', [
    h('div.card.glow', [
      h('div.card-t', '⟳ ابحث عن أغانٍ جديدة'),
      h('div.card-s', 'بعد تنزيل أغنية من تيليجرام أو أي تطبيق، اضغط الزر ليعيد النظام فهرسة الملفات '
        + 'ويضيفها إلى مكتبتك.'),
      h('button.btn.primary.block', {
        style: { marginTop: '10px' },
        onclick: rescan,
      }, isScanning() ? 'جارٍ الفحص…' : '⟳ حدّث المكتبة الآن'),
    ]),

    fresh.length ? h('div', [
      h('h2.sec', `أُضيفت للتوّ (${fresh.length})`),
      h('div.list', fresh.map((t) => trackRow(t, fresh, 'الجديد', rerender))),
    ]) : null,

    h('h2.sec', 'الأحدث في جهازك'),
    recent.length
      ? h('div.list', recent.map((t) => trackRow(t, recent, 'الأحدث', rerender)))
      : empty('🎵', 'لا شيء بعد'),
  ]);
}

/** تغيير اسم الأغنية داخل التطبيق (الملف نفسه لا يُمَس). */
function openRename(track, rerender) {
  const input = h('input', { value: displayTitle(track), placeholder: 'الاسم الجديد' });
  const panel = sheet('اسم الأغنية', h('div', [
    input,
    h('div.muted', { style: { marginTop: '8px' } }, `الاسم الأصلي: ${originalTitle(track.id)}`),
    h('div.muted', { style: { marginTop: '4px', fontSize: '11.5px' } },
      'الاسم الجديد يظهر في المشغّل وشاشة القفل. ملف الأغنية في جهازك لا يتغيّر.'),
    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn' + (isRenamed(track.id) ? '.danger' : '.ghost'), {
        onclick: () => {
          renameTrack(track.id, '');
          panel.close();
          toast('أُعيد الاسم الأصلي', 'ok');
          rerender?.();
        },
      }, isRenamed(track.id) ? '↺ الاسم الأصلي' : 'إلغاء'),
      h('button.btn.primary', {
        onclick: () => {
          const v = input.value.trim();
          if (!v) { toast('اكتب اسمًا', 'err'); return; }
          renameTrack(track.id, v);
          panel.close();
          toast('تغيّر الاسم', 'ok');
          rerender?.();
        },
      }, '💾 حفظ'),
    ]),
  ]));
  setTimeout(() => { input.focus(); input.select(); }, 150);
}

function favoritesTab(rerender) {
  const favs = favoriteTracks();
  if (!favs.length) return empty('🤍', 'لا مفضّلات بعد — اضغط على القلب في أي أغنية.');
  return h('div', [
    h('button.btn.primary.block', { onclick: () => playQueue(favs, 0, 'المفضّلة') }, '▶ شغّل المفضّلة'),
    h('h2.sec', `${favs.length} أغنية`),
    h('div.list', favs.map((t) => trackRow(t, favs, 'المفضّلة', rerender))),
  ]);
}

function playlistsTab(rerender) {
  const pls = state.music.playlists;
  return h('div', [
    h('button.btn.block', { onclick: () => createPlaylist(rerender) }, '＋ قائمة جديدة'),
    h('h2.sec', 'قوائمي'),
    pls.length ? h('div.list', pls.map((p) => {
      const tracks = p.trackIds.map(trackById).filter(Boolean);
      return h('div.item', {
        onclick: () => openPlaylist(p.id, rerender),
      }, [
        h('div.n', { style: { fontSize: '18px' } }, '📃'),
        h('div.grow', [h('div.t', p.name), h('div.s', `${tracks.length} أغنية · ${durMs(tracks.reduce((s, t) => s + t.durationMs, 0))}`)]),
        h('button.btn.sm', {
          onclick: (e) => { e.stopPropagation(); playQueue(tracks, 0, p.name); },
        }, '▶'),
      ]);
    })) : empty('📃', 'لا قوائم بعد'),
  ]);
}

function groupTab(groups, icon, rerender) {
  return h('div.list', groups.map(([name, tracks]) => h('div.item', {
    onclick: () => sheet(name, () => h('div', [
      h('button.btn.primary.block', { onclick: () => playQueue(tracks, 0, name) }, `▶ شغّل الكل (${tracks.length})`),
      h('div.list', { style: { marginTop: '12px' } }, tracks.map((t) => trackRow(t, tracks, name, rerender))),
    ])),
  }, [
    h('div.n', { style: { fontSize: '18px' } }, icon),
    h('div.grow', [h('div.t.ellipsis', name), h('div.s', `${tracks.length} أغنية`)]),
    h('span.muted', '‹'),
  ])));
}

/* ─────────────────────────── عناصر ─────────────────────────── */

export function trackRow(track, context, contextName, rerender) {
  const playing = now.queue[now.index]?.id === track.id;
  return h('div.track-row' + (playing ? '.playing' : ''), {
    dataset: { id: track.id },
    onclick: () => { haptic(); playTrack(track, context, contextName); },
  }, [
    track.artUri ? h('div.n', h('img', { src: track.artUri, alt: '' })) : h('div.n', '♪'),
    h('div.grow', [
      h('div.t.ellipsis', displayTitle(track)),
      h('div.s.ellipsis', track.artist),
    ]),
    h('div.d.mono', dur(track.durationMs)),
    h('button.btn.sm.ghost', {
      onclick: (e) => { e.stopPropagation(); trackMenu(track, rerender); },
    }, '⋯'),
  ]);
}

function trackMenu(track, rerender) {
  sheet(displayTitle(track), ({ close }) => h('div.list', [
    h('div.item', { onclick: () => { close(); openRename(track, rerender); } }, [
      h('div.grow', [
        h('div.t', '✎ غيّر اسم الأغنية'),
        isRenamed(track.id) ? h('div.s', `الأصلي: ${originalTitle(track.id)}`) : null,
      ]),
    ]),
    h('div.item', { onclick: () => { toggleFavorite(track.id); close(); rerender?.(); } }, [
      h('div.grow', isFavorite(track.id) ? '💔 أزل من المفضّلة' : '❤️ أضف إلى المفضّلة'),
    ]),
    h('div.item', { onclick: () => { close(); addToPlaylist(track, rerender); } }, [h('div.grow', '📃 أضف إلى قائمة')]),
    h('div.item', { onclick: () => { close(); playTrack(track, [track], displayTitle(track)); openNowPlaying(); } }, [h('div.grow', '▶ شغّلها وحدها')]),
    h('div.item', [
      h('div.grow', [
        h('div.t', 'التفاصيل'),
        h('div.s', `${track.album || 'بلا ألبوم'} · ${dur(track.durationMs)} · ${bytes(track.size)}`),
      ]),
    ]),
  ]));
}

async function createPlaylist(rerender) {
  const name = await promptSheet('اسم القائمة', { placeholder: 'مثلًا: هدوء الليل' });
  if (!name) return;
  state.music.playlists.push({ id: uid('pl_'), name, trackIds: [], createdAt: Date.now() });
  save();
  toast('أُنشئت القائمة', 'ok');
  rerender?.();
}

function addToPlaylist(track, rerender) {
  const pls = state.music.playlists;
  sheet('أضف إلى قائمة', ({ close }) => h('div.list', [
    ...pls.map((p) => h('div.item', {
      onclick: () => {
        if (!p.trackIds.includes(track.id)) p.trackIds.push(track.id);
        save(); toast(`أُضيفت إلى «${p.name}»`, 'ok'); close(); rerender?.();
      },
    }, [h('div.grow', p.name), h('span.muted', `${p.trackIds.length}`)])),
    h('div.item', {
      onclick: async () => {
        close();
        const name = await promptSheet('اسم القائمة الجديدة');
        if (!name) return;
        state.music.playlists.push({ id: uid('pl_'), name, trackIds: [track.id], createdAt: Date.now() });
        save(); toast('أُنشئت القائمة وأُضيفت الأغنية', 'ok'); rerender?.();
      },
    }, [h('div.grow', '＋ قائمة جديدة')]),
  ]));
}

function openPlaylist(id, rerender) {
  const p = state.music.playlists.find((x) => x.id === id);
  if (!p) return;
  const tracks = p.trackIds.map(trackById).filter(Boolean);
  sheet(p.name, ({ close }) => h('div', [
    h('div.grid2', [
      h('button.btn.primary', { onclick: () => playQueue(tracks, 0, p.name) }, '▶ شغّل'),
      h('button.btn.danger', {
        onclick: async () => {
          if (!await confirmSheet('حذف القائمة', `سيُحذف «${p.name}». الأغاني نفسها تبقى في جهازك.`)) return;
          state.music.playlists = state.music.playlists.filter((x) => x.id !== id);
          save(); close(); rerender?.(); toast('حُذفت القائمة', 'ok');
        },
      }, '🗑 حذف'),
    ]),
    h('div.list', { style: { marginTop: '12px' } }, tracks.length
      ? tracks.map((t, i) => h('div.track-row', [
        h('div.n', String(i + 1)),
        h('div.grow', { onclick: () => playQueue(tracks, i, p.name) }, [
          h('div.t.ellipsis', t.title), h('div.s.ellipsis', t.artist),
        ]),
        h('button.btn.sm.ghost', {
          onclick: () => {
            p.trackIds = p.trackIds.filter((x) => x !== t.id);
            save(); close(); openPlaylist(id, rerender); rerender?.();
          },
        }, '✕'),
      ]))
      : empty('🎵', 'القائمة فارغة — أضف أغاني من قائمة «⋯»')),
  ]));
}
