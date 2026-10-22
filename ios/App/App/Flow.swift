import AVFoundation
import UIKit

/// Dictation for the keyboard (keyboards can't use the microphone): the keyboard opens agenticos://flow?id=<uuid>,
/// the app records here, in the background if needed, and uploads 2 s chunks to /voice as it goes, so nothing is
/// lost if the app dies. Start and stop come from the keyboard as Darwin notifications (FlowSignal); the state the
/// keyboard reads lives in Shared.flow. After a dictation the microphone stays open for 5 minutes, so the next one
/// starts from the keyboard without switching apps.
///
/// Audio: 16 kHz mono 16-bit WAV. Chunk 0 starts with the header; its sizes are written when the recording ends
/// (chunk 0 is uploaded again then), so the joined chunks are always a plain WAV file.
final class FlowRecorder {
    static let shared = FlowRecorder()

    private let engine = AVAudioEngine()
    private let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    private let q = DispatchQueue(label: "flow.audio")
    private var converter: AVAudioConverter?
    private var listener: FlowListener?
    private var running = false
    private var warmTimer: Timer?
    private var take: Take?            // touched on q
    private var overlay: FlowOverlay?
    private var lastOpen = Date.distantPast
    private static let warmFor: TimeInterval = 300

    /// From didFinishLaunching.
    func observe() {
        listener = FlowListener([.start, .stop, .cancel]) { [weak self] signal in
            guard let self else { return }
            switch signal {
            case .start: if let id = Shared.flowRequest { self.start(id) }
            case .stop: self.stop(discard: false)
            case .cancel: self.stop(discard: true)
            case .changed: break
            }
        }
        // A dictation the app was killed during: say so, so the keyboard stops waiting. The audio stays on the PC.
        if var f = Shared.flow, f.live {
            f.state = "failed"
            f.error = "The recording was interrupted. Retry it in Settings > Voice recordings."
            f.warmUntil = 0
            publish(f)
        }
    }

