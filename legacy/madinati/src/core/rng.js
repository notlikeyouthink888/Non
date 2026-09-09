/** عشوائية حتمية: mulberry32 + ضوضاء قيمة/Perlin/Worley مُهيّأة. ممنوع Math.random في المشروع. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.seed = seed >>> 0; this._r = mulberry32(this.seed); }
  fork(salt) { return new RNG((this.seed ^ Math.imul(salt >>> 0 || 1, 0x9E3779B1)) >>> 0); }
  next() { return this._r(); }
  range(a, b) { return a + (b - a) * this._r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  bool(p = 0.5) { return this._r() < p; }
  pick(arr) { return arr[Math.floor(this._r() * arr.length) % arr.length]; }
  /** اختيار مرجّح: weights بنفس طول arr */
  weighted(arr, weights) {
    let total = 0; for (const w of weights) total += w;
    let r = this._r() * total;
    for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  }
  gauss(mean = 0, dev = 1) {
    const u = Math.max(1e-9, this._r()), v = this._r();
    return mean + dev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this._r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

/* ---------------- ضوضاء ---------------- */
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

export class Noise {
  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    this.permMod8 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.permMod8[i] = this.perm[i] % 8; }
  }
  /** simplex 2D في المدى [-1,1] */
  s2(xin, yin) {
    const perm = this.perm, permMod8 = this.permMod8;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD2[permMod8[ii + perm[jj]]]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD2[permMod8[ii + i1 + perm[jj + j1]]]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD2[permMod8[ii + 1 + perm[jj + 1]]]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2);
  }
  /** ضوضاء كسورية */
  fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += a * this.s2(x * f, y * f); norm += a; a *= gain; f *= lacunarity; }
    return sum / norm;
  }
  /** ضوضاء تلال حادة (ridged) للجبال */
  ridged(x, y, octaves = 5) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.s2(x * f, y * f));
      sum += a * n * n; norm += a; a *= 0.5; f *= 2.0;
    }
    return sum / norm;
  }
  /** billow ناعم */
  billow(x, y, octaves = 4) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += a * Math.abs(this.s2(x * f, y * f)); norm += a; a *= 0.5; f *= 2; }
    return sum / norm;
  }
}

/** خلايا Worley — تُستعمل لأنسجة الحصى والخرسانة والأوراق */
export function worley(x, y, seed = 1, jitter = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let best = 8, second = 8;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy;
    const h = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ (seed * 83492791));
    const px = cx + h() * jitter, py = cy + h() * jitter;
    const d = Math.hypot(px - x, py - y);
    if (d < best) { second = best; best = d; } else if (d < second) second = d;
  }
  return { f1: best, f2: second, edge: second - best };
}
