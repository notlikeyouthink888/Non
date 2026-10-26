using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

namespace NarrativeSim.Core
{
    /// <summary>
    /// تعريف حالة متزامنة: مفتاح واحد (مثل "State_1") يُترجم إلى اسم حالة
    /// في كل Animator. إن تُرك الاسم فارغًا يُستخدم المفتاح نفسه.
    /// </summary>
    [Serializable]
    public class SyncStateDefinition
    {
        public string key = "State_1";
        public string playerStateName;
        public string npcStateName;
        [Min(0)] public int layer;
        [Min(0f)] public float crossFadeDuration = 0.2f;
        public bool unlockedByDefault;

        [NonSerialized] public int playerHash;
        [NonSerialized] public int npcHash;

        public void Cache()
        {
            playerHash = Animator.StringToHash(string.IsNullOrEmpty(playerStateName) ? key : playerStateName);
            npcHash = Animator.StringToHash(string.IsNullOrEmpty(npcStateName) ? key : npcStateName);
        }
    }

    [Serializable] public class SyncStateEvent : UnityEvent<string> { }

    /// <summary>
    /// يشغّل حالات أنيميشن متزامنة على Animator اللاعب و Animator الـ NPC
    /// في نفس الإطار، مع محاذاة اختيارية للمواقع وتصحيح الانحراف الزمني.
    /// الحالات مقفلة افتراضيًا ويفتحها ProgressionSystem أو أي نظام آخر.
    /// </summary>
    [DisallowMultipleComponent]
    public class AnimationSync : MonoBehaviour
    {
        [Header("Animators")]
        [SerializeField] private Animator playerAnimator;
        [SerializeField] private Animator npcAnimator;

        [Header("States")]
        [SerializeField] private List<SyncStateDefinition> states = new List<SyncStateDefinition>();
        [Tooltip("الحالة التي يعود إليها الطرفان عند Stop().")]
        [SerializeField] private string idleStateName = "Idle";
        [SerializeField, Min(0f)] private float idleCrossFade = 0.25f;

        [Header("Alignment")]
        [Tooltip("نقل اللاعب إلى موضع محدد بالنسبة للـ NPC قبل التشغيل.")]
        [SerializeField] private bool alignActors = true;
        [SerializeField] private Vector3 playerOffsetFromNpc = new Vector3(0f, 0f, 1f);

        [Header("Sync Enforcement")]
        [SerializeField] private bool enforceSync = true;
        [Tooltip("أقصى فرق مسموح في normalizedTime قبل التصحيح.")]
        [SerializeField, Range(0.001f, 0.2f)] private float driftTolerance = 0.02f;

        [Header("Events")]
        public SyncStateEvent onSyncStarted = new SyncStateEvent();
        public SyncStateEvent onSyncCompleted = new SyncStateEvent();
        public SyncStateEvent onSyncStopped = new SyncStateEvent();
        public SyncStateEvent onStateUnlocked = new SyncStateEvent();
        public SyncStateEvent onStateLocked = new SyncStateEvent();

        public string ActiveKey => _active?.key;
        public bool IsPlaying => _active != null;

        private readonly Dictionary<string, SyncStateDefinition> _lookup = new Dictionary<string, SyncStateDefinition>();
        private readonly HashSet<string> _unlocked = new HashSet<string>();
        private SyncStateDefinition _active;
        private bool _activeEntered; // هل دخل الطرفان الحالة فعليًا (بعد الـ CrossFade)
        private int _idleHash;

        private void Awake()
        {
            _idleHash = Animator.StringToHash(idleStateName);
            foreach (SyncStateDefinition def in states)
            {
                if (string.IsNullOrEmpty(def.key)) continue;
                if (_lookup.ContainsKey(def.key))
                {
                    Debug.LogWarning($"[{nameof(AnimationSync)}] Duplicate key '{def.key}' ignored.", this);
                    continue;
                }
                def.Cache();
                _lookup.Add(def.key, def);
                if (def.unlockedByDefault) _unlocked.Add(def.key);
            }
        }

        private void Update()
        {
            if (_active == null || playerAnimator == null || npcAnimator == null) return;

            int layer = _active.layer;
            if (playerAnimator.IsInTransition(layer) || npcAnimator.IsInTransition(layer)) return;

            AnimatorStateInfo p = playerAnimator.GetCurrentAnimatorStateInfo(layer);
            AnimatorStateInfo n = npcAnimator.GetCurrentAnimatorStateInfo(layer);
            bool playerIn = Matches(p, _active.playerHash);
            bool npcIn = Matches(n, _active.npcHash);

            if (!_activeEntered)
            {
                if (playerIn && npcIn) _activeEntered = true;
                return;
            }

            // خرج أحدهما من الحالة (انتقال داخل الـ Controller) => انتهت المزامنة
            if (!playerIn || !npcIn)
            {
                Complete();
                return;
            }

            // تصحيح الانحراف: اللاعب هو المرجع الزمني
            if (enforceSync && Mathf.Abs(p.normalizedTime - n.normalizedTime) > driftTolerance)
                npcAnimator.Play(_active.npcHash, layer, p.normalizedTime);

            if (!p.loop && p.normalizedTime >= 1f) Complete();
        }

