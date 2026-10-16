package com.maykrofonak.app;

/**
 * الإعدادات الحيّة المشتركة بين الواجهة وخيط الصوت.
 * خيط الصوت يقرأها مرة واحدة لكل دفعة، فالتغيير يوصل فوراً بدون أقفال.
 */
final class Params {
    /** مستوى الصوت الذي يحاول المايك الوصول له (RMS خطّي). */
    static volatile float targetRms = dbToLin(micPctToDb(60));
    static volatile int effect = Effects.NONE;
    /** كمية المؤثر 0..1 (للصدى والقاعة). */
    static volatile float fxMix = 0.4f;
    static volatile boolean antiFeedback = true;
    static volatile boolean noiseReduction = true;

    private Params() {}

    /** شريط «قوة المايك» 0..100 ← من -32 إلى -12 dBFS. */
    static float micPctToDb(int pct) {
        return -32f + 0.2f * pct;
    }

    static float dbToLin(float db) {
        return (float) Math.pow(10.0, db / 20.0);
    }

    static float linToDb(double lin) {
        return (float) (20.0 * Math.log10(Math.max(lin, 1e-9)));
    }

    /** معامل تنعيم أحادي القطب لثابت زمني بالثواني. */
    static float coef(double seconds, float fs) {
        return (float) (1.0 - Math.exp(-1.0 / (seconds * fs)));
    }
}