    /// agenticos://flow?id=<uuid>. True when the URL was a dictation request.
    func handle(_ url: URL) -> Bool {
        guard url.scheme == "agenticos", url.host == "flow" else { return false }
        let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "id" }?.value
        lastOpen = Date()
        start(id ?? UUID().uuidString, opened: true)
        return true
    }

    /// The app came to the front on its own: give the microphone back unless a dictation is running.
    func enteredForeground() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            guard Date().timeIntervalSince(self.lastOpen) > 3 else { return }
            self.q.async {
                guard self.take == nil else { return }
                DispatchQueue.main.async { self.release() }
            }
        }
    }

    /// Someone else needs the audio session (Nora's call, the Ask bar's speech): stop listening now.
    func release() {
        warmTimer?.invalidate()
        warmTimer = nil
        q.sync { take?.cancel(); take = nil }
        stopEngine()
        if var f = Shared.flow, f.warmUntil > 0 {
            if f.live { f.state = "failed"; f.error = "Stopped: another app or call took the microphone." }
            f.warmUntil = 0
            publish(f)
        }
        overlay?.hide()
    }

    // MARK: Start and stop

    private func start(_ id: String, opened: Bool = false) {
        if Shared.flow?.id == id, Shared.flow?.live == true { if opened { showOverlay() }; return }
        Shared.flowRequest = nil
        switch AVAudioApplication.shared.recordPermission {
        case .granted: begin(id, opened: opened)
        case .undetermined:
            AVAudioApplication.requestRecordPermission { ok in
                DispatchQueue.main.async { ok ? self.begin(id, opened: opened) : self.fail(id, "Allow the microphone for Agentic OS.") }
            }
        default: fail(id, "The microphone is off for Agentic OS. Turn it on in Settings > Agentic OS.")
        }
    }

    private func begin(_ id: String, opened: Bool) {
        do { try startEngine() } catch {
            fail(id, "The microphone didn't start (\(error.localizedDescription)).")
            return
        }
        let now = Date().timeIntervalSince1970
        let t = Take(id: id)
        q.sync { take?.cancel(); take = t }
        publish(FlowState(id: id, recordingId: nil, state: "starting", text: nil, error: nil,
                          startedAt: now, updatedAt: now, warmUntil: now + Self.warmFor))
        warm()
        if opened || UIApplication.shared.applicationState == .active { showOverlay() }
        Task {
            if let rid = await t.create() {
                self.update(id) { $0.recordingId = rid; if $0.state == "starting" { $0.state = "recording" } }
            } else if !t.ended {
                self.q.sync { if self.take === t { self.take = nil } }
                t.cancel()
                self.fail(id, Shared.token == nil ? "Open Agentic OS and sign in first." : "Couldn't reach your PC.")
            }
        }
        t.pump()
    }

    private func stop(discard: Bool) {
        let t: Take? = q.sync { let t = take; take = nil; return t }
        overlay?.hide()
        guard let t else { return }
        if discard {
            t.cancel()
            update(t.id) { $0.state = "failed"; $0.error = "Cancelled." }
            return
        }
        update(t.id) { $0.state = "finishing" }
        let bg = UIApplication.shared.beginBackgroundTask(withName: "flow-finish")
        Task { @MainActor in
            let result = await t.finish()
            switch result {
            case .success(let text): self.update(t.id) { $0.state = "done"; $0.text = text; $0.error = nil }
            case .failure(let why): self.update(t.id) { $0.state = "failed"; $0.error = why.message }
            }
            UIApplication.shared.endBackgroundTask(bg)
        }
        warm()
    }

    private func fail(_ id: String, _ why: String) {
        let now = Date().timeIntervalSince1970
        var f = Shared.flow?.id == id ? Shared.flow! : FlowState(id: id, recordingId: nil, state: "failed", text: nil, error: nil,
                                                               startedAt: now, updatedAt: now, warmUntil: 0)
        f.state = "failed"
        f.error = why
        publish(f)
        overlay?.show(error: why)
    }

    private func update(_ id: String, _ change: @escaping (inout FlowState) -> Void) {
        DispatchQueue.main.async {
            guard var f = Shared.flow, f.id == id else { return }
            change(&f)
            self.publish(f)
            if f.state == "recording" { self.overlay?.recording() }
        }
    }

    private func publish(_ f: FlowState) {
        var f = f
        f.updatedAt = Date().timeIntervalSince1970
        Shared.flow = f
        FlowSignal.changed.post()
    }

    // MARK: The microphone

    private func startEngine() throws {
        if running { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker])
        try session.setActive(true)
        let input = engine.inputNode
        let micFormat = input.outputFormat(forBus: 0)
        guard micFormat.sampleRate > 0 else { throw FlowError("No microphone input.") }
        converter = AVAudioConverter(from: micFormat, to: format)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [weak self] buf, _ in self?.capture(buf) }
        engine.prepare()
        try engine.start()
        running = true
    }

    private func stopEngine() {
        guard running else { return }
        running = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Keep the microphone open for the next dictation, then let go.
    private func warm() {
        warmTimer?.invalidate()
        warmTimer = Timer.scheduledTimer(withTimeInterval: Self.warmFor, repeats: false) { [weak self] _ in
            guard let self else { return }
            let busy = self.q.sync { self.take != nil }
            if busy { self.warm(); return }
            self.stopEngine()
            if var f = Shared.flow { f.warmUntil = 0; self.publish(f) }
        }
        if var f = Shared.flow { f.warmUntil = Date().timeIntervalSince1970 + Self.warmFor; Shared.flow = f }
    }

    /// Mic audio (tap thread): converted to 16 kHz 16-bit and handed to the take, or dropped while just warm.
    private func capture(_ buf: AVAudioPCMBuffer) {
        guard let converter else { return }
        let capacity = AVAudioFrameCount(Double(buf.frameLength) * format.sampleRate / buf.format.sampleRate) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
        var fed = false
        var error: NSError?
        _ = converter.convert(to: out, error: &error) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buf
        }
        guard error == nil, out.frameLength > 0, let ch = out.int16ChannelData else { return }
        let data = Data(bytes: ch[0], count: Int(out.frameLength) * 2)
        q.async { self.take?.append(data) }
    }

    // MARK: The "recording, swipe back" screen

    private func showOverlay() {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
        if overlay == nil {
            overlay = FlowOverlay { [weak self] in self?.stop(discard: false) }
        }
        overlay?.show(in: window)
    }
}

