package com.asas.reports;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

/** النشاط الرئيسي لتطبيق sadiqabbas. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        // تبقى صفحة التطبيق بأولوية مهمة حتى وهي غير ظاهرة، فلا يقتل النظام عملية العرض أثناء الكتابة
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        // التطبيق له وضعه الداكن الخاص؛ التعتيم الإجباري للنظام كان يقلب الغلاف الأبيض أسود في PDF والطباعة
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) wv.setForceDarkAllowed(false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(wv.getSettings(), false);
        }
    }
}
