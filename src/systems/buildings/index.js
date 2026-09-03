/**
 * وحدة المباني: مكتبة نماذج إجرائية + نسخ مُجمَّع (InstancedMesh) لكل نموذج/مادة،
 * إضاءة نوافذ ليلية فريدة لكل مبنى عبر إزاحة UV لكل نسخة.
 */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZONE } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';
import { buildPrototype, KIND_BY_ZONE } from './prototypes.js';

// ألوان واجهات هادئة ومتنوّعة (طوب، جص، حجر، خرسانة) — لا ألوان مسطّحة
const FACADE_TINTS = [
  [0.55, 0.49, 0.42],  // جص رملي
  [0.42, 0.26, 0.21],  // طوب أحمر داكن
  [0.44, 0.41, 0.39],  // خرسانة رمادية
  [0.58, 0.47, 0.36],  // جص دافئ
  [0.34, 0.31, 0.30],  // حجر داكن
  [0.49, 0.46, 0.47],  // خرسانة باردة
  [0.51, 0.33, 0.26],  // طوب فاتح
  [0.36, 0.39, 0.41],  // إسمنت مزرق
  [0.63, 0.59, 0.50],  // حجر جيري
  [0.40, 0.44, 0.40],  // جص مخضرّ
  [0.47, 0.42, 0.33],  // طيني
  [0.30, 0.33, 0.36],  // رمادي داكن
];
const TOWER_TINTS = [
  [0.26, 0.30, 0.34],  // زجاج أزرق رمادي
  [0.30, 0.28, 0.24],  // زجاج برونزي
  [0.36, 0.38, 0.38],  // زجاج فضّي فاتح
  [0.20, 0.25, 0.30],  // أزرق داكن
  [0.32, 0.33, 0.28],  // زيتوني/ذهبي خافت
  [0.40, 0.41, 0.42],  // فاتح جدًا
];

