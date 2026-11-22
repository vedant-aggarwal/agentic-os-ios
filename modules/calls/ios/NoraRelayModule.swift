import AVFoundation
import ExpoModulesCore

/// JS side of the phone's call audio (src/nora/call/relay.ts). One relay at a time lives in RelayHub, shared with
/// the system call screen: a call answered there starts natively, and the call screen joins it with start().
/// Events: state { state: connecting | ready | ended, callId?, error?, speaker }, level { level: 0..1 }.
public final class NoraRelayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoraRelay")
    Events("state", "level")

    OnCreate {
      DispatchQueue.main.async {
        RelayHub.shared.emit = { [weak self] name, body in self?.sendEvent(name, body) }
      }
    }

    OnDestroy {
      // JS went away (a reload): a call it started has no screen left to end it from.
      DispatchQueue.main.async {
        RelayHub.shared.emit = nil
        RelayHub.shared.stopAppCall()
      }
    }

    /// Resolves once the socket to the PC is open. Joins the call already on when there is one.
    AsyncFunction("start") { (o: [String: Any], promise: Promise) in
      let url = o["url"] as? String ?? ""
      let token = o["token"] as? String ?? ""
      let incomingId = (o["incomingId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      let reason = o["reason"] as? String ?? "You called"
      RelayHub.shared.start(url: url, token: token, incomingId: incomingId, reason: reason) { problem in
        if let problem { promise.reject("ERR_NORA_RELAY", problem) } else { promise.resolve() }
      }
    }.runOnQueue(.main)

    /// The call on now: { incomingId, callId, state, speaker }, or null.
    AsyncFunction("current") { () -> [String: Any]? in
      RelayHub.shared.snapshot()
    }.runOnQueue(.main)

    Function("setMuted") { (muted: Bool) in
      DispatchQueue.main.async { RelayHub.shared.active?.muted = muted }
    }

    Function("setSpeaker") { (on: Bool) in
      DispatchQueue.main.async { RelayHub.shared.active?.setSpeaker(on) }
    }

    Function("stop") {
      DispatchQueue.main.async { RelayHub.shared.active?.stop() }
    }
  }
}

/// The one call relay at a time. Main thread only.
final class RelayHub {
  static let shared = RelayHub()

  /// Set by the module while JS exists.
  var emit: ((String, [String: Any]) -> Void)?
  /// CallKit has the audio session on (CallCenter keeps it current through setCallKitAudio).
  private var callKitAudio = false
  private var current: NoraRelay?

  var active: NoraRelay? { current?.phase == .ended ? nil : current }

  /// A call answered on the system call screen: dial the PC with the shared sign-in (modules/shared-auth). The
  /// audio starts when CallKit activates the session, so it works from the lock screen with no app UI.
  func answered(incomingId: String?, reason: String) {
    if let r = active, !r.ownsSession, r.incomingId == incomingId { return }
    active?.stop()
    guard let token = ServerLink.read("token"), !token.isEmpty, let api = ServerLink.read("api"),
          let url = URL(string: api.replacingOccurrences(of: "^http", with: "ws", options: .regularExpression) + "/nora/relay") else {
      CallCenter.shared.relayEnded(incomingId: incomingId, failed: true)
      return
    }
    let r = make(url: url, token: token, incomingId: incomingId, reason: reason, ownsSession: false)
    if callKitAudio { r.audioReady() }
  }

  /// The call screen's start(): joins the call on now, or starts one that sets up its own audio session.
  func start(url: String, token: String, incomingId: String?, reason: String, done: @escaping (String?) -> Void) {
    if let r = active {
      r.whenOpen(done)
      report(r)
      return
    }
    guard !token.isEmpty else { return done("Sign in again on this phone, then call again.") }
    guard let u = URL(string: url), u.scheme == "wss" || u.scheme == "ws" else { return done("The PC's address is wrong.") }
    let r = make(url: u, token: token, incomingId: incomingId, reason: reason, ownsSession: true)
    r.whenOpen(done)
    Self.withMic { granted in
      if granted { r.audioReady() } else { r.fail("The microphone is off for Agentic OS. Turn it on in Settings, then call again.") }
    }
  }

  /// CallKit turned the audio session on or off.
  func setCallKitAudio(_ on: Bool) {
    callKitAudio = on
    guard let r = active, !r.ownsSession else { return }
    if on { r.audioReady() } else { r.audioStopped() }
  }

  /// He hung up on the system call screen, or the app took the call off it.
  func hungUp(incomingId: String?) {
    guard let r = active, !r.ownsSession else { return }
    if incomingId == nil || incomingId == "" || r.incomingId == incomingId { r.stop() }
  }

  func stopAppCall() {
    if let r = active, r.ownsSession { r.stop() }
  }

  func snapshot() -> [String: Any]? {
    guard let r = active else { return nil }
    var o: [String: Any] = ["state": r.phase.rawValue, "speaker": r.speaker, "owner": r.ownsSession ? "app" : "callkit"]
    if let id = r.incomingId { o["incomingId"] = id }
    if let id = r.callId { o["callId"] = id }
    return o
  }

  private func make(url: URL, token: String, incomingId: String?, reason: String, ownsSession: Bool) -> NoraRelay {
    let r = NoraRelay(url: url, token: token, incomingId: incomingId, reason: reason, ownsSession: ownsSession)
    r.onState = { [weak self, weak r] in
      guard let self, let r else { return }
      self.report(r)
      guard r.phase == .ended else { return }
      if self.current === r { self.current = nil }
      if !r.ownsSession { CallCenter.shared.relayEnded(incomingId: r.incomingId, failed: r.problem != nil) }
    }
    r.onLevel = { [weak self] level in self?.emit?("level", ["level": level]) }
    current = r
    r.connect()
    report(r)
    return r
  }

  private func report(_ r: NoraRelay) {
    var e: [String: Any] = ["state": r.phase.rawValue, "speaker": r.speaker]
    if let id = r.callId { e["callId"] = id }
    if let p = r.problem { e["error"] = p }
    emit?("state", e)
  }

  private static func withMic(_ go: @escaping (Bool) -> Void) {
    let back: (Bool) -> Void = { ok in DispatchQueue.main.async { go(ok) } }
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: go(true)
      case .denied: go(false)
      default: AVAudioApplication.requestRecordPermission(completionHandler: back)
      }
    } else {
      let s = AVAudioSession.sharedInstance()
      switch s.recordPermission {
      case .granted: go(true)
      case .denied: go(false)
      default: s.requestRecordPermission(back)
      }
    }
  }
}
