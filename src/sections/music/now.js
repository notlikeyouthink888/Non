/** شاشة «قيد التشغيل» الكاملة. */

import { h, fill, chipGroup } from '../../core/dom.js';
import { dur } from '../../core/fmt.js';
import { sheet, toast, haptic } from '../../core/ui.js';
import { state } from '../../core/store.js';
import {
  now, onPlayer, currentTrack, toggle, next, prev, seek, seekBy,
  cycleRepeat, setShuffle, setSpeed, setPitchLock, setVolume, setSleepTimer,
  toggleFavorite, isFavorite, playQueue, SPEEDS,
} from './player.js';
import { openEffects } from './effects.js';
import { displayTitle } from './library.js';

const REPEAT_ICON = { off: '🔁', all: '🔁', one: '🔂' };

export function openNowPlaying() {
  const body = h('div');
  let seeking = false;
  const s = sheet(null, body);

  const range = h('input', {
    type: 'range', min: 0, max: 1000, value: 0,
    oninput: () => { seeking = true; },
    onchange: (e) => {
      const d = now.durationMs || currentTrack()?.durationMs || 0;
      seek((e.target.value / 1000) * d);
      seeking = false;
    },
  });
  const timeNow = h('span.mono', '0:00');
  const timeEnd = h('span.mono', '0:00');

  function render() {
    const t = currentTrack();
    if (!t) { s.close(); return; }
    const fav = isFavorite(t.id);
    const m = state.music;

    fill(body, [
      h('div.art-box', t.artUri ? h('img', { src: t.artUri, alt: '' }) : '♪'),
      h('div.now-title.ellipsis', displayTitle(t)),
      h('div.now-artist.ellipsis', [t.artist, t.album ? ` · ${t.album}` : ''].join('')),

      h('div.seek', [range, h('div.times', [timeNow, timeEnd])]),

      h('div.transport', [
        h('button', { onclick: () => { haptic(); seekBy(-10000); } }, '⏪'),
        h('button', { onclick: () => { haptic(); prev(); } }, '⏮'),
        h('button.main', { onclick: () => { haptic(); toggle(); } }, now.playing ? '⏸' : '▶'),
        h('button', { onclick: () => { haptic(); next(); } }, '⏭'),
        h('button', { onclick: () => { haptic(); seekBy(10000); } }, '⏩'),
      ]),

      h('div.row.between', { style: { marginTop: '6px' } }, [
        h('button.btn.sm.ghost' + (m.shuffle ? '.ok' : ''), {
          onclick: () => { setShuffle(!m.shuffle); render(); },
        }, m.shuffle ? '🔀 عشوائي' : '🔀 ترتيبي'),
        h('button.btn.sm.ghost', {
          onclick: () => { toggleFavorite(t.id); render(); },
        }, fav ? '❤️ مفضّلة' : '🤍 أضف للمفضّلة'),
        h('button.btn.sm.ghost' + (m.repeat !== 'off' ? '.ok' : ''), {
          onclick: () => { const mode = cycleRepeat(); toast(repeatText(mode)); render(); },
        }, `${REPEAT_ICON[m.repeat]} ${repeatShort(m.repeat)}`),
      ]),

      h('h2.sec', 'سرعة التشغيل'),
      chipGroup(SPEEDS.map((v) => ({ value: v, label: `${v}×` })), m.speed, (v) => { setSpeed(v); render(); }),
      h('label.row', { style: { marginTop: '9px', gap: '8px' } }, [
        h('input', { type: 'checkbox', checked: m.pitchLock, onchange: (e) => setPitchLock(e.target.checked) }),
        h('span.muted', 'ثبّت طبقة الصوت عند تغيير السرعة'),
      ]),

      h('h2.sec', 'الصوت'),
      h('div.row', [
        h('span', '🔈'),
        h('input.grow', {
          type: 'range', min: 0, max: 100, value: Math.round(m.volume * 100),
          oninput: (e) => setVolume(e.target.value / 100),
        }),
        h('span', '🔊'),
      ]),

      h('div.grid2', { style: { marginTop: '12px' } }, [
        h('button.btn', { onclick: () => openEffects() }, '🎚 المؤثرات'),
        h('button.btn', { onclick: () => openSleepTimer(render) }, m.sleepTimerMin ? `😴 ${m.sleepTimerMin} د` : '😴 مؤقّت النوم'),
      ]),

      h('button.btn.ghost.block', { style: { marginTop: '10px' }, onclick: () => openQueue() },
        `📃 قائمة التشغيل (${now.queue.length})`),
    ]);
    tick();
  }

  function tick() {
    const d = now.durationMs || currentTrack()?.durationMs || 0;
    if (!seeking) range.value = d ? Math.round((now.positionMs / d) * 1000) : 0;
    timeNow.textContent = dur(now.positionMs);
    timeEnd.textContent = dur(d);
  }

  const off = onPlayer(() => {
    if (!document.body.contains(body)) { off(); return; }
    tick();
  });

  render();
  return s;
}

function repeatText(mode) {
  return { off: 'التكرار متوقف', all: 'تكرار القائمة', one: 'تكرار الأغنية' }[mode];
}
function repeatShort(mode) {
  return { off: 'بلا تكرار', all: 'كرّر القائمة', one: 'كرّر الأغنية' }[mode];
}

export function openSleepTimer(after) {
  sheet('مؤقّت النوم', ({ close }) => h('div', [
    h('p.muted', { style: { marginTop: 0 } }, 'يوقف التشغيل تلقائيًا بعد المدة المختارة.'),
    h('div.chips', [0, 10, 15, 20, 30, 45, 60, 90].map((min) =>
      h('button.chip' + (state.music.sleepTimerMin === min ? '.on' : ''), {
        onclick: () => {
          setSleepTimer(min);
          toast(min ? `سيتوقّف بعد ${min} دقيقة` : 'أُلغي مؤقّت النوم', 'ok');
          close(); after?.();
        },
      }, min ? `${min} دقيقة` : 'إيقاف'))),
  ]));
}

export function openQueue() {
  sheet('قائمة التشغيل', () => h('div.list', now.queue.map((t, i) =>
    h('div.track-row' + (i === now.index ? '.playing' : ''), {
      onclick: () => playQueue(now.queue, i, now.queueName),
    }, [
      h('div.n', i === now.index ? '▶' : String(i + 1)),
      h('div.grow', [h('div.t.ellipsis', displayTitle(t)), h('div.s.ellipsis', t.artist)]),
      h('div.d.mono', dur(t.durationMs)),
    ]))));
}
