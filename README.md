<div dir="rtl">

# مدينتي — Madinati

**بانِي مدن ثلاثي الأبعاد** مستوحى من *Cities: Skylines II*، مبني بـ **Three.js r185 + Vite**
بوحدات ES أصلية، ومغلَّف كتطبيق **أندرويد** عبر Capacitor.

كل الأصول **مولّدة إجرائيًا وقت التشغيل** — لا صورة ولا موديل خارجي واحد.
التطبيق يعمل **بلا إنترنت** بالكامل.

---

## التشغيل

```bash
npm install
npm run dev        # خادم التطوير على http://localhost:5173
npm run build      # حزمة الإنتاج في dist/
npm run preview    # معاينة الحزمة
```

## بناء تطبيق الأندرويد

```bash
npm run android:sync     # build + مزامنة مشروع Capacitor
npm run android:apk      # يبني APK (يحتاج Android SDK + JDK 17+)
```

الناتج: `android/app/build/outputs/apk/debug/app-debug.apk`

> مشروع `android/` مولَّد ومُهيّأ مسبقًا: وضع أفقي، شاشة كاملة غامرة،
> `largeHeap`، اشتراط OpenGL ES 3.0، ودعم RTL.

## حلقة التحقق (لقطات بلا واجهة)

```bash
node tools/shoot.mjs --preset=overview --time=18.5 --out=docs/shots/x.png
node tools/shoot.mjs --showcase=roads --time=21           # وضع استعراض وحدة واحدة
node tools/shoot.mjs --batch=docs/shotlists/full.json     # دفعة لقطات بجلسة واحدة (أسرع)
```

كل لقطة تُنتج **PNG** + **JSON** فيه: أخطاء وحدة التحكم، fps، `drawCalls`،
عدد المثلثات، البرامج، وحالة كل وحدة.

## التحكّم

| الإجراء | فأرة/لوحة مفاتيح | لمس |
|---|---|---|
| تحريك | سحب بالزر الأيسر / `WASD` | إصبع واحد |
| تدوير | الزر الأيمن أو `Shift`+سحب / `Q`,`E` | إصبعان (لفّ) |
| تقريب | عجلة الفأرة | إصبعان (قرص) |
| ميل | الزر الأيمن + سحب رأسي | إصبعان (سحب رأسي) |
| لوحة التشخيص | `F3` | زر 📊 |

## البنية

```
src/core/         النواة المشتركة (kernel، bus، RNG، أنسجة، مواد، كاميرا، وقت)
src/systems/      13 وحدة فرعية، مجلد لكل وحدة
tools/            أداة اللقطات + سكربت بناء APK
docs/             STATUS.json، تقارير النقّاد، اللقطات
android/          مشروع Capacitor
```

التفاصيل الكاملة (نموذج البيانات، عقد الوحدات، الأحداث، ميزانية الأداء)
في **[ARCHITECTURE.md](ARCHITECTURE.md)**، وحالة الجودة الحالية والمشاكل المفتوحة
في **[docs/STATUS.json](docs/STATUS.json)**.

## معلمات الرابط (Query params)

| المعامل | المعنى |
|---|---|
| `?showcase=<module>` | تشغيل وحدة واحدة في مشهد استعراضي |
| `?quality=low\|medium\|high\|ultra` | فرض مستوى الجودة |
| `?time=18.5` | وقت اليوم الابتدائي |
| `?seed=12345` | بذرة العالم (نفس البذرة ⇒ نفس المدينة) |
| `?fx=0` | تعطيل ما بعد المعالجة |

## الرخصة

الكود والأصول المولَّدة: CC0 / ملك عام.

</div>
