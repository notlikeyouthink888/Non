/** القسم الرابع: الأماكن — خريطة تعمل دون إنترنت وقائمة أماكن أريد زيارتها. */

import '../../styles/places.css';
import { h, fill, empty, chipGroup, toggle as toggleSwitch, settingRow } from '../../core/dom.js';
import { state, save, uid, emit, subscribe } from '../../core/store.js';
import { sheet, toast, confirmSheet, promptSheet, haptic } from '../../core/ui.js';
import { openSettings } from '../../core/settings.js';
import { Location } from '../../core/native.js';
import { createMap } from './map.js';
import { distance, bearing, compass, formatDistance, formatCoord, parseCoords, travelHints } from './geo.js';
import { downloadArea, estimateTiles, cachedCount, clearTiles, TILE_SOURCE_NAME } from './tiles.js';

const CATEGORIES = [
  { value: 'visit', label: '📍 أريد زيارته', icon: '📍' },
  { value: 'food', label: '🍽 مطعم/مقهى', icon: '🍽' },
  { value: 'nature', label: '🌳 طبيعة', icon: '🌳' },
  { value: 'study', label: '📚 دراسة/عمل', icon: '📚' },
  { value: 'sport', label: '🏟 رياضة', icon: '🏟' },
  { value: 'shop', label: '🛍 تسوّق', icon: '🛍' },
  { value: 'family', label: '👥 أهل وأصدقاء', icon: '👥' },
  { value: 'other', label: '⭐ آخر', icon: '⭐' },
];

const iconOf = (c) => (CATEGORIES.find((x) => x.value === c) || CATEGORIES[0]).icon;

let tab = 'map';
let filter = 'all';
let mapApi = null;
let myPos = null;
let stopWatch = null;

export default {
  id: 'places',
  label: 'الأماكن',
  icon: '🗺',

  mount(root, params = {}) {
    if (params.tab) tab = params.tab;
    const content = h('div');
    const tabsEl = h('div.tabs', [
      h('button', { dataset: { tab: 'map' }, onclick: () => setTab('map') }, 'الخريطة'),
      h('button', { dataset: { tab: 'list' }, onclick: () => setTab('list') }, 'أماكني'),
      h('button', { dataset: { tab: 'offline' }, onclick: () => setTab('offline') }, 'دون إنترنت'),
    ]);

    fill(root, [
      h('div.head', [
        h('div', [h('h1', 'أماكنك'), h('p', 'خريطة وقائمة تعملان بلا إنترنت')]),
        h('button.btn.icon', { title: 'الإعدادات', onclick: () => openSettings(render) }, '⚙'),
      ]),
      tabsEl,
      content,
    ]);

    function setTab(t) { tab = t; haptic(); sync(); render(); }
    const sync = () => [...tabsEl.children].forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const render = () => {
      mapApi?.destroy?.();
      mapApi = null;
      fill(content, view(tab, render));
    };

    sync();
    render();
    const off = subscribe('places', render);

    return {
      setTab,
      unmount: () => { off(); mapApi?.destroy?.(); mapApi = null; stopWatch?.(); stopWatch = null; },
    };
  },
};

function view(which, rerender) {
  if (which === 'map') return mapTab(rerender);
  if (which === 'list') return listTab(rerender);
  return offlineTab(rerender);
}

/* ─────────────────── الخريطة ─────────────────── */

function mapTab(rerender) {
  const v = state.places.lastView;
  const wrap = h('div.map-wrap.full');

  const map = createMap({
    lat: v.lat, lng: v.lng, zoom: v.zoom,
    onMove: (nv) => {
      state.places.lastView = { lat: nv.lat, lng: nv.lng, zoom: nv.zoom };
      save();
    },
    onLongPress: (pt) => { haptic(25); openPlaceEditor(newPlace(pt), rerender); },
    onPickMarker: (m) => {
      const place = state.places.items.find((p) => p.id === m.id);
      if (place) openPlaceSheet(place, rerender);
    },
  });
  mapApi = map;

  map.setMarkers(state.places.items.map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, label: p.name,
    color: p.visited ? '#34d399' : '#7c5cff',
  })));
  if (myPos) map.setMe(myPos);

  wrap.append(
    map.el,
    h('div.map-tools', [
      h('button', { title: 'تكبير', onclick: () => map.zoomIn() }, '＋'),
      h('button', { title: 'تصغير', onclick: () => map.zoomOut() }, '－'),
      h('button', { title: 'موقعي', onclick: () => locateMe(map) }, '◎'),
      h('button', { title: 'اعرض كل الأماكن', onclick: () => {
        const pts = state.places.items;
        if (pts.length) map.fit(pts); else toast('لا أماكن محفوظة بعد');
      } }, '⛶'),
    ]),
    h('div.map-hint', 'اضغط مطوّلًا على الخريطة لإضافة مكان في تلك النقطة'),
  );

  return h('div', [
    wrap,
    h('div.grid2', { style: { marginTop: '12px' } }, [
      h('button.btn.primary', { onclick: () => addHere(map, rerender) }, '＋ مكان هنا'),
      h('button.btn', { onclick: () => addByText(map, rerender) }, '⌨ بالإحداثيات'),
    ]),
    nearestCard(),
  ]);
}

