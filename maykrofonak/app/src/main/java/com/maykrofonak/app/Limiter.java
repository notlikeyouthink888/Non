package com.maykrofonak.app;

/** محدّد ذروة: ما يخلي الصوت يتجاوز ‎-1 dBFS أبداً، فلا تشويه ولا ضربات عالية على المكبّر. */
final class Limiter {
    private static final float THRESHOLD = 0.89f;
    private final float decay;
    private float env;

    Limiter(float fs) {
        decay = (float) Math.exp(-1.0 / (0.12 * fs));
    }

    float process(float x) {
        float a = Math.abs(x);
        env = Math.max(a, env * decay);
        return env > THRESHOLD ? x * (THRESHOLD / env) : x;
    }

    void reset() {
        env = 0;
    }
}
