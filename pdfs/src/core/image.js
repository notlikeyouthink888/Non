/**
 * معالجة الصور: الاستيراد، والتدوير والقلب والقص والفلاتر — كلها غير مُتلِفة:
 * الصورة الأصلية تبقى كما هي، والتعديلات أرقام تُطبَّق عند الرسم.
 *
 * ترتيب التطبيق: تدوير ← قلب أفقي (كما يراه المستخدم) ← قص ← فلتر ← سطوع/تباين.
 * مستطيل القص نسبي (0..1) داخل الصورة بعد التدوير والقلب.
 */

const SOURCE_MAX = 3200;

export const FILTERS = [
  { id: 'none', label: 'الأصل' },
  { id: 'scan', label: 'مستند' },
  { id: 'bw', label: 'أبيض وأسود' },
  { id: 'gray', label: 'رمادي' },
  { id: 'vivid', label: 'زاهٍ' },
];

export const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

export function newPageEdits() {
  return { rotation: 0, flipH: false, crop: { ...FULL_CROP }, filter: 'none', brightness: 0, contrast: 0 };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export const toBlob = (c, type = 'image/jpeg', q = 0.9) =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('تعذّر ترميز الصورة'))), type, q));

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* نجرّب img */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** يحوّل ملف صورة إلى JPEG مصغّر بحدّ أقصى معقول ويعيد أبعاده. */
export async function importImage(file) {
  const bmp = await decode(file);
  const w0 = bmp.width, h0 = bmp.height;
  if (!w0 || !h0) throw new Error('صورة فارغة');
  const k = Math.min(1, SOURCE_MAX / Math.max(w0, h0));
  const c = canvas(w0 * k, h0 * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await toBlob(c, 'image/jpeg', 0.92);
  return { blob, w: c.width, h: c.height };
}

// ذاكرة مؤقّتة صغيرة للصور المفكوكة حسب المفتاح
const bitmapCache = new Map();
export async function sourceBitmap(key, blob) {
  if (bitmapCache.has(key)) {
    const v = bitmapCache.get(key);
    bitmapCache.delete(key);
    bitmapCache.set(key, v);
    return v;
  }
  const bmp = await decode(blob);
  bitmapCache.set(key, bmp);
  while (bitmapCache.size > 6) {
    const [k, v] = bitmapCache.entries().next().value;
    v.close?.();
    bitmapCache.delete(k);
  }
  return bmp;
}

/** أبعاد الصورة بعد التدوير. */
export function rotatedSize(w, h, rotation) {
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

/** تدوير مرئي بمقدار 90° (dir = 1 يمينًا، -1 يسارًا) مع تحويل مستطيل القص. */
export function rotateEdits(e, dir) {
  const c = e.crop;
  const crop = dir > 0
    ? { x: 1 - (c.y + c.h), y: c.x, w: c.h, h: c.w }
    : { x: c.y, y: 1 - (c.x + c.w), w: c.h, h: c.w };
  // القلب مطبّق بعد التدوير، فالتدوير المرئي يعكس اتجاهه حين تكون الصورة مقلوبة
  const step = e.flipH ? -dir : dir;
  return { ...e, rotation: (e.rotation + step * 90 + 360) % 360, crop };
}

export function flipEdits(e) {
  const c = e.crop;
  return { ...e, flipH: !e.flipH, crop: { ...c, x: 1 - c.x - c.w } };
}

/**
 * يرسم الصفحة بتعديلاتها.
 * @param {ImageBitmap|HTMLImageElement} bmp
 * @param {object} e التعديلات
 * @param {{maxDim?: number, crop?: boolean, filters?: boolean}} o
 */
export function renderEdits(bmp, e, { maxDim = 1600, crop = true, filters = true } = {}) {
  const W = bmp.width, H = bmp.height;
  const R = rotatedSize(W, H, e.rotation);
  const c0 = crop ? e.crop : FULL_CROP;
  const cx = c0.x * R.w, cy = c0.y * R.h;
  const cw = Math.max(1, c0.w * R.w), ch = Math.max(1, c0.h * R.h);
  const s = Math.min(1, maxDim / Math.max(cw, ch));

  const out = canvas(cw * s, ch * s);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(out.width / cw, out.height / ch);
  ctx.translate(-cx, -cy);
  ctx.translate(R.w / 2, R.h / 2);
  if (e.flipH) ctx.scale(-1, 1);
  ctx.rotate((e.rotation * Math.PI) / 180);
  ctx.drawImage(bmp, -W / 2, -H / 2, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (filters && (e.filter !== 'none' || e.brightness || e.contrast)) applyFilters(out, e);
  return out;
}

/* ───────── الفلاتر ───────── */

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** تقدير خلفية الورقة: تصغير ثم «تمديد» (max) لإزالة الحروف ثم تنعيم. */
function paperBackground(src) {
  const k = Math.max(src.width, src.height) / 96;
  const sw = Math.max(4, Math.round(src.width / k)), sh = Math.max(4, Math.round(src.height / k));
  const small = canvas(sw, sh);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  let a = new Float32Array(sw * sh * 3);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) {
    a[j] = img.data[i]; a[j + 1] = img.data[i + 1]; a[j + 2] = img.data[i + 2];
  }
  const pass = (fn) => {
    const b = new Float32Array(a.length);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        for (let ch = 0; ch < 3; ch++) {
          let acc = 0, cnt = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(sh - 1, Math.max(0, y + dy));
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(sw - 1, Math.max(0, x + dx));
              const v = a[(yy * sw + xx) * 3 + ch];
              if (fn === 'max') { if (v > acc) acc = v; } else { acc += v; cnt++; }
            }
          }
          b[(y * sw + x) * 3 + ch] = fn === 'max' ? acc : acc / cnt;
        }
      }
    }
    a = b;
  };
  pass('max'); pass('max'); pass('avg'); pass('avg');
  for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) {
    img.data[i] = a[j]; img.data[i + 1] = a[j + 1]; img.data[i + 2] = a[j + 2];
  }
  sctx.putImageData(img, 0, 0);
  const big = canvas(src.width, src.height);
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, src.width, src.height);
  return bctx.getImageData(0, 0, src.width, src.height).data;
}

