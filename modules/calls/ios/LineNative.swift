import ActivityKit
import CallKit
import ExpoModulesCore
import ExpoNotifications
import Foundation
import Security
import UIKit
import UserNotifications

// The rest of Nora's line on the iPhone (line calls v2 contract §4): the JS module (src/lib/lineNative.ts), the Call
// Directory extension's list, the Live Activity's push tokens, the notification buttons and what the Live Activity's
// buttons call. The call audio is in LineAudio.swift.

/// JS side of Nora's line (src/lib/lineNative.ts). Events: audio { callId, listening, takenOver, connecting, muted,
/// speaker, error }, link {} (a link is waiting: takeLink()).
public final class AosLineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AosLine")
    Events("audio", "link")

    OnCreate {
      DispatchQueue.main.async {
        LineHub.shared.emit = { [weak self] body in self?.sendEvent("audio", body) }
        LineLinks.emit = { [weak self] in self?.sendEvent("link", [:]) }
      }
    }

    OnDestroy {
      // the call audio carries on without JS (a reload): it's the phone's, not the screen's
      DispatchQueue.main.async {
        LineHub.shared.emit = nil
        LineLinks.emit = nil
      }
    }

    /// Resolves once the call plays (or stopped).
    AsyncFunction("listen") { (o: [String: Any], promise: Promise) in
      LineHub.shared.listen(callId: o["callId"] as? String ?? "", on: o["on"] as? Bool ?? false,
                            url: o["url"] as? String, token: o["token"] as? String) { why in
        if let why { promise.reject("ERR_LINE_LISTEN", why) } else { promise.resolve() }
      }
    }.runOnQueue(.main)

    /// Resolves once the PC confirms the call is his.
    AsyncFunction("takeOver") { (o: [String: Any], promise: Promise) in
      LineHub.shared.takeOver(callId: o["callId"] as? String ?? "", name: o["name"] as? String ?? "",
                              url: o["url"] as? String, token: o["token"] as? String) { why in
        if let why { promise.reject("ERR_LINE_TAKEOVER", why) } else { promise.resolve() }
      }
    }.runOnQueue(.main)

    Function("release") {
      DispatchQueue.main.async { LineHub.shared.release() }
    }

    /// True when the native socket sends the hang up.
    Function("hangUp") { () -> Bool in
      LineHub.shared.hangUpNow()
    }

    Function("stop") {
      DispatchQueue.main.async { LineHub.shared.stop() }
    }

    Function("setMuted") { (on: Bool) in
      DispatchQueue.main.async { LineHub.shared.setMuted(on) }
    }

    Function("setSpeaker") { (on: Bool) in
      DispatchQueue.main.async { LineHub.shared.setSpeaker(on) }
    }

    AsyncFunction("audioState") { () -> [String: Any] in
      LineHub.shared.snapshot()
    }.runOnQueue(.main)

    /// The waiting link, once; null when there's none.
    AsyncFunction("takeLink") { () -> String? in
      LineLinks.take()
    }.runOnQueue(.main)

    /// { version, blocked: [{ number, label }], labels: [{ number, label }] } as JSON.
    AsyncFunction("saveBlocklist") { (json: String, promise: Promise) in
      LineDirectory.save(json) { ok in promise.resolve(ok) }
    }

    /// enabled | disabled | unknown
    AsyncFunction("directoryStatus") { (promise: Promise) in
      LineDirectory.status { s in promise.resolve(s) }
    }

    AsyncFunction("openDirectorySettings") { (promise: Promise) in
      LineDirectory.openSettings { ok in promise.resolve(ok) }
    }

    Function("repostTokens") {
      DispatchQueue.main.async { LineActivities.shared.repost() }
    }
  }
}

/// Starts the line's native parts at launch, before JS: the notification buttons have to be handled when one
/// launched the app, and the Live Activity's tokens go up without JS.
public final class AosLineAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    LineNotifications.shared.start()
    LineActivities.shared.start()
    return true
  }
}

/// What the Live Activity's buttons do. The intents themselves are compiled into the app target
/// (modules/calls/app/AosLineIntents.swift): a Live Activity's intent runs in the app's process.
public enum AosLineIntents {
  /// Listen, or stop, without opening the app.
  public static func listen(callId: String, on: Bool) async {
    await MainActor.run { LineHub.shared.listen(callId: callId, on: on) }
  }

