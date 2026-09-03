# مِعمار مشروع «مدينتي» (Madinati)

> بانٍ مدن ثلاثي الأبعاد مستوحى من **Cities: Skylines II**، مبني بـ **Three.js r185 + Vite**
> ووحدات ES أصلية، ومغلَّف كتطبيق **أندرويد** عبر Capacitor.
>
> هذا المستند هو العقد المُلزم لكل الوحدات. أي تغيير في `src/core` يمر عبر **وكيل التكامل** فقط.

---

## 1. المبادئ الأساسية (Invariants)

| البند | القرار |
|---|---|
| الوحدات القياسية | **المتر**. المحور **+Y للأعلى**، المستوى الأفقي **XZ**. |
| حجم العالم | `2048 م × 2048 م`، شبكة خلايا `8 م` (256×256 خلية). |
| العشوائية | **مولّد أرقام عشوائية مُهيّأ فقط** (`mulberry32`). ممنوع `Math.random()` في أي وحدة. |
| اللون | `renderer.outputColorSpace = SRGB`, `toneMapping = ACESFilmic`. كل خرائط الألبيدو `SRGBColorSpace`، وخرائط البيانات (normal/roughness/ao) خطّية. |
| المواد | **PBR فقط** (`MeshStandardMaterial` / `MeshPhysicalMaterial`) مع albedo + normal + roughness + AO. ممنوع `MeshBasicMaterial` إلا للسماء والواجهة. |
| الزمن | `dt` بالثواني، مُقيَّد بـ `1/20 ثانية` كحد أقصى لكل إطار. |
| الحتمية | نفس البذرة ⇒ نفس المدينة بالضبط (تضاريس، طرق، مبانٍ، دعائم). حركة المرور حتمية أيضًا عند تثبيت `dt`. |
| اللغة | واجهة المستخدم **عربية RTL**، أسماء الكود إنجليزية. |

## 2. ميزانية الأداء (Performance Budget)

| المقياس | الهدف (سطح مكتب 1080p) | الهدف (أندرويد متوسط) |
|---|---|---|
| معدل الإطارات | **≥ 50 fps** | ≥ 30 fps |
| استدعاءات الرسم | **≤ 1500 draw calls** | ≤ 700 |
| المثلثات | ≤ 3.5 مليون | ≤ 1.2 مليون |
| ذاكرة النسيج | ≤ 256 ميجابايت | ≤ 96 ميجابايت |
| زمن التحميل حتى `ready` | ≤ 6 ثوانٍ | ≤ 10 ثوانٍ |

آليات الالتزام: **InstancedMesh لكل شيء متكرر** (مبانٍ، أشجار، سيارات، أعمدة إنارة)، دمج الهندسة الساكنة لكل قطاع (chunk 128 م)، مستويات تفصيل LOD0/1/2، قص حسب المسافة، وسُلَّم جودة `low | medium | high | ultra` يُختار تلقائيًا (أندرويد ⇒ `low/medium`).

## 3. سياسة الأصول (Assets Policy)

**CC0 فقط.** البيئة التنفيذية هنا خلف بروكسي يمنع تنزيل حِزَم Poly Haven / ambientCG، لذلك:

1. **المصدر الافتراضي = التوليد الإجرائي** (`src/core/textures.js`): كل خرائط PBR تُولَّد وقت التشغيل على `OffscreenCanvas` من ضوضاء (FBM/Worley/Voronoi) بدقة 512–1024، ثم تُشتق منها خرائط `normal` عبر Sobel وخرائط `roughness/AO` عبر منحنيات. النتيجة تُخزَّن مؤقتًا في `TextureCache` بمفتاح `(name, size, seed)`.
2. الهندسة كلها إجرائية (لا موديلات خارجية).
3. **ممنوع «فنّ المبرمج»**: لا ألوان مسطّحة، لا مكعبات عارية، لا شبكات wireframe، لا ملمس متكرر ظاهر. كل سطح يجب أن يحمل: تباين ألبيدو + تفاصيل نتوء + تدرّج خشونة + انسداد محيطي + كسر تكرار (UV تشويش / tri-planar).
4. أي أصل خارجي يُضاف لاحقًا يجب أن يكون CC0 موثّقًا في `docs/ASSETS.md` مع الرابط والرخصة.