function applyFilters(c, e) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const f = e.filter;

  let bg = null;
  if (f === 'scan' || f === 'bw') bg = paperBackground(c);

  // منحنى سطوع/تباين واحد يُحسب مسبقًا
  const br = (e.brightness || 0) * 1.28;
  const ct = (e.contrast || 0) * 1.28;
  const cf = (259 * (ct + 255)) / (255 * (259 - ct));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = clamp(cf * (v + br - 128) + 128);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (f === 'gray') {
      r = g = b = 0.299 * r + 0.587 * g + 0.114 * b;
    } else if (f === 'scan') {
      // قسمة على الخلفية: ورق أبيض متساوٍ مع حفظ الألوان، ثم شدّ بسيط
      r = (r / Math.max(1, bg[i])) * 255;
      g = (g / Math.max(1, bg[i + 1])) * 255;
      b = (b / Math.max(1, bg[i + 2])) * 255;
      r = 1.25 * (r - 255) + 255; g = 1.25 * (g - 255) + 255; b = 1.25 * (b - 255) + 255;
    } else if (f === 'bw') {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const blum = 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2];
      const n = (lum / Math.max(1, blum)) * 255;
      // عتبة ناعمة حول 200 بحيث يصبح الورق أبيض والحبر أسود
      r = g = b = 255 / (1 + Math.exp(-(n - 200) / 9));
    } else if (f === 'vivid') {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * 1.45; g = l + (g - l) * 1.45; b = l + (b - l) * 1.45;
      r = 1.12 * (r - 128) + 128; g = 1.12 * (g - 128) + 128; b = 1.12 * (b - 128) + 128;
    }
    d[i] = lut[clamp(r) | 0]; d[i + 1] = lut[clamp(g) | 0]; d[i + 2] = lut[clamp(b) | 0];
  }
  ctx.putImageData(img, 0, 0);
}
