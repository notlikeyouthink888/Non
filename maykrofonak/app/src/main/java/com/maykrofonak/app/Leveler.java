package com.maykrofonak.app;

/**
 * ضابط مستوى تلقائي: يرفع الصوت الواطي وينزّل العالي حتى يبقى صوتك واضحاً
 * سواء كنت قريب من التلفون أو بعيد. يتعلّم فقط وقت الكلام، ويثبت وقت السكوت،
 * وينزل بسرعة إذا ارتفع الصوت فجأة (وهذا يساعد ضد الصفير أيضاً).
 */
final class Leveler {
    static final float MIN_DB = -6f, MAX_DB = 24f, START_DB = 15f;

    private final int blockLen;
    private final float attack, release;
    private double sum;
    private int count, speech;
    private float gainDb = START_DB;
    private float gainLin = Params.dbToLin(START_DB);

    Leveler(float fs) {
        blockLen = Math.max(1, (int) (fs * 0.05f));
        attack = (float) (1 - Math.exp(-0.05 / 0.25));    // ثابت زمني 0.25 ث للنزول
        release = (float) (1 - Math.exp(-0.05 / 2.5));    // 2.5 ث للصعود
    }

    /**
     * @param ceilingDb  أعلى تضخيم مسموح الآن
     * @param allowRaise هل يُسمح بالرفع (ممنوع إذا الصوت مستمر بلا أي وقفة)
     * @return الربح الخطّي
     */
    float process(float x, boolean speaking, float targetRms, float ceilingDb, boolean allowRaise) {
        sum += x * x;
        count++;
        if (speaking) speech++;
        if (count >= blockLen) {
            float top = Math.min(MAX_DB, ceilingDb);
            if (speech > count * 0.8f) {
                double rms = Math.sqrt(sum / count);
                if (rms > 1e-6) {
                    float want = Params.linToDb(targetRms / rms);
                    if (want < MIN_DB) want = MIN_DB;
                    else if (want > top) want = top;
                    if (want < gainDb - 8f) gainDb += (want - gainDb) * 0.5f;   // قفزة مفاجئة (صراخ أو صفير): نزول سريع
                    else if (want < gainDb) gainDb += (want - gainDb) * attack;
                    else if (allowRaise) gainDb += (want - gainDb) * release;
                }
            }
            if (gainDb > top) gainDb = top;
            gainLin = Params.dbToLin(gainDb);
            sum = 0;
            count = 0;
            speech = 0;
        }
        return gainLin;
    }

    float gainDb() {
        return gainDb;
    }

    void reset() {
        sum = 0;
        count = 0;
        speech = 0;
        gainDb = START_DB;
        gainLin = Params.dbToLin(START_DB);
    }
}
