/**
 * كاميرا بانِي المدن: هدف أرضي + مسافة + دوران + ميل.
 * تدعم الفأرة ولوحة المفاتيح واللمس (سحب/قرص/تدوير) — مصمّمة للأندرويد أولًا.
 */
import * as THREE from 'three';
import { clamp, lerp, TAU } from './math.js';

const PRESETS = {
  overview:  { x: -140, z: -140, dist: 720, yaw: 0.72, pitch: 0.60, fov: 42 },
  downtown:  { x: -60,  z: -70,  dist: 300, yaw: 2.35, pitch: 0.44, fov: 40 },
  street:    { x: -175, z: -245, dist: 130, yaw: 2.05, pitch: 0.30, fov: 46 },
  aerial:    { x: -200, z: -200, dist: 1150,yaw: 0.45, pitch: 1.02, fov: 38 },
  waterfront:{ x: -30,  z: 30,   dist: 320, yaw: 0.60, pitch: 0.26, fov: 44 },
  suburb:    { x: -640, z: -520, dist: 250, yaw: 0.95, pitch: 0.36, fov: 44 },
  closeup:   { x: -145, z: -195, dist: 95,  yaw: 0.85, pitch: 0.26, fov: 50 },
  skyline:   { x: -60,  z: -40,  dist: 470, yaw: 0.95, pitch: 0.17, fov: 38 },
  industrial:{ x: -740, z: -430, dist: 330, yaw: 1.60, pitch: 0.34, fov: 42 },
  park:      { x: -300, z: 60,   dist: 180, yaw: 0.30, pitch: 0.30, fov: 46 },
};

export class CameraRig {
  constructor(camera, dom, world) {
    this.cam = camera; this.dom = dom; this.world = world;
    this.target = new THREE.Vector3(0, 0, 0);
    this.dist = 620; this.yaw = 0.72; this.pitch = 0.62;
    this.tDist = this.dist; this.tYaw = this.yaw; this.tPitch = this.pitch;
    this.tTarget = this.target.clone();
    this.minDist = 18; this.maxDist = 1400;
    this.minPitch = 0.08; this.maxPitch = 1.45;
    this.blockPrimary = false;   // تضبطها أدوات البناء
    this.enabled = true;
    this.keys = new Set();
    this._ptrs = new Map();
    this._pinch = null;
    this._bind();
    this.apply(0, true);
  }

  setPreset(name) {
    const p = PRESETS[name] || PRESETS.overview;
    this.tTarget.set(p.x, 0, p.z);
    this.target.copy(this.tTarget);
    this.tDist = this.dist = p.dist;
    this.tYaw = this.yaw = p.yaw;
    this.tPitch = this.pitch = p.pitch;
    if (p.fov) { this.cam.fov = p.fov; this.cam.updateProjectionMatrix(); }
    this.apply(0, true);
    return p;
  }
  static presetNames() { return Object.keys(PRESETS); }

  _groundY(x, z) {
    const t = this.world?.terrain;
    return t?.ready ? Math.max(t.sampleHeight(x, z), this.world.waterLevel) : 0;
  }

  _bind() {
    const d = this.dom;
    d.style.touchAction = 'none';
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      d.setPointerCapture?.(e.pointerId);
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType, moved: 0 });
      if (this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cy: (a.y + b.y) / 2 };
      }
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this._ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const cy = (a.y + b.y) / 2;
        if (this._pinch) {
          const k = this._pinch.d / Math.max(1, dist);
          this.tDist = clamp(this.tDist * Math.pow(k, 0.9), this.minDist, this.maxDist);
          let da = ang - this._pinch.ang;
          if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
          this.tYaw -= da * 1.0;
          this.tPitch = clamp(this.tPitch + (cy - this._pinch.cy) * 0.004, this.minPitch, this.maxPitch);
        }
        this._pinch = { d: dist, ang, cy };
        return;
      }
      const rotating = (p.button === 2 || p.button === 1 || this.keys.has('Shift') || (this.blockPrimary && p.type === 'mouse' && p.button === 0 && false));
      if (rotating) {
        this.tYaw -= dx * 0.005;
        this.tPitch = clamp(this.tPitch + dy * 0.005, this.minPitch, this.maxPitch);
      } else if (p.button === 0 && !this.blockPrimary) {
        this._pan(dx, dy);
      }
    });
    const up = (e) => {
      this._ptrs.delete(e.pointerId);
      if (this._ptrs.size < 2) this._pinch = null;
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('pointerleave', up);
    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = Math.exp(clamp(e.deltaY, -220, 220) * 0.0016);
      this.tDist = clamp(this.tDist * k, this.minDist, this.maxDist);
    }, { passive: false });
    window.addEventListener('keydown', (e) => { this.keys.add(e.key); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key); });
  }

  _pan(dx, dy) {
    const s = this.dist * 0.0016;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // اتجاه يمين الكاميرا وأمامها مسقطان على المستوى الأفقي
    this.tTarget.x -= (dx * cy - dy * sy) * s;
    this.tTarget.z -= (dx * sy + dy * cy) * s;
    this._clampTarget();
  }

  _clampTarget() {
    const h = (this.world?.size || 2048) / 2 - 40;
    this.tTarget.x = clamp(this.tTarget.x, -h, h);
    this.tTarget.z = clamp(this.tTarget.z, -h, h);
  }

  update(dt) {
    // لوحة المفاتيح
    const k = this.keys;
    const spd = this.dist * 0.9 * dt;
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('W') || k.has('ArrowUp')) fz -= 1;
    if (k.has('s') || k.has('S') || k.has('ArrowDown')) fz += 1;
    if (k.has('a') || k.has('A') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('d') || k.has('D') || k.has('ArrowRight')) fx += 1;
    if (fx || fz) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      this.tTarget.x += (fx * cy - fz * sy) * spd;
      this.tTarget.z += (fx * sy + fz * cy) * spd;
      this._clampTarget();
    }
    if (k.has('q') || k.has('Q')) this.tYaw += dt * 1.1;
    if (k.has('e') || k.has('E')) this.tYaw -= dt * 1.1;
    this.apply(dt);
  }

  apply(dt, instant = false) {
    const a = instant ? 1 : 1 - Math.pow(0.0009, Math.max(dt, 1e-4));
    this.target.lerp(this.tTarget, a);
    this.dist = lerp(this.dist, this.tDist, a);
    this.yaw = lerp(this.yaw, this.tYaw, a);
    this.pitch = lerp(this.pitch, this.tPitch, a);
    const gy = this._groundY(this.target.x, this.target.z);
    this.target.y = lerp(this.target.y, gy, instant ? 1 : Math.min(1, dt * 4));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const px = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    const pz = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    const py = this.target.y + sp * this.dist;
    const minY = this._groundY(px, pz) + 6;
    this.cam.position.set(px, Math.max(py, minY), pz);
    this.cam.lookAt(this.target);
    this.cam.near = Math.max(0.5, this.dist * 0.01);
    this.cam.far = 9000;
    this.cam.updateProjectionMatrix();
  }

  /** إطار يشمل صندوقًا محدَّدًا */
  frame(box, pad = 1.3) {
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    this.tTarget.set(c.x, 0, c.z);
    this.tDist = clamp(Math.max(s.x, s.z, s.y) * pad, this.minDist, this.maxDist);
    this.apply(0, true);
  }

  state() {
    return { x: +this.target.x.toFixed(1), z: +this.target.z.toFixed(1), dist: +this.dist.toFixed(1), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), fov: this.cam.fov };
  }
}
