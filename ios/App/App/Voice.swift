import AVFoundation
import Capacitor
import CoreMedia
import Speech

// MARK: The call's audio, whichever path carries it

/// What CallManager drives: the OpenAI realtime relay (NoraRelay) or the free on-device loop (VoiceLoop).
protocol CallAudio: AnyObject {
    var onReady: (() -> Void)? { get set }
    var onEnd: ((String?) -> Void)? { get set }
    var muted: Bool { get set }
    func connect()
    func audioReady()
    func audioStopped()
    func stop()
}

extension NoraRelay: CallAudio {}

enum VoiceMode {
    /// True when a call should use OpenAI realtime through the PC (a funded key is set there); false for the free
    /// loop. A VoIP push can say which ("voice": "free" | "realtime"); else the PC is asked.
    static func realtime(hint: String?) async -> Bool {
        if hint == "realtime" { return true }
        if hint == "free" { return false }
        let (code, data) = await Shared.request("/nora/voice-mode", timeout: 4)
        if code == 200 { return (Shared.json(data)?["realtime"] as? Bool) ?? false }
        // A PC without the free path (it predates /nora/voice-turn): the realtime relay, as before 2.0.0.
        if code == 404 { return true }
        return false
    }
}

/// One CallKit call's audio: picks the path when the call connects, then forwards CallKit's audio events to it.
final class CallLine: CallAudio {
    var onReady: (() -> Void)?
    var onEnd: ((String?) -> Void)?
    var muted = false { didSet { inner?.muted = muted } }
    private let incomingId: String?
    private let reason: String
    private let hint: String?
    private var inner: CallAudio?
    private var ready = false
    private var stopped = false

    init(incomingId: String?, reason: String, hint: String?) {
        self.incomingId = incomingId
        self.reason = reason
        self.hint = hint
    }

    func connect() {
        let hint = self.hint
        Task {
            let realtime = await VoiceMode.realtime(hint: hint)
            DispatchQueue.main.async { self.begin(realtime: realtime) }
        }
    }

    private func begin(realtime: Bool) {
        guard !stopped else { return }
        let a: CallAudio = realtime ? NoraRelay(incomingId: incomingId, reason: reason)
                                    : VoiceLoop(incomingId: incomingId, reason: reason, callKit: true)
        a.onReady = { [weak self] in self?.onReady?() }
        a.onEnd = { [weak self] problem in self?.onEnd?(problem) }
        a.muted = muted
        inner = a
        a.connect()
        if ready { a.audioReady() }
    }

    func audioReady() { ready = true; inner?.audioReady() }
    func audioStopped() { ready = false; inner?.audioStopped() }
    func stop() { stopped = true; inner?.stop() }
}

// MARK: Hearing (speech to text on the phone)

protocol Hearing: AnyObject {
    /// The text of the current turn so far (it grows and gets corrected as he talks).
    var onText: ((String) -> Void)? { get set }
    func start(format: AVAudioFormat) throws
    /// Mic audio, from the tap thread.
    func feed(_ buf: AVAudioPCMBuffer)
    /// Forget what was heard; the next text starts a new turn.
    func nextTurn()
    func stop()
}

/// SFSpeechRecognizer, on device where the language allows it. A task per stretch of speech; when one ends by
/// itself (the time limit, a long pause) the next starts and the turn's text carries over.
final class SFHearing: Hearing {
    var onText: ((String) -> Void)?
    private let recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var committed = ""
    private var latest = ""
    private var gen = 0
    private let lock = NSLock()

    init(locale: Locale) {
        recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
    }

    func start(format: AVAudioFormat) throws {
        guard let r = recognizer, r.isAvailable else { throw FlowError("Speech recognition isn't available right now.") }
        begin()
    }

