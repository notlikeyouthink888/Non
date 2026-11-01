package com.asas.reports;

import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * طباعة الصفحة الحالية من WebView عبر خدمة الطباعة في أندرويد.
 * window.print() لا يعمل داخل WebView، لذا نطبع الصفحة المعروضة نفسها
 * (بتنسيق @media print) فيظهر خيار «حفظ بتنسيق PDF» بحروف عربية سليمة.
 *
 * خلفية WebView داكنة (لون التطبيق)، وأندرويد يلوّن بها هوامش كل صفحة مطبوعة فتظهر إطارًا أسود.
 * لذا تُجعل بيضاء طوال الطباعة وتعود كما كانت عند انتهائها أو إلغائها.
 */
@CapacitorPlugin(name = "Printer")
public class PrinterPlugin extends Plugin {

    /** لون خلفية التطبيق (android.backgroundColor في capacitor.config.json). */
    private static final String APP_BG = "#0E1116";

    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "تقرير");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) {
                    call.reject("خدمة الطباعة غير متاحة في هذا الجهاز");
                    return;
                }
                webView.setBackgroundColor(Color.WHITE);
                PrintDocumentAdapter adapter = new WhiteMargins(webView.createPrintDocumentAdapter(name), () ->
                        getActivity().runOnUiThread(() -> webView.setBackgroundColor(Color.parseColor(APP_BG))));
                PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build();
                manager.print(name, adapter, attributes);
                call.resolve();
            } catch (Exception e) {
                call.reject("تعذّرت الطباعة: " + e.getMessage(), e);
            }
        });
    }

    /** يمرّر الطباعة كما هي، ويعيد لون الخلفية حين تنتهي. */
    private static class WhiteMargins extends PrintDocumentAdapter {
        private final PrintDocumentAdapter inner;
        private final Runnable onDone;

        WhiteMargins(PrintDocumentAdapter inner, Runnable onDone) {
            this.inner = inner;
            this.onDone = onDone;
        }

        @Override
        public void onStart() {
            inner.onStart();
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancel,
                             LayoutResultCallback callback, Bundle extras) {
            inner.onLayout(oldAttributes, newAttributes, cancel, callback, extras);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancel,
                            WriteResultCallback callback) {
            inner.onWrite(pages, destination, cancel, callback);
        }

        @Override
        public void onFinish() {
            inner.onFinish();
            onDone.run();
        }
    }
}
