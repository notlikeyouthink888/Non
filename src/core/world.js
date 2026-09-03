/** نموذج البيانات العالمي — المصدر الوحيد للحقيقة. الوحدات تقرأ منه، والكاتب واحد لكل حقل. */
import { WORLD, ZONE } from './config.js';
import { clamp } from './math.js';

export function createWorld(seed = WORLD.seed) {
  const { size, cell, dim, hdim } = WORLD;
  const height = new Float32Array(hdim * hdim);
  const world = {
    seed, size, cell, dim, hdim,
    half: size / 2,
    waterLevel: WORLD.waterLevel,

    terrain: {
      height,
      ready: false,
      /** إحداثيات عالمية (متر، مركز العالم 0,0) ⇒ ارتفاع بالاستيفاء الثنائي الخطي */
      sampleHeight(x, z) {
        const fx = clamp((x + size / 2) / cell, 0, hdim - 1.001);
        const fz = clamp((z + size / 2) / cell, 0, hdim - 1.001);
        const x0 = fx | 0, z0 = fz | 0, tx = fx - x0, tz = fz - z0;
        const i = z0 * hdim + x0;
        const h00 = height[i], h10 = height[i + 1], h01 = height[i + hdim], h11 = height[i + hdim + 1];
        return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
      },
      normalAt(x, z, e = 2) {
        const hL = world.terrain.sampleHeight(x - e, z), hR = world.terrain.sampleHeight(x + e, z);
        const hD = world.terrain.sampleHeight(x, z - e), hU = world.terrain.sampleHeight(x, z + e);
        const nx = (hL - hR), ny = 2 * e, nz = (hD - hU);
        const l = Math.hypot(nx, ny, nz) || 1;
        return { x: nx / l, y: ny / l, z: nz / l };
      },
      slopeAt(x, z, e = 2) { return 1 - world.terrain.normalAt(x, z, e).y; },
      isWater(x, z) { return world.terrain.sampleHeight(x, z) < world.waterLevel; },
    },

    roads: {
      nodes: new Map(),        // id -> {id,x,z,y,edges:Set}
      edges: new Map(),        // id -> {id,a,b,type,width,lanes,path:[{x,z,y}],length}
      version: 0,
      nextNode: 1, nextEdge: 1,
      /** بحث مكاني بسيط عبر شبكة تجزئة */
      grid: new Map(),
      list() { return [...this.edges.values()]; },
    },

    zones: new Uint8Array(dim * dim),
    zoneLevel: new Uint8Array(dim * dim),
    density: new Uint8Array(dim * dim),
    landValue: new Float32Array(dim * dim),
    occupied: new Uint8Array(dim * dim),   // خلايا مشغولة بمبنى/طريق

    lots: [],
    buildings: [],
    agents: { cars: [], peds: [] },

    stats: {
      population: 0, jobs: 0, happiness: 0.72, funds: 250000,
      tick: 0, demandR: 0.8, demandC: 0.5, demandI: 0.45,
    },

    timeOfDay: 15.0,
    weather: { cloudiness: 0.35, humidity: 0.5, windDir: 0.7, windSpeed: 3.2 },

    /* --- مساعدات الشبكة --- */
    cellIndex(x, z) {
      const cx = clamp(Math.floor((x + size / 2) / cell), 0, dim - 1);
      const cz = clamp(Math.floor((z + size / 2) / cell), 0, dim - 1);
      return cz * dim + cx;
    },
    cellCoord(x, z) {
      return {
        cx: clamp(Math.floor((x + size / 2) / cell), 0, dim - 1),
        cz: clamp(Math.floor((z + size / 2) / cell), 0, dim - 1),
      };
    },
    cellCenter(cx, cz) { return { x: (cx + 0.5) * cell - size / 2, z: (cz + 0.5) * cell - size / 2 }; },
    inBounds(x, z) { return x > -size / 2 && x < size / 2 && z > -size / 2 && z < size / 2; },
    zoneAt(x, z) { return this.zones[this.cellIndex(x, z)]; },
  };
  return world;
}

export { ZONE };
