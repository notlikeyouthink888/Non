/**
 * معالجة النص العربي للبحث: توحيد الحروف، إزالة التشكيل، تجذيع خفيف،
 * ومطابقة تقريبية تتسامح مع الأخطاء الإملائية الشائعة واللهجة العراقية.
 */

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** توحيد الكتابة: أ إ آ ← ا، ى ← ي، ة ← ه، ؤ ← و، ئ ← ي، وإزالة التشكيل والتطويل. */
export function norm(s) {
  return String(s || '')
    .replace(DIACRITICS, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .toLowerCase();
}

/** كلمات لا تميّز موضوعًا عن آخر. */
const STOP = new Set(['تقرير', 'تقارير', 'عن', 'في', 'من', 'علي', 'الي', 'حول', 'مع', 'او', 'ما', 'هو', 'هي', 'كيف', 'اريد', 'ابي', 'بدي', 'اكتب', 'اعمل', 'سوي', 'لي', 'ل', 'و', 'ب', 'the', 'of', 'a', 'an', 'and', 'for', 'in', 'on', 'to', 'report']);

const PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال'];
const SUFFIXES = ['يات', 'ات', 'ون', 'ين', 'ان', 'يه', 'ها', 'ه', 'ي'];

/** تجذيع خفيف: يحذف «ال» وأخواتها وبعض اللواحق إن بقي جذر كافٍ. */
export function stem(w) {
  let s = w;
  if (/[a-z]/.test(s)) return s.replace(/(ing|ed|es|s)$/, '') || s;
  for (const p of PREFIXES) {
    if (s.startsWith(p) && s.length - p.length >= 3) { s = s.slice(p.length); break; }
  }
  if (s.length > 4 && s.startsWith('و')) s = s.slice(1);
  for (const x of SUFFIXES) {
    if (s.endsWith(x) && s.length - x.length >= 3) { s = s.slice(0, -x.length); break; }
  }
  return s;
}

/** مرادفات عامية وعلمية ← الصيغة المعتمدة في العناوين. */
const SYN = {
  كونكريت: 'خرسانه', كونكريتي: 'خرسانه', خرسانيه: 'خرسانه', سمنت: 'اسمنت', سمنتي: 'اسمنت', شيش: 'حديد',
  حصو: 'ركام', حصي: 'ركام', سلمب: 'هطول', قير: 'اسفلت', ليفل: 'تسويه', لياسه: 'لبخ', بياض: 'لبخ', محاره: 'لبخ',
  طوبار: 'قوالب', شدات: 'قوالب', شده: 'قوالب', خوازيق: 'ركايز', اوتاد: 'ركايز', بايلات: 'ركايز', كوبري: 'جسور',
  نزيز: 'رطوبه', طوب: 'طابوق', اجر: 'طابوق', كاشي: 'تبليط', بلاط: 'تبليط', سيراميك: 'تبليط', لبشه: 'حصيريه',
  رافت: 'حصيريه', دمك: 'حدل', رص: 'حدل', بروكتر: 'حدل', مجاري: 'صرف', اساله: 'ماء', تيودوليت: 'ثيودولايت',
  ثيودوليت: 'ثيودولايت', توتال: 'شامله', سلم: 'هطول', فحوصات: 'فحص', تجربه: 'فحص', تجارب: 'فحص', اختبار: 'فحص',
  concrete: 'خرسانه', slump: 'هطول', cement: 'اسمنت', soil: 'تربه', asphalt: 'اسفلت', steel: 'حديد', survey: 'مساحه',
  // مقاومة المواد: المصطلحات الإنجليزية كما يكتبها الطلبة بالعربية
  تنشن: 'شد', تنشين: 'شد', تنشون: 'شد', كمبريشن: 'انضغاط', كومبريشن: 'انضغاط', تورشن: 'التواء', تورجن: 'التواء',
  هاردنس: 'صلاده', هاردنيس: 'صلاده', امباكت: 'صدم', دفلكشن: 'انحراف', دفلكشين: 'انحراف', بكلنك: 'انبعاج', بكلنغ: 'انبعاج',
  شير: 'قص', سبرنك: 'نوابض', سبرنغ: 'نوابض', زنبرك: 'نوابض', فتيك: 'كلال', فاتيك: 'كلال', ستريس: 'اجهاد', سترين: 'انفعال',
  تست: 'فحص', test: 'فحص', مومنت: 'عزم', بيم: 'عتبه', عتبات: 'عتبه', tension: 'شد', torsion: 'التواء', hardness: 'صلاده', deflection: 'انحراف',
  // المساحة
  سرفي: 'مساحه', سيرفي: 'مساحه', ليفلنك: 'تسويه', ترافرس: 'مضلع', توتل: 'شامله', ستيشن: 'محطه', كومباص: 'بوصله',
  // الموائع
  فينشوري: 'فنتوري', اورفس: 'فتحه', اورفيس: 'فتحه', وير: 'هدار', فسكوستي: 'لزوجه', هيدروليك: 'موائع', فلود: 'موائع',
  // الرياضيات
  لابلاز: 'لابلاس', فوريه: 'فورير', ماتركس: 'مصفوفات', فكتور: 'متجهات', ديفرنشل: 'تفاضليه', انتكرال: 'تكامل', سمبسن: 'سمبسون',
};

export function tokens(s) {
  return norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** كلمات البحث بعد حذف الكلمات العامة. */
export function queryTerms(q) {
  return tokens(q).filter((t) => !STOP.has(t)).map((t) => {
    const syn = SYN[t] || SYN[stem(t)];
    return { raw: t, stem: stem(t), syn: syn ? stem(syn) : null };
  });
}

/** مسافة ليفنشتاين مع إيقاف مبكر. */
export function lev(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** درجة تطابق كلمة بحث مع قائمة كلمات مُجذّعة. */
export function matchTerm(term, stems) {
  let best = 0;
  const cands = term.syn ? [term.stem, term.syn] : [term.stem];
  for (const q of cands) {
    for (const w of stems) {
      if (w === q) return 1;
      if (q.length >= 2 && w.startsWith(q)) best = Math.max(best, 0.85);
      else if (q.length >= 3 && q.startsWith(w) && w.length >= 3) best = Math.max(best, 0.7);
      else if (q.length >= 4 && w.length >= 4) {
        const maxD = q.length >= 7 ? 2 : 1;
        const d = lev(q, w, maxD);
        if (d === 1) best = Math.max(best, 0.65);
        else if (d === 2 && maxD === 2) best = Math.max(best, 0.5);
      }
    }
  }
  return best;
}

/**
 * يصحّح عرض قوسين يحيطان بنص لاتيني في آخر سطر عربي،
 * مثل «بيان طريقة تنفيذ (Method Statement)» الذي يظهر مقلوب الأقواس بدون هذا.
 */
export function bidi(s) {
  return String(s ?? '').replace(/(\([^()]*[A-Za-z0-9][^()]*\))(?=[\s.,،؛:!?؟»"]*$)/u, '$1\u200E');
}

/** يجذّع كل كلمات نص ويعيدها مجموعة بلا تكرار. */
export function stemsOf(text) {
  return [...new Set(tokens(text).map(stem))];
}
