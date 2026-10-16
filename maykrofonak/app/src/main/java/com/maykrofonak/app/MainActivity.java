package com.maykrofonak.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.database.ContentObserver;
import android.graphics.Insets;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.widget.ImageView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** الشاشة الوحيدة: زر كبير للمايك، حالة المكبّر، وإعدادات بسيطة. */
public final class MainActivity extends Activity implements MicService.Listener {
    static final String ACTION_SHORTCUT_START = "com.maykrofonak.app.action.START";
    private static final int REQ_PERMS = 1;
    private static final Locale AR = Locale.forLanguageTag("ar");

    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioManager am;

    private MicButton micButton;
    private TextView micState, micHint, speakerStatus, speakerName, openBluetooth;
    private ImageView speakerIcon;
    private SeekBar volume, micGain, fxAmount;
    private TextView volumeValue, micValue, fxAmountValue, micDiag;
    private View fxAmountRow;
    private Switch antiFeedback, noiseReduction;
    private final TextView[] chips = new TextView[Effects.COUNT];

    private final float[] recentIn = new float[8];   // آخر ثانيتين (كل 250 ms)
    private int recentPos;
    private final Runnable diagTick = new Runnable() {
        @Override
        public void run() {
            refreshDiag();
            main.postDelayed(this, 250);
        }
    };

    /** طلب تشغيل ينتظر رجوعنا للواجهة (بعد الإذن أو من الاختصار). */
    private boolean startOnResume;
    private boolean resumed;

