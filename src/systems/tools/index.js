/**
 * وحدة الأدوات: تفاعل المؤشر/اللمس مع العالم — رسم الطرق، فرشاة المناطق، الهدم، التعمير.
 * تُعطّل تحريك الكاميرا بالزر الأيسر أثناء البناء وتعيد تفعيله بعده.
 */
import * as THREE from 'three';
import { ZONE, ZONE_NAMES_AR, ROAD_BY_ID } from '../../core/config.js';
import { clamp } from '../../core/math.js';

export default {
  name: 'tools',
  deps: ['terrain', 'roads', 'zoning'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.tool = 'none';
    this.roadType = 1;
    this.zone = ZONE.RESIDENTIAL;
    this.points = [];
    this.dragStart = null;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.group = new THREE.Group(); this.group.name = 'toolPreview';
    ctx.scene.add(this.group);

    // معاينة الطريق
    this.previewMat = new THREE.MeshBasicMaterial({ color: 0x57b6ff, transparent: true, opacity: 0.45, depthWrite: false });
    this.previewBadMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.42, depthWrite: false });
    this.preview = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), this.previewMat);
    this.preview.visible = false;
    this.preview.renderOrder = 20;
    this.group.add(this.preview);

    // معاينة مستطيل المناطق
    this.zonePreview = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      color: 0x37c26a, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    this.zonePreview.rotation.x = -Math.PI / 2;
    this.zonePreview.visible = false;
    this.zonePreview.renderOrder = 21;
    this.group.add(this.zonePreview);

    const dom = ctx.renderer.domElement;
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.cancel(); });

    ctx.bus.on('tool:selected', ({ tool, roadType, zone }) => {
      this.tool = tool;
      if (roadType !== undefined) this.roadType = roadType;
      if (zone) this.zone = zone;
      this.cancel();
      ctx.cameraRig.blockPrimary = (tool !== 'none');
    });

    this.api = {
      select: (t) => { this.tool = t; ctx.cameraRig.blockPrimary = t !== 'none'; },
      cancel: () => this.cancel(),
      current: () => this.tool,
    };
  },

  _pick(e) {
    const ctx = this.ctx;
    const r = ctx.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, ctx.camera);
    const terrain = ctx.module('terrain');
    if (!terrain?.api) return null;
    const p = terrain.api.pickGround(this.ray);
    if (p) return p;
    // احتياط: تقاطع مع مستوى الماء
    const t = -this.ray.ray.origin.y / (this.ray.ray.direction.y || -1e-6);
    if (t > 0) return this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, t);
    return null;
  },

  _down(e) {
    if (this.tool === 'none' || e.button !== 0) return;
    const p = this._pick(e);
    if (!p) return;
    this._moved = 0;
    if (this.tool === 'zone') { this.dragStart = p.clone(); this.zonePreview.visible = true; }
  },

  _move(e) {
    if (this.tool === 'none') { this.preview.visible = false; this.zonePreview.visible = false; return; }
    const p = this._pick(e);
    if (!p) return;
    this.cursor = p;
    if (this.tool === 'road' && this.points.length) {
      this._updateRoadPreview(this.points[this.points.length - 1], p);
    } else if (this.tool === 'zone' && this.dragStart) {
      const a = this.dragStart, b = p;
      const w = Math.abs(b.x - a.x) || 1, d = Math.abs(b.z - a.z) || 1;
      this.zonePreview.scale.set(w, d, 1);
      const terrain = this.ctx.module('terrain');
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      this.zonePreview.position.set(cx, (terrain?.api.heightAt(cx, cz) || 0) + 0.6, cz);
      this.zonePreview.material.color.setHex([0, 0x37c26a, 0x3aa0e6, 0xe0b52c, 0x9a6de0, 0x2f9e5c][this.zone] || 0xffffff);
    }
  },

  _updateRoadPreview(a, b) {
    const t = ROAD_BY_ID[this.roadType];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1) { this.preview.visible = false; return; }
    const terrain = this.ctx.module('terrain');
    this.preview.visible = true;
    this.preview.scale.set(t.width, 0.5, len);
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    this.preview.position.set(cx, (terrain?.api.heightAt(cx, cz) || 0) + 0.4, cz);
    this.preview.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
    const ok = len > 12 && len < 900;
    this.preview.material = ok ? this.previewMat : this.previewBadMat;
  },

  _up(e) {
    if (this.tool === 'none' || e.button !== 0) return;
    const p = this._pick(e);
    if (!p) return;
    const ctx = this.ctx;

    if (this.tool === 'road') {
      if (!this.points.length) { this.points.push(p.clone()); ctx.module('ui')?.api.setHint('انقر لإنهاء الطريق (Esc للإلغاء)'); return; }
      const a = this.points[0], b = p;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 12) { this.cancel(); return; }
      const roads = ctx.module('roads');
      const ids = roads.api.addRoad([{ x: a.x, z: a.z }, { x: b.x, z: b.z }], this.roadType);
      ctx.module('terrain')?.api.rebuild();
      roads.api.rebuild();
      this._afterBuild();
      ctx.bus.emit('ui:notify', { text: `تم بناء ${ids.length} مقطع طريق`, kind: 'ok' });
      this.cancel();
    }

    else if (this.tool === 'zone' && this.dragStart) {
      const a = this.dragStart, b = p;
      const zoning = ctx.module('zoning');
      const n = zoning.api.paintRect(a.x, a.z, b.x, b.z, this.zone);
      this.dragStart = null; this.zonePreview.visible = false;
      if (zoning.overlayVisible) zoning.api.showOverlay(true);
      ctx.bus.emit('ui:notify', { text: `تم تزويد ${n} خلية (${ZONE_NAMES_AR[this.zone]})` });
    }

    else if (this.tool === 'bulldoze') {
      const roads = ctx.module('roads');
      const near = roads?.api.nearestEdge(p.x, p.z, 22);
      if (near && near.dist < near.edge.width / 2 + 3) {
        roads.api.removeEdge(near.edge.id);
        roads.api.rebuild();
        ctx.bus.emit('ui:notify', { text: 'أُزيل مقطع طريق' });
      } else {
        // أزل تزويد الخلايا حول النقطة
        const zoning = ctx.module('zoning');
        zoning?.api.paintCircle(p.x, p.z, 14, ZONE.NONE);
        if (zoning?.overlayVisible) zoning.api.showOverlay(true);
        ctx.bus.emit('ui:notify', { text: 'أُزيل التزويد' });
      }
    }

    else if (this.tool === 'build') {
      this._afterBuild();
      ctx.bus.emit('ui:notify', { text: 'أُعيد تعمير المدينة' });
    }
    ctx.module('audio')?.api.click('build');
  },

  /** يعيد اشتقاق القطع وبناء المباني والدعائم والمرور */
  _afterBuild() {
    const ctx = this.ctx;
    ctx.module('zoning')?.api.generateLots();
    ctx.module('simulation')?.api.setDensityFromBuildings();
    ctx.module('buildings')?.api.buildAll();
    ctx.module('props')?.api.scatterAll();
    ctx.module('traffic')?.api.setDensity(1);
    ctx.module('simulation')?.api.recompute();
  },

  cancel() {
    this.points.length = 0;
    this.dragStart = null;
    this.preview.visible = false;
    this.zonePreview.visible = false;
  },

  showcase(ctx) {
    ctx.bus.emit('tool:selected', { tool: 'road', roadType: 1 });
    ctx.cameraRig.setPreset('street');
  },

  stats() { return { tool: this.tool, roadType: this.roadType, zone: this.zone }; },

  dispose() {
    const dom = this.ctx.renderer.domElement;
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('pointermove', this._onMove);
    dom.removeEventListener('pointerup', this._onUp);
    this.group?.removeFromParent();
  },
};