        // ---------------- Playback ----------------

        /// <summary>غلاف void للربط من UnityEvent بمعامل نصي.</summary>
        public void Play(string key) => TryPlay(key);

        /// <summary>تشغيل حالة متزامنة. تعيد false إن كانت مقفلة أو غير موجودة.</summary>
        public bool TryPlay(string key)
        {
            if (playerAnimator == null || npcAnimator == null)
            {
                Debug.LogWarning($"[{nameof(AnimationSync)}] Missing Animator reference.", this);
                return false;
            }
            if (!_lookup.TryGetValue(key, out SyncStateDefinition def))
            {
                Debug.LogWarning($"[{nameof(AnimationSync)}] Unknown state key '{key}'.", this);
                return false;
            }
            if (!_unlocked.Contains(key)) return false;

            if (!playerAnimator.HasState(def.layer, def.playerHash) || !npcAnimator.HasState(def.layer, def.npcHash))
            {
                Debug.LogWarning($"[{nameof(AnimationSync)}] State '{key}' missing on one of the Animators (layer {def.layer}).", this);
                return false;
            }

            if (alignActors) AlignActors();

            // التشغيل في نفس الإطار وبنفس الإزاحة الزمنية = بداية متطابقة
            playerAnimator.CrossFadeInFixedTime(def.playerHash, def.crossFadeDuration, def.layer, 0f);
            npcAnimator.CrossFadeInFixedTime(def.npcHash, def.crossFadeDuration, def.layer, 0f);

            _active = def;
            _activeEntered = false;
            onSyncStarted.Invoke(key);
            return true;
        }

        /// <summary>إيقاف المزامنة الحالية وإعادة الطرفين إلى حالة الخمول.</summary>
        public void Stop()
        {
            if (_active == null) return;

            string key = _active.key;
            int layer = _active.layer;
            _active = null;

            if (playerAnimator != null && playerAnimator.HasState(layer, _idleHash))
                playerAnimator.CrossFadeInFixedTime(_idleHash, idleCrossFade, layer);
            if (npcAnimator != null && npcAnimator.HasState(layer, _idleHash))
                npcAnimator.CrossFadeInFixedTime(_idleHash, idleCrossFade, layer);

            onSyncStopped.Invoke(key);
        }

        /// <summary>تبديل الـ NPC وقت التشغيل (عند وجود أكثر من NPC).</summary>
        public void SetNpcAnimator(Animator animator)
        {
            if (_active != null) Stop();
            npcAnimator = animator;
        }

        // ---------------- Unlocking ----------------

        public bool IsUnlocked(string key) => _unlocked.Contains(key);
        public bool HasState(string key) => _lookup.ContainsKey(key);
        public IReadOnlyCollection<string> UnlockedStates => _unlocked;

        /// <summary>فتح حالة. تعيد true فقط إن فُتحت الآن لأول مرة.</summary>
        public bool UnlockState(string key)
        {
            if (!_lookup.ContainsKey(key))
            {
                Debug.LogWarning($"[{nameof(AnimationSync)}] Cannot unlock unknown key '{key}'.", this);
                return false;
            }
            if (!_unlocked.Add(key)) return false;

            onStateUnlocked.Invoke(key);
            return true;
        }

        public bool LockState(string key)
        {
            if (!_unlocked.Remove(key)) return false;

            if (_active != null && _active.key == key) Stop();
            onStateLocked.Invoke(key);
            return true;
        }

        // ---------------- Internals ----------------

        private void Complete()
        {
            string key = _active.key;
            _active = null;
            onSyncCompleted.Invoke(key);
        }

        private void AlignActors()
        {
            Transform npc = npcAnimator.transform;
            Transform playerT = playerAnimator.transform;

            Vector3 targetPos = npc.position + npc.rotation * playerOffsetFromNpc;
            Vector3 lookDir = Vector3.ProjectOnPlane(npc.position - targetPos, Vector3.up);
            Quaternion targetRot = lookDir.sqrMagnitude > 0.0001f ? Quaternion.LookRotation(lookDir) : playerT.rotation;

            // CharacterController يتجاهل تغيير الموضع المباشر ما لم يُعطَّل مؤقتًا
            CharacterController cc = playerT.GetComponentInParent<CharacterController>();
            Transform root = cc != null ? cc.transform : playerT;
            bool ccWasEnabled = cc != null && cc.enabled;
            if (ccWasEnabled) cc.enabled = false;

            root.SetPositionAndRotation(targetPos, targetRot);

            if (ccWasEnabled) cc.enabled = true;
        }

        private static bool Matches(AnimatorStateInfo info, int hash) =>
            info.shortNameHash == hash || info.fullPathHash == hash;
    }
}
