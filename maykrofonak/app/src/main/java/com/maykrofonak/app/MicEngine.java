package com.maykrofonak.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioRecordingConfiguration;
import android.media.AudioRouting;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.os.Handler;
import android.os.Process;
import android.util.Log;

import java.util.List;

/**
 * المحرّك: خيط واحد بأولوية صوت عالية يقرأ المايك، يعالج، ويكتب للمكبّر.
 *
 * <ul>
 *   <li>يقرأ بدفعات صغيرة جداً (≈ 4–5 ملّي ثانية) حتى يكون التأخير أقل ما يمكن.</li>
 *   <li>المايك هو اللي يحدّد الإيقاع؛ الكتابة للمكبّر بدون انتظار، و{@link LatencyControl}
 *       يحافظ على تأخير ثابت صغير بدل ما يتراكم مع الوقت.</li>
 *   <li>إذا تحوّل الصوت لسماعة التلفون (انقطع المكبّر) يُكتم فوراً قبل ما يصير صفير.</li>
 * </ul>
 */
final class MicEngine implements Runnable {
    static final int ERR_MIC = 1, ERR_OUTPUT = 2, ERR_MIC_SILENT = 5;
    private static final String TAG = "Maykrofonak";
    private static final int PREFILL_BLOCK = 2048;
    private static final int DONE = 0, FAIL_MIC = 1, FAIL_OUTPUT = 2, NEXT_SOURCE = 3, FAIL_SILENT = 4;

    interface Callback {
        void onEngineStarted(MicEngine e);

        void onEngineError(MicEngine e, int code);

        /** الصوت صار يطلع من التلفون نفسه بدل المكبّر. */
        void onOutputUnsafe(MicEngine e);

        /** النظام أعطى المايك لمكالمة أو تطبيق ثاني مؤقتاً. */
        void onMicSilenced(MicEngine e, boolean silenced);
    }

    /** أعلى مستوى للإخراج بآخر دفعة (0..1) لعرضه بالواجهة. */
    static volatile float level;

    private final Context ctx;
    private final AudioManager am;
    private final AudioDeviceInfo device;
    private final Callback cb;
    private final Handler main;
    private final boolean bluetooth;

    private volatile boolean running;
    private volatile boolean unsafe;
    private volatile boolean silenced;
    private Thread thread;

    private AudioRecord record;
    private boolean recFloat;
    private short[] recShorts;
    private NoiseSuppressor ns;
    private boolean nsOn;
    private AudioManager.AudioRecordingCallback recCallback;

    private AudioTrack track;
    private boolean trackFloat;
    private short[] trackShorts;
    private AudioRouting.OnRoutingChangedListener routing;
    private long written, headTotal;
    private int lastHead, underruns;

    MicEngine(Context ctx, AudioDeviceInfo device, Callback cb, Handler main) {
        this.ctx = ctx.getApplicationContext();
        this.am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        this.device = device;
        this.cb = cb;
        this.main = main;
        this.bluetooth = Speakers.isBluetooth(device.getType());
    }

    int deviceId() {
        return device.getId();
    }

    void start() {
        running = true;
        thread = new Thread(this, "maykrofonak-audio");
        thread.start();
    }