    private func begin() {
        guard let recognizer else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        req.addsPunctuation = true
        req.taskHint = .dictation
        let g: Int = lock.withLock {
            gen += 1
            request = req
            latest = ""
            return gen
        }
        let t = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            guard self.lock.withLock({ self.gen }) == g else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                let all: String = self.lock.withLock {
                    self.latest = text
                    return [self.committed, text].filter { !$0.isEmpty }.joined(separator: " ")
                }
                self.onText?(all)
            }
            if error != nil || result?.isFinal == true {
                self.lock.withLock {
                    if !self.latest.isEmpty {
                        self.committed = [self.committed, self.latest].filter { !$0.isEmpty }.joined(separator: " ")
                        self.latest = ""
                    }
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { [weak self] in
                    guard let self, self.lock.withLock({ self.gen }) == g else { return }
                    self.begin()
                }
            }
        }
        lock.withLock { task = t }
    }

    func feed(_ buf: AVAudioPCMBuffer) {
        let r = lock.withLock { request }
        r?.append(buf)
    }

    func nextTurn() {
        let old: (SFSpeechAudioBufferRecognitionRequest?, SFSpeechRecognitionTask?) = lock.withLock {
            let o = (request, task)
            request = nil
            task = nil
            committed = ""
            latest = ""
            gen += 1
            return o
        }
        old.0?.endAudio()
        old.1?.cancel()
        begin()
    }

    func stop() {
        let old: (SFSpeechAudioBufferRecognitionRequest?, SFSpeechRecognitionTask?) = lock.withLock {
            gen += 1
            let o = (request, task)
            request = nil
            task = nil
            return o
        }
        old.0?.endAudio()
        old.1?.cancel()
    }
}

/// iOS 26's SpeechAnalyzer with SpeechTranscriber (better on long, natural speech). Used only when the on-device
/// model for the language is installed; otherwise it starts the download for next time and SFHearing is used.
@available(iOS 26.0, *)
final class AnalyzerHearing: Hearing {
    var onText: ((String) -> Void)?
    private let transcriber: SpeechTranscriber
    private let analyzer: SpeechAnalyzer
    private let target: AVAudioFormat
    private var converter: AVAudioConverter?
    private var input: AsyncStream<AnalyzerInput>.Continuation?
    private var results: Task<Void, Never>?
    private let lock = NSLock()
    private var fedFrames: Double = 0
    private var boundary: Double = 0
    private var finals: [String] = []
    private var volatile = ""

    private init(transcriber: SpeechTranscriber, analyzer: SpeechAnalyzer, target: AVAudioFormat) {
        self.transcriber = transcriber
        self.analyzer = analyzer
        self.target = target
    }

    static func make(locale: Locale, format: AVAudioFormat) async -> AnalyzerHearing? {
        guard SpeechTranscriber.isAvailable,
              let loc = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { return nil }
        let t = SpeechTranscriber(locale: loc, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults],
                                  attributeOptions: [])
        let status = await AssetInventory.status(forModules: [t])
        guard status == .installed else {
            if status == .supported || status == .downloading {
                Task.detached {
                    if let req = try? await AssetInventory.assetInstallationRequest(supporting: [t]) { try? await req.downloadAndInstall() }
                }
            }
            return nil
        }
        guard let target = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [t], considering: format) else { return nil }
        return AnalyzerHearing(transcriber: t, analyzer: SpeechAnalyzer(modules: [t]), target: target)
    }

    func start(format: AVAudioFormat) throws {
        guard let c = AVAudioConverter(from: format, to: target) else { throw FlowError("The audio format isn't supported.") }
        converter = c
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        input = cont
        let t = transcriber, a = analyzer
        results = Task { [weak self] in
            do {
                for try await r in t.results { self?.take(r) }
            } catch {}
        }
        Task { try? await a.start(inputSequence: stream) }
    }

    private func take(_ r: SpeechTranscriber.Result) {
        let start = r.range.start.seconds
        let text = String(r.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
        let out: String? = lock.withLock {
            guard start.isFinite, start >= boundary - 0.05 else { return nil }
            if r.isFinal {
                if !text.isEmpty { finals.append(text) }
                volatile = ""
            } else {
                volatile = text
            }
            return (finals + [volatile]).filter { !$0.isEmpty }.joined(separator: " ")
        }
        if let out, !out.isEmpty { onText?(out) }
    }

    func feed(_ buf: AVAudioPCMBuffer) {
        guard let converter, let input else { return }
        let cap = AVAudioFrameCount(Double(buf.frameLength) * target.sampleRate / buf.format.sampleRate) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: cap) else { return }
        var fed = false
        var err: NSError?
        _ = converter.convert(to: out, error: &err) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buf
        }
        guard err == nil, out.frameLength > 0 else { return }
        lock.withLock { fedFrames += Double(out.frameLength) }
        input.yield(AnalyzerInput(buffer: out))
    }

    func nextTurn() {
        lock.withLock {
            boundary = fedFrames / target.sampleRate
            finals = []
            volatile = ""
        }
    }

    func stop() {
        input?.finish()
        input = nil
        results?.cancel()
        let a = analyzer
        Task { await a.cancelAndFinishNow() }
    }
}

