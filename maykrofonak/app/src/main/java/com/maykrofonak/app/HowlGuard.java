package com.maykrofonak.app;

/**
 * مانع الصفير (Feedback suppressor).
 *
 * لما يكون التلفون قريب من المكبّر، الصوت يدور بحلقة ويصير صفير. مع البلوتوث التأخير
 * طويل (≈ ربع ثانية) فالصفير ما يكون نغمة وحدة نقية، بل «عنقود» ضيّق من ترددات متقاربة.
 * هذا الصنف يحلّل الطيف باستمرار ويميّز الصفير عن الكلام والغناء بعلامات:
 * <ul>
 *   <li>منطقة ضيّقة أعلى بكثير من كل جيرانها (الكلام توافقياته متقاربة القوة)،</li>
 *   <li>بلا توافقيات عند الضعف والنصف (الصوت البشري دائماً فيه توافقيات)،</li>
 *   <li>ثابتة بنفس التردد لفترة، أو تكبر بسرعة من دورة لدورة.</li>
 * </ul>
 * لما يكتشفه يحط مرشّحاً قاطعاً بعرض العنقود بالضبط، ويخفض الصوت لحظياً حتى يختفي،
 * ويتذكّر أن الجهاز قريب من حد الصفير فيخفّض سقف التضخيم قليلاً.
 */
final class HowlGuard {
    static final int MAX_NOTCHES = 12;
    private static final float FIRST_CUT_DB = -10f, STRONG_CUT_DB = -15f, STEP_DB = -5f, MAX_CUT_DB = -30f;
    private static final float MIN_HZ = 150f, MAX_HZ = 8000f;
    private static final float CONFIRM_SCORE = 6f, CONFIRM_FAST = 3f, SCORE_DECAY = 0.97f;
    private static final int TRACKS = 4, EXCL = 5, NEIGH = 24, TRACK = 3;
    private static final float CEILING_STEP = 1.5f, CEILING_MIN = 9f;

    private final float fs, binHz;
    private final int n, hop, mask;
    private final float[] ring, win, re, im, pow;
    private final Fft fft;
    private int wpos, sinceFrame;

    private final Biquad[] notch = new Biquad[MAX_NOTCHES];
    private final float[] notchHz = new float[MAX_NOTCHES];
    private final float[] notchDb = new float[MAX_NOTCHES];
    private final float[] notchQ = new float[MAX_NOTCHES];
    private final float[] notchScore = new float[MAX_NOTCHES];
    private int notchCount, nextSlot;

    // مسارات مرشّحة: كل تردد مشكوك فيه يجمع نقاط تتلاشى ببطء،
    // فالصفير المتقطّع (نبضات تدور بالحلقة كل ربع ثانية) يُكشف أيضاً.
    private final int[] trackBin = new int[TRACKS];
    private final float[] trackScore = new float[TRACKS];
    private final float[] trackFirstDb = new float[TRACKS];
    private float duck = 1f;
    private final float duckRecover;
    private float ceilingDb = Leveler.MAX_DB;
    private int detections;