async function locateMe(map) {
  toast('جارٍ تحديد موقعك…');
  try {
    const pos = await Location.current();
    myPos = pos;
    map.setMe(pos);
    map.setView(pos.lat, pos.lng, Math.max(15, map.view.zoom));
    toast('هذا موقعك', 'ok');
    if (!stopWatch) {
      stopWatch = Location.watch((p) => { myPos = p; mapApi?.setMe(p); }, () => {});
    }
  } catch (err) {
    toast(err.message || 'تعذّر تحديد الموقع', 'err');
  }
}

function addHere(map, rerender) {
  openPlaceEditor(newPlace({ lat: map.view.lat, lng: map.view.lng }), rerender);
}

async function addByText(map, rerender) {
  const text = await promptSheet('الإحداثيات', {
    placeholder: 'مثال: 33.31520, 44.36610',
  });
  if (!text) return;
  const pt = parseCoords(text);
  if (!pt) { toast('صيغة غير مفهومة — اكتب: خط العرض، خط الطول', 'err'); return; }
  map.setView(pt.lat, pt.lng, 16);
  openPlaceEditor(newPlace(pt), rerender);
}

function nearestCard() {
  if (!myPos || !state.places.items.length) return null;
  const sorted = state.places.items
    .map((p) => ({ p, d: distance(myPos, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);

  return h('div', [
    h('h2.sec', 'الأقرب إليك'),
    h('div.list', sorted.map(({ p, d }) => {
      const b = bearing(myPos, p);
      const hints = travelHints(d);
      return h('div.place', [
        h('div.pin', iconOf(p.category)),
        h('div.grow', [
          h('div.t.ellipsis', p.name),
          h('div.s', `${compass(b)} · ${hints.walk || hints.drive}`),
        ]),
        h('div.d', formatDistance(d)),
      ]);
    })),
  ]);
}

/* ─────────────────── القائمة ─────────────────── */

function listTab(rerender) {
  const items = filter === 'all'
    ? state.places.items
    : filter === 'todo'
      ? state.places.items.filter((p) => !p.visited)
      : state.places.items.filter((p) => p.category === filter);

  const sorted = myPos
    ? [...items].sort((a, b) => distance(myPos, a) - distance(myPos, b))
    : [...items].sort((a, b) => b.createdAt - a.createdAt);

  return h('div', [
    h('button.btn.primary.block', { onclick: () => openPlaceEditor(newPlace(), rerender) }, '＋ مكان جديد'),

    h('div', { style: { marginTop: '12px' } }, chipGroup(
      [{ value: 'all', label: `الكل (${state.places.items.length})` },
        { value: 'todo', label: 'لم أزره بعد' },
        ...CATEGORIES.map((c) => ({ value: c.value, label: c.label }))],
      filter,
      (v) => { filter = v; rerender(); },
    )),

    sorted.length
      ? h('div.list', { style: { marginTop: '12px' } }, sorted.map((p) => placeRow(p, rerender)))
      : h('div', { style: { marginTop: '20px' } }, empty('🗺', 'لا أماكن بعد — أضف مكانًا تريد زيارته.')),
  ]);
}

function placeRow(p, rerender) {
  const d = myPos ? distance(myPos, p) : null;
  return h('div.place' + (p.visited ? '.visited' : ''), {
    onclick: () => openPlaceSheet(p, rerender),
  }, [
    h('div.pin', iconOf(p.category)),
    h('div.grow', [
      h('div.t.ellipsis', p.name),
      h('div.s.ellipsis', p.note || formatCoord(p.lat, p.lng)),
    ]),
    d !== null ? h('div.d', formatDistance(d)) : null,
    p.visited ? h('span.badge.ok', '✓') : null,
  ]);
}

/* ─────────────────── الأوراق ─────────────────── */

function newPlace(pt = {}) {
  const v = state.places.lastView;
  return {
    id: uid('pl_'),
    name: '',
    note: '',
    lat: pt.lat ?? v.lat,
    lng: pt.lng ?? v.lng,
    category: 'visit',
    visited: false,
    createdAt: Date.now(),
  };
}

function savePlace(p) {
  const list = state.places.items;
  const i = list.findIndex((x) => x.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  save();
  emit('places');
}

function removePlace(id) {
  state.places.items = state.places.items.filter((p) => p.id !== id);
  save();
  emit('places');
}

function openPlaceEditor(place, onDone) {
  const draft = { ...place };
  const body = h('div');
  const panel = sheet(place.name ? 'تعديل المكان' : 'مكان جديد', body);

  function render() {
    const coordLine = h('div.muted.mono', formatCoord(draft.lat, draft.lng));
    const wrap = h('div.map-wrap.mini');
    const mini = createMap({
      lat: draft.lat, lng: draft.lng, zoom: 15,
      onMove: (v) => { draft.lat = v.lat; draft.lng = v.lng; coordLine.textContent = formatCoord(draft.lat, draft.lng); },
    });
    mini.setMarkers([{ id: 'draft', lat: draft.lat, lng: draft.lng, label: draft.name || 'هنا' }]);
    wrap.append(mini.el, h('div.map-hint', 'حرّك الخريطة لتضبط الموقع بدقّة'));

    fill(body, [
      h('input', {
        placeholder: 'اسم المكان', value: draft.name,
        oninput: (e) => { draft.name = e.target.value; },
      }),
      h('textarea', {
        placeholder: 'تفصيلة عنه: لماذا تريد الذهاب؟ متى يفتح؟ مع من؟',
        value: draft.note, style: { marginTop: '10px' },
        oninput: (e) => { draft.note = e.target.value; },
      }),

      h('h2.sec', 'التصنيف'),
      chipGroup(CATEGORIES, draft.category, (v) => { draft.category = v; }),

      h('h2.sec', 'الموقع'),
      wrap,
      h('div.row.between', { style: { marginTop: '8px' } }, [
        coordLine,
        h('button.btn.sm', {
          onclick: async () => {
            try {
              const pos = await Location.current();
              myPos = pos;
              draft.lat = pos.lat; draft.lng = pos.lng;
              mini.setView(pos.lat, pos.lng, 16);
              mini.setMe(pos);
              coordLine.textContent = formatCoord(draft.lat, draft.lng);
              toast('أُخذ موقعك الحالي', 'ok');
            } catch (err) { toast(err.message, 'err'); }
          },
        }, '◎ موقعي الحالي'),
      ]),

      settingRow('زرته بالفعل', null, toggleSwitch(draft.visited, (on) => { draft.visited = on; })),

      h('div.grid2', { style: { marginTop: '14px' } }, [
        h('button.btn.danger', {
          onclick: async () => {
            if (!state.places.items.some((p) => p.id === draft.id)) { panel.close(); return; }
            if (!await confirmSheet('حذف المكان', `سيُحذف «${draft.name || 'بلا اسم'}».`)) return;
            removePlace(draft.id); panel.close(); onDone?.();
          },
        }, '🗑 حذف'),
        h('button.btn.primary', {
          onclick: () => {
            if (!draft.name.trim()) { toast('اكتب اسم المكان', 'err'); return; }
            savePlace(draft);
            panel.close();
            toast('حُفظ المكان', 'ok');
            onDone?.();
          },
        }, '💾 حفظ'),
      ]),
    ]);
  }

  render();
}

function openPlaceSheet(p, rerender) {
  const d = myPos ? distance(myPos, p) : null;
  const b = myPos ? bearing(myPos, p) : null;
  const hints = d !== null ? travelHints(d) : null;

  sheet(p.name, ({ close }) => h('div', [
    h('div.row.wrap', { style: { gap: '6px' } }, [
      h('span.badge.accent', (CATEGORIES.find((c) => c.value === p.category) || {}).label || 'مكان'),
      p.visited ? h('span.badge.ok', 'زرته') : h('span.badge', 'لم أزره'),
    ]),
    p.note ? h('p', { style: { marginTop: '10px' } }, p.note) : null,
    h('div.muted.mono', { style: { marginTop: '8px' } }, formatCoord(p.lat, p.lng)),

    d !== null ? h('div.card.tight', { style: { marginTop: '12px' } }, [
      h('div.card-t', `${formatDistance(d)} · ${compass(b)}`),
      h('div.card-s', [hints.walk, hints.drive].filter(Boolean).join(' · ')),
    ]) : h('div.muted', { style: { marginTop: '10px' } }, 'فعّل موقعك لمعرفة المسافة والاتجاه.'),

    h('div.grid2', { style: { marginTop: '14px' } }, [
      h('button.btn', {
        onclick: () => {
          p.visited = !p.visited;
          save(); emit('places'); close(); rerender?.();
          toast(p.visited ? 'وُسم كمَزُور' : 'أُعيد إلى قائمة الزيارة', 'ok');
        },
      }, p.visited ? '↺ لم أزره' : '✓ زرته'),
      h('button.btn.primary', {
        onclick: () => { close(); openPlaceEditor(p, rerender); },
      }, '✎ تعديل'),
    ]),

    h('button.btn.ghost.block', {
      style: { marginTop: '10px' },
      onclick: () => {
        close();
        tab = 'map';
        state.places.lastView = { lat: p.lat, lng: p.lng, zoom: 16 };
        save();
        rerender?.();
      },
    }, '🗺 اعرضه على الخريطة'),
  ]));
}

/* ─────────────────── وضع دون إنترنت ─────────────────── */

function offlineTab(rerender) {
  const info = h('div.muted', 'جارٍ الحساب…');
  cachedCount().then((n) => { info.textContent = `${n} بلاطة خريطة مخزّنة داخل جهازك`; });

  const v = state.places.lastView;
  const bounds = mapBoundsAround(v.lat, v.lng, 0.06);
  const est = estimateTiles(bounds, 12, 16);
  const progress = h('div');

  return h('div', [
    h('div.card', [
      h('div.card-t', '🔌 كل شيء هنا يعمل دون إنترنت'),
      h('div.card-s', 'الأماكن والإحداثيات والمسافات وشبكة الخريطة تُحسب داخل جهازك. '
        + 'صور الخريطة التفصيلية وحدها تحتاج تنزيلًا مرّة واحدة، ثم تعمل بلا اتصال.'),
      h('div', { style: { marginTop: '8px' } }, info),
    ]),

    h('h2.sec', 'نزّل خريطة منطقتك (اختياري)'),
    h('div.card', [
      h('div.card-s', `المنطقة الظاهرة حول (${v.lat.toFixed(3)}، ${v.lng.toFixed(3)}) بمستويات تكبير 12–16 ≈ ${est} بلاطة.`),
      h('div.muted', { style: { marginTop: '6px' } }, `المصدر: ${TILE_SOURCE_NAME} · يحتاج اتصالًا أثناء التنزيل فقط.`),
      progress,
      h('button.btn.primary.block', {
        style: { marginTop: '10px' },
        onclick: async (e) => {
          const btn = e.target;
          btn.disabled = true;
          const bar = h('i', { style: { width: '0%' } });
          fill(progress, [h('div.dl-bar', bar), h('div.muted', { style: { marginTop: '6px' } }, 'جارٍ التنزيل…')]);
          try {
            const r = await downloadArea(bounds, 12, 16, (done, total) => {
              bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
            });
            toast(r.failed ? `اكتمل مع ${r.failed} بلاطة فاشلة` : 'اكتمل التنزيل — الخريطة تعمل الآن دون إنترنت', r.failed ? 'err' : 'ok');
          } catch {
            toast('تعذّر التنزيل — تأكّد من الاتصال', 'err');
          }
          btn.disabled = false;
          rerender();
        },
      }, '⬇ نزّل المنطقة الحالية'),
      h('button.btn.ghost.block', {
        style: { marginTop: '8px' },
        onclick: async () => {
          if (!await confirmSheet('مسح البلاطات', 'ستُحذف صور الخريطة المخزّنة. الأماكن لن تتأثر.')) return;
          await clearTiles();
          toast('مُسحت البلاطات', 'ok');
          rerender();
        },
      }, '🗑 امسح البلاطات المخزّنة'),
    ]),

    h('h2.sec', 'إحصاء'),
    h('div.grid2', [
      statCard('أماكن محفوظة', String(state.places.items.length)),
      statCard('لم تزرها بعد', String(state.places.items.filter((p) => !p.visited).length)),
    ]),
  ]);
}

function statCard(label, value) {
  return h('div.card.tight.center', [
    h('div', { style: { fontSize: '21px', fontWeight: '700' } }, value),
    h('div.muted', label),
  ]);
}

function mapBoundsAround(lat, lng, span) {
  return {
    minLat: lat - span, maxLat: lat + span,
    minLng: lng - span, maxLng: lng + span,
  };
}