## 4. النواة المشتركة `src/core/` (يملكها المُكامِل وحده)

```
core/
  kernel.js      سجل الوحدات، دورة الحياة، عزل الأعطال
  bus.js         ناقل أحداث (on/off/emit) بلا تبعيات
  rng.js         mulberry32 + ضوضاء Perlin/Simplex/Worley مُهيّأة
  world.js       نموذج البيانات العالمي (المصدر الوحيد للحقيقة)
  config.js      الثوابت + سُلَّم الجودة + كشف المنصّة
  textures.js    مصنع خرائط PBR الإجرائية + التخزين المؤقت
  materials.js   مواد مشتركة (أسفلت، خرسانة، زجاج، عشب...)
  cameraRig.js   كاميرا مدارية/لمسية (pinch/pan/zoom) بحدود العالم
  time.js        وقت اليوم، سرعة المحاكاة، إيقاف/تشغيل
  math.js        دوال مساعدة (lerp, clamp, smoothstep, spline, quadtree)
  app.js         تركيب العارض والمشهد وتشغيل الوحدات
```

### 4.1 نموذج البيانات العالمي `world`

```js
world = {
  seed: 20260903,
  size: 2048, cell: 8, dim: 256,
  terrain: {
    height: Float32Array(257*257),   // ارتفاع العُقد بالمتر
    water:  Float32Array(257*257),   // منسوب الماء (0 = يابسة)
    sampleHeight(x, z): number,      // استيفاء ثنائي الخطية
    slope(x, z): number
  },
  roads: {
    nodes: [{ id, x, z, y, type }],
    edges: [{ id, a, b, type, width, lanes, spline }],
    graph,                            // قوائم مجاورة للتوجيه
    sampleLane(edgeId, lane, t): {pos, dir},
    nearestEdge(x, z, maxDist): edge|null
  },
  zones:   Uint8Array(256*256),       // 0 فارغ 1 سكني 2 تجاري 3 صناعي 4 مكتبي 5 حديقة
  density: Uint8Array(256*256),       // 0..255 (يقودها simulation)
  lots:    [{ id, cx, cz, w, d, rot, zone, level, buildingId }],
  buildings:[{ id, lotId, kind, footprint, height, floors, seed, lodGroup }],
  agents:  { cars: [...], peds: [...] },
  stats:   { population, jobs, happiness, funds, tick },
  timeOfDay: 14.0,                    // ساعة عشرية 0..24
  weather: { cloudiness, humidity, windDir, windSpeed }
}
```

كل مصفوفة مملوكة لوحدة واحدة **تكتب** فيها؛ البقية **تقرأ** فقط:

| المصفوفة/الكائن | الكاتب | القرّاء |
|---|---|---|
| `terrain.*` | terrain | الجميع |
| `roads.*` | roads | traffic, zoning, buildings, props, tools |
| `zones`, `lots` | zoning | buildings, simulation |
| `density`, `stats` | simulation | ui, zoning, buildings |
| `buildings` | buildings | props, traffic, effects |
| `agents` | traffic | audio, effects |
| `timeOfDay`, `weather` | environment | الجميع |

### 4.2 عقد الوحدة (Module Contract)

كل وحدة تُصدِّر كائنًا واحدًا افتراضيًا:

```js
export default {
  name: 'roads',
  deps: ['terrain'],
  async init(ctx) {},        // بناء الموارد، إضافة العُقد للمشهد
  update(dt, ctx) {},        // كل إطار (اختياري)
  tick(ctx) {},              // كل 250ms للمحاكاة (اختياري)
  onQuality(level, ctx) {},  // تغيّر سُلَّم الجودة (اختياري)
  showcase(ctx) {},          // بناء مشهد استعراضي لهذه الوحدة فقط (إلزامي)
  dispose() {},              // تحرير الهندسة/المواد/الأنسجة (إلزامي)
  stats(): object            // أرقام للوحة التشخيص (اختياري)
}
```

`ctx = { scene, renderer, camera, cameraRig, world, bus, rng, config, quality, textures, materials, time, log }`

### 4.3 عزل الأعطال

