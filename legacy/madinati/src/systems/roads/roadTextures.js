/**
 * أنسجة أسطح الطرق: أسفلت + دهان الخطوط مخبوز في نفس النسيج.
 * محور U = عرض الطريق كاملًا، محور V = 12 مترًا على الطول (مبلّط).
 */
import * as THREE from 'three';
import { Noise, mulberry32 } from '../../core/rng.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

const TILE_M = 12;   // أمتار لكل تبليطة على الطول

function paintProfile(type, width) {
  // يُعيد قائمة خطوط: {u (نسبة العرض), w (متر), dash:[len,gap], color}
  const L = [];
  const e = 0.55 / width;              // بُعد خط الحافة عن الحافة
  const white = [0.86, 0.86, 0.82], yellow = [0.80, 0.62, 0.12];
  if (type === 3) { // طريق سريع 6 مسارات
    L.push({ u: e, w: 0.16, color: white });
    L.push({ u: 1 - e, w: 0.16, color: white });
    for (const k of [1 / 6, 2 / 6, 4 / 6, 5 / 6]) L.push({ u: k, w: 0.13, dash: [4, 6], color: white });
    L.push({ u: 0.5 - 0.012, w: 0.13, color: yellow });
    L.push({ u: 0.5 + 0.012, w: 0.13, color: yellow });
  } else if (type === 2) { // جادة 4 مسارات
    L.push({ u: e, w: 0.15, color: white });
    L.push({ u: 1 - e, w: 0.15, color: white });
    L.push({ u: 0.25, w: 0.12, dash: [3, 4.5], color: white });
    L.push({ u: 0.75, w: 0.12, dash: [3, 4.5], color: white });
    L.push({ u: 0.5 - 0.014, w: 0.12, color: yellow });
    L.push({ u: 0.5 + 0.014, w: 0.12, color: yellow });
  } else if (type === 1) { // شارع
    L.push({ u: e, w: 0.12, color: white });
    L.push({ u: 1 - e, w: 0.12, color: white });
    L.push({ u: 0.5, w: 0.12, dash: [3, 4.5], color: white });
  }
  return L;
}

export function roadSurfaceTexture(typeId, width, seed = 5, size = 512) {
  const n = new Noise(seed + typeId * 13);
  const lines = paintProfile(typeId, width);
  const W = size, H = size;
  const alb = new ImageData(W, H), orm = new ImageData(W, H);
  const hgt = new Float32Array(W * H);
  const ad = alb.data, od = orm.data;
  const rnd = mulberry32(seed + 77);
  // رقع إصلاح عشوائية
  const patches = [];
  for (let i = 0; i < 5; i++) patches.push({ u: rnd(), v: rnd(), r: 0.08 + rnd() * 0.16, k: 0.6 + rnd() * 0.5 });

  for (let y = 0; y < H; y++) {
    const v = y / H;
    const metersV = v * TILE_M;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // --- أسفلت ---
      const agg = n.fbm(u * width * 3.2, v * TILE_M * 3.2, 4) * 0.5 + 0.5;
      const fine = n.fbm(u * width * 14, v * TILE_M * 14, 3) * 0.5 + 0.5;
      const macro = n.fbm(u * 2.0, v * 2.0, 3) * 0.5 + 0.5;
      let patchK = 0;
      for (const p of patches) {
        const d = Math.hypot((u - p.u) * width / TILE_M, v - p.v);
        patchK = Math.max(patchK, smoothstep(p.r, p.r * 0.55, d) * p.k);
      }
      // أثر إطارات: مساران أغمق قليلًا
      const lanes = Math.max(2, Math.round(width / 3.2));
      const laneU = (u * lanes) % 1;
      const wear = smoothstep(0.34, 0.16, Math.abs(laneU - 0.5)) * 0.30;
      let base = 0.062 + macro * 0.030 + fine * 0.022 + agg * 0.012;
      base *= (1 - wear * 0.45);
      base = lerp(base, base * 1.42, patchK * 0.5);
      let r = base * 1.02, g = base, b = base * 0.99;
      let rough = clamp(0.90 - macro * 0.10 + wear * 0.08 - patchK * 0.06, 0.4, 1);
      let ao = clamp(1 - patchK * 0.10, 0, 1);
      let h = fine * 0.5 + agg * 0.35 - patchK * 0.15;

      // --- الدهان ---
      for (const L of lines) {
        const du = Math.abs(u - L.u) * width;      // بالمتر
        let inLine = smoothstep(L.w / 2, L.w / 2 - 0.06, du);
        if (L.dash) {
          const per = L.dash[0] + L.dash[1];
          const m = metersV % per;
          inLine *= smoothstep(0.12, 0.0, Math.max(0, m - L.dash[0])) * smoothstep(-0.12, 0.02, m);
        }
        if (inLine <= 0.001) continue;
        // تآكل الدهان
        const wearP = clamp(0.55 + 0.45 * (n.fbm(u * 40, v * 60 + 9, 3) * 0.5 + 0.5), 0, 1);
        const a = inLine * wearP;
        r = lerp(r, L.color[0], a); g = lerp(g, L.color[1], a); b = lerp(b, L.color[2], a);
        rough = lerp(rough, 0.62, a);
        h = lerp(h, h + 0.25, a);
        ao = lerp(ao, 1.0, a * 0.6);
      }

      const i = (y * W + x) * 4;
      ad[i] = clamp(r, 0, 1) * 255; ad[i + 1] = clamp(g, 0, 1) * 255; ad[i + 2] = clamp(b, 0, 1) * 255; ad[i + 3] = 255;
      od[i] = ao * 255; od[i + 1] = rough * 255; od[i + 2] = 0; od[i + 3] = 255;
      hgt[y * W + x] = h;
    }
  }

  // خريطة نتوء
  const nrm = new ImageData(W, H);
  const nd = nrm.data;
  const at = (x, y) => hgt[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * 1.1, ny = -dy * 1.1, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * W + x) * 4;
    nd[i] = (nx / l * 0.5 + 0.5) * 255; nd[i + 1] = (ny / l * 0.5 + 0.5) * 255; nd[i + 2] = (nz / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
  }

  const mk = (img, srgb) => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    c.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  return { map: mk(alb, true), normalMap: mk(nrm, false), ormMap: mk(orm, false), tileMeters: TILE_M };
}

/** نسيج معبر المشاة (شرائط) */
export function crosswalkTexture(seed = 9, size = 256) {
  const n = new Noise(seed);
  const img = new ImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const stripe = (u * 8) % 1;
    const inS = smoothstep(0.12, 0.20, stripe) * smoothstep(0.88, 0.80, stripe);
    const wear = 0.55 + 0.45 * (n.fbm(u * 30, v * 30, 3) * 0.5 + 0.5);
    const a = inS * wear * smoothstep(0.0, 0.06, v) * smoothstep(1.0, 0.94, v);
    const i = (y * size + x) * 4;
    d[i] = 225; d[i + 1] = 225; d[i + 2] = 215; d[i + 3] = clamp(a, 0, 1) * 255;
  }
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  c.getContext('2d').putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
