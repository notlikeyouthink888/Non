/**
 * وحدة المباني: مكتبة نماذج إجرائية + نسخ مُجمَّع (InstancedMesh) لكل نموذج/مادة،
 * إضاءة نوافذ ليلية فريدة لكل مبنى عبر إزاحة UV لكل نسخة.
 */
import * as THREE from 'three';
import { ZONE } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';
import { buildPrototype, KIND_BY_ZONE } from './prototypes.js';

const FACADE_TINTS = [
  [0.66, 0.62, 0.56], [0.74, 0.70, 0.63], [0.58, 0.55, 0.52], [0.70, 0.64, 0.55],
  [0.52, 0.47, 0.44], [0.63, 0.58, 0.60], [0.68, 0.60, 0.50], [0.48, 0.50, 0.53],
];
const TOWER_TINTS = [
  [0.30, 0.34, 0.38], [0.22, 0.27, 0.33], [0.36, 0.38, 0.40], [0.26, 0.32, 0.36],
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
    const winLights = [0, 1, 2].map((i) => T.windowLight(161 + i * 7, { cols: 8, rows: 8, lit: 0.42 + i * 0.12 }));
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
      const set = T.facadeWindows(151 + i * 3, { cols: 8, rows: 8, tint, glass: [0.10, 0.13, 0.17] });
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
      const set = T.facadeWindows(171 + i * 5, { cols: 8, rows: 8, tint, glass: [0.045, 0.075, 0.115] });
      const m = ctx.materials.fromSet('glassfac' + i, set, {
        roughness: 0.28, metalness: 0.55, envMapIntensity: 1.5,
        emissiveMap: winLights[i % 3], emissive: 0xffffff, emissiveIntensity: 0,
      });
      m.emissiveMap = winLights[i % 3];
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0;
      m.roughness = 0.22; m.metalness = 0.6;
      return patchWinOffset(m);
    });

    this.trimMats = [
      ctx.materials.concrete([0.6, 0.6], 0xdcd8d0),
      ctx.materials.concrete([0.6, 0.6], 0xb9b4ab),
    ];
    this.roofMat = ctx.materials.roofGravel([1.5, 1.5]);
    this.tileRoofMat = ctx.materials.roofTile([0.42, 0.17, 0.12], [1, 1]);
    this.shopGlass = ctx.materials.glass(0x11181f, { rough: 0.10, metal: 0.35, opacity: 1 });
    this.shopGlass.emissive = new THREE.Color(0xffd9a0);
    this.shopGlass.emissiveIntensity = 0;
    this.metalMat = ctx.materials.metalPanel([0.55, 0.57, 0.60], [1.2, 1.2]);
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

    this.buildMs = Math.round(performance.now() - t0);
    ctx.log.info(`[buildings] ${world.buildings.length} buildings / ${this.meshes.length} instanced meshes in ${this.buildMs}ms`);
    ctx.bus.emit('buildings:spawned', { count: world.buildings.length });
    this._setNight(ctx.module('environment')?.night || 0);
    return world.buildings.length;
  },

  _setNight(night) {
    const on = smoothstep(0.20, 0.68, night ?? 0);
    for (const m of this.facadeMats || []) m.emissiveIntensity = on * 1.35;
    for (const m of this.glassMats || []) m.emissiveIntensity = on * 1.15;
    if (this.shopGlass) this.shopGlass.emissiveIntensity = on * 0.85;
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
    this.group?.removeFromParent();
  },
};