export default {
  name: 'buildings',
  deps: ['terrain', 'roads', 'zoning'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x3011);
    this.group = new THREE.Group(); this.group.name = 'buildings';
    ctx.scene.add(this.group);
    this.meshes = [];
    this.protos = [];

    this._makeMaterials();
    this._makePrototypes();

    this.api = {
      buildAll: () => this.buildAll(),
      clear: () => this.clear(),
      count: () => this.ctx.world.buildings.length,
      prototypes: () => this.protos.map((p) => ({ kind: p.kind, w: p.w, d: p.d, h: p.h, floors: p.floors })),
      heightAt: (x, z) => this._heightAt(x, z),
    };

    ctx.bus.on('time:changed:done', ({ night }) => this._setNight(night));
  },

  _makeMaterials() {
    const ctx = this.ctx, T = ctx.textures;
    const winLights = [0, 1, 2].map((i) => T.windowLight(161 + i * 7, { cols: 8, rows: 8, lit: 0.40 + i * 0.13, style: 'punched' }));
    const winLightsC = [0, 1, 2].map((i) => T.windowLight(191 + i * 7, { cols: 8, rows: 8, lit: 0.46 + i * 0.12, style: 'curtain' }));
    winLightsC.forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
    this.winLightsC = winLightsC;
    winLights.forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
    this.winLights = winLights;

    const patchWinOffset = (mat) => {
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>\n attribute vec2 aWinOff;\n varying vec2 vWinOff;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n vWinOff = aWinOff;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\n varying vec2 vWinOff;`)
          .replace('#include <emissivemap_fragment>', `
            #ifdef USE_EMISSIVEMAP
              vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv + vWinOff );
              totalEmissiveRadiance *= emissiveColor.rgb;
            #endif`);
      };
      mat.customProgramCacheKey = () => 'winoff-' + mat.uuid;
      return mat;
    };

    // واجهات سكنية/تجارية
    this.facadeMats = FACADE_TINTS.map((tint, i) => {
      const set = T.facadeWindows(151 + i * 3, { cols: 8, rows: 8, tint, glass: [0.085, 0.105, 0.135], style: 'punched' });
      const m = ctx.materials.fromSet('fac' + i, set, {
        roughness: 1, metalness: 0.05, envMapIntensity: 0.9,
        emissiveMap: winLights[i % 3], emissive: 0xffffff, emissiveIntensity: 0,
      });
      m.emissiveMap = winLights[i % 3];
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0;
      return patchWinOffset(m);
    });

    // واجهات زجاجية للأبراج
    this.glassMats = TOWER_TINTS.map((tint, i) => {
      const set = T.facadeWindows(171 + i * 5, { cols: 8, rows: 8, tint, glass: [0.040, 0.062, 0.098], style: 'curtain' });
      const m = ctx.materials.fromSet('glassfac' + i, set, {
        roughness: 0.30, metalness: 0.42, envMapIntensity: 1.0,
        emissiveMap: winLightsC[i % 3], emissive: 0xffffff, emissiveIntensity: 0,
      });
      m.emissiveMap = winLightsC[i % 3];
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0;
      m.roughness = 0.24; m.metalness = 0.5;
      return patchWinOffset(m);
    });

    this.trimMats = [
      ctx.materials.concrete([0.6, 0.6], 0xa8a49c),
      ctx.materials.concrete([0.6, 0.6], 0x8e8a82),
      ctx.materials.concrete([0.6, 0.6], 0xbdb6aa),
    ];
    this.roofMat = ctx.materials.roofGravel([1.5, 1.5]);
    this.tileRoofMat = ctx.materials.roofTile([0.42, 0.17, 0.12], [1, 1]);
    this.shopGlass = ctx.materials.glass(0x151c23, { rough: 0.26, metal: 0.18, opacity: 1 });
    this.shopGlass.emissive = new THREE.Color(0xffd9a0);
    this.shopGlass.emissiveIntensity = 0;
    this.metalMat = ctx.materials.metalPanel([0.55, 0.57, 0.60], [1.2, 1.2]);

    // أرضيات القطع (تمنع «المباني الطافية على العشب»)
    const padOpts = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
    this.padMats = {
      // حدائق منزلية: نسيج ترابي بصبغة خضراء باهتة ⇒ تُقرأ كأفنية لا كإسفلت
      [ZONE.RESIDENTIAL]: Object.assign(ctx.materials.dirt([0.30, 0.30]), padOpts, { color: new THREE.Color(0x5d6b3e) }),
      [ZONE.COMMERCIAL]:  Object.assign(ctx.materials.pavement([0.28, 0.28]), padOpts, { color: new THREE.Color(0x8b8a84) }),
      [ZONE.OFFICE]:      Object.assign(ctx.materials.concrete([0.25, 0.25], 0x8d8a82), padOpts),
      [ZONE.INDUSTRIAL]:  Object.assign(ctx.materials.asphalt([0.30, 0.30]), padOpts),
    };
    this.drivewayMat = Object.assign(ctx.materials.concrete([0.5, 0.5], 0x76736c), padOpts);
  },

  _matFor(slot, kind, variant) {
    if (slot === 'facade') {
      if (kind === 'ind') return this.metalMat;
      return this.facadeMats[variant % this.facadeMats.length];
    }
    if (slot === 'glass') {
      if (kind === 'off_mid' || kind === 'off_high') return this.glassMats[variant % this.glassMats.length];
      return this.shopGlass;
    }
    if (slot === 'roof') return kind === 'res_low' ? this.tileRoofMat : this.roofMat;
    return this.trimMats[variant % this.trimMats.length];
  },

  _makePrototypes() {
    const kinds = ['res_low', 'res_mid', 'res_high', 'com_low', 'com_mid', 'off_mid', 'off_high', 'ind'];
    const counts = { res_low: 7, res_mid: 6, res_high: 4, com_low: 5, com_mid: 5, off_mid: 4, off_high: 5, ind: 4 };
    let idx = 0;
    for (const kind of kinds) {
      for (let i = 0; i < counts[kind]; i++) {
        const rng = this.rng.fork(0x5000 + idx * 977);
        const p = buildPrototype(kind, rng, idx);
        if (!p) continue;
        p.variant = idx;
        p.materials = p.slots.map((s) => this._matFor(s, kind, idx + (s === 'facade' ? 0 : 3)));
        this.protos.push(p);
        idx++;
      }
    }
    this.ctx.log.info(`[buildings] ${this.protos.length} prototypes`);
  },

  _heightAt(x, z) {
    const t = this.ctx.module('terrain');
    return t?.api ? t.api.heightAt(x, z) : 0;
  },

  clear() {
    for (const m of this.meshes) { m.geometry?.dispose?.(); m.removeFromParent(); }
    this.meshes = [];
    this.ctx.world.buildings.length = 0;
  },

  /** يبني كل المباني من القطع المتاحة */
  buildAll() {
    const ctx = this.ctx, { world } = ctx;
    const t0 = performance.now();
    this.clear();
    const rng = this.rng.fork(0x77);
    const byProto = new Map();       // protoIndex -> [{lot, scale, tint}]

    for (const lot of world.lots) {
      if (lot.zone === ZONE.PARK || lot.zone === ZONE.NONE) continue;
      const kinds = KIND_BY_ZONE[lot.zone];
      if (!kinds) continue;
      // اختيار مستوى الارتفاع حسب قيمة الأرض والكثافة
      const dens = world.density[world.cellIndex(lot.cx, lot.cz)] / 255;
      const val = clamp(lot.value / 1.2, 0, 1);
      const score = clamp(dens * 0.55 + val * 0.65 + rng.gauss(0, 0.16), 0, 1);
      let tier = score > 0.74 ? 2 : score > 0.42 ? 1 : 0;
      if (lot.zone === ZONE.INDUSTRIAL) tier = 0;
      const kind = kinds[Math.min(tier, kinds.length - 1)];

      // مرشّحون يناسبون القطعة
      const cands = this.protos.filter((p) => p.kind === kind && p.w <= lot.w * 1.16 && p.d <= lot.d * 1.16);
      const pool = cands.length ? cands : this.protos.filter((p) => p.kind === kind);
      if (!pool.length) continue;
      const proto = pool[Math.floor(rng.next() * pool.length) % pool.length];
      const pi = this.protos.indexOf(proto);
      const s = clamp(Math.min(lot.w / proto.w, lot.d / proto.d), 0.86, 1.14);
      if (!byProto.has(pi)) byProto.set(pi, []);
      byProto.get(pi).push({ lot, scale: s, tint: 0.86 + rng.next() * 0.30, winOff: [rng.int(0, 7) / 8, rng.int(0, 7) / 8] });
      lot.buildingId = world.buildings.length;
      world.buildings.push({
        id: world.buildings.length, lotId: lot.id, kind, protoIndex: pi,
        x: lot.cx, z: lot.cz, rot: lot.rot, floors: proto.floors, height: proto.h * s, zone: lot.zone,
      });
    }

    // بناء InstancedMesh لكل نموذج
    const dummy = new THREE.Object3D();
    for (const [pi, list] of byProto) {
      const proto = this.protos[pi];
      const im = new THREE.InstancedMesh(proto.geometry, proto.materials.length === 1 ? proto.materials[0] : proto.materials, list.length);
      im.castShadow = true; im.receiveShadow = true;
      im.name = `bld_${proto.kind}_${pi}`;
      const winOff = new Float32Array(list.length * 2);
      const colors = new Float32Array(list.length * 3);
      list.forEach((it, i) => {
        const y = this._heightAt(it.lot.cx, it.lot.cz);
        dummy.position.set(it.lot.cx, y - 0.35, it.lot.cz);
        dummy.rotation.set(0, it.lot.rot, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        winOff[i * 2] = it.winOff[0]; winOff[i * 2 + 1] = it.winOff[1];
        const t = it.tint;
        colors[i * 3] = t; colors[i * 3 + 1] = t * (0.985 + (i % 3) * 0.008); colors[i * 3 + 2] = t * (0.97 + (i % 5) * 0.01);
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      im.instanceColor.needsUpdate = true;
      proto.geometry.setAttribute('aWinOff', new THREE.InstancedBufferAttribute(winOff, 2));
      im.computeBoundingSphere();
      this.group.add(im);
      this.meshes.push(im);
    }

    if (this.ctx.params?.get('nopads') !== '1') this._buildPads();

    this.buildMs = Math.round(performance.now() - t0);
    ctx.log.info(`[buildings] ${world.buildings.length} buildings / ${this.meshes.length} instanced meshes in ${this.buildMs}ms`);
    ctx.bus.emit('buildings:spawned', { count: world.buildings.length });
    this._setNight(ctx.module('environment')?.night || 0);
    return world.buildings.length;
  },

  /** أرضية لكل قطعة + ممر إلى الرصيف — واحدة من أقوى إشارات «المدينة المكتملة» */
  _buildPads() {
    const ctx = this.ctx, { world } = ctx;
    const terrain = ctx.module('terrain');
    if (!terrain?.api) return;
    const byMat = new Map();
    const drive = [];

    const quad = (cx, cz, w, d, rot, yOff, uvS, seg = 3) => {
      const g = new THREE.PlaneGeometry(w, d, seg, seg);
      g.rotateX(-Math.PI / 2);
      g.rotateY(rot);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        pos.setXYZ(i, x, terrain.api.heightAt(x, z) + yOff, z);
        uv.setXY(i, uv.getX(i) * w * uvS, uv.getY(i) * d * uvS);
      }
      pos.needsUpdate = true; uv.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    };

    for (const lot of world.lots) {
      const mat = this.padMats[lot.zone];
      if (!mat) continue;
      const shrink = lot.zone === ZONE.RESIDENTIAL ? 0.88 : 0.97;
      const pw = lot.w * shrink, pd = lot.d * shrink;
      // تخطَّ الأرضية إن كانت الأرض تحت القطعة شديدة التموّج (وإلا قطعت المضلّعات التضاريس)
      const hc = terrain.api.heightAt(lot.cx, lot.cz);
      let rough = 0;
      for (const [ox, oz] of [[-pw / 2, -pd / 2], [pw / 2, -pd / 2], [-pw / 2, pd / 2], [pw / 2, pd / 2]]) {
        const c = Math.cos(lot.rot), sn = Math.sin(lot.rot);
        const wx = lot.cx + ox * c - oz * sn, wz = lot.cz + ox * sn + oz * c;
        rough = Math.max(rough, Math.abs(terrain.api.heightAt(wx, wz) - hc));
      }
      if (rough > 1.6) continue;
      if (!byMat.has(lot.zone)) byMat.set(lot.zone, []);
      byMat.get(lot.zone).push(quad(lot.cx, lot.cz, pw, pd, lot.rot, 0.10, 0.14, 6));

      // ممر من واجهة القطعة نحو الرصيف
      const fx = Math.sin(lot.rot), fz = Math.cos(lot.rot);
      const dw = lot.zone === ZONE.INDUSTRIAL ? 7 : lot.zone === ZONE.RESIDENTIAL ? 3.2 : 5;
      const len = 4.5;
      if (false) drive.push(quad(lot.cx + fx * (pd / 2 + len / 2 - 0.4), lot.cz + fz * (pd / 2 + len / 2 - 0.4), dw, len, lot.rot, 0.12, 0.3, 3));   // معطّل مؤقتًا
    }

    const add = (list, mat, name) => {
      if (!list.length) return;
      const g = BGU.mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (!g) return;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true; m.castShadow = false;
      m.name = name;
      this.group.add(m); this.meshes.push(m);
    };
    for (const [zone, list] of byMat) add(list, this.padMats[zone], 'lotPad_' + zone);
    add(drive, this.drivewayMat, 'driveways');
  },

  _setNight(night) {
    const on = smoothstep(0.34, 0.78, night ?? 0);
    for (const m of this.facadeMats || []) m.emissiveIntensity = on * 1.15;
    for (const m of this.glassMats || []) m.emissiveIntensity = on * 1.15;
    if (this.shopGlass) this.shopGlass.emissiveIntensity = on * 0.30;
  },

  showcase(ctx) {
    const zoning = ctx.module('zoning');
    zoning.showcase(ctx);
    zoning.api.showOverlay(false);
    this.buildAll();
    ctx.cameraRig.setPreset('downtown');
  },

  stats() {
    return {
      buildings: this.ctx.world.buildings.length,
      meshes: this.meshes.length,
      prototypes: this.protos.length,
      buildMs: this.buildMs,
    };
  },

  dispose() {
    this.clear();
    this.protos.forEach((p) => p.geometry.dispose());
    this.winLights?.forEach((t) => t.dispose());
    this.winLightsC?.forEach((t) => t.dispose());
    this.group?.removeFromParent();
  },
};
