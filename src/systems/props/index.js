/**
 * وحدة الدعائم: أشجار وشجيرات (نسخ مُجمَّع)، أثاث شارع، إشارات مرور، مواقف حافلات،
 * سيارات واقفة، صخور، أسوار — كلها موزّعة حتميًا حسب المناطق والطرق.
 */
import * as THREE from 'three';
import { ZONE } from '../../core/config.js';
import { clamp, smoothstep } from '../../core/math.js';
import { makeTree } from './vegetation.js';
import * as F from './furniture.js';

export default {
  name: 'props',
  deps: ['terrain', 'roads'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x4021);
    this.group = new THREE.Group(); this.group.name = 'props';
    ctx.scene.add(this.group);
    this.meshes = [];

    const M = ctx.materials, T = ctx.textures;
    this.barkMat = M.bark([1, 2.5]);
    const leafTex = T.leafCard(141);
    this.leafMat = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
      roughness: 0.86, metalness: 0, color: 0xffffff, envMapIntensity: 0.8,
    });
    this.needleMat = M.simple(0x24401f, { roughness: 0.9, flat: true, side: THREE.DoubleSide });
    this.frondMat = new THREE.MeshStandardMaterial({
      map: T.leafCard(147), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: 0xa8c07a,
    });
    this.metalMat = M.simple(0x3c444c, { roughness: 0.5, metalness: 0.8 });
    this.woodMat = M.simple(0x6b4b2e, { roughness: 0.85, metalness: 0.02 });
    this.concreteMat = M.concrete([1.2, 1.2], 0xcfcac2);
    this.rockMat = M.rock([0.5, 0.5]);
    this.glassMat = M.glass(0x22303a, { rough: 0.12, metal: 0.2, opacity: 0.55 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: 0xff5533, emissiveIntensity: 0, roughness: 0.4 });
    this.signMat = M.simple(0xb8bcc0, { roughness: 0.55, metalness: 0.3 });

    this._makeTreePrototypes();
    this._makeFurniture();

    this.api = {
      scatterAll: (opts) => this.scatterAll(opts),
      clear: () => this.clear(),
      counts: () => this.counts,
    };
    ctx.bus.on('time:changed:done', ({ night }) => {
      const on = smoothstep(0.3, 0.7, night);
      this.lampMat.emissiveIntensity = on * 4.5;
    });
  },

  _makeTreePrototypes() {
    const rng = this.rng.fork(11);
    this.trees = [];
    const spec = [
      ['broadleaf', 5, this.leafMat], ['broadleaf', 4, this.leafMat],
      ['conifer', 3, this.needleMat], ['palm', 3, this.frondMat], ['bush', 3, this.leafMat],
    ];
    let i = 0;
    for (const [kind, count, leafMat] of spec) {
      for (let k = 0; k < count; k++) {
        const t = makeTree(kind, rng.fork(0x900 + i * 31));
        this.trees.push({ kind, trunkGeo: t.trunkGeo, leafGeo: t.leafGeo, leafMat, height: t.height });
        i++;
      }
    }
  },

  _makeFurniture() {
    const rng = this.rng.fork(22);
    this.furni = {
      bench: { geo: F.bench(), mat: this.woodMat },
      bin: { geo: F.bin(), mat: this.metalMat },
      hydrant: { geo: F.hydrant(), mat: this.signMat },
      busStop: { geo: F.busStop(), mat: this.metalMat },
      tlPole: { geo: F.trafficLight(), mat: this.metalMat },
      tlLamps: { geo: F.trafficLightLamps(), mat: this.lampMat },
      sign: { geo: F.signPost(), mat: this.signMat },
      fence: { geo: F.fenceSection(), mat: this.metalMat },
      rock: { geo: F.rock(rng), mat: this.rockMat },
      planter: { geo: F.planter(), mat: this.concreteMat },
      billboard: { geo: F.billboard(), mat: this.metalMat },
    };
  },

  clear() {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes = [];
  },

  _instance(geo, mat, list, { shadow = true, colorJitter = 0 } = {}) {
    if (!geo || !list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = shadow; im.receiveShadow = shadow;
    const d = new THREE.Object3D();
    const colors = colorJitter ? new Float32Array(list.length * 3) : null;
    list.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z);
      d.rotation.set(it.rx || 0, it.rot || 0, 0);
      d.scale.setScalar(it.s || 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      if (colors) {
        const k = 1 - colorJitter / 2 + (it.c ?? 0.5) * colorJitter;
        colors[i * 3] = k * (it.warm ?? 1); colors[i * 3 + 1] = k; colors[i * 3 + 2] = k * (it.cool ?? 1);
      }
    });
    im.instanceMatrix.needsUpdate = true;
    if (colors) { im.instanceColor = new THREE.InstancedBufferAttribute(colors, 3); im.instanceColor.needsUpdate = true; }
    im.computeBoundingSphere();
    this.group.add(im);
    this.meshes.push(im);
    return im;
  },

  /** توزيع كل الدعائم على المدينة */
  scatterAll({ treeDensity = 1 } = {}) {
    const ctx = this.ctx, { world } = ctx;
    const t0 = performance.now();
    this.clear();
    const rng = this.rng.fork(0x31);
    const terrain = ctx.module('terrain');
    const roads = ctx.module('roads');
    if (!terrain?.api) return;

    const treeLists = this.trees.map(() => []);
    const F2 = { bench: [], bin: [], hydrant: [], busStop: [], tlPole: [], tlLamps: [], sign: [], fence: [], rock: [], planter: [], billboard: [] };

    const H = (x, z) => terrain.api.heightAt(x, z);
    const free = (x, z) => {
      if (!world.inBounds(x, z)) return false;
      const i = world.cellIndex(x, z);
      return !(world.occupied[i] & 3);
    };

    // 1) غابات على المنحدرات والمناطق غير المزوّنة
    const S = world.size / 2;
    const gridStep = 13 / clamp(treeDensity, 0.2, 3);
    for (let z = -S + 20; z < S - 20; z += gridStep) {
      for (let x = -S + 20; x < S - 20; x += gridStep) {
        const jx = x + rng.range(-gridStep * 0.45, gridStep * 0.45);
        const jz = z + rng.range(-gridStep * 0.45, gridStep * 0.45);
        const h = H(jx, jz);
        if (h < world.waterLevel + 1.2 || h > 210) continue;
        const slope = terrain.api.slopeAt(jx, jz, 6);
        if (slope > 0.55) continue;
        const i = world.cellIndex(jx, jz);
        if (world.occupied[i]) continue;      // خلايا الطرق والمباني معلَّمة مسبقًا
        const zoned = world.zones[i];
        // كثافة: عالية في البرّية، منخفضة داخل المناطق المزوّنة
        let p = 0.55;
        if (zoned) p = 0.06;
        if (zoned === ZONE.PARK) p = 0.55;
        if (h > 130) p *= 0.5;
        if (slope > 0.35) p *= 0.6;
        if (rng.next() > p) continue;
        // اختيار النوع
        let ti;
        if (h < 3.2 && rng.bool(0.45)) ti = 11 + rng.int(0, 2);       // نخيل قرب الشاطئ
        else if (h > 95 || slope > 0.34) ti = 9 + rng.int(0, 2);      // صنوبر على المرتفعات
        else if (rng.bool(0.14)) ti = 14 + rng.int(0, 2);             // شجيرات
        else ti = rng.int(0, 8);
        ti = clamp(ti, 0, this.trees.length - 1);
        treeLists[ti].push({ x: jx, y: h - 0.15, z: jz, rot: rng.range(0, Math.PI * 2), s: rng.range(0.78, 1.28), c: rng.next() });
      }
    }

    // 2) أشجار وأثاث على طول الأرصفة
    if (roads?.api) {
      for (const e of roads.api.edges()) {
        if (e.type === 3 || e.sidewalk <= 0) continue;
        const step = 15;
        const n = Math.floor(e.length / step);
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const s = roads.api.sampleEdge(e, t);
          for (const side of [1, -1]) {
            const nx = -s.dz * side, nz = s.dx * side;
            const off = e.width / 2 + e.sidewalk * 0.55;
            const x = s.x + nx * off, z = s.z + nz * off;
            if (!world.inBounds(x, z)) continue;
            const y = H(x, z);
            if (y < world.waterLevel + 0.5) continue;
            const r = rng.next();
            if (r < 0.52) {
              const ti = rng.int(0, 5);
              treeLists[ti].push({ x, y: y - 0.1, z, rot: rng.range(0, 6.28), s: rng.range(0.72, 1.0), c: rng.next() });
            } else if (r < 0.62) {
              F2.bench.push({ x, y, z, rot: Math.atan2(-nx, -nz) });
            } else if (r < 0.70) {
              F2.bin.push({ x, y, z, rot: rng.range(0, 6.28) });
            } else if (r < 0.745) {
              F2.hydrant.push({ x, y, z, rot: rng.range(0, 6.28) });
            } else if (r < 0.775) {
              F2.planter.push({ x, y, z, rot: rng.range(0, 6.28) });
            } else if (r < 0.795 && e.width >= 12) {
              F2.busStop.push({ x, y, z, rot: Math.atan2(nx, nz) });
            } else if (r < 0.815) {
              F2.sign.push({ x, y, z, rot: Math.atan2(-nx, -nz) });
            }
          }
        }
      }

      // 3) إشارات مرور عند التقاطعات الكبيرة
      for (const n of roads.api.nodes()) {
        if (n.edges.size < 3) continue;
        let maxW = 0;
        for (const eid of n.edges) maxW = Math.max(maxW, world.roads.edges.get(eid)?.width || 0);
        if (maxW < 12) continue;
        for (const eid of n.edges) {
          const e = world.roads.edges.get(eid);
          if (!e) continue;
          const atA = e.a === n.id;
          const p0 = atA ? e.path[0] : e.path[e.path.length - 1];
          const p1 = atA ? e.path[Math.min(2, e.path.length - 1)] : e.path[Math.max(0, e.path.length - 3)];
          let dx = p1.x - p0.x, dz = p1.z - p0.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const nx = -dz, nz = dx;
          const r = maxW / 2 + 3.5;
          const x = n.x + dx * r + nx * (e.width / 2 + 1.2);
          const z = n.z + dz * r + nz * (e.width / 2 + 1.2);
          const rot = Math.atan2(-nx, -nz);
          const y = H(x, z);
          F2.tlPole.push({ x, y, z, rot });
          F2.tlLamps.push({ x, y, z, rot });
        }
      }
    }

    // 4) صخور ولوحات إعلانية متفرقة
    for (let i = 0; i < 260; i++) {
      const x = rng.range(-S + 30, S - 30), z = rng.range(-S + 30, S - 30);
      const h = H(x, z);
      if (h < world.waterLevel + 0.8 || !free(x, z)) continue;
      F2.rock.push({ x, y: h - 0.1, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 2.1) });
    }

    // إنشاء الشبكات
    let count = 0;
    this.trees.forEach((t, i) => {
      const list = treeLists[i];
      if (!list.length) return;
      count += list.length;
      if (t.trunkGeo) this._instance(t.trunkGeo, this.barkMat, list, { shadow: true });
      this._instance(t.leafGeo, t.leafMat, list, { shadow: true, colorJitter: 0.42 });
    });
    for (const [k, list] of Object.entries(F2)) {
      const f = this.furni[k];
      if (!f || !list.length) continue;
      this._instance(f.geo, f.mat, list, { shadow: k !== 'tlLamps' });
    }

    this.counts = { trees: count, ...Object.fromEntries(Object.entries(F2).map(([k, v]) => [k, v.length])) };
    this.scatterMs = Math.round(performance.now() - t0);
    ctx.log.info(`[props] ${count} trees + furniture in ${this.scatterMs}ms (${this.meshes.length} meshes)`);
  },

  onQuality(level, ctx) {
    const q = ctx.app.quality;
    for (const m of this.meshes) m.castShadow = q.name !== 'low';
  },

  showcase(ctx) {
    const roads = ctx.module('roads');
    if (roads) roads.showcase(ctx);
    this.scatterAll({ treeDensity: 1.2 });
    ctx.cameraRig.setPreset('street');
    ctx.time.setHour(10);
  },

  stats() { return { meshes: this.meshes.length, ...(this.counts || {}), scatterMs: this.scatterMs }; },

  dispose() {
    this.clear();
    this.trees?.forEach((t) => { t.trunkGeo?.dispose(); t.leafGeo?.dispose(); });
    Object.values(this.furni || {}).forEach((f) => f.geo?.dispose());
    this.leafMat?.map?.dispose(); this.leafMat?.dispose(); this.frondMat?.dispose();
    this.group?.removeFromParent();
  },
};
