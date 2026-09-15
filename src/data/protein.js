/**
 * مرجع البروتين — غرامات البروتين لكل ١٠٠ غرام من الطعام، ووزن الحبّة/الحصّة
 * الشائعة بالغرام حتى يُحسب أي مقدار: حبّة، ١٠٠ غم، نصف كيلو، كيلو، أو كمية حرّة.
 *
 * الأرقام متوسّطات جداول التغذية (USDA وما يوافقها) وتكفي للتتبّع اليومي.
 *   per100     — غرام بروتين في ١٠٠ غرام
 *   piece      — وزن الوحدة الواحدة بالغرام (حبّة، كوب، رغيف، سكوب…)
 *   pieceLabel — اسم تلك الوحدة
 */

export const FOOD_CATEGORIES = [
  { id: 'meat', label: 'لحوم ودجاج وسمك', icon: '🍗' },
  { id: 'dairy', label: 'ألبان وبيض', icon: '🥚' },
  { id: 'grain', label: 'بقوليات وحبوب', icon: '🌾' },
  { id: 'nut', label: 'مكسّرات وبذور', icon: '🥜' },
  { id: 'fruit', label: 'فواكه', icon: '🍎' },
  { id: 'veg', label: 'خضروات', icon: '🥦' },
  { id: 'drink', label: 'مشروبات ومكمّلات', icon: '🥤' },
];

