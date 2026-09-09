package com.yourworld.app.alarm;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** يحفظ المنبهات المجدولة حتى تُعاد جدولتها بعد إعادة تشغيل الجهاز. */
public class AlarmStore {

    private static final String PREFS = "yw_alarms";
    private static final String KEY = "pending";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static List<JSONObject> all(Context ctx) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs(ctx).getString(KEY, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) out.add(o);
            }
        } catch (Exception ignored) { }
        return out;
    }

    public static void put(Context ctx, JSONObject alarm) {
        List<JSONObject> list = all(ctx);
        int id = alarm.optInt("id");
        dropId(list, id);
        list.add(alarm);
        write(ctx, list);
    }

    public static void remove(Context ctx, int id) {
        List<JSONObject> list = all(ctx);
        dropId(list, id);
        write(ctx, list);
    }

    public static void clear(Context ctx) {
        write(ctx, new ArrayList<>());
    }

    public static JSONObject get(Context ctx, int id) {
        for (JSONObject o : all(ctx)) if (o.optInt("id") == id) return o;
        return null;
    }

    private static void dropId(List<JSONObject> list, int id) {
        for (int i = list.size() - 1; i >= 0; i--) {
            if (list.get(i).optInt("id") == id) list.remove(i);
        }
    }

    private static void write(Context ctx, List<JSONObject> list) {
        JSONArray arr = new JSONArray();
        for (JSONObject o : list) arr.put(o);
        prefs(ctx).edit().putString(KEY, arr.toString()).apply();
    }
}
