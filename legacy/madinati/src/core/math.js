export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const mix = lerp;
export const saturate = (v) => clamp(v, 0, 1);
export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;
export const TAU = Math.PI * 2;

/** استيفاء Catmull-Rom لنقاط {x,z} */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

/** تنعيم متعدد النقاط إلى مسار كثيف */
export function smoothPolyline(pts, samplesPerSeg = 8) {
  if (pts.length < 2) return pts.slice();
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    for (let s = 0; s < samplesPerSeg; s++) out.push(catmullRom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], s / samplesPerSeg));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}

/** أقرب نقطة على قطعة مستقيمة */
export function closestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return { x: ax + t * dx, z: az + t * dz, t, d: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)) };
}

export function segIntersect(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, z: a.z + t * r.z, t, u };
}

/** متوسط متحرك أُسّي */
export class EMA {
  constructor(alpha = 0.1, init = 0) { this.a = alpha; this.v = init; this.n = 0; }
  push(x) { this.n++; this.v = this.n === 1 ? x : this.v + this.a * (x - this.v); return this.v; }
}
