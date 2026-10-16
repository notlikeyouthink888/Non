package com.maykrofonak.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Random;

import org.junit.Before;
import org.junit.Test;

public class DspTest {
    private static final int FS = 48000;

    @Before
    public void defaults() {
        Params.targetRms = Params.dbToLin(Params.micPctToDb(60));
        Params.effect = Effects.NONE;
        Params.fxMix = 0.4f;
        Params.antiFeedback = true;
        Params.noiseReduction = true;
    }

    @Test
    public void resamplerIsTransparentAtUnityStep() {
        DriftResampler rs = new DriftResampler(240);
        Random r = new Random(1);
        float[] all = new float[240 * 50];
        for (int i = 0; i < all.length; i++) all[i] = r.nextFloat() * 2 - 1;
        float[] in = new float[240], out = new float[600];
        int produced = 0;
        for (int c = 0; c < 50; c++) {
            System.arraycopy(all, c * 240, in, 0, 240);
            int m = rs.process(in, 240, 1.0, out);
            assertEquals(240, m);
            for (int i = 0; i < m; i++) {
                int src = produced + i - 2;   // تأخير عيّنتين
                float expect = src < 0 ? 0f : all[src];
                assertEquals(expect, out[i], 1e-6f);
            }
            produced += m;
        }
    }

    @Test
    public void resamplerFollowsStepRatio() {
        DriftResampler rs = new DriftResampler(256);
        float[] in = new float[256], out = new float[600];
        long total = 0;
        for (int c = 0; c < 2000; c++) total += rs.process(in, 256, 1.003, out);
        double expected = 256.0 * 2000 / 1.003;
        assertEquals(expected, total, 3);
    }

    @Test
    public void howlGuardNotchesAPureTone() {
        HowlGuard g = new HowlGuard(FS);
        double f = 2037.0;
        for (int i = 0; i < FS * 2; i++) {
            float x = (float) (0.3 * Math.sin(2 * Math.PI * f * i / FS));
            g.analyze(g.filter(x));
        }
        assertTrue("should detect the howl", g.notchCount() >= 1);
        assertEquals(f, g.notchHz(0), 6.0);
        assertTrue("notch should deepen while tone persists", g.notchDb(0) <= -18f);
    }

    @Test
    public void howlGuardDetectsQuickly() {
        HowlGuard g = new HowlGuard(FS);
        int firstAt = -1;
        for (int i = 0; i < FS; i++) {
            float x = (float) (0.5 * Math.sin(2 * Math.PI * 3150.0 * i / FS));
            g.analyze(g.filter(x));
            if (firstAt < 0 && g.notchCount() > 0) firstAt = i;
        }
        assertTrue("strong howl must be caught within 200 ms, was " + firstAt, firstAt > 0 && firstAt < FS / 5);
    }

