import AVFoundation
import CallKit
import Foundation
import PushKit
import Security
import UIKit

/// Nora's calls on the iPhone's own call screen. The PC sends a VoIP push (server/nora.ts push(): incomingId, reason,
/// name, voice); it rings CallKit even when the phone is locked or the app isn't running. iOS stops delivering VoIP
/// pushes to an app that doesn't report a call for each one, so every push is reported.
/// Answering hands the call to the JS side (src/lib/calls.ts opens agenticos://nora/call?id=<incomingId>, and Nora's
/// call screen joins it). Declining means "later", as in the old app: POST /nora/incoming/<id>/snooze.
/// PushKit starts at launch (AosCallsAppDelegate), before any JS runs, so a push that launched the app is delivered.
public final class CallCenter: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  public static let shared = CallCenter()

  struct Ring {
    let incomingId: String?
    let reason: String
    let voice: String?
    var answered: Bool
  }

  private var provider: CXProvider?
  private var registry: PKPushRegistry?
  private var rings: [UUID: Ring] = [:]
  private var timers: [UUID: Timer] = [:]
  private(set) var voipToken: String?
  /// An answered call the JS side hasn't taken yet: the answer launched the app, or JS was loading.
  private var pendingAnswer: [String: Any]?
  /// Set by the module while JS exists: sends one event to it.
  var emit: ((String, [String: Any]) -> Void)?

  /// From didFinishLaunching, on the main thread.
  func start() {
    guard registry == nil else { return }
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    let p = CXProvider(configuration: config)
    p.setDelegate(self, queue: nil)
    provider = p
    let r = PKPushRegistry(queue: .main)
    r.delegate = self
    r.desiredPushTypes = [.voIP]
    registry = r
  }

  /// The answered call waiting for JS, once: { id, uuid, reason, voice }.
  func takePending() -> [String: Any]? {
    let p = pendingAnswer
    pendingAnswer = nil
    return p
  }

  /// JS ended the call (Nora hung up, or the call screen closed): take it off the system call screen.
  func end(incomingId: String?) {
    for (uuid, ring) in rings where incomingId == nil || incomingId == "" || ring.incomingId == incomingId {
      timers.removeValue(forKey: uuid)?.invalidate()
      rings.removeValue(forKey: uuid)
      provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
    }
    pendingAnswer = nil
  }

  /// Calls on the system screen now: [{ id, uuid, answered }].
  func list() -> [[String: Any]] {
    rings.map { ["id": $0.value.incomingId ?? "", "uuid": $0.key.uuidString, "answered": $0.value.answered] }
  }

  // MARK: PushKit

  public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    voipToken = token
    emit?("onToken", ["token": token])
    // Also straight from here, with the shared sign-in: JS may not be running (a push launched the app).
    ServerLink.post("/devices", ["kind": "voip", "token": token])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    voipToken = nil
  }

  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload,
                           for type: PKPushType, completion: @escaping () -> Void) {
    start()
    let p = payload.dictionaryPayload
    let incomingId = p["incomingId"] as? String
    let reason = p["reason"] as? String ?? ""
    let voice = p["voice"] as? String
    let name = (p["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Nora"
    guard let provider else { completion(); return }
    let uuid = UUID()
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "nora")
    update.localizedCallerName = name
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportNewIncomingCall(with: uuid, update: update) { error in
      DispatchQueue.main.async {
        if error == nil {
          self.rings[uuid] = Ring(incomingId: incomingId, reason: reason, voice: voice, answered: false)
          self.timers[uuid] = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in self?.missed(uuid) }
          self.emit?("onRing", ["id": incomingId ?? "", "uuid": uuid.uuidString, "reason": reason])
        }
        completion()
      }
    }
  }

  private func missed(_ uuid: UUID) {
    timers.removeValue(forKey: uuid)
    guard let ring = rings[uuid], !ring.answered else { return }
    rings.removeValue(forKey: uuid)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
  }

  // MARK: CallKit

  public func providerDidReset(_ provider: CXProvider) {
    for t in timers.values { t.invalidate() }
    timers.removeAll()
    rings.removeAll()
    pendingAnswer = nil
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    timers.removeValue(forKey: action.callUUID)?.invalidate()
    guard var ring = rings[action.callUUID] else { action.fail(); return }
    ring.answered = true
    rings[action.callUUID] = ring
    // CallKit activates the session itself; it only has to be the right kind first.
    try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    action.fulfill()
    let info: [String: Any] = ["id": ring.incomingId ?? "", "uuid": action.callUUID.uuidString, "reason": ring.reason, "voice": ring.voice ?? ""]
    // Kept until JS takes it (takePending), so an answer that launched the app still opens the call.
    pendingAnswer = info
    emit?("onAnswer", info)
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    let uuid = action.callUUID
    timers.removeValue(forKey: uuid)?.invalidate()
    let ring = rings.removeValue(forKey: uuid)
    action.fulfill()
    if pendingAnswer?["uuid"] as? String == uuid.uuidString { pendingAnswer = nil }
    guard let ring else { return }
    if ring.answered {
      emit?("onEnd", ["id": ring.incomingId ?? "", "uuid": uuid.uuidString])
    } else if let id = ring.incomingId, !id.isEmpty {
      ServerLink.post("/nora/incoming/\(id)/snooze", [:])
    }
  }

  public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    action.fulfill()
    emit?("onMute", ["muted": action.isMuted])
  }

  public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    emit?("onAudio", ["active": true])
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    emit?("onAudio", ["active": false])
  }
}

/// Requests to the PC with the sign-in the app shares with its extensions (modules/shared-auth): service
/// "agentic-os-pc", accounts "token" and "api". Used where JS may not be running.
enum ServerLink {
  static func read(_ account: String) -> String? {
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

  static func post(_ path: String, _ body: [String: Any]) {
    guard let token = read("token"), let api = read("api"), let url = URL(string: api + path) else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = 15
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    // It can run with the app in the background (a decline on the lock screen): ask for the time to finish.
    let task = BackgroundTask()
    task.begin()
    URLSession.shared.dataTask(with: req) { _, _, _ in DispatchQueue.main.async { task.end() } }.resume()
  }
}

final class BackgroundTask {
  private var id: UIBackgroundTaskIdentifier = .invalid

  func begin() {
    id = UIApplication.shared.beginBackgroundTask { [weak self] in self?.end() }
  }

  func end() {
    guard id != .invalid else { return }
    UIApplication.shared.endBackgroundTask(id)
    id = .invalid
  }
}
