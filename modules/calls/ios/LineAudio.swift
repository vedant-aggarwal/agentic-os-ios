import AVFoundation
import Foundation

// Nora's phone line on the iPhone (line calls v2, nora-line/docs/line-calls-v2-contract.md §3): listening to a call
// she's on, and taking it over. Both ride one socket to the PC's /api/v1/nora/line/live, natively, so they keep going
// with the app in the background or locked. Listening plays the call (both sides, mixed on the PC) in a playback
// session; taking over is a CallKit call (CallCenter), so the phone treats it as a phone call: the green pill, the
// earpiece, Bluetooth, the lock screen's controls. His mic goes up in 20 ms frames while it's his.

/// A value read and written from more than one thread.
final class LineLock<Value> {
  private var value: Value
  private let lock = NSLock()

  init(_ value: Value) { self.value = value }

  func get() -> Value {
    lock.lock()
    defer { lock.unlock() }
    return value
  }

  func set(_ v: Value) {
    lock.lock()
    value = v
    lock.unlock()
  }
}

/// Why a socket closed without this side asking.
enum LineSocketEnd {
  case dropped, unreachable, signedOut

  var text: String {
    switch self {
    case .dropped: return "Lost the connection to your PC."
    case .unreachable: return "Couldn't reach your PC. Check that it's on and online."
    case .signedOut: return "Sign in again on this phone."
    }
  }
}

// MARK: - Socket

/// One socket to the live line endpoint. Everything but audio reaches onMessage on the main thread; audio frames are
/// decoded on the socket's own queue and go straight to `audio`, so playback never waits on the main thread.
final class LineSocket: NSObject, URLSessionWebSocketDelegate {
  /// Main thread. onClose comes once, and only for a close this side didn't ask for.
  var onOpen: (() -> Void)?
  var onMessage: (([String: Any]) -> Void)?
  var onClose: ((LineSocketEnd) -> Void)?

  private let audio: (Data) -> Void
  private var session: URLSession!
  private var task: URLSessionWebSocketTask!
  private var opened = false        // main
  private var closed = false        // main
  private var outbox: [String] = [] // main: sent in order once it opens
  private var pinger: Timer?
  /// Open and not closed, for the mic's thread.
  private let live = LineLock(false)

  private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

  /// nil when the address or the sign-in can't make a request. The token goes in the query (contract §3) and as a
  /// Bearer header.
  init?(url: String, token: String, audio: @escaping (Data) -> Void) {
    guard !token.isEmpty, var c = URLComponents(string: url), c.scheme == "wss" || c.scheme == "ws",
          let t = token.addingPercentEncoding(withAllowedCharacters: Self.unreserved) else { return nil }
    c.percentEncodedQuery = "token=\(t)"
    guard let full = c.url else { return nil }
    var req = URLRequest(url: full)
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    self.audio = audio
    super.init()
    let ops = OperationQueue()
    ops.maxConcurrentOperationCount = 1
    session = URLSession(configuration: .default, delegate: self, delegateQueue: ops)
    task = session.webSocketTask(with: req)
    task.maximumMessageSize = 1 << 20
  }

  var isOpen: Bool { opened && !closed }

  func connect() {
    task.resume()
    receive()
  }

  /// Main thread. Waits, in order, until the socket opens.
  func send(_ obj: [String: Any]) {
    guard !closed, let text = Self.text(obj) else { return }
    if opened { task.send(.string(text)) { _ in } } else { outbox.append(text) }
  }

  /// Any thread: a message only worth sending now (a mic frame).
  func sendNow(_ text: String) {
    guard live.get() else { return }
    task.send(.string(text)) { _ in }
  }

  /// Main thread: closes without a word to anyone (no onClose).
  func close() {
    guard !closed else { return }
    shut()
  }

