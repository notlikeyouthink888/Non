using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

namespace NarrativeSim.Core
{
    public enum Comparison
    {
        GreaterOrEqual,
        Greater,
        LessOrEqual,
        Less
    }

    /// <summary>تعريف متغير مخفي مع حدوده وقيمته الابتدائية.</summary>
    [Serializable]
    public class StatDefinition
    {
        public string id;
        public float min;
        public float max = 100f;
        public float initial;

        public StatDefinition() { }
        public StatDefinition(string id, float min, float max, float initial)
        {
            this.id = id; this.min = min; this.max = max; this.initial = initial;
        }
    }

    /// <summary>شرط واحد: متغير + مقارنة + عتبة.</summary>
    [Serializable]
    public class StatCondition
    {
        public string statId = ProgressionSystem.Affection;
        public Comparison comparison = Comparison.GreaterOrEqual;
        public float threshold = 50f;

        public bool Evaluate(float value)
        {
            switch (comparison)
            {
                case Comparison.GreaterOrEqual: return value >= threshold;
                case Comparison.Greater:        return value > threshold;
                case Comparison.LessOrEqual:    return value <= threshold;
                case Comparison.Less:           return value < threshold;
                default:                        return false;
            }
        }
    }

    /// <summary>قاعدة فتح: عند تحقق الشروط تُفتح حالة في AnimationSync.</summary>
    [Serializable]
    public class UnlockRule
    {
        public string animationStateKey = "State_2";
        public List<StatCondition> conditions = new List<StatCondition>();
        [Tooltip("true = يجب تحقق كل الشروط (AND). false = يكفي شرط واحد (OR).")]
        public bool requireAll = true;
        [Tooltip("إعادة القفل إن لم تعد الشروط متحققة.")]
        public bool relockWhenUnmet;

        public bool IsSatisfied(Func<string, float> getStat)
        {
            if (conditions.Count == 0) return false;

            foreach (StatCondition c in conditions)
            {
                bool ok = c.Evaluate(getStat(c.statId));
                if (requireAll && !ok) return false;
                if (!requireAll && ok) return true;
            }
            return requireAll;
        }
    }

    [Serializable] public class StatChangedEvent : UnityEvent<string, float, float> { } // (id, old, new)
    [Serializable] public class StateUnlockedEvent : UnityEvent<string> { }

    /// <summary>
    /// يتتبع متغيرات مخفية (Affection، Corruption، أو أي متغير يُعرَّف في الـ Inspector)،
    /// ويقيّم قواعد الفتح بعد كل تغيير ليفتح/يقفل الحالات في AnimationSync.
    /// يدعم الحفظ والتحميل بصيغة JSON.
    /// </summary>
    [DisallowMultipleComponent]
    [DefaultExecutionOrder(100)] // بعد AnimationSync لضمان تهيئة جدوله أولًا
    public class ProgressionSystem : MonoBehaviour
    {
        public const string Affection = "Affection";
        public const string Corruption = "Corruption";

        [SerializeField] private AnimationSync animationSync;

        [SerializeField] private List<StatDefinition> stats = new List<StatDefinition>
        {
            new StatDefinition(Affection, 0f, 100f, 0f),
            new StatDefinition(Corruption, 0f, 100f, 0f)
        };

        [SerializeField] private List<UnlockRule> unlockRules = new List<UnlockRule>();

        [Header("Events")]
        public StatChangedEvent onStatChanged = new StatChangedEvent();
        public StateUnlockedEvent onStateUnlocked = new StateUnlockedEvent();

        private readonly Dictionary<string, StatDefinition> _definitions = new Dictionary<string, StatDefinition>();
        private readonly Dictionary<string, float> _values = new Dictionary<string, float>();

        private void Awake()
        {
            foreach (StatDefinition def in stats)
            {
                if (string.IsNullOrEmpty(def.id) || _definitions.ContainsKey(def.id)) continue;
                _definitions.Add(def.id, def);
                _values[def.id] = Mathf.Clamp(def.initial, def.min, def.max);
            }
        }

