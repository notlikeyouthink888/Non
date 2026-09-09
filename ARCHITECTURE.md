# معمار «Your World»

وثيقة مرجعية لكيفية تركيب التطبيق: الطبقات، تدفّق البيانات، والعقود بين
طبقة الويب والطبقة الأصلية في أندرويد.

---

## 1. الفكرة العامة

التطبيق واجهة ويب (Vite + جافاسكربت خالص، بلا إطار عمل) مغلّفة بـ Capacitor،
ومعها ثلاث إضافات أندرويد مكتوبة يدويًا تعطي ما لا يستطيع WebView فعله:

| الحاجة | لماذا لا يكفي الويب | الحل |
|---|---|---|
| قراءة كل أغاني الجهاز | لا وصول لنظام الملفات | إضافة `MusicLibrary` تستعلم من `MediaStore` |
| تشغيل والشاشة مقفلة | يُخنق WebView في الخلفية | خدمة أمامية `PlayerService` + `MediaSession` |
| منبّه يرنّ والتطبيق مغلق | `setTimeout` يموت مع الصفحة | `AlarmManager` عبر إضافة `Scheduler` |
| مؤثرات صوتية على مستوى النظام | Web Audio يعمل داخل الصفحة فقط | `Equalizer` و`BassBoost` و`Virtualizer` و`PresetReverb` و`LoudnessEnhancer` |

كل واجهة أصلية لها **بديل ويب كامل** في `src/core/webfallback/` حتى يعمل
التطبيق في المتصفّح أثناء التطوير دون أي تغيير في كود الأقسام.

---

## 2. الطبقات

```
┌──────────────────────────────────────────────────────┐
│  src/sections/*        الأقسام الخمسة (واجهة + منطق)  │
├──────────────────────────────────────────────────────┤
│  src/core/             store · dom · ui · fmt · idb   │
│                        usage · settings · native      │
├──────────────────────────────────────────────────────┤
│  Capacitor Bridge                                     │
├──────────────────────────────────────────────────────┤
│  plugins/  MusicLibrary · Player · Scheduler          │
│  player/   PlayerService                              │
│  alarm/    AlarmScheduler · AlarmReceiver · …         │
└──────────────────────────────────────────────────────┘
```

### `core/store.js`
حالة واحدة (`state`) تُحفظ في `localStorage` بكتابة مؤجّلة (250ms)، مع دمج
عميق مع `defaults` عند كل إقلاع — أي مفتاح جديد يُضاف في تحديث لاحق يظهر
تلقائيًا دون كسر بيانات المستخدم. الاشتراك عبر `subscribe(topic, fn)`
والبثّ عبر `emit(topic)`.

المواضيع المستعملة: `library`، `player`، `alarms`، `tasks`، `timer`،
`commit`، `places`، `growth`، `usage`، `summary`.

### `core/idb.js`
`IndexedDB` للبيانات الكبيرة التي لا تناسب `localStorage`:
- `library` → قائمة الأغاني المفحوصة (تُعاد قراءتها فورًا عند الفتح).
- `tiles` → بلاطات الخريطة المنزّلة (Blob لكل بلاطة).

### `core/dom.js`
دالة `h(sel, props, children)` بأسلوب hyperscript، مع `fill` و`chipGroup`
و`toggle` و`settingRow`. لا Virtual DOM: كل تبويب يُعاد بناؤه عند تغيّر البيانات،
وهو رخيص بما يكفي على هذه الأحجام.

### `core/usage.js`
يحسب زمن البقاء في التطبيق كل ١٥ ثانية موزّعًا على الأقسام، ويطلق تحذيرات
عند حدود قابلة للضبط، ويكتشف تجاوز منتصف الليل فيبني **ملخّص اليوم** ويعرضه
عند أول فتح بعده.

### `core/native.js`
الواجهة الوحيدة نحو أندرويد. تصدّر `Music` و`Player` و`Scheduler` و`Location`
و`System`. إن لم يوجد `window.Capacitor` تُحمَّل البدائل من `webfallback/`
عند الطلب (dynamic import) فلا تدخل حزمة الإنتاج إلا عند الحاجة.

---

## 3. الأقسام

