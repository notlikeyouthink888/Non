package com.pdfs.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** النشاط الرئيسي لتطبيق pdfs. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
