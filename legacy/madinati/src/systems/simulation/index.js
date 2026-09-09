/**
 * وحدة المحاكاة: سكان، وظائف، طلب RCI، كثافة، ميزانية، سعادة.
 * تنبض كل 250ms (tick) وتحدّث world.stats و world.density.
 */
import { ZONE } from '../../core/config.js';
import { clamp, lerp, smoothstep } from '../../core/math.js';

const CAP = { [ZONE.RESIDENTIAL]: 3.4, [ZONE.COMMERCIAL]: 2.1, [ZONE.INDUSTRIAL]: 2.6, [ZONE.OFFICE]: 3.0 };

export default {
  name: 'simulation',
  deps: [],
  api: {},

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork(0x6001);
    const s = ctx.world.stats;
    s.population = 0; s.jobs = 0; s.happiness = 0.72; s.funds = 250000;
    s.demandR = 0.85; s.demandC = 0.55; s.demandI = 0.5;
    s.income = 0; s.expenses = 0; s.tick = 0;
    this.history = { population: [], happiness: [], funds: [] };

    this.api = {
      stats: () => ctx.world.stats,
      history: () => this.history,
      recompute: () => this.recompute(),
      setDensityFromBuildings: () => this.updateDensity(),
    };
    ctx.bus.on('buildings:spawned', () => this.recompute());
    ctx.bus.on('lots:created', () => this.updateDensity());
  },

  /** كثافة تعتمد على قيمة الأرض والقرب من المركز — تقود ارتفاع المباني */
  updateDensity() {
    const { world } = this.ctx;
    const dim = world.dim;
    for (let i = 0; i < world.density.length; i++) {
      const cz = (i / dim) | 0, cx = i % dim;
      const c = world.cellCenter(cx, cz);
      const dist = Math.hypot(c.x, c.z) / (world.size * 0.5);
      const core = smoothstep(0.42, 0.03, dist);
      const v = world.landValue[i];
      world.density[i] = clamp(Math.round((core * 0.72 + v * 0.42) * 255), 0, 255);
    }
  },

  /** إعادة حساب السكان/الوظائف من المباني القائمة */
  recompute() {
    const { world } = this.ctx;
    let pop = 0, jobs = 0;
    for (const b of world.buildings) {
      const floors = Math.max(1, b.floors);
      const area = 220 * floors;                 // م² تقريبية لكل مبنى
      if (b.zone === ZONE.RESIDENTIAL) pop += Math.round(area / 42 * CAP[ZONE.RESIDENTIAL] * 0.28);
      else if (b.zone === ZONE.COMMERCIAL) jobs += Math.round(area / 34 * 0.42);
      else if (b.zone === ZONE.OFFICE) jobs += Math.round(area / 22 * 0.5);
      else if (b.zone === ZONE.INDUSTRIAL) jobs += Math.round(area / 46 * 0.9);
    }
    world.stats.population = pop;
    world.stats.jobs = jobs;
    this.ctx.bus.emit('sim:recomputed', { population: pop, jobs });
  },

  tick(ctx) {
    const s = ctx.world.stats;
    s.tick++;
    const pop = s.population, jobs = s.jobs;

    // طلب RCI
    const jobRatio = pop > 0 ? clamp(jobs / Math.max(pop * 0.52, 1), 0, 2) : 1;
    s.demandR = clamp(lerp(s.demandR, clamp(jobRatio * 0.75, 0.05, 1), 0.02), 0, 1);
    s.demandC = clamp(lerp(s.demandC, clamp(1.15 - jobRatio * 0.55, 0.05, 1), 0.02), 0, 1);
    s.demandI = clamp(lerp(s.demandI, clamp(1.05 - jobRatio * 0.45, 0.05, 1), 0.02), 0, 1);

    // اقتصاد
    const taxPerCap = 1.35, upkeepPerBuilding = 0.9;
    s.income = pop * taxPerCap;
    s.expenses = ctx.world.buildings.length * upkeepPerBuilding + ctx.world.roads.edges.size * 1.2;
    s.funds += (s.income - s.expenses) * 0.25;

    // سعادة
    const employment = pop > 0 ? clamp(jobs / (pop * 0.52 || 1), 0, 1.3) : 1;
    const target = clamp(0.42 + employment * 0.28 + (s.funds > 0 ? 0.12 : -0.25) + (ctx.world.lots.length ? 0.08 : 0), 0, 1);
    s.happiness = lerp(s.happiness, target, 0.03);

    if (s.tick % 8 === 0) {
      this.history.population.push(pop);
      this.history.happiness.push(+s.happiness.toFixed(3));
      this.history.funds.push(Math.round(s.funds));
      for (const k of Object.keys(this.history)) if (this.history[k].length > 240) this.history[k].shift();
      ctx.bus.emit('sim:tick', { stats: s });
    }
  },

  showcase(ctx) { ctx.cameraRig.setPreset('overview'); },

  stats() {
    const s = this.ctx.world.stats;
    return {
      population: s.population, jobs: s.jobs, happiness: +s.happiness.toFixed(2),
      funds: Math.round(s.funds), demand: [+s.demandR.toFixed(2), +s.demandC.toFixed(2), +s.demandI.toFixed(2)],
    };
  },

  dispose() {},
};
