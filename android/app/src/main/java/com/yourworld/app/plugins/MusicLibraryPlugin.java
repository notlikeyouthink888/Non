package com.yourworld.app.plugins;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * يقرأ كل الأغاني الموجودة على الجهاز من MediaStore.
 * لا اتصال بالشبكة إطلاقًا — البيانات كلها محلية.
 */
@CapacitorPlugin(
    name = "MusicLibrary",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MusicLibraryPlugin extends Plugin {

    /** الإذن المناسب حسب إصدار أندرويد. */
    private String alias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    private boolean granted() {
        return getPermissionState(alias()) == com.getcapacitor.PermissionState.GRANTED;
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (granted()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias(alias(), call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    /**
     * يطلب من النظام إعادة فهرسة مجلّدات التنزيل الشائعة (تيليجرام، واتساب، Download…)
     * حتى تظهر الملفات التي نُزّلت للتوّ في MediaStore.
     */
    @PluginMethod
    public void refresh(PluginCall call) {
        java.io.File root = android.os.Environment.getExternalStorageDirectory();
        String[] folders = {
            "Download", "Downloads", "Music", "Telegram",
            "Telegram/Telegram Audio", "Telegram/Telegram Documents", "Telegram/Telegram Music",
            "Android/media/org.telegram.messenger/Telegram",
            "Android/media/org.telegram.messenger/Telegram/Telegram Audio",
            "Android/media/org.telegram.messenger/Telegram/Telegram Documents",
            "Android/media/org.telegram.messenger.web/Telegram/Telegram Audio",
            "WhatsApp/Media/WhatsApp Audio",
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio"
        };

        java.util.ArrayList<String> paths = new java.util.ArrayList<>();
        for (String f : folders) {
            java.io.File dir = new java.io.File(root, f);
            collectAudio(dir, paths, 0);
        }

        JSObject r = new JSObject();
        r.put("requested", paths.size());

        if (paths.isEmpty()) {
            call.resolve(r);
            return;
        }

        final PluginCall saved = call;
        final int[] done = { 0 };
        final int total = paths.size();
        try {
            android.media.MediaScannerConnection.scanFile(
                getContext(),
                paths.toArray(new String[0]),
                null,
                (path, uri) -> {
                    synchronized (done) {
                        done[0]++;
                        if (done[0] >= total) {
                            JSObject out = new JSObject();
                            out.put("requested", total);
                            out.put("scanned", done[0]);
                            saved.resolve(out);
                        }
                    }
                }
            );
        } catch (Exception e) {
            call.resolve(r);
            return;
        }

        // مهلة أمان: لا نترك النداء معلّقًا إن لم يكتمل الفحص
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            synchronized (done) {
                if (done[0] < total) {
                    JSObject out = new JSObject();
                    out.put("requested", total);
                    out.put("scanned", done[0]);
                    out.put("timedOut", true);
                    saved.resolve(out);
                    done[0] = total;   // يمنع استدعاء resolve مرّتين
                }
            }
        }, 6000);
    }

    /** يجمع ملفات الصوت داخل مجلّد (بعمق محدود). */
    private void collectAudio(java.io.File dir, java.util.List<String> out, int depth) {
        if (depth > 2 || out.size() > 600 || dir == null || !dir.isDirectory()) return;
        java.io.File[] files = dir.listFiles();
        if (files == null) return;
        for (java.io.File f : files) {
            if (f.isDirectory()) {
                collectAudio(f, out, depth + 1);
            } else {
                String n = f.getName().toLowerCase();
                if (n.endsWith(".mp3") || n.endsWith(".m4a") || n.endsWith(".aac")
                        || n.endsWith(".ogg") || n.endsWith(".opus") || n.endsWith(".wav")
                        || n.endsWith(".flac") || n.endsWith(".mka")) {
                    out.add(f.getAbsolutePath());
                }
            }
            if (out.size() > 600) return;
        }
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!granted()) {
            call.reject("PERMISSION_DENIED");
            return;
        }
        long minDuration = call.getLong("minDurationMs", 0L);

        Uri collection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.DISPLAY_NAME
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String order = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";

        JSArray tracks = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(collection, projection, selection, null, order)) {
            if (c != null) {
                int iId = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int iTitle = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int iArtist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int iAlbum = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int iAlbumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int iDur = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int iSize = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                int iYear = c.getColumnIndex(MediaStore.Audio.Media.YEAR);
                int iTrack = c.getColumnIndex(MediaStore.Audio.Media.TRACK);
                int iAdded = c.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED);
                int iName = c.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);

                while (c.moveToNext()) {
                    long duration = c.getLong(iDur);
                    if (duration < minDuration) continue;

                    long id = c.getLong(iId);
                    long albumId = c.getLong(iAlbumId);

                    JSObject t = new JSObject();
                    t.put("id", String.valueOf(id));
                    String title = c.getString(iTitle);
                    if (title == null || title.trim().isEmpty()) {
                        title = iName >= 0 ? c.getString(iName) : "بلا عنوان";
                    }
                    t.put("title", title);
                    t.put("artist", c.getString(iArtist));
                    t.put("album", c.getString(iAlbum));
                    t.put("durationMs", duration);
                    t.put("size", c.getLong(iSize));
                    if (iYear >= 0) t.put("year", c.getInt(iYear));
                    if (iTrack >= 0) t.put("track", c.getInt(iTrack));
                    // DATE_ADDED بالثواني
                    if (iAdded >= 0) t.put("addedAt", c.getLong(iAdded) * 1000L);
                    t.put("uri", ContentUris.withAppendedId(collection, id).toString());
                    t.put("artUri", "content://media/external/audio/albumart/" + albumId);
                    if (iName >= 0) t.put("path", c.getString(iName));
                    tracks.put(t);
                }
            }
        } catch (Exception e) {
            call.reject("SCAN_FAILED: " + e.getMessage());
            return;
        }

        JSObject r = new JSObject();
        r.put("tracks", tracks);
        r.put("count", tracks.length());
        call.resolve(r);
    }
}
