/**
 * زخارف الأغلفة الحديثة (مستوحاة من تصاميم أغلفة تقارير أنشأناها في Canva ثم أعدنا رسمها هنا):
 * أشكال عند حواف الصفحة فقط (أشرطة، أمواج، مثلثات، زوايا، شبكة لوحة هندسية) بلونَي الغلاف.
 * الشكل نفسه يُرسم SVG خلف الغلاف في التطبيق وPDF، وصورة PNG خلف النص في Word،
 * فيبقى الغلاف متطابقًا. ينعكس أفقيًا للتقارير العربية (من اليمين لليسار).
 */

export const PAGE_W = 794;
export const PAGE_H = 1123;

/** يمزج اللون مع الأبيض بنسبة k (1 = اللون نفسه). */
export function tint(hex, k) {
  const n = parseInt(String(hex || '#9a3412').replace('#', ''), 16);
  const mix = (v) => Math.round(v * k + 255 * (1 - k)).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** يغمّق اللون (k من 0 إلى 1). */
export function shade(hex, k) {
  const n = parseInt(String(hex || '#9a3412').replace('#', ''), 16);
  const mix = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

let seq = 0;

const DECOS = {
  // ملكي: مثلث وخط ذهبي في الزاوية العليا، وموجة بخط ذهبي في الأسفل
  royal: ({ c, a, t }) => `
    <path d="M794 0H548L794 246Z" fill="${c}"/>
    <path d="M794 300L494 0" fill="none" stroke="${a}" stroke-width="3"/>
    <path d="M0 0H124L0 124Z" fill="${t}"/>
    <path d="M0 1123V1002c150-58 300 40 452 6 128-29 230-80 342-70v185Z" fill="${c}"/>
    <path d="M0 984c150-58 300 40 452 6 128-29 230-80 342-70" fill="none" stroke="${a}" stroke-width="4"/>`,
  // شريط مزدوج: عمود ملوّن بطول الصفحة وخط ذهبي بجانبه، وربع دائرة باهتة في الأسفل
  stripe: ({ c, a, t }) => `
    <rect width="96" height="1123" fill="${c}"/>
    <rect x="106" width="7" height="1123" fill="${a}"/>
    <path d="M794 0H650L794 144Z" fill="${t}"/>
    <circle cx="794" cy="1123" r="240" fill="${t}"/>
    <circle cx="794" cy="1123" r="190" fill="none" stroke="${a}" stroke-width="2.5"/>`,
  // لوحة العنوان: شريط علوي رفيع بخط ذهبي، وموجة سفلية
  panel: ({ c, a }) => `
    <rect width="794" height="30" fill="${c}"/>
    <rect y="30" width="794" height="6" fill="${a}"/>
    <path d="M0 1123V1036c190-50 400 50 794-40v127Z" fill="${c}"/>
    <path d="M0 1016c190-50 400 50 794-40" fill="none" stroke="${a}" stroke-width="4"/>`,
  // عصري: مثلثات متداخلة في الزاوية العليا، ومثلثان صغيران في الزاوية السفلى المقابلة
  modern: ({ c, a, t }) => `
    <path d="M344 0h60L794 390v60Z" fill="${t}"/>
    <path d="M794 0H404L794 390Z" fill="${c}"/>
    <path d="M794 0H584L794 210Z" fill="${a}"/>
    <path d="M794 1123H566L794 895Z" fill="${c}"/>
    <path d="M794 1123H684L794 1013Z" fill="${a}"/>`,
  // أمواج: موجة ملوّنة في الأعلى وأخرى في الأسفل بخطوط ذهبية
  waves: ({ c, a }) => `
    <path d="M0 0H794V118C640 176 470 70 300 120 180 156 80 150 0 128Z" fill="${c}"/>
    <path d="M0 150C80 172 180 178 300 142 470 92 640 198 794 140" fill="none" stroke="${a}" stroke-width="4"/>
    <path d="M0 1123H794V1012C640 954 470 1060 300 1010 180 974 80 980 0 1002Z" fill="${c}"/>
    <path d="M0 980C80 958 180 952 300 988 470 1038 640 932 794 990" fill="none" stroke="${a}" stroke-width="4"/>`,
  // هندسي: مثلثان قطريان في زاويتين متقابلتين بحافة ذهبية
  geo: ({ c, a }) => `
    <path d="M0 0H300L0 180Z" fill="${c}"/>
    <path d="M300 0h46L0 208v-28Z" fill="${a}"/>
    <path d="M794 1123H464L794 925Z" fill="${c}"/>
    <path d="M464 1123h-46L794 897v28Z" fill="${a}"/>`,
  // لوحة هندسية: ورق مربعات خفيف وإطار مزدوج كلوحات الرسم الهندسي
  blueprint: ({ c, t2, u }) => `
    <defs>
      <pattern id="g${u}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="${c}" stroke-opacity=".11" stroke-width="1"/></pattern>
      <pattern id="G${u}" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="${c}" stroke-opacity=".22" stroke-width="1.4"/></pattern>
    </defs>
    <rect width="794" height="1123" fill="${t2}"/>
    <rect width="794" height="1123" fill="url(#g${u})"/>
    <rect width="794" height="1123" fill="url(#G${u})"/>
    <rect x="26" y="26" width="742" height="1071" fill="none" stroke="${c}" stroke-width="3.5"/>
    <rect x="36" y="36" width="722" height="1051" fill="none" stroke="${c}" stroke-width="1.2"/>`,
  // زوايا مزخرفة: زاوية مزدوجة بمعيّن ذهبي في كل ركن
  corners: ({ c, a }) => {
    const k = `<path d="M34 176V34H176" fill="none" stroke="${c}" stroke-width="7"/><path d="M56 136V56H136" fill="none" stroke="${a}" stroke-width="2.5"/><rect x="27" y="27" width="14" height="14" fill="${a}" transform="rotate(45 34 34)"/><circle cx="80" cy="80" r="5" fill="${c}"/>`;
    return `<g>${k}</g><g transform="translate(794 0) scale(-1 1)">${k}</g><g transform="translate(0 1123) scale(1 -1)">${k}</g><g transform="translate(794 1123) scale(-1 -1)">${k}</g>`;
  },
};

export const hasDeco = (style) => !!DECOS[style];

/** SVG الزخرفة بحجم صفحة A4 (794×1123)، أو '' إن لم يكن للنمط زخرفة. */
export function decoSVG(style, { color, accent, rtl = true } = {}) {
  const fn = DECOS[style];
  if (!fn) return '';
  const u = `d${++seq}`; // معرّفات فريدة: المعاينات المصغّرة عدة أغلفة في الصفحة نفسها
  const body = fn({ c: color, a: accent, t: tint(color, 0.16), t2: tint(color, 0.05), u });
  const inner = rtl ? `<g transform="translate(${PAGE_W} 0) scale(-1 1)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none">${inner}</svg>`;
}

/** صورة PNG للزخرفة (لخلفية غلاف Word) — بدقة 1.5× لطباعة نظيفة. */
export async function decoPNG(style, opts) {
  const svg = decoSVG(style, opts);
  if (!svg || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const k = 1.5;
    const c = document.createElement('canvas');
    c.width = Math.round(PAGE_W * k);
    c.height = Math.round(PAGE_H * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
