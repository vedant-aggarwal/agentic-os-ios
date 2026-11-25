import AppIntents
internal import AosCalls // the app target's ExpoModulesProvider.swift imports it as internal too
import Foundation

// The line call Live Activity's buttons (targets/controls/LineLive.swift). Compiled into the app target
// (modules/calls/app.plugin.js copies it there at prebuild): a Live Activity's intent runs in the app's process, and
// Xcode only finds App Intents in the app itself. The widget extension has identical structs to draw the buttons with;
// the system matches the two by name, so keep them in step.

/// Listen to the call (or stop) without opening the app. An audio playback intent may start audio in the background.
@available(iOS 17.0, *)
struct LineListenIntent: LiveActivityIntent, AudioPlaybackIntent {
  static let title: LocalizedStringResource = "Listen to the call"
  static let isDiscoverable = false

  @Parameter(title: "Call") var callId: String
  @Parameter(title: "On") var on: Bool

  init() {}

  init(callId: String, on: Bool) {
    self.callId = callId
    self.on = on
  }

  func perform() async throws -> some IntentResult {
    await AosLineIntents.listen(callId: callId, on: on)
    return .result()
  }
}

/// Take the call over: opens the app on the call's screen, with the call his on a CallKit call.
@available(iOS 17.0, *)
struct LineTakeOverIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Take over the call"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  @Parameter(title: "Call") var callId: String

  init() {}

  init(callId: String) {
    self.callId = callId
  }

  func perform() async throws -> some IntentResult {
    await AosLineIntents.takeOver(callId: callId)
    return .result()
  }
}
