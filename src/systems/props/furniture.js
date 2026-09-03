/** أثاث الشارع: مقاعد، سلال، إشارات، صناديق، أسوار، مواقف حافلات، صخور. */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const box = (w, h, d, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g;
};
const cyl = (r, h, x = 0, y = 0, z = 0, seg = 8) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y + h / 2, z); return g;
};
const M = (parts) => { const g = BGU.mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); return g; };

export function bench() {
  return M([
    box(1.85, 0.08, 0.42, 0, 0.44, 0), box(1.85, 0.36, 0.07, 0, 0.52, -0.19),
    box(0.09, 0.44, 0.44, -0.8, 0, 0), box(0.09, 0.44, 0.44, 0.8, 0, 0),
  ]);
}
export function bin() {
  return M([cyl(0.28, 0.85, 0, 0, 0, 10), cyl(0.30, 0.06, 0, 0.85, 0, 10)]);
}
export function hydrant() {
  return M([cyl(0.13, 0.62, 0, 0, 0, 8), cyl(0.09, 0.14, 0, 0.62, 0, 8), box(0.34, 0.10, 0.12, 0, 0.36, 0)]);
}
export function busStop() {
  return M([
    box(3.4, 0.10, 1.5, 0, 2.55, 0),
    box(0.10, 2.55, 0.10, -1.6, 0, -0.65), box(0.10, 2.55, 0.10, 1.6, 0, -0.65),
    box(3.4, 2.0, 0.06, 0, 0.35, -0.72),
    box(2.6, 0.08, 0.4, 0, 0.44, -0.4), box(0.08, 0.44, 0.4, -1.2, 0, -0.4), box(0.08, 0.44, 0.4, 1.2, 0, -0.4),
  ]);
}
export function trafficLight() {
  return M([
    cyl(0.09, 5.2, 0, 0, 0, 7),
    (() => { const g = cyl(0.07, 2.6, 0, 0, 0, 6); g.rotateZ(Math.PI / 2); g.translate(1.3, 5.1, 0); return g; })(),
    box(0.30, 0.85, 0.26, 2.5, 4.6, 0),
  ]);
}
export function trafficLightLamps() {
  return M([box(0.16, 0.16, 0.06, 2.5, 5.24, 0.14), box(0.16, 0.16, 0.06, 2.5, 5.0, 0.14), box(0.16, 0.16, 0.06, 2.5, 4.76, 0.14)]);
}
export function signPost() {
  return M([cyl(0.055, 2.4, 0, 0, 0, 6), box(0.62, 0.44, 0.04, 0, 1.95, 0)]);
}
export function fenceSection() {
  const parts = [box(2.4, 0.06, 0.05, 0, 1.06, 0), box(2.4, 0.06, 0.05, 0, 0.52, 0)];
  for (let i = 0; i <= 6; i++) parts.push(box(0.045, 1.15, 0.045, -1.2 + i * 0.4, 0, 0));
  parts.push(box(0.09, 1.25, 0.09, -1.2, 0, 0), box(0.09, 1.25, 0.09, 1.2, 0, 0));
  return M(parts);
}
export function rock(rng) {
  const g = new THREE.IcosahedronGeometry(rng.range(0.5, 1.5), 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rng.range(0.7, 1.3), p.getY(i) * rng.range(0.45, 0.9), p.getZ(i) * rng.range(0.7, 1.3));
  }
  g.computeVertexNormals();
  g.translate(0, 0.2, 0);
  return g;
}
export function planter() {
  return M([box(1.5, 0.55, 1.5, 0, 0, 0), box(1.3, 0.1, 1.3, 0, 0.5, 0)]);
}
export function billboard() {
  return M([cyl(0.14, 5.0, -1.6, 0, 0, 6), cyl(0.14, 5.0, 1.6, 0, 0, 6), box(7.2, 3.2, 0.18, 0, 4.6, 0)]);
}
