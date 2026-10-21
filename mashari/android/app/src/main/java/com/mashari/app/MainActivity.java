package com.mashari.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** النشاط الرئيسي لتطبيق «دراسة مشاريع». */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
