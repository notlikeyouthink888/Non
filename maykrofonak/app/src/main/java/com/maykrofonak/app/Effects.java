package com.maykrofonak.app;

/** مؤثرات الصوت: طبيعي، صدى، قاعة، خشن، رفيع، راديو. كلها خفيفة وبدون حجز ذاكرة أثناء التشغيل. */
final class Effects {
    static final int NONE = 0, ECHO = 1, HALL = 2, DEEP = 3, THIN = 4, RADIO = 5;
    static final int COUNT = 6;

    interface Fx {
        /** @param mix كمية المؤثر 0..1 (للصدى والقاعة فقط). */
        float process(float x, float mix);

        void reset();
    }

    private Effects() {}

    static Fx[] create(float fs) {
        return new Fx[] {new Dry(), new Echo(fs), new Hall(fs), new Pitch(fs, 0.78f), new Pitch(fs, 1.32f), new Radio(fs)};
    }

    static boolean hasAmount(int effect) {
        return effect == ECHO || effect == HALL;
    }

    static int clamp(int effect) {
        return effect < 0 || effect >= COUNT ? NONE : effect;
    }

    private static int pow2(int atLeast) {
        int p = 1;
        while (p < atLeast) p <<= 1;
        return p;
    }

    static final class Dry implements Fx {
        @Override public float process(float x, float mix) {
            return x;
        }

        @Override public void reset() {}
    }

    /** صدى كلاسيكي مثل مايكات الحفلات: تكرارات تخفت وتصير أنعم. */
    static final class Echo implements Fx {
        private final float[] buf;
        private final int mask, delay;
        private int w;
        private float lp;

        Echo(float fs) {
            buf = new float[pow2((int) (fs * 0.5f))];
            mask = buf.length - 1;
            delay = (int) (fs * 0.24f);
        }

        @Override public float process(float x, float mix) {
            float d = buf[(w - delay) & mask];
            lp += (d - lp) * 0.45f;
            buf[w] = x + lp * 0.45f;
            w = (w + 1) & mask;
            return x + lp * mix * 0.85f;
        }

        @Override public void reset() {
            java.util.Arrays.fill(buf, 0f);
            lp = 0f;
        }
    }

    /** صدى قاعة (Freeverb مبسّط بقناة واحدة). */
    static final class Hall implements Fx {
        private static final int[] COMBS = {1116, 1188, 1277, 1356, 1422, 1491};
        private static final int[] ALLPASSES = {556, 441, 341};
        private final float[][] comb;
        private final int[] combIdx;
        private final float[] combStore;
        private final float[][] ap;
        private final int[] apIdx;
        private final float[] pre;
        private final int preMask, preLen;
        private int pw;

        Hall(float fs) {
            float s = fs / 44100f;
            comb = new float[COMBS.length][];
            for (int i = 0; i < COMBS.length; i++) comb[i] = new float[Math.max(1, (int) (COMBS[i] * s))];
            combIdx = new int[COMBS.length];
            combStore = new float[COMBS.length];
            ap = new float[ALLPASSES.length][];
            for (int i = 0; i < ALLPASSES.length; i++) ap[i] = new float[Math.max(1, (int) (ALLPASSES[i] * s))];
            apIdx = new int[ALLPASSES.length];
            preLen = (int) (fs * 0.025f);
            pre = new float[pow2(preLen + 1)];
            preMask = pre.length - 1;
        }

        @Override public float process(float x, float mix) {
            float in = pre[(pw - preLen) & preMask];
            pre[pw] = x;
            pw = (pw + 1) & preMask;
            in *= 0.02f;

            float acc = 0f;
            for (int i = 0; i < comb.length; i++) {
                float[] b = comb[i];
                int j = combIdx[i];
                float out = b[j];
                combStore[i] = out * 0.75f + combStore[i] * 0.25f;
                b[j] = in + combStore[i] * 0.84f;
                combIdx[i] = j + 1 == b.length ? 0 : j + 1;
                acc += out;
            }
            for (int i = 0; i < ap.length; i++) {
                float[] b = ap[i];
                int j = apIdx[i];
                float bo = b[j];
                b[j] = acc + bo * 0.5f;
                apIdx[i] = j + 1 == b.length ? 0 : j + 1;
                acc = bo - acc;
            }
            return x + acc * mix;
        }

        @Override public void reset() {
            for (float[] b : comb) java.util.Arrays.fill(b, 0f);
            for (float[] b : ap) java.util.Arrays.fill(b, 0f);
            java.util.Arrays.fill(pre, 0f);
            java.util.Arrays.fill(combStore, 0f);
        }
    }

    /**
     * تغيير طبقة الصوت بخط تأخير متغيّر بقراءتين متداخلتين (نافذة Hann)،
     * تأخير إضافي ≈ 22 ملّي ثانية فقط.
     */
    static final class Pitch implements Fx {
        private final float[] buf;
        private final int mask;
        private final float window, inc;
        private int w;
        private float phase;

        Pitch(float fs, float ratio) {
            window = fs * 0.045f;
            buf = new float[pow2((int) (window * 2 + 8))];
            mask = buf.length - 1;
            inc = (1f - ratio) / window;
        }

        @Override public float process(float x, float mix) {
            buf[w] = x;
            phase += inc;
            if (phase >= 1f) phase -= 1f;
            else if (phase < 0f) phase += 1f;
            float p2 = phase + 0.5f;
            if (p2 >= 1f) p2 -= 1f;
            float s = (float) Math.sin(Math.PI * phase);
            float g1 = s * s;
            float y = g1 * tap(2f + phase * window) + (1f - g1) * tap(2f + p2 * window);
            w = (w + 1) & mask;
            return y;
        }

        private float tap(float delay) {
            float pos = w - delay;
            int i = (int) Math.floor(pos);
            float f = pos - i;
            float a = buf[i & mask], b = buf[(i + 1) & mask];
            return a + (b - a) * f;
        }

        @Override public void reset() {
            java.util.Arrays.fill(buf, 0f);
            phase = 0f;
        }
    }

    /** صوت راديو/مكبّر قديم: نطاق ضيّق وتشبّع خفيف. */
    static final class Radio implements Fx {
        private final Biquad hp = new Biquad(), lp = new Biquad(), peak = new Biquad();

        Radio(float fs) {
            hp.highPass(fs, 450, 0.707);
            lp.lowPass(fs, 3200, 0.707);
            peak.peaking(fs, 1600, 1.0, 5);
        }

        @Override public float process(float x, float mix) {
            float y = peak.process(lp.process(hp.process(x))) * 2.5f;
            if (y > 3f) y = 1f;
            else if (y < -3f) y = -1f;
            else y = y * (27f + y * y) / (27f + 9f * y * y);
            return y * 0.7f;
        }

        @Override public void reset() {
            hp.reset();
            lp.reset();
            peak.reset();
        }
    }
}
