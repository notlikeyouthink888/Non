/** مكتبة المواد المشتركة — كلها PBR مبنية على أنسجة إجرائية. */
import * as THREE from 'three';

function cloneTex(t, repeat) {
  if (!t) return null;
  if (!repeat || (t.repeat.x === repeat[0] && t.repeat.y === repeat[1])) return t;
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(repeat[0], repeat[1]);
  c.colorSpace = t.colorSpace;
  c.anisotropy = t.anisotropy;
  c.needsUpdate = true;
  return c;
}

export class MaterialLibrary {
  /** @param {import('./textures.js').TextureFactory} tex */
  constructor(tex) { this.tex = tex; this.cache = new Map(); this._clones = []; }

  /** يبني MeshStandardMaterial من مجموعة PBR مولّدة */
  fromSet(key, set, {
    repeat = [1, 1], color = 0xffffff, roughness = 1, metalness = 0,
    normalScale = 1, envMapIntensity = 1, side = THREE.FrontSide, emissiveMap = null,
    emissive = 0x000000, emissiveIntensity = 0, flatShading = false, transparent = false,
    alphaTest = 0, depthWrite = true, opacity = 1, vertexColors = false, dithering = true,
  } = {}) {
    const ck = `${key}|${repeat}|${color}|${roughness}|${metalness}|${side}|${vertexColors}`;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const map = cloneTex(set.map, repeat);
    const nrm = cloneTex(set.normalMap, repeat);
    const orm = cloneTex(set.ormMap, repeat);
    if (orm) orm.channel = 0;
    const m = new THREE.MeshStandardMaterial({
      map, normalMap: nrm, roughnessMap: orm, aoMap: orm, metalnessMap: orm,
      color, roughness, metalness, side, flatShading, transparent, alphaTest, depthWrite, opacity,
      vertexColors, dithering,
      emissive, emissiveIntensity, emissiveMap,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      envMapIntensity,
    });
    if (map) this._clones.push(map);
    if (nrm) this._clones.push(nrm);
    if (orm) this._clones.push(orm);
    this.cache.set(ck, m);
    return m;
  }

  asphalt(repeat = [8, 8]) { return this.fromSet('asphalt', this.tex.asphalt(), { repeat, roughness: 0.95, normalScale: 0.7, envMapIntensity: 0.55 }); }
  concrete(repeat = [4, 4], color = 0xffffff) { return this.fromSet('concrete', this.tex.concrete(), { repeat, color, roughness: 1, normalScale: 0.8 }); }
  pavement(repeat = [3, 3]) { return this.fromSet('pavement', this.tex.pavement(), { repeat, roughness: 1, normalScale: 0.85 }); }
  grass(repeat = [40, 40]) { return this.fromSet('grass', this.tex.grass(), { repeat, roughness: 1, normalScale: 0.5 }); }
  dirt(repeat = [30, 30]) { return this.fromSet('dirt', this.tex.dirt(), { repeat, roughness: 1 }); }
  rock(repeat = [20, 20]) { return this.fromSet('rock', this.tex.rock(), { repeat, roughness: 1 }); }
  sand(repeat = [25, 25]) { return this.fromSet('sand', this.tex.sand(), { repeat, roughness: 1 }); }
  brick(tint, repeat = [1, 1]) { return this.fromSet('brick' + tint.join(), this.tex.brick(81, tint), { repeat, roughness: 1, normalScale: 0.9 }); }
  plaster(tint, repeat = [1, 1]) { return this.fromSet('plaster' + tint.join(), this.tex.plaster(91, tint), { repeat, roughness: 1, normalScale: 0.5 }); }
  metalPanel(tint = [0.52, 0.55, 0.58], repeat = [1, 1]) { return this.fromSet('metal' + tint.join(), this.tex.metalPanel(101, tint), { repeat, roughness: 0.55, metalness: 0.75, normalScale: 0.9 }); }
  roofGravel(repeat = [2, 2]) { return this.fromSet('roofGravel', this.tex.roofGravel(), { repeat, roughness: 1 }); }
  roofTile(tint = [0.42, 0.17, 0.12], repeat = [1, 1]) { return this.fromSet('roofTile' + tint.join(), this.tex.roofTile(121, tint), { repeat, roughness: 0.85 }); }
  bark(repeat = [1, 3]) { return this.fromSet('bark', this.tex.bark(), { repeat, roughness: 1, normalScale: 0.9 }); }

  glass(color = 0x0f1a22, { rough = 0.06, metal = 0.25, opacity = 0.82 } = {}) {
    const ck = 'glass' + color + rough + metal + opacity;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: rough, metalness: metal, transparent: opacity < 1, opacity,
      envMapIntensity: 1.6, clearcoat: 0.5, clearcoatRoughness: 0.08, reflectivity: 0.6,
      side: THREE.FrontSide, depthWrite: opacity > 0.95,
    });
    this.cache.set(ck, m); return m;
  }

  carPaint(color) {
    const ck = 'car' + color;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.28, metalness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.06,
      envMapIntensity: 1.4,
    });
    this.cache.set(ck, m); return m;
  }

  emissiveFlat(color, intensity = 3) {
    const ck = 'emi' + color + intensity;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const m = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0, toneMapped: true,
    });
    this.cache.set(ck, m); return m;
  }

  simple(color, { roughness = 0.8, metalness = 0.05, flat = false, side = THREE.FrontSide } = {}) {
    const ck = `s${color}${roughness}${metalness}${flat}${side}`;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat, side, envMapIntensity: 1 });
    this.cache.set(ck, m); return m;
  }

  setEnvMap(env, intensity = 1) {
    for (const m of this.cache.values()) {
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        m.envMap = env; m.envMapIntensity = (m.userData.envI ?? 1) * intensity; m.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose?.();
    for (const t of this._clones) t.dispose?.();
    this.cache.clear(); this._clones.length = 0;
  }
}