### ♪ الأغاني (`sections/music/`)
| ملف | الدور |
|---|---|
| `library.js` | المسح والتخزين المؤقّت والتجميع حسب الفنان/الألبوم والبحث |
| `player.js` | متحكّم التشغيل: قائمة، تكرار، عشوائي، سرعة، مؤثرات، مفضّلة، سجلّ |
| `now.js` | شاشة «قيد التشغيل»: شريط تقدّم، تحكّم، سرعة، صوت، مؤقّت نوم |
| `effects.js` | معادل خماسي + باس + محيطي + صدى + جهارة + توازن |
| `mini.js` | الشريط المصغّر الظاهر في كل الأقسام |

**نقطة مهمّة:** القائمة كاملة تُمرَّر إلى المحرّك الأصلي (`setQueue`)، فينتقل
إلى الأغنية التالية بنفسه حتى لو توقّف WebView. جافاسكربت تستقبل الحالة فقط.

### ⏰ الوقت (`sections/time/`)
| ملف | الدور |
|---|---|
| `repeat.js` | محرّك التكرار (يومي، أيام أسبوع، كل N يوم، شهري، سنوي + نطاق) |
| `repeatUI.js` | محرّر القاعدة مع معاينة المواعيد القادمة |
| `alarms.js` | إنشاء/جدولة/إلغاء المنبّهات والتذكيرات |
| `timer.js` | المؤقّت التنازلي وساعة الإيقاف |
| `calendar.js` | التقويم الشهري والمهام (مع تكرار وتذكير) |
| `sleep.js` | حاسبة دورات النوم وأفضل أوقات النوم/الاستيقاظ |
| `summary.js` | بناء وعرض ملخّص نهاية اليوم |

**محرّك التكرار مكرّر بدقّة في مكانين:** `repeat.js` (جافاسكربت، للواجهة
والمعاينة) و`RepeatRule.java` (للنظام، ليحسب الموعد التالي بعد كل رنين حتى
والتطبيق مغلق تمامًا). أي تعديل في أحدهما يجب أن ينعكس في الآخر.

قاعدة التكرار:
```js
{ type: 'none'|'daily'|'weekly'|'everyN'|'monthly'|'yearly',
  days: [0..6], interval: N, anchor: ms, from: ms, until: ms, months: [1..12] }
```
مثال «كل ٤ أيام طوال هذا الشهر»: `{ type:'everyN', interval:4, until: نهاية الشهر }`.
ومثال «كل ٣ أيام في تموز فقط»: `{ type:'everyN', interval:3, months:[7] }`.

### 🎯 الالتزامات (`sections/commit/`)
مكتبة `data/exercises.js` (٥٧ تمرينًا في ١٠ فئات + ٦ روتينات). كل تمرين فيه
`howTo` خطوة بخطوة و`bestTime` و`minutes` و`level`. الالتزام = تمرين أو روتين
+ وقت + أيام أسبوع + تذكير، مع سلسلة (streak) تُحسب من سجلّ يومي.
«مشغّل التمرين» يعرض الخطوات مع مؤقّت لكل خطوة ويمنع إطفاء الشاشة.

### 🗺 الأماكن (`sections/places/`)
| ملف | الدور |
|---|---|
| `geo.js` | هافرساين، الاتجاه، إسقاط ويب-مركاتور، قراءة الإحداثيات من نص |
| `tiles.js` | قراءة البلاطات من `IndexedDB`، وتنزيل منطقة عند الطلب فقط |
| `map.js` | خريطة على `canvas`: بلاطات إن وُجدت، وإلا شبكة إحداثيات محسوبة |

الخريطة تعمل بلا إنترنت دائمًا: بلا بلاطات ترسم شبكة خطوط طول وعرض
مسمّاة + مقياس رسم دقيق + علاماتك + موقعك — أي مرجع مكاني حقيقي وليس صورة.
التنزيل الاختياري يضيف الصور فوق ذلك.

### 📈 الإنتاجية (`sections/growth/`)
`data/growth.js`: **١٢٤ عنصرًا** في ١٢ قسمًا (التركيز، إدارة الوقت، التعلّم،
الأنظمة، الانضباط الرقمي، الطاقة، القرار، الإرادة، مهارات لازمة، الإبداع،
المال، التواصل)، كل عنصر فيه *لماذا يهمّ* و*الطريقة* خطوة بخطوة.
+ ٦ مسارات مرتّبة، عنصر يومي ثابت، قائمة تركيز (٥ كحدّ أقصى)، ملاحظات، ونقاط.