  /// Take over (the intent opens the app); the call's screen opens on it.
  public static func takeOver(callId: String) async {
    await MainActor.run {
      LineLinks.open("agenticos://line/\(LineServer.part(callId))?take=1")
      LineHub.shared.takeOver(callId: callId, name: LineActivities.shared.name(for: callId) ?? "")
    }
  }
}

// MARK: - Links

/// Links native code opens in JS (a notification's Take over or Listen, the Live Activity's Take over). Kept until JS
/// takes it, since it may not be running yet; the event only says one is waiting. Main thread.
enum LineLinks {
  static var emit: (() -> Void)?
  private static var waiting: String?

  static func open(_ url: String) {
    waiting = url
    emit?()
  }

  static func take() -> String? {
    let url = waiting
    waiting = nil
    return url
  }
}

// MARK: - Requests

/// Requests to the PC with the sign-in the app shares with its extensions, given the time to finish in the background.
enum LineServer {
  private static let safe = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

  /// One path segment, encoded.
  static func part(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: safe) ?? s }

  /// Main thread; done on the main thread with the status (0: no answer or no sign-in).
  static func request(_ method: String, _ path: String, _ body: [String: Any]?, done: @escaping (Int) -> Void) {
    guard let token = ServerLink.read("token"), let api = ServerLink.read("api"), let url = URL(string: api + path) else {
      DispatchQueue.main.async { done(0) }
      return
    }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.timeoutInterval = 15
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    if let body {
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    }
    let task = BackgroundTask()
    task.begin()
    URLSession.shared.dataTask(with: req) { _, resp, _ in
      let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
      DispatchQueue.main.async {
        done(code)
        task.end()
      }
    }.resume()
  }
}

// MARK: - Call Directory

/// The keychain group the app shares with its extensions ("<team>.<bundle id>.shared", app.json
/// keychain-access-groups). Its full name is read off a probe item, as in modules/shared-auth.
enum LineKeychain {
  static func group() -> String? {
    let probe: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "agentic-os-probe",
      kSecAttrAccount as String: "probe",
    ]
    var attrs = probe
    attrs[kSecReturnAttributes as String] = true
    var out: CFTypeRef?
    var st = SecItemCopyMatching(attrs as CFDictionary, &out)
    if st == errSecItemNotFound {
      var add = probe
      add[kSecReturnAttributes as String] = true
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      st = SecItemAdd(add as CFDictionary, &out)
    }
    guard st == errSecSuccess, let a = out as? [String: Any], let g = a[kSecAttrAccessGroup as String] as? String,
          let team = g.split(separator: ".").first, let bundle = Bundle.main.bundleIdentifier else { return nil }
    return "\(team).\(bundle).shared"
  }

  /// Replaces the item. Readable after the first unlock, when iOS may load the extension.
  static func write(service: String, account: String, data: Data) -> Bool {
    guard let group = group() else { return false }
    let key: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
    ]
    SecItemDelete(key as CFDictionary)
    var add = key
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }
}

/// The phone's own blocking and caller names (targets/calldirectory): the app keeps the line's blocklist in the
/// shared keychain group (service agentic-os-line, account blocklist) and asks iOS to reload the extension, which
/// reads it. He turns it on in Settings › Apps › Phone › Call Blocking & Identification.
enum LineDirectory {
  static var extensionId: String { (Bundle.main.bundleIdentifier ?? "com.norrita.agenticos") + ".calldirectory" }

  /// True once the list is saved. The reload is asked for too; it fails while the extension is off, and the list
  /// loads when he turns it on.
  static func save(_ json: String, done: @escaping (Bool) -> Void) {
    guard let data = json.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) is [String: Any],
          LineKeychain.write(service: "agentic-os-line", account: "blocklist", data: data) else {
      done(false)
      return
    }
    CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: extensionId) { _ in
      DispatchQueue.main.async { done(true) }
    }
  }

  static func status(_ done: @escaping (String) -> Void) {
    CXCallDirectoryManager.sharedInstance.getEnabledStatusForExtension(withIdentifier: extensionId) { status, error in
      let s: String
      if error != nil {
        s = "unknown"
      } else {
        switch status {
        case .enabled: s = "enabled"
        case .disabled: s = "disabled"
        default: s = "unknown"
        }
      }
      DispatchQueue.main.async { done(s) }
    }
  }

  /// Opens the Call Blocking & Identification settings.
  static func openSettings(_ done: @escaping (Bool) -> Void) {
    CXCallDirectoryManager.sharedInstance.openSettings { error in
      DispatchQueue.main.async { done(error == nil) }
    }
  }
}

