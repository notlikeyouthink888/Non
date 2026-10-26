using System;
using UnityEngine;
using UnityEngine.Events;

namespace NarrativeSim.Core
{
    [Serializable] public class PromptEvent : UnityEvent<string> { }
    [Serializable] public class InteractionPointEvent : UnityEvent<Transform> { }

    /// <summary>
    /// يوضع على اللاعب. يفحص دوريًا الكائنات القابلة للتفاعل القريبة،
    /// يختار أفضل هدف (الأقرب والأكثر مواجهةً)، يعرض/يخفي التلميح،
    /// ويستدعي Interact على الهدف عند الضغط على زر التفاعل.
    /// </summary>
    [DisallowMultipleComponent]
    public class InteractionManager : MonoBehaviour
    {
        [Header("Detection")]
        [Tooltip("نقطة الفحص (عادةً رأس اللاعب). إن تُركت فارغة يُستخدم transform اللاعب.")]
        [SerializeField] private Transform detectionOrigin;
        [SerializeField, Min(0.1f)] private float detectionRadius = 2.5f;
        [SerializeField] private LayerMask interactableLayers = ~0;
        [Tooltip("أقصى زاوية بين اتجاه اللاعب والهدف.")]
        [SerializeField, Range(0f, 180f)] private float maxViewAngle = 75f;
        [Tooltip("الفاصل الزمني بين عمليات الفحص بالثواني (لتقليل الكلفة).")]
        [SerializeField, Min(0f)] private float scanInterval = 0.1f;
        [SerializeField, Min(1)] private int maxColliders = 16;

        [Header("Line of Sight")]
        [SerializeField] private bool requireLineOfSight = true;
        [SerializeField] private LayerMask occlusionLayers = ~0;

        [Header("Input")]
        [Tooltip("يعمل مع Input Manager القديم فقط. مع Input System الجديد استدعِ TryInteract() من الـ Action.")]
        [SerializeField] private KeyCode interactKey = KeyCode.E;

        [Header("Events")]
        public PromptEvent onPromptShown = new PromptEvent();
        public UnityEvent onPromptHidden = new UnityEvent();
        [Tooltip("يمرّر نقطة التفاعل — يمكن ربطه مباشرة بـ SceneDirector.FocusOn.")]
        public InteractionPointEvent onInteracted = new InteractionPointEvent();

        /// <summary>حدث برمجي يمرّر الهدف نفسه.</summary>
        public event Action<IInteractable> Interacted;

        public IInteractable CurrentTarget { get; private set; }
        public bool IsLocked { get; private set; }

        private Collider[] _buffer;
        private float _scanTimer;

        private Transform Origin => detectionOrigin != null ? detectionOrigin : transform;

        private void Awake()
        {
            _buffer = new Collider[maxColliders];
        }

        private void OnDisable()
        {
            SetTarget(null);
        }

        private void Update()
        {
            if (IsLocked) return;

            _scanTimer -= Time.deltaTime;
            if (_scanTimer <= 0f)
            {
                _scanTimer = scanInterval;
                SetTarget(FindBestTarget());
            }

#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKeyDown(interactKey)) TryInteract();
#endif
        }

        // ---------------- Public API ----------------

        /// <summary>محاولة التفاعل مع الهدف الحالي. آمنة للاستدعاء من أي نظام إدخال.</summary>
        public bool TryInteract()
        {
            if (IsLocked || !IsAlive(CurrentTarget)) return false;
            if (!CurrentTarget.CanInteract(gameObject)) return false;

            IInteractable target = CurrentTarget;
            target.Interact(gameObject);

            onPromptHidden.Invoke();
            onInteracted.Invoke(target.InteractionPoint);
            Interacted?.Invoke(target);
            return true;
        }

        /// <summary>إيقاف الفحص والإدخال (مثلًا أثناء مشهد سينمائي).</summary>
        public void SetLocked(bool locked)
        {
            IsLocked = locked;
            if (locked) SetTarget(null);
            else _scanTimer = 0f; // فحص فوري عند فك القفل
        }

        // ---------------- Detection ----------------

        private IInteractable FindBestTarget()
        {
            Vector3 origin = Origin.position;
            int count = Physics.OverlapSphereNonAlloc(
                origin, detectionRadius, _buffer, interactableLayers, QueryTriggerInteraction.Collide);

            IInteractable best = null;
            float bestScore = float.MaxValue;
            Vector3 forward = Vector3.ProjectOnPlane(transform.forward, Vector3.up).normalized;

            for (int i = 0; i < count; i++)
            {
                Collider col = _buffer[i];
                if (col.transform.IsChildOf(transform)) continue; // تجاهل اللاعب نفسه

                IInteractable candidate = col.GetComponentInParent<IInteractable>();
                if (candidate == null || !candidate.CanInteract(gameObject)) continue;

                Vector3 point = candidate.InteractionPoint.position;
                Vector3 toTarget = Vector3.ProjectOnPlane(point - origin, Vector3.up);
                float distance = toTarget.magnitude;
                float angle = distance > 0.001f ? Vector3.Angle(forward, toTarget) : 0f;
                if (angle > maxViewAngle) continue;

                if (requireLineOfSight && IsOccluded(origin, point, candidate)) continue;

                // النتيجة: المسافة مع عقوبة بسيطة للزاوية لتفضيل ما يواجهه اللاعب
                float score = distance * (1f + angle / 180f);
                if (score < bestScore)
                {
                    bestScore = score;
                    best = candidate;
                }
            }

            return best;
        }

        private bool IsOccluded(Vector3 from, Vector3 to, IInteractable candidate)
        {
            if (!Physics.Linecast(from, to, out RaycastHit hit, occlusionLayers, QueryTriggerInteraction.Ignore))
                return false;

            // الاصطدام بالهدف نفسه أو باللاعب لا يُعدّ حاجبًا
            Transform targetRoot = candidate is Component c ? c.transform : candidate.InteractionPoint;
            return !hit.transform.IsChildOf(targetRoot) && !hit.transform.IsChildOf(transform);
        }

        private void SetTarget(IInteractable newTarget)
        {
            if (!IsAlive(CurrentTarget)) CurrentTarget = null;
            if (ReferenceEquals(newTarget, CurrentTarget)) return;

            if (CurrentTarget != null)
            {
                CurrentTarget.OnFocusExit(gameObject);
                onPromptHidden.Invoke();
            }

            CurrentTarget = newTarget;

            if (CurrentTarget != null)
            {
                CurrentTarget.OnFocusEnter(gameObject);
                onPromptShown.Invoke(CurrentTarget.PromptText);
            }
        }

        /// <summary>يتعامل مع "null" الخاص بـ Unity للكائنات المحذوفة.</summary>
        private static bool IsAlive(IInteractable target) =>
            target is UnityEngine.Object obj ? obj != null : target != null;

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(0.2f, 0.8f, 1f, 0.35f);
            Gizmos.DrawWireSphere(Origin.position, detectionRadius);
        }
#endif
    }
}