`kernel` يلفّ كل استدعاء (`init/update/tick/showcase/dispose`) في `try/catch`:
* أول خطأ في وحدة ⇒ تُسجَّل في `ctx.log`، تُصدر `module:error`، وتُوضع الوحدة في حالة `degraded` ولا تُستدعى ثانيةً في `update`.
* الوحدات التي تعتمد عليها تُخطر عبر `module:degraded` وتعمل بوضع احتياطي.
* **التطبيق يبقى قابلًا للتحميل دائمًا** حتى لو تعطّلت كل الوحدات (تبقى السماء والأرضية).

### 4.4 الأحداث (Event Bus)

| الحدث | المُصدِر | الحمولة |
|---|---|---|
| `app:ready` | app | `{ ms }` |
| `module:error` / `module:degraded` | kernel | `{ name, phase, error }` |
| `terrain:ready` | terrain | `{ bounds }` |
| `time:changed` | environment | `{ hour, sunDir, isNight }` |
| `weather:changed` | environment | `{ cloudiness }` |
| `roads:changed` | roads | `{ added:[], removed:[] }` |
| `zones:changed` | zoning | `{ rect }` |
| `lots:created` | zoning | `{ lots }` |
| `buildings:spawned` | buildings | `{ ids }` |
| `sim:tick` | simulation | `{ stats }` |
| `tool:selected` | tools | `{ tool }` |
| `quality:changed` | app | `{ level }` |
| `ui:notify` | أي وحدة | `{ text, kind }` |

## 5. الوحدات الفرعية (مجلد لكل وحدة، مالك واحد)

| # | المجلد | المسؤولية | يُصدِّر (API عامة) |
|---|---|---|---|
| 1 | `systems/terrain` | حقل ارتفاعات FBM، شاطئ، ماء بشادر أمواج، مزج أنسجة (عشب/رمل/صخر/تراب) tri-planar، شبكة مقسّمة لقطاعات | `heightAt(x,z)`, `raycast(ray)`, `waterLevel`, `flatten(rect,h)` |
| 2 | `systems/environment` | سماء بتشتت رايلي/مي، شمس + قمر + نجوم، غيوم حجمية خفيفة، ضباب جوي (aerial perspective)، ظلال متتالية، خريطة بيئة ديناميكية، دورة يوم كاملة | `setTimeOfDay(h)`, `sunDirection`, `isNight`, `envMap` |
| 3 | `systems/roads` | رسم شبكة الطرق، سبلاينات، تقاطعات، أرصفة، خطوط طلاء، معابر مشاة، أعمدة إنارة، جسور | `addRoad(pts,type)`, `removeRoad(id)`, `nearestEdge()`, `rebuild()` |
| 4 | `systems/zoning` | فرشاة تقسيم المناطق، اشتقاق القطع (lots) من واجهات الطرق، قيمة الأرض | `paint(rect,zone)`, `lotsFor(zone)`, `landValue(x,z)` |
| 5 | `systems/buildings` | مولّد مبانٍ إجرائي (سكني/تجاري/صناعي/مكاتب/معالم)، واجهات معيارية، نوافذ مضيئة ليلًا، أسطح بمعدات، LOD + instancing | `spawn(lot)`, `demolish(id)`, `rebuildAll()` |
| 6 | `systems/props` | أشجار (3 أنواع × 3 LOD)، شجيرات، أسوار، لافتات، حاويات، مقاعد، سيارات واقفة، هوائيات | `scatter(rect,kind)`, `clear(rect)` |
| 7 | `systems/traffic` | عملاء على شبكة الطرق، اتباع مسار + تجنّب تصادم، إشارات، مشاة على الأرصفة، مصابيح أمامية/خلفية ليلًا | `spawnCars(n)`, `setDensity(v)` |
| 8 | `systems/effects` | مسار ما بعد المعالجة: TAA/SMAA، SSAO، Bloom انتقائي، عمق ميدان مصغّر (tilt-shift)، تصحيح ألوان، حبيبات، تكيّف تعرّض | `setEnabled(name,bool)`, `render()` |
| 9 | `systems/simulation` | سكان، وظائف، طلب RCI، نمو المناطق، ميزانية، سعادة، نبض كل 250ms | `tick()`, `demand`, `stats` |
| 10 | `systems/tools` | أدوات البناء: طريق، منطقة، جرّافة، تسوية، انتقاء؛ دعم اللمس الكامل | `select(tool)`, `cancel()` |
| 11 | `systems/ui` | HUD عربي RTL: شريط أدوات، ساعة ومنزلق وقت، إحصاءات، لوحة تشخيص، إشعارات، توافق موبايل | `notify()`, `setPanel()` |
| 12 | `systems/audio` | صوت إجرائي بالكامل (WebAudio): أزيز مرور، رياح، عصافير نهارًا، صراصير ليلًا، نقرات واجهة | `setMuted(b)`, `setVolume(v)` |
| 13 | `systems/democity` | يبني مدينة عرض حتمية: تضاريس ساحلية، شبكة طرق، مناطق، مبانٍ، دعائم، مرور — لقطة الافتتاح | `build()`, `cameraPresets` |

