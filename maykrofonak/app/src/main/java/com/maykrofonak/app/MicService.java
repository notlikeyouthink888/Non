package com.maykrofonak.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import java.util.concurrent.CopyOnWriteArrayList;

/**
 * خدمة أمامية تُبقي المايك شغّال والشاشة مقفلة أو وأنت بتطبيق ثاني (مثلاً يوتيوب للكاريوكي).
 *
 * <p>إذا انقطع المكبّر: يُكتم الصوت فوراً (حتى ما يطلع من سماعة التلفون ويصفّر)،
 * وتنتظر الخدمة 5 دقائق؛ أول ما يرجع المكبّر يرجع المايك يشتغل وحده.
 */
public final class MicService extends Service implements MicEngine.Callback {
    static final String ACTION_START = "com.maykrofonak.app.action.MIC_ON";
    static final String ACTION_STOP = "com.maykrofonak.app.action.MIC_OFF";

    static final int ERR_MIC = MicEngine.ERR_MIC;
    static final int ERR_OUTPUT = MicEngine.ERR_OUTPUT;
    static final int ERR_START = 3;
    static final int ERR_ROUTE = 4;
    static final int ERR_MIC_SILENT = MicEngine.ERR_MIC_SILENT;

    enum State { IDLE, STARTING, LIVE, WAITING }

    interface Listener {
        void onMicStateChanged();
    }

    private static final String TAG = "Maykrofonak";
    private static final String CHANNEL = "mic";
    private static final int NOTIFY_ID = 7;
    private static final long WAIT_TIMEOUT_MS = 5 * 60_000L;
    private static final long RECONNECT_DELAY_MS = 800;
    private static final long WAIT_POLL_MS = 2000;
    private static final long ROUTE_RETRY_WINDOW_MS = 60_000L;
    private static final int MAX_ROUTE_RETRIES = 3;

    private static volatile State state = State.IDLE;
    private static volatile String outputName = "";
    private static volatile boolean micSilenced;
    private static volatile int pendingError;
    private static final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();

    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioManager am;
    private PowerManager.WakeLock wakeLock;
    private MicEngine engine;
    private boolean receiversOn;
    private int routeRetries;
    private long firstRouteFailAt;