// MARK: The free voice loop

/// His speech becomes text on the phone, the PC answers with her brain on his subscription (/nora/voice-turn),
/// and her reply is spoken on the phone through this engine's player, so the voice-processing echo canceller
/// removes her voice from the mic and he can cut her off by talking. Used inside CallKit calls and in the app.
final class VoiceLoop: NSObject, CallAudio {
    var onReady: (() -> Void)?
    var onEnd: ((String?) -> Void)?
    var muted = false

    private let incomingId: String?
    private let reason: String
    private let callKit: Bool
    private let localeId: String
    private let voiceId: String?
    private var callId: String?

    private let q = DispatchQueue(label: "voice.loop")
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var outFormat: AVAudioFormat?
    private let hearLock = NSLock()
    private var hearingRef: Hearing?
    private var hearing: Hearing? {
        get { hearLock.withLock { hearingRef } }
        set { hearLock.withLock { hearingRef = newValue } }
    }
    private let synth = AVSpeechSynthesizer()
    private var ttsConverter: AVAudioConverter?
    private var ttsSource: AVAudioFormat?

    private var state = "connecting"     // connecting, listening, thinking, speaking, ended
    private var audioOn = false
    private var stopped = false
    private var heard = ""
    private var heardAt = Date.distantPast
    private var turnStarted: Date?
    private var silence: DispatchSourceTimer?
    private var queued: (text: String, end: Bool)?
    private var speakGen = 0
    private var pendingBuffers = 0
    private var writing = false
    private var endAfterSpeaking = false
    private var failures = 0
    private var thinking: DispatchSourceTimer?
    private var blip: AVAudioPCMBuffer?
    private var lastLevel = Date.distantPast
    private var configObserver: NSObjectProtocol?

    init(incomingId: String?, reason: String, callKit: Bool, locale: String = "en-IN", voice: String? = nil) {
        self.incomingId = incomingId
        self.reason = reason
        self.callKit = callKit
        self.localeId = locale
        self.voiceId = voice
        super.init()
    }

    // MARK: CallAudio

    /// Asks the PC to start the call; her opening line comes back with the call id.
    func connect() {
        emit(["state": "connecting"])
        var body: [String: Any] = ["callId": NSNull(), "start": true, "reason": reason, "native": callKit]
        if let incomingId { body["incomingId"] = incomingId }
        Task { [body] in
            let (code, data) = await Shared.send("/nora/voice-turn", body: body, timeout: 90)
            self.q.async {
                guard !self.stopped else { return }
                guard (200..<300).contains(code), let j = Shared.json(data) else {
                    return self.finish(code == 0 ? "Couldn't reach your PC." :
                                        code == 404 ? "Your PC doesn't have free calls yet. Update the server." :
                                        "Your PC couldn't start the call (\(code)).")
                }
                self.callId = j["callId"] as? String
                DispatchQueue.main.async { self.onReady?() }
                let reply = (j["reply"] as? String) ?? ""
                let end = (j["end"] as? Bool) ?? false
                if self.audioOn { self.reply(reply, end: end) } else { self.queued = (reply, end) }
            }
        }
    }

