package com.yourworld.app.alarm;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

/** تشغيل نغمة المنبّه (أغنية من الجهاز أو النغمة الافتراضية) مع تصاعد تدريجي واهتزاز. */
public class AlarmRinger {

    private static final String TAG = "YWRinger";
    private static MediaPlayer player;
    private static Vibrator vibrator;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Runnable fadeTask;

    public static synchronized void start(Context ctx, String soundUri, boolean vibrate,
                                          boolean gradual, float maxVolume) {
        stop();
        try {
            Uri uri = soundUri != null && !soundUri.isEmpty()
                    ? Uri.parse(soundUri)
                    : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            player.setDataSource(ctx, uri);
            player.setLooping(true);
            player.prepare();

            final float target = Math.max(0.1f, Math.min(1f, maxVolume <= 0 ? 1f : maxVolume));
            if (gradual) {
                player.setVolume(0.08f, 0.08f);
                fadeTask = new Runnable() {
                    float v = 0.08f;
                    @Override public void run() {
                        v = Math.min(target, v + target / 30f);
                        if (player != null) {
                            try { player.setVolume(v, v); } catch (Exception ignored) { }
                        }
                        if (v < target) handler.postDelayed(this, 1500);
                    }
                };
                handler.postDelayed(fadeTask, 1500);
            } else {
                player.setVolume(target, target);
            }
            player.start();
        } catch (Exception e) {
            Log.w(TAG, "تعذّر تشغيل نغمة المنبّه", e);
        }

        if (vibrate) {
            try {
                vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                long[] pattern = { 0, 600, 900 };
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            } catch (Exception e) {
                Log.w(TAG, "تعذّر الاهتزاز", e);
            }
        }
    }

    public static synchronized void stop() {
        if (fadeTask != null) { handler.removeCallbacks(fadeTask); fadeTask = null; }
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) { }
            vibrator = null;
        }
    }

    public static boolean isRinging() { return player != null; }

    /** يرفع صوت تيار المنبّه إن كان صامتًا حتى لا يضيع التنبيه. */
    public static void ensureAudibleStream(Context ctx) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            if (am.getStreamVolume(AudioManager.STREAM_ALARM) < max / 3) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, Math.max(1, max / 2), 0);
            }
        } catch (Exception ignored) { }
    }
}
