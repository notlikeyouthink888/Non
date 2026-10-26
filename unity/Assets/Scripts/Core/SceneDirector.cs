using System;
using UnityEngine;
using UnityEngine.Events;

namespace NarrativeSim.Core
{
    public enum CameraMode
    {
        FollowPlayer,
        Transitioning,
        StaticCinematic,
        OrbitalCinematic
    }

    [Serializable] public class CameraModeEvent : UnityEvent<CameraMode> { }

    /// <summary>
    /// يتحكم بالكاميرا الرئيسية: متابعة اللاعب، ثم انتقال ناعم إلى لقطة سينمائية
    /// ثابتة أو مدارية حول نقطة التفاعل، ثم العودة.
    /// لا يعتمد على Cinemachine. الحركة في LateUpdate بعد تحريك الشخصيات.
    /// </summary>
    [DisallowMultipleComponent]
    public class SceneDirector : MonoBehaviour
    {
        [Header("Camera")]
        [Tooltip("إن تُركت فارغة تُستخدم Camera.main.")]
        [SerializeField] private Camera targetCamera;

        [Header("Follow Mode")]
        [SerializeField] private Transform player;
        [Tooltip("الإزاحة بالنسبة لاتجاه اللاعب (Yaw فقط).")]
        [SerializeField] private Vector3 followOffset = new Vector3(0f, 2f, -4f);
        [SerializeField] private float followLookHeight = 1.5f;
        [SerializeField, Min(0f)] private float followSmoothTime = 0.15f;
        [SerializeField, Min(0f)] private float rotationSharpness = 10f;

        [Header("Transition")]
        [SerializeField, Min(0.01f)] private float transitionDuration = 1.2f;
        [SerializeField] private AnimationCurve transitionCurve = AnimationCurve.EaseInOut(0f, 0f, 1f, 1f);
        [SerializeField] private CameraMode defaultCinematicMode = CameraMode.OrbitalCinematic;

        [Header("Cinematic Framing")]
        [SerializeField] private float focusHeight = 1.2f;
        [SerializeField, Range(10f, 120f)] private float cinematicFieldOfView = 40f;

        [Header("Static Mode")]
        [Tooltip("الإزاحة بالنسبة لاتجاه نقطة التركيز عند عدم تمرير Anchor.")]
        [SerializeField] private Vector3 staticOffset = new Vector3(1.5f, 1.6f, 2.5f);

        [Header("Orbital Mode")]
        [SerializeField, Min(0.1f)] private float orbitRadius = 3.5f;
        [SerializeField] private float orbitHeight = 1.8f;
        [Tooltip("درجة في الثانية. القيمة السالبة تعكس الاتجاه.")]
        [SerializeField] private float orbitSpeed = 12f;

        [Header("Events")]
        public CameraModeEvent onTransitionStarted = new CameraModeEvent();
        public CameraModeEvent onTransitionCompleted = new CameraModeEvent();

        public CameraMode Mode { get; private set; } = CameraMode.FollowPlayer;
        public bool IsCinematic => Mode == CameraMode.StaticCinematic || Mode == CameraMode.OrbitalCinematic;

        // حالة اللقطة الحالية
        private Transform _focus;
        private Transform _staticAnchor;
        private float _orbitAngle;
        private float _followFieldOfView;
        private Vector3 _followVelocity;

        // حالة الانتقال
        private CameraMode _destinationMode;
        private Pose _fromPose;
        private float _fromFieldOfView;
        private float _transitionElapsed;

        private Transform CamTransform => targetCamera.transform;

        private void Awake()
        {
            if (targetCamera == null) targetCamera = Camera.main;
            if (targetCamera == null)
            {
                Debug.LogError($"[{nameof(SceneDirector)}] No camera assigned and no Camera.main found.", this);
                enabled = false;
                return;
            }
            _followFieldOfView = targetCamera.fieldOfView;
        }

        private void LateUpdate()
        {
            float dt = Time.deltaTime;

            switch (Mode)
            {
                case CameraMode.FollowPlayer:
                    UpdateFollow(dt);
                    break;

                case CameraMode.Transitioning:
                    UpdateTransition(dt);
                    break;

                case CameraMode.StaticCinematic:
                case CameraMode.OrbitalCinematic:
                    if (_focus == null) { ReturnToPlayer(); break; } // الهدف حُذف
                    if (Mode == CameraMode.OrbitalCinematic) _orbitAngle += orbitSpeed * dt;
                    ApplyPose(GetPose(Mode));
                    break;
            }
        }

        // ---------------- Public API ----------------

        /// <summary>نقطة دخول مناسبة للربط من UnityEvent (مثل InteractionManager.onInteracted).</summary>
        public void FocusOn(Transform focusTarget)
        {
            if (defaultCinematicMode == CameraMode.StaticCinematic) FocusStatic(focusTarget);
            else FocusOrbital(focusTarget);
        }

        /// <summary>لقطة ثابتة. إن مُرّر cameraAnchor تُؤخذ الوضعية منه حرفيًا.</summary>
        public void FocusStatic(Transform focusTarget, Transform cameraAnchor = null)
        {
            if (focusTarget == null) return;
            _focus = focusTarget;
            _staticAnchor = cameraAnchor;
            BeginTransition(CameraMode.StaticCinematic);
        }

