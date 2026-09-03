/** نماذج نباتات إجرائية: أشجار عريضة، صنوبر، نخيل، شجيرات. */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function leafCards(rng, { count = 7, r = 3.0, yBase = 3.4, yTop = 6.6, tilt = 0.5 }) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const rr = r * rng.range(0.72, 1.06);
    const y = rng.range(yBase, yTop);
    const s = rr * rng.range(1.5, 2.1);
    const g = new THREE.PlaneGeometry(s, s * rng.range(0.78, 1.05));
    g.rotateX(rng.range(-tilt, tilt));
    g.rotateY(a);
    g.translate(Math.cos(a) * rr * 0.32, y, Math.sin(a) * rr * 0.32);
    parts.push(g);
  }
  // بطاقة أفقية علوية لملء الفراغ من الأعلى
  const top = new THREE.PlaneGeometry(r * 2.4, r * 2.4);
  top.rotateX(-Math.PI / 2);
  top.translate(0, yTop * 0.96, 0);
  parts.push(top);
  const g = BGU.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

function trunk(rng, { h = 4.2, r0 = 0.26, r1 = 0.16, bend = 0.1 }) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 2, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + h / 2;
    pos.setX(i, pos.getX(i) + Math.sin(y * 0.4) * bend * y * 0.1);
  }
  g.translate(0, h / 2, 0);
  // أغصان
  const parts = [g];
  const n = Math.floor(rng.range(2, 4));
  for (let i = 0; i < n; i++) {
    const b = new THREE.CylinderGeometry(0.05, 0.12, h * 0.55, 5);
    const a = rng.range(0, Math.PI * 2);
    b.rotateZ(rng.range(0.5, 0.95));
    b.rotateY(a);
    b.translate(0, h * 0.75, 0);
    parts.push(b);
  }
  const m = BGU.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return m;
}

/** يعيد {trunkGeo, leafGeo, height} */
export function makeTree(kind, rng) {
  if (kind === 'conifer') {
    const h = rng.range(7, 13);
    const t = trunk(rng, { h: h * 0.55, r0: 0.28, r1: 0.14, bend: 0.03 });
    const parts = [];
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const f = i / (layers - 1);
      const rr = (1 - f) * rng.range(1.5, 2.3) + 0.35;
      const y = h * 0.28 + f * h * 0.66;
      const c = new THREE.ConeGeometry(rr, h * 0.30, 8, 1, true);
      c.translate(0, y, 0);
      parts.push(c);
    }
    const leaf = BGU.mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return { trunkGeo: t, leafGeo: leaf, height: h, needle: true };
  }
  if (kind === 'palm') {
    const h = rng.range(8, 13);
    const t = trunk(rng, { h, r0: 0.30, r1: 0.19, bend: 0.5 });
    const parts = [];
    const fronds = 9;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2;
      const g = new THREE.PlaneGeometry(rng.range(3.4, 4.6), 0.95);
      g.rotateZ(rng.range(-0.45, -0.12));
      g.rotateY(a);
      g.translate(Math.cos(a) * 1.9, h - 0.15, Math.sin(a) * 1.9);
      parts.push(g);
    }
    const leaf = BGU.mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return { trunkGeo: t, leafGeo: leaf, height: h };
  }
  if (kind === 'bush') {
    const leaf = leafCards(rng, { count: 4, r: 1.0, yBase: 0.5, yTop: 1.25, tilt: 0.7 });
    return { trunkGeo: null, leafGeo: leaf, height: 1.5 };
  }
  // عريضة الأوراق
  const h = rng.range(6.5, 12);
  const t = trunk(rng, { h: h * 0.5, r0: rng.range(0.24, 0.36), r1: 0.16, bend: 0.18 });
  const leaf = leafCards(rng, {
    count: rng.int(6, 9), r: h * rng.range(0.26, 0.34),
    yBase: h * 0.42, yTop: h * 0.86, tilt: 0.55,
  });
  return { trunkGeo: t, leafGeo: leaf, height: h };
}