struct FlowError: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

/// One dictation: buffers audio, cuts it into 2 s chunks on disk, and uploads them in order with retries.
final class Take {
    let id: String
    private(set) var recordingId: String?
    private(set) var ended = false
    private var pending = Data()           // audio not yet cut into a chunk
    private var chunks = 0                 // chunks cut so far
    private var uploaded = Set<Int>()
    private var bytes = 0                  // audio bytes so far (header excluded)
    private var cancelled = false
    private let dir: URL
    private let lock = NSLock()
    private var pumping: Task<Void, Never>?
    private static let chunkBytes = 64_000 // 2 s at 16 kHz 16-bit

    init(id: String) {
        self.id = id
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("flow-\(id)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        pending = Take.header(dataBytes: UInt32.max)   // sizes unknown until the end
    }

    func create() async -> String? {
        for attempt in 0..<3 {
            let (code, data) = await Shared.send("/voice", body: ["source": "keyboard", "purpose": "dictation", "mime": "audio/wav"])
            if (200..<300).contains(code), let rid = Shared.item(data, "recording")?["id"] as? String {
                lock.withLock { recordingId = rid }
                return rid
            }
            if code == 401 || cancelled { return nil }
            try? await Task.sleep(nanoseconds: UInt64(attempt + 1) * 700_000_000)
        }
        return nil
    }

    /// Audio from the mic (on the recorder's queue).
    func append(_ data: Data) {
        lock.lock(); defer { lock.unlock() }
        guard !ended else { return }
        pending.append(data)
        bytes += data.count
        let limit = chunks == 0 ? Take.chunkBytes + 44 : Take.chunkBytes
        if pending.count >= limit { cut() }
    }

    /// Writes the pending audio as the next chunk file. Call with the lock held.
    private func cut() {
        guard !pending.isEmpty else { return }
        try? pending.write(to: file(chunks))
        chunks += 1
        pending = Data()
    }

    private func file(_ n: Int) -> URL { dir.appendingPathComponent("chunk-\(n)") }

    /// Uploads chunks as they are cut, until the take ends.
    func pump() {
        pumping = Task.detached { [weak self] in
            while let self, !self.cancelled {
                await self.uploadReady()
                let done = self.lock.withLock { self.ended }
                if done { break }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    /// Uploads every cut chunk not yet on the PC. False when one failed.
    @discardableResult
    private func uploadReady() async -> Bool {
        let (rid, cut, have) = lock.withLock { (recordingId, chunks, uploaded) }
        guard let rid else { return false }
        for n in 0..<cut where !have.contains(n) {
            guard let data = try? Data(contentsOf: file(n)) else { continue }
            let (code, _) = await Shared.request("/voice/\(rid)/chunk/\(n)", method: "PUT", data: data,
                                                 type: "application/octet-stream", timeout: 30)
            guard (200..<300).contains(code) else { return false }
            _ = lock.withLock { uploaded.insert(n) }
        }
        return true
    }

    /// Ends the take: last chunk, the real sizes in the header, every chunk up, then transcription.
    func finish() async -> Result<String, FlowError> {
        let (total, audio): (Int, Int) = lock.withLock {
            ended = true
            cut()
            if chunks > 0, var first = try? Data(contentsOf: file(0)) {
                first.replaceSubrange(0..<44, with: Take.header(dataBytes: UInt32(bytes)))
                try? first.write(to: file(0))
                uploaded.remove(0)
            }
            return (chunks, bytes)
        }
        pumping?.cancel()
        guard audio > 3200 else { cleanup(); return .failure(FlowError("Nothing was recorded.")) }   // under 0.1 s
        if recordingId == nil, await create() == nil {
            return .failure(FlowError("Couldn't reach your PC. The audio is kept; try again from the app."))
        }
        var ok = false
        for attempt in 0..<5 {
            if await uploadReady() { ok = true; break }
            try? await Task.sleep(nanoseconds: UInt64(attempt + 1) * 1_000_000_000)
        }
        guard ok, let rid = recordingId else {
            return .failure(FlowError("Upload failed. Retry it in Settings > Voice recordings."))
        }
        let ms = audio / 32   // 32 bytes per millisecond
        let (code, data) = await Shared.send("/voice/\(rid)/finish", body: ["chunks": total, "durationMs": ms])
        let rec = Shared.item(data, "recording")
        if let text = rec?["text"] as? String, !text.isEmpty {
            cleanup()
            return .success(text)
        }
        // Transcription may still be running: wait for it a little.
        for _ in 0..<20 {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            let (_, d) = await Shared.request("/voice/\(rid)")
            let r = Shared.item(d, "recording")
            if let text = r?["text"] as? String, !text.isEmpty { cleanup(); return .success(text) }
            if (r?["status"] as? String) == "failed" {
                return .failure(FlowError((r?["error"] as? String) ?? "Transcription failed. Retry it in Settings > Voice recordings."))
            }
        }
        return .failure(FlowError(code == 0 ? "Couldn't reach your PC." : "Transcription is taking long. Retry it in Settings > Voice recordings."))
    }

    func cancel() {
        lock.withLock { cancelled = true; ended = true }
        pumping?.cancel()
        cleanup()
    }

    private func cleanup() { try? FileManager.default.removeItem(at: dir) }

    /// A 44-byte PCM WAV header for 16 kHz mono 16-bit audio.
    static func header(dataBytes: UInt32) -> Data {
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(dataBytes > UInt32.max - 36 ? UInt32.max : dataBytes + 36)
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(dataBytes)
        return d
    }
}

/// Full-screen "Recording, swipe back to your app" card over the web view while a keyboard dictation runs.
final class FlowOverlay {
    private let view = UIView()
    private let title = UILabel()
    private let detail = UILabel()
    private let dot = UIView()
    private let button = UIButton(type: .system)
    private let onStop: () -> Void

    init(onStop: @escaping () -> Void) {
        self.onStop = onStop
        view.backgroundColor = UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 0.96)
        dot.backgroundColor = .systemRed
        dot.layer.cornerRadius = 9
        title.font = .systemFont(ofSize: 24, weight: .semibold)
        title.textColor = .white
        title.textAlignment = .center
        detail.font = .systemFont(ofSize: 16)
        detail.textColor = UIColor.white.withAlphaComponent(0.7)
        detail.textAlignment = .center
        detail.numberOfLines = 0
        var cfg = UIButton.Configuration.filled()
        cfg.title = "Stop"
        cfg.baseBackgroundColor = UIColor.white.withAlphaComponent(0.14)
        cfg.baseForegroundColor = .white
        cfg.cornerStyle = .capsule
        cfg.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 32, bottom: 12, trailing: 32)
        button.configuration = cfg
        button.addAction(UIAction { [weak self] _ in self?.onStop() }, for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [dot, title, detail, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.setCustomSpacing(28, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 18), dot.heightAnchor.constraint(equalToConstant: 18),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
        ])
    }

    func show(in window: UIWindow) {
        recording()
        view.frame = window.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        if view.superview !== window { window.addSubview(view) }
        window.bringSubviewToFront(view)
        view.alpha = 1
    }

    func recording() {
        dot.isHidden = false
        title.text = "Recording"
        detail.text = "Swipe back to your app and keep talking. Tap the keyboard's mic when you're done."
        button.isHidden = false
    }

    func show(error: String) {
        guard view.superview != nil else { return }
        dot.isHidden = true
        title.text = "Dictation stopped"
        detail.text = error
        button.isHidden = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.hide() }
    }

    func hide() {
        guard view.superview != nil else { return }
        UIView.animate(withDuration: 0.2, animations: { self.view.alpha = 0 }) { _ in self.view.removeFromSuperview() }
    }
}
