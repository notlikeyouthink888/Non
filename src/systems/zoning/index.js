/**
 * وحدة تقسيم المناطق: فرشاة المناطق على الشبكة، واشتقاق «القطع» (lots) من واجهات الطرق،
 * وحساب قيمة الأرض. تكتب: world.zones, world.lots, world.landValue, world.occupied.
 */
import * as THREE from 'three';
import { ZONE, ZONE_COLORS } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

const LOT_SPEC = {
  [ZONE.RESIDENTIAL]: { front: [11, 18], depth: [16, 23], setback: 1.8, maxSlope: 0.34 },
  [ZONE.COMMERCIAL]:  { front: [13, 22], depth: [19, 28], setback: 0.9, maxSlope: 0.30 },
  [ZONE.INDUSTRIAL]:  { front: [30, 50], depth: [34, 52], setback: 3.2, maxSlope: 0.22 },
  [ZONE.OFFICE]:      { front: [19, 33], depth: [23, 38], setback: 1.4, maxSlope: 0.28 },
  [ZONE.PARK]:        { front: [18, 34], depth: [20, 36], setback: 2.0, maxSlope: 0.42 },
};

export default {
  name: 'zoning',
  deps: ['terrain', 'roads'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x2101);
    const { world, scene } = ctx;
    this.overlay = null;
    this.overlayVisible = false;

    this.api = {
      paintRect: (x0, z0, x1, z1, zone) => this.paintRect(x0, z0, x1, z1, zone),
      paintCircle: (x, z, r, zone) => this.paintCircle(x, z, r, zone),
      zoneAt: (x, z) => world.zones[world.cellIndex(x, z)],
      generateLots: (opts) => this.generateLots(opts),
      lots: () => world.lots,
      landValue: (x, z) => world.landValue[world.cellIndex(x, z)],
      computeLandValue: () => this.computeLandValue(),
      showOverlay: (v) => this.showOverlay(v),
      clear: () => { world.zones.fill(0); world.lots.length = 0; world.occupied.fill(0); },
    };
  },

  /* ---------- الفرشاة ---------- */
  paintRect(x0, z0, x1, z1, zone) {
    const { world } = this.ctx;
    const a = world.cellCoord(Math.min(x0, x1), Math.min(z0, z1));
    const b = world.cellCoord(Math.max(x0, x1), Math.max(z0, z1));
    let n = 0;
    for (let cz = a.cz; cz <= b.cz; cz++) for (let cx = a.cx; cx <= b.cx; cx++) {
      const i = cz * world.dim + cx;
      if (world.occupied[i] & 1) continue;           // خلية طريق
      world.zones[i] = zone; n++;
    }
    this.ctx.bus.emit('zones:changed', { rect: [x0, z0, x1, z1], zone, cells: n });
    return n;
  },

  paintCircle(x, z, r, zone) {
    const { world } = this.ctx;
    const c = world.cellCoord(x, z);
    const cr = Math.ceil(r / world.cell);
    let n = 0;
    for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
      const cx = c.cx + dx, cz = c.cz + dz;
      if (cx < 0 || cz < 0 || cx >= world.dim || cz >= world.dim) continue;
      if (Math.hypot(dx, dz) * world.cell > r) continue;
      const i = cz * world.dim + cx;
      if (world.occupied[i] & 1) continue;
      world.zones[i] = zone; n++;
    }
    this.ctx.bus.emit('zones:changed', { circle: [x, z, r], zone, cells: n });
    return n;
  },

  /** يعلّم خلايا الطرق كمشغولة كي لا تُبنى فوقها */
  markRoadCells() {
    const { world } = this.ctx;
    const roads = this.ctx.module('roads');
    if (!roads?.api) return;
    for (const e of roads.api.edges()) {
      const halfW = e.width / 2 + e.sidewalk + 1.0;
      for (const p of e.path) {
        const cr = Math.ceil(halfW / world.cell);
        const c = world.cellCoord(p.x, p.z);
        for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
          const cx = c.cx + dx, cz = c.cz + dz;
          if (cx < 0 || cz < 0 || cx >= world.dim || cz >= world.dim) continue;
          const cc = world.cellCenter(cx, cz);
          if (Math.hypot(cc.x - p.x, cc.z - p.z) > halfW) continue;
          world.occupied[cz * world.dim + cx] |= 1;
        }
      }
    }
  },

  /* ---------- اشتقاق القطع ---------- */

  _cellsFree(cx0, cz0, cx1, cz1) {
    const { world } = this.ctx;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cz < 0 || cx >= world.dim || cz >= world.dim) return false;
      if (world.occupied[cz * world.dim + cx]) return false;
    }
    return true;
  },
  _markCells(cx0, cz0, cx1, cz1, flag = 2) {
    const { world } = this.ctx;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cz < 0 || cx >= world.dim || cz >= world.dim) continue;
      world.occupied[cz * world.dim + cx] |= flag;
    }
  },

  generateLots({ maxLots = 9000 } = {}) {
    const ctx = this.ctx, { world } = ctx;
    const roads = ctx.module('roads');
    const terrain = ctx.module('terrain');
    if (!roads?.api || !terrain?.api) return [];
    const t0 = performance.now();
    world.lots.length = 0;
    // امسح علامة المباني واحتفظ بعلامة الطرق
    for (let i = 0; i < world.occupied.length; i++) world.occupied[i] &= 1;
    this.markRoadCells();

    const rng = this.rng;
    const edges = roads.api.edges().sort((a, b) => b.length - a.length);
    let id = 1;

    for (const e of edges) {
      if (e.type === 3) continue;                 // لا مبانٍ على الطريق السريع
      // نسير على نقاط المسار مباشرة (أسرع بكثير من sampleEdge لكل خطوة)
      const path = e.path;
      for (const side of [1, -1]) {
        let acc = 0;
        let nextAt = 6;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const segLen = Math.hypot(b.x - a.x, b.z - a.z);
          acc += segLen;
          if (acc < nextAt || world.lots.length >= maxLots) continue;
          let dx = b.x - a.x, dz = b.z - a.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const nx = -dz * side, nz = dx * side;
          const px = b.x, pz = b.z;

          const probeX = px + nx * (e.width / 2 + e.sidewalk + 6);
          const probeZ = pz + nz * (e.width / 2 + e.sidewalk + 6);
          const zone = world.zones[world.cellIndex(probeX, probeZ)];
          if (!zone) { nextAt = acc + 8; continue; }

          const spec = LOT_SPEC[zone];
          const front = rng.range(spec.front[0], spec.front[1]);
          const depth = rng.range(spec.depth[0], spec.depth[1]);
          const off = e.width / 2 + e.sidewalk + spec.setback + depth / 2;
          const cx = px + nx * off, cz = pz + nz * off;

          const y = terrain.api.heightAt(cx, cz);
          const ok = world.inBounds(cx, cz) && y > world.waterLevel + 1.0
            && terrain.api.slopeAt(cx, cz, 6) < spec.maxSlope
            && world.zones[world.cellIndex(cx, cz)] === zone;

          if (ok) {
            // صندوق محيط للمستطيل المُدار (أدق بكثير من مربع بالبُعد الأكبر ⇒ كثافة أعلى)
            const ca = Math.abs(nz), sa = Math.abs(nx);
            const bw = (front * ca + depth * sa) / 2 - 1.2;
            const bd = (front * sa + depth * ca) / 2 - 1.2;
            const c0 = world.cellCoord(cx - bw, cz - bd);
            const c1 = world.cellCoord(cx + bw, cz + bd);
            if (this._cellsFree(c0.cx, c0.cz, c1.cx, c1.cz)) {
              world.lots.push({
                id: id++, cx, cz, y, w: front, d: depth, rot: Math.atan2(-nx, -nz), zone,
                edgeId: e.id, side, t: acc / Math.max(e.length, 1), level: 1, buildingId: null, value: 0,
              });
              this._markCells(c0.cx, c0.cz, c1.cx, c1.cz, 2);
              nextAt = acc + front + rng.range(0.4, 1.6);
              continue;
            }
          }
          nextAt = acc + Math.max(5, front * 0.4);
        }
      }
    }
    this.computeLandValue();
    for (const lot of world.lots) lot.value = world.landValue[world.cellIndex(lot.cx, lot.cz)];
    this.genMs = Math.round(performance.now() - t0);
    ctx.log.info(`[zoning] ${world.lots.length} lots in ${this.genMs}ms`);
    ctx.bus.emit('lots:created', { lots: world.lots });
    return world.lots;
  },

  /** قيمة الأرض: قرب الماء + قرب المركز + كثافة الطرق − الصناعة */
  computeLandValue() {
    const { world } = this.ctx;
    const terrain = this.ctx.module('terrain');
    const dim = world.dim;
    const lv = world.landValue;
    for (let cz = 0; cz < dim; cz++) for (let cx = 0; cx < dim; cx++) {
      const i = cz * dim + cx;
      const c = world.cellCenter(cx, cz);
      const distCenter = Math.hypot(c.x, c.z) / (world.size * 0.5);
      let v = lerp(1.0, 0.25, clamp(distCenter, 0, 1));
      const h = terrain?.api ? terrain.api.heightAt(c.x, c.z) : 0;
      // قرب الشاطئ (منسوب منخفض قرب الماء) يرفع القيمة
      v += smoothstep(24, 2, h) * 0.35;
      v += smoothstep(0.15, 0.02, terrain?.api ? terrain.api.slopeAt(c.x, c.z, 8) : 0) * 0.12;
      if (world.zones[i] === ZONE.INDUSTRIAL) v -= 0.25;
      if (world.zones[i] === ZONE.PARK) v += 0.18;
      lv[i] = clamp(v, 0.05, 1.6);
    }
    // تنعيم
    const tmp = new Float32Array(lv.length);
    for (let cz = 1; cz < dim - 1; cz++) for (let cx = 1; cx < dim - 1; cx++) {
      const i = cz * dim + cx;
      tmp[i] = (lv[i] * 4 + lv[i - 1] + lv[i + 1] + lv[i - dim] + lv[i + dim]) / 8;
    }
    lv.set(tmp);
  },

  /* ---------- طبقة عرض المناطق ---------- */
  showOverlay(v) {
    const ctx = this.ctx, { world, scene } = ctx;
    this.overlayVisible = v;
    if (!v) { if (this.overlay) this.overlay.visible = false; return; }
    if (!this.overlay) {
      const dim = world.dim;
      const data = new Uint8Array(dim * dim * 4);
      const tex = new THREE.DataTexture(data, dim, dim, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      this.overlayTex = tex;
      const geo = new THREE.PlaneGeometry(world.size, world.size, 64, 64);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const terrain = ctx.module('terrain');
      for (let i = 0; i < pos.count; i++) pos.setY(i, (terrain?.api.heightAt(pos.getX(i), pos.getZ(i)) || 0) + 0.5);
      pos.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.42, depthWrite: false });
      this.overlay = new THREE.Mesh(geo, mat);
      this.overlay.renderOrder = 8;
      scene.add(this.overlay);
    }
    const d = this.overlayTex.image.data;
    for (let cz = 0; cz < world.dim; cz++) for (let cx = 0; cx < world.dim; cx++) {
      const z = world.zones[cz * world.dim + cx];
      const col = ZONE_COLORS[z] || 0;
      const i = ((world.dim - 1 - cz) * world.dim + cx) * 4;
      d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255;
      d[i + 3] = z ? 220 : 0;
    }
    this.overlayTex.needsUpdate = true;
    this.overlay.visible = true;
  },

  showcase(ctx) {
    const roads = ctx.module('roads');
    roads.showcase(ctx);
    this.paintRect(-240, -240, 240, 240, ZONE.RESIDENTIAL);
    this.paintRect(-90, -90, 90, 90, ZONE.COMMERCIAL);
    this.paintRect(180, -240, 420, -40, ZONE.INDUSTRIAL);
    this.generateLots();
    this.showOverlay(true);
    ctx.cameraRig.setPreset('aerial');
    ctx.cameraRig.tDist = 620; ctx.cameraRig.apply(0, true);
  },

  stats() {
    const { world } = this.ctx;
    let zoned = 0;
    for (let i = 0; i < world.zones.length; i++) if (world.zones[i]) zoned++;
    return { lots: world.lots.length, zonedCells: zoned, genMs: this.genMs };
  },

  dispose() {
    this.overlay?.geometry.dispose(); this.overlay?.material.dispose(); this.overlayTex?.dispose();
    this.overlay?.removeFromParent();
  },
};