    HowlGuard(float fs) {
        this.fs = fs;
        n = fs > 32000 ? 2048 : 1024;
        binHz = fs / n;
        hop = n / 2;
        mask = n - 1;
        ring = new float[n];
        win = new float[n];
        for (int i = 0; i < n; i++) win[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
        re = new float[n];
        im = new float[n];
        pow = new float[n / 2 + 1];
        fft = new Fft(n);
        for (int i = 0; i < MAX_NOTCHES; i++) notch[i] = new Biquad();
        duckRecover = Params.coef(0.6, fs);
    }

    /** يطبّق المرشّحات القاطعة على العيّنة. */
    float filter(float x) {
        for (int i = 0; i < notchCount; i++) x = notch[i].process(x);
        return x;
    }

    /** ربح الخفض المؤقت بعد اكتشاف صفير (يرجع لـ 1 تدريجياً). */
    float nextDuck() {
        duck += (1f - duck) * duckRecover;
        return duck;
    }

    /** يغذّي المحلّل بعيّنة (بعد الربح وقبل المؤثرات). */
    void analyze(float x) {
        ring[wpos] = x;
        wpos = (wpos + 1) & mask;
        if (++sinceFrame >= hop) {
            sinceFrame = 0;
            frame();
        }
    }

    private void frame() {
        for (int i = 0; i < n; i++) {
            re[i] = ring[(wpos + i) & mask] * win[i];   // wpos = أقدم عيّنة
            im[i] = 0f;
        }
        fft.forward(re, im);
        int half = n / 2;
        for (int k = 0; k <= half; k++) pow[k] = re[k] * re[k] + im[k] * im[k];

        int kMin = Math.max(NEIGH + 1, (int) Math.ceil(MIN_HZ / binHz));
        int kMax = Math.min(half - NEIGH - 1, (int) (MAX_HZ / binHz));
        int best = -1;
        float bestP = 0f;
        double sum = 0;
        for (int k = kMin; k <= kMax; k++) {
            float p = pow[k];
            sum += p;
            if (p > bestP && p >= pow[k - 1] && p >= pow[k + 1]) {
                best = k;
                bestP = p;
            }
        }

        if (best > 0) watchNotches(bestP);

        boolean howl = false, strong = false;
        float peakDb = -200f;
        if (best > 0 && bestP > 0) {
            double rest = sum;
            for (int k = Math.max(kMin, best - EXCL); k <= Math.min(kMax, best + EXCL); k++) rest -= pow[k];
            float mean = (float) Math.max(rest / (kMax - kMin + 1 - (2 * EXCL + 1)), 1e-20);
            float amp = 4f * (float) Math.sqrt(bestP) / n;   // سعة تقريبية (نافذة Hann)
            float papr = 10f * (float) Math.log10(bestP / mean);
            float prominence = 10f * (float) Math.log10(bestP / neighbourMax(best));
            peakDb = 10f * (float) Math.log10(bestP);
            // نغمة نقية جداً تُلتقط حتى لو بعدها واطية (صفير يكبر ببطء)
            howl = ((amp >= 0.015f && papr >= 15f && prominence >= 14f) || (amp >= 0.004f && papr >= 25f && prominence >= 20f))
                    && harmonicFree(best, bestP);
            strong = howl && amp >= 0.06f && papr >= 24f && prominence >= 22f;
        }

        for (int i = 0; i < TRACKS; i++) trackScore[i] *= SCORE_DECAY;
        if (!howl) return;

        int t = -1;
        for (int i = 0; i < TRACKS; i++) {
            if (trackScore[i] > 0.05f && Math.abs(trackBin[i] - best) <= TRACK) {
                t = i;
                break;
            }
        }
        if (t < 0) {
            t = 0;
            for (int i = 1; i < TRACKS; i++) if (trackScore[i] < trackScore[t]) t = i;
            trackScore[t] = 0f;
            trackFirstDb[t] = peakDb;
        }
        trackBin[t] = best;
        trackScore[t] += 1f;
        boolean growing = peakDb - trackFirstDb[t] >= 6f;

        if (trackScore[t] >= CONFIRM_SCORE || ((strong || growing) && trackScore[t] >= CONFIRM_FAST)) {
            float hz = refine(best) * binHz;
            placeNotch(hz, qFor(best, bestP, hz), strong ? STRONG_CUT_DB : FIRST_CUT_DB);
            duck = 0.35f;
            ceilingDb = Math.max(CEILING_MIN, ceilingDb - CEILING_STEP);
            detections++;
            trackScore[t] = 0f;
        }
    }

    /**
     * مراقبة الترددات اللي سبق وقطعناها: إذا رجع الصفير يسيطر عندها (حتى لو مو نقي
     * بسبب تقطيع البوابة)، نعمّق القطع ونوسّعه قليلاً.
     */
    private void watchNotches(float globalMax) {
        for (int i = 0; i < notchCount; i++) {
            notchScore[i] *= SCORE_DECAY;
            int c = Math.round(notchHz[i] / binHz);
            int lo = Math.max(1, c - TRACK), hi = Math.min(n / 2 - 1, c + TRACK);
            float p = 0f;
            int k = c;
            for (int j = lo; j <= hi; j++) {
                if (pow[j] > p) {
                    p = pow[j];
                    k = j;
                }
            }
            float amp = 4f * (float) Math.sqrt(p) / n;
            boolean dominant = p >= globalMax * 0.5f && amp >= 0.004f && p >= 4f * neighbourMax(k);
            if (!dominant) continue;
            notchScore[i] += 1f;
            if (notchScore[i] >= CONFIRM_SCORE && notchDb[i] > MAX_CUT_DB) {
                notchDb[i] = Math.max(notchDb[i] + STEP_DB, MAX_CUT_DB);
                notchQ[i] = Math.max(4f, notchQ[i] * 0.8f);
                notch[i].peaking(fs, notchHz[i], notchQ[i], notchDb[i]);
                notchScore[i] = 0f;
                duck = 0.35f;
                detections++;
            }
        }
    }

    /** أقوى طاقة في الجوار الأبعد (±6..24 bin ≈ ±140..560 Hz). */
    private float neighbourMax(int k) {
        float m = 1e-20f;
        for (int d = EXCL + 1; d <= NEIGH; d++) {
            if (pow[k - d] > m) m = pow[k - d];
            if (pow[k + d] > m) m = pow[k + d];
        }
        return m;
    }

    /** الصوت البشري فيه توافقيات (2×، 3×، ½×)؛ الصفير ما بيه. */
    private boolean harmonicFree(int k, float p) {
        final float ratio = 6.3f;   // 8 dB
        int last = n / 2 - 4;
        for (int h = 2; h <= 3; h++) {
            int kh = k * h;
            if (kh > last) break;
            if (p < ratio * regionMax(kh, h + 1)) return false;
        }
        int ks = Math.round(k / 2f);
        return ks < 4 || p >= ratio * regionMax(ks, 2);
    }

    private float regionMax(int k, int r) {
        float m = 0f;
        for (int j = k - r; j <= k + r; j++) if (pow[j] > m) m = pow[j];
        return m;
    }

    /** عرض المرشّح حسب عرض العنقود: نغمة نقية ← ضيّق جداً، عنقود ← أعرض. */
    private float qFor(int k, float p, float hz) {
        float limit = p / 10f;   // ضمن 10 dB من القمّة
        int lo = k, hi = k;
        while (lo > k - EXCL && pow[lo - 1] >= limit) lo--;
        while (hi < k + EXCL && pow[hi + 1] >= limit) hi++;
        float widthHz = Math.max(1, hi - lo) * binHz;
        float q = hz / (1.2f * widthHz);
        return Math.max(4f, Math.min(16f, q));
    }

    /** تقدير التردد بدقة أعلى من عرض الـ bin (استيفاء قطع مكافئ). */
    private float refine(int k) {
        double a = Math.log(pow[k - 1] + 1e-30), b = Math.log(pow[k] + 1e-30), c = Math.log(pow[k + 1] + 1e-30);
        double d = a - 2 * b + c;
        double off = d < 0 ? 0.5 * (a - c) / d : 0;
        if (off > 0.5) off = 0.5;
        else if (off < -0.5) off = -0.5;
        return (float) (k + off);
    }

    private void placeNotch(float hz, float q, float firstCutDb) {
        for (int i = 0; i < notchCount; i++) {
            if (Math.abs(notchHz[i] - hz) < Math.max(15f, hz * 0.04f)) {
                notchDb[i] = Math.max(notchDb[i] + STEP_DB, MAX_CUT_DB);   // رجع بنفس المكان: نعمّق القطع
                notchHz[i] = hz;
                notchQ[i] = Math.min(notchQ[i], q);
                notch[i].peaking(fs, hz, notchQ[i], notchDb[i]);
                return;
            }
        }
        int slot;
        if (notchCount < MAX_NOTCHES) {
            slot = notchCount++;
        } else {
            slot = nextSlot;   // الأقدم
            nextSlot = (nextSlot + 1) % MAX_NOTCHES;
        }
        notchHz[slot] = hz;
        notchDb[slot] = firstCutDb;
        notchQ[slot] = q;
        notchScore[slot] = 0f;
        notch[slot].reset();
        notch[slot].peaking(fs, hz, q, firstCutDb);
    }

    /** سقف التضخيم بعد ما تعلّمنا إن الجهاز قريب من حد الصفير. */
    float ceilingDb() {
        return ceilingDb;
    }

    int notchCount() {
        return notchCount;
    }

    float notchHz(int i) {
        return notchHz[i];
    }

    float notchDb(int i) {
        return notchDb[i];
    }

    float notchQ(int i) {
        return notchQ[i];
    }

    int detections() {
        return detections;
    }

    void reset() {
        notchCount = 0;
        nextSlot = 0;
        java.util.Arrays.fill(trackScore, 0f);
        java.util.Arrays.fill(notchScore, 0f);
        duck = 1f;
        ceilingDb = Leveler.MAX_DB;
        detections = 0;
        sinceFrame = 0;
        java.util.Arrays.fill(ring, 0f);
        for (Biquad b : notch) b.reset();
    }
}
