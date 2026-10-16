package com.maykrofonak.app;

/**
 * بوابة ضوضاء ذكية: تتعلّم مستوى ضوضاء الغرفة وحدها، وتخفض الصوت بهدوء لما تسكت
 * (بدون قطع كامل حتى يبقى الصوت طبيعياً). خفض الصوت وقت السكوت يقلّل الصفير أيضاً.
 */
final class NoiseGate {
    private static final float CLOSED_GAIN = 0.12f;   // ‎-18 dB
    private static final float MIN_FLOOR = 3e-5f, MAX_FLOOR = 0.015f;
    private static final float MIN_OPEN = 0.0016f;    // ‎-56 dBFS

    private final float envAtt, envRel, att, rel;
    private final int blockLen, holdLen;
    private float ms;               // متوسط مربّع الإشارة (غلاف)
    private float floor = 0.001f;   // تقدير ضوضاء الخلفية
    private float gain = 1f;
    private double blockSum;
    private int blockCount, hold;
    private boolean open = true;

    NoiseGate(float fs) {
        envAtt = Params.coef(0.005, fs);
        envRel = Params.coef(0.06, fs);
        att = Params.coef(0.003, fs);
        rel = Params.coef(0.15, fs);
        blockLen = Math.max(1, (int) (fs * 0.01f));
        holdLen = (int) (fs * 0.2f);
    }

    /** يحدّث الحالة ويرجّع ربح البوابة لهذه العيّنة. */
    float process(float x) {
        float p = x * x;
        ms += (p - ms) * (p > ms ? envAtt : envRel);

        blockSum += p;
        if (++blockCount >= blockLen) {
            float rms = (float) Math.sqrt(blockSum / blockCount);
            blockSum = 0;
            blockCount = 0;
            // ينزل بسرعة نحو أهدأ مستوى، ويصعد ببطء (≈ 1.3 dB بالثانية)
            if (rms < floor) floor += (rms - floor) * 0.25f;
            else floor *= 1.0015f;
            if (floor < MIN_FLOOR) floor = MIN_FLOOR;
            else if (floor > MAX_FLOOR) floor = MAX_FLOOR;
        }

        float openTh = Math.max(floor * 2.8f, MIN_OPEN);   // ≈ +9 dB فوق الضوضاء
        float closeTh = openTh * 0.6f;
        if (ms > openTh * openTh) {
            open = true;
            hold = holdLen;
        } else if (hold > 0) {
            hold--;
        } else if (ms < closeTh * closeTh) {
            open = false;
        }

        float target = open ? 1f : CLOSED_GAIN;
        gain += (target - gain) * (target > gain ? att : rel);
        return gain;
    }

    boolean isOpen() {
        return open;
    }

    void reset() {
        ms = 0;
        floor = 0.001f;
        gain = 1f;
        blockSum = 0;
        blockCount = 0;
        hold = 0;
        open = true;
    }
}
