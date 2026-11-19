# Agentic OS (mobile)

Expo / React Native app for iPhone. SwiftUI comes in later for widgets and Live Activities only.

Unbuilt features show "Not built yet", never mock content.

## Run against the TestFlight dev build

The TestFlight build is an Expo development build (expo-dev-client). Install it once, then load JS from Metro on the PC:

```
npm install
npm start          # same Wi-Fi: scan the QR code with the iPhone camera
npm run tunnel     # phone on mobile data or another network
```

Or type the URL Metro prints (`http://<PC LAN IP>:8081`) into the dev launcher.

## Native builds

`.github/workflows/ios-dev-client.yml` runs `expo prebuild` on a macOS runner, archives the Debug configuration
(the dev launcher is linked only in Debug), signs it for App Store distribution with a per-run certificate and
profile from `scripts/ios_signing.py`, and uploads it to TestFlight. It runs on pushes that change native inputs
(package files, app config, assets, scripts, the workflow). JS-only changes need no new build.

Build number: 100 + the workflow run number.
