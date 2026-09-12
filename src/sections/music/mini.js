/** شريط المشغّل المصغّر — يظهر فوق شريط التنقّل في كل الأقسام. */

import { h, fill } from '../../core/dom.js';
import { dur } from '../../core/fmt.js';
import { now, onPlayer, toggle, next, currentTrack } from './player.js';
import { displayTitle } from './library.js';
import { openNowPlaying } from './now.js';

export function mountMiniPlayer(host) {
  const render = () => {
    const t = currentTrack();
    if (!t) { host.replaceChildren(); return; }

    const bar = h('div.mini', { style: { position: 'relative' }, onclick: (e) => {
      if (e.target.closest('button')) return;
      openNowPlaying();
    } }, [
      t.artUri
        ? h('img.art', { src: t.artUri, alt: '' })
        : h('div.art', '♪'),
      h('div.grow', [
        h('div.t.ellipsis', displayTitle(t)),
        h('div.s.ellipsis', `${t.artist} · ${dur(now.positionMs)} / ${dur(now.durationMs || t.durationMs)}`),
      ]),
      h('button', { onclick: () => toggle() }, now.playing ? '⏸' : '▶'),
      h('button', { onclick: () => next() }, '⏭'),
      h('div.prog', h('i', { style: { width: `${pct()}%` } })),
    ]);
    fill(host, bar);
  };

  const pct = () => {
    const d = now.durationMs || currentTrack()?.durationMs || 0;
    return d ? Math.min(100, (now.positionMs / d) * 100) : 0;
  };

  onPlayer(render);
  render();
}
