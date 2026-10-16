package com.maykrofonak.app;

import android.content.Context;
import android.content.SharedPreferences;

/** حفظ اختيارات المستخدم ونقلها فوراً لخيط الصوت عبر {@link Params}. */
final class Prefs {
    private static final String FILE = "maykrofonak";
    private static final String MIC = "mic", FX = "fx", FX_AMOUNT = "fx_amount", ANTI = "anti_feedback", NOISE = "noise";

    static int micPct = 60;
    static int fxPct = 40;
    static int effect = Effects.NONE;
    static boolean antiFeedback = true;
    static boolean noiseReduction = true;
    private static boolean loaded;

    private Prefs() {}

    static synchronized void load(Context c) {
        if (loaded) return;
        SharedPreferences p = c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        micPct = clampPct(p.getInt(MIC, 60));
        fxPct = clampPct(p.getInt(FX_AMOUNT, 40));
        effect = Effects.clamp(p.getInt(FX, Effects.NONE));
        antiFeedback = p.getBoolean(ANTI, true);
        noiseReduction = p.getBoolean(NOISE, true);
        loaded = true;
        publish();
    }

    static void setMic(Context c, int pct) {
        micPct = clampPct(pct);
        save(c);
    }

    static void setFxAmount(Context c, int pct) {
        fxPct = clampPct(pct);
        save(c);
    }

    static void setEffect(Context c, int fx) {
        effect = Effects.clamp(fx);
        save(c);
    }

    static void setAntiFeedback(Context c, boolean on) {
        antiFeedback = on;
        save(c);
    }

    static void setNoiseReduction(Context c, boolean on) {
        noiseReduction = on;
        save(c);
    }

    private static void save(Context c) {
        publish();
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
                .putInt(MIC, micPct)
                .putInt(FX_AMOUNT, fxPct)
                .putInt(FX, effect)
                .putBoolean(ANTI, antiFeedback)
                .putBoolean(NOISE, noiseReduction)
                .apply();
    }

    private static void publish() {
        Params.targetRms = Params.dbToLin(Params.micPctToDb(micPct));
        Params.fxMix = fxPct / 100f;
        Params.effect = effect;
        Params.antiFeedback = antiFeedback;
        Params.noiseReduction = noiseReduction;
    }

    private static int clampPct(int v) {
        return Math.max(0, Math.min(100, v));
    }
}
