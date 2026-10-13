package com.asas.reports;

import android.content.Context;
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
 */
@CapacitorPlugin(name = "Printer")
public class PrinterPlugin extends Plugin {

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
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
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
}