  /// Main thread: a last message, then the close once it's out (a second at most).
  func close(after obj: [String: Any]) {
    guard !closed else { return }
    guard opened, let text = Self.text(obj) else { return close() }
    onOpen = nil
    onMessage = nil
    onClose = nil
    task.send(.string(text)) { [weak self] _ in DispatchQueue.main.async { self?.close() } }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.close() }
  }

  private func shut() {
    closed = true
    live.set(false)
    pinger?.invalidate()
    pinger = nil
    outbox.removeAll()
    task.cancel(with: .normalClosure, reason: nil)
    // the session holds its delegate (this) until it's invalidated
    session.invalidateAndCancel()
  }

  private func receive() {
    task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure:
        self.ended()
      case .success(let message):
        switch message {
        case .string(let text): self.handle(text)
        case .data(let data): if let text = String(data: data, encoding: .utf8) { self.handle(text) }
        @unknown default: break
        }
        self.receive()
      }
    }
  }

  /// The socket's queue.
  private func handle(_ text: String) {
    if text == "pong" { return }
    guard let data = text.data(using: .utf8),
          let m = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let type = m["type"] as? String else { return }
    if type == "audio" {
      if live.get(), let b64 = m["data"] as? String, let pcm = Data(base64Encoded: b64) { audio(pcm) }
      return
    }
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.closed else { return }
      self.onMessage?(m)
    }
  }

  private static func text(_ obj: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.closed else { return }
      self.opened = true
      self.live.set(true)
      for text in self.outbox { self.task.send(.string(text)) { _ in } }
      self.outbox.removeAll()
      // the contract's keepalive: "ping", answered "pong"
      self.pinger = Timer.scheduledTimer(withTimeInterval: 25, repeats: true) { [weak self] _ in
        self?.task.send(.string("ping")) { _ in }
      }
      self.onOpen?()
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                  didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    ended()
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    ended()
  }

  /// The socket's queue: it closed or failed on its own. Reported once, and not after close().
  private func ended() {
    live.set(false)
    let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.closed else { return }
      let end: LineSocketEnd = code == 401 || code == 403 ? .signedOut : self.opened ? .dropped : .unreachable
      self.shut()
      self.onClose?(end)
    }
  }
}

// MARK: - Audio

enum LineAudioError: Error { case format }

/// His mic, cut into the 20 ms frames the PC takes (640 bytes of 16 kHz 16 bit mono). Only the mic tap's thread
/// touches it.
private final class MicFramer {
  private let converter: AVAudioConverter
  private let wire: AVAudioFormat
  private var pending = Data()
  private var seq = 0

  init(converter: AVAudioConverter, wire: AVAudioFormat) {
    self.converter = converter
    self.wire = wire
  }

  /// The "mic" messages (contract §3) this buffer completes.
  func messages(_ buf: AVAudioPCMBuffer) -> [String] {
    let capacity = AVAudioFrameCount(Double(buf.frameLength) * wire.sampleRate / buf.format.sampleRate) + 64
    guard let o = AVAudioPCMBuffer(pcmFormat: wire, frameCapacity: capacity) else { return [] }
    var fed = false
    var error: NSError?
    _ = converter.convert(to: o, error: &error) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true
      status.pointee = .haveData
      return buf
    }
    guard error == nil, o.frameLength > 0, let ch = o.int16ChannelData else { return [] }
    pending.append(Data(bytes: ch[0], count: Int(o.frameLength) * 2))
    var out: [String] = []
    while pending.count >= 640 {
      let frame = Data(pending.prefix(640))
      pending.removeFirst(640)
      seq += 1
      // base64 needs no JSON escaping
      out.append("{\"type\":\"mic\",\"seq\":\(seq),\"data\":\"\(frame.base64EncodedString())\"}")
    }
    return out
  }
}

/// The phone's end of a line call's audio, one per use. `.listen` plays the call in a playback session that mixes
/// with other audio (and ducks it), so it can start with the app in the background (the Live Activity's Listen).
/// `.call` runs inside a CallKit call, which owns the session: the call plays and his mic goes up, with echo
/// cancellation from the voice processing I/O unit.
/// Incoming frames wait for 120 ms of audio before playing (the network is uneven) and again after running dry; a
/// queue past 0.8 s is dropped, so the delay can't creep up.
final class LineAudioEngine {
  enum Mode { case listen, call }