    private final Runnable waitTimeout = this::shutdown;
    private final Runnable retryStart = this::tryStartEngine;
    /** أثناء الانتظار نفحص كل ثانيتين: إذا المكبّر موجود نرجع نشغّل. */
    private final Runnable waitPoll = new Runnable() {
        @Override
        public void run() {
            if (state != State.WAITING) return;
            if (Speakers.best(am) != null) tryStartEngine();
            else main.postDelayed(this, WAIT_POLL_MS);
        }
    };

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) return;
            if (engine != null) engine.muteNow();
            enterWaiting();
        }
    };

    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
            if (state != State.WAITING) return;
            for (AudioDeviceInfo d : added) {
                if (d.isSink() && Speakers.isExternal(d.getType())) {
                    main.removeCallbacks(retryStart);
                    main.postDelayed(retryStart, RECONNECT_DELAY_MS);
                    return;
                }
            }
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            if (engine == null) return;
            for (AudioDeviceInfo d : removed) {
                if (d.getId() == engine.deviceId()) {
                    engine.muteNow();
                    enterWaiting();
                    return;
                }
            }
        }
    };

    // ------------------------------------------------------------ واجهة للنشاط

    static State state() {
        return state;
    }

    static String outputName() {
        return outputName;
    }

    static boolean micSilenced() {
        return micSilenced;
    }

    static int takeError() {
        int e = pendingError;
        pendingError = 0;
        return e;
    }

    static void addListener(Listener l) {
        listeners.addIfAbsent(l);
    }

    static void removeListener(Listener l) {
        listeners.remove(l);
    }

    /** يُستدعى فقط والتطبيق ظاهر (شرط أندرويد لتشغيل المايك بالخلفية). */
    static void start(Context c) {
        c.startForegroundService(new Intent(c, MicService.class).setAction(ACTION_START));
    }

    static void stop(Context c) {
        if (state == State.IDLE) return;
        c.startService(new Intent(c, MicService.class).setAction(ACTION_STOP));
    }

    // ------------------------------------------------------------ دورة الحياة

    @Override
    public void onCreate() {
        super.onCreate();
        am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            if (state == State.IDLE) state = State.STARTING;
            if (!goForeground()) {
                pendingError = ERR_START;
                shutdown();
                return START_NOT_STICKY;
            }
            if (engine == null && state != State.WAITING) begin();
            return START_NOT_STICKY;
        }
        shutdown();
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }

    private void begin() {
        Prefs.load(this);
        registerReceivers();
        acquireWakeLock();
        routeRetries = 0;
        firstRouteFailAt = 0;
        tryStartEngine();
    }

    private void tryStartEngine() {
        if (engine != null || state == State.IDLE) return;
        AudioDeviceInfo out = Speakers.best(am);
        if (out == null) {
            enterWaiting();
            return;
        }
        main.removeCallbacks(waitTimeout);
        main.removeCallbacks(waitPoll);
        outputName = Speakers.label(this, out);
        micSilenced = false;
        setState(State.STARTING);
        engine = new MicEngine(this, out, this, main);
        engine.start();
    }

    private void stopEngine() {
        main.removeCallbacks(retryStart);
        if (engine != null) {
            engine.stop();
            engine = null;
        }
        micSilenced = false;
        MicEngine.level = 0f;
    }

    private void enterWaiting() {
        if (state == State.IDLE) return;
        stopEngine();
        if (state != State.WAITING) {
            main.removeCallbacks(waitTimeout);
            main.postDelayed(waitTimeout, WAIT_TIMEOUT_MS);
        }
        main.removeCallbacks(waitPoll);
        main.postDelayed(waitPoll, WAIT_POLL_MS);
        setState(State.WAITING);
    }

    private void shutdown() {
        cleanup();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void cleanup() {
        main.removeCallbacks(waitTimeout);
        main.removeCallbacks(retryStart);
        main.removeCallbacks(waitPoll);
        stopEngine();
        unregisterReceivers();
        releaseWakeLock();
        outputName = "";
        if (state != State.IDLE) {
            state = State.IDLE;
            notifyListeners();
        }
    }

    // ------------------------------------------------------------ أحداث المحرّك

    @Override
    public void onEngineStarted(MicEngine e) {
        if (e != engine) return;
        setState(State.LIVE);
    }

    @Override
    public void onEngineError(MicEngine e, int code) {
        if (e != engine) return;
        Log.w(TAG, "engine error " + code);
        pendingError = code;
        shutdown();
    }

    @Override
    public void onOutputUnsafe(MicEngine e) {
        if (e != engine) return;
        // الصوت راح لسماعة التلفون: نكتم وننتظر. إذا المكبّر بعده متصل يرجع وحده بعد ثانيتين،
        // لكن إذا تكرر هذا كثيراً (المستخدم اختار التلفون لتشغيل الصوت) نوقف ونوضّح السبب.
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - firstRouteFailAt > ROUTE_RETRY_WINDOW_MS) {
            firstRouteFailAt = now;
            routeRetries = 0;
        }
        if (++routeRetries > MAX_ROUTE_RETRIES && Speakers.best(am) != null) {
            pendingError = ERR_ROUTE;
            shutdown();
            return;
        }
        enterWaiting();
    }

    @Override
    public void onMicSilenced(MicEngine e, boolean silenced) {
        if (e != engine) return;
        micSilenced = silenced;
        updateNotification();
        notifyListeners();
    }

    // ------------------------------------------------------------ أدوات

    private void setState(State s) {
        state = s;
        updateNotification();
        notifyListeners();
    }

    private void notifyListeners() {
        for (Listener l : listeners) l.onMicStateChanged();
    }

    private void registerReceivers() {
        if (receiversOn) return;
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, f);
        am.registerAudioDeviceCallback(devices, main);
        receiversOn = true;
    }

    private void unregisterReceivers() {
        if (!receiversOn) return;
        try {
            unregisterReceiver(noisy);
        } catch (RuntimeException ignored) {
            // غير مسجّل
        }
        am.unregisterAudioDeviceCallback(devices);
        receiversOn = false;
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "maykrofonak:mic");
            wakeLock.setReferenceCounted(false);
        }
        wakeLock.acquire(6 * 60 * 60_000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    private boolean goForeground() {
        createChannel();
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                startForeground(NOTIFY_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFY_ID, buildNotification());
            }
            return true;
        } catch (RuntimeException e) {
            Log.w(TAG, "startForeground refused", e);
            return false;
        }
    }

    private void updateNotification() {
        if (state == State.IDLE) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFY_ID, buildNotification());
    }

    private void createChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.notif_channel_desc));
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        String title, text;
        switch (state) {
            case LIVE:
                title = getString(R.string.notif_live_title);
                text = micSilenced ? getString(R.string.notif_silenced) : getString(R.string.notif_live_text, outputName);
                break;
            case WAITING:
                title = getString(R.string.notif_wait_title);
                text = getString(R.string.notif_wait_text);
                break;
            default:
                title = getString(R.string.app_name);
                text = getString(R.string.notif_starting);
                break;
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, MicService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_mic)
                .setContentTitle(title)
                .setContentText(text)
                .setColor(getColor(R.color.accent))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, R.drawable.ic_stop), getString(R.string.notif_stop), stop).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }
}