    private final AudioDeviceCallback deviceCallback = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
            refreshSpeaker();
            refreshVolume();
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            refreshSpeaker();
            refreshVolume();
        }
    };

    private final ContentObserver volumeObserver = new ContentObserver(main) {
        @Override
        public void onChange(boolean selfChange) {
            refreshVolume();
        }
    };

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        // الواجهة عربية من اليمين لليسار حتى لو لغة التلفون غير عربية
        Configuration c = new Configuration();
        c.setLocale(AR);
        applyOverrideConfiguration(c);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        Prefs.load(this);
        edgeToEdge();
        bindViews();
        setupControls();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        MicService.addListener(this);
        am.registerAudioDeviceCallback(deviceCallback, main);
        getContentResolver().registerContentObserver(Settings.System.CONTENT_URI, true, volumeObserver);
        refreshSpeaker();
        refreshVolume();
        refreshMic();
        showPendingError();
        main.post(diagTick);
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (startOnResume) {
            startOnResume = false;
            requestStart();
        }
    }

    @Override
    protected void onPause() {
        resumed = false;
        super.onPause();
    }

    @Override
    protected void onStop() {
        main.removeCallbacks(diagTick);
        MicService.removeListener(this);
        am.unregisterAudioDeviceCallback(deviceCallback);
        getContentResolver().unregisterContentObserver(volumeObserver);
        super.onStop();
    }

    @Override
    public void onMicStateChanged() {
        refreshMic();
        showPendingError();
    }

    // ------------------------------------------------------------ تشغيل وإيقاف

    private void handleIntent(Intent intent) {
        if (intent == null || !ACTION_SHORTCUT_START.equals(intent.getAction())) return;
        setIntent(new Intent(this, MainActivity.class));   // حتى ما يتكرر بعد تدوير الشاشة
        if (MicService.state() == MicService.State.IDLE) {
            if (resumed) requestStart();
            else startOnResume = true;
        }
    }

    private void onMicTapped() {
        if (MicService.state() != MicService.State.IDLE) {
            MicService.stop(this);
            return;
        }
        requestStart();
    }

    private void requestStart() {
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !missing.isEmpty()) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);   // نطلبهم مرّة وحدة سوا
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQ_PERMS);
            return;
        }
        try {
            MicService.start(this);
        } catch (RuntimeException e) {
            showMessage(R.string.err_title, R.string.err_start);
            return;
        }
        if (Speakers.best(am) == null) showConnectDialog();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_PERMS || results.length == 0) return;
        boolean mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        if (mic) {
            startOnResume = true;   // نبدأ بعد ما ترجع الشاشة للواجهة (شرط أندرويد للمايك)
        } else if (!shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) {
            showPermissionDialog();
        } else {
            Toast.makeText(this, R.string.perm_denied, Toast.LENGTH_LONG).show();
        }
    }

    // ------------------------------------------------------------ الواجهة

    private void bindViews() {
        micButton = findViewById(R.id.micButton);
        micState = findViewById(R.id.micState);
        micHint = findViewById(R.id.micHint);
        speakerIcon = findViewById(R.id.speakerIcon);
        speakerStatus = findViewById(R.id.speakerStatus);
        speakerName = findViewById(R.id.speakerName);
        openBluetooth = findViewById(R.id.openBluetooth);
        volume = findViewById(R.id.volume);
        volumeValue = findViewById(R.id.volumeValue);
        micGain = findViewById(R.id.micGain);
        micValue = findViewById(R.id.micValue);
        fxAmount = findViewById(R.id.fxAmount);
        fxAmountValue = findViewById(R.id.fxAmountValue);
        fxAmountRow = findViewById(R.id.fxAmountRow);
        micDiag = findViewById(R.id.micDiag);
        antiFeedback = findViewById(R.id.antiFeedback);
        noiseReduction = findViewById(R.id.noiseReduction);
        chips[Effects.NONE] = findViewById(R.id.fxNone);
        chips[Effects.ECHO] = findViewById(R.id.fxEcho);
        chips[Effects.HALL] = findViewById(R.id.fxHall);
        chips[Effects.DEEP] = findViewById(R.id.fxDeep);
        chips[Effects.THIN] = findViewById(R.id.fxThin);
        chips[Effects.RADIO] = findViewById(R.id.fxRadio);
    }

    private void setupControls() {
        micButton.setOnClickListener(v -> onMicTapped());
        openBluetooth.setOnClickListener(v -> openBluetoothSettings());
        findViewById(R.id.testSound).setOnClickListener(v -> {
            AudioDeviceInfo out = Speakers.best(am);
            if (out == null) {
                Toast.makeText(this, R.string.test_sound_none, Toast.LENGTH_SHORT).show();
                showConnectDialog();
            } else if (!TestTone.play(out)) {
                Toast.makeText(this, R.string.test_sound_failed, Toast.LENGTH_SHORT).show();
            }
        });

        volume.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser) {
                    try {
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, p, 0);
                    } catch (RuntimeException ignored) {
                        // وضع «عدم الإزعاج» قد يمنع التغيير
                    }
                }
                volumeValue.setText(percent(s.getMax() == 0 ? 0 : p * 100 / s.getMax()));
            }
        });

        micGain.setProgress(Prefs.micPct);
        micValue.setText(percent(Prefs.micPct));
        micGain.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                micValue.setText(percent(p));
                if (fromUser) Prefs.setMic(MainActivity.this, p);
            }
        });

        fxAmount.setProgress(Prefs.fxPct);
        fxAmountValue.setText(percent(Prefs.fxPct));
        fxAmount.setOnSeekBarChangeListener(new SimpleSeek() {
            @Override
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                fxAmountValue.setText(percent(p));
                if (fromUser) Prefs.setFxAmount(MainActivity.this, p);
            }
        });

        for (int i = 0; i < chips.length; i++) {
            final int fx = i;
            chips[i].setOnClickListener(v -> {
                Prefs.setEffect(this, fx);
                refreshChips();
            });
        }
        refreshChips();

        antiFeedback.setChecked(Prefs.antiFeedback);
        antiFeedback.setOnCheckedChangeListener((b, on) -> Prefs.setAntiFeedback(this, on));
        noiseReduction.setChecked(Prefs.noiseReduction);
        noiseReduction.setOnCheckedChangeListener((b, on) -> Prefs.setNoiseReduction(this, on));
    }

    private void refreshChips() {
        for (int i = 0; i < chips.length; i++) chips[i].setSelected(i == Prefs.effect);
        fxAmountRow.setVisibility(Effects.hasAmount(Prefs.effect) ? View.VISIBLE : View.GONE);
    }

    private void refreshMic() {
        switch (MicService.state()) {
            case LIVE:
                micButton.setMode(MicButton.LIVE);
                if (MicService.micSilenced()) {
                    micState.setText(R.string.state_silenced);
                    micHint.setText(R.string.hint_silenced);
                } else {
                    micState.setText(R.string.state_live);
                    micHint.setText(getString(R.string.hint_live, MicService.outputName()));
                }
                break;
            case STARTING:
                micButton.setMode(MicButton.STARTING);
                micState.setText(R.string.state_starting);
                micHint.setText(R.string.hint_starting);
                break;
            case WAITING:
                micButton.setMode(MicButton.WAITING);
                micState.setText(R.string.state_waiting);
                micHint.setText(R.string.hint_waiting);
                break;
            default:
                micButton.setMode(MicButton.IDLE);
                micState.setText(R.string.state_idle);
                micHint.setText(R.string.hint_idle);
                break;
        }
    }

    /** سطر المستويات تحت الزر: يبيّن إذا المايك يسمعك وكم يطلع للمكبّر. */
    private void refreshDiag() {
        if (MicService.state() != MicService.State.LIVE) {
            micDiag.setVisibility(View.INVISIBLE);
            java.util.Arrays.fill(recentIn, 0f);
            return;
        }
        recentIn[recentPos] = MicEngine.inLevel;
        recentPos = (recentPos + 1) % recentIn.length;
        float maxIn = 0f;
        for (float v : recentIn) maxIn = Math.max(maxIn, v);
        micDiag.setVisibility(View.VISIBLE);
        if (maxIn < 0.0003f && !MicService.micSilenced()) {   // ‎-70 dBFS: المايك ما يوصله صوت
            micDiag.setText(R.string.diag_quiet);
            micDiag.setTextColor(getColor(R.color.warn));
        } else {
            micDiag.setText(getString(R.string.diag_line, bars(MicEngine.inLevel), bars(MicEngine.level), MicEngine.queueMs));
            micDiag.setTextColor(getColor(R.color.text_dim));
        }
    }

    /** مستوى بخمس شرائط: ‎-60 dBFS ← فارغ، 0 dBFS ← مليان. */
    private static String bars(float peak) {
        float db = Params.linToDb(peak);
        int n = Math.max(0, Math.min(5, Math.round((db + 60f) / 12f)));
        StringBuilder sb = new StringBuilder(5);
        for (int i = 0; i < 5; i++) sb.append(i < n ? '▮' : '▯');
        return sb.toString();
    }

    private void refreshSpeaker() {
        AudioDeviceInfo d = Speakers.best(am);
        int color;
        if (d != null) {
            color = getColor(R.color.good);
            speakerStatus.setText(R.string.speaker_connected);
            speakerName.setText(Speakers.label(this, d));
            speakerIcon.setImageResource(Speakers.isBluetooth(d.getType()) ? R.drawable.ic_bluetooth : R.drawable.ic_speaker);
        } else {
            color = getColor(R.color.warn);
            speakerStatus.setText(R.string.speaker_none);
            speakerName.setText(R.string.speaker_none_hint);
            speakerIcon.setImageResource(R.drawable.ic_bluetooth);
        }
        speakerStatus.setTextColor(color);
        speakerIcon.setImageTintList(ColorStateList.valueOf(color));
        speakerIcon.setBackgroundTintList(ColorStateList.valueOf((color & 0x00FFFFFF) | 0x26000000));
    }

    private void refreshVolume() {
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        if (volume.getMax() != max) volume.setMax(max);
        volume.setProgress(cur);
        volumeValue.setText(percent(max == 0 ? 0 : cur * 100 / max));
    }

    private String percent(int v) {
        return String.format(AR, "%d٪", v);
    }

    @SuppressWarnings("deprecation")
    private void edgeToEdge() {
        // نرسم تحت أشرطة النظام بكل الإصدارات ونضيف الهوامش بأنفسنا (أندرويد 15 يفرض هذا أصلاً)
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        View root = findViewById(R.id.root);
        View content = findViewById(R.id.content);
        final int l = content.getPaddingLeft(), t = content.getPaddingTop(), r = content.getPaddingRight(), b = content.getPaddingBottom();
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int il, it, ir, ib;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                il = i.left;
                it = i.top;
                ir = i.right;
                ib = i.bottom;
            } else {
                il = insets.getSystemWindowInsetLeft();
                it = insets.getSystemWindowInsetTop();
                ir = insets.getSystemWindowInsetRight();
                ib = insets.getSystemWindowInsetBottom();
            }
            content.setPadding(l + il, t + it, r + ir, b + ib);
            return insets;
        });
    }

    // ------------------------------------------------------------ نوافذ

    private void showConnectDialog() {
        showDialog(new AlertDialog.Builder(this)
                .setTitle(R.string.connect_title)
                .setMessage(R.string.connect_msg)
                .setPositiveButton(R.string.open_bluetooth_long, (d, w) -> openBluetoothSettings())
                .setNegativeButton(R.string.ok, null));
    }

    private void showPermissionDialog() {
        showDialog(new AlertDialog.Builder(this)
                .setTitle(R.string.perm_title)
                .setMessage(R.string.perm_msg)
                .setPositiveButton(R.string.open_settings, (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", getPackageName(), null)));
                    } catch (ActivityNotFoundException ignored) {
                        // نادر جداً
                    }
                })
                .setNegativeButton(R.string.cancel, null));
    }

    private void showPendingError() {
        if (isFinishing() || isDestroyed()) return;
        int e = MicService.takeError();
        if (e == 0) return;
        int msg;
        switch (e) {
            case MicService.ERR_MIC:
                msg = R.string.err_mic;
                break;
            case MicService.ERR_MIC_SILENT:
                msg = R.string.err_mic_silent;
                break;
            case MicService.ERR_OUTPUT:
                msg = R.string.err_output;
                break;
            case MicService.ERR_ROUTE:
                msg = R.string.err_route;
                break;
            default:
                msg = R.string.err_start;
                break;
        }
        showMessage(R.string.err_title, msg);
    }

    private void showMessage(int title, int msg) {
        showDialog(new AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton(R.string.ok, null));
    }

    private void showDialog(AlertDialog.Builder b) {
        if (isFinishing() || isDestroyed()) return;
        AlertDialog d = b.show();
        if (d.getWindow() != null) d.getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
    }

    private void openBluetoothSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
        } catch (ActivityNotFoundException e) {
            try {
                startActivity(new Intent(Settings.ACTION_SETTINGS));
            } catch (ActivityNotFoundException ignored) {
                // لا شيء
            }
        }
    }

    private abstract static class SimpleSeek implements SeekBar.OnSeekBarChangeListener {
        @Override
        public void onStartTrackingTouch(SeekBar s) {}

        @Override
        public void onStopTrackingTouch(SeekBar s) {}
    }
}
