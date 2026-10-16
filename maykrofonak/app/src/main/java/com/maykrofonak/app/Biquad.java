package com.maykrofonak.app;

/** مرشّح ثنائي الرتبة (معادلات RBJ) بصيغة Direct Form II Transposed. */
final class Biquad {
    private double b0 = 1, b1, b2, a1, a2;
    private double z1, z2;

    void highPass(double fs, double f, double q) {
        double w = 2 * Math.PI * f / fs, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
    }

    void lowPass(double fs, double f, double q) {
        double w = 2 * Math.PI * f / fs, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
    }

    /** تعزيز أو قطع حول تردد معيّن (قيمة سالبة = قاطع ضيّق). */
    void peaking(double fs, double f, double q, double gainDb) {
        double a = Math.pow(10, gainDb / 40);
        double w = 2 * Math.PI * f / fs, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        set(1 + alpha * a, -2 * c, 1 - alpha * a, 1 + alpha / a, -2 * c, 1 - alpha / a);
    }

    private void set(double nb0, double nb1, double nb2, double a0, double na1, double na2) {
        b0 = nb0 / a0;
        b1 = nb1 / a0;
        b2 = nb2 / a0;
        a1 = na1 / a0;
        a2 = na2 / a0;
    }

    float process(float x) {
        double y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return (float) y;
    }

    void reset() {
        z1 = 0;
        z2 = 0;
    }
}
