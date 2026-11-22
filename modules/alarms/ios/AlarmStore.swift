import CryptoKit
import Foundation
import SwiftUI
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
import AppIntents
#endif

/// What an alarm carries besides AlarmKit's own fields. The widget extension (targets/controls/AlarmLive.swift)
/// declares the same struct to draw the snooze countdown, so keep the two in step.
#if canImport(AlarmKit)
@available(iOS 26.0, *)
public struct AosAlarmMeta: AlarmMetadata {
  public var title: String
  public var url: String?

  public init(title: String, url: String?) {
    self.title = title
    self.url = url
  }
}
#endif

/// Makes the intent behind an alarm's Open button. It lives in the app target (modules/alarms/app, added by
/// modules/alarms/app.plugin.js), where Xcode extracts App Intents metadata; this pod finds it by its Objective-C name.
public protocol AosAlarmIntentMaking: AnyObject {
  static func openIntent(alarm: String, url: String) -> Any?
}

/// Where the Open intent hands over the link it opens.
public enum AosAlarmLinks {
  public static func opened(id: String, url: String) {
    DispatchQueue.main.async { AlarmStore.shared.opened(id: id, url: url) }
  }
}

/// Real alarms: AlarmKit on iOS 26 (rings through silent mode and Focus, full screen on the lock screen), else a
/// local notification at that time. An alarm with a url gets an Open button that opens the app on that link; one
/// without gets Snooze (nine minutes).
final class AlarmStore {
  static let shared = AlarmStore()

  struct Meta: Codable {
    var id: String
    var at: Double      // Unix seconds
    var title: String
    var url: String?
    var kit: String     // alarmkit or notification
    var from: String    // app or pc
  }

  private let key = "aos.alarms"
  private var openedLinks: [[String: Any]] = []
  var emit: ((String, [String: Any]) -> Void)?