## 6. حلقة التحقق (Validation Loop) — قبل أي ادّعاء

```
npm run shot -- --preset=overview --time=18.5 --out=docs/shots/overview_1830.png
npm run shot -- --showcase=roads --time=21 --out=docs/shots/roads_night.png
```

`tools/shoot.mjs` (Chromium بلا واجهة عبر Playwright):
1. يشغّل خادم Vite (أو يستخدم واحدًا يعمل)،
2. يفتح الصفحة وينتظر `window.__CITY.ready === true`,
3. يضبط `setTimeOfDay(h)` و`setCameraPreset(name)` ثم ينتظر استقرار الإطارات،
4. يكتب **PNG** + **سجل JSON**: `{ fps, frameMs, drawCalls, triangles, textures, programs, consoleErrors[], moduleStates{}, gl }`.

**القاعدة:** لا وكيل يدّعي شيئًا لم يصوّره ويفحصه. كل النتائج تُحفظ في `docs/STATUS.json`.

> ⚠️ ملاحظة صدق: هذه البيئة **بلا GPU** — Chromium يرسم عبر SwiftShader (برمجي).
> لذلك أرقام الـ fps في السجلات **ليست ممثِّلة للأداء الحقيقي**؛ المقياس المعتمد للأداء هو
> `drawCalls / triangles / programs` (مستقلة عن العتاد)، وتُذكر الـ fps البرمجية كما هي دون تجميل.

## 7. التنظيم متعدد الوكلاء

* **وكيل بانٍ واحد لكل وحدة** — يملك مجلده فقط، ممنوع عليه لمس `src/core` أو مجلد غيره.
* طلبات تغيير النواة تُكتب في `docs/CORE_REQUESTS.md` ويطبّقها **المُكامِل** وحده.
* المراحل: **(1)** terrain, environment, roads, simulation, ui, audio, effects → **(2)** zoning, buildings, props, traffic, tools → **(3)** democity.
* بعد كل مرحلة: **ناقد فني** مستقل يلتقط لقطاته بنفسه (أوقات مختلفة + مستويات تكبير) ويعطي درجة 0–10 مقابل لقطات مرجعية من CS2. النجاح `≥ 8.5` وبلا أخطاء وحدة تحكم. حتى 4 جولات لكل وحدة.
* الحالة والمشاكل المفتوحة في `docs/STATUS.json` — كل دورة تبدأ من **أضعف وحدة**.

## 8. تغليف أندرويد

* `Capacitor 7` + `WebView` حديث، `android/` يُولَّد من `npm run android:sync`.
* وضع أفقي إجباري، شاشة كاملة (immersive)، `powerPreference: 'high-performance'`، `antialias:false` مع SMAA بدل MSAA.
* سُلَّم الجودة يُخفَّض تلقائيًا عند كشف WebView على أندرويد (`low` افتراضيًا) مع إمكانية الرفع يدويًا.
* كل الأصول مولّدة إجرائيًا ⇒ **التطبيق يعمل بلا إنترنت بالكامل**.

## 9. هيكل الملفات

```
/
  index.html               نقطة الدخول (RTL, عربي)
  vite.config.js
  capacitor.config.json
  ARCHITECTURE.md          هذا الملف
  src/
    main.js                bootstrap
    core/...               (المُكامِل فقط)
    systems/<module>/index.js  + ملفات الوحدة
  tools/
    shoot.mjs              لقطات + سجل JSON
    build-apk.sh           بناء APK
  docs/
    STATUS.json            الحالة والدرجات والمشاكل المفتوحة
    CORE_REQUESTS.md       طلبات تغيير النواة
    CRITIC_*.md            تقارير النقّاد
    shots/                 اللقطات
```
