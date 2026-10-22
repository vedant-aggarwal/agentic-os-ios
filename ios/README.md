# Agentic OS iOS layer (2.0.0)

Capacitor 8 app `com.norrita.agenticos` with a native layer in Swift. There is no Mac in the loop: everything builds on
GitHub Actions (`.github/workflows/ios.yml`) in the public build repo `vedant-aggarwal/agentic-os-ios`, which holds only
the iOS layer and its tooling (the web app is a placeholder there). The JS side of every native feature is
`app/js/svc/native-plugins.js`; the contract (snapshot JSON, methods, events, links) is in the v2 notes (`native.md`).

## Targets

| Target | Bundle id | What it is |
|---|---|---|
| App | `com.norrita.agenticos` | The web app plus the native plugins in `App/` |
| AgenticWidgets | `.widgets` | Widgets, Live Activities and Control Center controls |
| AgenticShare | `.share` | Share sheet |
| AgenticKeyboard | `.keyboard` | The keyboard |
| AgenticMonitor, AgenticShield, AgenticShieldAction | `.monitor`, `.shield`, `.shieldaction` | Screen Time, only with `family_controls` on |

The committed project has only the App target. `scripts/add_targets.rb` adds the files and extensions on the CI Mac and
is never committed back: **a new Swift file builds only once it is listed there.** `Shared/Shared.swift` goes into
every target; `SharedActivities.swift` and `SharedIntents.swift` into the app and the widgets (the widget build defines
`AOS_WIDGET`); `SharedScreenTime.swift` into the app and the Screen Time extensions. AlarmKit and FoundationModels are
weak-linked so iOS 17 to 25 still launch; every iOS 26 call sits behind `#available`.

## Plugins (JS name → file)

`AosHaptics` Haptics.swift (patterns, the breathing programme) · `AosAuth` Auth.swift (Face ID) · `AosScan` Scan.swift
(camera, document scanner, OCR, barcodes) · `AosLive` Live.swift (workout, breathing, focus Live Activities) ·
`AosAlarm` Alarms.swift (AlarmKit, notification fallback) · `AosNotify` Notify.swift (local notifications with buttons) ·
`AosVoice` Voice.swift (the free call loop, speech) · `AosHealth` Health.swift · `AosSystem` System.swift (capabilities,
widgets, Spotlight, icons) · `AosPersonal` Personal.swift (calendars, reminders, contacts, geofences) · `AosLLM` LLM.swift
(on-device model) · `AosScreenTime` ScreenTime.swift. The older `Native` and `Speech` plugins are unchanged, and every
native event (breath, voice, live, alarm, notify, geofence, screentime) comes through `Native`.

## Building

Commit on `v2` in the phone worktree, then copy the committed iOS paths to the public repo and start a check run (the
sync script refuses to publish anything personal or secret; build logs are public, so never print a secret):

```
pwsh -File <agentic-jobs>\v2\tools\sync-public-build.ps1 -Check -Message "<what changed>"
$env:GH_TOKEN = gh auth token -u vedant-aggarwal
gh run watch -R vedant-aggarwal/agentic-os-ios <run id>
gh run view -R vedant-aggarwal/agentic-os-ios <run id> --log-failed
gh workflow run ios.yml -R vedant-aggarwal/agentic-os-ios --ref main -f check=true -f upload=false -f family_controls=true
Remove-Item Env:GH_TOKEN
```

The `build-log` artifact of a check run has the full xcodebuild output.

Inputs: `check` (unsigned compile, nothing made in the Apple account), `upload` (TestFlight), `family_controls`
(Screen Time, below), `probe` (saves the SDK's Swift interfaces of the newer frameworks as an artifact).
`MARKETING_VERSION` is `2.0.0` in the App's build configs; the build number is the run number.

Signing (`scripts/ios_signing.py`): a short-lived distribution certificate and App Store profiles per run. It turns on
Push, HealthKit and time-sensitive notifications for the app ID (the last two are optional: if Apple refuses one, the
run goes on). After `add_targets.rb`, `ios_signing.py entitlements` keeps in each target's entitlements only what its
profile grants, so a capability Apple hasn't approved can't break signing; the log prints what each target kept.

## Turning on Screen Time blocking (DECISIONS 4)

Built and compiled, shipped off. While off, the build carries no Family Controls entitlement and no Screen Time
extensions, `AOSFamilyControls` is `NO`, and every `native.screenTime` call answers `{ available: false, reason: 'flag' }`.
Soul's blocker keeps running in the app.

1. Ask Apple for the **Family Controls (Distribution)** entitlement for `com.norrita.agenticos` and the three extension
   ids `com.norrita.agenticos.monitor`, `.shield`, `.shieldaction` (developer.apple.com, Account, the Family Controls
   distribution request form).
2. Once approved, build with the input on:
   ```
   gh workflow run ios.yml -R vedant-aggarwal/agentic-os-ios --ref main -f family_controls=true -f upload=true
   ```
   To make it the default, the one-line change is `default: false` → `default: true` under `family_controls` in
   `.github/workflows/ios.yml`.
3. Check the run log: "Screen Time: on (3 extensions, Family Controls entitlement)" from `add_targets.rb`, and
   `APP: keeps ... com.apple.developer.family-controls` from the entitlements step. If that key shows under "drops",
   Apple hasn't granted it yet: the build still ships, and `screenTime.authorize()` answers an error.

## Usage strings and capabilities added in 2.0.0

Info.plist: camera, Face ID, Health (read; update string present for a later write), AlarmKit, calendars and reminders
(full access), contacts, location (when in use, always: geofences), quick actions (Scan, Ask the agent, Add task, Log
expense), `INAlternativeAppNames` (Agentic), `AOSFamilyControls`. Entitlements: HealthKit, time-sensitive notifications
(and Family Controls only with the flag). Alternate icons: `AppIcon-Obsidian`, `AppIcon-Matte` (the default stays
`AppIcon`).