  let mode: Mode
  /// The mic tap's thread: a ready "mic" message to send. Set before start().
  var onMic: ((String) -> Void)?
  /// Main thread: the audio stopped for good, with why.
  var onFail: ((String) -> Void)?

  private static let prebuffer = 6
  private static let maxQueued = 40
  private let q = DispatchQueue(label: "nora.line.audio")
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let wire = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  private let voice = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
  private let muted = LineLock(false)
  // q only
  private var out: AVAudioFormat?
  private var toSpeaker: AVAudioConverter?
  private var running = false
  private var stopped = false
  private var interrupted = false
  private var sessionOn = false
  private var speaker = false
  private var queued = 0
  private var gen = 0
  private var buffering = true
  private var observers: [NSObjectProtocol] = []

  init(mode: Mode) { self.mode = mode }

  func start() {
    q.async {
      guard !self.running, !self.stopped else { return }
      do {
        if self.mode == .listen { try self.activate() }
        try self.run()
        if self.observers.isEmpty { self.observe() }
        self.applySpeaker()
      } catch {
        self.fail(self.mode == .call ? "Your mic didn't start. Nora has the call again." : "Couldn't play the call on this iPhone.")
      }
    }
  }

  /// Stops for good. With wait it returns once the engine is down and a listening session is off: CallKit has to
  /// find the session off before a take over turns it on.
  func stop(wait: Bool = false) {
    if wait { q.sync { self.stopNow() } } else { q.async { self.stopNow() } }
  }

  /// Any thread: one frame of the call.
  func play(_ pcm: Data) {
    q.async { self.schedule(pcm) }
  }

  func setMuted(_ on: Bool) { muted.set(on) }

  /// Loudspeaker, or the earpiece / headset (a call's audio only).
  func setSpeaker(_ on: Bool) {
    q.async {
      self.speaker = on
      self.applySpeaker()
    }
  }

  // MARK: Engine (q)

