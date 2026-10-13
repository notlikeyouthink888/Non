package com.yourworld.app.plugins;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.yourworld.app.player.PlayerService;
import com.yourworld.app.player.Track;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** واجهة الويب إلى محرّك التشغيل الأصلي. */
@CapacitorPlugin(
    name = "Player",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class PlayerPlugin extends Plugin {

    @Override
    public void load() {
        PlayerService.setListener((type, state) -> {
            JSObject o = toJS(state);
            o.put("type", type);
            notifyListeners("trackChanged".equals(type) ? "trackChanged" : "state", o);
        });
    }

    private PlayerService svc() { return PlayerService.get(); }

    /** تحويل آمن من JSONObject إلى JSObject. */
    private static JSObject toJS(JSONObject o) {
        try {
            return JSObject.fromJSONObject(o);
        } catch (JSONException e) {
            return new JSObject();
        }
    }

    /** يبدأ الخدمة إن لم تكن تعمل. */
    private void ensureService() {
        Intent i = new Intent(getContext(), PlayerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(i);
        else getContext().startService(i);
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        JSONArray arr = call.getArray("tracks");
        if (arr == null) { call.reject("NO_TRACKS"); return; }

        List<Track> tracks = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null) tracks.add(Track.from(o));
        }
        int index = call.getInt("index", 0);
        boolean autoPlay = Boolean.TRUE.equals(call.getBoolean("autoPlay", true));

        ensureService();
        getBridge().executeOnMainThread(() -> {
            PlayerService s = svc();
            if (s == null) {
                // الخدمة لم تُنشأ بعد — أعد المحاولة بعد لحظة
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    PlayerService s2 = svc();
                    if (s2 != null) s2.setQueue(tracks, index, autoPlay);
                }, 250);
            } else {
                s.setQueue(tracks, index, autoPlay);
            }
            call.resolve();
        });
    }

    /** إجراء على الخدمة (بديل Consumer لدعم أندرويد 6). */
    private interface Action { void run(PlayerService s); }

    private void run(PluginCall call, Action action) {
        ensureService();
        getBridge().executeOnMainThread(() -> {
            PlayerService s = svc();
            if (s != null) action.run(s);
            call.resolve();
        });
    }

    @PluginMethod public void play(PluginCall call) { run(call, PlayerService::play); }
    @PluginMethod public void pause(PluginCall call) { run(call, PlayerService::pause); }
    @PluginMethod public void toggle(PluginCall call) { run(call, PlayerService::toggle); }
    @PluginMethod public void next(PluginCall call) { run(call, s -> s.next(true)); }
    @PluginMethod public void prev(PluginCall call) { run(call, PlayerService::prev); }
    @PluginMethod public void stop(PluginCall call) { run(call, PlayerService::stopPlayback); }

    @PluginMethod
    public void seek(PluginCall call) {
        long pos = call.getLong("positionMs", 0L);
        run(call, s -> s.seek(pos));
    }

    @PluginMethod
    public void seekBy(PluginCall call) {
        long delta = call.getLong("deltaMs", 0L);
        run(call, s -> s.seekBy(delta));
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        float speed = call.getFloat("speed", 1f);
        boolean pitch = Boolean.TRUE.equals(call.getBoolean("preservePitch", true));
        run(call, s -> s.setSpeed(speed, pitch));
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        String mode = call.getString("mode", "off");
        run(call, s -> s.setRepeat(mode));
    }

    @PluginMethod
    public void setShuffle(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("shuffle", false));
        run(call, s -> s.setShuffle(on));
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        float v = call.getFloat("volume", 1f);
        float b = call.getFloat("balance", 0f);
        run(call, s -> s.setVolume(v, b));
    }

    @PluginMethod
    public void setEffects(PluginCall call) {
        JSONObject fx = call.getData();
        run(call, s -> s.setEffects(fx));
    }

    @PluginMethod
    public void setSleepTimer(PluginCall call) {
        int minutes = call.getInt("minutes", 0);
        run(call, s -> s.setSleepTimer(minutes));
    }

    @PluginMethod
    public void getState(PluginCall call) {
        PlayerService s = svc();
        if (s == null) {
            JSObject o = new JSObject();
            o.put("playing", false);
            o.put("index", 0);
            o.put("positionMs", 0);
            o.put("durationMs", 0);
            call.resolve(o);
            return;
        }
        call.resolve(toJS(s.snapshot()));
    }
}
