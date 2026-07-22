# OpenCall Android app

A thin Capacitor shell around the deployed web app. The APK bundles **no UI of its own** —
it loads the site's `/m` route, so **a web deploy updates the installed app instantly**.
Users install the APK once; they never reinstall for a UI change.

```
APK (shell)  ──loads──>  https://<your-web-domain>/m  ──calls──>  same backend API
```

## Setting the URL

`capacitor.config.json` → `server.url`. It must point at the **web** origin (where Next.js
serves `/m`), not the API origin, and must be HTTPS.

```json
{ "server": { "url": "https://<your-web-domain>/m" } }
```

After changing it:

```bash
npx cap sync android
```

## Building the APK

Requires the Android SDK and a JDK (Android Studio's bundled JBR works).

```bash
# from mobile/
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"

cd android
./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
```

`assembleDebug` is fine for internal distribution (share the APK directly). For the Play
Store use `assembleRelease` with a signing key configured in `android/app/build.gradle`.

## What the app shows

`/m` is a mobile-first UI that lives in the web project
(`frontend/src/app/m/`) and is completely separate from the desktop pages — the desktop
web UI is untouched. Screens: Login, Home (KPIs + sections), Records, Closed Calls,
Engineers, More. Section visibility follows exactly the same rules as the web app
(special-access grants, REGION_ADMIN section scoping, SUPER_ADMIN sees all).