  private func activate() throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    try s.setActive(true)
    sessionOn = true
  }

  private func run() throws {
    if mode == .call {
      let input = engine.inputNode
      if !input.isVoiceProcessingEnabled { try input.setVoiceProcessingEnabled(true) }
    }
    let hw = engine.outputNode.inputFormat(forBus: 0)
    guard let fmt = AVAudioFormat(standardFormatWithSampleRate: hw.sampleRate > 0 ? hw.sampleRate : 48000, channels: 1),
          let conv = AVAudioConverter(from: voice, to: fmt) else { throw LineAudioError.format }
    out = fmt
    toSpeaker = conv
    if player.engine == nil { engine.attach(player) }
    engine.connect(player, to: engine.mainMixerNode, format: fmt)
    engine.mainMixerNode.outputVolume = 1
    if mode == .call {
      let input = engine.inputNode
      let micFormat = input.outputFormat(forBus: 0)
      guard micFormat.sampleRate > 0, micFormat.channelCount > 0, let micConv = AVAudioConverter(from: micFormat, to: wire) else {
        throw LineAudioError.format
      }
      micConv.downmix = true
      let framer = MicFramer(converter: micConv, wire: wire)
      let muted = self.muted
      let send = onMic
      input.removeTap(onBus: 0)
      input.installTap(onBus: 0, bufferSize: 1024, format: micFormat) { buf, _ in
        guard !muted.get(), let send else { return }
        for m in framer.messages(buf) { send(m) }
      }
    }
    engine.prepare()
    try engine.start()
    running = true
    gen += 1
    queued = 0
    buffering = true
  }

  private func observe() {
    let nc = NotificationCenter.default
    // iOS rebuilt the audio route (speaker, Bluetooth, a headset): start again on the new one.
    observers.append(nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
      self?.q.async { self?.restart() }
    })
    guard mode == .listen else { return }
    // CallKit hands a call's audio back after an interruption; listening has to take it back itself.
    observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
      let ended = (n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.ended.rawValue
      self?.q.async {
        guard let self else { return }
        self.interrupted = !ended
        if ended { self.restart(force: true) }
      }
    })
  }

  private func restart(force: Bool = false) {
    guard running || force, !stopped, !interrupted else { return }
    halt()
    do {
      if mode == .listen && force { try AVAudioSession.sharedInstance().setActive(true) }
      try run()
      applySpeaker()
    } catch {
      fail(mode == .call ? "The audio route changed and your mic didn't come back. Nora has the call again." : "The call's audio stopped.")
    }
  }

  private func applySpeaker() {
    guard mode == .call, running else { return }
    try? AVAudioSession.sharedInstance().overrideOutputAudioPort(speaker ? .speaker : .none)
  }

  /// The engine down, the session left as it is.
  private func halt() {
    guard running else { return }
    running = false
    if mode == .call { engine.inputNode.removeTap(onBus: 0) }
    gen += 1
    queued = 0
    buffering = true
    player.stop()
    engine.stop()
  }

  private func stopNow() {
    guard !stopped else { return }
    stopped = true
    for o in observers { NotificationCenter.default.removeObserver(o) }
    observers.removeAll()
    halt()
    if sessionOn {
      sessionOn = false
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  private func fail(_ why: String) {
    stopNow()
    DispatchQueue.main.async { self.onFail?(why) }
  }

  // MARK: Playback (q)

  /// One 20 ms frame (16 kHz 16 bit little endian), at the speaker's rate and onto the player.
  private func schedule(_ pcm: Data) {
    let frames = pcm.count / 2
    guard running, frames > 0, let out, let toSpeaker,
          let src = AVAudioPCMBuffer(pcmFormat: voice, frameCapacity: AVAudioFrameCount(frames)),
          let f = src.floatChannelData?[0] else { return }
    src.frameLength = AVAudioFrameCount(frames)
    pcm.withUnsafeBytes { raw in
      for i in 0..<frames { f[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32768 }
    }
    let capacity = AVAudioFrameCount(Double(frames) * out.sampleRate / voice.sampleRate) + 64
    guard let buf = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: capacity) else { return }
    var fed = false
    var error: NSError?
    _ = toSpeaker.convert(to: buf, error: &error) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true
      status.pointee = .haveData
      return src
    }
    guard error == nil, buf.frameLength > 0 else { return }
    if queued >= Self.maxQueued { flush() }
    let g = gen
    queued += 1
    player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.q.async { self?.played(g) }
    }
    if buffering && queued >= Self.prebuffer {
      buffering = false
      player.play()
    }
  }

  private func played(_ g: Int) {
    guard g == gen, running else { return }
    queued -= 1
    guard queued <= 0 else { return }
    // ran dry: wait for a few frames again before playing on
    queued = 0
    buffering = true
    player.pause()
  }

  /// Too far behind: drop what's queued.
  private func flush() {
    gen += 1
    queued = 0
    buffering = true
    player.stop()
  }
}

// MARK: - Hub

/// Listening to a line call and taking it over, for the live screen (the AosLine module), a notification's buttons,
/// the Live Activity's and a transfer answered on the system call screen. One call and one socket at a time.
/// Main thread only, except hangUpNow().
final class LineHub {
  static let shared = LineHub()

  /// What Nora is told when he declines a transfer (the live screen's "Nora keeps it" says the same).
  static let keepNote = "He can't take this call now. Carry on, take a message, and say he'll call back if it's needed."

  /// Set by the module while JS exists: the state for the live screen.
  var emit: (([String: Any]) -> Void)?

  private var callId: String?
  private var name = ""
  private var url = ""
  private var token = ""
  /// He wants the call's audio.
  private var listening = false
  /// The PC confirmed his mic goes to the caller.
  private var takenOver = false
  /// Asked to take over; waiting on the microphone, CallKit or the PC.
  private var taking = false
  /// "takeover" went to the PC.
  private var askedTakeover = false
  private var muted = false
  private var speaker = false
  private var error: String?
  private var socket: LineSocket?
  private var opened = false
  private var reconnects = 0
  private var listenEngine: LineAudioEngine?
  private var callEngine: LineAudioEngine?
  private var callUUID: UUID?
  private var callKitAudio = false
  private var listenWaiters: [(String?) -> Void] = []
  private var takeWaiters: [(String?) -> Void] = []
  private var takeTimer: Timer?
  private var keepers: [LineSocket] = []
  /// The engine the socket's audio frames go to (read on the socket's queue).
  private let sink = LineLock<LineAudioEngine?>(nil)
  /// The socket is open: hangUpNow() answers JS at once, on JS's thread.
  private let socketOpen = LineLock(false)