    /// The audio session is on (CallKit activated it, or the app did): start the mic, the player and hearing.
    func audioReady() {
        q.async {
            guard !self.audioOn, !self.stopped else { return }
            guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
                return self.finish("Open Agentic OS once and allow speech recognition, so free calls can hear you.")
            }
            do { try self.startAudio() } catch { return self.finish("The microphone didn't start.") }
            self.configObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: self.engine, queue: nil) { [weak self] _ in
                self?.q.async { self?.restartAudio() }
            }
            if let r = self.queued {
                self.queued = nil
                self.reply(r.text, end: r.end)
            } else if self.callId != nil {
                self.listen()
            }
        }
    }

    func audioStopped() {
        q.async { self.stopAudio() }
    }

    /// He hung up.
    func stop() {
        q.async {
            guard !self.stopped else { return }
            self.stopped = true
            let id = self.callId
            Task { await Shared.send("/nora/voice-turn", body: ["callId": id ?? NSNull(), "hangup": true], timeout: 10) }
            self.teardown()
            self.emit(["state": "ended"], retain: true)
        }
    }

    // MARK: Audio

    private func startAudio() throws {
        let input = engine.inputNode
        if !input.isVoiceProcessingEnabled { try input.setVoiceProcessingEnabled(true) }
        let hw = engine.outputNode.inputFormat(forBus: 0)
        let rate = hw.sampleRate > 0 ? hw.sampleRate : 48000
        guard let out = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { throw FlowError("No audio format.") }
        outFormat = out
        if player.engine == nil { engine.attach(player) }
        engine.connect(player, to: engine.mainMixerNode, format: out)
        engine.mainMixerNode.outputVolume = 1
        let micFormat = input.outputFormat(forBus: 0)
        guard micFormat.sampleRate > 0 else { throw FlowError("No microphone input.") }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: micFormat) { [weak self] buf, _ in self?.mic(buf) }
        engine.prepare()
        try engine.start()
        player.play()
        audioOn = true
        blip = VoiceLoop.makeBlip(out)
        if hearing == nil { startHearing(micFormat) }
    }

    private func restartAudio() {
        guard audioOn, !stopped else { return }
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        audioOn = false
        ttsConverter = nil
        do { try startAudio() } catch { finish("The audio route changed and didn't come back.") }
        if state == "speaking" { interrupt(); listen() }
    }

    private func stopAudio() {
        guard audioOn else { return }
        audioOn = false
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
    }

    private func startHearing(_ format: AVAudioFormat) {
        let locale = Locale(identifier: localeId)
        let useAnalyzer = UserDefaults.standard.object(forKey: "voice.analyzer") as? Bool ?? true
        if #available(iOS 26.0, *), useAnalyzer {
            Task {
                let made = await AnalyzerHearing.make(locale: locale, format: format)
                self.q.async {
                    if let made { self.attach(made, format) } else { self.attach(SFHearing(locale: locale), format) }
                }
            }
        } else {
            attach(SFHearing(locale: locale), format)
        }
    }

    private func attach(_ h: Hearing, _ format: AVAudioFormat) {
        guard !stopped else { h.stop(); return }
        h.onText = { [weak self] text in self?.q.async { self?.heardText(text) } }
        do {
            try h.start(format: format)
            hearing = h
        } catch {
            if h is SFHearing { return finish("Speech recognition isn't available right now.") }
            attach(SFHearing(locale: Locale(identifier: localeId)), format)
        }
    }

    /// Mic audio (tap thread): to hearing, and a level for the orb.
    private func mic(_ buf: AVAudioPCMBuffer) {
        guard !muted else { return }
        hearing?.feed(buf)
        let now = Date()
        if now.timeIntervalSince(lastLevel) > 0.08 {
            lastLevel = now
            let lvl = VoiceLoop.level(buf)
            q.async { if self.state == "listening" || self.state == "thinking" { self.emit(["state": self.state, "level": lvl]) } }
        }
    }

    static func level(_ buf: AVAudioPCMBuffer) -> Double {
        guard let ch = buf.floatChannelData?[0], buf.frameLength > 0 else { return 0 }
        var sum: Float = 0
        let n = Int(buf.frameLength)
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(n))
        let db = 20 * log10(max(rms, 0.000_01))
        return Double(min(max((db + 55) / 50, 0), 1) * 100).rounded() / 100
    }

    // MARK: Turns

    private func heardText(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !stopped else { return }
        if state == "speaking" {
            // Two words over her voice is him, not her echo: stop her and listen.
            guard t.split(separator: " ").count >= 2 else { return }
            interrupt()
            state = "listening"
        }
        heard = t
        heardAt = Date()
        if turnStarted == nil { turnStarted = Date() }
        emit(["state": state, "heard": ["text": t, "final": false]])
        armSilence()
    }

    private func armSilence() {
        silence?.cancel()
        let t = DispatchSource.makeTimerSource(queue: q)
        let wait = heard.hasSuffix("?") || heard.hasSuffix(".") ? 0.9 : 1.25
        t.schedule(deadline: .now() + wait)
        t.setEventHandler { [weak self] in self?.silenceFired() }
        silence = t
        t.resume()
    }

    private func silenceFired() {
        guard !stopped, !heard.isEmpty else { return }
        let quiet = Date().timeIntervalSince(heardAt) >= 0.85
        let long = (turnStarted.map { Date().timeIntervalSince($0) } ?? 0) > 25
        if state == "listening", quiet || long { finishTurn() }
        else if state != "listening" { armSilence() }
    }

    private func finishTurn() {
        let text = heard
        heard = ""
        turnStarted = nil
        silence?.cancel()
        hearing?.nextTurn()
        state = "thinking"
        emit(["state": "thinking", "heard": ["text": text, "final": true]])
        startThinking()
        let id = callId
        Task {
            let (code, data) = await Shared.send("/nora/voice-turn", body: ["callId": id ?? NSNull(), "text": text], timeout: 90)
            self.q.async {
                self.stopThinking()
                guard !self.stopped else { return }
                if (200..<300).contains(code), let j = Shared.json(data) {
                    self.failures = 0
                    self.reply((j["reply"] as? String) ?? "", end: (j["end"] as? Bool) ?? false)
                } else {
                    self.failures += 1
                    if self.failures >= 3 || code == 401 || code == 404 || code == 410 {
                        return self.finish(code == 0 ? "Lost your PC." : "Your PC stopped answering.")
                    }
                    self.reply(code == 0 ? "Sorry, I lost you for a second. Say that again?" : "Something went wrong on my side. Say that again?", end: false)
                }
            }
        }
    }

    private func reply(_ text: String, end: Bool) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return end ? finish(nil) : listen() }
        say(t, thenEnd: end)
    }

    private func listen() {
        guard !stopped else { return }
        state = "listening"
        emit(["state": "listening"])
        if !heard.isEmpty { armSilence() }
    }

    // MARK: Her voice

    private func say(_ text: String, thenEnd: Bool) {
        guard !stopped, audioOn, let out = outFormat else { return }
        endAfterSpeaking = thenEnd
        speakGen += 1
        let gen = speakGen
        state = "speaking"
        pendingBuffers = 0
        writing = true
        emit(["state": "speaking", "said": ["text": text]])
        let u = AVSpeechUtterance(string: text)
        u.voice = VoiceLoop.voice(for: text, preferred: voiceId)
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        u.pitchMultiplier = 1.0
        // If the synthesizer never delivers audio (a voice that isn't installed), don't hang in "speaking".
        q.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self, gen == self.speakGen, self.state == "speaking", self.pendingBuffers <= 0, self.writing else { return }
            self.writing = false
            self.checkSpoken(gen)
            self.speakGen += 1          // audio that turns up later is dropped
        }
        DispatchQueue.main.async {
            self.synth.write(u) { [weak self] buffer in
                guard let self else { return }
                guard let pcm = buffer as? AVAudioPCMBuffer, pcm.frameLength > 0 else {
                    self.q.async {
                        guard gen == self.speakGen else { return }
                        self.writing = false
                        self.checkSpoken(gen)
                    }
                    return
                }
                guard let converted = self.convertTTS(pcm, to: out) else { return }
                self.q.async {
                    guard gen == self.speakGen, self.audioOn else { return }
                    self.pendingBuffers += 1
                    self.player.scheduleBuffer(converted) { [weak self] in
                        self?.q.async {
                            guard let self, gen == self.speakGen else { return }
                            self.pendingBuffers -= 1
                            self.checkSpoken(gen)
                        }
                    }
                    if !self.player.isPlaying { self.player.play() }
                }
            }
        }
    }

    /// The synthesizer's buffer (often 22 kHz) in the player's format, copied (the synthesizer reuses its own).
    private func convertTTS(_ pcm: AVAudioPCMBuffer, to out: AVAudioFormat) -> AVAudioPCMBuffer? {
        if ttsConverter == nil || ttsSource != pcm.format {
            ttsConverter = AVAudioConverter(from: pcm.format, to: out)
            ttsSource = pcm.format
        }
        guard let conv = ttsConverter else { return nil }
        let cap = AVAudioFrameCount(Double(pcm.frameLength) * out.sampleRate / pcm.format.sampleRate) + 64
        guard let dst = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: cap) else { return nil }
        var fed = false
        var err: NSError?
        _ = conv.convert(to: dst, error: &err) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return pcm
        }
        return err == nil && dst.frameLength > 0 ? dst : nil
    }

    private func checkSpoken(_ gen: Int) {
        guard gen == speakGen, state == "speaking", !writing, pendingBuffers <= 0 else { return }
        if endAfterSpeaking { return finish(nil) }
        hearing?.nextTurn()
        heard = ""
        listen()
    }

    private func interrupt() {
        speakGen += 1
        writing = false
        pendingBuffers = 0
        DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate) }
        player.stop()
        player.play()
        emit(["state": "listening", "interrupted": true])
    }

    static func voice(for text: String, preferred: String?) -> AVSpeechSynthesisVoice? {
        if let id = preferred, let v = AVSpeechSynthesisVoice(identifier: id) { return v }
        let hindi = text.unicodeScalars.contains { (0x0900...0x097F).contains($0.value) }
        let lang = hindi ? "hi-IN" : "en-IN"
        let rank: (AVSpeechSynthesisVoice) -> Int = { v in
            let q: Int
            switch v.quality {
            case .premium: q = 30
            case .enhanced: q = 20
            default: q = 10
            }
            return q + (v.gender == .female ? 1 : 0)
        }
        let best = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == lang }.max { rank($0) < rank($1) }
        return best ?? AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: "en-US")
    }

    // MARK: Thinking

    /// Two soft notes every couple of seconds while the PC thinks, so a silent line doesn't feel dropped.
    private func startThinking() {
        stopThinking()
        let t = DispatchSource.makeTimerSource(queue: q)
        t.schedule(deadline: .now() + 1.4, repeating: 2.4)
        t.setEventHandler { [weak self] in
            guard let self, self.state == "thinking", self.audioOn, let b = self.blip else { return }
            self.player.scheduleBuffer(b, completionHandler: nil)
            if !self.player.isPlaying { self.player.play() }
        }
        thinking = t
        t.resume()
    }

    private func stopThinking() {
        thinking?.cancel()
        thinking = nil
    }

    static func makeBlip(_ format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let rate = format.sampleRate
        let note = 0.09, gap = 0.07
        let frames = AVAudioFrameCount(rate * (note * 2 + gap))
        guard let b = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let ch = b.floatChannelData?[0] else { return nil }
        b.frameLength = frames
        for i in 0..<Int(frames) {
            let t = Double(i) / rate
            var v = 0.0
            for (start, f) in [(0.0, 660.0), (note + gap, 990.0)] where t >= start && t < start + note {
                let x = t - start
                let env = sin(Double.pi * x / note)
                v = sin(2 * Double.pi * f * x) * env * env * 0.05
            }
            ch[i] = Float(v)
        }
        return b
    }

    // MARK: Ending

    /// The call is over (she ended it, or it failed). Runs on q.
    private func finish(_ problem: String?) {
        guard !stopped else { return }
        stopped = true
        teardown()
        var e: [String: Any] = ["state": "ended"]
        if let problem { e["error"] = problem }
        emit(e, retain: true)
        DispatchQueue.main.async { self.onEnd?(problem) }
    }

    private func teardown() {
        silence?.cancel()
        silence = nil
        stopThinking()
        speakGen += 1
        DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate) }
        hearing?.stop()
        hearing = nil
        if let o = configObserver { NotificationCenter.default.removeObserver(o) }
        configObserver = nil
        stopAudio()
        state = "ended"
    }

    private func emit(_ data: [String: Any], retain: Bool = false) {
        var d = data
        d["callId"] = callId ?? NSNull()
        d["native"] = callKit
        NativeHub.shared.emit("voice", d, retain: retain)
    }
}

