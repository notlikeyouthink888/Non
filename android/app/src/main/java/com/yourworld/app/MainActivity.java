package com.yourworld.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.yourworld.app.plugins.MusicLibraryPlugin;
import com.yourworld.app.plugins.PlayerPlugin;
import com.yourworld.app.plugins.SchedulerPlugin;

/** النشاط الرئيسي لتطبيق Your World. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MusicLibraryPlugin.class);
        registerPlugin(PlayerPlugin.class);
        registerPlugin(SchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
