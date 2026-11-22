import AppIntents
import AosAlarms
import Foundation
#if canImport(AlarmKit)
import AlarmKit
#endif

// Compiled into the app target (modules/alarms/app.plugin.js copies it there at prebuild), because Xcode only finds
// App Intents in the app itself. The AosAlarms pod makes its alarms' Open button with AosAlarmIntentFactory.

@objc(AosAlarmIntentFactory)
final class AosAlarmIntentFactory: NSObject, AosAlarmIntentMaking {
  static func openIntent(alarm: String, url: String) -> Any? {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { return AosAlarmOpenIntent(alarm: alarm, url: url) }
    #endif
    return nil
  }
}

#if canImport(AlarmKit)
/// The ringing alarm's Open button: stops the alarm, opens the app and hands its link to JS (src/lib/alarms.ts).
@available(iOS 26.0, *)
struct AosAlarmOpenIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Open alarm"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  @Parameter(title: "Alarm") var alarm: String
  @Parameter(title: "Link") var url: String

  init() {}

  init(alarm: String, url: String) {
    self.alarm = alarm
    self.url = url
  }

  func perform() async throws -> some IntentResult {
    AosAlarmLinks.opened(id: alarm, url: url)
    return .result()
  }
}
#endif
