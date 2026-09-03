/** توليد حقل الارتفاعات: ساحل + سهل بنائي + تلال + جبال بعيدة + وادي نهر. */
import { Noise } from '../../core/rng.js';
import { clamp, smoothstep, lerp } from '../../core/math.js';

export function generateHeightfield(world, seed) {
  const { hdim, size, cell } = world;
  const h = world.terrain.height;
  const base = new Noise(seed + 1);
  const ridge = new Noise(seed + 2);
  const warp = new Noise(seed + 3);
  const detail = new Noise(seed + 4);

  const half = size / 2;
  // اتجاه الساحل: البحر في الجنوب الشرقي
  const coastDir = { x: 0.55, z: 0.83 };

  for (let j = 0; j < hdim; j++) {
    const z = j * cell - half;
    for (let i = 0; i < hdim; i++) {
      const x = i * cell - half;
      const u = x / 1000, v = z / 1000;

      // تشويه المجال لكسر الانتظام
      const wx = warp.fbm(u * 0.6, v * 0.6, 3) * 180;
      const wz = warp.fbm(u * 0.6 + 5.1, v * 0.6 + 2.3, 3) * 180;
      const px = (x + wx) / 1000, pz = (z + wz) / 1000;

      // مسافة موقّعة عن خط الساحل (متر)
      const coast = (x * coastDir.x + z * coastDir.z)
        + base.fbm(px * 1.1, pz * 1.1, 4) * 260
        + base.fbm(px * 3.2, pz * 3.2, 3) * 70;
      const land = coast * -1;   // موجب = يابسة

      // ضفة ساحلية + منصّة بنائية: ترفع أرض المدينة ~6..16م فوق البحر
      // (بدونها كانت أرض وسط المدينة عند منسوب البحر تقريبًا فيغمرها الماء)
      const plateau = smoothstep(-30, 200, land) * 21 + smoothstep(-70, 70, land) * 7.5;

      // تلال متوسطة تبتعد عن الساحل
      const hills = (base.fbm(px * 1.9, pz * 1.9, 5) * 0.5 + 0.5) * smoothstep(120, 900, land) * 74;

      // جبال في الشمال الغربي
      const mtnMask = smoothstep(560, 1250, land);
      const mtn = ridge.ridged(px * 1.35, pz * 1.35, 6) * mtnMask * 240;

      // قاع البحر
      const seaDepth = -smoothstep(0, 700, -land) * 46 - smoothstep(300, 1400, -land) * 60;

      // وادي نهري يقطع من الشمال إلى البحر
      const riverPath = ridge.fbm(pz * 0.9, 0.31, 3) * 320;
      const dRiver = Math.abs(x - (riverPath - 120));
      const riverMask = smoothstep(150, 26, dRiver) * smoothstep(-120, 220, land);
      const river = -riverMask * (14 + hills * 0.35 + mtn * 0.18);

      let hh = plateau + hills + mtn + Math.min(0, seaDepth) + river;

      // تفاصيل دقيقة
      hh += detail.fbm(px * 9.5, pz * 9.5, 4) * lerp(1.2, 9.0, smoothstep(0, 200, Math.abs(hh)));

      // شاطئ لطيف حول منسوب الماء (تنعيم خفيف فقط حتى لا يُلغي الضفة)
      const beach = smoothstep(7, 0, Math.abs(hh));
      hh = lerp(hh, hh * 0.55, beach * 0.35);

      // حافة العالم تهبط تدريجيًا لتجنّب الحواف المسطحة
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      hh = lerp(hh, hh + (base.fbm(px * 2.4 + 9, pz * 2.4, 3) * 40 + 30), smoothstep(0.86, 1.0, edge));

      h[j * hdim + i] = hh;
    }
  }

  // تنعيم خفيف مرّتين لإزالة الحدة العالية التردد
  smooth(h, hdim, 1);
  world.terrain.ready = true;
  return h;
}

function smooth(h, n, passes = 1) {
  const tmp = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      tmp[j * n + i] = (h[j * n + i] * 4 + h[j * n + i0] + h[j * n + i1] + h[j0 * n + i] + h[j1 * n + i]) / 8;
    }
    h.set(tmp);
  }
}

/** تسوية مستطيل إلى ارتفاع معيّن مع انحدار ناعم — تستعملها الطرق والمباني. */
export function flattenRect(world, cxWorld, czWorld, halfW, halfD, targetY, feather = 12) {
  const { hdim, cell, size } = world;
  const h = world.terrain.height;
  const half = size / 2;
  const i0 = clamp(Math.floor((cxWorld - halfW - feather + half) / cell), 0, hdim - 1);
  const i1 = clamp(Math.ceil((cxWorld + halfW + feather + half) / cell), 0, hdim - 1);
  const j0 = clamp(Math.floor((czWorld - halfD - feather + half) / cell), 0, hdim - 1);
  const j1 = clamp(Math.ceil((czWorld + halfD + feather + half) / cell), 0, hdim - 1);
  for (let j = j0; j <= j1; j++) {
    const z = j * cell - half;
    for (let i = i0; i <= i1; i++) {
      const x = i * cell - half;
      const dx = Math.max(0, Math.abs(x - cxWorld) - halfW);
      const dz = Math.max(0, Math.abs(z - czWorld) - halfD);
      const d = Math.hypot(dx, dz);
      const w = 1 - smoothstep(0, feather, d);
      if (w <= 0) continue;
      const k = h[j * hdim + i];
      h[j * hdim + i] = lerp(k, targetY, w);
    }
  }
}
