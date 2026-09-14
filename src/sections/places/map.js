/**
 * خريطة تعمل دون إنترنت — لوحة رسم (canvas) تعرض:
 *  • بلاطات مخزّنة محليًا إن وُجدت،
 *  • وإلا شبكة إحداثيات ومقياس رسم دقيق تُبنى حسابيًا داخل الجهاز.
 * تدعم السحب والتكبير بالإصبعين، والعلامات، وموقعك الحالي.
 */

import { h } from '../../core/dom.js';
import {
  TILE, lngToX, latToY, xToLng, yToLat, metersPerPixel, distance,
} from './geo.js';
import { tileNow, ensureTile, isMissing } from './tiles.js';

export function createMap({ lat, lng, zoom = 13, onMove, onLongPress, onPickMarker } = {}) {
  const canvas = h('canvas.map-canvas');
  const ctx = canvas.getContext('2d');
  const view = { lat, lng, zoom };
  let markers = [];
  let me = null;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let raf = 0;

  /* ── القياس ── */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    draw();
  }

  const W = () => canvas.width / dpr;
  const H = () => canvas.height / dpr;

  /* ── تحويل الإحداثيات ── */
  function project(pLat, pLng) {
    const z = view.zoom;
    return {
      x: lngToX(pLng, z) - lngToX(view.lng, z) + W() / 2,
      y: latToY(pLat, z) - latToY(view.lat, z) + H() / 2,
    };
  }

  function unproject(px, py) {
    const z = view.zoom;
    return {
      lat: yToLat(latToY(view.lat, z) + py - H() / 2, z),
      lng: xToLng(lngToX(view.lng, z) + px - W() / 2, z),
    };
  }

  /* ── الرسم ── */
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  function draw() {
    const w = W(), hh = H();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // الصفحة RTL، لكن رسم اللوحة يجب أن يبقى من اليسار لليمين
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.clearRect(0, 0, w, hh);

    // خلفية
    ctx.fillStyle = '#0e131c';
    ctx.fillRect(0, 0, w, hh);

    drawTiles(w, hh);
    drawGraticule(w, hh);
    drawMarkers();
    drawMe();
    drawCrosshair(w, hh);
    drawScale(w, hh);
  }

  function drawTiles(w, hh) {
    const z = Math.max(0, Math.min(19, Math.round(view.zoom)));
    const scale = 2 ** (view.zoom - z);
    const size = TILE * scale;

    const centerX = lngToX(view.lng, z) * scale;
    const centerY = latToY(view.lat, z) * scale;
    const left = centerX - w / 2;
    const top = centerY - hh / 2;

    const x0 = Math.floor(left / size);
    const y0 = Math.floor(top / size);
    const x1 = Math.floor((left + w) / size);
    const y1 = Math.floor((top + hh) / size);
    const max = 2 ** z;

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= max) continue;
        const tx = ((x % max) + max) % max;
        const px = x * size - left;
        const py = y * size - top;
        const img = tileNow(z, tx, y);
        if (img) {
          ctx.drawImage(img, px, py, size + 1, size + 1);
        } else {
          if (!isMissing(z, tx, y)) ensureTile(z, tx, y, schedule);
          drawEmptyTile(px, py, size);
        }
      }
    }
  }

  /** بلاطة بديلة تُرسم داخل الجهاز حين لا توجد صورة مخزّنة. */
  function drawEmptyTile(px, py, size) {
    ctx.fillStyle = '#111722';
    ctx.fillRect(px, py, size, size);
    ctx.strokeStyle = 'rgba(124,92,255,.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + .5, py + .5, size, size);
  }

  /** شبكة خطوط الطول والعرض مع تسميات — مرجع بصري دقيق بلا إنترنت. */
  function drawGraticule(w, hh) {
    const mpp = metersPerPixel(view.lat, view.zoom);
    const targetPx = 90;
    const degStep = niceStep((mpp * targetPx) / 111320);

    const tl = unproject(0, 0);
    const br = unproject(w, hh);

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'top';

    ctx.strokeStyle = 'rgba(154,166,189,.14)';
    ctx.fillStyle = 'rgba(154,166,189,.55)';
    ctx.lineWidth = 1;

    for (let lngLine = Math.floor(tl.lng / degStep) * degStep; lngLine < br.lng; lngLine += degStep) {
      const p = project(view.lat, lngLine);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, hh);
      ctx.stroke();
      ctx.fillText(lngLine.toFixed(degStep < 0.01 ? 3 : 2), p.x + 3, 3);
    }

    for (let latLine = Math.floor(br.lat / degStep) * degStep; latLine < tl.lat; latLine += degStep) {
      const p = project(latLine, view.lng);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
      ctx.fillText(latLine.toFixed(degStep < 0.01 ? 3 : 2), 4, p.y + 3);
    }
  }

  function niceStep(v) {
    const pow = 10 ** Math.floor(Math.log10(v));
    const n = v / pow;
    const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
    return step * pow;
  }

  function drawMarkers() {
    markers.forEach((m) => {
      const p = project(m.lat, m.lng);
      if (p.x < -40 || p.y < -40 || p.x > W() + 40 || p.y > H() + 40) return;

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.bezierCurveTo(p.x - 11, p.y - 13, p.x - 9, p.y - 27, p.x, p.y - 27);
      ctx.bezierCurveTo(p.x + 9, p.y - 27, p.x + 11, p.y - 13, p.x, p.y);
      ctx.fillStyle = m.color || '#7c5cff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y - 19, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0e14';
      ctx.fill();

      if (m.label) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(233,237,245,.95)';
        const text = m.label.length > 18 ? `${m.label.slice(0, 17)}…` : m.label;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(11,14,20,.75)';
        ctx.fillRect(p.x - tw / 2 - 5, p.y + 3, tw + 10, 15);
        ctx.fillStyle = 'rgba(233,237,245,.95)';
        ctx.fillText(text, p.x, p.y + 6);
        ctx.textAlign = 'start';
      }
    });
  }

  function drawMe() {
    if (!me) return;
    const p = project(me.lat, me.lng);
    if (me.accuracy) {
      const r = me.accuracy / metersPerPixel(view.lat, view.zoom);
      if (r > 3 && r < 400) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34,211,238,.12)';
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0b0e14';
    ctx.stroke();
  }

  /** تقاطع خفيف في المنتصف — النقطة التي يضيف عندها زرّ «مكان هنا». */
  function drawCrosshair(w, hh) {
    const cx = w / 2, cy = hh / 2;
    ctx.strokeStyle = 'rgba(124,92,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 11, cy);
    ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 11);
    ctx.stroke();
  }

  function drawScale(w, hh) {
    const mpp = metersPerPixel(view.lat, view.zoom);
    let meters = niceStep(mpp * 90);
    let px = meters / mpp;
    if (px < 40) { meters *= 2; px = meters / mpp; }

    const x = 12, y = hh - 44;
    ctx.strokeStyle = 'rgba(233,237,245,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233,237,245,.85)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} كم` : `${Math.round(meters)} م`, x + 3, y - 3);
  }

  /* ── التفاعل ── */
  const pointers = new Map();
  let pinchStart = 0;
  let pinchZoom = 0;
  let longPressTimer = 0;
  let moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 1) {
      longPressTimer = setTimeout(() => {
        if (moved) return;
        const rect = canvas.getBoundingClientRect();
        const pt = unproject(e.clientX - rect.left, e.clientY - rect.top);
        onLongPress?.(pt);
      }, 550);
    }
    if (pointers.size === 2) {
      clearTimeout(longPressTimer);
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchZoom = view.zoom;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { moved = true; clearTimeout(longPressTimer); }

    if (pointers.size === 1) {
      panBy(-dx, -dy);
    } else if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinchZoom + Math.log2(d / pinchStart));
    }
  });

  const release = (e) => {
    clearTimeout(longPressTimer);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (!moved && e.type === 'pointerup') hitTest(e);
    onMove?.({ ...view });
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(view.zoom - Math.sign(e.deltaY) * 0.35);
    onMove?.({ ...view });
  }, { passive: false });

  function hitTest(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const m of markers) {
      const p = project(m.lat, m.lng);
      if (Math.hypot(p.x - px, p.y - (py + 14)) < 22) { onPickMarker?.(m); return; }
    }
  }

  function panBy(dx, dy) {
    const z = view.zoom;
    const x = lngToX(view.lng, z) + dx;
    const y = latToY(view.lat, z) + dy;
    view.lng = xToLng(x, z);
    view.lat = Math.max(-85, Math.min(85, yToLat(y, z)));
    schedule();
  }

  function setZoom(z) {
    view.zoom = Math.max(2, Math.min(19, z));
    schedule();
  }

  /* ── واجهة الاستخدام ── */
  const api = {
    el: canvas,
    view,
    resize,
    redraw: schedule,
    setMarkers(list) { markers = list || []; schedule(); },
    setMe(pos) { me = pos; schedule(); },
    setView(pLat, pLng, z) {
      view.lat = pLat; view.lng = pLng;
      if (z != null) view.zoom = Math.max(2, Math.min(19, z));
      schedule();
      onMove?.({ ...view });
    },
    zoomIn() { setZoom(view.zoom + 1); onMove?.({ ...view }); },
    zoomOut() { setZoom(view.zoom - 1); onMove?.({ ...view }); },
    bounds() {
      const tl = unproject(0, 0);
      const br = unproject(W(), H());
      return { minLat: br.lat, maxLat: tl.lat, minLng: tl.lng, maxLng: br.lng };
    },
    /** يضبط العرض ليشمل كل النقاط. */
    fit(points, padding = 60) {
      if (!points.length) return;
      const lats = points.map((p) => p.lat);
      const lngs = points.map((p) => p.lng);
      const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const span = Math.max(
        distance({ lat: Math.min(...lats), lng: cLng }, { lat: Math.max(...lats), lng: cLng }),
        distance({ lat: cLat, lng: Math.min(...lngs) }, { lat: cLat, lng: Math.max(...lngs) }),
      );
      const px = Math.max(80, Math.min(W(), H()) - padding);
      let z = 16;
      if (span > 1) z = Math.log2((156543.03392 * Math.cos((cLat * Math.PI) / 180) * px) / span);
      api.setView(cLat, cLng, Math.max(3, Math.min(18, z)));
    },
  };

  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(resize);
  });
  ro.observe(canvas);
  api.destroy = () => { ro.disconnect(); cancelAnimationFrame(raf); cancelAnimationFrame(resizeRaf); };

  setTimeout(resize, 0);
  return api;
}
