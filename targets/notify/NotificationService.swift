import Foundation
import Security
import UserNotifications

/// A line call's decision (LINE_DECISION, from the PC's nora-line.ts) gets one button per option. A category's
/// buttons are fixed, so each decision gets a category of its own, LINE_DECISION.<callId>.<actionId>, with an
/// OPT_<optionId> button per option (at most four); the app posts the choice when he picks one
/// (modules/calls/ios/LineNative.swift). The options come in the push's data ({ callId, actionId, options }), else
/// from GET /nora/line/calls/<id>. The newest 24 decision categories are kept. Every other push passes through.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  private static let keepKey = "line.decisionCategories"
  private static let keepCount = 24

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    lock.lock()
    handler = contentHandler
    self.content = content
    lock.unlock()
    let data = content.userInfo["data"] as? [String: Any] ?? [:]
    guard content.categoryIdentifier == "LINE_DECISION", let callId = data["callId"] as? String, !callId.isEmpty,
          let actionId = data["actionId"] as? String, !actionId.isEmpty else { return deliver() }
    let given = Self.options(data["options"])
    if !given.isEmpty { return register(callId: callId, actionId: actionId, options: given) }
    fetch(callId: callId, actionId: actionId) { [weak self] options in
      guard let self else { return }
      if options.isEmpty { self.deliver() } else { self.register(callId: callId, actionId: actionId, options: options) }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    deliver()
  }

  private func deliver() {
    lock.lock()
    let h = handler
    let c = content
    handler = nil
    lock.unlock()
    if let h, let c { h(c) }
  }

  private static func options(_ raw: Any?) -> [(id: String, label: String)] {
    (raw as? [[String: Any]] ?? []).compactMap { (o: [String: Any]) -> (id: String, label: String)? in
      guard let id = o["id"] as? String, !id.isEmpty, let label = o["label"] as? String, !label.isEmpty else { return nil }
      return (id, label)
    }
  }

  /// The decision's category, merged into the app's (the newest 24 decisions kept), then the notification once iOS
  /// has it.
  private func register(callId: String, actionId: String, options: [(id: String, label: String)]) {
    let id = "LINE_DECISION.\(callId).\(actionId)"
    let actions = options.prefix(4).map { o in
      // choosing carries out something real, so the phone has to be unlocked first
      UNNotificationAction(identifier: "OPT_\(o.id)", title: o.label, options: [.authenticationRequired])
    }
    let category = UNNotificationCategory(identifier: id, actions: Array(actions), intentIdentifiers: [], options: [])
    let defaults = UserDefaults.standard
    var keep = (defaults.stringArray(forKey: Self.keepKey) ?? []).filter { $0 != id }
    keep.append(id)
    let kept = Array(keep.suffix(Self.keepCount))
    defaults.set(kept, forKey: Self.keepKey)
    let center = UNUserNotificationCenter.current()
    center.getNotificationCategories { existing in
      var set = existing.filter { !$0.identifier.hasPrefix("LINE_DECISION.") || (kept.contains($0.identifier) && $0.identifier != id) }
      set.insert(category)
      center.setNotificationCategories(set)
      self.lock.lock()
      self.content?.categoryIdentifier = id
      self.lock.unlock()
      self.waitFor(id, tries: 0)
    }
  }

  /// iOS sets categories a moment later: deliver once it lists this one (a second at most).
  private func waitFor(_ id: String, tries: Int) {
    UNUserNotificationCenter.current().getNotificationCategories { set in
      if tries >= 10 || set.contains(where: { $0.identifier == id }) {
        self.deliver()
      } else {
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.1) { self.waitFor(id, tries: tries + 1) }
      }
    }
  }

  /// The decision's options from the PC, with the sign-in the app shares with its extensions.
  private func fetch(callId: String, actionId: String, done: @escaping ([(id: String, label: String)]) -> Void) {
    let safe = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    guard let token = Self.read("token"), let api = Self.read("api"),
          let url = URL(string: api + "/nora/line/calls/" + (callId.addingPercentEncoding(withAllowedCharacters: safe) ?? callId)) else {
      return done([])
    }
    var req = URLRequest(url: url)
    req.timeoutInterval = 8
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    URLSession.shared.dataTask(with: req) { data, _, _ in
      let call = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      let action = (call?["actions"] as? [[String: Any]])?.first { $0["id"] as? String == actionId }
      done(Self.options(action?["options"]))
    }.resume()
  }

  private static func read(_ account: String) -> String? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "agentic-os-pc",
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