    /** يوقف ويحرّر كل شيء. آمن للاستدعاء أكثر من مرّة. */
    void stop() {
        running = false;
        unsafe = true;
        Thread t = thread;
        thread = null;
        if (t != null && t != Thread.currentThread()) {
            try {
                t.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        level = 0f;
    }

    /** كتم فوري (قبل ما يتحوّل الصوت لسماعة التلفون). */
    void muteNow() {
        unsafe = true;
    }

    @Override
    public void run() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);
        } catch (RuntimeException e) {
            try {
                Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
            } catch (RuntimeException ignored) {
                // نكمل بالأولوية العادية
            }
        }
        int result;
        try {
            result = loop();
        } catch (Throwable t) {
            Log.e(TAG, "audio engine crashed", t);
            result = FAIL_OUTPUT;
        } finally {
            releaseAll();
            level = 0f;
        }
        if (result == FAIL_MIC) post(() -> cb.onEngineError(this, ERR_MIC));
        else if (result == FAIL_SILENT) post(() -> cb.onEngineError(this, ERR_MIC_SILENT));
        else if (result == FAIL_OUTPUT) post(() -> cb.onEngineError(this, ERR_OUTPUT));
    }

    private int loop() {
        int rate = prop(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE, 48000);
        if (rate < 16000 || rate > 48000) rate = 48000;
        int burst = prop(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER, rate / 100);
        int chunk = Math.max(rate / 500, Math.min(burst, rate / 100));   // 2..10 ms

        if (!openTrack(rate, chunk)) return FAIL_OUTPUT;
        int capacity = track.getBufferCapacityInFrames();
        int maxTarget = Math.max(chunk * 2, Math.min(rate * 160 / 1000, capacity - chunk * 2));
        int initial = Math.min(maxTarget, rate * (bluetooth ? 40 : 20) / 1000);
        LatencyControl lat = new LatencyControl(rate, initial, maxTarget, chunk);
        VoiceChain chain = new VoiceChain(rate);
        DriftResampler rs = new DriftResampler(chunk);
        float[] in = new float[chunk];
        float[] out = new float[chunk * 2 + 8];

        int[] sources = Build.VERSION.SDK_INT >= 29
                ? new int[] {MediaRecorder.AudioSource.VOICE_PERFORMANCE, MediaRecorder.AudioSource.VOICE_RECOGNITION,
                        MediaRecorder.AudioSource.MIC}
                : new int[] {MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC};

        boolean silentOnly = false, started = false;
        for (int s = 0; s < sources.length && running; s++) {
            if (!openRecord(sources[s], rate, chunk)) continue;
            int result = pump(rate, chunk, in, out, chain, rs, lat, started, sources[s]);
            started = true;
            closeRecord();
            if (result != NEXT_SOURCE) return result;
            silentOnly = true;
            Log.w(TAG, "source " + sources[s] + " delivered only silence, trying next");
        }
        if (!running) return DONE;
        // كل المصادر صامتة تماماً: غالباً مفتاح «الوصول للمايكروفون» مطفي بالإعدادات السريعة
        return silentOnly ? FAIL_SILENT : FAIL_MIC;
    }

    private int pump(int rate, int chunk, float[] in, float[] out, VoiceChain chain, DriftResampler rs,
                     LatencyControl lat, boolean alreadyStarted, int source) {
        try {
            record.startRecording();
        } catch (IllegalStateException e) {
            return FAIL_MIC;
        }
        if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) return FAIL_MIC;

        if (!alreadyStarted) {
            prefill(lat.target());
            track.play();
            post(() -> cb.onEngineStarted(this));
        }

        long framesIn = 0;
        boolean heard = false;
        int micRetries = 0, trackRetries = 0;
        while (running) {
            int n = readMic(in, chunk);
            if (n < 0) {
                if (n == AudioRecord.ERROR_DEAD_OBJECT && micRetries++ < 2 && reopenRecord(source, rate, chunk)) continue;
                return FAIL_MIC;
            }
            if (n == 0) continue;
            framesIn += n;

            if (!heard) {
                for (int i = 0; i < n; i++) {
                    if (in[i] != 0f) {
                        heard = true;
                        break;
                    }
                }
                // بعض الأجهزة تقبل المصدر لكن ترجّع صفر تام؛ نجرّب المصدر اللي بعده
                if (!heard && framesIn > rate * 2L && !silenced) return NEXT_SOURCE;
            }

            syncNoiseSuppressor();
            chain.process(in, n, unsafe);
            float pk = chain.peak();
            level = pk;

            int u = track.getUnderrunCount();
            if (u != underruns) {
                underruns = u;
                lat.onUnderrun();
            }
            int action = lat.decide(queued(), n, pk < 0.004f);
            if (action == LatencyControl.DROP) continue;

            int m = rs.process(in, n, lat.step(), out);
            int w = writeTrack(out, m);
            if (w >= 0 && action == LatencyControl.REPEAT) {
                int w2 = writeTrack(out, m);
                if (w2 > 0) w += w2;
            }
            if (w < 0) {
                if (w == AudioTrack.ERROR_DEAD_OBJECT && trackRetries++ < 3 && rebuildTrack(rate, chunk, lat)) continue;
                return FAIL_OUTPUT;
            }
            written += w;
        }
        return DONE;
    }

    // ---------------------------------------------------------------- المايك

    private boolean openRecord(int source, int rate, int chunk) {
        for (boolean useFloat : new boolean[] {true, false}) {
            AudioRecord r = buildRecord(source, rate, chunk, useFloat);
            if (r == null) continue;
            record = r;
            recFloat = useFloat;
            recShorts = useFloat ? null : new short[chunk];
            attachNoiseSuppressor();
            watchSilencing();
            return true;
        }
        return false;
    }

    private boolean reopenRecord(int source, int rate, int chunk) {
        closeRecord();
        if (!openRecord(source, rate, chunk)) return false;
        try {
            record.startRecording();
        } catch (IllegalStateException e) {
            return false;
        }
        return record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING;
    }

    @SuppressWarnings("MissingPermission")   // الإذن يُفحص قبل تشغيل الخدمة
    private static AudioRecord buildRecord(int source, int rate, int chunk, boolean useFloat) {
        int enc = useFloat ? AudioFormat.ENCODING_PCM_FLOAT : AudioFormat.ENCODING_PCM_16BIT;
        int bytes = useFloat ? 4 : 2;
        int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, enc);
        if (min <= 0) return null;
        int size = Math.max(min * 2, Math.max(chunk * 8, rate / 10) * bytes);   // مساحة ≥ 100 ms ضد التقطيع
        AudioRecord r = null;
        try {
            r = new AudioRecord.Builder()
                    .setAudioSource(source)
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(enc)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                            .build())
                    .setBufferSizeInBytes(size)
                    .build();
            if (r.getState() == AudioRecord.STATE_INITIALIZED) return r;
        } catch (RuntimeException e) {
            Log.w(TAG, "AudioRecord source " + source + " float=" + useFloat + " failed: " + e);
        }
        if (r != null) r.release();
        return null;
    }

    private int readMic(float[] buf, int n) {
        if (recFloat) return record.read(buf, 0, n, AudioRecord.READ_BLOCKING);
        int r = record.read(recShorts, 0, n, AudioRecord.READ_BLOCKING);
        for (int i = 0; i < r; i++) buf[i] = recShorts[i] * (1f / 32768f);
        return r;
    }

    private void attachNoiseSuppressor() {
        nsOn = false;
        ns = null;
        try {
            if (NoiseSuppressor.isAvailable()) {
                ns = NoiseSuppressor.create(record.getAudioSessionId());
                if (ns != null) {
                    nsOn = Params.noiseReduction;
                    ns.setEnabled(nsOn);
                }
            }
        } catch (RuntimeException e) {
            ns = null;
        }
    }

    private void syncNoiseSuppressor() {
        boolean want = Params.noiseReduction;
        if (ns == null || want == nsOn) return;
        nsOn = want;
        try {
            ns.setEnabled(want);
        } catch (RuntimeException ignored) {
            // بعض الأجهزة ترفض التبديل أثناء التسجيل؛ معالجتنا الخاصة تكفي
        }
    }

    private void watchSilencing() {
        if (Build.VERSION.SDK_INT < 29) return;
        final int session = record.getAudioSessionId();
        recCallback = new AudioManager.AudioRecordingCallback() {
            @Override
            public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
                boolean s = false;
                for (AudioRecordingConfiguration c : configs) {
                    if (c.getClientAudioSessionId() == session) {
                        s = c.isClientSilenced();
                        break;
                    }
                }
                if (s != silenced) {
                    silenced = s;
                    final boolean now = s;
                    if (running) cb.onMicSilenced(MicEngine.this, now);
                }
            }
        };
        try {
            record.registerAudioRecordingCallback(ctx.getMainExecutor(), recCallback);
        } catch (RuntimeException e) {
            recCallback = null;
        }
    }

    private void closeRecord() {
        if (record == null) return;
        if (recCallback != null && Build.VERSION.SDK_INT >= 29) {
            try {
                record.unregisterAudioRecordingCallback(recCallback);
            } catch (RuntimeException ignored) {
                // لا شيء
            }
        }
        recCallback = null;
        if (ns != null) {
            try {
                ns.release();
            } catch (RuntimeException ignored) {
                // لا شيء
            }
            ns = null;
        }
        try {
            record.stop();
        } catch (RuntimeException ignored) {
            // لم يبدأ التسجيل
        }
        record.release();
        record = null;
    }

    // ---------------------------------------------------------------- المكبّر

    private boolean openTrack(int rate, int chunk) {
        for (boolean useFloat : new boolean[] {true, false}) {
            AudioTrack t = buildTrack(rate, useFloat, !bluetooth);
            if (t == null) continue;
            track = t;
            trackFloat = useFloat;
            trackShorts = useFloat ? null : new short[Math.max(chunk * 2 + 8, PREFILL_BLOCK)];
            track.setPreferredDevice(device);
            try {
                track.setBufferSizeInFrames(track.getBufferCapacityInFrames());
            } catch (RuntimeException ignored) {
                // نكمل بالحجم الافتراضي
            }
            routing = router -> {
                AudioDeviceInfo d = router.getRoutedDevice();
                if (d != null && Speakers.isPhoneSpeaker(d.getType()) && !unsafe) {
                    unsafe = true;   // كتم فوري: الصوت راح لسماعة التلفون
                    if (running) cb.onOutputUnsafe(this);
                }
            };
            track.addOnRoutingChangedListener(routing, main);
            written = 0;
            headTotal = 0;
            lastHead = 0;
            underruns = track.getUnderrunCount();
            return true;
        }
        return false;
    }

    private static AudioTrack buildTrack(int rate, boolean useFloat, boolean lowLatency) {
        int enc = useFloat ? AudioFormat.ENCODING_PCM_FLOAT : AudioFormat.ENCODING_PCM_16BIT;
        int bytes = useFloat ? 4 : 2;
        int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, enc);
        if (min <= 0) return null;
        int frames = Math.max(min / bytes, rate / 4);   // مساحة 250 ms؛ التأخير الفعلي يتحكم به LatencyControl
        try {
            AudioTrack t = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(enc)
                            .setSampleRate(rate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(frames * bytes)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setPerformanceMode(lowLatency ? AudioTrack.PERFORMANCE_MODE_LOW_LATENCY : AudioTrack.PERFORMANCE_MODE_NONE)
                    .build();
            if (t.getState() == AudioTrack.STATE_INITIALIZED) return t;
            t.release();
        } catch (RuntimeException e) {
            Log.w(TAG, "AudioTrack float=" + useFloat + " failed: " + e);
        }
        return null;
    }

    private boolean rebuildTrack(int rate, int chunk, LatencyControl lat) {
        closeTrack();
        if (!openTrack(rate, chunk)) return false;
        prefill(lat.target());
        track.play();
        return true;
    }

    private void prefill(int frames) {
        float[] zeros = new float[Math.max(1, Math.min(frames, PREFILL_BLOCK))];
        int left = frames;
        while (left > 0) {
            int w = writeTrack(zeros, Math.min(left, zeros.length));
            if (w <= 0) break;
            written += w;
            left -= w;
        }
    }

    private int writeTrack(float[] buf, int n) {
        if (trackFloat) return track.write(buf, 0, n, AudioTrack.WRITE_NON_BLOCKING);
        for (int i = 0; i < n; i++) {
            float v = buf[i];
            trackShorts[i] = (short) (v >= 1f ? 32767 : v <= -1f ? -32768 : v * 32767f);
        }
        return track.write(trackShorts, 0, n, AudioTrack.WRITE_NON_BLOCKING);
    }

    /** كم عيّنة تنتظر بمخزن المكبّر الآن. */
    private long queued() {
        int head = track.getPlaybackHeadPosition();
        headTotal += (head - lastHead) & 0xFFFFFFFFL;   // العدّاد 32-bit ويلف
        lastHead = head;
        long q = written - headTotal;
        return q < 0 ? 0 : q;
    }

    private void closeTrack() {
        if (track == null) return;
        if (routing != null) {
            track.removeOnRoutingChangedListener(routing);
            routing = null;
        }
        try {
            track.pause();
            track.flush();
        } catch (RuntimeException ignored) {
            // لم يبدأ التشغيل
        }
        track.release();
        track = null;
    }

    private void releaseAll() {
        closeRecord();
        closeTrack();
    }

    // ---------------------------------------------------------------- أدوات

    private int prop(String key, int fallback) {
        try {
            String v = am.getProperty(key);
            if (v != null) {
                int i = Integer.parseInt(v.trim());
                if (i > 0) return i;
            }
        } catch (RuntimeException ignored) {
            // قيمة غير صالحة
        }
        return fallback;
    }

    /** يوصل للخدمة على الخيط الرئيسي، فقط إذا المحرّك بعده شغّال. */
    private void post(Runnable r) {
        main.post(() -> {
            if (running) r.run();
        });
    }
}
