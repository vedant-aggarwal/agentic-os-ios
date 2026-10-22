import AVFoundation
import Foundation

/// The audio of a CallKit call with Nora. The mic goes up as 24 kHz 16-bit mono PCM over a WebSocket to the PC
/// (/api/v1/nora/relay), which relays it to OpenAI realtime and runs her tools; her voice comes back the same way.
/// Echo cancellation comes from the voice-processing I/O unit. Her 24 kHz audio is converted to the speaker's own
/// rate before it's played, and the phone reports its audio state to the PC log every few seconds.
final class NoraRelay: NSObject, URLSessionWebSocketDelegate {
    var onReady: (() -> Void)?
    var onEnd: ((String?) -> Void)?
    var muted = false

    private let incomingId: String?
    private let reason: String
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
    private var streaming = false
    private var stopped = false
    private var waiting: [Data] = []
    private var stats = ["got": 0, "scheduled": 0, "played": 0, "sent": 0, "restarts": 0]
    private var statsTimer: DispatchSourceTimer?
    private var configObserver: NSObjectProtocol?

    init(incomingId: String?, reason: String) {
        self.incomingId = incomingId
        self.reason = reason
        super.init()
    }

    func connect() {
        guard let token = Shared.token else { return end("Open Agentic OS and sign in first.") }
        var c = URLComponents(string: Shared.base.replacingOccurrences(of: "https://", with: "wss://") + "/api/v1/nora/relay")!
        let items = [URLQueryItem(name: "incomingId", value: incomingId), URLQueryItem(name: "reason", value: reason)]
            .filter { !($0.value ?? "").isEmpty }
        c.queryItems = items.isEmpty ? nil : items
        guard let url = c.url else { return end("Bad address.") }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
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

    /// CallKit turned the audio session on: start the mic and the speaker.
    func audioReady() {
        q.async {
            guard !self.audioOn, !self.stopped else { return }
            do {
                try self.startAudio()
                self.configObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: self.engine, queue: nil) { [weak self] _ in
                    // iOS rebuilt the audio route (speaker, Bluetooth, a route change): start again on the new one.
                    self?.q.async { self?.restartAudio() }
                }
            } catch {
                self.end("The microphone didn't start.")
            }
        }
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
        engine.prepare()
        try engine.start()
        player.play()
        audioOn = true
        for pcm in waiting { schedule(pcm) }
        waiting.removeAll()
    }

    private func restartAudio() {
        guard audioOn, !stopped else { return }
        stats["restarts", default: 0] += 1
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        audioOn = false
        do { try startAudio() } catch { end("The audio route changed and didn't come back.") }
    }

    func audioStopped() {
        q.async { self.stopAudio() }
    }

    /// Hung up on the phone.
    func stop() {
        q.async {
            guard !self.stopped else { return }
            self.stopped = true
            self.sendStats()
            self.teardown()
        }
    }

    // MARK: Socket

    private func receive() {
        socket?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.end(nil)
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
            q.async { self.streaming = true }
            DispatchQueue.main.async { self.onReady?() }
        case "audio":
            if let b64 = m["data"] as? String, let pcm = Data(base64Encoded: b64) {
                q.async {
                    self.stats["got", default: 0] += 1
                    if self.audioOn { self.schedule(pcm) } else { self.waiting.append(pcm) }
                }
            }
        case "clear":
            // They started talking: drop what Nora hasn't said yet.
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

    private func send(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj), let text = String(data: data, encoding: .utf8) else { return }
        socket?.send(.string(text)) { _ in }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        end(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil { end("Couldn't reach your PC.") }
    }

    // MARK: Audio

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

    /// Her 24 kHz 16-bit audio, converted to the speaker's rate and queued on the player. Runs on q.
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
        player.stop()
        engine.stop()
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
        send(out)
    }

    private func teardown() {
        statsTimer?.cancel()
        statsTimer = nil
        if let o = configObserver { NotificationCenter.default.removeObserver(o) }
        configObserver = nil
        stopAudio()
        socket?.cancel(with: .normalClosure, reason: nil)
        session?.finishTasksAndInvalidate()
    }

    /// The other side ended, or it failed: tear down and tell CallKit once.
    private func end(_ problem: String?) {
        q.async {
            guard !self.stopped else { return }
            self.stopped = true
            self.sendStats()
            self.teardown()
            DispatchQueue.main.async { self.onEnd?(problem) }
        }
    }
}
