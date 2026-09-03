/**
 * وحدة مدينة العرض: تبني مدينة ساحلية حتمية كاملة —
 * طريق سريع، جادات، شبكة وسط المدينة، ضواحٍ منحنية، منطقة صناعية، حدائق، واجهة بحرية.
 */
import { ZONE, ROAD } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

export default {
  name: 'democity',
  deps: ['terrain', 'roads', 'zoning', 'buildings', 'props', 'traffic'],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x9001);
    this.api = {
      build: (opts) => this.build(opts),
      rebuild: () => this.build({ force: true }),
      built: () => !!this._built,
    };
    if (ctx.app.showcase) return;      // في وضع الاستعراض لا نبني المدينة كاملة
    await this.build();
  },

  /** يقسّم مسارًا إلى أجزاء فوق اليابسة فقط */
  _landRuns(pts, minLen = 40) {
    const ctx = this.ctx;
    const T = ctx.module('terrain')?.api;
    const wl = ctx.world.waterLevel;
    const runs = [];
    let cur = [];
    for (const p of pts) {
      const ok = ctx.world.inBounds(p.x, p.z) && T && T.heightAt(p.x, p.z) > wl + 1.2 && T.slopeAt(p.x, p.z, 10) < 0.58;
      if (ok) cur.push(p);
      else { if (cur.length > 1) runs.push(cur); cur = []; }
    }
    if (cur.length > 1) runs.push(cur);
    return runs.filter((r) => {
      let L = 0;
      for (let i = 1; i < r.length; i++) L += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
      return L > minLen;
    });
  },

  _addLine(a, b, type, samples = 24) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      pts.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
    }
    const roads = this.ctx.module('roads');
    let n = 0;
    for (const run of this._landRuns(pts)) n += roads.api.addRoad(run, type).length;
    return n;
  },

  _addCurve(fn, type, samples = 60) {
    const pts = [];
    for (let i = 0; i <= samples; i++) pts.push(fn(i / samples));
    const roads = this.ctx.module('roads');
    let n = 0;
    for (const run of this._landRuns(pts)) n += roads.api.addRoad(run, type).length;
    return n;
  },

  async build({ force = false } = {}) {
    const ctx = this.ctx;
    if (this._built && !force) return;
    const t0 = performance.now();
    const roads = ctx.module('roads');
    const terrain = ctx.module('terrain');
    const zoning = ctx.module('zoning');
    const buildings = ctx.module('buildings');
    const props = ctx.module('props');
    const traffic = ctx.module('traffic');
    const sim = ctx.module('simulation');
    if (!roads?.api || !terrain?.api) { ctx.log.warn('[democity] missing deps'); return; }

    const rng = this.rng.fork(1);
    const timings = {};
    const mark = (k, t) => { timings[k] = Math.round(performance.now() - t); };

    // ---------- 1) الشبكة ----------
    let tt = performance.now();
    // طريق سريع منحنٍ من الشمال الغربي إلى الجنوب الغربي
    this._addCurve((t) => ({
      x: lerp(-880, -180, t) + Math.sin(t * 3.1) * 120,
      z: lerp(-820, 780, t) + Math.cos(t * 2.2) * 90,
    }), 3, 70);

    // جادات رئيسية (شبكة رئيسية دوّارة قليلًا)
    const A = 360;
    for (let i = -1; i <= 1; i++) {
      this._addCurve((t) => ({
        x: lerp(-780, 700, t),
        z: i * A + Math.sin(t * 2.4 + i) * 42,
      }), 2, 60);
      this._addCurve((t) => ({
        x: i * A + Math.cos(t * 2.1 + i * 1.3) * 38,
        z: lerp(-800, 700, t),
      }), 2, 60);
    }

    // شبكة وسط المدينة الكثيفة (تدور قليلًا لكسر الانتظام)
    const rot = 0.13, cs = Math.cos(rot), sn = Math.sin(rot);
    const R = (x, z) => ({ x: x * cs - z * sn, z: x * sn + z * cs });
    const D = 88;
    for (let i = -8; i <= 8; i++) {
      const a = R(-8 * D, i * D), b = R(8 * D, i * D);
      this._addLine(a, b, i % 4 === 0 ? 2 : 1, 40);
    }
    for (let i = -8; i <= 8; i++) {
      const a = R(i * D, -8 * D), b = R(i * D, 8 * D);
      this._addLine(a, b, i % 4 === 0 ? 2 : 1, 40);
    }

    // ضواحٍ منحنية شرق وشمال
    for (let k = 0; k < 8; k++) {
      const r = 800 + k * 74;
      this._addCurve((t) => {
        const a = lerp(-0.75, 1.55, t);
        return { x: Math.cos(a) * r + 60, z: Math.sin(a) * r + 40 + Math.sin(t * 5) * 22 };
      }, 1, 60);
    }
    for (let k = 0; k < 12; k++) {
      const a = lerp(-0.7, 1.5, k / 11);
      this._addCurve((t) => ({
        x: Math.cos(a) * lerp(740, 1180, t) + 60 + Math.sin(t * 4 + k) * 20,
        z: Math.sin(a) * lerp(740, 1180, t) + 40,
      }), 0, 40);
    }

    // المنطقة الصناعية (شمال غرب، قرب الطريق السريع)
    for (let i = 0; i < 7; i++) this._addLine({ x: -980, z: -720 + i * 96 }, { x: -520, z: -720 + i * 96 }, 1, 26);
    for (let i = 0; i < 6; i++) this._addLine({ x: -960 + i * 92, z: -760 }, { x: -960 + i * 92, z: -180 }, 1, 26);

    // كورنيش الواجهة البحرية (يتبع خط الساحل تقريبيًا)
    this._addCurve((t) => ({
      x: lerp(-120, 620, t),
      z: lerp(430, -140, t) + Math.sin(t * 4.2) * 46,
    }), 2, 60);

    mark('roads', tt);

    // ---------- 2) التضاريس والهندسة ----------
    tt = performance.now();
    terrain.api.rebuild();
    roads.api.rebuild();
    mark('rebuild', tt);

    // ---------- 3) المناطق ----------
    tt = performance.now();
    if (zoning?.api) {
      // مكاتب في القلب
      // 1) سكني على كل المساحة المبنية أولًا
      zoning.api.paintCircle(40, 20, 1180, ZONE.RESIDENTIAL);
      // 2) تجاري حول القلب وعلى الواجهة البحرية
      zoning.api.paintCircle(-20, -20, 470, ZONE.COMMERCIAL);
      zoning.api.paintCircle(330, 180, 190, ZONE.COMMERCIAL);
      // 3) مكاتب في القلب (وسط الأعمال)
      zoning.api.paintCircle(-20, -20, 265, ZONE.OFFICE);
      // 4) صناعي شمال غرب
      zoning.api.paintRect(-1000, -800, -480, -150, ZONE.INDUSTRIAL);
      // 5) حدائق
      zoning.api.paintCircle(255, -280, 105, ZONE.PARK);
      zoning.api.paintCircle(-420, 300, 95, ZONE.PARK);
      zoning.api.paintCircle(560, 420, 115, ZONE.PARK);
      zoning.api.paintCircle(-620, -60, 90, ZONE.PARK);
      sim?.api.setDensityFromBuildings();
      zoning.api.generateLots();
    }
    mark('zoning', tt);

    // ---------- 4) المباني والدعائم والمرور ----------
    tt = performance.now();
    buildings?.api.buildAll();
    mark('buildings', tt);

    tt = performance.now();
    props?.api.scatterAll({ treeDensity: 1 });
    mark('props', tt);

    tt = performance.now();
    traffic?.api.setDensity(1);
    mark('traffic', tt);

    sim?.api.recompute();
    ctx.cameraRig.setPreset('overview');

    this._built = true;
    this.timings = timings;
    this.totalMs = Math.round(performance.now() - t0);
    ctx.log.info(`[democity] built in ${this.totalMs}ms`, JSON.stringify(timings));
    ctx.bus.emit('democity:built', { ms: this.totalMs, timings });
    ctx.bus.emit('ui:notify', { text: `مدينة العرض جاهزة (${ctx.world.buildings.length} مبنى)` });
  },

  showcase(ctx) {
    return this.build({ force: true }).then(() => ctx.cameraRig.setPreset('downtown'));
  },

  stats() {
    const w = this.ctx.world;
    return {
      built: !!this._built, totalMs: this.totalMs, timings: this.timings,
      roads: w.roads.edges.size, lots: w.lots.length, buildings: w.buildings.length,
    };
  },

  dispose() {},
};
