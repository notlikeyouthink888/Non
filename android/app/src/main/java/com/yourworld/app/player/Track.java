package com.yourworld.app.player;

import org.json.JSONObject;

/** مسار صوتي في قائمة التشغيل. */
public class Track {
    public String id = "";
    public String uri = "";
    public String title = "";
    public String artist = "";
    public String album = "";
    public long durationMs = 0;
    public String artUri = null;

    public static Track from(JSONObject o) {
        Track t = new Track();
        t.id = o.optString("id", "");
        // rawUri هو content:// الأصلي؛ uri قد يكون محوَّلًا للويب فقط
        String raw = o.optString("rawUri", "");
        t.uri = raw.isEmpty() ? o.optString("uri", "") : raw;
        t.title = o.optString("title", "");
        t.artist = o.optString("artist", "");
        t.album = o.optString("album", "");
        t.durationMs = o.optLong("durationMs", 0);
        String art = o.optString("artUri", "");
        t.artUri = art.isEmpty() || "null".equals(art) ? null : art;
        return t;
    }
}
