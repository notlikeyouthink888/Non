package com.maykrofonak.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

/**
 * اختيار المكبّر الخارجي (بلوتوث أولاً). سماعة التلفون نفسها ممنوعة دائماً:
 * المايك والسماعة بنفس الجهاز = صفير فوري.
 * لا يحتاج إذن بلوتوث: كل شيء عبر نظام الصوت.
 */
final class Speakers {
    private Speakers() {}

    static AudioDeviceInfo best(AudioManager am) {
        AudioDeviceInfo best = null;
        int bestRank = 0;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int r = rank(d.getType());
            if (r > bestRank) {
                best = d;
                bestRank = r;
            }
        }
        return best;
    }

    static boolean present(AudioManager am, int deviceId) {
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (d.getId() == deviceId) return true;
        }
        return false;
    }

    static int rank(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                return 9;
            case AudioDeviceInfo.TYPE_BLE_SPEAKER:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_BLE_BROADCAST:
                return 8;
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_ACCESSORY:
                return 6;
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return 5;
            case AudioDeviceInfo.TYPE_LINE_ANALOG:
            case AudioDeviceInfo.TYPE_LINE_DIGITAL:
            case AudioDeviceInfo.TYPE_AUX_LINE:
                return 4;
            case AudioDeviceInfo.TYPE_HDMI:
            case AudioDeviceInfo.TYPE_HDMI_ARC:
            case AudioDeviceInfo.TYPE_HDMI_EARC:
                return 3;
            case AudioDeviceInfo.TYPE_DOCK:
            case AudioDeviceInfo.TYPE_DOCK_ANALOG:
                return 2;
            default:
                return 0;   // سماعة التلفون، سماعة المكالمات، SCO ... إلخ
        }
    }

    static boolean isExternal(int type) {
        return rank(type) > 0;
    }

    /** سماعة التلفون نفسها: هذا الوحيد اللي يسبّب صفير فوري (سماعة المكالمات بالبلوتوث مو مشكلة). */
    static boolean isPhoneSpeaker(int type) {
        return type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                || type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                || type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE;
    }

    static boolean isBluetooth(int type) {
        return type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || type == AudioDeviceInfo.TYPE_BLE_SPEAKER
                || type == AudioDeviceInfo.TYPE_BLE_HEADSET
                || type == AudioDeviceInfo.TYPE_BLE_BROADCAST;
    }

    /** اسم المكبّر كما يظهر بالبلوتوث، أو وصف عام. */
    static String label(Context c, AudioDeviceInfo d) {
        CharSequence name = d.getProductName();
        if (name != null) {
            String s = name.toString().trim();
            if (!s.isEmpty() && !s.equalsIgnoreCase(Build.MODEL) && !s.equalsIgnoreCase(Build.DEVICE)) return s;
        }
        int type = d.getType();
        if (isBluetooth(type)) return c.getString(R.string.out_bluetooth);
        switch (rank(type)) {
            case 6:
                return c.getString(R.string.out_usb);
            case 5:
                return c.getString(R.string.out_wired);
            case 3:
                return c.getString(R.string.out_hdmi);
            default:
                return c.getString(R.string.out_other);
        }
    }
}
