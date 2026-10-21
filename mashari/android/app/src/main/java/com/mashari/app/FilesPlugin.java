package com.mashari.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * حفظ وفتح ومشاركة ملفات النسخ الاحتياطي والنصوص.
 * يستعمل منتقي ملفات النظام، فما يحتاج أي إذن تخزين.
 *
 * saveFile({ filename, data, mime }) → { saved, uri }
 * openFile() → { data, name } أو {} عند الإلغاء
 * shareFile({ filename, data, mime, title })
 * shareText({ text, title })
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    private static final int MAX_BYTES = 30 * 1024 * 1024;

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("ماكو بيانات للحفظ");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("filename", "backup.json")));
        launch(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = okUri(result);
        if (uri == null) {
            JSObject r = new JSObject();
            r.put("saved", false);
            resolveAndRelease(call, r);
            return;
        }
        try (OutputStream out = openOut(uri)) {
            if (out == null) throw new IllegalStateException("تعذّر فتح الملف للكتابة");
            out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            out.flush();
            JSObject r = new JSObject();
            r.put("saved", true);
            r.put("uri", uri.toString());
            resolveAndRelease(call, r);
        } catch (Exception e) {
            call.reject("تعذّر الحفظ: " + e.getMessage(), e);
            getBridge().releaseCall(call);
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        launch(call, intent, "onOpenResult");
    }

    @ActivityCallback
    private void onOpenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = okUri(result);
        if (uri == null) {
            resolveAndRelease(call, new JSObject());
            return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("تعذّر فتح الملف");
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int total = 0;
            int n;
            while ((n = in.read(chunk)) != -1) {
                total += n;
                if (total > MAX_BYTES) throw new IllegalStateException("الملف كبير هواية");
                buf.write(chunk, 0, n);
            }
            JSObject r = new JSObject();
            r.put("data", new String(buf.toByteArray(), StandardCharsets.UTF_8));
            r.put("name", displayName(uri));
            resolveAndRelease(call, r);
        } catch (Exception e) {
            call.reject("تعذّرت القراءة: " + e.getMessage(), e);
            getBridge().releaseCall(call);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = safeName(call.getString("filename", "backup.json"));
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("تعذّر تجهيز الملف");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mime", "application/json"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, name);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "مشاركة"));
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّرت المشاركة: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
            getActivity().startActivity(Intent.createChooser(send, call.getString("title", "مشاركة")));
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّرت المشاركة: " + e.getMessage(), e);
        }
    }

    /* ────────── أدوات ────────── */

    private void launch(PluginCall call, Intent intent, String callback) {
        try {
            startActivityForResult(call, intent, callback);
        } catch (ActivityNotFoundException e) {
            call.reject("ما لگيت تطبيق ملفات بالجهاز");
            getBridge().releaseCall(call);
        }
    }

    private void resolveAndRelease(PluginCall call, JSObject result) {
        call.resolve(result);
        getBridge().releaseCall(call);
    }

    private static Uri okUri(ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) return null;
        Intent data = result.getData();
        return data == null ? null : data.getData();
    }

    /** بعض مزوّدي الملفات ما يدعمون "wt" فنرجع لـ "w". */
    private OutputStream openOut(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            OutputStream out = resolver.openOutputStream(uri, "wt");
            if (out != null) return out;
        } catch (Exception ignored) {
            // نجرّب الوضع العادي
        }
        return resolver.openOutputStream(uri, "w");
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {
            // الاسم مو ضروري
        }
        String last = uri.getLastPathSegment();
        return last == null ? "" : last;
    }

    private static String safeName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return clean.isEmpty() ? "backup.json" : clean;
    }
}
