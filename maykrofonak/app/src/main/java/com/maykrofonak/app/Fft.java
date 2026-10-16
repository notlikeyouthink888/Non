package com.maykrofonak.app;

/** تحويل فورييه سريع (radix-2) في نفس المصفوفة، بدون أي حجز ذاكرة أثناء التشغيل. */
final class Fft {
    private final int n;
    private final float[] cos, sin;
    private final int[] rev;

    Fft(int n) {
        if (Integer.bitCount(n) != 1) throw new IllegalArgumentException("n must be a power of two");
        this.n = n;
        cos = new float[n / 2];
        sin = new float[n / 2];
        for (int k = 0; k < n / 2; k++) {
            cos[k] = (float) Math.cos(2 * Math.PI * k / n);
            sin[k] = (float) Math.sin(2 * Math.PI * k / n);
        }
        int bits = Integer.numberOfTrailingZeros(n);
        rev = new int[n];
        for (int i = 0; i < n; i++) rev[i] = Integer.reverse(i) >>> (32 - bits);
    }

    void forward(float[] re, float[] im) {
        for (int i = 0; i < n; i++) {
            int j = rev[i];
            if (j > i) {
                float t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (int size = 2; size <= n; size <<= 1) {
            int half = size >> 1, step = n / size;
            for (int start = 0; start < n; start += size) {
                for (int j = start, k = 0; j < start + half; j++, k += step) {
                    int l = j + half;
                    float tre = re[l] * cos[k] + im[l] * sin[k];
                    float tim = im[l] * cos[k] - re[l] * sin[k];
                    re[l] = re[j] - tre;
                    im[l] = im[j] - tim;
                    re[j] += tre;
                    im[j] += tim;
                }
            }
        }
    }
}
