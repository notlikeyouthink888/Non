package com.pdfs.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * ما لا توفّره إضافات Capacitor الرسمية:
 *  - saveToDownloads: نسخ الملف إلى «التنزيلات/pdfs» حيث يراه مدير الملفات.
 *  - open: فتح الملف بتطبيق عرض PDF في الجهاز.
 *  - takeShared + حدث shared: الصور التي يشاركها المستخدم مع التطبيق من تطبيقات أخرى.
 */
@CapacitorPlugin(
    name = "Pdfs",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class PdfsPlugin extends Plugin {

    private static final String FOLDER = "pdfs";
    private final List<JSObject> shared = new ArrayList<>();

    @Override
    public void load() {
        File dir = sharedDir();
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        handleIntent(getActivity().getIntent(), true);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent, false);
    }

    /* ───────── الحفظ في التنزيلات ───────── */

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        if (call.getString("uri") == null) {
            call.reject("uri مفقود");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionDone");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void storagePermissionDone(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) save(call);
        else call.reject("لم يُسمح بالوصول إلى التخزين");
    }

    private void save(PluginCall call) {
        final File src = fileFromUri(call.getString("uri"));
        final String name = safeName(call.getString("name", src.getName()));
        new Thread(() -> {
            try {
                if (!src.exists()) throw new IOException("الملف المؤقّت غير موجود");
                Context ctx = getContext();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = ctx.getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri item = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (item == null) throw new IOException("تعذّر إنشاء الملف في التنزيلات");
                    try (InputStream in = new FileInputStream(src); OutputStream out = cr.openOutputStream(item)) {
                        if (out == null) throw new IOException("تعذّر الكتابة في التنزيلات");
                        copy(in, out);
                    } catch (IOException e) {
                        cr.delete(item, null, null);
                        throw e;
                    }
                    v.clear();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(item, v, null, null);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
                    if (!dir.exists() && !dir.mkdirs()) throw new IOException("تعذّر إنشاء مجلّد التنزيلات");
                    File dest = unique(dir, name);
                    try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dest)) {
                        copy(in, out);
                    }
                    MediaScannerConnection.scanFile(ctx, new String[] { dest.getAbsolutePath() }, new String[] { "application/pdf" }, null);
                }
                JSObject ret = new JSObject();
                ret.put("location", "التنزيلات/" + FOLDER);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "تعذّر الحفظ", e);
            }
        }).start();
    }

    /* ───────── الفتح بتطبيق آخر ───────── */

    @PluginMethod
    public void open(PluginCall call) {
        String raw = call.getString("uri");
        if (raw == null) {
            call.reject("uri مفقود");
            return;
        }
        String mime = call.getString("mime", "application/pdf");
        try {
            File f = fileFromUri(raw);
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, mime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (view.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("لا يوجد في جهازك تطبيق لعرض ملفات PDF");
                return;
            }
            Intent chooser = Intent.createChooser(view, "فتح بواسطة");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("لا يوجد في جهازك تطبيق لعرض ملفات PDF");
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "تعذّر فتح الملف", e);
        }
    }

    /* ───────── الصور المشارَكة من تطبيقات أخرى ───────── */

    @PluginMethod
    public void takeShared(PluginCall call) {
        JSArray items = new JSArray();
        synchronized (shared) {
            for (JSObject o : shared) items.put(o);
            shared.clear();
        }
        JSObject ret = new JSObject();
        ret.put("items", items);
        call.resolve(ret);
    }

    private void handleIntent(Intent intent, boolean initial) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;

        final List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        if (uris.isEmpty()) return;
        // لا نعالج نفس المشاركة مرّتين إن أُعيد إنشاء النشاط
        if (initial) getActivity().setIntent(new Intent(Intent.ACTION_MAIN));

        new Thread(() -> {
            ContentResolver cr = getContext().getContentResolver();
            int added = 0;
            for (Uri u : uris) {
                try {
                    String mime = cr.getType(u);
                    if (mime == null) mime = "image/jpeg";
                    String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
                    File dest = new File(sharedDir(), UUID.randomUUID() + "." + (ext != null ? ext : "jpg"));
                    try (InputStream in = cr.openInputStream(u); OutputStream out = new FileOutputStream(dest)) {
                        if (in == null) continue;
                        copy(in, out);
                    }
                    JSObject o = new JSObject();
                    o.put("uri", Uri.fromFile(dest).toString());
                    o.put("name", displayName(cr, u, dest.getName()));
                    o.put("mime", mime);
                    synchronized (shared) { shared.add(o); }
                    added++;
                } catch (Exception ignored) {
                    // صورة واحدة تالفة لا تمنع البقية
                }
            }
            if (added > 0) notifyListeners("shared", new JSObject(), true);
        }).start();
    }

    /* ───────── أدوات ───────── */

    private File sharedDir() {
        File d = new File(getContext().getCacheDir(), "shared");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static File fileFromUri(String raw) {
        Uri u = Uri.parse(raw);
        String path = u.getPath();
        return new File(path != null ? path : raw);
    }

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", " ").trim();
        if (n.isEmpty()) n = "pdfs";
        if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
        return n;
    }

    private static File unique(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        String base = name.substring(0, name.length() - 4);
        for (int i = 1; ; i++) {
            f = new File(dir, base + " (" + i + ").pdf");
            if (!f.exists()) return f;
        }
    }

    private static String displayName(ContentResolver cr, Uri u, String fallback) {
        try (Cursor c = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } catch (Exception ignored) {
            // بعض المزوّدين لا يدعمون الاستعلام
        }
        return fallback;
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int r;
        while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
        out.flush();
    }
}