  private var inCall: Bool { callUUID != nil }

  /// The live socket's address and the sign-in from the keychain the app shares with its extensions: for the
  /// notification and Live Activity buttons, and a transfer answered with JS not running.
  static func signIn() -> (url: String, token: String)? {
    guard let token = ServerLink.read("token"), !token.isEmpty, let api = ServerLink.read("api"), !api.isEmpty else { return nil }
    return (api.replacingOccurrences(of: "^http", with: "ws", options: .regularExpression) + "/nora/line/live", token)
  }

  // MARK: From JS and the buttons

  /// Plays the call's audio, or stops it. done: nil once it plays (or stopped), else why not.
  func listen(callId: String, on: Bool, url: String? = nil, token: String? = nil, done: ((String?) -> Void)? = nil) {
    guard !callId.isEmpty else { done?("No call to listen to."); return }
    if !on {
      guard self.callId == callId, listening else { done?(nil); return }
      listening = false
      stopListenEngine()
      settleListen(nil)
      if taking || takenOver { socket?.send(["type": "listen", "on": false]) } else { dropSocket() }
      report()
      done?(nil)
      return
    }
    if self.callId != callId { teardown("That call has ended."); self.callId = callId }
    guard use(url: url, token: token), connect() else { done?(LineSocketEnd.signedOut.text); return }
    listening = true
    socket?.send(["type": "listen", "on": true])
    if opened {
      if !inCall { startListenEngine() }
      report()
      done?(nil)
    } else {
      if let done { listenWaiters.append(done) }
      report()
    }
  }