// MARK: - Live Activity

/// A call on Nora's line on the lock screen and in the Dynamic Island (contract §4). Same name and fields as
/// LineCallAttributes in targets/controls/LineLive.swift: ActivityKit matches the two by name, so keep them in step.
/// `listening` is the app's own (the Listen button reads Stop while this phone plays the call); the PC's pushes
/// leave it out.
struct LineCallAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var phase: String
    var name: String
    var category: String
    var action: String
    var startedAt: Double
    var needsYou: Bool
    var listening: Bool?
  }

  var callId: String
}

/// The line activity's push tokens to the PC (POST /devices, the same as the work activity's): the push-to-start token
/// (kind linestart, iOS 17.2+) and each running activity's update token (kind line, with its callId). An activity
/// he dismissed takes its token off (end: true; never `dismissed`, which the PC reads as "no day activity today").
/// Main thread.
final class LineActivities {
  static let shared = LineActivities()

  private var started = false
  private var startToken: String?
  private var tokens: [String: (token: String, callId: String)] = [:]
  private var watched: Set<String> = []
  private var listeningCall: String?
  private var postedWith: String?
  private var postedAt = Date.distantPast

  func start() {
    guard !started else { return }
    started = true
    if #available(iOS 17.2, *) {
      Task { @MainActor in
        for await data in Activity<LineCallAttributes>.pushToStartTokenUpdates {
          let token = Self.hex(data)
          self.startToken = token
          ServerLink.post("/devices", ["kind": "linestart", "token": token])
        }
      }
    }
    for a in Activity<LineCallAttributes>.activities { watch(a) }
    Task { @MainActor in
      for await a in Activity<LineCallAttributes>.activityUpdates { self.watch(a) }
    }
  }

  /// JS after a sign-in and on coming to the front: the tokens again, when the sign-in changed or six hours went by.
  func repost() {
    start()
    guard let who = ServerLink.read("token"), who != postedWith || Date().timeIntervalSince(postedAt) > 6 * 3600 else { return }
    postedWith = who
    postedAt = Date()
    if let t = startToken { ServerLink.post("/devices", ["kind": "linestart", "token": t]) }
    for v in tokens.values { ServerLink.post("/devices", ["kind": "line", "token": v.token, "callId": v.callId]) }
  }

  /// The caller's name on the call's activity, for the CallKit call of a take over started from a button.
  func name(for callId: String) -> String? {
    Activity<LineCallAttributes>.activities.first { $0.attributes.callId == callId }?.content.state.name
  }

  /// The Listen button reads Stop on the call this phone plays.
  func setListening(_ callId: String?, _ on: Bool) {
    let want = on ? callId : nil
    guard want != listeningCall else { return }
    listeningCall = want
    for a in Activity<LineCallAttributes>.activities where a.activityState == .active {
      let mine = want != nil && a.attributes.callId == want
      if (a.content.state.listening ?? false) != mine { apply(a, listening: mine) }
    }
  }

  private func apply(_ a: Activity<LineCallAttributes>, listening: Bool) {
    var s = a.content.state
    s.listening = listening
    let content = ActivityContent(state: s, staleDate: a.content.staleDate)
    Task { await a.update(content) }
  }

  private func watch(_ a: Activity<LineCallAttributes>) {
    guard watched.insert(a.id).inserted else { return }
    let callId = a.attributes.callId
    Task { @MainActor in
      for await data in a.pushTokenUpdates {
        let token = Self.hex(data)
        self.tokens[a.id] = (token, callId)
        ServerLink.post("/devices", ["kind": "line", "token": token, "callId": callId])
      }
    }
    Task { @MainActor in
      for await state in a.activityStateUpdates where state == .dismissed {
        if let t = self.tokens.removeValue(forKey: a.id) { ServerLink.post("/devices", ["kind": "line", "token": t.token, "end": true]) }
        break
      }
    }
    // the PC's updates leave `listening` out: put it back while this phone plays the call
    Task { @MainActor in
      for await content in a.contentUpdates where self.listeningCall == callId && content.state.listening != true {
        self.apply(a, listening: true)
      }
    }
  }

  private static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
}

