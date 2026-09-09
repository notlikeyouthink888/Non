/** أدوات هندسة المباني: صناديق بواجهات مُعايَرة، أسطح جملونية، شرفات، حواجز، معدات سطح. */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const MODULE_W = 3.2;    // عرض وحدة النافذة (متر)
export const FLOOR_H = 3.4;     // ارتفاع الطابق (متر)
const U_PER_M = 1 / (MODULE_W * 8);
const V_PER_M = 1 / (FLOOR_H * 8);

/**
 * صندوق واجهة: UV مُعايَر بالمتر بحيث تتطابق النوافذ فعليًا مع الطوابق.
 * y = 0 عند القاعدة.
 */
export function facadeBox(w, h, d, { y0 = 0, uOff = 0, vOff = 0, capTop = true, capBottom = false } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y0 + h / 2, 0);
  const uv = g.attributes.uv;
  const uW = w * U_PER_M, uD = d * U_PER_M, vH = h * V_PER_M;
  // ترتيب أوجه BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  const setFace = (f, uSpan, vSpan) => {
    const i = f * 4;
    const u0 = uOff, v0 = vOff;
    uv.setXY(i + 0, u0, v0 + vSpan);
    uv.setXY(i + 1, u0 + uSpan, v0 + vSpan);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u0 + uSpan, v0);
  };
  setFace(0, uD, vH); setFace(1, uD, vH);
  setFace(2, uW * 0.5, uD * 0.5); setFace(3, uW * 0.5, uD * 0.5);
  setFace(4, uW, vH); setFace(5, uW, vH);
  uv.needsUpdate = true;
  if (!capTop || !capBottom) {
    // نحذف الوجه السفلي دائمًا (غير مرئي) لتقليل المثلثات
    const idx = [];
    const src = g.index.array;
    for (let f = 0; f < 6; f++) {
      if (f === 3) continue;                 // -Y
      if (f === 2 && !capTop) continue;      // +Y
      for (let k = 0; k < 6; k++) idx.push(src[f * 6 + k]);
    }
    g.setIndex(idx);
  }
  return g;
}

/** صندوق عادي بـ UV بسيط بالمتر (للأسطح والحواجز والمعدات) */
export function plainBox(w, h, d, x = 0, y = 0, z = 0, uvScale = 0.35) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  const uv = g.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = spans[f];
    const i = f * 4;
    uv.setXY(i + 0, 0, sv * uvScale); uv.setXY(i + 1, su * uvScale, sv * uvScale);
    uv.setXY(i + 2, 0, 0); uv.setXY(i + 3, su * uvScale, 0);
  }
  uv.needsUpdate = true;
  return g;
}

/** سقف جملوني (مثلثي) */
export function gableRoof(w, d, h, overhang = 0.45, y0 = 0) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const v = [
    -W, y0, -D, W, y0, -D, W, y0, D, -W, y0, D,   // القاعدة 0..3
    -W, y0 + h, 0, W, y0 + h, 0,                   // الحافة العليا 4,5
  ];
  const idx = [
    0, 1, 4, 1, 5, 4,      // الجانب -Z؟ (المنحدر الخلفي)
    3, 4, 2, 2, 4, 5,      // المنحدر الأمامي
    0, 4, 3,               // الجبهة اليسرى
    1, 2, 5,               // الجبهة اليمنى
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uvs = [0, 0, w * 0.14, 0, w * 0.14, d * 0.14, 0, d * 0.14, 0, 0.6, w * 0.14, 0.6];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** حاجز سطح (بارابيت) مجوّف */
export function parapet(w, d, h, t, y0) {
  const parts = [
    plainBox(w, h, t, 0, y0, d / 2 - t / 2),
    plainBox(w, h, t, 0, y0, -d / 2 + t / 2),
    plainBox(t, h, d - t * 2, w / 2 - t / 2, y0, 0),
    plainBox(t, h, d - t * 2, -w / 2 + t / 2, y0, 0),
  ];
  const g = BGU.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

/** حاجز شرفة بأعمدة رفيعة */
/** حاجز شرفة مبسّط: لوح + قضيب علوي + قائمان (36 مثلثًا بدل ~110) */
export function railing(w, h, y0, x, z, rotY = 0, posts = 2) {
  const parts = [
    plainBox(w, h * 0.72, 0.04, 0, y0 + h * 0.10, 0),        // اللوح
    plainBox(w, 0.07, 0.09, 0, y0 + h - 0.07, 0),            // القضيب العلوي
    plainBox(0.07, h, 0.07, -w / 2 + 0.04, y0, 0),
    plainBox(0.07, h, 0.07, w / 2 - 0.04, y0, 0),
  ];
  const g = BGU.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.rotateY(rotY);
  g.translate(x, 0, z);
  return g;
}

/** معدات سطح: وحدات تكييف، بيت درج، هوائي */
export function roofEquipment(rng, w, d, y, tall) {
  const parts = [];
  const n = Math.max(1, Math.floor(rng.range(1, 4)));
  for (let i = 0; i < n; i++) {
    const uw = rng.range(1.1, 2.6), ud = rng.range(1.1, 2.4), uh = rng.range(0.7, 1.5);
    const px = rng.range(-w / 2 + uw, w / 2 - uw), pz = rng.range(-d / 2 + ud, d / 2 - ud);
    parts.push(plainBox(uw, uh, ud, px, y, pz));
    if (rng.bool(0.5)) parts.push(plainBox(uw * 0.55, 0.12, ud * 0.55, px, y + uh, pz));
  }
  // بيت الدرج
  const sw = Math.min(3.6, w * 0.32), sd = Math.min(3.2, d * 0.32);
  parts.push(plainBox(sw, rng.range(2.4, 3.2), sd, rng.range(-w / 4, w / 4), y, rng.range(-d / 4, d / 4)));
  if (tall) {
    const mast = plainBox(0.18, rng.range(5, 12), 0.18, w * 0.28, y, -d * 0.28);
    parts.push(mast);
    parts.push(plainBox(0.9, 0.12, 0.12, w * 0.28, y + 3.4, -d * 0.28));
  }
  const g = BGU.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

/** مظلة محل (للطابق الأرضي التجاري) */
export function awning(w, y, z, depth = 1.5) {
  const g = plainBox(w, 0.10, depth, 0, y, z + depth / 2);
  g.rotateX(-0.16);
  g.translate(0, 0.1, 0);
  return g;
}

export function merge(list, dispose = true) {
  const clean = list.filter(Boolean);
  if (!clean.length) return null;
  const g = BGU.mergeGeometries(clean, false);
  if (dispose) clean.forEach((x) => x.dispose());
  return g;
}

/** يدمج قوائم لكل مادة إلى هندسة واحدة بمجموعات */
export function mergeGroups(lists) {
  const geos = [], counts = [];
  for (const list of lists) {
    const m = merge(list);
    geos.push(m);
    counts.push(m ? (m.index ? m.index.count : m.attributes.position.count) : 0);
  }
  const valid = geos.filter(Boolean);
  if (!valid.length) return null;
  const merged = BGU.mergeGeometries(valid, true);   // useGroups
  valid.forEach((g) => g.dispose());
  return { geometry: merged, present: geos.map((g) => !!g) };
}
