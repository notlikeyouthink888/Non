using UnityEngine;
using UnityEngine.Events;

namespace NarrativeSim.Core
{
    /// <summary>حالات الشخصية غير القابلة للعب (NPC).</summary>
    public enum NPCState
    {
        Idle,        // خامل، لا أحد قريب
        Aware,       // اللاعب قريب والتركيز عليه
        Interacting, // تفاعل جارٍ
        Cooldown     // فترة انتظار قصيرة بعد انتهاء التفاعل
    }

    /// <summary>حدث تغيّر الحالة: (الحالة السابقة، الحالة الجديدة).</summary>
    [System.Serializable]
    public class NPCStateChangedEvent : UnityEvent<NPCState, NPCState> { }

    /// <summary>
    /// عقد عام لأي كائن قابل للتفاعل؛ يسمح لـ InteractionManager بالعمل
    /// مع أي نوع (NPC، باب، غرض...) دون الاعتماد على صنف محدد.
    /// </summary>
    public interface IInteractable
    {
        string PromptText { get; }
        Transform InteractionPoint { get; }
        bool CanInteract(GameObject interactor);
        void OnFocusEnter(GameObject interactor);
        void OnFocusExit(GameObject interactor);
        void Interact(GameObject interactor);
    }

    /// <summary>
    /// آلة حالات بسيطة للـ NPC. تُستدعى من InteractionManager
    /// وتطلق حدثًا عند كل تغيّر حالة لربط الأنظمة الأخرى عبر الـ Inspector.
    /// </summary>
    [DisallowMultipleComponent]
    public class NPCController : MonoBehaviour, IInteractable
    {
        [Header("Interaction")]
        [SerializeField] private string promptText = "Press E to interact";
        [Tooltip("النقطة التي تركّز عليها الكاميرا. إن تُركت فارغة يُستخدم transform الكائن.")]
        [SerializeField] private Transform interactionPoint;
        [SerializeField, Min(0f)] private float cooldownDuration = 1f;

        [Header("Animator (optional)")]
        [SerializeField] private Animator animator;
        [Tooltip("اسم معامل Integer في الـ Animator يُضبط على رقم الحالة. اتركه فارغًا لتعطيله.")]
        [SerializeField] private string stateParameter = "NPCState";

        [Header("Events")]
        public NPCStateChangedEvent onStateChanged = new NPCStateChangedEvent();

        public NPCState CurrentState { get; private set; } = NPCState.Idle;
        public Animator Animator => animator;

        public string PromptText => promptText;
        public Transform InteractionPoint => interactionPoint != null ? interactionPoint : transform;

        private float _cooldownTimer;
        private int _stateParamHash;
        private bool _hasStateParam;

        private void Awake()
        {
            if (animator == null) animator = GetComponentInChildren<Animator>();
            CacheAnimatorParameter();
        }

        private void Update()
        {
            if (CurrentState != NPCState.Cooldown) return;

            _cooldownTimer -= Time.deltaTime;
            if (_cooldownTimer <= 0f) SetState(NPCState.Idle);
        }

        // ---------------- IInteractable ----------------

        public bool CanInteract(GameObject interactor) =>
            CurrentState == NPCState.Idle || CurrentState == NPCState.Aware;

        public void OnFocusEnter(GameObject interactor)
        {
            if (CurrentState == NPCState.Idle) SetState(NPCState.Aware);
        }

        public void OnFocusExit(GameObject interactor)
        {
            if (CurrentState == NPCState.Aware) SetState(NPCState.Idle);
        }

        public void Interact(GameObject interactor)
        {
            if (!CanInteract(interactor)) return;
            SetState(NPCState.Interacting);
        }

        // ---------------- Public API ----------------

        /// <summary>يُستدعى عند انتهاء التفاعل (من حوار، تسلسل، أو حدث أنيميشن).</summary>
        public void EndInteraction()
        {
            if (CurrentState != NPCState.Interacting) return;

            _cooldownTimer = cooldownDuration;
            SetState(cooldownDuration > 0f ? NPCState.Cooldown : NPCState.Idle);
        }

        /// <summary>تغيير الحالة مباشرة مع إطلاق الحدث ومزامنة معامل الـ Animator.</summary>
        public void SetState(NPCState newState)
        {
            if (newState == CurrentState) return;

            NPCState previous = CurrentState;
            CurrentState = newState;

            if (_hasStateParam) animator.SetInteger(_stateParamHash, (int)newState);

            onStateChanged.Invoke(previous, newState);
        }

        // ---------------- Internals ----------------

        private void CacheAnimatorParameter()
        {
            _hasStateParam = false;
            if (animator == null || string.IsNullOrEmpty(stateParameter)) return;

            _stateParamHash = Animator.StringToHash(stateParameter);
            foreach (AnimatorControllerParameter p in animator.parameters)
            {
                if (p.nameHash == _stateParamHash && p.type == AnimatorControllerParameterType.Int)
                {
                    _hasStateParam = true;
                    break;
                }
            }
        }
    }
}
