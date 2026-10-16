package com.maykrofonak.app;

/**
 * يحافظ على كمية الصوت المنتظرة في مخزن الإخراج قريبة من هدف صغير:
 * أقل تأخير ممكن بدون تقطيع.
 *
 * <ul>
 *   <li>فرق الساعات البطيء يُعالَج بتغيير ناعم جداً للنسبة (لا يُسمع).</li>
 *   <li>التراكم أو النقص المفاجئ يُعالَج بحذف أو تكرار دفعة <b>صامتة</b> فقط (لا يُسمع).</li>
 *   <li>بعد توقّف كبير (مثل بداية تشغيل البلوتوث) تُحذف الدفعات حتى يرجع التأخير طبيعياً.</li>
 *   <li>كل تقطيع (underrun) يرفع الهدف 5 ملّي ثانية حتى يستقر.</li>
 * </ul>
 */
final class LatencyControl {
    static final int WRITE = 0, DROP = 1, REPEAT = 2;

    private final int rate, maxTarget, growStep, softMargin, hardMargin;
    private final long warmup;
    private int target;
    private double avg;
    private long frames;

    LatencyControl(int rate, int initialTarget, int maxTarget, int chunk) {
        this.rate = rate;
        this.target = Math.max(chunk, initialTarget);
        this.maxTarget = Math.max(this.target, maxTarget);
        avg = target;
        growStep = rate / 200;
        softMargin = Math.max(chunk, rate / 100);
        hardMargin = rate * 80 / 1000;
        warmup = rate * 2L;
    }

    /**
     * @param queued عدد العيّنات المنتظرة في مخزن الإخراج الآن
     * @param quiet  هل الدفعة الحالية صامتة تقريباً
     */
    int decide(long queued, int n, boolean quiet) {
        frames += n;
        avg += (queued - avg) * Math.min(1.0, n / (rate * 0.5));
        if (queued > target + hardMargin || (quiet && avg > target + softMargin && queued > target + n)) {
            avg -= n;
            return DROP;
        }
        if (quiet && avg < target - softMargin && queued < target) {
            avg += n;
            return REPEAT;
        }
        return WRITE;
    }

    /** نسبة الإدخال للإخراج: أكبر من 1 تفرّغ المخزن، أصغر من 1 تملؤه. */
    double step() {
        double err = (avg - target) / target;
        double s = err * 0.004;
        if (s > 0.003) s = 0.003;
        else if (s < -0.003) s = -0.003;
        return 1.0 + s;
    }

    void onUnderrun() {
        if (frames > warmup) target = Math.min(target + growStep, maxTarget);
    }

    int target() {
        return target;
    }
}
