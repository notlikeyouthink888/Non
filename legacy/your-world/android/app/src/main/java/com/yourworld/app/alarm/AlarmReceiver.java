package com.yourworld.app.alarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.yourworld.app.R;

import org.json.JSONObject;

/** يستقبل إطلاق المنبّه: يرنّ، يعرض شاشة كاملة، ويجدول التكرار التالي. */
public class AlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "YWAlarm";
    public static final String ACTION_FIRE = "com.yourworld.app.ALARM_FIRE";
    public static final String ACTION_SNOOZE = "com.yourworld.app.ALARM_SNOOZE";
    public static final String ACTION_DISMISS = "com.yourworld.app.ALARM_DISMISS";

    public static final String CHANNEL_ALARM = "yw_alarm";
    public static final String CHANNEL_REMINDER = "yw_reminder";

    /** مستمع اختياري لإبلاغ طبقة الويب حين يكون التطبيق مفتوحًا. */
    public interface Listener { void onAlarm(String type, JSONObject alarm); }
    private static Listener listener;
    public static void setListener(Listener l) { listener = l; }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        JSONObject alarm = parse(intent.getStringExtra("payload"));
        if (alarm == null) return;

        ensureChannels(ctx);

        if (ACTION_DISMISS.equals(action)) {
            AlarmRinger.stop();
            notifManager(ctx).cancel(notifId(alarm));
            notify(ctx, "dismissed", alarm);
            return;
        }

        if (ACTION_SNOOZE.equals(action)) {
            AlarmRinger.stop();
            notifManager(ctx).cancel(notifId(alarm));
            int snooze = alarm.optInt("snoozeMin", 9);
            try {
                JSONObject copy = new JSONObject(alarm.toString());
                copy.put("at", System.currentTimeMillis() + snooze * 60000L);
                copy.put("snoozed", true);
                AlarmScheduler.schedule(ctx, copy);
            } catch (Exception e) {
                Log.w(TAG, "تعذّرت الغفوة", e);
            }
            notify(ctx, "snoozed", alarm);
            return;
        }

        // الإطلاق
        boolean silent = alarm.optBoolean("silent", false);
        if (!silent) {
            AlarmRinger.ensureAudibleStream(ctx);
            AlarmRinger.start(ctx,
                    alarm.optString("soundUri", ""),
                    alarm.optBoolean("vibrate", true),
                    alarm.optBoolean("gradual", true),
                    (float) alarm.optDouble("volume", 1.0));
        }

        showNotification(ctx, alarm, !silent);

        if (!silent && alarm.optBoolean("fullScreen", true)) {
            try {
                Intent i = new Intent(ctx, AlarmActivity.class)
                        .putExtra("payload", alarm.toString())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
                ctx.startActivity(i);
            } catch (Exception e) {
                Log.w(TAG, "تعذّر فتح شاشة المنبّه", e);
            }
        }

        notify(ctx, "fired", alarm);
        AlarmScheduler.rescheduleNext(ctx, alarm);
    }

    private void notify(Context ctx, String type, JSONObject alarm) {
        Listener l = listener;
        if (l != null) l.onAlarm(type, alarm);
    }

    private static JSONObject parse(String s) {
        try { return s == null ? null : new JSONObject(s); } catch (Exception e) { return null; }
    }

    private static NotificationManager notifManager(Context ctx) {
        return (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    public static int notifId(JSONObject alarm) { return 2000 + alarm.optInt("id"); }

    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = notifManager(ctx);

        NotificationChannel alarmCh = new NotificationChannel(
                CHANNEL_ALARM, "المنبّهات", NotificationManager.IMPORTANCE_HIGH);
        alarmCh.setDescription("تنبيهات المنبّه والمؤقّت");
        alarmCh.setBypassDnd(true);
        alarmCh.setSound(null, null);       // الصوت يشغّله AlarmRinger
        alarmCh.enableVibration(false);
        alarmCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alarmCh);

        NotificationChannel remind = new NotificationChannel(
                CHANNEL_REMINDER, "التذكيرات", NotificationManager.IMPORTANCE_DEFAULT);
        remind.setDescription("تذكيرات المهام والالتزامات وملخّص اليوم");
        nm.createNotificationChannel(remind);
    }

    private PendingIntent action(Context ctx, JSONObject alarm, String act) {
        Intent i = new Intent(ctx, AlarmReceiver.class)
                .setAction(act)
                .putExtra("payload", alarm.toString());
        return PendingIntent.getBroadcast(ctx, (act + alarm.optInt("id")).hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void showNotification(Context ctx, JSONObject alarm, boolean ringing) {
        Intent open = new Intent(ctx, AlarmActivity.class).putExtra("payload", alarm.toString());
        PendingIntent openPI = PendingIntent.getActivity(ctx, alarm.optInt("id"), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, ringing ? CHANNEL_ALARM : CHANNEL_REMINDER)
                : new Notification.Builder(ctx);

        b.setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle(alarm.optString("title", "منبّه"))
                .setContentText(alarm.optString("body", ""))
                .setContentIntent(openPI)
                .setAutoCancel(!ringing)
                .setOngoing(ringing)
                .setCategory(ringing ? Notification.CATEGORY_ALARM : Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (ringing) {
            b.setFullScreenIntent(openPI, true);
            b.addAction(new Notification.Action.Builder(
                    android.graphics.drawable.Icon.createWithResource(ctx, android.R.drawable.ic_menu_recent_history),
                    "غفوة " + alarm.optInt("snoozeMin", 9) + " د",
                    action(ctx, alarm, ACTION_SNOOZE)).build());
            b.addAction(new Notification.Action.Builder(
                    android.graphics.drawable.Icon.createWithResource(ctx, android.R.drawable.ic_menu_close_clear_cancel),
                    "إيقاف", action(ctx, alarm, ACTION_DISMISS)).build());
        }

        try { notifManager(ctx).notify(notifId(alarm), b.build()); }
        catch (Exception e) { Log.w(TAG, "تعذّر عرض الإشعار", e); }
    }
}
