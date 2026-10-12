package com.yourworld.app.alarm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** يعيد جدولة المنبهات بعد إعادة تشغيل الجهاز أو تحديث التطبيق. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            AlarmReceiver.ensureChannels(ctx);
            AlarmScheduler.rescheduleAll(ctx);
        }
    }
}
