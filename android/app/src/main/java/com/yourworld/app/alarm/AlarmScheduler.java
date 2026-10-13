package com.yourworld.app.alarm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

/** جدولة المنبهات عبر AlarmManager — تعمل والتطبيق مغلق تمامًا. */
public class AlarmScheduler {

    private static final String TAG = "YWAlarm";

    public static PendingIntent intentFor(Context ctx, JSONObject alarm, boolean create) {
        Intent i = new Intent(ctx, AlarmReceiver.class)
                .setAction(AlarmReceiver.ACTION_FIRE)
                .putExtra("payload", alarm.toString());
        int flags = (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE)
                | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, alarm.optInt("id"), i, flags);
    }

    public static boolean canScheduleExact(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return am.canScheduleExactAlarms();
        return true;
    }

    /** يجدول منبهًا في وقته المحدّد ويحفظه للاسترجاع بعد إعادة التشغيل. */
    public static boolean schedule(Context ctx, JSONObject alarm) {
        long at = alarm.optLong("at", 0);
        if (at <= System.currentTimeMillis()) return false;

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intentFor(ctx, alarm, true);

        try {
            if (alarm.optBoolean("fullScreen", true) && canScheduleExact(ctx)) {
                Intent show = new Intent(ctx, com.yourworld.app.MainActivity.class);
                PendingIntent showPI = PendingIntent.getActivity(ctx, alarm.optInt("id") + 50000, show,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPI), pi);
            } else if (canScheduleExact(ctx)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                // بلا إذن المنبهات الدقيقة: تقريبي (قد يتأخر دقائق)
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "لا إذن لجدولة منبه دقيق", e);
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }

        AlarmStore.put(ctx, alarm);
        return true;
    }

    public static void cancel(Context ctx, int id) {
        JSONObject saved = AlarmStore.get(ctx, id);
        if (saved == null) {
            saved = new JSONObject();
            try { saved.put("id", id); } catch (Exception ignored) { }
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intentFor(ctx, saved, true);
        am.cancel(pi);
        pi.cancel();
        AlarmStore.remove(ctx, id);
    }

    public static void cancelAll(Context ctx) {
        for (JSONObject o : AlarmStore.all(ctx)) cancel(ctx, o.optInt("id"));
        AlarmStore.clear(ctx);
    }

    /** بعد الإطلاق: يحسب الموعد التالي للتكرار ويجدوله. */
    public static void rescheduleNext(Context ctx, JSONObject alarm) {
        RepeatRule rule = RepeatRule.from(alarm.optJSONObject("repeat"));
        if (!rule.repeats()) { AlarmStore.remove(ctx, alarm.optInt("id")); return; }

        long fired = alarm.optLong("at", System.currentTimeMillis());
        long next = rule.nextAfter(fired, System.currentTimeMillis());
        if (next <= 0) { AlarmStore.remove(ctx, alarm.optInt("id")); return; }

        try {
            JSONObject copy = new JSONObject(alarm.toString());
            copy.put("at", next);
            schedule(ctx, copy);
        } catch (Exception e) {
            Log.w(TAG, "تعذّرت إعادة الجدولة", e);
        }
    }

    /** يعيد جدولة كل ما هو محفوظ (بعد إعادة تشغيل الجهاز). */
    public static void rescheduleAll(Context ctx) {
        long now = System.currentTimeMillis();
        for (JSONObject o : AlarmStore.all(ctx)) {
            long at = o.optLong("at", 0);
            if (at > now) {
                schedule(ctx, o);
            } else {
                rescheduleNext(ctx, o);
            }
        }
    }
}