  /// His mic to the caller and Nora quiet (contract §3 takeover), on a CallKit call. done: nil once the PC confirms,
  /// else why not.
  func takeOver(callId: String, name: String, url: String? = nil, token: String? = nil, done: ((String?) -> Void)? = nil) {
    guard !callId.isEmpty else { done?("No call to take."); return }
    if self.callId == callId && takenOver { done?(nil); return }
    if self.callId == callId && taking {
      if let done { takeWaiters.append(done) }
      return
    }
    if self.callId != callId { teardown("That call has ended."); self.callId = callId }
    if !name.isEmpty { self.name = name }
    guard use(url: url, token: token) else { done?(LineSocketEnd.signedOut.text); return }
    taking = true
    if let done { takeWaiters.append(done) }
    report()
    Self.withMic { [weak self] granted in
      guard let self, self.taking, self.callId == callId else { return }
      guard granted else {
        return self.failTakeover("The microphone is off for Agentic OS. Turn it on in Settings, then take the call again.")
      }
      guard self.connect() else { return self.failTakeover(LineSocketEnd.signedOut.text) }
      self.takeTimer?.invalidate()
      self.takeTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
        self?.failTakeover("Your PC didn't hand you the call. Try again.")
      }
      if self.inCall { self.askTakeover(); return }
      // the call's audio moves into CallKit's session, which CallKit has to find off
      self.stopListenEngine(wait: true)
      let uuid = UUID()
      CallCenter.shared.startLineCall(uuid: uuid, callId: callId, name: self.name.isEmpty ? "Call on Nora's line" : self.name) { [weak self] err in
        guard let self, err != nil, self.taking, self.callId == callId, self.callUUID == nil else { return }
        self.failTakeover("Couldn't start the call on this iPhone.")
      }
    }
  }

  /// Hands the call back to Nora; listening goes on if it was on.
  func release() {
    guard taking || takenOver else { return }
    let asked = askedTakeover
    endTakeover()
    // a take over still on its way ends here too: its promise settles without an error
    settleTake(nil)
    if listening {
      if asked { socket?.send(["type": "release"]) }
    } else {
      dropSocket(last: asked ? ["type": "release"] : nil)
    }
    report()
  }

  /// JS's thread: hangs up through this socket when it's open; false when there's none (the screen uses its own).
  func hangUpNow() -> Bool {
    guard socketOpen.get() else { return false }
    DispatchQueue.main.async { self.hangUp() }
    return true
  }

  /// Lets go of everything here without telling the PC (the live screen saw the call end).
  func stop() {
    teardown("That call has ended.")
    report()
  }

  func setMuted(_ on: Bool) {
    if let uuid = callUUID { CallCenter.shared.setLineMuted(uuid, on) } else { callKitMuted(on) }
  }

  func setSpeaker(_ on: Bool) {
    speaker = on
    callEngine?.setSpeaker(on)
    report()
  }

  /// He declined Nora's transfer: she carries on and takes a message.
  func keep(callId: String) {
    let note: [String: Any] = ["type": "instruct", "text": Self.keepNote]
    if self.callId == callId, let s = socket, opened, !takenOver { s.send(note); return }
    guard let auth = Self.signIn(), let s = LineSocket(url: auth.url, token: auth.token, audio: { _ in }) else { return }
    // it may run with the app in the background (the notification's button, a declined ring)
    let task = BackgroundTask()
    task.begin()
    let finish = { [weak self, weak s] in
      task.end()
      guard let self, let s else { return }
      s.close()
      self.keepers.removeAll { $0 === s }
    }
    s.onOpen = { [weak s] in
      s?.close(after: note)
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: finish)
    }
    s.onClose = { _ in finish() }
    keepers.append(s)
    s.connect()
    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: finish)
  }

  func snapshot() -> [String: Any] {
    [
      "callId": callId ?? "",
      "listening": listening && opened,
      "takenOver": takenOver,
      "connecting": taking || (listening && !opened),
      "muted": muted,
      "speaker": speaker,
      "error": error ?? "",
    ]
  }

  // MARK: From CallCenter (CallKit)

  /// The take over's CallKit call is up: ask the PC for the call.
  func callKitStarted(_ uuid: UUID) {
    guard taking, callUUID == nil else { CallCenter.shared.reportLineEnded(uuid, failed: true); return }
    callUUID = uuid
    askTakeover()
  }

  /// He answered Nora's transfer on the system call screen (a VoIP push, contract §4): open the socket and take over,
  /// with CallKit's session carrying the audio.
  func callKitAnswered(_ uuid: UUID, callId: String, name: String) {
    if self.callId != callId { teardown("That call has ended."); self.callId = callId }
    if !name.isEmpty { self.name = name }
    callUUID = uuid
    stopListenEngine(wait: true)
    guard use(url: nil, token: nil), connect() else {
      callUUID = nil
      CallCenter.shared.reportLineEnded(uuid, failed: true)
      error = LineSocketEnd.signedOut.text
      report()
      return
    }
    taking = true
    takeTimer?.invalidate()
    takeTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: false) { [weak self] _ in
      self?.failTakeover("Your PC didn't hand you the call. Nora has it again.")
    }
    askTakeover()
    report()
  }

  /// He ended the call on the system call screen: a call he had hangs up; one still on its way goes back to Nora.
  func callKitEnded(_ uuid: UUID) {
    guard uuid == callUUID else { return }
    callUUID = nil
    if takenOver {
      hangUp()
    } else if taking {
      failTakeover(nil)
    }
  }

  /// CallKit turned the audio session on or off.
  func callKitAudio(_ on: Bool) {
    callKitAudio = on
    if on {
      guard inCall, taking || takenOver, callEngine == nil else { return }
      let e = LineAudioEngine(mode: .call)
      let s = socket
      e.onMic = { [weak s] text in s?.sendNow(text) }
      e.onFail = { [weak self, weak e] why in
        guard let self, let e, self.callEngine === e else { return }
        self.callEngine = nil
        self.sink.set(nil)
        // no mic: the caller would hear nothing, so Nora takes it back
        self.error = why
        self.release()
      }
      e.setMuted(muted)
      e.setSpeaker(speaker)
      callEngine = e
      sink.set(e)
      e.start()
    } else {
      stopCallEngine()
      resumeListening()
    }
  }

  func callKitMuted(_ on: Bool) {
    muted = on
    callEngine?.setMuted(on)
    report()
  }

  /// CallKit dropped every call: the take over is gone, Nora gets the call back.
  func callKitReset() {
    guard inCall || taking || takenOver else { return }
    callUUID = nil
    release()
  }

  // MARK: Socket

  /// The address and sign-in JS gave, else the keychain's, else the last ones. False when there's none.
  private func use(url: String?, token: String?) -> Bool {
    if let url, let token, !url.isEmpty, !token.isEmpty {
      self.url = url
      self.token = token
      return true
    }
    if let s = Self.signIn() {
      self.url = s.url
      self.token = s.token
      return true
    }
    return !self.url.isEmpty && !self.token.isEmpty
  }

  /// Opens the socket unless one is up. False when the address or sign-in can't make one.
  private func connect() -> Bool {
    if socket != nil { return true }
    let sink = self.sink
    guard let s = LineSocket(url: url, token: token, audio: { pcm in sink.get()?.play(pcm) }) else { return false }
    s.onOpen = { [weak self, weak s] in
      guard let self, let s, self.socket === s else { return }
      self.opened = true
      self.socketOpen.set(true)
      self.reconnects = 0
      if self.listening && !self.inCall { self.startListenEngine() }
      self.settleListen(nil)
      self.report()
    }
    s.onMessage = { [weak self, weak s] m in
      guard let self, let s, self.socket === s else { return }
      self.handle(m)
    }
    s.onClose = { [weak self, weak s] end in
      guard let self, let s, self.socket === s else { return }
      self.lost(end)
    }
    socket = s
    opened = false
    socketOpen.set(false)
    s.connect()
    return true
  }

  private func dropSocket(last: [String: Any]? = nil) {
    guard let s = socket else { return }
    socket = nil
    opened = false
    socketOpen.set(false)
    if let last { s.close(after: last) } else { s.close() }
  }

  private func handle(_ m: [String: Any]) {
    switch m["type"] as? String ?? "" {
    case "state":
      guard let call = m["call"] as? [String: Any], call["id"] as? String == callId, call["phase"] as? String != "ended" else {
        return gone()
      }
      let mine = call["phase"] as? String == "you" && call["takenOverBy"] as? String == "app"
      if taking && askedTakeover && mine {
        confirmed()
      } else if takenOver && !mine {
        // the PC gave the call back to Nora
        endTakeover()
        report()
      }
    case "ended":
      if m["callId"] as? String == callId { gone() }
    case "error":
      let message = m["message"] as? String ?? "Something went wrong on your PC."
      if taking { failTakeover(message) } else {
        error = message
        report()
      }
    default:
      break
    }
  }

  /// The socket closed on its own. A take over ends (the PC gives Nora the call back 3 s later; taking it again from
  /// a new socket would fail until then); listening reconnects up to three times.
  private func lost(_ end: LineSocketEnd) {
    socket = nil
    opened = false
    socketOpen.set(false)
    if taking || takenOver {
      let message = end == .dropped ? "Lost the connection to your PC. Nora has the call again." : end.text
      let wasTaking = taking
      endTakeover(failed: true)
      if wasTaking && !takeWaiters.isEmpty { settleTake(message) } else { error = message }
    }
    guard listening else { report(); return }
    if end != .signedOut && (end == .dropped || reconnects > 0) && reconnects < 3 {
      reconnects += 1
      let id = callId
      DispatchQueue.main.asyncAfter(deadline: .now() + Double(1 << (reconnects - 1))) { [weak self] in
        guard let self, self.listening, self.socket == nil, self.callId == id else { return }
        if self.connect() { self.socket?.send(["type": "listen", "on": true]) } else { self.lost(.signedOut) }
      }
      report()
      return
    }
    listening = false
    stopListenEngine()
    if listenWaiters.isEmpty { error = error ?? end.text } else { settleListen(end.text) }
    report()
  }

  // MARK: Take over

  private func askTakeover() {
    askedTakeover = true
    socket?.send(["type": "takeover"])
  }

  private func confirmed() {
    taking = false
    takenOver = true
    takeTimer?.invalidate()
    takeTimer = nil
    if let uuid = callUUID { CallCenter.shared.reportLineConnected(uuid) }
    settleTake(nil)
    report()
  }

  /// A take over that didn't happen (why nil: he cancelled it). If the PC was asked, it's asked to give it back.
  private func failTakeover(_ why: String?) {
    guard taking else { return }
    let asked = askedTakeover
    endTakeover(failed: why != nil)
    if listening {
      if asked { socket?.send(["type": "release"]) }
    } else {
      dropSocket(last: asked ? ["type": "release"] : nil)
    }
    if takeWaiters.isEmpty { if let why { error = why } } else { settleTake(why) }
    report()
  }

  /// Ends the take over on this phone: the CallKit call goes, and listening goes on if it was on.
  private func endTakeover(failed: Bool = false) {
    takeTimer?.invalidate()
    takeTimer = nil
    taking = false
    takenOver = false
    askedTakeover = false
    muted = false
    stopCallEngine()
    if let uuid = callUUID {
      callUUID = nil
      CallCenter.shared.reportLineEnded(uuid, failed: failed)
    }
    resumeListening()
  }

  private func hangUp() {
    guard socket != nil else { return }
    dropSocket(last: ["type": "hangup"])
    teardown("That call has ended.")
    report()
  }

  /// The call ended, or another call is on.
  private func gone() {
    teardown("That call has ended.")
    report()
  }

  /// Everything off: engines, the CallKit call, the socket, the waiters.
  private func teardown(_ why: String) {
    takeTimer?.invalidate()
    takeTimer = nil
    stopListenEngine()
    stopCallEngine()
    if let uuid = callUUID {
      callUUID = nil
      CallCenter.shared.reportLineEnded(uuid, failed: false)
    }
    dropSocket()
    settleListen(why)
    settleTake(why)
    callId = nil
    listening = false
    taking = false
    takenOver = false
    askedTakeover = false
    muted = false
    reconnects = 0
  }

  // MARK: Engines

  private func startListenEngine() {
    guard listenEngine == nil, !inCall else { return }
    let e = LineAudioEngine(mode: .listen)
    e.onFail = { [weak self, weak e] why in
      guard let self, let e, self.listenEngine === e else { return }
      self.listenEngine = nil
      self.sink.set(nil)
      self.listening = false
      if self.taking || self.takenOver { self.socket?.send(["type": "listen", "on": false]) } else { self.dropSocket() }
      self.error = why
      self.report()
    }
    listenEngine = e
    sink.set(e)
    e.start()
  }

  private func stopListenEngine(wait: Bool = false) {
    guard let e = listenEngine else { return }
    listenEngine = nil
    if sink.get() === e { sink.set(nil) }
    e.stop(wait: wait)
  }

  private func stopCallEngine() {
    guard let e = callEngine else { return }
    callEngine = nil
    if sink.get() === e { sink.set(nil) }
    e.stop()
  }

  /// After a take over, listening goes on in its own session once CallKit has let go of its own (a second at most).
  private func resumeListening() {
    let go = { [weak self] in
      guard let self, self.listening, self.opened, !self.inCall, self.listenEngine == nil else { return }
      self.startListenEngine()
      self.report()
    }
    if callKitAudio { DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: go) } else { go() }
  }

  // MARK: Helpers

  /// Settles the waiting promises. Taken off first: a waiter may call back in.
  private func settleListen(_ why: String?) {
    let w = listenWaiters
    listenWaiters = []
    for done in w { done(why) }
  }

  private func settleTake(_ why: String?) {
    let w = takeWaiters
    takeWaiters = []
    for done in w { done(why) }
  }

  /// The state to the live screen and the Live Activity's Listen button. A problem goes out once.
  private func report() {
    let s = snapshot()
    error = nil
    emit?(s)
    LineActivities.shared.setListening(callId, listening && opened && !inCall)
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