---

## 4. العقود مع الطبقة الأصلية

### `MusicLibrary`
```
hasPermission() → { granted }
requestPermission() → { granted }
scan({ minDurationMs }) → { tracks: [{ id, title, artist, album, durationMs,
                                       uri, artUri, size, year, track, addedAt }] }
```

### `Player`
```
setQueue({ tracks[], index, autoPlay })   tracks[i].rawUri هو content:// الأصلي
play() pause() toggle() next() prev() stop()
seek({ positionMs })  seekBy({ deltaMs })
setSpeed({ speed, preservePitch })        setRepeat({ mode })  setShuffle({ shuffle })
setVolume({ volume, balance })            setSleepTimer({ minutes })
setEffects({ enabled, bands[5], bass, virtualizer, reverb, loudness, balance })
getState() → { playing, index, trackId, positionMs, durationMs, speed, repeat, shuffle }
أحداث: 'state' و 'trackChanged' بنفس شكل getState
```
`PlayerService` خدمة أمامية من النوع `mediaPlayback`، تدير `MediaPlayer` +
`MediaSession` (فيظهر التحكّم على شاشة القفل) + `AudioFocus` + سلسلة المؤثرات
على `audioSessionId`. النطاقات الخمسة في الواجهة تُوزَّع خطّيًا على عدد نطاقات
المعادل الفعلي في الجهاز.

### `Scheduler`
```
requestPermissions() → { granted, exact }
canScheduleExact() → { canSchedule }      openExactAlarmSettings()
schedule({ id, at, title, body, soundUri, vibrate, gradual, volume,
           snoozeMin, fullScreen, silent, repeat })
cancel({ id })  cancelAll()  listPending()  notify({ id, title, body, bigText })
حدث: 'alarm' بالنوع fired | snoozed | dismissed
```
مسار الرنين: `AlarmManager.setAlarmClock` → `AlarmReceiver` → `AlarmRinger`
(نغمة مخصّصة، تصاعد تدريجي، اهتزاز) + إشعار بأزرار غفوة/إيقاف +
`AlarmActivity` بملء الشاشة فوق القفل → ثم `AlarmScheduler.rescheduleNext`
يحسب الموعد التالي من `RepeatRule`. المنبّهات محفوظة في `SharedPreferences`
فيعيد `BootReceiver` جدولتها بعد إعادة تشغيل الجهاز.

---

## 5. القرارات وأسبابها

- **بلا إطار عمل**: الحزمة النهائية ~٦٠ ك.ب مضغوطة، وبلا شجرة تبعيات تحتاج تحديثًا.
- **بلا شبكة افتراضيًا**: لا يوجد أي `fetch` في مسار الاستعمال العادي.
  الاستثناء الوحيد هو تنزيل بلاطات الخريطة بضغطة صريحة من المستخدم.
- **القائمة في المحرّك لا في الصفحة**: الطريقة الوحيدة لضمان استمرار التشغيل
  والانتقال للأغنية التالية عند إطفاء الشاشة.
- **`setAlarmClock` وليس `setExact`**: لأنه معفى من قيود Doze ويُظهر أيقونة
  المنبّه في شريط النظام، وهو ما يليق بتطبيق منبّه حقيقي.
- **تكرار محرّك التكرار في لغتين**: مقابل تعقيد بسيط، يعمل التكرار المعقّد
  والتطبيق مغلق تمامًا.
- **خريطة `canvas` بدل مكتبة خرائط**: مكتبات الخرائط تفترض وجود بلاطات من
  الشبكة؛ هنا نحتاج مرجعًا يعمل بلا أي اتصال، فبنينا الإسقاط والرسم مباشرة.

---

## 6. الفحص

```bash
npm run check          # بناء + تصفّح ٢٢ تبويبًا + ٧ مسارات تفاعلية
npm run check -- --shots   # مع حفظ لقطات في docs/shots
```
يسقط الفحص عند أي خطأ في طرفية المتصفّح أو فشل أي مسار
(إضافة منبّه، مهمّة، مؤقّت، التزام، مكان، عنصر إنتاجية، فتح الإعدادات).

الطبقة الأصلية تُتحقَّق بالتصريف مقابل `android.jar` حقيقي؛ بناء APK كامل
يحتاج Android SDK على جهازك.
