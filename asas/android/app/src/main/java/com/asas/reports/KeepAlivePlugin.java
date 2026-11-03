package com.asas.reports;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * يشغّل خدمة KeepAliveService أثناء كتابة التقرير ويوقفها بعده (انظر src/core/keepalive.js).
 */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String text = call.getString("text", "يكتب التقرير…");
        askNotificationsOnce();
        askBatteryOnce();
        KeepAliveService running = KeepAliveService.instance;
        if (running != null) {
            running.update(text);
            call.resolve();
            return;
        }
        Context ctx = getContext();
        Intent i = new Intent(ctx, KeepAliveService.class).putExtra("text", text);
        try {
            ContextCompat.startForegroundService(ctx, i);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر تشغيل خدمة الخلفية: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        KeepAliveService running = KeepAliveService.instance;
        if (running != null) running.update(call.getString("text", "يكتب التقرير…"));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new Intent(ctx, KeepAliveService.class));
        String done = call.getString("done", "");
        if (done != null && !done.isEmpty()) KeepAliveService.notifyDone(ctx, done);
        call.resolve();
    }

    /**
     * يطلب مرة واحدة استثناء التطبيق من «تحسين البطارية»، فلا يقطع النظام (أو سامسونج وشاومي) شبكته
     * في الخلفية أثناء كتابة التقرير. نافذة النظام نفسها؛ إن رفض المستخدم يبقى كل شيء كما هو.
     */
    private void askBatteryOnce() {
        if (Build.VERSION.SDK_INT < 23 || getActivity() == null) return;
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) return;
        SharedPreferences prefs = ctx.getSharedPreferences("asas", Context.MODE_PRIVATE);
        if (prefs.getBoolean("askedBattery", false)) return;
        prefs.edit().putBoolean("askedBattery", true).apply();
        getActivity().runOnUiThread(() -> {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + ctx.getPackageName()));
                getActivity().startActivity(i);
            } catch (Exception ignored) {
                // بعض الأجهزة لا توفّر هذه النافذة
            }
        });
    }

    /** أندرويد 13+: يطلب إذن الإشعارات مرة واحدة فقط (الخدمة تعمل حتى لو رُفض). */
    private void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        Context ctx = getContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = ctx.getSharedPreferences("asas", Context.MODE_PRIVATE);
        if (prefs.getBoolean("askedNotifications", false)) return;
        prefs.edit().putBoolean("askedNotifications", true).apply();
        getActivity().runOnUiThread(() ->
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7301));
    }
}
