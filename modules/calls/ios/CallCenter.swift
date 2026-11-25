import AVFoundation
import CallKit
import Foundation
import PushKit
import Security
import UIKit

/// Nora's calls on the iPhone's own call screen. The PC sends a VoIP push (server/nora.ts push(): incomingId, reason,
/// name, voice); it rings CallKit even when the phone is locked or the app isn't running. iOS stops delivering VoIP
/// pushes to an app that doesn't report a call for each one, so every push is reported.
/// Answering starts the call's audio natively (NoraRelay through RelayHub: the socket opens on answer, the mic and
/// speaker when CallKit activates the session), so a call answered on the lock screen talks without the app's UI.
/// The JS side opens agenticos://nora/call?id=<incomingId> too (src/lib/calls.ts), and Nora's call screen joins the
/// same relay. Declining means "later", as in the old app: POST /nora/incoming/<id>/snooze.
/// PushKit starts at launch (AosCallsAppDelegate), before any JS runs, so a push that launched the app is delivered.
/// Nora's phone line (line calls v2, LineAudio.swift) has calls here too: taking a line call over is an outgoing call
/// (startLineCall), and a VoIP push with lineTransfer (Nora wants him on a call) rings as "<caller> · Nora"; answering
/// takes it over, declining tells Nora to keep it.
public final class CallCenter: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  public static let shared = CallCenter()

  struct Ring {
    let incomingId: String?
    let reason: String
    let voice: String?
    var answered: Bool
    /// A line transfer's call id (contract §4 lineTransfer), and the caller's name.
    var lineCallId: String? = nil
    var name: String = ""
  }

  private var provider: CXProvider?
  private var registry: PKPushRegistry?
  private var rings: [UUID: Ring] = [:]
  private var timers: [UUID: Timer] = [:]
  private lazy var controller = CXCallController()
  /// Line calls on the system call screen: a take over (outgoing), or a transfer he answered.
  private var lineCalls: [UUID: (callId: String, name: String, outgoing: Bool)] = [:]
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
    for (uuid, ring) in rings where ring.lineCallId == nil && (incomingId == nil || incomingId == "" || ring.incomingId == incomingId) {
      timers.removeValue(forKey: uuid)?.invalidate()
      rings.removeValue(forKey: uuid)
      provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
      if ring.answered { RelayHub.shared.hungUp(incomingId: ring.incomingId) }
    }
    pendingAnswer = nil
  }

  /// The relay of an answered call ended (Nora hung up, the PC dropped, or it never connected): take the call off
  /// the system call screen, and don't open it in the app later.
  func relayEnded(incomingId: String?, failed: Bool) {
    for (uuid, ring) in rings where ring.answered && ring.incomingId == incomingId {
      rings.removeValue(forKey: uuid)
      provider?.reportCall(with: uuid, endedAt: Date(), reason: failed ? .failed : .remoteEnded)
    }
    if pendingAnswer?["id"] as? String == (incomingId ?? "") { pendingAnswer = nil }
  }

  /// Calls on the system screen now: [{ id, uuid, answered }].
  func list() -> [[String: Any]] {
    rings.filter { $0.value.lineCallId == nil }.map { ["id": $0.value.incomingId ?? "", "uuid": $0.key.uuidString, "answered": $0.value.answered] }
  }

  // MARK: Nora's line

  /// The app takes a line call over: an outgoing CallKit call, so the session, the green pill, Bluetooth and the lock
  /// screen's controls work as in a phone call. done gets the error when CallKit refused it.
  func startLineCall(uuid: UUID, callId: String, name: String, done: @escaping (Error?) -> Void) {
    start()
    lineCalls[uuid] = (callId, name, true)
    let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: "nora-line"))
    controller.request(CXTransaction(action: action)) { error in
      DispatchQueue.main.async {
        if error != nil { self.lineCalls.removeValue(forKey: uuid) }
        done(error)
      }
    }
  }

  /// The PC handed him the call: the take over's call shows as connected.
  func reportLineConnected(_ uuid: UUID) {
    guard lineCalls[uuid]?.outgoing == true else { return }
    provider?.reportOutgoingCall(with: uuid, connectedAt: Date())
  }

  /// The take over ended on the app's side (handed back, the call ended, it failed): off the system call screen.
  func reportLineEnded(_ uuid: UUID, failed: Bool) {
    guard lineCalls.removeValue(forKey: uuid) != nil else { return }
    provider?.reportCall(with: uuid, endedAt: Date(), reason: failed ? .failed : .remoteEnded)
  }

  func setLineMuted(_ uuid: UUID, _ muted: Bool) {
    controller.request(CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))) { _ in }
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
    if let line = p["lineTransfer"] as? String, !line.isEmpty {
      ringLine(line, payload: p, completion: completion)
      return
    }
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

  /// Nora wants him on a line call (askTransfer in the PC's nora-line.ts): { lineTransfer: callId, name, reason }.
  private func ringLine(_ callId: String, payload p: [AnyHashable: Any], completion: @escaping () -> Void) {
    let name = (p["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "A caller"
    let reason = p["reason"] as? String ?? ""
    guard let provider else { completion(); return }
    let uuid = UUID()
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "nora-line")
    update.localizedCallerName = "\(name) · Nora"
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportNewIncomingCall(with: uuid, update: update) { error in
      DispatchQueue.main.async {
        if error == nil {
          self.rings[uuid] = Ring(incomingId: nil, reason: reason, voice: nil, answered: false, lineCallId: callId, name: name)
          self.timers[uuid] = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in self?.missed(uuid) }
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
    // a transfer he didn't answer: Nora carries on without waiting for him
    if let line = ring.lineCallId { LineHub.shared.keep(callId: line) }
  }

  // MARK: CallKit

  public func providerDidReset(_ provider: CXProvider) {
    for t in timers.values { t.invalidate() }
    timers.removeAll()
    rings.removeAll()
    pendingAnswer = nil
    RelayHub.shared.hungUp(incomingId: nil)
    lineCalls.removeAll()
    LineHub.shared.callKitReset()
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    timers.removeValue(forKey: action.callUUID)?.invalidate()
    guard var ring = rings[action.callUUID] else { action.fail(); return }
    if let line = ring.lineCallId {
      answerLine(action, callId: line, ring: ring)
      return
    }
    ring.answered = true
    rings[action.callUUID] = ring
    // CallKit activates the session itself; it only has to be the right kind first.
    try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    action.fulfill()
    let info: [String: Any] = ["id": ring.incomingId ?? "", "uuid": action.callUUID.uuidString, "reason": ring.reason, "voice": ring.voice ?? ""]
    // Kept until JS takes it (takePending), so an answer that launched the app still opens the call.
    pendingAnswer = info
    RelayHub.shared.answered(incomingId: ring.incomingId, reason: ring.reason)
    emit?("onAnswer", info)
  }

  /// He answered a line transfer: it moves to the line calls and LineHub takes it over (JS opens the call's screen).
  private func answerLine(_ action: CXAnswerCallAction, callId: String, ring: Ring) {
    rings.removeValue(forKey: action.callUUID)
    lineCalls[action.callUUID] = (callId, ring.name, false)
    try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    action.fulfill()
    let info: [String: Any] = ["id": "", "uuid": action.callUUID.uuidString, "reason": ring.reason, "voice": "", "line": callId]
    pendingAnswer = info
    LineHub.shared.callKitAnswered(action.callUUID, callId: callId, name: ring.name)
    emit?("onAnswer", info)
  }

  /// A take over starting (startLineCall).
  public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    guard let line = lineCalls[action.callUUID] else { action.fail(); return }
    try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    action.fulfill()
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    let update = CXCallUpdate()
    update.remoteHandle = action.handle
    update.localizedCallerName = line.name
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportCall(with: action.callUUID, updated: update)
    LineHub.shared.callKitStarted(action.callUUID)
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    let uuid = action.callUUID
    timers.removeValue(forKey: uuid)?.invalidate()
    if lineCalls.removeValue(forKey: uuid) != nil {
      // his End on a line call: it hangs up (a take over still connecting goes back to Nora). Nora's own call
      // screen has no part in it, so no onEnd.
      action.fulfill()
      if pendingAnswer?["uuid"] as? String == uuid.uuidString { pendingAnswer = nil }
      LineHub.shared.callKitEnded(uuid)
      return
    }
    let ring = rings.removeValue(forKey: uuid)
    action.fulfill()
    if pendingAnswer?["uuid"] as? String == uuid.uuidString { pendingAnswer = nil }
    guard let ring else { return }
    if let line = ring.lineCallId {
      // he declined the transfer: Nora keeps the call
      LineHub.shared.keep(callId: line)
      return
    }
    if ring.answered {
      RelayHub.shared.hungUp(incomingId: ring.incomingId)
      emit?("onEnd", ["id": ring.incomingId ?? "", "uuid": uuid.uuidString])
    } else if let id = ring.incomingId, !id.isEmpty {
      ServerLink.post("/nora/incoming/\(id)/snooze", [:])
    }
  }

  public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    action.fulfill()
    if lineCalls[action.callUUID] != nil {
      LineHub.shared.callKitMuted(action.isMuted)
      return
    }
    RelayHub.shared.active?.muted = action.isMuted
    emit?("onMute", ["muted": action.isMuted])
  }

  public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    RelayHub.shared.setCallKitAudio(true)
    LineHub.shared.callKitAudio(true)
    emit?("onAudio", ["active": true])
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    RelayHub.shared.setCallKitAudio(false)
    LineHub.shared.callKitAudio(false)
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
