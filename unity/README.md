# Unity Core Systems — NarrativeSim.Core

انسخ مجلد `Assets/Scripts/Core` إلى مشروع Unity ‏(2021.3 أو أحدث). لا يحتاج أي حزمة خارجية.

| الملف | يوضع على | الوظيفة |
|---|---|---|
| `NPCController.cs` | كل NPC | آلة الحالات (Idle → Aware → Interacting → Cooldown) + واجهة `IInteractable` |
| `InteractionManager.cs` | اللاعب | يكتشف أقرب هدف، يعرض التلميح، ويستدعي `Interact` |
| `SceneDirector.cs` | كائن مدير بالمشهد | متابعة اللاعب ↔ لقطة ثابتة / مدارية بانتقال ناعم |
| `AnimationSync.cs` | كائن مدير بالمشهد | تشغيل حالة متزامنة على Animator اللاعب والـ NPC |
| `ProgressionSystem.cs` | كائن مدير بالمشهد | متغيرات مخفية + قواعد عتبات تفتح حالات في `AnimationSync` |

## الربط المقترح (Inspector)

1. `InteractionManager.onPromptShown(string)` → نص واجهة التلميح، و`onPromptHidden` → إخفاؤها.
2. `InteractionManager.onInteracted(Transform)` → `SceneDirector.FocusOn` (ربط ديناميكي).
3. `InteractionManager.onInteracted` → `InteractionManager.SetLocked(true)` لإيقاف الفحص أثناء المشهد.
4. `NPCController.onStateChanged` أو أي حدث حوار → `AnimationSync.Play("State_1")`.
5. `AnimationSync.onSyncCompleted` → `NPCController.EndInteraction` و`SceneDirector.ReturnToPlayer`
   و`InteractionManager.SetLocked(false)`.
6. خيارات الحوار → `ProgressionSystem.AddAffection(float)` / `AddCorruption(float)`.
7. في `ProgressionSystem.unlockRules` أضف قاعدة لكل حالة مقفلة، مثل:
   `State_2` ← `Affection >= 50`، و`State_3` ← `Affection >= 70 AND Corruption <= 20`.

## ملاحظات

- **الإدخال:** مع Input Manager القديم يُقرأ `interactKey` تلقائيًا. مع Input System الجديد استدعِ
  `InteractionManager.TryInteract()` من الـ Action.
- **أسماء الحالات:** إن اختلف اسم الحالة بين الـ Animator-ين املأ `playerStateName` و`npcStateName`،
  وإلا يُستخدم المفتاح نفسه. يجب أن تكون الحالة في نفس الطبقة `layer` في الاثنين.
- **المزامنة:** اللاعب هو المرجع الزمني؛ يُصحَّح الـ NPC إن تجاوز الفرق `driftTolerance`.
- **الحفظ:** `ProgressionSystem.ToJson()` / `LoadFromJson(json)`.
