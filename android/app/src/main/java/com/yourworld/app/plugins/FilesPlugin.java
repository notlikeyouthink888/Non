package com.yourworld.app.plugins;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * يفتح ملفًا محفوظًا داخل التطبيق (PDF مثلًا) بعارض النظام.
 * الملف يُكتب في ذاكرة التطبيق المؤقّتة ثم يُمرَّر عبر FileProvider،
 * فلا يحتاج أي إذن تخزين.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

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

    /** اسم ملف آمن (بلا مسارات). */
    private String safeName(String name) {
        String n = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (n.isEmpty()) n = "file";
        return n.length() > 90 ? n.substring(n.length() - 90) : n;
    }
}
