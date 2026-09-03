/** بناء أشرطة هندسية على طول مسار (طرق، أرصفة، أرصفة جانبية). */
import * as THREE from 'three';

/**
 * @param {Array<{x,z,y}>} path نقاط المسار
 * @param {number} inner المسافة الداخلية من المحور (متر)
 * @param {number} outer المسافة الخارجية
 * @param {object} o خيارات: yOff ارتفاع، uv0/uv1 مدى U، vScale متر لكل تبليطة
 */
export function ribbon(path, inner, outer, { yOff = 0, u0 = 0, u1 = 1, vScale = 12, side = 0 } = {}) {
  const n = path.length;
  if (n < 2) return null;
  const pos = [], uv = [], nor = [], idx = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const pPrev = path[Math.max(0, i - 1)], pNext = path[Math.min(n - 1, i + 1)];
    let dx = pNext.x - pPrev.x, dz = pNext.z - pPrev.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;              // يمين المسار
    if (i > 0) dist += Math.hypot(p.x - pPrev.x, p.z - pPrev.z);
    const s = side === 0 ? 1 : side;      // 1 يمين، -1 يسار
    const aX = p.x + nx * inner * s, aZ = p.z + nz * inner * s;
    const bX = p.x + nx * outer * s, bZ = p.z + nz * outer * s;
    pos.push(aX, p.y + yOff, aZ, bX, p.y + yOff, bZ);
    nor.push(0, 1, 0, 0, 1, 0);
    const v = dist / vScale;
    uv.push(u0, v, u1, v);
  }
  // اتجاه اللفّ يعتمد على إشارة (outer - inner) وإلا انقلبت الأوجه للجانب الآخر
  const flip = (outer - inner) < 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** جدار رأسي (حافة رصيف) على طول المسار */
export function curbWall(path, offset, height, { vScale = 4, side = 1 } = {}) {
  const n = path.length;
  if (n < 2) return null;
  const pos = [], uv = [], nor = [], idx = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const pPrev = path[Math.max(0, i - 1)], pNext = path[Math.min(n - 1, i + 1)];
    let dx = pNext.x - pPrev.x, dz = pNext.z - pPrev.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz * side, nz = dx * side;
    if (i > 0) dist += Math.hypot(p.x - pPrev.x, p.z - pPrev.z);
    const X = p.x + nx * offset, Z = p.z + nz * offset;
    pos.push(X, p.y, Z, X, p.y + height, Z);
    nor.push(nx, 0, nz, nx, 0, nz);
    uv.push(dist / vScale, 0, dist / vScale, 1);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** قرص تقاطع أفقي */
export function disc(cx, cy, cz, r, segs = 16, uvScale = 0.08) {
  const pos = [cx, cy, cz], nor = [0, 1, 0], uv = [0.5, 0.5], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    pos.push(x, cy, z); nor.push(0, 1, 0);
    uv.push(0.5 + Math.cos(a) * r * uvScale, 0.5 + Math.sin(a) * r * uvScale);
    if (i > 0) idx.push(0, i, i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** مستطيل أفقي موجّه (للمعابر واللافتات الأرضية) */
export function quadOriented(cx, cy, cz, dirX, dirZ, len, wid) {
  const nx = -dirZ, nz = dirX;
  const hx = dirX * len / 2, hz = dirZ * len / 2;
  const wx = nx * wid / 2, wz = nz * wid / 2;
  const p = [
    cx - hx - wx, cy, cz - hz - wz,
    cx + hx - wx, cy, cz + hz - wz,
    cx - hx + wx, cy, cz - hz + wz,
    cx + hx + wx, cy, cz + hz + wz,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}