    @Test
    public void howlGuardIgnoresSungVowels() {
        HowlGuard g = new HowlGuard(FS);
        Random r = new Random(7);
        double phase = 0;
        for (int i = 0; i < FS * 6; i++) {
            double t = (double) i / FS;
            // نوتات مغنّاة طويلة بفيبراتو، تتغيّر كل ثانية ونص
            double f0 = (i / (FS * 3 / 2)) % 2 == 0 ? 196 : 262;
            f0 *= 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t);
            phase += 2 * Math.PI * f0 / FS;
            double s = 0;
            for (int h = 1; h <= 18; h++) s += Math.sin(h * phase) * formant(h * f0) / h;
            float x = (float) (0.12 * s + 0.002 * r.nextGaussian());
            g.analyze(g.filter(x));
        }
        assertEquals("singing must not be mistaken for feedback", 0, g.notchCount());
    }

    @Test
    public void howlGuardIgnoresNoiseAndSpeechLikeBursts() {
        HowlGuard g = new HowlGuard(FS);
        Random r = new Random(3);
        double phase = 0;
        for (int i = 0; i < FS * 5; i++) {
            double t = (double) i / FS;
            double f0 = 120 + 40 * Math.sin(2 * Math.PI * 1.3 * t);   // نبرة كلام متغيّرة
            phase += 2 * Math.PI * f0 / FS;
            double env = Math.max(0, Math.sin(2 * Math.PI * 3 * t));     // مقاطع
            double s = 0;
            for (int h = 1; h <= 25; h++) s += Math.sin(h * phase) * formant(h * f0) / h;
            float x = (float) (0.15 * env * s + 0.05 * r.nextGaussian());
            g.analyze(g.filter(x));
        }
        assertEquals(0, g.notchCount());
    }

    private static double formant(double hz) {
        double a = Math.exp(-Math.pow((hz - 700) / 300, 2)), b = Math.exp(-Math.pow((hz - 1200) / 400, 2));
        return 0.3 + a + 0.7 * b;
    }

    @Test
    public void pitchShifterMovesTheFundamental() {
        Effects.Pitch deep = new Effects.Pitch(FS, 0.78f);
        int n = 16384;
        float[] re = new float[n], im = new float[n];
        for (int i = 0; i < FS + n; i++) {
            float y = deep.process((float) (0.5 * Math.sin(2 * Math.PI * 400 * i / (double) FS)), 0f);
            if (i >= FS) re[i - FS] = y * (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - FS) / n));
        }
        new Fft(n).forward(re, im);
        int best = 1;
        for (int k = 1; k < n / 2; k++) if (re[k] * re[k] + im[k] * im[k] > re[best] * re[best] + im[best] * im[best]) best = k;
        double hz = best * (double) FS / n;
        assertEquals(400 * 0.78, hz, 6.0);
    }

    @Test
    public void chainNeverExceedsFullScaleAndSurvivesGarbage() {
        Random r = new Random(11);
        for (int fx = 0; fx < Effects.COUNT; fx++) {
            Params.effect = fx;
            Params.fxMix = 1f;
            VoiceChain chain = new VoiceChain(FS);
            float[] buf = new float[240];
            for (int c = 0; c < 400; c++) {
                for (int i = 0; i < buf.length; i++) buf[i] = (r.nextFloat() * 2 - 1) * 0.9f;
                chain.process(buf, buf.length, false);
                for (float v : buf) assertTrue("fx " + fx + " peak " + v, Math.abs(v) <= 0.9f);
            }
            buf[17] = Float.NaN;
            chain.process(buf, buf.length, false);
            for (float v : buf) assertTrue(v == 0f || Math.abs(v) <= 0.9f);
            for (int c = 0; c < 10; c++) {
                for (int i = 0; i < buf.length; i++) buf[i] = 0.1f * (r.nextFloat() * 2 - 1);
                chain.process(buf, buf.length, false);
                for (float v : buf) assertTrue(!Float.isNaN(v));
            }
        }
    }

    @Test
    public void muteSilencesWithinFewMilliseconds() {
        VoiceChain chain = new VoiceChain(FS);
        float[] buf = new float[240];
        for (int c = 0; c < 200; c++) {
            for (int i = 0; i < buf.length; i++) buf[i] = (float) (0.2 * Math.sin(i * 0.05));
            chain.process(buf, buf.length, false);
        }
        for (int c = 0; c < 6; c++) {   // 30 ms
            for (int i = 0; i < buf.length; i++) buf[i] = (float) (0.2 * Math.sin(i * 0.05));
            chain.process(buf, buf.length, true);
        }
        assertTrue(chain.peak() < 0.001f);
    }

    @Test
    public void levelerBringsQuietSpeechUp() {
        VoiceChain chain = new VoiceChain(FS);
        float[] buf = new float[480];
        double ph = 0;
        double outSum = 0;
        int count = 0;
        for (int c = 0; c < 1000; c++) {   // 10 ث
            for (int i = 0; i < buf.length; i++) {
                ph += 2 * Math.PI * 180 / FS;
                double s = 0;
                for (int h = 1; h <= 12; h++) s += Math.sin(h * ph) / h;
                buf[i] = (float) (0.004 * s);   // كلام واطي جداً (≈ ‎-48 dBFS)
            }
            chain.process(buf, buf.length, false);
            if (c > 800) for (float v : buf) { outSum += v * v; count++; }
        }
        float outDb = Params.linToDb(Math.sqrt(outSum / count));
        assertTrue("quiet voice should be lifted, got " + outDb + " dBFS", outDb > -32f);
        assertTrue(chain.leveler().gainDb() <= Leveler.MAX_DB);
    }

    @Test
    public void gateClosesOnRoomNoiseAndOpensOnVoice() {
        NoiseGate gate = new NoiseGate(FS);
        Random r = new Random(5);
        float g = 1f;
        for (int i = 0; i < FS * 3; i++) g = gate.process((float) (0.0005 * r.nextGaussian()));
        assertTrue("closed on noise, gain " + g, g < 0.2f);
        for (int i = 0; i < FS / 10; i++) g = gate.process((float) (0.05 * Math.sin(i * 0.03) + 0.0005 * r.nextGaussian()));
        assertTrue("open on voice, gain " + g, g > 0.95f);
    }

    /**
     * حلقة صوتية كاملة: الإخراج يرجع للمايك بعد ربع ثانية (تأخير البلوتوث) عبر رنين حاد.
     * بدون الحماية ما يوقف الصفير إلا لما ينزل التضخيم كثيراً (فيصير صوتك واطي)؛
     * مع الحماية يختفي الصفير بمرشّح ضيّق وصوتك يبقى قوي.
     */
    @Test
    public void howlIsRemovedWithoutMakingTheVoiceQuiet() {
        VoiceChain[] chain = new VoiceChain[1];

        Params.antiFeedback = false;
        loopWithChain(0.04f, 1700, 80, 20, true, 20, chain);
        float gainWithout = chain[0].leveler().gainDb();

        Params.antiFeedback = true;
        float[] on = loopWithChain(0.04f, 1700, 80, 20, true, 20, chain);
        for (int s = 10; s < 20; s++) assertTrue("second " + s + " still howls: " + on[s], on[s] < -55f);
        assertTrue("a notch must sit on the howl", chain[0].howl().notchCount() >= 1);
        assertEquals(1700f, chain[0].howl().notchHz(0), 15f);
        float gainWith = chain[0].leveler().gainDb();
        assertTrue("voice gain kept: with=" + gainWith + " without=" + gainWithout, gainWith > 15f && gainWith > gainWithout + 6f);
    }

    @Test
    public void singingThroughASafeLoopIsLeftUntouched() {
        Params.antiFeedback = true;
        VoiceChain[] out = new VoiceChain[1];
        loopWithChain(0.0056f, 1500, 4, 8, false, 60, out);
        assertEquals(0, out[0].howl().detections());
    }

    private static float[] loop(float coupling, double hz, double q, double db, boolean speechThenSilence, int secs) {
        return loopWithChain(coupling, hz, q, db, speechThenSilence, secs, new VoiceChain[1]);
    }

    /** @return مستوى الإخراج لكل ثانية (dBFS) */
    private static float[] loopWithChain(float coupling, double hz, double q, double db, boolean speechThenSilence, int secs,
                                         VoiceChain[] chainOut) {
        int chunk = 240, delay = FS / 4;
        VoiceChain chain = new VoiceChain(FS);
        chainOut[0] = chain;
        Biquad room = new Biquad();
        room.peaking(FS, hz, q, db);
        float[] line = new float[FS], buf = new float[chunk], perSecond = new float[secs];
        Random r = new Random(4), notes = new Random(8);
        double ph = 0, f0 = 200, noteEnd = 0, acc = 0;
        int w = 0, cnt = 0, sec = 0;
        for (int c = 0; c < FS * secs / chunk; c++) {
            for (int i = 0; i < chunk; i++) {
                double t = (double) (c * chunk + i) / FS;
                float voice = 0f;
                if (speechThenSilence ? t < 6 : true) {
                    if (t >= noteEnd) {
                        noteEnd = t + 0.3 + notes.nextDouble() * 1.5;
                        f0 = 110 + notes.nextDouble() * 300;
                    }
                    double f = f0 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
                    ph += 2 * Math.PI * f / FS;
                    double s = 0;
                    for (int h = 1; h <= 16; h++) s += Math.sin(h * ph) * formant(h * f) / h;
                    voice = (float) (0.012 * s * (speechThenSilence ? Math.max(0, Math.sin(2 * Math.PI * 2.7 * t)) : 1));
                }
                float back = line[(w + i - delay + line.length) % line.length];
                buf[i] = voice + room.process(back) * coupling + (float) (0.0003 * r.nextGaussian());
            }
            chain.process(buf, chunk, false);
            for (int i = 0; i < chunk; i++) {
                line[w] = buf[i];
                w = (w + 1) % line.length;
                acc += buf[i] * buf[i];
                if (++cnt == FS) {
                    perSecond[sec++] = Params.linToDb(Math.sqrt(acc / cnt));
                    acc = 0;
                    cnt = 0;
                }
            }
        }
        return perSecond;
    }

    /**
     * محاكاة 3 دقائق: ساعة المايك أسرع بـ 150 جزء بالمليون، والبلوتوث يسحب الصوت
     * بدفعات 20 ملّي ثانية ويبدأ متأخراً نصف ثانية. التأخير لازم يبقى قريب من الهدف.
     */
    @Test
    public void latencyStaysBoundedUnderDriftAndBurstyOutput() {
        simulate(1.00015, 960);
        simulate(0.99985, 960);
        simulate(1.0, 2048);
    }

    private static void simulate(double inputClock, int burst) {
        int chunk = 240;
        int target = FS * 40 / 1000;
        LatencyControl lat = new LatencyControl(FS, target, FS * 160 / 1000, chunk);
        DriftResampler rs = new DriftResampler(chunk);
        float[] in = new float[chunk], out = new float[chunk * 2 + 8];
        Random r = new Random(9);

        double queue = target;
        double consumerClock = -0.5;   // البلوتوث يبدأ بعد نص ثانية
        double t = 0;
        int underruns = 0;
        double maxLateQueue = 0;
        double seconds = 180;
        while (t < seconds) {
            t += chunk / (FS * inputClock);
            while (consumerClock + burst / (double) FS <= t) {
                consumerClock += burst / (double) FS;
                if (consumerClock < 0) continue;
                if (queue < burst) {
                    if (t > 2) underruns++;
                    lat.onUnderrun();
                    queue = 0;
                } else {
                    queue -= burst;
                }
            }
            boolean quiet = r.nextDouble() < 0.3;   // 30% من الوقت سكوت
            int action = lat.decide((long) queue, chunk, quiet);
            if (action == LatencyControl.DROP) continue;
            int m = rs.process(in, chunk, lat.step(), out);
            queue += m;
            if (action == LatencyControl.REPEAT) queue += m;
            if (t > 20) maxLateQueue = Math.max(maxLateQueue, queue);
        }
        double maxMs = maxLateQueue * 1000 / FS;
        assertTrue("queue grew to " + maxMs + " ms (clock " + inputClock + ")", maxMs < 40 + burst * 1000.0 / FS + 20);
        assertTrue("too many underruns: " + underruns, underruns <= 4);
    }
}
