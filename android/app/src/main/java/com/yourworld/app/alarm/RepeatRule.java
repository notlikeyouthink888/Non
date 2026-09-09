package com.yourworld.app.alarm;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * قاعدة التكرار — نفس المنطق المستعمل في طبقة الويب (src/sections/time/repeat.js).
 *
 * type: none | daily | weekly | everyN | monthly | yearly
 *   weekly  → days: أيام الأسبوع (0 الأحد … 6 السبت)
 *   everyN  → interval: كل N يوم ابتداءً من anchor
 *   monthly → نفس يوم الشهر
 *   yearly  → نفس اليوم والشهر
 * ويمكن حصر التكرار داخل نافذة زمنية: from / until (بالمللي ثانية)،
 * أو داخل أشهر محدّدة عبر months (1..12).
 */
public class RepeatRule {

    public String type = "none";
    public int[] days = new int[0];
    public int interval = 1;
    public long anchor = 0;
    public long from = 0;
    public long until = 0;
    public int[] months = new int[0];

    public static RepeatRule from(JSONObject o) {
        RepeatRule r = new RepeatRule();
        if (o == null) return r;
        r.type = o.optString("type", "none");
        r.interval = Math.max(1, o.optInt("interval", 1));
        r.anchor = o.optLong("anchor", 0);
        r.from = o.optLong("from", 0);
        r.until = o.optLong("until", 0);
        r.days = intArray(o.optJSONArray("days"));
        r.months = intArray(o.optJSONArray("months"));
        return r;
    }

    private static int[] intArray(JSONArray a) {
        if (a == null) return new int[0];
        int[] out = new int[a.length()];
        for (int i = 0; i < a.length(); i++) out[i] = a.optInt(i, -1);
        return out;
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("type", type);
            o.put("interval", interval);
            o.put("anchor", anchor);
            o.put("from", from);
            o.put("until", until);
            o.put("days", new JSONArray(days));
            o.put("months", new JSONArray(months));
        } catch (Exception ignored) { }
        return o;
    }

    public boolean repeats() { return !"none".equals(type); }

    /**
     * أقرب موعد تالٍ بعد {@code after}، مع الحفاظ على ساعة/دقيقة الموعد الأصلي.
     * يعيد 0 إذا انتهت نافذة التكرار.
     */
    public long nextAfter(long previousFireAt, long after) {
        if (!repeats()) return 0;

        Calendar base = Calendar.getInstance();
        base.setTimeInMillis(previousFireAt);
        int hour = base.get(Calendar.HOUR_OF_DAY);
        int minute = base.get(Calendar.MINUTE);

        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(Math.max(previousFireAt, after));
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= after) c.add(Calendar.DAY_OF_YEAR, 1);

        for (int guard = 0; guard < 800; guard++) {
            long t = c.getTimeInMillis();
            if (until > 0 && t > until) return 0;
            if (t > after && matches(c, previousFireAt)) return t;
            c.add(Calendar.DAY_OF_YEAR, 1);
        }
        return 0;
    }

    private boolean matches(Calendar c, long anchorFallback) {
        long t = c.getTimeInMillis();
        if (from > 0 && t < from) return false;
        if (until > 0 && t > until) return false;
        if (months.length > 0 && !contains(months, c.get(Calendar.MONTH) + 1)) return false;

        Calendar a = Calendar.getInstance();
        a.setTimeInMillis(anchor > 0 ? anchor : anchorFallback);

        switch (type) {
            case "daily":
                return true;
            case "weekly":
                return days.length == 0 || contains(days, c.get(Calendar.DAY_OF_WEEK) - 1);
            case "everyN": {
                long dayDiff = daysBetween(a, c);
                return dayDiff >= 0 && dayDiff % interval == 0;
            }
            case "monthly":
                return c.get(Calendar.DAY_OF_MONTH) == a.get(Calendar.DAY_OF_MONTH);
            case "yearly":
                return c.get(Calendar.DAY_OF_MONTH) == a.get(Calendar.DAY_OF_MONTH)
                        && c.get(Calendar.MONTH) == a.get(Calendar.MONTH);
            default:
                return false;
        }
    }

    private static boolean contains(int[] arr, int v) {
        for (int x : arr) if (x == v) return true;
        return false;
    }

    private static long daysBetween(Calendar a, Calendar b) {
        Calendar x = midnight(a), y = midnight(b);
        return Math.round((y.getTimeInMillis() - x.getTimeInMillis()) / 86400000.0);
    }

    private static Calendar midnight(Calendar src) {
        Calendar c = (Calendar) src.clone();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c;
    }
}
