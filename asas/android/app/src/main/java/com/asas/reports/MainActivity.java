package com.asas.reports;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/** النشاط الرئيسي لتطبيق «أساس». */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        // تبقى صفحة التطبيق بأولوية مهمة حتى وهي غير ظاهرة، فلا يقتل النظام عملية العرض أثناء الكتابة
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getBridge() != null) {
            WebView wv = getBridge().getWebView();
            if (wv != null) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