        /// <summary>لقطة مدارية تبدأ من زاوية الكاميرا الحالية لتجنّب القفز.</summary>
        public void FocusOrbital(Transform focusTarget)
        {
            if (focusTarget == null) return;
            _focus = focusTarget;

            Vector3 flat = Vector3.ProjectOnPlane(CamTransform.position - focusTarget.position, Vector3.up);
            _orbitAngle = flat.sqrMagnitude > 0.0001f ? Mathf.Atan2(flat.x, flat.z) * Mathf.Rad2Deg : 0f;

            BeginTransition(CameraMode.OrbitalCinematic);
        }

        /// <summary>العودة الناعمة إلى وضع متابعة اللاعب.</summary>
        public void ReturnToPlayer()
        {
            if (Mode == CameraMode.FollowPlayer) return;
            BeginTransition(CameraMode.FollowPlayer);
        }

        public void SetPlayer(Transform newPlayer) => player = newPlayer;

        // ---------------- Modes ----------------

        private void UpdateFollow(float dt)
        {
            if (player == null) return;

            Pose target = GetPose(CameraMode.FollowPlayer);
            Vector3 pos = Vector3.SmoothDamp(CamTransform.position, target.position, ref _followVelocity, followSmoothTime);
            Quaternion rot = Quaternion.Slerp(CamTransform.rotation, target.rotation, 1f - Mathf.Exp(-rotationSharpness * dt));
            CamTransform.SetPositionAndRotation(pos, rot);
        }

        private void BeginTransition(CameraMode destination)
        {
            // الانطلاق دائمًا من الوضعية الحالية الفعلية، حتى لو قُطع انتقال سابق
            _fromPose = new Pose(CamTransform.position, CamTransform.rotation);
            _fromFieldOfView = targetCamera.fieldOfView;
            _destinationMode = destination;
            _transitionElapsed = 0f;
            Mode = CameraMode.Transitioning;

            onTransitionStarted.Invoke(destination);
        }

        private void UpdateTransition(float dt)
        {
            bool toFollow = _destinationMode == CameraMode.FollowPlayer;
            if ((toFollow && player == null) || (!toFollow && _focus == null))
            {
                FinishTransition();
                return;
            }

            if (_destinationMode == CameraMode.OrbitalCinematic) _orbitAngle += orbitSpeed * dt;

            _transitionElapsed += dt;
            float t = Mathf.Clamp01(_transitionElapsed / transitionDuration);
            float k = transitionCurve.Evaluate(t);

            // الوجهة تُحسب كل إطار لأن الهدف قد يتحرك
            Pose to = GetPose(_destinationMode);
            CamTransform.SetPositionAndRotation(
                Vector3.LerpUnclamped(_fromPose.position, to.position, k),
                Quaternion.SlerpUnclamped(_fromPose.rotation, to.rotation, k));

            float toFov = toFollow ? _followFieldOfView : cinematicFieldOfView;
            targetCamera.fieldOfView = Mathf.LerpUnclamped(_fromFieldOfView, toFov, k);

            if (t >= 1f) FinishTransition();
        }

        private void FinishTransition()
        {
            Mode = _destinationMode;
            _followVelocity = Vector3.zero;
            if (Mode == CameraMode.FollowPlayer) _focus = null;

            onTransitionCompleted.Invoke(Mode);
        }

        // ---------------- Pose Calculation ----------------

        private Pose GetPose(CameraMode mode)
        {
            switch (mode)
            {
                case CameraMode.FollowPlayer:
                {
                    Quaternion yaw = Quaternion.Euler(0f, player.eulerAngles.y, 0f);
                    Vector3 pos = player.position + yaw * followOffset;
                    return LookPose(pos, player.position + Vector3.up * followLookHeight);
                }

                case CameraMode.StaticCinematic:
                {
                    if (_staticAnchor != null)
                        return new Pose(_staticAnchor.position, _staticAnchor.rotation);

                    Quaternion yaw = Quaternion.Euler(0f, _focus.eulerAngles.y, 0f);
                    Vector3 pos = _focus.position + yaw * staticOffset;
                    return LookPose(pos, FocusPoint);
                }

                case CameraMode.OrbitalCinematic:
                {
                    float rad = _orbitAngle * Mathf.Deg2Rad;
                    Vector3 offset = new Vector3(Mathf.Sin(rad) * orbitRadius, orbitHeight, Mathf.Cos(rad) * orbitRadius);
                    return LookPose(_focus.position + offset, FocusPoint);
                }

                default:
                    return new Pose(CamTransform.position, CamTransform.rotation);
            }
        }

        private Vector3 FocusPoint => _focus.position + Vector3.up * focusHeight;

        private static Pose LookPose(Vector3 position, Vector3 lookAt)
        {
            Vector3 dir = lookAt - position;
            Quaternion rot = dir.sqrMagnitude > 0.0001f ? Quaternion.LookRotation(dir, Vector3.up) : Quaternion.identity;
            return new Pose(position, rot);
        }

        private void ApplyPose(Pose pose) => CamTransform.SetPositionAndRotation(pose.position, pose.rotation);
    }
}
