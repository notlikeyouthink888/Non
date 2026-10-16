package com.maykrofonak.app;

import java.util.Arrays;

/**
 * سلسلة معالجة الصوت كاملة، بالترتيب:
 * قطع الترددات الواطية ← مرشّحات منع الصفير ← بوابة الضوضاء ← ضبط المستوى التلقائي
 * ← تحليل الصفير ← المؤثر ← المحدّد ← كتم الأمان.
 *
 * <p>قاعدة مهمّة ضد الصفير: الرفع التلقائي للصوت مسموح فقط إذا صار سكوت خلال آخر 3 ثواني.
 * الكلام الطبيعي دائماً فيه وقفات، أما الصفير فما يسكت، فما نغذّيه أبداً.
 */
final class VoiceChain {
    private final Biquad hpf = new Biquad();
    private final NoiseGate gate;
    private final Leveler leveler;
    private final HowlGuard howl;
    private final Limiter limiter;
    private final Effects.Fx[] fx;
    private final int fadeLen, raiseWindow;
    private final float gainSlew, muteSlew;
    private int sinceClosed;

    private int fxNow = Effects.NONE, fxOld = Effects.NONE, fadeLeft;
    private float gain;      // يبدأ من صفر = دخول ناعم بدون طقّة
    private float outGain;
    private float peak;

    VoiceChain(float fs) {
        hpf.highPass(fs, 80, 0.707);
        gate = new NoiseGate(fs);
        leveler = new Leveler(fs);
        howl = new HowlGuard(fs);
        limiter = new Limiter(fs);
        raiseWindow = (int) (fs * 3f);
        fx = Effects.create(fs);
        fadeLen = Math.max(1, (int) (fs * 0.02f));
        gainSlew = Params.coef(0.02, fs);
        muteSlew = Params.coef(0.004, fs);
    }

    /**
     * يعالج الدفعة في نفس المصفوفة.
     *
     * @param mute كتم فوري (مثلاً لما ينقطع المكبّر ويتحوّل الصوت لسماعة التلفون)
     */
    void process(float[] buf, int n, boolean mute) {
        final float target = Params.targetRms;
        final int want = Effects.clamp(Params.effect);
        final float mix = Params.fxMix;
        final boolean anti = Params.antiFeedback;
        final boolean nr = Params.noiseReduction;
        final float muteTarget = mute ? 0f : 1f;

        if (want != fxNow) {
            fxOld = fxNow;
            fxNow = want;
            fx[want].reset();
            fadeLeft = fadeLen;
        }
        final Effects.Fx cur = fx[fxNow], old = fx[fxOld];

        float pk = 0f;
        for (int i = 0; i < n; i++) {
            float x = hpf.process(buf[i]);
            if (anti) x = howl.filter(x);

            float g = gate.process(x);
            if (nr) x *= g;
            final boolean open = gate.isOpen();
            if (!open) sinceClosed = 0;
            else if (sinceClosed < raiseWindow) sinceClosed++;

            float ceiling = anti ? howl.ceilingDb() : Leveler.MAX_DB;
            float level = leveler.process(x, open, target, ceiling, sinceClosed < raiseWindow);
            float duck = anti ? howl.nextDuck() : 1f;
            gain += (level * duck - gain) * gainSlew;
            x *= gain;

            if (anti) howl.analyze(x);

            float y = cur.process(x, mix);
            if (fadeLeft > 0) {
                float t = fadeLeft / (float) fadeLen;
                y = y * (1f - t) + old.process(x, mix) * t;
                fadeLeft--;
            }

            y = limiter.process(y);
            outGain += (muteTarget - outGain) * muteSlew;
            y *= outGain;

            buf[i] = y;
            float a = Math.abs(y);
            if (!(a <= pk)) pk = a;   // بهذه الصيغة الـ NaN يوصل للفحص تحت
        }

        if (!(pk < 4f)) {   // NaN أو قيمة شاذّة: نصفّر كل شيء بدل ما يطلع ضجيج
            reset();
            Arrays.fill(buf, 0, n, 0f);
            pk = 0f;
        }
        peak = pk;
    }

    /** أعلى قيمة في آخر دفعة (0..1) لعدّاد المستوى. */
    float peak() {
        return peak;
    }

    HowlGuard howl() {
        return howl;
    }

    Leveler leveler() {
        return leveler;
    }

    void reset() {
        hpf.reset();
        gate.reset();
        leveler.reset();
        howl.reset();
        limiter.reset();
        sinceClosed = 0;
        for (Effects.Fx f : fx) f.reset();
        gain = 0f;
        outGain = 0f;
        fadeLeft = 0;
    }
}
