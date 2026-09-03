/**
 * مصنع خرائط PBR إجرائية (CC0 — مولَّدة محليًا، بلا أصول خارجية).
 * كل نسيج يُولَّد مرة واحدة ويُخزَّن مؤقتًا. المُخرجات: albedo + normal + roughness + ao.
 * القاعدة: لا ألوان مسطّحة — كل سطح يحمل تباينًا لونيًا وتفاصيل نتوء وتدرّج خشونة.
 */
import * as THREE from 'three';
import { Noise, mulberry32 } from './rng.js';
import { clamp, lerp, smoothstep } from './math.js';

const _canvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

/** شبكة نقاط Worley مُسبقة الحساب (سريعة وقابلة للتبليط) */
function worleyGrid(cells, seed) {
  const r = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  return {
    cells, pts,
    sample(u, v) { // u,v في [0,1) — قابلة للتبليط
      const fx = u * cells, fy = v * cells;
      const xi = Math.floor(fx), yi = Math.floor(fy);
      let f1 = 9, f2 = 9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = (xi + dx + cells) % cells, cy = (yi + dy + cells) % cells;
        const i = (cy * cells + cx) * 2;
        const px = xi + dx + pts[i], py = yi + dy + pts[i + 1];
        const d = Math.hypot(px - fx, py - fy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      return { f1, f2, edge: f2 - f1 };
    }
  };
}

export class TextureFactory {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer, { size = 512, anisotropy = 8, seed = 1 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.aniso = anisotropy;
    this.seed = seed;
    this.cache = new Map();
    this.noise = new Noise(seed);
    this.bytes = 0;
  }

  _finish(tex, { srgb = false, repeat = 1 } = {}) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = this.aniso;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  _fromImageData(data, w, h, opts) {
    const c = _canvas(w, h);
    c.getContext('2d').putImageData(data, 0, 0);
    this.bytes += w * h * 4 * 1.34;
    return this._finish(new THREE.CanvasTexture(c), opts);
  }

  /** خريطة نتوء ← خريطة مناسيب (Sobel) */
  _normalFromHeight(height, w, h, strength = 2.0) {
    const out = new ImageData(w, h);
    const d = out.data;
    const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    return out;
  }

  /**
   * مولّد عام: fn(u, v, x, y) => [r, g, b, height, roughness, ao] (كلها 0..1)
   * يُعيد { map, normalMap, roughnessMap, aoMap }
   */
  generate(key, fn, { size = this.size, normalStrength = 2.0, repeat = 1, wantAO = true } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const w = size, h = size;
    const alb = new ImageData(w, h);
    const rough = new ImageData(w, h);
    const height = new Float32Array(w * h);
    const ad = alb.data, rd = rough.data;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const o = fn(u, v, x, y);
        const i = (y * w + x) * 4;
        ad[i] = clamp(o[0], 0, 1) * 255; ad[i + 1] = clamp(o[1], 0, 1) * 255; ad[i + 2] = clamp(o[2], 0, 1) * 255; ad[i + 3] = 255;
        height[y * w + x] = o[3];
        const rg = clamp(o[4], 0, 1) * 255;
        const ao = wantAO ? clamp(o[5] === undefined ? 1 : o[5], 0, 1) * 255 : 255;
        // قناة واحدة تحمل الثلاثة: R = AO, G = roughness, B = metalness(0)
        rd[i] = ao; rd[i + 1] = rg; rd[i + 2] = 0; rd[i + 3] = 255;
      }
    }
    const res = {
      map: this._fromImageData(alb, w, h, { srgb: true, repeat }),
      normalMap: this._fromImageData(this._normalFromHeight(height, w, h, normalStrength), w, h, { repeat }),
      ormMap: this._fromImageData(rough, w, h, { repeat }),   // AO/Rough/Metal معبّأة
    };
    res.roughnessMap = res.ormMap; res.aoMap = res.ormMap; res.metalnessMap = res.ormMap;
    this.cache.set(key, res);
    return res;
  }

  // ============ الأنسجة القياسية ============

  asphalt(seed = 11) {
    const n = new Noise(this.seed + seed);
    const grit = worleyGrid(48, this.seed + seed + 5);
    return this.generate('asphalt' + seed, (u, v) => {
      const g = grit.sample(u, v);
      const agg = smoothstep(0.0, 0.09, g.edge);              // حبيبات الركام
      const fine = n.fbm(u * 60, v * 60, 4) * 0.5 + 0.5;
      const patch = n.fbm(u * 4 + 30, v * 4, 3) * 0.5 + 0.5;   // رقع إصلاح
      const crack = smoothstep(0.02, 0.0, worleyGrid(9, this.seed + 77).sample(u, v).edge);
      let base = 0.055 + patch * 0.045 + fine * 0.035;
      base = lerp(base, base * 0.72, crack);
      const speck = agg < 0.25 ? 0.05 * (1 - agg) : 0;
      const r = base + speck * 1.05, gg = base + speck, b = base * 0.98 + speck * 0.95;
      const hgt = fine * 0.35 + (1 - agg) * 0.5 - crack * 0.8;
      const ro = clamp(0.86 - patch * 0.12 + (1 - agg) * 0.06, 0.5, 1);
      const ao = clamp(1 - crack * 0.55 - (1 - agg) * 0.12, 0, 1);
      return [r, gg, b, hgt, ro, ao];
    }, { normalStrength: 1.5 });
  }

  concrete(seed = 21) {
    const n = new Noise(this.seed + seed);
    const pits = worleyGrid(64, this.seed + seed + 3);
    return this.generate('concrete' + seed, (u, v) => {
      const stain = n.fbm(u * 3, v * 3, 4) * 0.5 + 0.5;
      const fine = n.fbm(u * 90, v * 90, 3) * 0.5 + 0.5;
      const p = pits.sample(u, v);
      const pit = smoothstep(0.14, 0.0, p.f1) * 0.55;
      const base = 0.40 + stain * 0.16 + fine * 0.06 - pit * 0.12;
      const warm = 0.012 * (stain - 0.5);
      const hgt = fine * 0.4 - pit;
      const ro = clamp(0.68 + stain * 0.14 + pit * 0.15, 0, 1);
      const ao = clamp(1 - pit * 0.9 - (1 - stain) * 0.06, 0, 1);
      return [base + warm, base, base - warm * 0.6, hgt, ro, ao];
    }, { normalStrength: 1.2 });
  }

  /** رصيف بألواح وفواصل */
  pavement(seed = 31) {
    const n = new Noise(this.seed + seed);
    const tiles = 4;
    return this.generate('pavement' + seed, (u, v) => {
      const tu = (u * tiles) % 1, tv = (v * tiles) % 1;
      const joint = Math.min(Math.min(tu, 1 - tu), Math.min(tv, 1 - tv));
      const j = smoothstep(0.045, 0.012, joint);   // 1 داخل الفاصل
      const cellId = Math.floor(u * tiles) * 31 + Math.floor(v * tiles) * 17;
      const cellRnd = mulberry32(this.seed + cellId)();
      const stain = n.fbm(u * 6, v * 6, 4) * 0.5 + 0.5;
      const fine = n.fbm(u * 120, v * 120, 3) * 0.5 + 0.5;
      let base = 0.46 + cellRnd * 0.06 + stain * 0.10 + fine * 0.05;
      base = lerp(base, base * 0.55, j);
      const hgt = lerp(0.6 + fine * 0.35, 0.0, j);
      const ro = clamp(lerp(0.62 + stain * 0.15, 0.9, j), 0, 1);
      const ao = clamp(1 - j * 0.75, 0, 1);
      return [base * 1.02, base, base * 0.97, hgt, ro, ao];
    }, { normalStrength: 2.6 });
  }

  grass(seed = 41) {
    const n = new Noise(this.seed + seed);
    const clump = new Noise(this.seed + seed + 9);
    return this.generate('grass' + seed, (u, v) => {
      const blades = n.fbm(u * 190, v * 190, 3) * 0.5 + 0.5;
      const patch = clump.fbm(u * 7, v * 7, 4) * 0.5 + 0.5;
      const dry = smoothstep(0.55, 0.85, clump.fbm(u * 2.5 + 11, v * 2.5, 3) * 0.5 + 0.5);
      const gr = lerp(0.20, 0.36, patch) * lerp(1, 1.25, blades * 0.4);
      const rr = lerp(0.075, 0.16, patch) + dry * 0.16;
      const bb = lerp(0.045, 0.085, patch) + dry * 0.03;
      const hgt = blades * 0.7 + patch * 0.3;
      return [rr, gr, bb, hgt, clamp(0.88 - patch * 0.1, 0, 1), clamp(0.82 + patch * 0.18, 0, 1)];
    }, { normalStrength: 1.1 });
  }

  dirt(seed = 51) {
    const n = new Noise(this.seed + seed);
    const peb = worleyGrid(36, this.seed + seed + 2);
    return this.generate('dirt' + seed, (u, v) => {
      const p = peb.sample(u, v);
      const stone = smoothstep(0.10, 0.03, p.f1);
      const fine = n.fbm(u * 100, v * 100, 4) * 0.5 + 0.5;
      const patch = n.fbm(u * 5, v * 5, 4) * 0.5 + 0.5;
      const base = 0.20 + patch * 0.14 + fine * 0.06;
      const r = base * 1.20 + stone * 0.10, g = base * 0.92 + stone * 0.10, b = base * 0.66 + stone * 0.09;
      return [r, g, b, fine * 0.5 + stone * 0.5, clamp(0.9 - stone * 0.15, 0, 1), clamp(0.9 - stone * 0.12, 0, 1)];
    }, { normalStrength: 1.6 });
  }

  rock(seed = 61) {
    const n = new Noise(this.seed + seed);
    const cr = worleyGrid(12, this.seed + seed + 4);
    return this.generate('rock' + seed, (u, v) => {
      const c = cr.sample(u, v);
      const crack = smoothstep(0.06, 0.0, c.edge);
      const strata = Math.sin((v * 22 + n.fbm(u * 4, v * 4, 3) * 5)) * 0.5 + 0.5;
      const fine = n.fbm(u * 70, v * 70, 4) * 0.5 + 0.5;
      const base = 0.24 + strata * 0.13 + fine * 0.08 - crack * 0.10;
      return [base * 1.03, base, base * 0.96, fine * 0.4 + (1 - crack) * 0.5 + strata * 0.2, clamp(0.78 + fine * 0.15, 0, 1), clamp(1 - crack * 0.7, 0, 1)];
    }, { normalStrength: 2.2 });
  }

  sand(seed = 71) {
    const n = new Noise(this.seed + seed);
    return this.generate('sand' + seed, (u, v) => {
      const rip = Math.sin(u * 130 + n.fbm(u * 6, v * 6, 3) * 8) * 0.5 + 0.5;
      const fine = n.fbm(u * 200, v * 200, 3) * 0.5 + 0.5;
      const patch = n.fbm(u * 4, v * 4, 3) * 0.5 + 0.5;
      const base = 0.52 + patch * 0.10 + rip * 0.05 + fine * 0.04;
      return [base * 1.06, base * 0.98, base * 0.78, rip * 0.5 + fine * 0.5, clamp(0.86 - patch * 0.08, 0, 1), 0.95];
    }, { normalStrength: 0.9 });
  }

  /** طوب — لواجهات المباني السكنية */
  brick(seed = 81, tint = [0.45, 0.20, 0.15]) {
    const n = new Noise(this.seed + seed);
    const rows = 12, cols = 6;
    return this.generate('brick' + seed + tint.join(), (u, v) => {
      const ry = v * rows, row = Math.floor(ry);
      const off = (row % 2) * 0.5;
      const rx = (u * cols + off) % 1;
      const fy = ry % 1;
      const mortar = Math.max(smoothstep(0.055, 0.02, Math.min(rx, 1 - rx)), smoothstep(0.10, 0.04, Math.min(fy, 1 - fy)));
      const id = row * 37 + Math.floor(u * cols + off) * 91;
      const rnd = mulberry32(this.seed + id)();
      const grain = n.fbm(u * 140, v * 140, 3) * 0.5 + 0.5;
      const wear = n.fbm(u * 8, v * 8, 4) * 0.5 + 0.5;
      let r = tint[0] * (0.78 + rnd * 0.42) + grain * 0.05;
      let g = tint[1] * (0.80 + rnd * 0.40) + grain * 0.05;
      let b = tint[2] * (0.82 + rnd * 0.38) + grain * 0.05;
      const m = 0.55 + wear * 0.12 + grain * 0.05;
      r = lerp(r, m, mortar); g = lerp(g, m * 0.99, mortar); b = lerp(b, m * 0.97, mortar);
      const hgt = lerp(0.75 + grain * 0.2, 0.05, mortar);
      const ro = clamp(lerp(0.72 + grain * 0.1, 0.92, mortar), 0, 1);
      const ao = clamp(1 - mortar * 0.65, 0, 1);
      return [r, g, b, hgt, ro, ao];
    }, { normalStrength: 2.4 });
  }

  /** جص/محارة ملوّنة لواجهات */
  plaster(seed = 91, tint = [0.72, 0.68, 0.60]) {
    const n = new Noise(this.seed + seed);
    return this.generate('plaster' + seed + tint.join(), (u, v) => {
      const grain = n.fbm(u * 160, v * 160, 3) * 0.5 + 0.5;
      const blotch = n.fbm(u * 6, v * 6, 4) * 0.5 + 0.5;
      const streak = smoothstep(0.62, 1.0, n.fbm(u * 3, v * 30, 3) * 0.5 + 0.5) * 0.10; // أثر مياه
      const k = 0.86 + blotch * 0.20 + grain * 0.06 - streak;
      return [tint[0] * k, tint[1] * k, tint[2] * k, grain * 0.6 + blotch * 0.4, clamp(0.66 + blotch * 0.16, 0, 1), clamp(0.94 - streak * 2, 0, 1)];
    }, { normalStrength: 0.7 });
  }

  /** ألواح معدنية للمصانع والأسطح */
  metalPanel(seed = 101, tint = [0.52, 0.55, 0.58]) {
    const n = new Noise(this.seed + seed);
    return this.generate('metal' + seed + tint.join(), (u, v) => {
      const ribs = Math.abs(((u * 26) % 1) - 0.5) * 2;
      const rib = smoothstep(0.25, 0.75, ribs);
      const seam = smoothstep(0.02, 0.0, Math.min((v * 5) % 1, 1 - (v * 5) % 1));
      const rust = smoothstep(0.66, 0.95, n.fbm(u * 9, v * 9, 4) * 0.5 + 0.5);
      const scratch = n.fbm(u * 250, v * 40, 2) * 0.5 + 0.5;
      const k = 0.85 + rib * 0.22 + scratch * 0.06 - seam * 0.25;
      const r = lerp(tint[0] * k, 0.34, rust), g = lerp(tint[1] * k, 0.17, rust), b = lerp(tint[2] * k, 0.10, rust);
      return [r, g, b, rib * 0.85 - seam * 0.5, clamp(0.34 + rust * 0.5 + scratch * 0.08, 0, 1), clamp(1 - seam * 0.5 - rust * 0.15, 0, 1)];
    }, { normalStrength: 2.0 });
  }

  /** سطح مبنى: قار وحصى */
  roofGravel(seed = 111) {
    const n = new Noise(this.seed + seed);
    const g = worleyGrid(56, this.seed + seed + 6);
    return this.generate('roofGravel' + seed, (u, v) => {
      const w = g.sample(u, v);
      const stone = smoothstep(0.11, 0.02, w.f1);
      const patch = n.fbm(u * 7, v * 7, 4) * 0.5 + 0.5;
      const base = 0.14 + patch * 0.09 + stone * 0.16;
      return [base * 1.02, base, base * 0.95, stone * 0.8 + patch * 0.2, clamp(0.88 - stone * 0.1, 0, 1), clamp(0.86 + stone * 0.14, 0, 1)];
    }, { normalStrength: 1.8 });
  }

  /** بلاط سقف قرميدي */
  roofTile(seed = 121, tint = [0.42, 0.17, 0.12]) {
    const n = new Noise(this.seed + seed);
    return this.generate('roofTile' + seed, (u, v) => {
      const rows = 14;
      const ry = v * rows, row = Math.floor(ry), fy = ry % 1;
      const off = (row % 2) * 0.5;
      const cx = (u * 10 + off) % 1;
      const wave = Math.sin(cx * Math.PI) * 0.5 + 0.5;
      const lip = smoothstep(0.0, 0.18, fy);
      const rnd = mulberry32(this.seed + row * 13 + Math.floor(u * 10) * 7)();
      const moss = smoothstep(0.7, 1.0, n.fbm(u * 12, v * 12, 3) * 0.5 + 0.5);
      const k = 0.8 + rnd * 0.3 + wave * 0.25;
      let r = tint[0] * k, g = tint[1] * k, b = tint[2] * k;
      r = lerp(r, 0.18, moss * 0.5); g = lerp(g, 0.24, moss * 0.5); b = lerp(b, 0.12, moss * 0.5);
      return [r * lip, g * lip, b * lip, wave * 0.7 + lip * 0.3, clamp(0.68 + moss * 0.2, 0, 1), clamp(lip * 0.9 + 0.1, 0, 1)];
    }, { normalStrength: 2.6 });
  }

  /** لحاء شجر */
  bark(seed = 131) {
    const n = new Noise(this.seed + seed);
    return this.generate('bark' + seed, (u, v) => {
      const fib = n.fbm(u * 10, v * 120, 4) * 0.5 + 0.5;
      const crack = smoothstep(0.42, 0.30, fib);
      const base = 0.13 + fib * 0.12 - crack * 0.06;
      return [base * 1.25, base * 1.03, base * 0.80, fib * 0.85 - crack * 0.4, clamp(0.92 - fib * 0.1, 0, 1), clamp(1 - crack * 0.6, 0, 1)];
    }, { normalStrength: 2.2 });
  }

  /** بطاقة عنقود أوراق بقناة شفافية — تُستعمل لتيجان الأشجار */
  leafCard(seed = 141, size = 256, { hue = 0 } = {}) {
    const key = 'leafCard' + seed + hue;
    if (this.cache.has(key)) return this.cache.get(key);
    const n = new Noise(this.seed + seed);
    const w = size, h = size;
    const img = new ImageData(w, h);
    const d = img.data;
    const r = mulberry32(this.seed + seed);

    // عناقيد كبيرة تحدّد الصورة العامة
    const clumps = [];
    for (let i = 0; i < 9; i++) {
      clumps.push({ x: 0.5 + (r() - 0.5) * 0.62, y: 0.55 + (r() - 0.5) * 0.60, rr: 0.16 + r() * 0.16, t: r() });
    }
    // أوراق مفردة بيضاوية مائلة
    const leaves = [];
    for (let i = 0; i < 190; i++) {
      const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.6) * 0.42;
      leaves.push({
        x: 0.5 + Math.cos(a) * rad, y: 0.53 + Math.sin(a) * rad * 0.94,
        rx: 0.028 + r() * 0.030, ry: 0.014 + r() * 0.016,
        rot: r() * Math.PI, t: r(),
      });
    }

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // كثافة العنقود (تُخفّف الحواف)
      let mass = 0;
      for (const c of clumps) {
        const dd = Math.hypot(u - c.x, (v - c.y) * 1.08) / c.rr;
        if (dd < 1) mass = Math.max(mass, (1 - dd * dd) * (0.7 + c.t * 0.4));
      }
      if (mass <= 0.002) { const i0 = (y * w + x) * 4; d[i0 + 3] = 0; continue; }

      // أوراق مفردة
      let leafA = 0, shade = 0.5, depth = 0;
      for (const L of leaves) {
        const dx = u - L.x, dy = v - L.y;
        const ca = Math.cos(L.rot), sa = Math.sin(L.rot);
        const px = (dx * ca + dy * sa) / L.rx, py = (-dx * sa + dy * ca) / L.ry;
        const q = px * px + py * py;
        if (q < 1) {
          const f = 1 - q;
          if (f > leafA) { leafA = f; shade = L.t; depth = 1 - Math.min(1, Math.hypot(dx, dy) * 3.2); }
        }
      }
      const grain = n.fbm(u * 55, v * 55, 3) * 0.5 + 0.5;
      const alpha = clamp((leafA * 2.6) * (0.5 + mass * 0.9) * (0.72 + grain * 0.5), 0, 1);

      // لون: أخضر متفاوت + تعتيم في العمق + حواف أفتح (نفاذية الضوء)
      const base = 0.10 + shade * 0.17 + grain * 0.07;
      const litEdge = smoothstep(0.55, 0.05, leafA) * 0.22;      // الحواف الرقيقة تنفذ الضوء
      const occl = 1 - depth * 0.42;
      let R = (base * 0.44 + litEdge * 0.55) * occl;
      let G = (base * 1.05 + litEdge * 0.85) * occl;
      let B = (base * 0.26 + litEdge * 0.28) * occl;
      if (hue) { R += hue * 0.10; G -= hue * 0.03; }

      const i2 = (y * w + x) * 4;
      d[i2] = clamp(R, 0, 1) * 255;
      d[i2 + 1] = clamp(G, 0, 1) * 255;
      d[i2 + 2] = clamp(B, 0, 1) * 255;
      d[i2 + 3] = (alpha > 0.40 ? alpha : 0) * 255;
    }
    const tex = this._fromImageData(img, w, h, { srgb: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * واجهة معمارية: خلية واحدة = طابق × بائكة (3.2م × 3.4م).
   * style='curtain' جدار ستائري زجاجي للأبراج، style='punched' نوافذ مثقوبة بإطار وعتبة للسكني.
   */
  facadeWindows(seed = 151, {
    cols = 8, rows = 8, tint = [0.55, 0.57, 0.60], glass = [0.10, 0.13, 0.17], style = 'punched',
  } = {}) {
    const n = new Noise(this.seed + seed);
    const rnd = mulberry32(this.seed + seed + 991);
    // خصائص لكل خلية (بلايند، صبغة، اتساخ)
    const cell = [];
    for (let i = 0; i < cols * rows; i++) cell.push({ blind: rnd(), tintV: rnd(), dirt: rnd(), open: rnd() });

    const curtain = style === 'curtain';
    // هندسة النافذة داخل الخلية (نِسَب)
    const W0 = curtain ? 0.045 : 0.235, W1 = curtain ? 0.955 : 0.765;
    const H0 = curtain ? 0.300 : 0.250, H1 = curtain ? 0.945 : 0.800;

    return this.generate('facade' + seed + tint.join() + cols + rows + style, (u, v) => {
      const ci = Math.min(cols - 1, Math.floor(u * cols));
      const ri = Math.min(rows - 1, Math.floor(v * rows));
      const C = cell[ri * cols + ci];
      const cu = (u * cols) % 1;
      const cvRaw = (v * rows) % 1;
      const cv = 1 - cvRaw;                       // 0 أسفل الخلية، 1 أعلاها

      const grain = n.fbm(u * 190, v * 190, 3) * 0.5 + 0.5;
      const blotch = n.fbm(u * 5, v * 5, 4) * 0.5 + 0.5;
      const dirtRun = smoothstep(0.55, 1.0, n.fbm(u * 24, v * 3.2, 3) * 0.5 + 0.5);

      // ---------- الجدار / السباندرل ----------
      const wallK = 0.90 + blotch * 0.18 + grain * 0.045 - dirtRun * 0.055 * C.dirt;
      let r = tint[0] * wallK, g = tint[1] * wallK, b = tint[2] * wallK;
      let rough = clamp(curtain ? 0.42 + blotch * 0.14 : 0.72 + blotch * 0.16, 0, 1);
      let hgt = 0.62 + grain * 0.045;
      let ao = 1.0;

      // شريط سباندرل داكن أسفل كل خلية (يفصل الطوابق بصريًا)
      const spandrel = smoothstep(H0 + 0.02, H0 - 0.06, cv) * smoothstep(-0.02, 0.05, cv);
      if (spandrel > 0) {
        const k = curtain ? 0.52 : 0.86;
        r = lerp(r, r * k, spandrel); g = lerp(g, g * k, spandrel); b = lerp(b, b * k * 1.03, spandrel);
        rough = lerp(rough, curtain ? 0.30 : 0.80, spandrel);
        hgt = lerp(hgt, 0.55, spandrel);
      }

      // خط فاصل أفقي عند حدّ الطابق
      const slab = smoothstep(0.018, 0.0, Math.min(cvRaw, 1 - cvRaw));
      if (slab > 0) {
        const k = curtain ? 1.10 : 1.05;
        r = lerp(r, clamp(r * k, 0, 1), slab); g = lerp(g, clamp(g * k, 0, 1), slab); b = lerp(b, clamp(b * k, 0, 1), slab);
        hgt = lerp(hgt, 0.95, slab);
        ao = lerp(ao, 0.86, slab * 0.5);
      }

      // ---------- فتحة النافذة ----------
      const inW = smoothstep(W0, W0 + 0.02, cu) * smoothstep(W1, W1 - 0.02, cu)
                * smoothstep(H0, H0 + 0.02, cv) * smoothstep(H1, H1 - 0.02, cv);

      if (inW > 0.002) {
        // إطار/كتف حول الزجاج
        const frameW = curtain ? 0.014 : 0.020;
        const edge = Math.min(
          Math.min(cu - W0, W1 - cu),
          Math.min(cv - H0, H1 - cv)
        );
        const frame = smoothstep(frameW * 1.7, frameW * 0.3, edge);

        // زجاج: تدرّج انعكاس السماء + انعكاس أفقي + داخل معتم
        const skyRefl = smoothstep(0.10, 0.95, cv);
        const gv = C.tintV;
        let gr = glass[0] * (0.80 + gv * 0.40) + skyRefl * 0.115;
        let gg = glass[1] * (0.80 + gv * 0.40) + skyRefl * 0.150;
        let gb = glass[2] * (0.80 + gv * 0.40) + skyRefl * 0.205;
        // شريط انعكاس مائل خفيف
        const streak = smoothstep(0.42, 0.50, (cu * 0.7 + cv * 0.6) % 1) * smoothstep(0.62, 0.54, (cu * 0.7 + cv * 0.6) % 1);
        gr += streak * 0.045; gg += streak * 0.058; gb += streak * 0.072;
        // ستائر/بلايند في بعض النوافذ
        if (C.blind > 0.62) {
          const bl = 0.5 + 0.5 * Math.sin(cv * (curtain ? 90 : 58));
          const cover = C.blind > 0.86 ? 1.0 : smoothstep(0.30, 0.62, cv);
          const bc = 0.34 + bl * 0.11;
          gr = lerp(gr, bc, cover * 0.72); gg = lerp(gg, bc * 0.97, cover * 0.72); gb = lerp(gb, bc * 0.92, cover * 0.72);
        }
        // قضيب أفقي في منتصف النافذة (ترانسوم)
        const transom = smoothstep(0.012, 0.0, Math.abs(cv - (H0 + H1) * 0.5));
        // عمود عمودي (مولين) للجدار الستائري
        const mullion = curtain ? smoothstep(0.010, 0.0, Math.abs(cu - 0.5)) : 0;

        const glassA = inW * (1 - frame);
        r = lerp(r, gr, glassA); g = lerp(g, gg, glassA); b = lerp(b, gb, glassA);
        rough = lerp(rough, 0.08 + gv * 0.05, glassA);
        hgt = lerp(hgt, 0.06, glassA);                      // النافذة غائرة
        ao = lerp(ao, 0.70 + skyRefl * 0.22, glassA);

        // الإطار المعدني/الخشبي
        const fr = curtain ? 0.34 : 0.50;
        r = lerp(r, fr, inW * frame); g = lerp(g, fr, inW * frame); b = lerp(b, fr * 0.98, inW * frame);
        rough = lerp(rough, curtain ? 0.30 : 0.52, inW * frame);
        hgt = lerp(hgt, 0.42, inW * frame);

        // ترانسوم/مولين فوق الزجاج
        const bar = Math.max(transom, mullion) * glassA;
        r = lerp(r, fr * 0.95, bar); g = lerp(g, fr * 0.95, bar); b = lerp(b, fr * 0.93, bar);
        hgt = lerp(hgt, 0.40, bar);
        rough = lerp(rough, 0.38, bar);
      }

      // ---------- العتبة (سِل) للنوافذ المثقوبة ----------
      if (!curtain) {
        const sillBand = smoothstep(H0 - 0.055, H0 - 0.020, cv) * smoothstep(H0 + 0.005, H0 - 0.010, cv);
        const inSillX = smoothstep(W0 - 0.035, W0 - 0.010, cu) * smoothstep(W1 + 0.035, W1 + 0.010, cu);
        const sill = sillBand * inSillX;
        if (sill > 0) {
          const sc = 0.56;
          r = lerp(r, sc, sill); g = lerp(g, sc, sill); b = lerp(b, sc * 0.97, sill);
          hgt = lerp(hgt, 1.0, sill);
          rough = lerp(rough, 0.66, sill);
        }
        // أثر مياه تحت العتبة
        const streakBelow = smoothstep(H0 - 0.06, H0 - 0.30, cv) * inSillX * dirtRun * 0.22;
        r *= (1 - streakBelow); g *= (1 - streakBelow); b *= (1 - streakBelow * 0.9);
        ao = clamp(ao - streakBelow * 0.35, 0, 1);
      }

      // انسداد محيطي حول الفتحة
      const nearW = smoothstep(0.045, 0.0, Math.min(
        Math.min(Math.abs(cu - W0), Math.abs(cu - W1)),
        Math.min(Math.abs(cv - H0), Math.abs(cv - H1))
      )) * (1 - inW);
      ao = clamp(ao - nearW * 0.30, 0, 1);

      return [r, g, b, hgt, rough, ao];
    }, { normalStrength: 1.7 });
  }

  /** قناع إضاءة النوافذ ليلًا: يضيء داخل الفتحة فقط، بنمط غرف عشوائي ودفء متغيّر */
  windowLight(seed = 161, { cols = 8, rows = 8, lit = 0.55, style = 'punched' } = {}) {
    const key = 'winlight' + seed + cols + rows + lit + style;
    if (this.cache.has(key)) return this.cache.get(key);
    const size = Math.min(this.size, 512);
    const img = new ImageData(size, size);
    const d = img.data;
    const rnd = mulberry32(this.seed + seed);
    const n = new Noise(this.seed + seed + 5);
    const curtain = style === 'curtain';
    const W0 = curtain ? 0.055 : 0.215, W1 = curtain ? 0.945 : 0.785;
    const H0 = curtain ? 0.255 : 0.235, H1 = curtain ? 0.955 : 0.815;
    const st = new Float32Array(cols * rows), warm = new Float32Array(cols * rows), blind = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      st[i] = rnd() < lit ? (0.45 + rnd() * 0.55) : 0;
      warm[i] = rnd(); blind[i] = rnd();
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ci = Math.min(cols - 1, Math.floor(u * cols));
      const ri = Math.min(rows - 1, Math.floor(v * rows));
      const cu = (u * cols) % 1, cv = 1 - ((v * rows) % 1);
      const inW = smoothstep(W0 + 0.01, W0 + 0.035, cu) * smoothstep(W1 - 0.01, W1 - 0.035, cu)
                * smoothstep(H0 + 0.01, H0 + 0.035, cv) * smoothstep(H1 - 0.01, H1 - 0.035, cv);
      const i2 = ri * cols + ci;
      let s0 = st[i2] * inW;
      // تفاوت داخل الغرفة: السقف أفتح + بقعة ضوء
      const grad = 0.55 + 0.75 * smoothstep(H0, H1, cv);
      const flick = 0.85 + 0.3 * (n.fbm(u * 40, v * 40, 2) * 0.5 + 0.5);
      if (blind[i2] > 0.72) s0 *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(cv * 70));
      const wm = warm[i2];
      const i3 = (y * size + x) * 4;
      const val = clamp(s0 * grad * flick, 0, 1);
      d[i3] = val * 255;
      d[i3 + 1] = clamp(val * (0.74 + wm * 0.20), 0, 1) * 255;
      d[i3 + 2] = clamp(val * (0.44 + wm * 0.34), 0, 1) * 255;
      d[i3 + 3] = 255;
    }
    const tex = this._fromImageData(img, size, size, { srgb: true });
    this.cache.set(key, tex);
    return tex;
  }

  dispose() {
    for (const v of this.cache.values()) {
      if (v?.isTexture) v.dispose();
      else for (const t of Object.values(v)) t?.isTexture && t.dispose();
    }
    this.cache.clear();
  }
}