export const PROTEIN_FOODS = [
  /* ── لحوم ودجاج وسمك ── */
  { name: 'صدر دجاج مطبوخ', cat: 'meat', per100: 31, piece: 120, pieceLabel: 'قطعة' },
  { name: 'فخذ دجاج مطبوخ', cat: 'meat', per100: 26, piece: 110, pieceLabel: 'فخذة' },
  { name: 'دجاج مشوي كامل', cat: 'meat', per100: 27, piece: 900, pieceLabel: 'دجاجة' },
  { name: 'لحم بقر مفروم مطبوخ', cat: 'meat', per100: 26, piece: 100, pieceLabel: 'حصّة' },
  { name: 'ستيك لحم بقر', cat: 'meat', per100: 27, piece: 200, pieceLabel: 'شريحة' },
  { name: 'لحم غنم', cat: 'meat', per100: 25, piece: 150, pieceLabel: 'حصّة' },
  { name: 'تكّة / كباب', cat: 'meat', per100: 25, piece: 80, pieceLabel: 'سيخ' },
  { name: 'كبد دجاج', cat: 'meat', per100: 24, piece: 100, pieceLabel: 'حصّة' },
  { name: 'ديك رومي', cat: 'meat', per100: 29, piece: 120, pieceLabel: 'شريحة' },
  { name: 'سمك مشوي (عام)', cat: 'meat', per100: 22, piece: 200, pieceLabel: 'سمكة' },
  { name: 'سمك سلمون', cat: 'meat', per100: 20, piece: 150, pieceLabel: 'شريحة' },
  { name: 'تونة معلّبة مصفّاة', cat: 'meat', per100: 24, piece: 100, pieceLabel: 'علبة' },
  { name: 'روبيان', cat: 'meat', per100: 20, piece: 100, pieceLabel: 'حصّة' },
  { name: 'برغر لحم', cat: 'meat', per100: 20, piece: 100, pieceLabel: 'قرص' },
  { name: 'مرتديلا / سجق', cat: 'meat', per100: 13, piece: 30, pieceLabel: 'شريحة' },

  /* ── ألبان وبيض ── */
  { name: 'بيضة كاملة', cat: 'dairy', per100: 13, piece: 50, pieceLabel: 'بيضة' },
  { name: 'بياض بيضة', cat: 'dairy', per100: 11, piece: 33, pieceLabel: 'بياضة' },
  { name: 'حليب كامل الدسم', cat: 'dairy', per100: 3.4, piece: 250, pieceLabel: 'كوب' },
  { name: 'حليب خالي الدسم', cat: 'dairy', per100: 3.4, piece: 250, pieceLabel: 'كوب' },
  { name: 'لبن / روبة', cat: 'dairy', per100: 4, piece: 250, pieceLabel: 'كوب' },
  { name: 'زبادي يوناني', cat: 'dairy', per100: 10, piece: 170, pieceLabel: 'علبة' },
  { name: 'لبنة', cat: 'dairy', per100: 10, piece: 60, pieceLabel: 'ملعقتان' },
  { name: 'جبن أبيض', cat: 'dairy', per100: 18, piece: 50, pieceLabel: 'قطعة' },
  { name: 'جبن قريش', cat: 'dairy', per100: 11, piece: 100, pieceLabel: 'حصّة' },
  { name: 'جبن شيدر', cat: 'dairy', per100: 25, piece: 30, pieceLabel: 'شريحة' },
  { name: 'جبن موزاريلا', cat: 'dairy', per100: 22, piece: 30, pieceLabel: 'شريحة' },
  { name: 'قيمر / قشطة', cat: 'dairy', per100: 2.8, piece: 50, pieceLabel: 'حصّة' },
  { name: 'آيس كريم', cat: 'dairy', per100: 3.5, piece: 100, pieceLabel: 'كرة مزدوجة' },

  /* ── بقوليات وحبوب ── */
  { name: 'عدس مطبوخ', cat: 'grain', per100: 9, piece: 200, pieceLabel: 'كوب' },
  { name: 'حمّص مطبوخ', cat: 'grain', per100: 8.9, piece: 165, pieceLabel: 'كوب' },
  { name: 'فاصولياء مطبوخة', cat: 'grain', per100: 8.2, piece: 180, pieceLabel: 'كوب' },
  { name: 'فول مدمّس', cat: 'grain', per100: 7.6, piece: 170, pieceLabel: 'كوب' },
  { name: 'باقلاء', cat: 'grain', per100: 7.6, piece: 170, pieceLabel: 'كوب' },
  { name: 'لوبيا', cat: 'grain', per100: 8, piece: 170, pieceLabel: 'كوب' },
  { name: 'رز أبيض مطبوخ', cat: 'grain', per100: 2.6, piece: 160, pieceLabel: 'كوب' },
  { name: 'برغل مطبوخ', cat: 'grain', per100: 3, piece: 180, pieceLabel: 'كوب' },
  { name: 'مكرونة مطبوخة', cat: 'grain', per100: 5.8, piece: 140, pieceLabel: 'كوب' },
  { name: 'كينوا مطبوخة', cat: 'grain', per100: 4.4, piece: 185, pieceLabel: 'كوب' },
  { name: 'خبز صمون', cat: 'grain', per100: 9, piece: 90, pieceLabel: 'رغيف' },
  { name: 'خبز تنّور', cat: 'grain', per100: 8, piece: 100, pieceLabel: 'رغيف' },
  { name: 'خبز أسمر', cat: 'grain', per100: 10, piece: 40, pieceLabel: 'شريحة' },
  { name: 'شوفان جاف', cat: 'grain', per100: 13.5, piece: 50, pieceLabel: 'نصف كوب' },
  { name: 'ذرة مسلوقة', cat: 'grain', per100: 3.3, piece: 150, pieceLabel: 'كوز' },

  /* ── مكسّرات وبذور ── */
  { name: 'لوز', cat: 'nut', per100: 21, piece: 30, pieceLabel: 'حفنة' },
  { name: 'جوز', cat: 'nut', per100: 15, piece: 30, pieceLabel: 'حفنة' },
  { name: 'فستق', cat: 'nut', per100: 20, piece: 30, pieceLabel: 'حفنة' },
  { name: 'كاجو', cat: 'nut', per100: 18, piece: 30, pieceLabel: 'حفنة' },
  { name: 'بذر عبّاد الشمس', cat: 'nut', per100: 21, piece: 30, pieceLabel: 'حفنة' },
  { name: 'بذور الشيا', cat: 'nut', per100: 17, piece: 20, pieceLabel: 'ملعقتان' },
  { name: 'زبدة فستق', cat: 'nut', per100: 25, piece: 32, pieceLabel: 'ملعقتان' },
  { name: 'طحينة', cat: 'nut', per100: 17, piece: 30, pieceLabel: 'ملعقتان' },

  /* ── فواكه ── */
  { name: 'موز', cat: 'fruit', per100: 1.1, piece: 120, pieceLabel: 'حبة' },
  { name: 'تفاح', cat: 'fruit', per100: 0.3, piece: 180, pieceLabel: 'حبة' },
  { name: 'برتقال', cat: 'fruit', per100: 0.9, piece: 150, pieceLabel: 'حبة' },
  { name: 'تمر', cat: 'fruit', per100: 2.5, piece: 8, pieceLabel: 'تمرة' },
  { name: 'عنب', cat: 'fruit', per100: 0.7, piece: 150, pieceLabel: 'عنقود صغير' },
  { name: 'رقّي (بطيخ)', cat: 'fruit', per100: 0.6, piece: 300, pieceLabel: 'شريحة' },
  { name: 'بطيخ أصفر (شمّام)', cat: 'fruit', per100: 0.8, piece: 200, pieceLabel: 'شريحة' },
  { name: 'مانجو', cat: 'fruit', per100: 0.8, piece: 200, pieceLabel: 'حبة' },
  { name: 'فراولة', cat: 'fruit', per100: 0.7, piece: 150, pieceLabel: 'كوب' },
  { name: 'كيوي', cat: 'fruit', per100: 1.1, piece: 75, pieceLabel: 'حبة' },
  { name: 'أفوكادو', cat: 'fruit', per100: 2, piece: 150, pieceLabel: 'حبة' },
  { name: 'رمّان', cat: 'fruit', per100: 1.7, piece: 280, pieceLabel: 'حبة' },
  { name: 'خوخ', cat: 'fruit', per100: 0.9, piece: 150, pieceLabel: 'حبة' },
  { name: 'إجاص', cat: 'fruit', per100: 0.4, piece: 180, pieceLabel: 'حبة' },
  { name: 'مشمش', cat: 'fruit', per100: 1.4, piece: 35, pieceLabel: 'حبة' },
  { name: 'تين', cat: 'fruit', per100: 0.8, piece: 50, pieceLabel: 'حبة' },
  { name: 'أناناس', cat: 'fruit', per100: 0.5, piece: 165, pieceLabel: 'كوب' },
  { name: 'زبيب', cat: 'fruit', per100: 3.1, piece: 30, pieceLabel: 'حفنة' },
  { name: 'ليمون', cat: 'fruit', per100: 1.1, piece: 60, pieceLabel: 'حبة' },

  /* ── خضروات ── */
  { name: 'بطاطا مسلوقة', cat: 'veg', per100: 2, piece: 170, pieceLabel: 'حبة' },
  { name: 'بروكلي', cat: 'veg', per100: 2.8, piece: 90, pieceLabel: 'كوب' },
  { name: 'سبانغ (سبانخ)', cat: 'veg', per100: 2.9, piece: 100, pieceLabel: 'حصّة' },
  { name: 'بزاليا (بازلاء)', cat: 'veg', per100: 5.4, piece: 160, pieceLabel: 'كوب' },
  { name: 'فطر (مشروم)', cat: 'veg', per100: 3.1, piece: 100, pieceLabel: 'كوب' },
  { name: 'جرجير', cat: 'veg', per100: 2.6, piece: 30, pieceLabel: 'حزمة صغيرة' },
  { name: 'قرنابيط', cat: 'veg', per100: 1.9, piece: 100, pieceLabel: 'كوب' },
  { name: 'بامية', cat: 'veg', per100: 1.9, piece: 100, pieceLabel: 'كوب' },
  { name: 'فاصولياء خضراء', cat: 'veg', per100: 1.8, piece: 125, pieceLabel: 'كوب' },
  { name: 'شمندر', cat: 'veg', per100: 1.6, piece: 80, pieceLabel: 'حبة' },
  { name: 'خس', cat: 'veg', per100: 1.4, piece: 50, pieceLabel: 'حفنة' },
  { name: 'ملفوف (لهانة)', cat: 'veg', per100: 1.3, piece: 100, pieceLabel: 'كوب' },
  { name: 'كوسة', cat: 'veg', per100: 1.2, piece: 200, pieceLabel: 'حبة' },
  { name: 'بصل', cat: 'veg', per100: 1.1, piece: 110, pieceLabel: 'حبة' },
  { name: 'فلفل حلو', cat: 'veg', per100: 1, piece: 120, pieceLabel: 'حبة' },
  { name: 'باذنجان', cat: 'veg', per100: 1, piece: 250, pieceLabel: 'حبة' },
  { name: 'طماطم', cat: 'veg', per100: 0.9, piece: 120, pieceLabel: 'حبة' },
  { name: 'جزر', cat: 'veg', per100: 0.9, piece: 70, pieceLabel: 'حبة' },
  { name: 'خيار', cat: 'veg', per100: 0.7, piece: 150, pieceLabel: 'حبة' },
  { name: 'ثوم', cat: 'veg', per100: 6.4, piece: 5, pieceLabel: 'فص' },

  /* ── مشروبات ومكمّلات ── */
  { name: 'واي بروتين', cat: 'drink', per100: 80, piece: 30, pieceLabel: 'سكوب' },
  { name: 'كازين قبل النوم', cat: 'drink', per100: 80, piece: 30, pieceLabel: 'سكوب' },
  { name: 'بروتين نباتي', cat: 'drink', per100: 75, piece: 30, pieceLabel: 'سكوب' },
  { name: 'مشروب بروتين جاهز', cat: 'drink', per100: 6, piece: 330, pieceLabel: 'علبة' },
  { name: 'حليب بالشوكولاتة', cat: 'drink', per100: 3.4, piece: 250, pieceLabel: 'كوب' },
  { name: 'عصير برتقال', cat: 'drink', per100: 0.7, piece: 250, pieceLabel: 'كوب' },
  { name: 'قهوة بالحليب', cat: 'drink', per100: 2, piece: 200, pieceLabel: 'كوب' },
  { name: 'سموذي موز وحليب', cat: 'drink', per100: 2.5, piece: 300, pieceLabel: 'كوب' },
];

