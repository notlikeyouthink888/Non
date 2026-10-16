package com.maykrofonak.app;

/**
 * معيد تشكيل بنسبة قريبة جداً من 1 (±0.3%) لتعويض فرق ساعة المايك عن ساعة المكبّر،
 * حتى ما يتأخر الصوت تدريجياً مع الوقت. استيفاء Hermite بأربع نقاط،
 * وعند النسبة 1 تماماً يمرّر الصوت كما هو (بتأخير عيّنتين فقط).
 */
final class DriftResampler {
    private final float[] work;
    private double pos = 1.0;

    DriftResampler(int maxChunk) {
        work = new float[maxChunk + 3];
    }

    /**
     * @param step عدد عيّنات الإدخال لكل عيّنة إخراج (&gt;1 يقلّل الإخراج).
     * @return عدد العيّنات المكتوبة في out
     */
    int process(float[] in, int n, double step, float[] out) {
        System.arraycopy(in, 0, work, 3, n);
        int m = 0;
        double p = pos;
        while ((int) p <= n && m < out.length) {
            int i = (int) p;
            float t = (float) (p - i);
            float xm1 = work[i - 1], x0 = work[i], x1 = work[i + 1], x2 = work[i + 2];
            float c1 = 0.5f * (x1 - xm1);
            float c2 = xm1 - 2.5f * x0 + 2f * x1 - 0.5f * x2;
            float c3 = 0.5f * (x2 - xm1) + 1.5f * (x0 - x1);
            out[m++] = ((c3 * t + c2) * t + c1) * t + x0;
            p += step;
        }
        pos = p - n;
        System.arraycopy(work, n, work, 0, 3);
        return m;
    }
}
