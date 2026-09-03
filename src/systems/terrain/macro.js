/** خبز خريطة الأرض الكبرى (لون فريد لكل متر) — يمنع تكرار الأنسجة تمامًا. */
import * as THREE from 'three';
import { Noise } from '../../core/rng.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

const LAYERS = {
  //            albedo (linear-ish sRGB)     roughness
  sand:  { c: [0.435, 0.385, 0.288], r: 0.90 },
  grass: { c: [0.128, 0.212, 0.078], r: 0.93 },
  grassDry:{c: [0.288, 0.272, 0.132], r: 0.92 },
  dirt:  { c: [0.205, 0.152, 0.098], r: 0.95 },
  rock:  { c: [0.225, 0.215, 0.198], r: 0.82 },
  snow:  { c: [0.74, 0.77, 0.82], r: 0.55 },
};

export function bakeMacro(world, seed, size = 1024) {
  const n1 = new Noise(seed + 21);
  const n2 = new Noise(seed + 22);
  const alb = new ImageData(size, size);
  const orm = new ImageData(size, size);
  const ad = alb.data, od = orm.data;
  const S = world.size, half = S / 2;
  const T = world.terrain;
  const step = S / size;

  for (let y = 0; y < size; y++) {
    const wz = (y + 0.5) * step - half;
    for (let x = 0; x < size; x++) {
      const wx = (x + 0.5) * step - half;
      const h = T.sampleHeight(wx, wz);
      const nrm = T.normalAt(wx, wz, step);
      const slope = 1 - nrm.y;                        // 0 مسطّح .. 1 عمودي
      const u = wx / 700, v = wz / 700;

      const varA = n1.fbm(u * 2.6, v * 2.6, 4) * 0.5 + 0.5;
      const varB = n2.fbm(u * 9.0, v * 9.0, 4) * 0.5 + 0.5;
      const varC = n1.fbm(u * 0.8 + 7, v * 0.8, 3) * 0.5 + 0.5;
      // ترددات أعلى: بقع بمقياس 25م و9م تمنع «اللون المسطّح» عند التقريب المتوسط
      const varD = n2.fbm(u * 28, v * 28, 3) * 0.5 + 0.5;
      const varE = n1.fbm(u * 78 + 3, v * 78, 2) * 0.5 + 0.5;
      const varF = n2.fbm(u * 160 + 11, v * 160, 2) * 0.5 + 0.5;

      // أوزان الطبقات
      const wSand = smoothstep(5.5, 0.4, h) * smoothstep(0.55, 0.18, slope) * smoothstep(-9, -1.5, h);
      const wRock = smoothstep(0.22, 0.52, slope + varB * 0.10) + smoothstep(150, 235, h) * 0.7;
      const wSnow = smoothstep(215, 275, h + varA * 26) * smoothstep(0.7, 0.35, slope);
      const dryness = smoothstep(0.42, 0.72, varC);
      let wGrass = 1;

      let r = 0, g = 0, b = 0, rough = 0, wsum = 0;
      const add = (L, w) => { if (w <= 0) return; r += L.c[0] * w; g += L.c[1] * w; b += L.c[2] * w; rough += L.r * w; wsum += w; };

      // إضاءة/عتمة البقع: طبقات متعددة الترددات (مثل المروج الحقيقية)
      const patchK = (0.74 + varA * 0.34) * (0.86 + varD * 0.28) * (0.92 + varE * 0.16) * (0.95 + varF * 0.10);
      const localDry = clamp(dryness + (varD - 0.5) * 0.55 + (varE - 0.5) * 0.28, 0, 1);
      const gCol = {
        c: [lerp(LAYERS.grass.c[0], LAYERS.grassDry.c[0], localDry) * patchK,
            lerp(LAYERS.grass.c[1], LAYERS.grassDry.c[1], localDry) * patchK,
            lerp(LAYERS.grass.c[2], LAYERS.grassDry.c[2], localDry) * patchK],
        r: 0.93,
      };
      const dirtMix = smoothstep(0.52, 0.86, varB * 0.6 + varD * 0.4) * 0.55;
      const gFinal = {
        c: [lerp(gCol.c[0], LAYERS.dirt.c[0], dirtMix), lerp(gCol.c[1], LAYERS.dirt.c[1], dirtMix), lerp(gCol.c[2], LAYERS.dirt.c[2], dirtMix)],
        r: 0.94,
      };
      wGrass = clamp(1 - wSand - wRock - wSnow, 0, 1);
      add(gFinal, wGrass);
      add({ c: [LAYERS.sand.c[0] * (0.86 + varB * 0.3), LAYERS.sand.c[1] * (0.86 + varB * 0.3), LAYERS.sand.c[2] * (0.86 + varB * 0.3)], r: LAYERS.sand.r }, wSand);
      add({ c: [LAYERS.rock.c[0] * (0.7 + varB * 0.6), LAYERS.rock.c[1] * (0.7 + varB * 0.6), LAYERS.rock.c[2] * (0.7 + varB * 0.6)], r: LAYERS.rock.r }, clamp(wRock, 0, 1));
      add(LAYERS.snow, wSnow);
      const inv = 1 / Math.max(wsum, 1e-4);
      r *= inv; g *= inv; b *= inv; rough *= inv;

      // انسداد محيطي تقريبي من الانحدار والتقعّر
      const hN = T.sampleHeight(wx, wz - step * 3), hS = T.sampleHeight(wx, wz + step * 3);
      const hE = T.sampleHeight(wx + step * 3, wz), hW = T.sampleHeight(wx - step * 3, wz);
      const curv = (hN + hS + hE + hW) * 0.25 - h;    // موجب = مقعّر
      const ao = clamp(1 - clamp(curv, 0, 8) * 0.055 - slope * 0.14 - (1 - varE) * 0.05, 0.45, 1);

      // ظل ذاتي مبسّط باتجاه الشمس المتوسطة (يعطي عمقًا للجبال حتى دون ظلال)
      const i = (y * size + x) * 4;
      ad[i] = clamp(r, 0, 1) * 255; ad[i + 1] = clamp(g, 0, 1) * 255; ad[i + 2] = clamp(b, 0, 1) * 255; ad[i + 3] = 255;
      od[i] = ao * 255; od[i + 1] = clamp(rough, 0, 1) * 255; od[i + 2] = 0; od[i + 3] = 255;
    }
  }

  const mk = (img, srgb) => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
    c.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(alb, true), ormMap: mk(orm, false) };
}
