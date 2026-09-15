package com.yourworld.app.plugins;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * ملفات التطبيق: فتح ملف بعارض النظام، وحفظ النسخ الاحتياطية في مجلّد
 * التنزيلات حيث يجدها المستخدم، والبحث عن نسخ قديمة داخل الجهاز واستعادتها.
 *
 * لا شيء هنا يخرج من الجهاز؛ كله تخزين محلّي.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    /** أقصى حجم ملف نصّي نقرأه (نسخة احتياطية) — ١٦ م.ب. */
    private static final int MAX_TEXT_BYTES = 16 * 1024 * 1024;

    /** مجلّد النسخ داخل التنزيلات. */
    private static final String FOLDER = "YourWorld";

    @PluginMethod
    public void openFile(PluginCall call) {
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");

        if (data.isEmpty()) {
            call.reject("NO_DATA");
            return;
        }

        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("MKDIR_FAILED");
                return;
            }

            // نظّف الملفات المؤقّتة الأقدم من يوم
            File[] old = dir.listFiles();
            if (old != null) {
                long cutoff = System.currentTimeMillis() - 86400000L;
                for (File f : old) {
                    if (f.lastModified() < cutoff) {
                        // نتجاهل فشل الحذف — ملف مؤقّت فقط
                        if (!f.delete()) f.deleteOnExit();
                    }
                }
            }

            File out = new File(dir, safeName(name));
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", out);

            Intent view = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(view, name)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getContext().startActivity(chooser);

            JSObject r = new JSObject();
            r.put("opened", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("OPEN_FAILED: " + e.getMessage());
        }
    }

    /**
     * يحفظ ملفًا في «التنزيلات/YourWorld» فيبقى بعد حذف التطبيق ويجده
     * المستخدم بمدير الملفات. يعيد المسار الذي يُعرض له.
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String name = safeName(call.getString("name", "backup.json"));
        String mime = call.getString("mime", "application/json");
        String data = call.getString("data", "");

        if (data.isEmpty()) {
            call.reject("NO_DATA");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            String shown;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                cv.put(MediaStore.MediaColumns.IS_PENDING, 1);

                Uri item = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (item == null) {
                    call.reject("INSERT_FAILED");
                    return;
                }
                try (OutputStream os = cr.openOutputStream(item)) {
                    if (os == null) throw new IllegalStateException("no stream");
                    os.write(bytes);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(item, done, null, null);
                shown = "Download/" + FOLDER + "/" + name;
            } else {
                File dir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("MKDIR_FAILED");
                    return;
                }
                File out = new File(dir, name);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(bytes);
                }
                MediaScannerConnection.scanFile(
                    getContext(), new String[] { out.getAbsolutePath() }, new String[] { mime }, null);
                shown = out.getAbsolutePath();
            }

            // نسخة داخلية أيضًا: تنجو حتى لو حُذف ملف التنزيلات
            saveInternalCopy(name, bytes);

            JSObject r = new JSObject();
            r.put("saved", true);
            r.put("path", shown);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("SAVE_FAILED: " + e.getMessage());
        }
    }

    /**
     * يبحث عن نسخ Your World الاحتياطية داخل الجهاز:
     * فهرس النظام (MediaStore)، ثم مجلّدات التنزيل المعروفة، ثم مجلّد التطبيق.
     */
    @PluginMethod
    public void listBackups(PluginCall call) {
        JSArray out = new JSArray();
        java.util.HashSet<String> seen = new java.util.HashSet<>();

        // ١) فهرس النظام
        try {
            Uri table = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Downloads.EXTERNAL_CONTENT_URI
                : MediaStore.Files.getContentUri("external");
            String[] cols = {
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.DATE_MODIFIED,
            };
            try (Cursor c = getContext().getContentResolver().query(
                table, cols,
                MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
                new String[] { "%your-world%" },
                MediaStore.MediaColumns.DATE_MODIFIED + " DESC")) {
                while (c != null && c.moveToNext()) {
                    String n = c.getString(1);
                    if (n == null || seen.contains(n)) continue;
                    seen.add(n);
                    JSObject o = new JSObject();
                    o.put("name", n);
                    o.put("uri", Uri.withAppendedPath(table, String.valueOf(c.getLong(0))).toString());
                    o.put("size", c.getLong(2));
                    o.put("modified", c.getLong(3) * 1000L);
                    o.put("where", "فهرس الجهاز");
                    out.put(o);
                }
            }
        } catch (Exception ignored) {
            // بعض الأجهزة تمنع الاستعلام — نكمل بالمجلّدات
        }

        // ٢) مجلّدات معروفة
        java.util.ArrayList<File> dirs = new java.util.ArrayList<>();
        try {
            File dl = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            dirs.add(dl);
            dirs.add(new File(dl, FOLDER));
            dirs.add(new File(Environment.getExternalStorageDirectory(), "Documents"));
        } catch (Exception ignored) { }
        dirs.add(new File(getContext().getFilesDir(), "backups"));
        File ext = getContext().getExternalFilesDir(null);
        if (ext != null) dirs.add(new File(ext, "backups"));

        for (File dir : dirs) {
            File[] files = dir == null ? null : dir.listFiles();
            if (files == null) continue;
            for (File f : files) {
                String n = f.getName();
                if (!f.isFile() || !n.contains("your-world") || seen.contains(n)) continue;
                seen.add(n);
                JSObject o = new JSObject();
                o.put("name", n);
                o.put("uri", f.getAbsolutePath());
                o.put("size", f.length());
                o.put("modified", f.lastModified());
                o.put("where", dir.getName());
                out.put(o);
            }
        }

        JSObject r = new JSObject();
        r.put("files", out);
        call.resolve(r);
    }

    /** يقرأ نصّ ملف (نسخة احتياطية) من content:// أو من مسار. */
    @PluginMethod
    public void readText(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri.isEmpty()) {
            call.reject("NO_URI");
            return;
        }
        try (InputStream in = uri.startsWith("content://")
            ? getContext().getContentResolver().openInputStream(Uri.parse(uri))
            : new java.io.FileInputStream(new File(uri))) {

            if (in == null) {
                call.reject("OPEN_FAILED");
                return;
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (bos.size() + n > MAX_TEXT_BYTES) {
                    call.reject("TOO_LARGE");
                    return;
                }
                bos.write(buf, 0, n);
            }
            JSObject r = new JSObject();
            r.put("text", bos.toString("UTF-8"));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("READ_FAILED: " + e.getMessage());
        }
    }

    /** نسخة داخل مساحة التطبيق الخاصّة، نحتفظ بآخر عشر نسخ. */
    private void saveInternalCopy(String name, byte[] bytes) {
        try {
            File dir = new File(getContext().getFilesDir(), "backups");
            if (!dir.exists() && !dir.mkdirs()) return;
            try (FileOutputStream fos = new FileOutputStream(new File(dir, name))) {
                fos.write(bytes);
            }
            File[] all = dir.listFiles();
            if (all == null || all.length <= 10) return;
            java.util.Arrays.sort(all, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            for (int i = 0; i < all.length - 10; i++) {
                if (!all[i].delete()) all[i].deleteOnExit();
            }
        } catch (Exception ignored) {
            // النسخة الداخلية إضافية — فشلها لا يُفشل الحفظ
        }
    }

    /** اسم ملف آمن (بلا مسارات). */
    private String safeName(String name) {
        String n = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (n.isEmpty()) n = "file";
        return n.length() > 90 ? n.substring(n.length() - 90) : n;
    }
}