// MARK: The plugin

/// JS: AosVoice.start({ reason?, incomingId?, locale = "en-IN", voice? }) runs the free loop in the app (the agent
/// screen shows it), stop(), mute({ muted }), call({ reason }) rings the native call screen, speak({ text, voice?, rate? }),
/// voices(), mode() -> { free, realtime }, permissions() asks for the mic and speech recognition once.
/// Event (on Native): "voice" { state, level?, heard?, said?, callId, interrupted?, error? }.
@objc(AosVoicePlugin)
public class AosVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AosVoicePlugin"
    public let jsName = "AosVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "call", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "permissions", returnType: CAPPluginReturnPromise),
    ]
    private var loop: VoiceLoop?
    private let speaker = AVSpeechSynthesizer()

    static func askPermissions(_ done: @escaping (Bool, String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { return done(false, "Speech recognition is off for Agentic OS. Turn it on in Settings.") }
            AVAudioApplication.requestRecordPermission { ok in
                done(ok, ok ? "" : "The microphone is off for Agentic OS. Turn it on in Settings.")
            }
        }
    }

    @objc func permissions(_ call: CAPPluginCall) {
        AosVoicePlugin.askPermissions { ok, why in ok ? call.ok() : call.off("denied", ["error": why]) }
    }

    @objc func start(_ call: CAPPluginCall) {
        AosVoicePlugin.askPermissions { ok, why in
            guard ok else { return call.off("denied", ["error": why]) }
            DispatchQueue.main.async {
                self.loop?.stop()
                FlowRecorder.shared.release()
                let s = AVAudioSession.sharedInstance()
                do {
                    try s.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
                    try s.setActive(true)
                } catch { return call.fail("The audio didn't start.") }
                let l = VoiceLoop(incomingId: call.text("incomingId"), reason: call.text("reason") ?? "", callKit: false,
                                  locale: call.text("locale") ?? "en-IN", voice: call.text("voice"))
                l.onEnd = { [weak self, weak l] _ in
                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    if let self, let l, self.loop === l { self.loop = nil }
                }
                self.loop = l
                l.connect()
                l.audioReady()
                call.ok(["started": true])
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.loop?.stop()
            self.loop = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.ok()
        }
    }

    @objc func mute(_ call: CAPPluginCall) {
        let muted = call.flag("muted", true)
        DispatchQueue.main.async {
            self.loop?.muted = muted
            call.ok(["muted": muted])
        }
    }

    @objc func call(_ call: CAPPluginCall) {
        let reason = call.text("reason") ?? ""
        DispatchQueue.main.async { CallManager.shared.startOutgoing(reason: reason) }
        call.ok()
    }

    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.text("text") else { return call.fail("Nothing to say.") }
        DispatchQueue.main.async {
            if self.loop == nil {
                try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try? AVAudioSession.sharedInstance().setActive(true)
            }
            let u = AVSpeechUtterance(string: text)
            u.voice = VoiceLoop.voice(for: text, preferred: call.text("voice"))
            if let r = call.number("rate") { u.rate = Float(min(max(r, 0.1), 1)) * AVSpeechUtteranceMaximumSpeechRate }
            self.speaker.speak(u)
            call.ok()
        }
    }

    @objc func voices(_ call: CAPPluginCall) {
        let list = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") || $0.language.hasPrefix("hi") }
            .map { v -> [String: Any] in
                let quality: String
                switch v.quality {
                case .premium: quality = "premium"
                case .enhanced: quality = "enhanced"
                default: quality = "default"
                }
                return ["id": v.identifier, "name": v.name, "lang": v.language, "quality": quality,
                        "gender": v.gender == .female ? "female" : v.gender == .male ? "male" : "unspecified"]
            }
        call.ok(["voices": list])
    }

    @objc func mode(_ call: CAPPluginCall) {
        Task {
            let rt = await VoiceMode.realtime(hint: nil)
            call.ok(["realtime": rt, "free": !rt])
        }
    }
}
