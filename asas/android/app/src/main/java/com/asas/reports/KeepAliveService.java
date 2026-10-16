package com.asas.reports;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * خدمة أمامية تعمل ما دام التقرير يُكتب: تمنع أندرويد من تجميد التطبيق أو قطع شبكته
 * حين يخرج المستخدم منه، وتُظهر إشعارًا بحالة الكتابة.
 */
public class KeepAliveService extends Service {

    static final String CHANNEL = "asas_work";
    static final String CHANNEL_DONE = "asas_done";
    static final int ID = 4401;
    static final int ID_DONE = 4402;

    static volatile KeepAliveService instance;
    private PowerManager.WakeLock wake;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        instance = this;
        String text = intent != null ? intent.getStringExtra("text") : null;
        Notification n = build(this, text != null ? text : "يكتب التقرير…");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(ID, n);
        }
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "asas:generate");
                wake.setReferenceCounted(false);
                wake.acquire(30 * 60 * 1000L); // حدّ أقصى نصف ساعة احتياطًا
            }
        }
        return START_NOT_STICKY;
    }

    /** يحدّث نص الإشعار الجاري. */
    void update(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID, build(this, text));
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        // أندرويد 15 يحدّ وقت خدمات المزامنة؛ نتوقف بهدوء
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
        super.onDestroy();
    }

    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "كتابة التقارير", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("يظهر أثناء كتابة التقرير حتى يستمر لو خرجت من التطبيق");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_DONE) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_DONE, "التقرير جاهز", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("ينبّهك حين يجهز التقرير وأنت خارج التطبيق");
            nm.createNotificationChannel(ch);
        }
    }

    private static PendingIntent openApp(Context c) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Notification build(Context c, String text) {
        channels(c);
        return new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_asas)
                .setContentTitle("أساس")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setProgress(0, 0, true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(openApp(c))
                .build();
    }

    /** إشعار «التقرير جاهز» حين ينتهي العمل والمستخدم خارج التطبيق. */
    static void notifyDone(Context c, String text) {
        channels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification n = new NotificationCompat.Builder(c, CHANNEL_DONE)
                .setSmallIcon(R.drawable.ic_stat_asas)
                .setContentTitle("أساس")
                .setContentText(text)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(openApp(c))
                .build();
        try {
            nm.notify(ID_DONE, n);
        } catch (SecurityException ignored) {
            // إذن الإشعارات مرفوض: لا شيء
        }
    }
}