  private var metas: [String: Meta] {
    get { UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode([String: Meta].self, from: $0) } ?? [:] }
    set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key) }
  }

  var kitAvailable: Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { return true }
    #endif
    return false
  }

  /// At launch: forget alarms that rang more than an hour ago.
  func prune() {
    let now = Date().timeIntervalSince1970
    metas = metas.filter { $0.value.at > now - 3600 }
  }

  /// Asks for AlarmKit (iOS 26), else notifications. { kit, status: granted | denied | prompt }.
  func authorize() async -> [String: Any] {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      let mgr = AlarmManager.shared
      var state = mgr.authorizationState
      if state == .notDetermined { state = (try? await mgr.requestAuthorization()) ?? state }
      if state == .authorized { return ["kit": "alarmkit", "status": "granted"] }
      return ["kit": "notification", "status": state == .denied ? "denied" : "prompt"]
    }
    #endif
    let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    return ["kit": "notification", "status": granted ? "granted" : "denied"]
  }

  /// A stable UUID for any id (AlarmKit wants UUIDs).
  static func uuid(for id: String) -> UUID {
    if let u = UUID(uuidString: id) { return u }
    var b = Array(SHA256.hash(data: Data(id.utf8)).prefix(16))
    b[6] = (b[6] & 0x0F) | 0x50
    b[8] = (b[8] & 0x3F) | 0x80
    return UUID(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]))
  }

  /// Schedules (or replaces) an alarm. prompt: may ask for permission (false for a silent push in the background).
  func schedule(_ meta: Meta, prompt: Bool) async -> [String: Any] {
    var m = meta
    cancel(m.id)
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      do {
        try await scheduleKit(m, prompt: prompt)
        m.kit = "alarmkit"
        save(m)
        return describe(m)
      } catch {
        // Not allowed yet: fall through to a notification so it still goes off.
      }
    }
    #endif
    if let error = await scheduleNote(m) { return ["error": error] }
    m.kit = "notification"
    save(m)
    return describe(m)
  }

  private func save(_ m: Meta) {
    var all = metas
    all[m.id] = m
    metas = all
  }

  private func describe(_ m: Meta) -> [String: Any] {
    var out: [String: Any] = ["id": m.id, "at": m.at * 1000, "title": m.title, "kit": m.kit, "from": m.from]
    if let u = m.url { out["url"] = u }
    return out
  }

  #if canImport(AlarmKit)
  struct AlarmOff: Error {}

  @available(iOS 26.0, *)
  private func scheduleKit(_ m: Meta, prompt: Bool) async throws {
    let mgr = AlarmManager.shared
    if prompt && mgr.authorizationState == .notDetermined { _ = try await mgr.requestAuthorization() }
    guard mgr.authorizationState == .authorized else { throw AlarmOff() }
    let title: LocalizedStringResource = "\(m.title)"
    let tint = Color(red: 0.24, green: 0.86, blue: 0.59)
    var openIntent: (any LiveActivityIntent)?
    if let url = m.url, let maker = NSClassFromString("AosAlarmIntentFactory") as? AosAlarmIntentMaking.Type {
      openIntent = maker.openIntent(alarm: m.id, url: url) as? (any LiveActivityIntent)
    }
    let button = openIntent != nil
      ? AlarmButton(text: "Open", textColor: .white, systemImageName: "arrow.up.forward.app")
      : AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz")
    let behavior: AlarmPresentation.Alert.SecondaryButtonBehavior = openIntent != nil ? .custom : .countdown
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = AlarmPresentation.Alert(title: title, secondaryButton: button, secondaryButtonBehavior: behavior)
    } else {
      alert = AlarmPresentation.Alert(title: title, stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
                                      secondaryButton: button, secondaryButtonBehavior: behavior)
    }
    let presentation = openIntent != nil
      ? AlarmPresentation(alert: alert, countdown: nil, paused: nil)
      : AlarmPresentation(alert: alert, countdown: AlarmPresentation.Countdown(title: "Snoozed"), paused: nil)
    let attributes = AlarmAttributes<AosAlarmMeta>(presentation: presentation, metadata: AosAlarmMeta(title: m.title, url: m.url), tintColor: tint)
    let config = AlarmManager.AlarmConfiguration<AosAlarmMeta>(
      countdownDuration: openIntent != nil ? nil : Alarm.CountdownDuration(preAlert: nil, postAlert: 9 * 60),
      schedule: .fixed(Date(timeIntervalSince1970: max(m.at, Date().timeIntervalSince1970 + 5))),
      attributes: attributes, stopIntent: nil, secondaryIntent: openIntent, sound: .default)
    _ = try await mgr.schedule(id: AlarmStore.uuid(for: m.id), configuration: config)
  }
  #endif

  /// Below iOS 26, or before AlarmKit is allowed: one notification at the time, carrying the link for its tap.
  private func scheduleNote(_ m: Meta) async -> String? {
    let center = UNUserNotificationCenter.current()
    let s = await center.notificationSettings()
    if s.authorizationStatus == .denied { return "Notifications are off for Agentic OS, so the alarm can't go off. Turn them on in Settings." }
    let c = UNMutableNotificationContent()
    c.title = m.title
    c.body = "Alarm"
    c.sound = .default
    c.threadIdentifier = "aos-alarm"
    c.interruptionLevel = .timeSensitive
    var info: [String: Any] = ["aosAlarm": m.id]
    if let url = m.url { info["url"] = url }
    c.userInfo = info
    let wait = max(1, m.at - Date().timeIntervalSince1970)
    let req = UNNotificationRequest(identifier: "aos-alarm-\(m.id)", content: c, trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false))
    do { try await center.add(req) } catch { return error.localizedDescription }
    return nil
  }

  func cancel(_ id: String) {
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["aos-alarm-\(id)"])
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { try? AlarmManager.shared.cancel(id: AlarmStore.uuid(for: id)) }
    #endif
    var all = metas
    all.removeValue(forKey: id)
    metas = all
  }

  func list() -> [[String: Any]] {
    var states: [UUID: String] = [:]
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *), let alarms = try? AlarmManager.shared.alarms {
      for a in alarms {
        switch a.state {
        case .scheduled: states[a.id] = "scheduled"
        case .countdown: states[a.id] = "snoozed"
        case .paused: states[a.id] = "paused"
        case .alerting: states[a.id] = "ringing"
        @unknown default: states[a.id] = "scheduled"
        }
      }
    }
    #endif
    return metas.values.sorted { $0.at < $1.at }.map { m in
      var out = describe(m)
      if m.kit == "alarmkit" { out["state"] = states[AlarmStore.uuid(for: m.id)] ?? "done" }
      return out
    }
  }

  // MARK: Open

  func opened(id: String, url: String) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { try? AlarmManager.shared.stop(id: AlarmStore.uuid(for: id)) }
    #endif
    let info: [String: Any] = ["id": id, "url": url]
    // Kept until JS takes it, so an Open that launched the app still lands on the link.
    openedLinks.append(info)
    emit?("onOpen", info)
  }

  func takeOpened() -> [[String: Any]] {
    let out = openedLinks
    openedLinks.removeAll()
    return out
  }

  // MARK: From the PC

  /// A silent push from the PC (server/phone-alarm.ts): { alarm: { id, at (Unix ms), title, url } }.
  /// Returns false when the push isn't an alarm.
  func handlePush(_ userInfo: [AnyHashable: Any], done: @escaping (Bool) -> Void) -> Bool {
    guard let a = userInfo["alarm"] as? [String: Any], let at = (a["at"] as? NSNumber)?.doubleValue,
          let title = a["title"] as? String, !title.isEmpty else { return false }
    let id = (a["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "pc-\(Int(at))"
    let meta = Meta(id: id, at: at / 1000, title: title, url: a["url"] as? String, kit: "", from: "pc")
    Task {
      let r = await self.schedule(meta, prompt: false)
      DispatchQueue.main.async {
        self.emit?("onScheduled", r)
        done(r["error"] == nil)
      }
    }
    return true
  }
}