// MARK: - Notifications

/// The line's notification buttons (contract §4), handled here so they work with the app in the background and JS
/// not running. LINE_TRANSFER: Take over and Listen (both open the call's screen too), Nora keeps it. A decision's
/// options: the notification service extension (targets/notify) gives each decision its own category,
/// LINE_DECISION.<callId>.<actionId>, with an OPT_<optionId> button per option; choosing one posts it. A tap on the
/// notification itself is JS's (src/lib/push.ts), so it isn't claimed here.
final class LineNotifications: NotificationDelegate {
  static let shared = LineNotifications()
  private var started = false

  func start() {
    guard !started else { return }
    started = true
    let take = UNNotificationAction(identifier: "TAKE", title: "Take over", options: [.foreground],
                                    icon: UNNotificationActionIcon(systemImageName: "phone.fill"))
    let listen = UNNotificationAction(identifier: "LISTEN", title: "Listen", options: [.foreground],
                                      icon: UNNotificationActionIcon(systemImageName: "headphones"))
    let keep = UNNotificationAction(identifier: "DECLINE", title: "Nora keeps it", options: [],
                                    icon: UNNotificationActionIcon(systemImageName: "hand.raised.fill"))
    let mine: Set<UNNotificationCategory> = [
      UNNotificationCategory(identifier: "LINE_TRANSFER", actions: [take, listen, keep], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "LINE_DECISION", actions: [], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "LINE_SUMMARY", actions: [], intentIdentifiers: [], options: []),
    ]
    let ids = Set(mine.map(\.identifier))
    let center = UNUserNotificationCenter.current()
    // merged: the extension's decision categories stay
    center.getNotificationCategories { existing in
      center.setNotificationCategories(existing.filter { !ids.contains($0.identifier) }.union(mine))
    }
    NotificationCenterManager.shared.addDelegate(self)
  }

  /// expo-notifications calls completionHandler itself after its delegates, so it isn't called here; the work gets
  /// background time of its own.
  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    let content = response.notification.request.content
    let category = content.categoryIdentifier
    let action = response.actionIdentifier
    guard category.hasPrefix("LINE_"), action != UNNotificationDefaultActionIdentifier,
          action != UNNotificationDismissActionIdentifier else { return false }
    let data = content.userInfo["data"] as? [String: Any] ?? [:]
    let callId = data["callId"] as? String ?? content.userInfo["callId"] as? String ?? ""
    guard !callId.isEmpty else { return false }
    let actionId = data["actionId"] as? String ?? ""
    let title = content.title
    DispatchQueue.main.async { self.act(action, callId: callId, actionId: actionId, title: title) }
    return true
  }

  private func act(_ action: String, callId: String, actionId: String, title: String) {
    let link = "agenticos://line/\(LineServer.part(callId))"
    switch action {
    case "TAKE":
      LineLinks.open(link + "?take=1")
      LineHub.shared.takeOver(callId: callId, name: LineActivities.shared.name(for: callId) ?? "")
    case "LISTEN":
      LineLinks.open(link + "?listen=1")
      LineHub.shared.listen(callId: callId, on: true)
    case "DECLINE":
      LineHub.shared.keep(callId: callId)
    default:
      guard action.hasPrefix("OPT_"), !actionId.isEmpty else { return }
      let optionId = String(action.dropFirst(4))
      LineServer.request("POST", "/nora/line/calls/\(LineServer.part(callId))/actions/\(LineServer.part(actionId))", ["optionId": optionId]) { code in
        guard !(200..<300).contains(code) else { return }
        Self.tell(title: title, body: "Your choice didn't reach Nora. Open the call to choose again.", link: link)
      }
    }
  }

  /// A local notification that opens the call (src/lib/push.ts reads its url).
  private static func tell(title: String, body: String, link: String) {
    let c = UNMutableNotificationContent()
    c.title = title.isEmpty ? "Nora's line" : title
    c.body = body
    c.sound = .default
    c.threadIdentifier = "line"
    c.userInfo = ["url": link]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "line-choice-\(UUID().uuidString)", content: c, trigger: nil))
  }
}
