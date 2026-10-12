package com.yourworld.app.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.audiofx.PresetReverb;
import android.media.audiofx.Virtualizer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.yourworld.app.MainActivity;
import com.yourworld.app.R;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * محرّك التشغيل: يعمل كخدمة أمامية فيستمر الصوت والتطبيق مغلق أو الشاشة مقفلة،
 * مع إشعار وأزرار تحكّم تظهر على شاشة القفل (MediaSession).
 */
public class PlayerService extends Service implements MediaPlayer.OnCompletionListener,
        MediaPlayer.OnPreparedListener, MediaPlayer.OnErrorListener, AudioManager.OnAudioFocusChangeListener {

    private static final String TAG = "YWPlayer";
    public static final String CHANNEL = "yw_playback";
    public static final int NOTIF_ID = 1001;

    public static final String ACTION_PLAY = "com.yourworld.app.PLAY";
    public static final String ACTION_PAUSE = "com.yourworld.app.PAUSE";
    public static final String ACTION_TOGGLE = "com.yourworld.app.TOGGLE";
    public static final String ACTION_NEXT = "com.yourworld.app.NEXT";
    public static final String ACTION_PREV = "com.yourworld.app.PREV";
    public static final String ACTION_STOP = "com.yourworld.app.STOP";

    /** مستمع واحد يوصل الأحداث إلى طبقة الويب. */
    public interface Listener { void onPlayerEvent(String type, JSONObject state); }
    private static Listener listener;
    public static void setListener(Listener l) { listener = l; }

    private static PlayerService instance;
    public static PlayerService get() { return instance; }

    private MediaPlayer mp;
    private MediaSession session;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final List<Track> queue = new ArrayList<>();
    private final List<Integer> order = new ArrayList<>();
    private int index = 0;
    private String repeat = "off";     // off | one | all
    private boolean shuffle = false;
    private float speed = 1f;
    private boolean preservePitch = true;
    private float volume = 1f;
    private float balance = 0f;
    private boolean prepared = false;
    private boolean playRequested = false;
    private boolean hasFocus = false;
    private long sleepAt = 0;
    private Bitmap currentArt;

    // المؤثرات
    private Equalizer eq;
    private BassBoost bass;
    private Virtualizer virt;
    private PresetReverb reverb;
    private LoudnessEnhancer loud;
    private JSONObject effects = new JSONObject();

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (isPlaying()) {
                emit("state");
                if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) {
                    sleepAt = 0;
                    pause();
                }
            }
            handler.postDelayed(this, 900);
        }
    };

    /* ─────────────────── دورة حياة الخدمة ─────────────────── */

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createChannel();
        setupSession();
        handler.postDelayed(ticker, 900);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action != null) {
            switch (action) {
                case ACTION_PLAY: play(); break;
                case ACTION_PAUSE: pause(); break;
                case ACTION_TOGGLE: toggle(); break;
                case ACTION_NEXT: next(true); break;
                case ACTION_PREV: prev(); break;
                case ACTION_STOP: stopPlayback(); break;
                default: break;
            }
        }
        // يجب استدعاء startForeground فورًا بعد startForegroundService وإلا أسقط النظام الخدمة
        startForegroundSafe(buildNotification());
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        releaseEffects();
        if (mp != null) { mp.release(); mp = null; }
        if (session != null) { session.release(); session = null; }
        abandonFocus();
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // نُبقي التشغيل عاملًا بعد إغلاق واجهة التطبيق إن كان يعمل فعلًا
        if (!isPlaying()) stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    /* ─────────────────── القائمة والتشغيل ─────────────────── */

    public synchronized void setQueue(List<Track> tracks, int startIndex, boolean autoPlay) {
        queue.clear();
        queue.addAll(tracks);
        index = Math.max(0, Math.min(startIndex, queue.size() - 1));
        rebuildOrder();
        openCurrent(autoPlay);
    }

    private void rebuildOrder() {
        order.clear();
        for (int i = 0; i < queue.size(); i++) order.add(i);
        if (shuffle) {
            Collections.shuffle(order);
            int pos = order.indexOf(index);
            if (pos > 0) Collections.swap(order, 0, pos);
        }
    }

    private int step(int delta) {
        if (queue.isEmpty()) return -1;
        int pos = order.indexOf(index);
        int nextPos = pos + delta;
        if (nextPos >= order.size()) {
            if ("off".equals(repeat)) return -1;
            nextPos = 0;
        }
        if (nextPos < 0) nextPos = order.size() - 1;
        return order.get(nextPos);
    }

    private void openCurrent(boolean autoPlay) {
        Track t = current();
        if (t == null) return;
        prepared = false;
        playRequested = autoPlay;

        if (mp == null) {
            mp = new MediaPlayer();
            mp.setOnCompletionListener(this);
            mp.setOnPreparedListener(this);
            mp.setOnErrorListener(this);
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
        } else {
            mp.reset();
        }

        try {
            mp.setDataSource(this, Uri.parse(t.uri));
            mp.prepareAsync();
        } catch (Exception e) {
            Log.w(TAG, "تعذّر فتح الملف: " + t.uri, e);
            emit("error");
            handler.postDelayed(() -> next(true), 400);
            return;
        }

        loadArtAsync(t);
        emit("trackChanged");
    }

    @Override
    public void onPrepared(MediaPlayer mediaPlayer) {
        prepared = true;
        applyVolume();
        attachEffects();
        applySpeed();
        if (playRequested) play();
        updateSessionMetadata();
        updateNotification();
        emit("state");
    }

    @Override
    public boolean onError(MediaPlayer mediaPlayer, int what, int extra) {
        Log.w(TAG, "خطأ تشغيل " + what + "/" + extra);
        prepared = false;
        handler.postDelayed(() -> next(true), 500);
        return true;
    }

    @Override
    public void onCompletion(MediaPlayer mediaPlayer) {
        if ("one".equals(repeat)) {
            seek(0);
            play();
            return;
        }
        next(false);
    }

    public void play() {
        if (mp == null || !prepared) { playRequested = true; return; }
        if (!requestFocus()) return;
        try {
            mp.start();
            applySpeed();
        } catch (IllegalStateException e) {
            Log.w(TAG, "تعذّر البدء", e);
            return;
        }
        playRequested = true;
        updateSessionState();
        startForegroundSafe(buildNotification());
        emit("state");
    }

    public void pause() {
        if (mp != null && prepared && mp.isPlaying()) mp.pause();
        playRequested = false;
        updateSessionState();
        updateNotification();
        emit("state");
    }

    public void toggle() { if (isPlaying()) pause(); else play(); }

    public void next(boolean userInitiated) {
        int n = step(1);
        if (n < 0) {
            pause();
            seek(0);
            return;
        }
        index = n;
        openCurrent(true);
    }

    public void prev() {
        if (position() > 3000) { seek(0); return; }
        int n = step(-1);
        if (n < 0) { seek(0); return; }
        index = n;
        openCurrent(true);
    }

    public void stopPlayback() {
        pause();
        seek(0);
        stopForeground(true);
        stopSelf();
    }

    public void seek(long ms) {
        if (mp != null && prepared) {
            mp.seekTo((int) Math.max(0, Math.min(ms, duration())));
            updateSessionState();
            emit("state");
        }
    }

    public void seekBy(long deltaMs) { seek(position() + deltaMs); }

    /* ─────────────────── الإعدادات ─────────────────── */

    public void setRepeat(String mode) { repeat = mode; emit("state"); }

    public void setShuffle(boolean on) { shuffle = on; rebuildOrder(); emit("state"); }

    public void setSpeed(float value, boolean pitchLock) {
        speed = Math.max(0.25f, Math.min(4f, value));
        preservePitch = pitchLock;
        applySpeed();
        emit("state");
    }

    private void applySpeed() {
        if (mp == null || !prepared) return;
        try {
            PlaybackParams p = mp.getPlaybackParams();
            p.setSpeed(speed);
            p.setPitch(preservePitch ? 1f : speed);
            boolean wasPlaying = mp.isPlaying();
            mp.setPlaybackParams(p);
            // setPlaybackParams يبدأ التشغيل ضمنيًا في بعض الأجهزة
            if (!wasPlaying && mp.isPlaying()) mp.pause();
        } catch (Exception e) {
            Log.w(TAG, "تعذّر ضبط السرعة", e);
        }
    }

    public void setVolume(float v, float bal) {
        volume = Math.max(0f, Math.min(1f, v));
        balance = Math.max(-1f, Math.min(1f, bal));
        applyVolume();
    }

    private void applyVolume() {
        if (mp == null) return;
        float left = volume * (balance > 0 ? 1f - balance : 1f);
        float right = volume * (balance < 0 ? 1f + balance : 1f);
        try { mp.setVolume(left, right); } catch (Exception ignored) { }
    }

    public void setSleepTimer(int minutes) {
        sleepAt = minutes > 0 ? System.currentTimeMillis() + minutes * 60000L : 0;
    }

    /* ─────────────────── المؤثرات الصوتية ─────────────────── */

    public void setEffects(JSONObject fx) {
        effects = fx != null ? fx : new JSONObject();
        attachEffects();
    }

    private void releaseEffects() {
        try { if (eq != null) eq.release(); } catch (Exception ignored) { }
        try { if (bass != null) bass.release(); } catch (Exception ignored) { }
        try { if (virt != null) virt.release(); } catch (Exception ignored) { }
        try { if (reverb != null) reverb.release(); } catch (Exception ignored) { }
        try { if (loud != null) loud.release(); } catch (Exception ignored) { }
        eq = null; bass = null; virt = null; reverb = null; loud = null;
    }

    private void attachEffects() {
        if (mp == null || !prepared) return;
        int sessionId = mp.getAudioSessionId();
        if (sessionId == 0) return;
        boolean enabled = effects.optBoolean("enabled", false);
        releaseEffects();
        if (!enabled) return;

        try {
            eq = new Equalizer(0, sessionId);
            eq.setEnabled(true);
            short bandCount = eq.getNumberOfBands();
            short[] range = eq.getBandLevelRange();   // بالميلّي ديسيبل
            org.json.JSONArray bands = effects.optJSONArray("bands");
            for (short b = 0; b < bandCount; b++) {
                double t = bandCount == 1 ? 0 : (double) b / (bandCount - 1);
                double gainDb = sampleBands(bands, t);
                short level = (short) Math.max(range[0], Math.min(range[1], gainDb * 100));
                eq.setBandLevel(b, level);
            }
        } catch (Exception e) { Log.w(TAG, "المعادل غير مدعوم", e); }

        try {
            int strength = effects.optInt("bass", 0);
            if (strength > 0) {
                bass = new BassBoost(0, sessionId);
                if (bass.getStrengthSupported()) {
                    bass.setStrength((short) Math.min(1000, strength));
                    bass.setEnabled(true);
                }
            }
        } catch (Exception e) { Log.w(TAG, "تعزيز الباس غير مدعوم", e); }

        try {
            int strength = effects.optInt("virtualizer", 0);
            if (strength > 0) {
                virt = new Virtualizer(0, sessionId);
                if (virt.getStrengthSupported()) {
                    virt.setStrength((short) Math.min(1000, strength));
                    virt.setEnabled(true);
                }
            }
        } catch (Exception e) { Log.w(TAG, "المحيطي غير مدعوم", e); }

        try {
            short preset = reverbPreset(effects.optString("reverb", "none"));
            if (preset != PresetReverb.PRESET_NONE) {
                reverb = new PresetReverb(0, sessionId);
                reverb.setPreset(preset);
                reverb.setEnabled(true);
            }
        } catch (Exception e) { Log.w(TAG, "الصدى غير مدعوم", e); }

        try {
            int mb = effects.optInt("loudness", 0);
            if (mb > 0) {
                loud = new LoudnessEnhancer(sessionId);
                loud.setTargetGain(mb);
                loud.setEnabled(true);
            }
        } catch (Exception e) { Log.w(TAG, "رفع الجهارة غير مدعوم", e); }
    }

    /** يوزّع نطاقات الواجهة الخمسة على عدد نطاقات الجهاز الفعلي. */
    private double sampleBands(org.json.JSONArray bands, double t) {
        if (bands == null || bands.length() == 0) return 0;
        double pos = t * (bands.length() - 1);
        int i = (int) Math.floor(pos);
        int j = Math.min(bands.length() - 1, i + 1);
        double f = pos - i;
        return bands.optDouble(i, 0) * (1 - f) + bands.optDouble(j, 0) * f;
    }

    private short reverbPreset(String name) {
        switch (name) {
            case "smallroom": return PresetReverb.PRESET_SMALLROOM;
            case "mediumroom": return PresetReverb.PRESET_MEDIUMROOM;
            case "largeroom": return PresetReverb.PRESET_LARGEROOM;
            case "mediumhall": return PresetReverb.PRESET_MEDIUMHALL;
            case "largehall": return PresetReverb.PRESET_LARGEHALL;
            case "plate": return PresetReverb.PRESET_PLATE;
            default: return PresetReverb.PRESET_NONE;
        }
    }

    /* ─────────────────── تركيز الصوت ─────────────────── */

    private boolean requestFocus() {
        if (hasFocus) return true;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setOnAudioFocusChangeListener(this)
                    .build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        return hasFocus;
    }

    private void abandonFocus() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
            } else {
                audioManager.abandonAudioFocus(this);
            }
        } catch (Exception ignored) { }
        hasFocus = false;
    }

    @Override
    public void onAudioFocusChange(int change) {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS:
                hasFocus = false;
                pause();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                pause();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                if (mp != null) mp.setVolume(volume * .25f, volume * .25f);
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                hasFocus = true;
                applyVolume();
                if (playRequested) play();
                break;
            default: break;
        }
    }

    /* ─────────────────── جلسة الوسائط والإشعار ─────────────────── */

    private void setupSession() {
        session = new MediaSession(this, "YourWorld");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { play(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { next(true); }
            @Override public void onSkipToPrevious() { prev(); }
            @Override public void onSeekTo(long pos) { seek(pos); }
            @Override public void onStop() { stopPlayback(); }
        });
        session.setActive(true);
    }

    private void updateSessionMetadata() {
        Track t = current();
        if (t == null || session == null) return;
        MediaMetadata.Builder b = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, t.album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration());
        if (currentArt != null) b.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArt);
        session.setMetadata(b.build());
        updateSessionState();
    }

    private void updateSessionState() {
        if (session == null) return;
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO
                | PlaybackState.ACTION_STOP;
        PlaybackState st = new PlaybackState.Builder()
                .setActions(actions)
                .setState(isPlaying() ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        position(), isPlaying() ? speed : 0f)
                .build();
        session.setPlaybackState(st);
    }

    private void loadArtAsync(Track t) {
        currentArt = null;
        new Thread(() -> {
            Bitmap bmp = null;
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            try {
                mmr.setDataSource(this, Uri.parse(t.uri));
                byte[] data = mmr.getEmbeddedPicture();
                if (data != null) bmp = BitmapFactory.decodeByteArray(data, 0, data.length);
            } catch (Exception ignored) {
            } finally {
                try { mmr.release(); } catch (Exception ignored) { }
            }
            final Bitmap result = bmp;
            handler.post(() -> {
                currentArt = result;
                updateSessionMetadata();
                updateNotification();
            });
        }).start();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel ch = new NotificationChannel(CHANNEL, "التشغيل", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("إشعار المشغّل وأزرار التحكّم");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
    }

    private PendingIntent servicePI(String action) {
        Intent i = new Intent(this, PlayerService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, action.hashCode(), i, flags);
    }

    private Notification buildNotification() {
        Track t = current();
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPI = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);

        b.setSmallIcon(R.drawable.ic_stat_note)
                .setContentTitle(t != null ? t.title : "Your World")
                .setContentText(t != null ? t.artist : "")
                .setContentIntent(contentPI)
                .setDeleteIntent(servicePI(ACTION_STOP))
                .setOngoing(isPlaying())
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (currentArt != null) b.setLargeIcon(currentArt);

        b.addAction(new Notification.Action.Builder(
                icon(android.R.drawable.ic_media_previous), "السابق", servicePI(ACTION_PREV)).build());
        b.addAction(new Notification.Action.Builder(
                icon(isPlaying() ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
                isPlaying() ? "إيقاف مؤقت" : "تشغيل", servicePI(ACTION_TOGGLE)).build());
        b.addAction(new Notification.Action.Builder(
                icon(android.R.drawable.ic_media_next), "التالي", servicePI(ACTION_NEXT)).build());

        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (session != null) style.setMediaSession(session.getSessionToken());
        b.setStyle(style);

        return b.build();
    }

    private android.graphics.drawable.Icon icon(int res) {
        return android.graphics.drawable.Icon.createWithResource(this, res);
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        try { nm.notify(NOTIF_ID, buildNotification()); } catch (Exception ignored) { }
    }

    private void startForegroundSafe(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            Log.w(TAG, "تعذّر تشغيل الخدمة الأمامية", e);
        }
    }

    /* ─────────────────── الحالة ─────────────────── */

    public Track current() { return index >= 0 && index < queue.size() ? queue.get(index) : null; }
    public boolean isPlaying() { return mp != null && prepared && mp.isPlaying(); }
    public long position() { try { return mp != null && prepared ? mp.getCurrentPosition() : 0; } catch (Exception e) { return 0; } }
    public long duration() {
        try {
            long d = mp != null && prepared ? mp.getDuration() : 0;
            if (d > 0) return d;
        } catch (Exception ignored) { }
        Track t = current();
        return t != null ? t.durationMs : 0;
    }

    public JSONObject snapshot() {
        JSONObject o = new JSONObject();
        try {
            Track t = current();
            o.put("playing", isPlaying());
            o.put("index", index);
            o.put("trackId", t != null ? t.id : null);
            o.put("positionMs", position());
            o.put("durationMs", duration());
            o.put("speed", speed);
            o.put("repeat", repeat);
            o.put("shuffle", shuffle);
            o.put("queueLength", queue.size());
        } catch (Exception ignored) { }
        return o;
    }

    private void emit(String type) {
        updateSessionState();
        Listener l = listener;
        if (l != null) l.onPlayerEvent(type, snapshot());
    }
}
