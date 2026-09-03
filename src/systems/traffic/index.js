/**
 * وحدة المرور: عملاء سيارات على مسارات الطرق + مشاة على الأرصفة.
 * نسخ مُجمَّع لكل طراز، مصابيح أمامية/خلفية ليلًا، تجنّب تصادم بسيط، توقّف عند التقاطعات.
 */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

// لوحة واقعية: غالبها رمادي/أبيض/أسود مع أقلية ملوّنة (كما في الشوارع الحقيقية)
const CAR_COLORS = [
  0xc9ccd0, 0xdfe1e3, 0x9a9ea3, 0x6d7176, 0x33373c, 0x1b1e22, 0xb3b7bb, 0x7e8489,
  0x2f4664, 0x5c2b2b, 0x2c463a, 0x8a7a52, 0x6a5a76, 0x8f5a2a,
];

function box(w, h, d, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; }
const M = (parts) => { const g = BGU.mergeGeometries(parts.filter(Boolean), false); parts.forEach((p) => p?.dispose()); return g; };

/** يبني طراز مركبة: {body, glass, lightsF, lightsB, wheels, len} */
function makeVehicle(kind, rng) {
  const P = { body: [], glass: [], lampF: [], lampB: [], wheel: [] };
  const wheel = (x, z, r = 0.34, w = 0.24) => {
    const g = new THREE.CylinderGeometry(r, r, w, 10);
    g.rotateZ(Math.PI / 2); g.translate(x, r, z); return g;
  };
  if (kind === 'sedan' || kind === 'hatch') {
    const L = kind === 'sedan' ? rng.range(4.3, 4.9) : rng.range(3.8, 4.2);
    const W = rng.range(1.72, 1.86);
    P.body.push(box(W, 0.52, L, 0, 0.34, 0));
    P.body.push(box(W * 0.97, 0.30, L * 0.62, 0, 0.86, -L * 0.03));
    P.glass.push(box(W * 0.90, 0.34, L * 0.50, 0, 0.86, -L * 0.02));
    P.body.push(box(W * 0.99, 0.14, L * 0.99, 0, 0.28, 0));
    P.lampF.push(box(W * 0.30, 0.13, 0.07, -W * 0.30, 0.50, L / 2), box(W * 0.30, 0.13, 0.07, W * 0.30, 0.50, L / 2));
    P.lampB.push(box(W * 0.28, 0.12, 0.06, -W * 0.31, 0.52, -L / 2), box(W * 0.28, 0.12, 0.06, W * 0.31, 0.52, -L / 2));
    P.wheel.push(wheel(-W / 2, L * 0.30), wheel(W / 2, L * 0.30), wheel(-W / 2, -L * 0.30), wheel(W / 2, -L * 0.30));
    return { ...P, len: L, w: W };
  }
  if (kind === 'suv' || kind === 'van') {
    const L = kind === 'suv' ? rng.range(4.6, 5.1) : rng.range(5.2, 5.8);
    const W = rng.range(1.86, 2.02);
    const H = kind === 'suv' ? 0.72 : 0.95;
    P.body.push(box(W, H, L, 0, 0.38, 0));
    P.body.push(box(W * 0.97, kind === 'suv' ? 0.42 : 0.55, L * (kind === 'suv' ? 0.60 : 0.72), 0, 0.38 + H, -L * 0.02));
    P.glass.push(box(W * 0.91, 0.40, L * (kind === 'suv' ? 0.48 : 0.62), 0, 0.42 + H, -L * 0.02));
    P.lampF.push(box(W * 0.28, 0.15, 0.07, -W * 0.31, 0.60, L / 2), box(W * 0.28, 0.15, 0.07, W * 0.31, 0.60, L / 2));
    P.lampB.push(box(W * 0.26, 0.16, 0.06, -W * 0.32, 0.62, -L / 2), box(W * 0.26, 0.16, 0.06, W * 0.32, 0.62, -L / 2));
    P.wheel.push(wheel(-W / 2, L * 0.31, 0.40), wheel(W / 2, L * 0.31, 0.40), wheel(-W / 2, -L * 0.31, 0.40), wheel(W / 2, -L * 0.31, 0.40));
    return { ...P, len: L, w: W };
  }
  if (kind === 'bus') {
    const L = rng.range(10.5, 12.0), W = 2.5;
    P.body.push(box(W, 2.5, L, 0, 0.55, 0));
    P.glass.push(box(W * 1.005, 1.0, L * 0.86, 0, 1.65, 0));
    P.glass.push(box(W * 0.9, 1.2, 0.08, 0, 1.5, L / 2));
    P.lampF.push(box(0.42, 0.18, 0.07, -W * 0.32, 0.72, L / 2), box(0.42, 0.18, 0.07, W * 0.32, 0.72, L / 2));
    P.lampB.push(box(0.36, 0.20, 0.06, -W * 0.32, 0.75, -L / 2), box(0.36, 0.20, 0.06, W * 0.32, 0.75, -L / 2));
    P.wheel.push(wheel(-W / 2, L * 0.34, 0.50, 0.3), wheel(W / 2, L * 0.34, 0.50, 0.3), wheel(-W / 2, -L * 0.30, 0.50, 0.3), wheel(W / 2, -L * 0.30, 0.50, 0.3));
    return { ...P, len: L, w: W };
  }
  // شاحنة
  const L = rng.range(8.5, 11.5), W = 2.45;
  P.body.push(box(W, 1.85, L * 0.62, 0, 1.05, -L * 0.16));
  P.body.push(box(W * 0.98, 1.35, L * 0.28, 0, 0.75, L * 0.34));
  P.glass.push(box(W * 0.90, 0.72, L * 0.20, 0, 1.42, L * 0.34));
  P.lampF.push(box(0.34, 0.16, 0.07, -W * 0.32, 0.80, L * 0.48), box(0.34, 0.16, 0.07, W * 0.32, 0.80, L * 0.48));
  P.lampB.push(box(0.30, 0.18, 0.06, -W * 0.32, 0.72, -L / 2), box(0.30, 0.18, 0.06, W * 0.32, 0.72, -L / 2));
  P.wheel.push(wheel(-W / 2, L * 0.30, 0.48, 0.3), wheel(W / 2, L * 0.30, 0.48, 0.3), wheel(-W / 2, -L * 0.26, 0.48, 0.3), wheel(W / 2, -L * 0.26, 0.48, 0.3));
  return { ...P, len: L, w: W };
}