/** المقادير الجاهزة في منتقي الكمية. */
export const AMOUNTS = [
  { id: 'piece', label: 'حبة / حصّة' },
  { id: 'g100', label: '١٠٠ غم', grams: 100 },
  { id: 'g250', label: 'ربع كيلو', grams: 250 },
  { id: 'g500', label: 'نصف كيلو', grams: 500 },
  { id: 'g1000', label: 'كيلو', grams: 1000 },
];

/** بروتين مقدار معيّن (بالغرام) من طعام. */
export const proteinOf = (food, gramsOfFood) =>
  Math.round(((Number(food.per100) || 0) * (Number(gramsOfFood) || 0)) / 100 * 10) / 10;

/** الهدف اليومي المقترح حسب الوزن ومستوى النشاط. */
export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'قليل الحركة' },
  { value: 1.6, label: 'تمرين خفيف' },
  { value: 1.7, label: 'تمرين منتظم' },
  { value: 2.0, label: 'بناء عضل' },
  { value: 2.2, label: 'تنشيف' },
];

export const suggestTarget = (weightKg, perKg) => Math.round(weightKg * perKg);

export const PROTEIN_TIPS = [
  'وزّع البروتين على ٣–٤ وجبات بدل وجبة واحدة كبيرة — الاستفادة أعلى.',
  'أفضل وقت لجرعة بعد التمرين: خلال ساعتين، ولا داعي للعجلة أكثر من ذلك.',
  'جرعة قبل النوم (حليب أو كازين) تساعد الاستشفاء الليلي.',
  'اشرب ماءً كافيًا مع البروتين العالي.',
  'المصادر الحيوانية أكمل من النباتية؛ إن اعتمدت النباتي فنوّع (عدس + رز مثلًا).',
  'الفواكه والخضروات بروتينها قليل لكنها تكمّل الوجبة — لا تعتمد عليها مصدرًا رئيسًا.',
];
