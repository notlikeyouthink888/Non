package com.asas.reports;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** النشاط الرئيسي لتطبيق «أساس». */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
