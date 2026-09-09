package com.yourworld.app.plugins;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.yourworld.app.MainActivity;
import com.yourworld.app.R;
import com.yourworld.app.alarm.AlarmReceiver;
import com.yourworld.app.alarm.AlarmScheduler;
import com.yourworld.app.alarm.AlarmStore;

import org.json.JSONException;
import org.json.JSONObject;

/** جدولة المنبهات والإشعارات — تعمل والتطبيق مغلق (AlarmManager). */
@CapacitorPlugin(
    name = "Scheduler",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SchedulerPlugin extends Plugin {

    @Override
    public void load() {
        AlarmReceiver.ensureChannels(getContext());
        AlarmReceiver.setListener((type, alarm) -> {
            JSObject o;
            try {
                o = JSObject.fromJSONObject(alarm);
            } catch (JSONException e) {
                o = new JSObject();
            }
            o.put("type", type);
            notifyListeners("alarm", o);
        });
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permsResult");
            return;
        }
        permsResult(call);
    }

    @PermissionCallback
    private void permsResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        r.put("exact", AlarmScheduler.canScheduleExact(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void canScheduleExact(PluginCall call) {
        JSObject r = new JSObject();
        r.put("canSchedule", AlarmScheduler.canScheduleExact(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getContext().getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        JSONObject alarm = call.getData();
        boolean ok = AlarmScheduler.schedule(getContext(), alarm);
        JSObject r = new JSObject();
        r.put("scheduled", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer id = call.getInt("id");
        if (id != null) AlarmScheduler.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        AlarmScheduler.cancelAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void listPending(PluginCall call) {
        JSArray arr = new JSArray();
        for (JSONObject o : AlarmStore.all(getContext())) arr.put(o);
        JSObject r = new JSObject();
        r.put("alarms", arr);
        call.resolve(r);
    }

    /** إشعار فوري (تحذير الاستخدام، ملخّص اليوم، تذكير سريع). */
    @PluginMethod
    public void notify(PluginCall call) {
        AlarmReceiver.ensureChannels(getContext());
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));

        Intent open = new Intent(getContext(), MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(getContext(), id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(getContext(), AlarmReceiver.CHANNEL_REMINDER)
                : new Notification.Builder(getContext());

        b.setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle(call.getString("title", "Your World"))
                .setContentText(call.getString("body", ""))
                .setContentIntent(pi)
                .setAutoCancel(true);

        String big = call.getString("bigText", "");
        if (!big.isEmpty()) b.setStyle(new Notification.BigTextStyle().bigText(big));

        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        try { nm.notify(id, b.build()); } catch (Exception ignored) { }
        call.resolve();
    }
}
