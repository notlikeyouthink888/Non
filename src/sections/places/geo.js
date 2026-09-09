/** حسابات جغرافية — تعمل كلها محليًا دون أي خدمة خارجية. */

const R = 6371000; // نصف قطر الأرض بالمتر
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** المسافة بين نقطتين بالمتر (هافرساين). */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** الاتجاه من a إلى b بالدرجات (0 = شمال). */
export function bearing(a, b) {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
    - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];

export function compass(deg2) {
  return COMPASS[Math.round(((deg2 % 360) / 45)) % 8];
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} م`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} كم`;
  return `${Math.round(meters / 1000)} كم`;
}

/** وقت المشي التقريبي (5 كم/س) والسيارة (35 كم/س داخل المدينة). */
export function travelHints(meters) {
  const walkMin = (meters / 1000) / 5 * 60;
  const driveMin = (meters / 1000) / 35 * 60;
  return {
    walk: walkMin < 90 ? `${Math.round(walkMin)} د مشيًا` : null,
    drive: `${Math.max(1, Math.round(driveMin))} د بالسيارة`,
  };
}

export function formatCoord(lat, lng) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'ش', 'ج')} ، ${f(lng, 'ق', 'غ')}`;
}

/** يقرأ إحداثيات من نص يلصقه المستخدم: "33.31, 44.36" أو رابط خرائط. */
export function parseCoords(text) {
  if (!text) return null;
  const m = String(text).match(/(-?\d{1,2}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/* ── إسقاط ويب-مركاتور (للخريطة) ── */

export const TILE = 256;

export function lngToX(lng, z) { return ((lng + 180) / 360) * TILE * 2 ** z; }

export function latToY(lat, z) {
  const s = Math.sin(rad(Math.max(-85.05, Math.min(85.05, lat))));
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

export function xToLng(x, z) { return (x / (TILE * 2 ** z)) * 360 - 180; }

export function yToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return deg(Math.atan(Math.sinh(n)));
}

/** متر لكل بكسل عند خط عرض وتكبير معيّنين. */
export function metersPerPixel(lat, z) {
  return (156543.03392 * Math.cos(rad(lat))) / 2 ** z;
}
