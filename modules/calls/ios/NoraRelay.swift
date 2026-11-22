import AVFoundation
import Foundation

/// The audio of one call with Nora, ported from the Capacitor app's ios/App/App/NoraRelay.swift. The mic goes up as
/// 24 kHz 16 bit mono PCM over a WebSocket to the PC (/api/v1/nora/relay, server/nora.ts relay()), which relays it to
/// her voice engine and runs her tools; her voice comes back the same way. Echo cancellation comes from the voice
/// processing I/O unit. Her 24 kHz audio is converted to the speaker's own rate before it's played, and the phone
/// reports its audio state to the PC log every few seconds.
///
/// Two owners: a call answered on the system call screen (CallKit turns the audio session on and off, CallCenter
/// calls audioReady / audioStopped), or a call he started in the app (ownsSession: this sets the session up itself).
final class NoraRelay: NSObject, URLSessionWebSocketDelegate {
  enum Phase: String { case connecting, ready, ended }

  let incomingId: String?
  let reason: String
  let ownsSession: Bool
  /// Main thread: what the call screen is told (RelayHub reads these when it reports).
  private(set) var phase = Phase.connecting
  private(set) var callId: String?
  private(set) var problem: String?
  /// Main thread: loudspeaker wanted. A call started in the app opens on the speaker, one answered on the system
  /// call screen on the earpiece.
  private(set) var speaker: Bool
  /// Main thread callbacks.
  var onState: (() -> Void)?
  var onLevel: ((Double) -> Void)?
  var muted = false