        private void Start()
        {
            // تقييم أولي في حال كانت القيم الابتدائية تحقق شروطًا
            EvaluateRules();
        }

        // ---------------- Stats API ----------------

        public bool HasStat(string id) => _definitions.ContainsKey(id);

        public float GetStat(string id) => _values.TryGetValue(id, out float v) ? v : 0f;

        /// <summary>القيمة كنسبة 0..1 بين الحد الأدنى والأقصى.</summary>
        public float GetStatNormalized(string id)
        {
            if (!_definitions.TryGetValue(id, out StatDefinition def)) return 0f;
            return Mathf.InverseLerp(def.min, def.max, GetStat(id));
        }

        public void ModifyStat(string id, float delta) => SetStat(id, GetStat(id) + delta);

        public void SetStat(string id, float value)
        {
            if (!_definitions.TryGetValue(id, out StatDefinition def))
            {
                Debug.LogWarning($"[{nameof(ProgressionSystem)}] Unknown stat '{id}'.", this);
                return;
            }

            float oldValue = _values[id];
            float newValue = Mathf.Clamp(value, def.min, def.max);
            if (Mathf.Approximately(oldValue, newValue)) return;

            _values[id] = newValue;
            onStatChanged.Invoke(id, oldValue, newValue);
            EvaluateRules();
        }

        // أغلفة بمعامل واحد للربط المباشر من UnityEvent في الـ Inspector
        public void AddAffection(float delta) => ModifyStat(Affection, delta);
        public void AddCorruption(float delta) => ModifyStat(Corruption, delta);

        // ---------------- Rules ----------------

        /// <summary>تقييم كل القواعد وتطبيق الفتح/القفل على AnimationSync.</summary>
        public void EvaluateRules()
        {
            if (animationSync == null) return;

            foreach (UnlockRule rule in unlockRules)
            {
                if (string.IsNullOrEmpty(rule.animationStateKey)) continue;

                bool met = rule.IsSatisfied(GetStat);
                bool unlocked = animationSync.IsUnlocked(rule.animationStateKey);

                if (met && !unlocked)
                {
                    if (animationSync.UnlockState(rule.animationStateKey))
                        onStateUnlocked.Invoke(rule.animationStateKey);
                }
                else if (!met && unlocked && rule.relockWhenUnmet)
                {
                    animationSync.LockState(rule.animationStateKey);
                }
            }
        }

        // ---------------- Save / Load ----------------

        [Serializable]
        private class SaveData
        {
            public List<string> ids = new List<string>();
            public List<float> values = new List<float>();
        }

        /// <summary>تصدير القيم الحالية كنص JSON (لنظام الحفظ الخاص بك).</summary>
        public string ToJson()
        {
            var data = new SaveData();
            foreach (KeyValuePair<string, float> kv in _values)
            {
                data.ids.Add(kv.Key);
                data.values.Add(kv.Value);
            }
            return JsonUtility.ToJson(data);
        }

        /// <summary>استيراد القيم من JSON. المتغيرات غير المعرّفة تُتجاهل.</summary>
        public void LoadFromJson(string json)
        {
            if (string.IsNullOrEmpty(json)) return;

            SaveData data = JsonUtility.FromJson<SaveData>(json);
            if (data == null) return;

            int count = Mathf.Min(data.ids.Count, data.values.Count);
            for (int i = 0; i < count; i++)
            {
                if (_definitions.TryGetValue(data.ids[i], out StatDefinition def))
                    _values[def.id] = Mathf.Clamp(data.values[i], def.min, def.max);
            }
            EvaluateRules();
        }

        /// <summary>إعادة كل المتغيرات إلى قيمها الابتدائية.</summary>
        public void ResetAll()
        {
            foreach (StatDefinition def in _definitions.Values)
                SetStat(def.id, def.initial);
        }
    }
}