function makePedestrian(rng) {
  const parts = [];
  const h = rng.range(1.62, 1.85);
  parts.push(box(0.34, h * 0.30, 0.20, 0, h * 0.45, 0));       // جذع
  parts.push(box(0.30, h * 0.26, 0.19, 0, h * 0.75 - 0.02, 0));
  parts.push(box(0.15, h * 0.16, 0.16, 0, h * 0.90, 0));       // رأس
  parts.push(box(0.11, h * 0.42, 0.12, -0.09, 0.02, 0), box(0.11, h * 0.42, 0.12, 0.09, 0.02, 0));
  return { geo: M(parts), h };
}

export default {
  name: 'traffic',
  deps: ['roads'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x5031);
    this.group = new THREE.Group(); this.group.name = 'traffic';
    ctx.scene.add(this.group);
    this.cars = []; this.peds = [];
    this.meshes = [];
    this.night = 0;

    const M2 = ctx.materials;
    this.bodyMats = CAR_COLORS.map((c) => M2.carPaint(c));
    this.glassMat = M2.glass(0x0d1418, { rough: 0.08, metal: 0.4, opacity: 0.9 });
    this.tireMat = M2.simple(0x15171a, { roughness: 0.9, metalness: 0.0 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x20242a, emissive: 0xfff0d0, emissiveIntensity: 0.15, roughness: 0.25 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x201014, emissive: 0xff2b12, emissiveIntensity: 0.35, roughness: 0.3 });
    this.pedMats = [0xd8d2c8, 0x35507a, 0x7a3535, 0x2f4034, 0x584a6e, 0x9a8460].map((c) => M2.simple(c, { roughness: 0.85 }));

    this._makeProtos();
    this._makeHeadlightGlow();

    this.api = {
      spawn: (n) => this.spawn(n),
      spawnPeds: (n) => this.spawnPeds(n),
      clear: () => this.clear(),
      setDensity: (v) => this.setDensity(v),
      carCount: () => this.cars.length,
    };
    ctx.bus.on('time:changed:done', ({ night }) => { this.night = night; this._setNight(night); });
  },

  /** هالة إضاءة أمامية مضافة (additive) تُرسم أمام كل مركبة ليلًا */
  _makeHeadlightGlow() {
    const size = 128;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size * 0.78, 2, size / 2, size * 0.5, size * 0.5);
    grad.addColorStop(0, 'rgba(255,238,205,0.95)');
    grad.addColorStop(0.35, 'rgba(255,228,180,0.32)');
    grad.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(size / 2, size); g.lineTo(size * 0.03, 0); g.lineTo(size * 0.97, 0); g.closePath(); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glowTex = tex;
    this.glowMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0, toneMapped: false, side: THREE.DoubleSide,
    });
    this.glowGeo = new THREE.PlaneGeometry(1, 1);
    this.glowGeo.rotateX(-Math.PI / 2);
    this.glowGeo.translate(0, 0, 0.5);
  },

  _makeProtos() {
    const rng = this.rng.fork(3);
    const kinds = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'van', 'bus', 'truck'];
    this.protos = kinds.map((k, i) => {
      const v = makeVehicle(k, rng.fork(100 + i * 17));
      const lists = [], mats = [];
      const push = (g, m) => { if (g) { lists.push(g); mats.push(m); } };
      push(M(v.body), null);              // ستُملأ لاحقًا بمادة اللون
      push(M(v.glass), this.glassMat);
      push(M(v.lampF), this.headMat);
      push(M(v.lampB), this.tailMat);
      push(M(v.wheel), this.tireMat);
      const geometry = BGU.mergeGeometries(lists, true);
      lists.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      return { kind: k, geometry, mats, len: v.len, w: v.w, speedK: k === 'bus' || k === 'truck' ? 0.82 : 1.0 };
    });
    const p = makePedestrian(rng);
    this.pedGeo = p.geo;
    this.pedH = p.h;
  },

  clear() {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes = []; this.cars = []; this.peds = [];
    this.ctx.world.agents.cars = this.cars;
    this.ctx.world.agents.peds = this.peds;
  },

  _edgeList() {
    const roads = this.ctx.module('roads');
    if (!roads?.api) return [];
    return roads.api.edges().filter((e) => e.length > 14);
  },

  spawn(n) {
    const ctx = this.ctx;
    const roads = ctx.module('roads');
    const edges = this._edgeList();
    if (!edges.length) return 0;
    const rng = this.rng.fork(0x88);
    this.clear();
    const perProto = this.protos.map(() => []);

    for (let i = 0; i < n; i++) {
      const e = edges[rng.int(0, edges.length - 1)];
      const lane = rng.int(0, e.lanes - 1);
      const kindRoll = rng.next();
      const pi = kindRoll < 0.06 ? 7 : kindRoll < 0.13 ? 8 : rng.int(0, 6);
      const proto = this.protos[pi];
      const car = {
        edge: e, lane, t: rng.next(), dir: 1,
        speed: e.speed * proto.speedK * rng.range(0.82, 1.05),
        v: 0, proto: pi, idx: perProto[pi].length,
        color: rng.int(0, CAR_COLORS.length - 1),
        x: 0, y: 0, z: 0, rot: 0,
      };
      perProto[pi].push(car);
      this.cars.push(car);
    }

    const dummy = new THREE.Object3D();
    this.carMeshes = [];
    perProto.forEach((list, pi) => {
      if (!list.length) return;
      const proto = this.protos[pi];
      const mats = proto.mats.map((m, gi) => m || this.bodyMats[0]);
      const im = new THREE.InstancedMesh(proto.geometry, mats, list.length);
      im.castShadow = true; im.receiveShadow = false;
      im.frustumCulled = false;
      im.name = 'cars_' + proto.kind;
      const colors = new Float32Array(list.length * 3);
      list.forEach((c, i) => {
        const col = new THREE.Color(CAR_COLORS[c.color]);
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
        c.mesh = im; c.idx = i;
      });
      im.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      im.instanceColor.needsUpdate = true;
      this.group.add(im); this.meshes.push(im); this.carMeshes.push(im);
    });
    // هالات المصابيح الأمامية (نسخة لكل مركبة)
    this.cars.forEach((c, i) => { c.gidx = i; });
    this.glowMesh = new THREE.InstancedMesh(this.glowGeo, this.glowMat, this.cars.length);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.renderOrder = 6;
    this.group.add(this.glowMesh);
    this.meshes.push(this.glowMesh);

    ctx.world.agents.cars = this.cars;
    ctx.log.info(`[traffic] ${this.cars.length} vehicles across ${this.carMeshes.length} batches`);
    this._setNight(this.night);
    return this.cars.length;
  },

  spawnPeds(n) {
    const ctx = this.ctx;
    const edges = this._edgeList().filter((e) => e.sidewalk > 0);
    if (!edges.length) return 0;
    const rng = this.rng.fork(0x99);
    const roads = ctx.module('roads');
    const lists = this.pedMats.map(() => []);
    this.peds = [];
    for (let i = 0; i < n; i++) {
      const e = edges[rng.int(0, edges.length - 1)];
      const mi = rng.int(0, this.pedMats.length - 1);
      const p = {
        edge: e, t: rng.next(), dir: rng.bool() ? 1 : -1, side: rng.bool() ? 1 : -1,
        speed: rng.range(1.1, 1.7), mat: mi, idx: lists[mi].length,
        phase: rng.range(0, 6.28),
      };
      lists[mi].push(p); this.peds.push(p);
    }
    this.pedMeshes = [];
    lists.forEach((list, mi) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(this.pedGeo, this.pedMats[mi], list.length);
      im.castShadow = true; im.frustumCulled = false;
      im.name = 'peds_' + mi;
      list.forEach((p, i) => { p.mesh = im; p.idx = i; });
      this.group.add(im); this.meshes.push(im); this.pedMeshes.push(im);
    });
    ctx.world.agents.peds = this.peds;
    return this.peds.length;
  },

  setDensity(v) {
    const q = this.ctx.app.quality;
    this.spawn(Math.round(q.carCount * v));
    this.spawnPeds(Math.round(q.pedCount * v));
  },

  _nextEdge(car, node) {
    const roads = this.ctx.module('roads');
    const world = this.ctx.world;
    const cands = [];
    for (const eid of node.edges) {
      const e = world.roads.edges.get(eid);
      if (!e || e.id === car.edge.id || e.length < 10) continue;
      cands.push(e);
    }
    if (!cands.length) return null;
    return cands[Math.floor(this.rng.next() * cands.length) % cands.length];
  },

  update(dt, ctx) {
    if (!this.cars.length && !this.peds.length) return;
    const roads = ctx.module('roads');
    if (!roads?.api) return;
    const world = ctx.world;
    const dummy = this._dummy || (this._dummy = new THREE.Object3D());
    const sim = clamp(ctx.time.simSpeed, 0, 4);
    const step = dt * sim;

    for (const c of this.cars) {
      const e = c.edge;
      c.v = lerp(c.v, c.speed, 1 - Math.pow(0.02, dt));
      c.t += (c.v * step) / Math.max(e.length, 1);
      if (c.t >= 1) {
        // انتقل عبر العقدة
        const half = e.lanes / 2;
        const forward = c.lane < half;
        const nodeId = forward ? e.b : e.a;
        const node = world.roads.nodes.get(nodeId);
        const ne = node ? this._nextEdge(c, node) : null;
        if (ne) {
          const fromA = ne.a === nodeId;
          const nHalf = ne.lanes / 2;
          c.lane = fromA ? Math.floor(this.rng.next() * nHalf) : nHalf + Math.floor(this.rng.next() * nHalf);
          c.edge = ne; c.t = 0.02;
          c.speed = ne.speed * this.protos[c.proto].speedK * (0.85 + this.rng.next() * 0.2);
          c.v *= 0.75;
        } else {
          // استدارة على نفس الحافة في الاتجاه المعاكس
          const half2 = e.lanes / 2;
          c.lane = c.lane < half2 ? half2 + (c.lane % half2) : c.lane % half2;
          c.t = 0.02;
        }
      }
      const p = roads.api.lanePoint(c.edge, c.lane, c.t);
      c.x = p.x; c.y = p.y; c.z = p.z; c.rot = Math.atan2(p.dx, p.dz);
      dummy.position.set(p.x, p.y + 0.06, p.z);
      dummy.rotation.set(0, c.rot, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      c.mesh?.setMatrixAt(c.idx, dummy.matrix);
      if (this.glowMesh && this.night > 0.2) {
        const L = this.protos[c.proto].len;
        dummy.position.set(p.x + p.dx * (L * 0.5 + 5.5), p.y + 0.14, p.z + p.dz * (L * 0.5 + 5.5));
        dummy.rotation.set(0, c.rot, 0);
        dummy.scale.set(4.5, 1, 12);
        dummy.updateMatrix();
        this.glowMesh.setMatrixAt(c.gidx, dummy.matrix);
      }
    }
    for (const m of this.carMeshes || []) m.instanceMatrix.needsUpdate = true;
    if (this.glowMesh && this.night > 0.2) this.glowMesh.instanceMatrix.needsUpdate = true;

    for (const p of this.peds) {
      const e = p.edge;
      p.t += (p.speed * step * p.dir) / Math.max(e.length, 1);
      if (p.t > 1 || p.t < 0) {
        const nodeId = p.t > 1 ? e.b : e.a;
        const node = world.roads.nodes.get(nodeId);
        const ne = node ? this._nextEdge({ edge: e }, node) : null;
        if (ne) { p.edge = ne; const fromA = ne.a === nodeId; p.dir = fromA ? 1 : -1; p.t = fromA ? 0.02 : 0.98; }
        else { p.dir *= -1; p.t = clamp(p.t, 0.02, 0.98); }
      }
      const s = roads.api.sampleEdge(p.edge, clamp(p.t, 0, 1));
      const nx = -s.dz * p.side, nz = s.dx * p.side;
      const off = p.edge.width / 2 + p.edge.sidewalk * 0.5;
      const bob = Math.sin(ctx.time.simTime * 7 + p.phase) * 0.035;
      dummy.position.set(s.x + nx * off, s.y + 0.19 + bob, s.z + nz * off);
      dummy.rotation.set(0, Math.atan2(s.dx * p.dir, s.dz * p.dir), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      p.mesh?.setMatrixAt(p.idx, dummy.matrix);
    }
    for (const m of this.pedMeshes || []) m.instanceMatrix.needsUpdate = true;
  },

  _setNight(night) {
    const on = smoothstep(0.25, 0.7, night ?? 0);
    this.headMat.emissiveIntensity = 0.12 + on * 5.5;
    this.tailMat.emissiveIntensity = 0.3 + on * 3.0;
    if (this.glowMat) this.glowMat.opacity = on * 0.55;
    if (this.glowMesh) this.glowMesh.visible = on > 0.02;
  },

  showcase(ctx) {
    const roads = ctx.module('roads');
    if (roads) roads.showcase(ctx);
    this.setDensity(1);
    ctx.cameraRig.setPreset('street');
  },

  stats() { return { cars: this.cars.length, peds: this.peds.length, batches: this.meshes.length }; },

  dispose() {
    this.clear();
    this.protos?.forEach((p) => p.geometry.dispose());
    this.pedGeo?.dispose();
    this.glowGeo?.dispose(); this.glowTex?.dispose(); this.glowMat?.dispose();
    this.group?.removeFromParent();
  },
};
