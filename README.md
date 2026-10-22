# Agentic OS · iOS

The native iPhone layer of Agentic OS (Capacitor 8 + Swift): widgets with interactive buttons, Live Activities and the
Dynamic Island, App Intents for Siri, Shortcuts and the Action button, Control Center controls, AlarmKit alarms,
actionable notifications, Core Haptics breathing sessions, Face ID locks, camera and document scanning with on-device OCR,
HealthKit, CallKit calls with an on-device voice loop, Spotlight, the on-device Foundation Models wrapper, and a custom
keyboard and share extension.

The workflow in `.github/workflows/ios.yml` compiles everything on a macOS runner (`check`) or signs it and uploads it to
App Store Connect for TestFlight (`upload`). `ios/README.md` explains the targets, the plugins and the flags (Screen Time
ships switched off until Apple grants the Family Controls entitlement).

The web app is not published in the clear: `app.bin` holds it encrypted, and the build decrypts it with a repo secret
(`scripts/unpack-app.mjs`). All rights reserved until a licence is chosen.
