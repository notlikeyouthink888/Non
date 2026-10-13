package com.yourworld.app.alarm;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.widget.TextView;

import com.yourworld.app.R;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** شاشة المنبّه الكاملة — تظهر فوق شاشة القفل مع زرّي الغفوة والإيقاف. */
public class AlarmActivity extends Activity {

    private JSONObject alarm;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable clockTick;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_alarm);

        alarm = parse(getIntent().getStringExtra("payload"));

        TextView title = findViewById(R.id.alarm_title);
        TextView body = findViewById(R.id.alarm_body);
        TextView clock = findViewById(R.id.alarm_clock);

        title.setText(alarm != null ? alarm.optString("title", "منبّه") : "منبّه");
        String bodyText = alarm != null ? alarm.optString("body", "") : "";
        body.setText(bodyText);
        body.setVisibility(bodyText.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);

        clockTick = new Runnable() {
            @Override public void run() {
                clock.setText(new SimpleDateFormat("HH:mm", Locale.US).format(new Date()));
                handler.postDelayed(this, 1000);
            }
        };
        handler.post(clockTick);

        int snoozeMin = alarm != null ? alarm.optInt("snoozeMin", 9) : 9;
        TextView snooze = findViewById(R.id.alarm_snooze);
        snooze.setText("غفوة " + snoozeMin + " دقيقة");
        snooze.setOnClickListener(v -> send(AlarmReceiver.ACTION_SNOOZE));
        findViewById(R.id.alarm_dismiss).setOnClickListener(v -> send(AlarmReceiver.ACTION_DISMISS));
    }

    private void send(String action) {
        if (alarm != null) {
            Intent i = new Intent(this, AlarmReceiver.class)
                    .setAction(action)
                    .putExtra("payload", alarm.toString());
            sendBroadcast(i);
        } else {
            AlarmRinger.stop();
        }
        finish();
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // لا يُغلق المنبّه بزر الرجوع — يجب الإيقاف أو الغفوة
    }

    private static JSONObject parse(String s) {
        try { return s == null ? null : new JSONObject(s); } catch (Exception e) { return null; }
    }
}
