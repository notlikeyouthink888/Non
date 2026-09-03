/** سطح ماء: أمواج متحركة، عمق لوني، رغوة شاطئ، انعكاس بيئي. */
import * as THREE from 'three';
import { Noise } from '../../core/rng.js';
import { clamp, smoothstep } from '../../core/math.js';

function waveNormalTexture(seed = 7, size = 256) {
  const n = new Noise(seed);
  const img = new ImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let s = 0;
    s += Math.sin((u * 6.0 + v * 2.0) * Math.PI * 2 + n.fbm(u * 3, v * 3, 3) * 3) * 0.5;
    s += Math.sin((u * -2.4 + v * 7.3) * Math.PI * 2 + n.fbm(u * 5 + 3, v * 5, 3) * 3) * 0.35;
    s += n.fbm(u * 16, v * 16, 4) * 0.5;
    h[y * size + x] = s;
  }
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = at(x + 1, y) - at(x - 1, y);
    const dy = at(x, y + 1) - at(x, y - 1);
    let nx = -dx * 1.6, ny = -dy * 1.6, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d').putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createWater(world, { seed = 7, segments = 160 } = {}) {
  const S = world.size;
  const geo = new THREE.PlaneGeometry(S * 1.6, S * 1.6, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const T = world.terrain;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ground = Math.abs(x) < S / 2 && Math.abs(z) < S / 2 ? T.sampleHeight(x, z) : -60;
    const depth = clamp(world.waterLevel - ground, -2, 60);
    const shallow = smoothstep(11, 0.25, depth);      // 1 عند الشاطئ
    const foam = smoothstep(0.85, 0.02, depth) * smoothstep(-0.5, 0.10, depth);
    // لون: أزرق مخضر ضحل ← أزرق داكن عميق
    const r = 0.014 + shallow * 0.070 + foam * 0.34;
    const g = 0.048 + shallow * 0.165 + foam * 0.38;
    const b = 0.082 + shallow * 0.130 + foam * 0.40;
    const a = clamp(0.62 + (1 - shallow) * 0.33 - foam * 0.25, 0.3, 0.97);
    colors[i * 4] = r; colors[i * 4 + 1] = g; colors[i * 4 + 2] = b; colors[i * 4 + 3] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.computeVertexNormals();

  const nrm = waveNormalTexture(seed);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, transparent: true,
    roughness: 0.20, metalness: 0.06, normalMap: nrm,
    normalScale: new THREE.Vector2(0.5, 0.5),
    envMapIntensity: 0.95, depthWrite: false, side: THREE.FrontSide,
  });
  const uni = { uTime: { value: 0 }, uWave: { value: 0.45 }, uWaterNormal: { value: nrm } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWave; uniform sampler2D uWaterNormal;`)
      .replace('#include <normal_fragment_maps>', `
        vec2 wuv = vNormalMapUv * 22.0;
        vec3 nA = texture2D( uWaterNormal, wuv + vec2( uTime * 0.010, uTime * 0.014 ) ).xyz * 2.0 - 1.0;
        vec3 nB = texture2D( uWaterNormal, wuv * 2.7 + vec2( -uTime * 0.021, uTime * 0.008 ) ).xyz * 2.0 - 1.0;
        vec3 nC = texture2D( uWaterNormal, wuv * 0.35 + vec2( uTime * 0.004, -uTime * 0.003 ) ).xyz * 2.0 - 1.0;
        vec3 mapN = normalize( vec3( nA.xy + nB.xy * 0.6 + nC.xy * 1.4, nA.z * nB.z ) );
        mapN.xy *= uWave * ( 0.55 + 0.9 * vColor.a );
        mat3 tbnW = getTangentFrame( - vViewPosition, normal, wuv );
        normal = normalize( tbnW * mapN );
      `);
  };
  mat.customProgramCacheKey = () => 'water-v1';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = world.waterLevel;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  return { mesh, uniforms: uni, material: mat, geometry: geo, normalTex: nrm };
}
