/** مولّد نماذج المباني: يبني هندسة نموذج واحد بمجموعات مواد جاهزة للنسخ المُجمَّع. */
import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facadeBox, plainBox, gableRoof, parapet, railing, roofEquipment, awning, FLOOR_H } from './geometry.js';

/** يبني نموذجًا واحدًا. يعيد { geometry, slots:[..], w, d, h, floors, kind } */
export function buildPrototype(kind, rng, slotIndex) {
  const F = { facade: [], trim: [], glass: [], roof: [] };
  let w, d, floors, h;

  const addRoofSlab = (rw, rd, ry) => F.roof.push(plainBox(rw, 0.22, rd, 0, ry - 0.22, 0, 0.28));

  if (kind === 'res_low') {
    w = rng.range(9, 14); d = rng.range(8.5, 12); floors = rng.int(1, 2);
    h = floors * FLOOR_H;
    F.facade.push(facadeBox(w, h, d, { uOff: rng.int(0, 7) / 8, vOff: 0, capTop: false }));
    const roofH = rng.range(2.2, 3.4);
    F.roof.push(gableRoof(w, d, roofH, 0.5, h));
    // شرفة مدخل
    const pW = rng.range(2.4, 3.6);
    F.trim.push(plainBox(pW, 0.2, 1.4, rng.range(-w / 4, w / 4), 0, d / 2 + 0.7, 0.5));
    F.trim.push(plainBox(0.16, 2.6, 0.16, -pW / 2 + 0.2, 0, d / 2 + 1.3, 0.5));
    F.trim.push(plainBox(0.16, 2.6, 0.16, pW / 2 - 0.2, 0, d / 2 + 1.3, 0.5));
    F.trim.push(plainBox(pW + 0.4, 0.14, 1.6, rng.range(-0.1, 0.1), 2.6, d / 2 + 0.8, 0.5));
    if (rng.bool(0.55)) F.trim.push(plainBox(1.1, 1.6, 0.5, w / 2 - 1.2, h + roofH * 0.35, 0, 0.5)); // مدخنة
  }

  else if (kind === 'res_mid') {
    w = rng.range(14, 24); d = rng.range(12, 18); floors = rng.int(3, 6);
    h = floors * FLOOR_H;
    F.facade.push(facadeBox(w, h, d, { uOff: rng.int(0, 7) / 8, capTop: false }));
    addRoofSlab(w, d, h);
    F.trim.push(parapet(w + 0.3, d + 0.3, 0.95, 0.2, h));
    F.roof.push(roofEquipment(rng, w * 0.8, d * 0.8, h, false));
    // شرفات على الواجهة
    const balW = 2.8, per = Math.max(1, Math.floor(w / 5.2));
    for (let f = 1; f < floors; f++) {
      for (let i = 0; i < per; i++) {
        const bx = -w / 2 + (w / per) * (i + 0.5);
        const by = f * FLOOR_H;
        F.trim.push(plainBox(balW, 0.16, 1.25, bx, by, d / 2 + 0.62, 0.5));
        F.trim.push(railing(balW, 1.05, by + 0.16, bx, d / 2 + 1.24, 0, 5));
      }
    }
    // شريط قاعدة
    F.trim.push(plainBox(w + 0.24, 0.55, d + 0.24, 0, 0, 0, 0.4));
  }

  else if (kind === 'res_high') {
    w = rng.range(17, 25); d = rng.range(15, 22); floors = rng.int(8, 17);
    h = floors * FLOOR_H;
    const tierAt = Math.floor(floors * rng.range(0.62, 0.78));
    const hLow = tierAt * FLOOR_H, hHigh = h - hLow;
    const w2 = w * rng.range(0.72, 0.86), d2 = d * rng.range(0.74, 0.9);
    F.facade.push(facadeBox(w, hLow, d, { uOff: rng.int(0, 7) / 8, capTop: false }));
    F.facade.push(facadeBox(w2, hHigh, d2, { y0: hLow, uOff: rng.int(0, 7) / 8, capTop: false }));
    F.trim.push(parapet(w + 0.3, d + 0.3, 1.0, 0.22, hLow));
    F.trim.push(parapet(w2 + 0.3, d2 + 0.3, 1.0, 0.22, h));
    addRoofSlab(w, d, hLow); addRoofSlab(w2, d2, h);
    F.roof.push(roofEquipment(rng, w2 * 0.8, d2 * 0.8, h, true));
    const per = Math.max(2, Math.floor(w / 6.5));
    for (let f = 1; f < tierAt; f += 2) {
      for (let i = 0; i < per; i++) {
        const bx = -w / 2 + (w / per) * (i + 0.5);
        const by = f * FLOOR_H;
        F.trim.push(plainBox(3.0, 0.15, 1.3, bx, by, d / 2 + 0.65, 0.5));
        F.trim.push(railing(3.0, 1.05, by + 0.15, bx, d / 2 + 1.3, 0, 6));
      }
    }
    F.trim.push(plainBox(w + 0.3, 0.6, d + 0.3, 0, 0, 0, 0.4));
  }

  else if (kind === 'com_low') {
    w = rng.range(12, 20); d = rng.range(12, 18); floors = rng.int(1, 2);
    const gh = 4.4;
    h = gh + (floors - 1) * FLOOR_H;
    F.glass.push(plainBox(w - 0.7, gh - 0.5, d - 0.7, 0, 0.25, 0, 0.14));
    F.trim.push(plainBox(w, 0.28, d, 0, 0, 0, 0.35));
    F.trim.push(plainBox(w, 0.5, d, 0, gh - 0.5, 0, 0.35));
    if (floors > 1) F.facade.push(facadeBox(w, h - gh, d, { y0: gh, uOff: rng.int(0, 7) / 8, capTop: false }));
    addRoofSlab(w, d, h);
    F.trim.push(parapet(w + 0.3, d + 0.3, rng.range(1.0, 1.9), 0.24, h));
    F.trim.push(awning(w * 0.72, gh - 0.9, d / 2, 1.7));
    F.roof.push(roofEquipment(rng, w * 0.75, d * 0.75, h, false));
  }

  else if (kind === 'com_mid') {
    w = rng.range(16, 27); d = rng.range(14, 22); floors = rng.int(3, 6);
    const gh = 4.6;
    h = gh + (floors - 1) * FLOOR_H;
    F.glass.push(plainBox(w - 0.6, gh - 0.55, d - 0.6, 0, 0.3, 0, 0.14));
    F.trim.push(plainBox(w, 0.3, d, 0, 0, 0, 0.35));
    F.trim.push(plainBox(w + 0.35, 0.62, d + 0.35, 0, gh - 0.62, 0, 0.35));
    F.facade.push(facadeBox(w, h - gh, d, { y0: gh, uOff: rng.int(0, 7) / 8, capTop: false }));
    addRoofSlab(w, d, h);
    F.trim.push(parapet(w + 0.3, d + 0.3, 1.1, 0.22, h));
    F.trim.push(awning(w * 0.8, gh - 1.0, d / 2, 1.8));
    F.roof.push(roofEquipment(rng, w * 0.8, d * 0.8, h, false));
  }

  else if (kind === 'off_mid') {
    w = rng.range(20, 32); d = rng.range(17, 26); floors = rng.int(5, 10);
    h = floors * FLOOR_H;
    F.glass.push(facadeBox(w, h, d, { uOff: rng.int(0, 7) / 8, capTop: false }));
    // أعمدة عمودية للتفصيل
    const cols = Math.max(3, Math.round(w / 5));
    for (let i = 0; i <= cols; i++) {
      const x = -w / 2 + (w / cols) * i;
      F.trim.push(plainBox(0.30, h, 0.28, x, 0, d / 2 + 0.02, 0.4));
      F.trim.push(plainBox(0.30, h, 0.28, x, 0, -d / 2 - 0.02, 0.4));
    }
    F.trim.push(plainBox(w + 0.5, 0.7, d + 0.5, 0, 0, 0, 0.35));
    addRoofSlab(w, d, h);
    F.trim.push(parapet(w + 0.35, d + 0.35, 1.3, 0.26, h));
    F.roof.push(roofEquipment(rng, w * 0.8, d * 0.8, h, true));
  }

  else if (kind === 'off_high') {
    w = rng.range(21, 32); d = rng.range(19, 28); floors = rng.int(13, 30);
    h = floors * FLOOR_H;
    const t1 = Math.floor(floors * rng.range(0.45, 0.62));
    const t2 = Math.floor(floors * rng.range(0.76, 0.88));
    const h1 = t1 * FLOOR_H, h2 = t2 * FLOOR_H;
    const w2 = w * rng.range(0.80, 0.90), d2 = d * rng.range(0.82, 0.92);
    const w3 = w2 * rng.range(0.74, 0.86), d3 = d2 * rng.range(0.76, 0.88);
    F.glass.push(facadeBox(w, h1, d, { uOff: rng.int(0, 7) / 8, capTop: false }));
    F.glass.push(facadeBox(w2, h2 - h1, d2, { y0: h1, uOff: rng.int(0, 7) / 8, capTop: false }));
    F.glass.push(facadeBox(w3, h - h2, d3, { y0: h2, uOff: rng.int(0, 7) / 8, capTop: false }));
    F.trim.push(plainBox(w + 0.5, 0.9, d + 0.5, 0, h1 - 0.9, 0, 0.35));
    F.trim.push(plainBox(w2 + 0.45, 0.85, d2 + 0.45, 0, h2 - 0.85, 0, 0.35));
    F.trim.push(plainBox(w + 0.7, 5.2, d + 0.7, 0, 0, 0, 0.3));   // القاعدة/البهو
    F.glass.push(plainBox(w + 0.2, 4.4, d + 0.2, 0, 0.4, 0, 0.12));
    addRoofSlab(w3, d3, h);
    F.trim.push(parapet(w3 + 0.3, d3 + 0.3, 1.5, 0.26, h));
    // تاج
    F.trim.push(plainBox(w3 * 0.5, 2.4, d3 * 0.5, 0, h + 1.5, 0, 0.3));
    F.trim.push(plainBox(0.25, rng.range(8, 18), 0.25, 0, h + 3.9, 0, 0.3));
    F.roof.push(roofEquipment(rng, w3 * 0.7, d3 * 0.7, h, false));
  }

  else { // ind
    w = rng.range(30, 50); d = rng.range(26, 44); floors = 1;
    h = rng.range(8, 13);
    F.facade.push(facadeBox(w, h, d, { uOff: rng.int(0, 7) / 8, capTop: false }));
    addRoofSlab(w, d, h);
    F.trim.push(parapet(w + 0.3, d + 0.3, 0.7, 0.22, h));
    // مكتب ملحق
    const ow = rng.range(8, 13), od = rng.range(7, 10), oh = rng.range(4, 7);
    F.facade.push(facadeBox(ow, oh, od, { y0: 0, uOff: rng.int(0, 7) / 8, capTop: false }));
    F.facade[F.facade.length - 1].translate(-w / 2 + ow / 2, 0, d / 2 + od / 2);
    addRoofSlab(ow, od, oh);
    F.roof[F.roof.length - 1].translate(-w / 2 + ow / 2, 0, d / 2 + od / 2);
    // صوامع وأنابيب
    const nS = rng.int(0, 3);
    for (let i = 0; i < nS; i++) {
      const r = rng.range(1.6, 2.8), sh = rng.range(9, 16);
      const cyl = new THREE.CylinderGeometry(r, r, sh, 12, 1, false);
      cyl.translate(w / 2 - r - 1 - i * (r * 2.4), sh / 2, -d / 2 + r + 1.5);
      F.trim.push(cyl);
      const cone = new THREE.ConeGeometry(r * 1.05, r * 0.9, 12);
      cone.translate(w / 2 - r - 1 - i * (r * 2.4), sh + r * 0.45, -d / 2 + r + 1.5);
      F.trim.push(cone);
    }
    for (let i = 0; i < rng.int(1, 3); i++) {
      const st = new THREE.CylinderGeometry(0.45, 0.55, rng.range(12, 20), 10);
      const px = rng.range(-w / 3, w / 3);
      st.translate(px, h + 6, rng.range(-d / 3, d / 3));
      F.trim.push(st);
    }
    F.roof.push(roofEquipment(rng, w * 0.7, d * 0.7, h, false));
  }

  // دمج بمجموعات
  const order = ['facade', 'trim', 'glass', 'roof'];
  const lists = [], slots = [];
  for (const k of order) {
    const clean = F[k].filter(Boolean);
    if (!clean.length) continue;
    const g = BGU.mergeGeometries(clean, false);
    clean.forEach((x) => x.dispose());
    if (g) { lists.push(g); slots.push(k); }
  }
  if (!lists.length) return null;
  const geometry = BGU.mergeGeometries(lists, true);
  lists.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const bb = geometry.boundingBox;
  return { geometry, slots, w, d, h: bb.max.y, floors, kind };
}

export const KIND_BY_ZONE = {
  1: ['res_low', 'res_mid', 'res_high'],
  2: ['com_low', 'com_mid', 'com_mid'],
  3: ['ind', 'ind', 'ind'],
  4: ['off_mid', 'off_mid', 'off_high'],
};
