/** ثوابت العالم + سُلَّم الجودة + كشف المنصّة. */
export const WORLD = Object.freeze({
  seed: 20260903,
  size: 2048,       // متر
  cell: 8,          // متر/خلية
  dim: 256,         // خلية/ضلع
  hdim: 257,        // عُقد حقل الارتفاع
  chunk: 128,       // متر لكل قطاع تضاريس
  waterLevel: 0.0,  // منسوب البحر بالمتر
});

export const QUALITY = {
  low: {
    name: 'low', pixelRatio: 1.0, shadowMap: 1024, shadowDistance: 320,
    ssao: false, bloom: true, smaa: false, dof: false, grain: false,
    treeDist: 320, propDist: 220, carCount: 90, pedCount: 60,
    buildingLodBias: 1.35, waterReflect: false, clouds: 'flat', anisotropy: 2, texSize: 256,
  },
  medium: {
    name: 'medium', pixelRatio: 1.0, shadowMap: 2048, shadowDistance: 480,
    ssao: false, bloom: true, smaa: true, dof: false, grain: true,
    treeDist: 520, propDist: 360, carCount: 180, pedCount: 120,
    buildingLodBias: 1.0, waterReflect: false, clouds: 'billboard', anisotropy: 4, texSize: 512,
  },
  high: {
    name: 'high', pixelRatio: 1.0, shadowMap: 3072, shadowDistance: 700,
    // SSAO مُعطَّل في هذا المستوى: يضاعف رسم المشهد مقابل فائدة بصرية ضئيلة (مقيسة)
    ssao: false, bloom: true, smaa: true, dof: true, grain: true,
    treeDist: 780, propDist: 520, carCount: 280, pedCount: 200,
    buildingLodBias: 0.8, waterReflect: true, clouds: 'billboard', anisotropy: 8, texSize: 512,
  },
  ultra: {
    name: 'ultra', pixelRatio: 1.25, shadowMap: 4096, shadowDistance: 900,
    ssao: true, bloom: true, smaa: true, dof: true, grain: true,
    treeDist: 1100, propDist: 700, carCount: 380, pedCount: 280,
    buildingLodBias: 0.65, waterReflect: true, clouds: 'billboard', anisotropy: 16, texSize: 1024,
  },
};

export function detectPlatform() {
  const ua = (globalThis.navigator?.userAgent || '').toLowerCase();
  const isAndroid = /android/.test(ua);
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMobile = isAndroid || isIOS || /mobile/.test(ua);
  const isCapacitor = !!globalThis.Capacitor;
  const cores = globalThis.navigator?.hardwareConcurrency || 4;
  const mem = globalThis.navigator?.deviceMemory || 4;
  const headless = /headlesschrome/.test(ua) || new URLSearchParams(globalThis.location?.search || '').has('shot');
  return { isAndroid, isIOS, isMobile, isCapacitor, cores, mem, headless, ua };
}

export function autoQuality(plat) {
  const q = new URLSearchParams(globalThis.location?.search || '').get('quality');
  if (q && QUALITY[q]) return q;
  if (plat.isMobile || plat.isCapacitor) return (plat.cores >= 8 && plat.mem >= 6) ? 'medium' : 'low';
  if (plat.headless) return 'high';         // اللقطات: نُقيّم الجودة البصرية القصوى (الأداء يُقاس على العتاد لا هنا)
  if (plat.cores >= 8 && plat.mem >= 8) return 'high';
  return 'medium';
}

export const ZONE = Object.freeze({
  NONE: 0, RESIDENTIAL: 1, COMMERCIAL: 2, INDUSTRIAL: 3, OFFICE: 4, PARK: 5,
});
export const ZONE_NAMES_AR = ['فارغ', 'سكني', 'تجاري', 'صناعي', 'مكاتب', 'حديقة'];
export const ZONE_COLORS = [0x000000, 0x37c26a, 0x3aa0e6, 0xe0b52c, 0x9a6de0, 0x2f9e5c];

export const ROAD = Object.freeze({
  ALLEY:   { id: 0, name: 'زقاق',        width: 8,  lanes: 2, speed: 8,  sidewalk: 1.6, lamps: 26 },
  STREET:  { id: 1, name: 'شارع',        width: 12, lanes: 2, speed: 12, sidewalk: 2.4, lamps: 30 },
  AVENUE:  { id: 2, name: 'جادة',        width: 18, lanes: 4, speed: 16, sidewalk: 3.0, lamps: 34 },
  HIGHWAY: { id: 3, name: 'طريق سريع',   width: 24, lanes: 6, speed: 26, sidewalk: 0.0, lamps: 44 },
});
export const ROAD_BY_ID = [ROAD.ALLEY, ROAD.STREET, ROAD.AVENUE, ROAD.HIGHWAY];
