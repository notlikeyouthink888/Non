package com.maykrofonak.app;

import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;

/** نغمة قصيرة (دينغ-دونغ) تطلع من المكبّر نفسه: تتأكد بثانية إن الصوت يوصل للمكبّر. */
final class TestTone {
    private static final int RATE = 48000;

    private TestTone() {}

    /** @return false إذا ما كدر يشغّل الصوت */
    static boolean play(AudioDeviceInfo device) {
        float[] pcm = chime();
        AudioTrack t = null;
        try {
            t = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(pcm.length * 4)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build();
            if (t.getState() != AudioTrack.STATE_NO_STATIC_DATA && t.getState() != AudioTrack.STATE_INITIALIZED) {
                t.release();
                return false;
            }
            if (device != null) t.setPreferredDevice(device);
            t.write(pcm, 0, pcm.length, AudioTrack.WRITE_BLOCKING);
            t.play();
            final AudioTrack done = t;
            new Handler(Looper.getMainLooper()).postDelayed(done::release, pcm.length * 1000L / RATE + 1500);
            return true;
        } catch (RuntimeException e) {
            if (t != null) t.release();
            return false;
        }
    }

    private static float[] chime() {
        float[] out = new float[(int) (RATE * 0.75f)];
        note(out, 0, 0.32f, 880f);
        note(out, (int) (RATE * 0.22f), 0.5f, 660f);
        return out;
    }

    private static void note(float[] out, int start, float seconds, float hz) {
        int len = Math.min(out.length - start, (int) (RATE * seconds));
        for (int i = 0; i < len; i++) {
            float t = i / (float) RATE;
            float env = Math.min(1f, i / (RATE * 0.005f)) * (float) Math.exp(-t * 6.0);
            double ph = 2 * Math.PI * hz * t;
            out[start + i] += (float) (0.45 * env * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)));
        }
    }
}
