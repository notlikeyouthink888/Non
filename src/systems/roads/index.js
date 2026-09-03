/**
 * وحدة الطرق: رسم بياني للشبكة (عُقد + حواف)، بناء الهندسة (أسفلت، أرصفة، حواف، تقاطعات، معابر)،
 * أعمدة إنارة مع بِرَك ضوء ليلية، واجهة أخذ عيّنات المسارات لوحدة المرور.
 */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD, ROAD_BY_ID } from '../../core/config.js';
import { smoothPolyline, polylineLength, segIntersect, clamp, lerp, smoothstep } from '../../core/math.js';
import { roadSurfaceTexture, crosswalkTexture } from './roadTextures.js';
import { ribbon, curbWall, disc, quadOriented } from './ribbon.js';

const SAMPLE = 5;          // متر بين عيّنات المسار
const SNAP = 7;            // متر: التحام العُقد المتقاربة

export default {
  name: 'roads',
  deps: ['terrain'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    const { scene, world } = ctx;
    this.group = new THREE.Group(); this.group.name = 'roads';
    this.lampGroup = new THREE.Group(); this.lampGroup.name = 'roadLamps';
    scene.add(this.group, this.lampGroup);

    this.nodes = new Map();      // id -> {id,x,z,y,edges:Set}
    this.edges = new Map();      // id -> edge
    this.nextNode = 1; this.nextEdge = 1;
    this.hash = new Map();       // شبكة تجزئة مكانية للحواف
    this.nodeHash = new Map();   // شبكة تجزئة مكانية للعُقد
    this.cellSize = 48;
    world.roads.nodes = this.nodes;
    world.roads.edges = this.edges;

    // --- المواد ---
    this.surfaces = {};
    for (const t of ROAD_BY_ID) {
      const set = roadSurfaceTexture(t.id, t.width, world.seed + t.id, ctx.quality.name === 'low' ? 256 : 512);
      set.ormMap.channel = 0;
      const m = new THREE.MeshStandardMaterial({
        map: set.map, normalMap: set.normalMap, roughnessMap: set.ormMap, aoMap: set.ormMap,
        roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.75, 0.75),
        envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this.surfaces[t.id] = { set, material: m };
    }
    this.plainAsphalt = ctx.materials.asphalt([0.9, 0.9]);
    this.plainAsphalt.polygonOffset = true; this.plainAsphalt.polygonOffsetFactor = -3; this.plainAsphalt.polygonOffsetUnits = -3;
    this.pavementMat = ctx.materials.pavement([0.30, 0.30]);
    this.pavementMat.color.setHex(0x9aa0a4);
    this.curbMat = ctx.materials.concrete([1.2, 1.2], 0xb3b0aa);
    this.crossTex = crosswalkTexture(world.seed);
    this.crossMat = new THREE.MeshStandardMaterial({
      map: this.crossTex, transparent: true, roughness: 0.75, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, depthWrite: false,
    });

    this._buildLampAssets();
    this.meshes = [];

    this.api = {
      addRoad: (pts, typeId, opts) => this.addRoad(pts, typeId, opts),
      removeEdge: (id) => this.removeEdge(id),
      rebuild: () => this.rebuild(),
      edges: () => [...this.edges.values()],
      nodes: () => [...this.nodes.values()],
      nearestEdge: (x, z, maxD) => this.nearestEdge(x, z, maxD),
      sampleEdge: (edge, t) => this.sampleEdge(edge, t),
      lanePoint: (edge, lane, t) => this.lanePoint(edge, lane, t),
      laneCount: (edge) => edge.lanes,
      graph: () => ({ nodes: this.nodes, edges: this.edges }),
      clear: () => this.clear(),
      totalLength: () => [...this.edges.values()].reduce((s, e) => s + e.length, 0),
    };

    ctx.bus.on('time:changed:done', ({ night }) => this._setNight(night));
  },

  /* ================= الرسم البياني ================= */

  _hashKey(x, z) { return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`; },

  _indexEdge(e) {
    const keys = new Set();
    for (const p of e.path) keys.add(this._hashKey(p.x, p.z));
    for (const k of keys) {
      if (!this.hash.has(k)) this.hash.set(k, new Set());
      this.hash.get(k).add(e.id);
    }
    e._keys = keys;
  },
  _unindexEdge(e) {
    for (const k of (e._keys || [])) this.hash.get(k)?.delete(e.id);
  },
  _edgesNear(x, z, r = 1) {
    const out = new Set();
    const cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const s = this.hash.get(`${cx + dx},${cz + dz}`);
      if (s) for (const id of s) out.add(id);
    }
    return [...out].map((id) => this.edges.get(id)).filter(Boolean);
  },

  _terrainY(x, z) {
    const w = this.ctx.world;
    return Math.max(w.terrain.sampleHeight(x, z), w.waterLevel + 0.6);
  },

  _nodeKey(x, z) { return `${Math.floor(x / SNAP)},${Math.floor(z / SNAP)}`; },
  _registerNode(n) {
    const k = this._nodeKey(n.x, n.z);
    if (!this.nodeHash.has(k)) this.nodeHash.set(k, []);
    this.nodeHash.get(k).push(n);
  },
  _nodeNear(x, z) {
    const cx = Math.floor(x / SNAP), cz = Math.floor(z / SNAP);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const arr = this.nodeHash.get(`${cx + dx},${cz + dz}`);
      if (!arr) continue;
      for (const n of arr) if (this.nodes.has(n.id) && Math.hypot(n.x - x, n.z - z) < SNAP) return n;
    }
    return null;
  },

  addNode(x, z) {
    const hit = this._nodeNear(x, z);
    if (hit) return hit;
    const n = { id: this.nextNode++, x, z, y: this._terrainY(x, z), edges: new Set() };
    this.nodes.set(n.id, n);
    this._registerNode(n);
    return n;
  },

  _makeEdge(a, b, path, typeId) {
    const t = ROAD_BY_ID[typeId] || ROAD.STREET;
    const e = {
      id: this.nextEdge++, a: a.id, b: b.id, type: typeId,
      width: t.width, lanes: t.lanes, speed: t.speed, sidewalk: t.sidewalk, lampSpacing: t.lamps,
      path, length: polylineLength(path), cum: null,
    };
    e.cum = cumulative(path);
    this.edges.set(e.id, e);
    a.edges.add(e.id); b.edges.add(e.id);
    this._indexEdge(e);
    return e;
  },

  removeEdge(id) {
    const e = this.edges.get(id);
    if (!e) return false;
    this._unindexEdge(e);
    this.nodes.get(e.a)?.edges.delete(id);
    this.nodes.get(e.b)?.edges.delete(id);
    this.edges.delete(id);
    for (const nid of [e.a, e.b]) {
      const n = this.nodes.get(nid);
      if (n && n.edges.size === 0) this.nodes.delete(nid);
    }
    return true;
  },

  /** يقسم حافة عند نقطة على مسارها ⇒ يعيد العقدة الجديدة */
  splitEdge(e, px, pz) {
    // أقرب فهرس على المسار
    let bi = 0, bd = Infinity;
    for (let i = 0; i < e.path.length; i++) {
      const d = Math.hypot(e.path[i].x - px, e.path[i].z - pz);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi <= 1 || bi >= e.path.length - 2) {
      // قريبة من طرف: استعمل العقدة الموجودة
      return bi <= 1 ? this.nodes.get(e.a) : this.nodes.get(e.b);
    }
    const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
    if (!A || !B) return null;
    const mid = { x: e.path[bi].x, z: e.path[bi].z };
    const node = { id: this.nextNode++, x: mid.x, z: mid.z, y: e.path[bi].y, edges: new Set() };
    this.nodes.set(node.id, node);
    this._registerNode(node);
    const p1 = e.path.slice(0, bi + 1), p2 = e.path.slice(bi);
    this.removeEdge(e.id);
    // removeEdge قد يحذف عقدتي الطرف إن لم يبق لهما حواف — نعيد تسجيلهما
    this.nodes.set(A.id, A); this.nodes.set(B.id, B);
    this._makeEdge(A, node, p1, e.type);
    this._makeEdge(node, B, p2, e.type);
    return node;
  },

  /**
   * إضافة طريق من نقاط. يقسم عند التقاطعات مع الطرق الموجودة.
   * @returns {Array} معرّفات الحواف الجديدة
   */
  addRoad(points, typeId = 1, { flattenTerrain = true } = {}) {
    if (!points || points.length < 2) return [];
    const dense = resample(smoothPolyline(points, 6), SAMPLE);
    for (const p of dense) p.y = this._terrainY(p.x, p.z);
    smoothHeights(dense, 3);
    limitGrade(dense, 0.11);

    // 1) اجمع التقاطعات مع الحواف الموجودة
    const hits = [];
    for (let i = 0; i < dense.length - 1; i++) {
      const a = dense[i], b = dense[i + 1];
      const near = this._edgesNear((a.x + b.x) / 2, (a.z + b.z) / 2, 1);
      for (const e of near) {
        for (let j = 0; j < e.path.length - 1; j++) {
          const hit = segIntersect(a, b, e.path[j], e.path[j + 1]);
          if (hit) hits.push({ i, x: hit.x, z: hit.z, edge: e });
        }
      }
    }
    hits.sort((p, q) => p.i - q.i);

    // 2) قسّم الحواف الموجودة وأنشئ عُقد التقاطع
    const cutIdx = [];
    const seen = new Set();
    for (const h of hits) {
      const key = `${Math.round(h.x / 4)},${Math.round(h.z / 4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = this.edges.get(h.edge.id) || h.edge;
      const node = this.edges.has(h.edge.id) ? this.splitEdge(h.edge, h.x, h.z) : this.addNode(h.x, h.z);
      if (node) cutIdx.push({ i: h.i, node });
    }

    // 3) أنشئ حواف الطريق الجديد بين العُقد المتتالية
    const created = [];
    const starts = [0, ...cutIdx.map((c) => c.i), dense.length - 1];
    let prevNode = this.addNode(dense[0].x, dense[0].z);
    for (let k = 0; k < cutIdx.length + 1; k++) {
      const i0 = starts[k], i1 = starts[k + 1];
      if (i1 - i0 < 2) continue;
      const sub = dense.slice(i0, i1 + 1).map((p) => ({ ...p }));
      const endNode = (k < cutIdx.length) ? cutIdx[k].node : this.addNode(dense[dense.length - 1].x, dense[dense.length - 1].z);
      if (!endNode || endNode === prevNode) continue;
      sub[0] = { x: prevNode.x, z: prevNode.z, y: prevNode.y };
      sub[sub.length - 1] = { x: endNode.x, z: endNode.z, y: endNode.y };
      const e = this._makeEdge(prevNode, endNode, sub, typeId);
      created.push(e.id);
      prevNode = endNode;
    }

    if (flattenTerrain) this._flattenUnder(created);
    this.ctx.bus.emit('roads:changed', { added: created });
    return created;
  },

  _flattenUnder(edgeIds) {
    const terrain = this.ctx.module('terrain');
    if (!terrain?.api?.flatten) return;
    for (const id of edgeIds) {
      const e = this.edges.get(id);
      if (!e) continue;
      const halfW = e.width / 2 + e.sidewalk + 1.2;
      for (let i = 0; i < e.path.length; i += 2) {
        const p = e.path[i];
        terrain.api.flatten(p.x, p.z, halfW, halfW, p.y, 9);
      }
      const last = e.path[e.path.length - 1];
      terrain.api.flatten(last.x, last.z, halfW, halfW, last.y, 9);
    }
  },

  clear() {
    this.edges.clear(); this.nodes.clear(); this.hash.clear(); this.nodeHash.clear();
    this.nextEdge = 1; this.nextNode = 1;
    this._disposeMeshes();
  },

  /* ================= أخذ العيّنات ================= */

  sampleEdge(e, t) {
    const L = e.length * clamp(t, 0, 1);
    const cum = e.cum;
    // بحث ثنائي: O(log n) بدل O(n) — حرِج لأن هذه الدالة تُستدعى ملايين المرات
    let lo = 1, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < L) lo = mid + 1; else hi = mid; }
    const i = lo;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = (L - cum[i - 1]) / seg;
    const a = e.path[i - 1], b = e.path[i];
    return {
      x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f),
      dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg,
    };
  },

  /** نقطة على مسار محدّد. lane: 0..lanes-1 (النصف الأول اتجاه a→b) */
  lanePoint(e, lane, t) {
    const half = e.lanes / 2;
    const forward = lane < half;
    const k = forward ? lane : lane - half;
    const laneW = (e.width - 1.0) / e.lanes;
    const off = (k + 0.5) * laneW;
    const s = this.sampleEdge(e, forward ? t : 1 - t);
    const dirX = forward ? s.dx : -s.dx, dirZ = forward ? s.dz : -s.dz;
    const nx = -dirZ, nz = dirX;   // يمين اتجاه السير
    return { x: s.x + nx * off, y: s.y, z: s.z + nz * off, dx: dirX, dz: dirZ };
  },

  nearestEdge(x, z, maxD = 60) {
    let best = null, bd = maxD;
    for (const e of this._edgesNear(x, z, Math.ceil(maxD / this.cellSize))) {
      for (let i = 0; i < e.path.length - 1; i++) {
        const a = e.path[i], b = e.path[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const l2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
        const px = a.x + t * dx, pz = a.z + t * dz;
        const d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; best = { edge: e, dist: d, x: px, z: pz, i, t }; }
      }
    }
    return best;
  },

  /* ================= الهندسة ================= */

  _disposeMeshes() {
    for (const m of this.meshes || []) { m.geometry.dispose(); m.removeFromParent(); }
    this.meshes = [];
    for (const m of this.lampGroup.children.slice()) { m.removeFromParent(); }
  },

  rebuild() {
    const t0 = performance.now();
    this._disposeMeshes();
    const byType = {}, plain = [], pave = [], curb = [], cross = [];
    const nodeRadius = new Map();

    for (const n of this.nodes.values()) {
      let r = 0;
      for (const eid of n.edges) r = Math.max(r, (this.edges.get(eid)?.width || 8) / 2);
      nodeRadius.set(n.id, n.edges.size >= 3 ? r * 1.28 : (n.edges.size === 2 ? r * 0.55 : 0));
      n.y = this._terrainY(n.x, n.z);
    }

    for (const e of this.edges.values()) {
      const rA = nodeRadius.get(e.a) || 0, rB = nodeRadius.get(e.b) || 0;
      const path = trimPath(e.path, rA, rB);
      if (path.length < 2) continue;
      for (const p of path) p.y = this._terrainY(p.x, p.z) + 0.06;

      const g = ribbon(path, -e.width / 2, e.width / 2, { vScale: this.surfaces[e.type].set.tileMeters, u0: 0, u1: 1 });
      if (g) (byType[e.type] ||= []).push(g);

      if (e.sidewalk > 0) {
        for (const side of [1, -1]) {
          const sw = ribbon(path, e.width / 2 * side, (e.width / 2 + e.sidewalk) * side, { yOff: 0.17, vScale: 6, u0: 0, u1: 1 });
          if (sw) pave.push(sw);
          const cw = curbWall(path, e.width / 2, 0.17, { side, vScale: 3 });
          if (cw) curb.push(cw);
        }
      }
    }

    // التقاطعات
    for (const n of this.nodes.values()) {
      const r = nodeRadius.get(n.id);
      if (!r || n.edges.size < 2) continue;
      const y = this._terrainY(n.x, n.z) + 0.055;
      plain.push(disc(n.x, y, n.z, r * 1.06, 18, 0.06));
      if (n.edges.size >= 3) {
        for (const eid of n.edges) {
          const e = this.edges.get(eid);
          if (!e || e.width < 10) continue;
          const atA = e.a === n.id;
          const p0 = atA ? e.path[0] : e.path[e.path.length - 1];
          const p1 = atA ? e.path[Math.min(3, e.path.length - 1)] : e.path[Math.max(0, e.path.length - 4)];
          let dx = p1.x - p0.x, dz = p1.z - p0.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const cx = n.x + dx * (r + 2.0), cz = n.z + dz * (r + 2.0);
          cross.push(quadOriented(cx, this._terrainY(cx, cz) + 0.085, cz, dx, dz, 3.2, e.width * 0.96));
        }
      }
    }

    const add = (list, mat, name, shadow = false) => {
      if (!list.length) return;
      const merged = BGU.mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) return;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.receiveShadow = true; m.castShadow = shadow;
      m.name = name;
      this.group.add(m); this.meshes.push(m);
    };

    for (const [tid, list] of Object.entries(byType)) add(list, this.surfaces[tid].material, `road_${tid}`);
    add(plain, this.plainAsphalt, 'intersections');
    add(pave, this.pavementMat, 'sidewalks');
    add(curb, this.curbMat, 'curbs', true);
    add(cross, this.crossMat, 'crosswalks');

    this._buildLamps();
    this.buildMs = Math.round(performance.now() - t0);
    this.ctx.log.info(`[roads] rebuild ${this.edges.size} edges, ${this.nodes.size} nodes in ${this.buildMs}ms, ${this.meshes.length} meshes`);
  },

  /* ================= أعمدة الإنارة ================= */

  _buildLampAssets() {
    const ctx = this.ctx;
    const pole = new THREE.CylinderGeometry(0.085, 0.13, 8.4, 7, 1, false);
    pole.translate(0, 4.2, 0);
    const arm = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 6);
    arm.rotateZ(Math.PI / 2.35); arm.translate(0.75, 8.25, 0);
    const base = new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8);
    base.translate(0, 0.25, 0);
    this.lampPoleGeo = BGU.mergeGeometries([pole, arm, base], false);
    pole.dispose(); arm.dispose(); base.dispose();
    this.lampPoleMat = ctx.materials.simple(0x3f4750, { roughness: 0.45, metalness: 0.85 });

    const head = new THREE.BoxGeometry(0.86, 0.2, 0.42);
    head.translate(1.42, 8.5, 0);
    this.lampHeadGeo = head;
    this.lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a28, emissive: 0xffcf94, emissiveIntensity: 0.0, roughness: 0.35, metalness: 0.5,
    });

    // بِركة ضوء أرضية
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(128, 128) : Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,206,140,0.95)');
    grad.addColorStop(0.35, 'rgba(255,190,120,0.42)');
    grad.addColorStop(1, 'rgba(255,180,110,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.poolTex = tex;
    this.poolMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      opacity: 0, toneMapped: false,
    });
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.poolGeo.rotateX(-Math.PI / 2);
  },

  _buildLamps() {
    const spots = [];
    for (const e of this.edges.values()) {
      if (e.length < 22) continue;
      const spacing = e.lampSpacing;
      const count = Math.max(1, Math.floor(e.length / spacing));
      for (let i = 0; i <= count; i++) {
        const t = count === 0 ? 0.5 : i / count;
        if (t < 0.06 || t > 0.94) continue;
        const s = this.sampleEdge(e, t);
        const side = (i % 2 === 0) ? 1 : -1;
        const nx = -s.dz * side, nz = s.dx * side;
        const off = e.width / 2 + Math.max(e.sidewalk * 0.6, 0.8);
        const x = s.x + nx * off, z = s.z + nz * off;
        const rot = Math.atan2(nx, nz) + (side > 0 ? Math.PI : 0);
        spots.push({ x, y: this._terrainY(x, z), z, rot: Math.atan2(-nx, -nz) });
      }
    }
    this.lampCount = spots.length;
    if (!spots.length) return;
    const mk = (geo, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = true;
      const d = new THREE.Object3D();
      spots.forEach((s, i) => {
        d.position.set(s.x, s.y, s.z); d.rotation.set(0, s.rot, 0); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      return im;
    };
    this.lampPoles = mk(this.lampPoleGeo, this.lampPoleMat);
    this.lampPoles.castShadow = true;
    this.lampHeads = mk(this.lampHeadGeo, this.lampHeadMat);
    this.lampGroup.add(this.lampPoles, this.lampHeads);

    const pools = new THREE.InstancedMesh(this.poolGeo, this.poolMat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach((s, i) => {
      const nx = Math.sin(s.rot) * 1.4, nz = Math.cos(s.rot) * 1.4;
      d.position.set(s.x + nx, s.y + 0.09, s.z + nz);
      d.rotation.set(0, 0, 0); d.scale.setScalar(19);
      d.updateMatrix(); pools.setMatrixAt(i, d.matrix);
    });
    pools.instanceMatrix.needsUpdate = true;
    pools.renderOrder = 4;
    pools.computeBoundingSphere();
    this.lampPools = pools;
    this.lampGroup.add(pools);
    this._setNight(this.ctx.module('environment')?.night || 0);
  },

  _setNight(night) {
    const on = smoothstep(0.28, 0.72, night ?? 0);
    if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = on * 7.5;
    if (this.poolMat) this.poolMat.opacity = on * 1.0;
  },

  update(dt, ctx) {},

  showcase(ctx) {
    // شبكة صغيرة من الطرق فوق التضاريس
    const T = ctx.module('terrain').api;
    const mk = (pts, t) => this.addRoad(pts, t);
    for (let i = -2; i <= 2; i++) {
      mk([{ x: i * 90, z: -260 }, { x: i * 90, z: 260 }], i === 0 ? 2 : 1);
      mk([{ x: -260, z: i * 90 }, { x: 260, z: i * 90 }], i === 0 ? 2 : 1);
    }
    mk([{ x: -420, z: -380 }, { x: -120, z: -300 }, { x: 120, z: -180 }, { x: 420, z: -60 }], 3);
    T.rebuild();
    this.rebuild();
    ctx.cameraRig.setPreset('downtown');
    ctx.cameraRig.tDist = 300; ctx.cameraRig.apply(0, true);
  },

  stats() { return { edges: this.edges.size, nodes: this.nodes.size, meshes: this.meshes?.length || 0, lamps: this.lampCount || 0, buildMs: this.buildMs }; },

  dispose() {
    this._disposeMeshes();
    for (const s of Object.values(this.surfaces || {})) { s.material.dispose(); Object.values(s.set).forEach((t) => t?.dispose?.()); }
    this.crossTex?.dispose(); this.crossMat?.dispose();
    this.lampPoleGeo?.dispose(); this.lampHeadGeo?.dispose(); this.poolGeo?.dispose(); this.poolTex?.dispose();
    this.group?.removeFromParent(); this.lampGroup?.removeFromParent();
  },
};

/* ================= أدوات مساعدة ================= */

function cumulative(path) {
  const c = [0];
  for (let i = 1; i < path.length; i++) c.push(c[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  return c;
}

function resample(path, step) {
  if (path.length < 2) return path;
  const out = [{ ...path[0] }];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    let d = Math.hypot(b.x - a.x, b.z - a.z);
    let t = 0;
    while (acc + d - t >= step) {
      const need = step - acc;
      t += need;
      out.push({ x: a.x + (b.x - a.x) * (t / d), z: a.z + (b.z - a.z) * (t / d) });
      acc = 0;
    }
    acc += d - t;
  }
  const last = path[path.length - 1];
  if (Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) > step * 0.35) out.push({ ...last });
  else { out[out.length - 1] = { ...last }; }
  return out;
}

function smoothHeights(path, passes = 2) {
  for (let p = 0; p < passes; p++) {
    const y = path.map((q) => q.y);
    for (let i = 1; i < path.length - 1; i++) path[i].y = (y[i - 1] + y[i] * 2 + y[i + 1]) / 4;
  }
}

function limitGrade(path, maxGrade) {
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < path.length; i++) {
      const d = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) || 1;
      const dy = path[i].y - path[i - 1].y;
      const m = maxGrade * d;
      if (Math.abs(dy) > m) path[i].y = path[i - 1].y + Math.sign(dy) * m;
    }
    for (let i = path.length - 2; i >= 0; i--) {
      const d = Math.hypot(path[i].x - path[i + 1].x, path[i].z - path[i + 1].z) || 1;
      const dy = path[i].y - path[i + 1].y;
      const m = maxGrade * d;
      if (Math.abs(dy) > m) path[i].y = path[i + 1].y + Math.sign(dy) * m;
    }
  }
}

function trimPath(path, rA, rB) {
  const cum = cumulative(path);
  const L = cum[cum.length - 1];
  if (rA + rB >= L * 0.9) return path.slice();
  const out = [];
  for (let i = 0; i < path.length; i++) {
    if (cum[i] < rA || cum[i] > L - rB) continue;
    out.push({ ...path[i] });
  }
  if (out.length < 2) return path.slice();
  // أضف نقطتي الطرف المقصوصتين بدقة
  const at = (target) => {
    let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
    const f = (target - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { x: lerp(path[i - 1].x, path[i].x, f), y: lerp(path[i - 1].y, path[i].y, f), z: lerp(path[i - 1].z, path[i].z, f) };
  };
  if (rA > 0) out.unshift(at(rA));
  if (rB > 0) out.push(at(L - rB));
  return out;
}