  private let url: URL
  private let token: String
  private let q = DispatchQueue(label: "nora.relay")
  private var session: URLSession?
  private var socket: URLSessionWebSocketTask?
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let wire = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
  private let voice = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24000, channels: 1, interleaved: false)!
  private var speakerFormat: AVAudioFormat?
  private var micConverter: AVAudioConverter?
  private var speakerConverter: AVAudioConverter?
  private var audioOn = false
  private var sessionOn = false
  private var streaming = false
  private var opened = false
  private var stopped = false
  private var socketClosed = false
  private var interrupted = false
  private var lastProblem: String?
  private var waiting: [Data] = []
  private var openWaiters: [(String?) -> Void] = []
  private var stats = ["got": 0, "scheduled": 0, "played": 0, "sent": 0, "restarts": 0]
  private var statsTimer: DispatchSourceTimer?
  private var observers: [NSObjectProtocol] = []
  private var levelAt: CFAbsoluteTime = 0
  private var levelSent: Double = 0

  init(url: URL, token: String, incomingId: String?, reason: String, ownsSession: Bool) {
    self.url = url
    self.token = token
    self.incomingId = incomingId
    self.reason = reason
    self.ownsSession = ownsSession
    self.speaker = ownsSession
    super.init()
  }

  func connect() {
    var c = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let items = [URLQueryItem(name: "incomingId", value: incomingId), URLQueryItem(name: "reason", value: reason)]
      .filter { !($0.value ?? "").isEmpty }
    c?.queryItems = items.isEmpty ? nil : items
    guard let full = c?.url else { return end("The PC's address is wrong. Sign in again on this phone.") }
    var req = URLRequest(url: full)
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("native", forHTTPHeaderField: "X-Client")
    let ops = OperationQueue()
    ops.maxConcurrentOperationCount = 1
    let s = URLSession(configuration: .default, delegate: self, delegateQueue: ops)
    let ws = s.webSocketTask(with: req)
    ws.maximumMessageSize = 8 << 20
    session = s
    socket = ws
    ws.resume()
    receive()
    startStats()
  }

  /// Calls back once the socket is open (nil), or with why it never will.
  func whenOpen(_ done: @escaping (String?) -> Void) {
    q.async {
      if self.opened { done(nil) } else if self.stopped { done(self.lastProblem ?? "The call ended.") } else { self.openWaiters.append(done) }
    }
  }

  /// The audio session is on (CallKit activated it, or this call sets it up itself): start the mic and the speaker.
  func audioReady() {
    let wantSpeaker = speaker
    q.async {
      guard !self.audioOn, !self.stopped else { return }
      do {
        if self.ownsSession { try self.activateSession(speaker: wantSpeaker) }
        try self.startAudio()
        if self.observers.isEmpty { self.observe() }
      } catch {
        self.end("The microphone didn't start.")
      }
    }
  }

  /// CallKit turned the audio session off (the call ended, or another call took the audio).
  func audioStopped() {
    q.async { self.stopAudio() }
  }

  /// Loudspeaker on, or the earpiece / headset. Main thread.
  func setSpeaker(_ on: Bool) {
    speaker = on
    q.async {
      guard self.audioOn else { return }
      try? AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }
  }

  /// Hung up on the phone: tell the PC, then let go of the socket and the audio.
  func stop() {
    q.async {
      guard !self.stopped else { return }
      self.stopped = true
      self.sendStats()
      self.send(["type": "end"]) { [weak self] in self?.q.async { self?.closeSocket() } }
      self.q.asyncAfter(deadline: .now() + 1) { self.closeSocket() }
      self.teardown(closing: false)
      self.flushWaiters("The call ended before it connected.")
      self.report(.ended, problem: nil)
    }
  }

  /// It can't go on (no microphone): end it with why.
  func fail(_ problem: String) {
    end(problem)
  }

  // MARK: Socket

  private func receive() {
    socket?.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure:
        self.q.async { self.end(self.opened ? "The call dropped." : self.unreachable()) }
      case .success(let message):
        if case .string(let text) = message { self.handle(text) }
        self.receive()
      }
    }
  }

  private func handle(_ text: String) {
    guard let data = text.data(using: .utf8),
          let m = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = m["type"] as? String else { return }
    switch type {
    case "ready":
      let id = m["callId"] as? String
      q.async {
        guard !self.stopped else { return }
        self.streaming = true
        self.report(.ready, callId: id, problem: nil)
      }
    case "audio":
      if let b64 = m["data"] as? String, let pcm = Data(base64Encoded: b64) {
        q.async {
          self.stats["got", default: 0] += 1
          if self.audioOn { self.schedule(pcm) } else { self.waiting.append(pcm) }
        }
      }
    case "clear":
      // He started talking: drop what Nora hasn't said yet.
      q.async {
        self.waiting.removeAll()
        guard self.audioOn else { return }
        self.player.stop()
        self.player.play()
      }
    case "error":
      end(m["message"] as? String ?? "Something went wrong on the PC.")
    case "end":
      end(nil)
    default:
      break
    }
  }

  private func send(_ obj: [String: Any], done: (() -> Void)? = nil) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj), let text = String(data: data, encoding: .utf8) else { return }
    socket?.send(.string(text)) { _ in done?() }
  }

  /// Why the socket never opened, from the PC's answer when there was one.
  private func unreachable() -> String {
    let code = (socket?.response as? HTTPURLResponse)?.statusCode ?? 0
    if code == 401 || code == 403 { return "Sign in again on this phone, then call again." }
    if code >= 500 { return "The PC couldn't take the call. Try again." }
    return "Couldn't reach your PC. Check that it's on and online."
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    q.async {
      self.opened = true
      self.flushWaiters(nil)
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                  didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    end(nil)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard error != nil else { return }
    q.async { self.end(self.opened ? "The call dropped." : self.unreachable()) }
  }

  // MARK: Audio

  private func activateSession(speaker: Bool) throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    try s.setActive(true)
    sessionOn = true
    try? s.overrideOutputAudioPort(speaker ? .speaker : .none)
  }

  private func startAudio() throws {
    let input = engine.inputNode
    if !input.isVoiceProcessingEnabled { try input.setVoiceProcessingEnabled(true) }
    let hw = engine.outputNode.inputFormat(forBus: 0)
    let rate = hw.sampleRate > 0 ? hw.sampleRate : 48000
    let out = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
    speakerFormat = out
    speakerConverter = AVAudioConverter(from: voice, to: out)
    if player.engine == nil { engine.attach(player) }
    engine.connect(player, to: engine.mainMixerNode, format: out)
    engine.mainMixerNode.outputVolume = 1
    player.volume = 1
    let micFormat = input.outputFormat(forBus: 0)
    micConverter = AVAudioConverter(from: micFormat, to: wire)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 2400, format: micFormat) { [weak self] buf, _ in self?.capture(buf) }
    player.removeTap(onBus: 0)
    player.installTap(onBus: 0, bufferSize: 2048, format: nil) { [weak self] buf, _ in self?.meter(buf) }
    engine.prepare()
    try engine.start()
    player.play()
    audioOn = true
    for pcm in waiting { schedule(pcm) }
    waiting.removeAll()
  }

  private func observe() {
    let nc = NotificationCenter.default
    // iOS rebuilt the audio route (speaker, Bluetooth, a headset): start again on the new one.
    observers.append(nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
      self?.q.async { self?.restartAudio() }
    })
    guard ownsSession else { return }
    // A call he started in the app has no CallKit to hand the audio back after an interruption (a phone call).
    observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
      let ended = (n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.ended.rawValue
      self?.q.async {
        self?.interrupted = !ended
        if ended { self?.restartAudio(force: true) }
      }
    })
  }

  private func restartAudio(force: Bool = false) {
    guard audioOn || force, !stopped, !interrupted else { return }
    stats["restarts", default: 0] += 1
    stopAudio()
    do {
      if ownsSession && force { try AVAudioSession.sharedInstance().setActive(true) }
      try startAudio()
    } catch {
      end("The audio route changed and didn't come back.")
      return
    }
    let onSpeaker = AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
    DispatchQueue.main.async { self.speaker = onSpeaker }
  }

  private func capture(_ buf: AVAudioPCMBuffer) {
    guard streaming, !muted, let micConverter else { return }
    let capacity = AVAudioFrameCount(Double(buf.frameLength) * wire.sampleRate / buf.format.sampleRate) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: wire, frameCapacity: capacity) else { return }
    var fed = false
    var error: NSError?
    _ = micConverter.convert(to: out, error: &error) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true
      status.pointee = .haveData
      return buf
    }
    guard error == nil, out.frameLength > 0, let ch = out.int16ChannelData else { return }
    send(["type": "audio", "data": Data(bytes: ch[0], count: Int(out.frameLength) * 2).base64EncodedString()])
    q.async { self.stats["sent", default: 0] += 1 }
  }

  /// Her voice's loudness as it plays, about ten times a second, for the call screen's sphere.
  private func meter(_ buf: AVAudioPCMBuffer) {
    let now = CFAbsoluteTimeGetCurrent()
    let n = Int(buf.frameLength)
    guard now - levelAt >= 0.1, n > 0, let ch = buf.floatChannelData?[0] else { return }
    levelAt = now
    var sum: Float = 0
    for i in 0..<n { sum += ch[i] * ch[i] }
    let level = min(1, Double((sum / Float(n)).squareRoot()) * 6)
    guard level > 0.005 || levelSent > 0.005 else { return } // silence once, not ten times a second
    levelSent = level
    DispatchQueue.main.async { self.onLevel?(level) }
  }

  /// Her 24 kHz 16 bit audio, converted to the speaker's rate and queued on the player. Runs on q.
  private func schedule(_ pcm: Data) {
    let frames = pcm.count / 2
    guard frames > 0, let speakerFormat, let speakerConverter,
          let src = AVAudioPCMBuffer(pcmFormat: voice, frameCapacity: AVAudioFrameCount(frames)),
          let f = src.floatChannelData?[0] else { return }
    src.frameLength = AVAudioFrameCount(frames)
    pcm.withUnsafeBytes { raw in
      let samples = raw.bindMemory(to: Int16.self)
      for i in 0..<frames { f[i] = Float(Int16(littleEndian: samples[i])) / 32768 }
    }
    let capacity = AVAudioFrameCount(Double(frames) * speakerFormat.sampleRate / voice.sampleRate) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: speakerFormat, frameCapacity: capacity) else { return }
    var fed = false
    var error: NSError?
    _ = speakerConverter.convert(to: out, error: &error) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true
      status.pointee = .haveData
      return src
    }
    guard error == nil, out.frameLength > 0 else { return }
    stats["scheduled", default: 0] += 1
    player.scheduleBuffer(out) { [weak self] in self?.q.async { self?.stats["played", default: 0] += 1 } }
    if !player.isPlaying { player.play() }
  }

  private func stopAudio() {
    guard audioOn else { return }
    audioOn = false
    engine.inputNode.removeTap(onBus: 0)
    player.removeTap(onBus: 0)
    player.stop()
    engine.stop()
    if levelSent > 0 {
      levelSent = 0
      DispatchQueue.main.async { self.onLevel?(0) }
    }
  }

  // MARK: Diagnostics: the phone's side of the call, in the PC's server log.

  private func startStats() {
    let t = DispatchSource.makeTimerSource(queue: q)
    t.schedule(deadline: .now() + 3, repeating: 4)
    t.setEventHandler { [weak self] in self?.sendStats() }
    t.resume()
    statsTimer = t
  }

  private func sendStats() {
    let s = AVAudioSession.sharedInstance()
    var out: [String: Any] = stats
    out["type"] = "stats"
    out["audioOn"] = audioOn
    out["engine"] = engine.isRunning
    out["playing"] = player.isPlaying
    out["route"] = s.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
    out["mode"] = s.mode.rawValue
    out["category"] = s.category.rawValue
    out["volume"] = s.outputVolume
    out["speakerRate"] = speakerFormat?.sampleRate ?? 0
    out["vp"] = engine.inputNode.isVoiceProcessingEnabled
    out["owner"] = ownsSession ? "app" : "callkit"
    send(out)
  }

  // MARK: Ending

  /// Runs on q. The socket stays set (the mic tap may still read it), it's only closed.
  private func closeSocket() {
    guard !socketClosed else { return }
    socketClosed = true
    socket?.cancel(with: .normalClosure, reason: nil)
    session?.finishTasksAndInvalidate()
  }

  /// Runs on q.
  private func teardown(closing: Bool) {
    statsTimer?.cancel()
    statsTimer = nil
    for o in observers { NotificationCenter.default.removeObserver(o) }
    observers.removeAll()
    stopAudio()
    waiting.removeAll()
    if sessionOn {
      sessionOn = false
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    if closing { closeSocket() }
  }

  private func flushWaiters(_ problem: String?) {
    let w = openWaiters
    openWaiters.removeAll()
    for done in w { done(problem) }
  }

  /// Runs on q: hands the new state to the main thread and the call screen.
  private func report(_ phase: Phase, callId: String? = nil, problem: String?) {
    DispatchQueue.main.async {
      guard self.phase != .ended else { return }
      self.phase = phase
      if let callId { self.callId = callId }
      self.problem = problem
      self.onState?()
    }
  }

  /// The other side ended, or it failed: tear down and report once.
  private func end(_ problem: String?) {
    q.async {
      guard !self.stopped else { return }
      self.stopped = true
      self.lastProblem = problem
      self.sendStats()
      self.teardown(closing: true)
      self.flushWaiters(problem ?? "The call ended before it connected.")
      self.report(.ended, problem: problem)
    }
  }
}
