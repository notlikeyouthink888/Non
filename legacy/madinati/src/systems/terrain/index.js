/**
 * وحدة التضاريس: حقل ارتفاعات، شبكة مقسّمة لقطاعات، خريطة كبرى فريدة + تفاصيل مبلّطة، ماء.
 * تكتب: world.terrain.*  — تقرأ منها كل الوحدات الأخرى.
 */
import * as THREE from 'three';
import { generateHeightfield, flattenRect } from './heightfield.js';
import { bakeMacro } from './macro.js';
import { createWater } from './water.js';
import { clamp } from '../../core/math.js';

const CHUNKS = 8;              // 8×8 قطاع

export default {
  name: 'terrain',
  deps: [],
  api: {},

  async init(ctx) {
    const { scene, world, quality, log } = ctx;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);

    const t0 = performance.now();
    generateHeightfield(world, world.seed);
    const tGen = performance.now() - t0;

    // --- المواد ---
    const macroSize = quality.name === 'low' ? 512 : quality.name === 'medium' ? 768 : 1024;
    const t1 = performance.now();
    this.macro = bakeMacro(world, world.seed, macroSize);
    const tBake = performance.now() - t1;

    const detail = ctx.textures.grass(41);
    const detailRock = ctx.textures.rock(61);
    this.detailTex = detail;

    const mat = new THREE.MeshStandardMaterial({
      map: this.macro.map,
      roughnessMap: this.macro.ormMap,
      aoMap: this.macro.ormMap,
      normalMap: detail.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 1, metalness: 0,
      envMapIntensity: 0.85,
      dithering: true,
    });
    this.macro.ormMap.channel = 0;
    // التفاصيل تُبلَّط بتردد عالٍ عبر مصفوفة UV الخاصة بخريطة النتوء
    const dn = detail.normalMap.clone();
    dn.wrapS = dn.wrapT = THREE.RepeatWrapping;
    dn.repeat.set(420, 420); dn.needsUpdate = true;
    mat.normalMap = dn;
    this._clonedTex = [dn];

    const detAlb = detail.map.clone();
    detAlb.wrapS = detAlb.wrapT = THREE.RepeatWrapping;
    detAlb.repeat.set(420, 420); detAlb.colorSpace = THREE.SRGBColorSpace; detAlb.needsUpdate = true;
    const detRock = detailRock.map.clone();
    detRock.wrapS = detRock.wrapT = THREE.RepeatWrapping;
    detRock.repeat.set(150, 150); detRock.colorSpace = THREE.SRGBColorSpace; detRock.needsUpdate = true;
    this._clonedTex.push(detAlb, detRock);

    const uni = {
      uDetail: { value: detAlb },
      uDetailRock: { value: detRock },
      uNear: { value: 160.0 },
      uFar: { value: 900.0 },
    };
    this.uniforms = uni;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n varying float vSlopeT; varying vec3 vWPosT;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vWPosT = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          vSlopeT = 1.0 - normalize( mat3( modelMatrix ) * objectNormal ).y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uDetail; uniform sampler2D uDetailRock; uniform float uNear; uniform float uFar;
          varying float vSlopeT; varying vec3 vWPosT;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float dCam = length( vViewPosition );
            float fade = 1.0 - smoothstep( uNear, uFar, dCam );
            vec2 duv = vWPosT.xz * 0.26;
            vec3 dG = texture2D( uDetail, duv ).rgb;
            vec3 dR = texture2D( uDetailRock, vWPosT.xz * 0.085 ).rgb;
            float rockW = smoothstep( 0.18, 0.46, vSlopeT );
            vec3 det = mix( dG, dR, rockW );
            float lum = dot( det, vec3( 0.3333 ) );
            // طبقة تفاصيل تُضاعف السطوع دون تغيير الصبغة الكبرى
            diffuseColor.rgb *= mix( 1.0, 0.48 + 1.20 * lum, fade );
            diffuseColor.rgb *= mix( vec3(1.0), det / max( lum, 0.001 ), fade * 0.45 );
          }`);
    };
    mat.customProgramCacheKey = () => 'terrain-v2';
    this.material = mat;

    // --- الهندسة المقسّمة ---
    const segs = quality.name === 'low' ? 24 : quality.name === 'medium' ? 36 : 44;
    const t2 = performance.now();
    this.chunks = [];
    const S = world.size, cs = S / CHUNKS;
    for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
      const geo = this._chunkGeometry(world, cx, cz, cs, segs);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.castShadow = false;   // التضاريس لا تُلقي ظلًا (توفير) — الجبال بعيدة
      m.name = `terrain_${cx}_${cz}`;
      m.userData.chunk = { cx, cz };
      this.group.add(m);
      this.chunks.push(m);
    }
    const tMesh = performance.now() - t2;

    // --- الماء ---
    this.water = createWater(world, { seed: world.seed, segments: quality.name === 'low' ? 96 : 170 });
    scene.add(this.water.mesh);

    world.terrain.ready = true;
    this.timings = { gen: Math.round(tGen), bake: Math.round(tBake), mesh: Math.round(tMesh) };
    log.info(`[terrain] gen=${this.timings.gen}ms bake=${this.timings.bake}ms mesh=${this.timings.mesh}ms chunks=${this.chunks.length} segs=${segs}`);

    this.api = {
      heightAt: (x, z) => world.terrain.sampleHeight(x, z),
      normalAt: (x, z) => world.terrain.normalAt(x, z),
      slopeAt: (x, z) => world.terrain.slopeAt(x, z),
      isWater: (x, z) => world.terrain.sampleHeight(x, z) < world.waterLevel,
      waterLevel: world.waterLevel,
      flatten: (cx, cz, hw, hd, y, feather) => { flattenRect(world, cx, cz, hw, hd, y, feather); this._dirty = true; },
      rebuild: () => this.rebuildAll(),
      raycast: (raycaster) => raycaster.intersectObjects(this.chunks, false)[0] || null,
      /** نقطة على الأرض تحت مؤشر الشاشة */
      pickGround: (raycaster) => {
        const hit = raycaster.intersectObjects(this.chunks, false)[0];
        return hit ? hit.point : null;
      },
      chunks: () => this.chunks,
    };
    ctx.bus.emit('terrain:ready', { size: world.size });
  },

  _chunkGeometry(world, cx, cz, cs, segs) {
    const geo = new THREE.PlaneGeometry(cs, cs, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const ox = -world.size / 2 + cs * (cx + 0.5);
    const oz = -world.size / 2 + cs * (cz + 0.5);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const T = world.terrain;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox, z = pos.getZ(i) + oz;
      pos.setX(i, x); pos.setZ(i, z);
      pos.setY(i, T.sampleHeight(x, z));
      // UV عالمية 0..1 لخريطة الأرض الكبرى
      uv.setXY(i, (x + world.size / 2) / world.size, 1 - (z + world.size / 2) / world.size);
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  },

  /** يعيد بناء ارتفاعات الشبكة بعد التسوية */
  rebuildAll() {
    const { world } = this.ctx;
    const T = world.terrain;
    for (const m of this.chunks) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, T.sampleHeight(pos.getX(i), pos.getZ(i)));
      pos.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.geometry.computeBoundingSphere();
    }
    this._dirty = false;
  },

  update(dt, ctx) {
    if (this.water) this.water.uniforms.uTime.value += dt;
    if (this._dirty) this.rebuildAll();
  },

  onQuality(level, ctx) {
    if (this.water) this.water.material.normalScale.setScalar(level === 'low' ? 0.6 : 1.0);
  },

  showcase(ctx) {
    // مشهد استعراضي: منظر ساحلي واسع
    ctx.cameraRig.setPreset('waterfront');
    ctx.time.setHour(9.5);
  },

  stats() {
    return { chunks: this.chunks?.length || 0, timings: this.timings };
  },

  dispose() {
    this.chunks?.forEach((m) => m.geometry.dispose());
    this.material?.dispose();
    this.macro?.map.dispose(); this.macro?.ormMap.dispose();
    this._clonedTex?.forEach((t) => t.dispose());
    this.water?.geometry.dispose(); this.water?.material.dispose(); this.water?.normalTex.dispose();
    this.group?.removeFromParent();
    this.water?.mesh.removeFromParent();
  },
};
