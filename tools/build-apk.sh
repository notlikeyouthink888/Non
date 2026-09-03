#!/usr/bin/env bash
# بناء ملف APK لتطبيق «مدينتي».
# المتطلبات: Node 20+، JDK 17+، وAndroid SDK (cmdline-tools + platforms;android-35 + build-tools).
# إن لم تكن حزمة SDK موجودة، يحاول السكربت تنزيلها إلى $ANDROID_SDK_ROOT.
set -euo pipefail
cd "$(dirname "$0")/.."

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_SDK_ROOT="$SDK" ANDROID_HOME="$SDK"

echo "▸ بناء واجهة الويب (Vite)"
npm run build

if [ ! -d android ]; then
  echo "▸ توليد مشروع أندرويد (Capacitor)"
  npx cap add android
else
  echo "▸ مزامنة مشروع أندرويد"
  npx cap sync android
fi

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ] && [ ! -d "$SDK/platforms" ]; then
  echo "▸ تنزيل أدوات Android SDK إلى $SDK"
  mkdir -p "$SDK/cmdline-tools"
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/tools.zip" \
    https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q "$TMP/tools.zip" -d "$TMP"
  mkdir -p "$SDK/cmdline-tools/latest"
  cp -r "$TMP/cmdline-tools/"* "$SDK/cmdline-tools/latest/"
  rm -rf "$TMP"
fi

if [ -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
  "$SDK/cmdline-tools/latest/bin/sdkmanager" \
    "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null
fi

echo "▸ بناء APK (debug)"
cd android
./gradlew assembleDebug --no-daemon
echo
echo "✔ تم: android/app/build/outputs/apk/debug/app-debug.apk"
