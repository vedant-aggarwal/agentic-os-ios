import ImageIO
import Photos
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct KbMode: Codable, Hashable, Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

/// One version of the text: an option from one AI turn. Every turn's options are kept, oldest first.
struct KbVersion: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let label: String
    let turn: Int
}

/// A screenshot ready to send: a small thumbnail for the UI and the JPEG (max 1600 px, quality 0.8).
struct KbImage: Identifiable {
    let id = UUID()
    let thumb: UIImage
    let jpeg: Data
    var serverId: String?
}

@MainActor
final class KeyboardModel: ObservableObject {
    enum Screen { case home, rewrite, reply }
    enum Dictation: Equatable { case idle, opening, starting, recording(since: Double), transcribing, failed(String) }
    enum Field { case document, refine, custom }

    @Published var screen: Screen = .home
    @Published var dictation: Dictation = .idle
    @Published var flash: String?
    @Published var replyModes: [KbMode] = KeyboardModel.fallbackReply
    @Published var rewriteModes: [KbMode] = KeyboardModel.fallbackRewrite

    // Rewrite and Reply
    @Published var source = ""              // his draft (rewrite) or pasted conversation text (reply)
    @Published var sourceFromDocument = false
    @Published var images: [KbImage] = []
    @Published var style = "smart"          // reply mode key, or "custom"
    @Published var custom = ""              // custom request (reply) / instruction
    @Published var refine = ""              // chat to refine the versions
    @Published var versions: [KbVersion] = []
    @Published var index = 0
    @Published var note = ""
    @Published var busy = false
    @Published var problem: String?
    @Published var typing: Field?           // our own letter keys are up, typing into this field
    @Published var modePicker = false
    @Published var lastAction: String?

    private weak var host: KeyboardViewController?
    private var threadId: String?
    private var turn = 0
    private var listener: FlowListener?
    private var ticker: Timer?
    private var lastPoll = Date.distantPast
    private var flashTask: Task<Void, Never>?
    private let defaults = UserDefaults.standard

    init(host: KeyboardViewController) {
        self.host = host
        if let data = defaults.data(forKey: "kb.modes"), let cached = try? JSONDecoder().decode([String: [KbMode]].self, from: data) {
            if let r = cached["reply"], !r.isEmpty { replyModes = r }
            if let w = cached["rewrite"], !w.isEmpty { rewriteModes = w }
        }
    }

    var fullAccess: Bool { host?.fullAccess ?? false }
    var showsGlobe: Bool { host?.showsGlobe ?? true }
    var current: KbVersion? { versions.indices.contains(index) ? versions[index] : nil }
    var styleLabel: String { style == "custom" ? "Custom" : replyModes.first { $0.key == style }?.label ?? "Best reply" }

    // MARK: Lifecycle

    func appeared() {
        listener = FlowListener([.changed]) { [weak self] _ in self?.syncFlow() }
        syncFlow()
        Task { await loadModes() }
    }

    func disappeared() {
        listener = nil
        ticker?.invalidate()
        ticker = nil
    }

    func textChanged() {}

    func nextKeyboard() { host?.nextKeyboard() }

    // MARK: Plain keys

    func insert(_ s: String) {
        if let typing { type(s, into: typing); return }
        host?.proxy.insertText(s)
    }

    func backspace() {
        if let typing { deleteBack(in: typing); return }
        host?.proxy.deleteBackward()
    }

    func type(_ s: String, into field: Field) {
        switch field {
        case .refine: refine += s
        case .custom: custom += s
        case .document: host?.proxy.insertText(s)
        }
    }

    private func deleteBack(in field: Field) {
        switch field {
        case .refine: if !refine.isEmpty { refine.removeLast() }
        case .custom: if !custom.isEmpty { custom.removeLast() }
        case .document: host?.proxy.deleteBackward()
        }
    }

    // MARK: Screens

    func openRewrite() {
        resetSession()
        let p = host?.proxy
        let selected = p?.selectedText ?? ""
        let before = p?.documentContextBeforeInput ?? ""
        let after = p?.documentContextAfterInput ?? ""
        if !selected.isEmpty {
            source = selected
            sourceFromDocument = true
        } else if !(before + after).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            source = before + after
            sourceFromDocument = true
        } else if fullAccess, let clip = UIPasteboard.general.string, !clip.isEmpty {
            source = clip
        }
        screen = .rewrite
    }

    func openReply() {
        resetSession()
        style = defaults.string(forKey: "kb.style") ?? "smart"
        screen = .reply
    }

    func home() {
        typing = nil
        modePicker = false
        screen = .home
    }

    /// Back from the results to the setup (Reply), or home.
    func back() {
        if typing != nil { typing = nil; return }
        if modePicker { modePicker = false; return }
        if screen == .reply, !versions.isEmpty { versions = []; index = 0; note = ""; threadId = nil; return }
        home()
    }

    private func resetSession() {
        threadId = nil
        turn = 0
        source = ""
        sourceFromDocument = false
        images = []
        custom = ""
        refine = ""
        versions = []
        index = 0
        note = ""
        problem = nil
        typing = nil
        modePicker = false
        lastAction = nil
    }

    func useClipboardText() {
        guard fullAccess else { problem = Self.needAccess; return }
        guard let clip = UIPasteboard.general.string, !clip.isEmpty else { problem = "The clipboard has no text."; return }
        source = clip
        sourceFromDocument = false
        threadId = nil
    }

    func pickStyle(_ key: String) {
        style = key
        defaults.set(key, forKey: "kb.style")
        modePicker = false
        if key == "custom" { typing = .custom }
    }

    // MARK: Versions

    func next() { if index < versions.count - 1 { index += 1 } }
    func previous() { if index > 0 { index -= 1 } }

    func insertCurrent() {
        guard let v = current, let p = host?.proxy else { return }
        let before = p.documentContextBeforeInput ?? ""
        let needsSpace = !(before.last.map { $0.isWhitespace } ?? true)
        p.insertText((needsSpace ? " " : "") + v.text)
        show("Inserted")
    }

    /// Swaps the text the rewrite started from (the selection, or the whole field) for this version.
    func replaceCurrent() {
        guard let v = current, let p = host?.proxy else { return }
        if let sel = p.selectedText, !sel.isEmpty {
            p.insertText(v.text)
            show("Replaced")
            return
        }
        let after = p.documentContextAfterInput ?? ""
        if !after.isEmpty { p.adjustTextPosition(byCharacterOffset: after.count) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            let before = p.documentContextBeforeInput ?? ""
            for _ in 0..<before.count { p.deleteBackward() }
            p.insertText(v.text)
            self.show("Replaced")
        }
    }

    func copyCurrent() {
        guard let v = current else { return }
        guard fullAccess else { problem = Self.needAccess; return }
        UIPasteboard.general.string = v.text
        show("Copied")
    }

    func show(_ text: String) {
        flash = text
        flashTask?.cancel()
        flashTask = Task {
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            if !Task.isCancelled { flash = nil }
        }
    }

    // MARK: AI

    func loadModes() async {
        guard fullAccess, Shared.token != nil else { return }
        let (code, data) = await Shared.request("/kb/modes", timeout: 8)
        guard code == 200, let data, let modes = try? JSONDecoder().decode([String: [KbMode]].self, from: data) else { return }
        if let r = modes["reply"], !r.isEmpty { replyModes = r }
        if let w = modes["rewrite"], !w.isEmpty { rewriteModes = w }
        defaults.set(data, forKey: "kb.modes")
    }

    func rewrite(_ action: String) {
        guard !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            problem = "Type something first, or copy text and tap Clipboard."
            return
        }
        lastAction = action
        var body: [String: Any] = ["mode": "rewrite", "action": action, "text": source]
        if !custom.isEmpty { body["custom"] = custom }
        Task { await chat(body) }
    }

    func draftReply() {
        guard !images.isEmpty || !source.isEmpty || !custom.isEmpty else {
            problem = "Paste a screenshot, pick the latest one, or paste the chat text first."
            return
        }
        typing = nil
        var body: [String: Any] = ["mode": "reply"]
        if style != "custom" { body["style"] = style }
        if !custom.isEmpty { body["custom"] = custom }
        if !source.isEmpty { body["text"] = source }
        Task { await chat(body, withImages: true) }
    }

    func sendRefine() {
        let message = refine.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }
        typing = nil
        var body: [String: Any] = ["mode": screen == .reply ? "reply" : "rewrite", "message": message]
        if screen == .reply, style != "custom" { body["style"] = style }
        if screen == .rewrite { body["text"] = source; if let a = lastAction { body["action"] = a } }
        Task {
            await chat(body)
            if problem == nil { refine = "" }
        }
    }

    private func chat(_ body: [String: Any], withImages: Bool = false) async {
        guard fullAccess else { problem = Self.needAccess; return }
        guard Shared.token != nil else { problem = "Open Agentic OS and sign in once."; return }
        busy = true
        problem = nil
        defer { busy = false }
        var body = body
        if let threadId { body["threadId"] = threadId }
        if withImages, !images.isEmpty {
            var ids: [String] = []
            for i in images.indices {
                if images[i].serverId == nil {
                    let (code, data) = await Shared.request("/kb/image", method: "POST", data: images[i].jpeg, type: "image/jpeg", timeout: 40)
                    guard (200..<300).contains(code), let id = Shared.json(data)?["imageId"] as? String else {
                        problem = code == 0 ? "Couldn't reach your PC." : "The screenshot didn't upload (\(code))."
                        return
                    }
                    images[i].serverId = id
                }
                if let id = images[i].serverId { ids.append(id) }
            }
            body["imageIds"] = ids
        }
        let (code, data) = await Shared.send("/kb/chat", body: body, timeout: 150)
        guard (200..<300).contains(code), let json = Shared.json(data) else {
            let msg = Shared.json(data)?["error"] as? String
            problem = code == 0 ? "Couldn't reach your PC." : (msg ?? "The AI didn't answer (\(code)). Try again.")
            return
        }
        threadId = json["threadId"] as? String ?? threadId
        turn += 1
        let options = (json["options"] as? [[String: Any]]) ?? []
        let fresh = options.compactMap { o -> KbVersion? in
            guard let t = o["text"] as? String, !t.isEmpty else { return nil }
            return KbVersion(text: t, label: o["label"] as? String ?? "", turn: turn)
        }
        guard !fresh.isEmpty else { problem = "No text came back. Try again."; return }
        let first = versions.count
        versions += fresh
        index = first
        note = json["note"] as? String ?? ""
    }

    // MARK: Screenshots

    func pasteScreenshot() {
        guard fullAccess else { problem = Self.needAccess; return }
        let pb = UIPasteboard.general
        var data: Data?
        for t in [UTType.png.identifier, UTType.jpeg.identifier, UTType.heic.identifier, UTType.image.identifier] {
            if let d = pb.data(forPasteboardType: t) { data = d; break }
        }
        if data == nil, let img = pb.image { data = img.jpegData(compressionQuality: 0.9) }
        guard let data, let img = KeyboardModel.prepare(data) else {
            problem = "No image on the clipboard. Take a screenshot, tap it, then Copy."
            return
        }
        addImage(img)
    }

    /// The newest screenshot (the newest photo if there are none). Asks for Photos here first: a keyboard with
    /// Full Access can show the prompt itself, and the app's own grant doesn't always reach the extension.
    func latestPhoto() {
        guard fullAccess else { problem = Self.needAccess; return }
        guard !busy else { return }
        problem = nil
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited:
            attachLatest()
        case .notDetermined:
            busy = true
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                Task { @MainActor in
                    self.busy = false
                    if status == .authorized || status == .limited { self.attachLatest() } else { self.askAppForPhotos() }
                }
            }
        default:
            askAppForPhotos()
        }
    }

    private func askAppForPhotos() {
        problem = "Photos is off for the keyboard. Allow it in Agentic OS, then tap Latest screenshot again."
        host?.open(URL(string: "agenticos://keyboard/photos")!)
    }

    private func attachLatest() {
        let limited = PHPhotoLibrary.authorizationStatus(for: .readWrite) == .limited
        guard let asset = Self.newestImage(screenshotsOnly: true) ?? Self.newestImage(screenshotsOnly: false) else {
            problem = limited ? "Photos is set to Limited, so the keyboard sees none. Allow All Photos in Settings > Agentic OS > Photos."
                              : "No screenshots or photos found."
            return
        }
        // Photos scales it down out of process, so the keyboard never holds the full-size image (keyboards get about 60 MB).
        let req = PHImageRequestOptions()
        req.isNetworkAccessAllowed = true
        req.deliveryMode = .highQualityFormat
        req.resizeMode = .exact
        req.version = .current
        busy = true
        PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 1600, height: 1600), contentMode: .aspectFit,
                                              options: req) { image, info in
            let img = image.flatMap { KeyboardModel.prepare($0) }
            let error = (info?[PHImageErrorKey] as? NSError)?.localizedDescription
            Task { @MainActor in
                self.busy = false
                guard let img else {
                    self.problem = "Couldn't read the latest screenshot\(error.map { " (\($0))" } ?? ""). Copy it and tap Paste screenshot."
                    return
                }
                self.addImage(img)
                if limited, Date().timeIntervalSince(asset.creationDate ?? .distantPast) > 600 {
                    self.problem = "Photos is Limited, so this may not be your newest screenshot. Allow All Photos in Settings > Agentic OS > Photos."
                }
            }
        }
    }

    private static func newestImage(screenshotsOnly: Bool) -> PHAsset? {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 1
        if screenshotsOnly {
            opts.predicate = NSPredicate(format: "(mediaSubtypes & %d) != 0", PHAssetMediaSubtype.photoScreenshot.rawValue)
        }
        return PHAsset.fetchAssets(with: .image, options: opts).firstObject
    }

    private func addImage(_ img: KbImage) {
        problem = nil
        if images.count >= 3 { images.removeFirst() }
        images.append(img)
        threadId = nil
    }

    func removeImage(_ id: UUID) {
        images.removeAll { $0.id == id }
        threadId = nil
    }

    /// Downscales without decoding the full image (keyboards get about 60 MB): max 1600 px, JPEG 0.8.
    nonisolated static func prepare(_ data: Data) -> KbImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        func thumb(_ px: Int) -> CGImage? {
            CGImageSourceCreateThumbnailAtIndex(src, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: px,
            ] as CFDictionary)
        }
        guard let big = thumb(1600), let jpeg = UIImage(cgImage: big).jpegData(compressionQuality: 0.8),
              let small = thumb(160) else { return nil }
        return KbImage(thumb: UIImage(cgImage: small), jpeg: jpeg)
    }

    /// An image Photos already scaled to 1600 px: just the JPEG and the thumbnail.
    nonisolated static func prepare(_ image: UIImage) -> KbImage? {
        guard let jpeg = image.jpegData(compressionQuality: 0.8),
              let small = image.preparingThumbnail(of: CGSize(width: 160 * image.size.width / max(image.size.height, 1), height: 160))
        else { return nil }
        return KbImage(thumb: small, jpeg: jpeg)
    }

    // MARK: Dictation (recorded by the app, see FlowRecorder)

    private var pendingFlow: String? {
        get { defaults.string(forKey: "kb.flow.pending") }
        set { defaults.set(newValue, forKey: "kb.flow.pending") }
    }
    private var dictationTarget: Field {
        get { Field.from(defaults.string(forKey: "kb.flow.target")) }
        set { defaults.set(newValue.name, forKey: "kb.flow.target") }
    }

    func mic(target: Field = .document) {
        switch dictation {
        case .recording, .starting: stopDictation()
        case .transcribing: break
        case .opening:
            if let id = pendingFlow { host?.open(URL(string: "agenticos://flow?id=\(id)")!) }
        case .idle, .failed: startDictation(target)
        }
    }

    private func startDictation(_ target: Field) {
        guard fullAccess else { dictation = .failed(Self.needAccess); return }
        let id = UUID().uuidString
        pendingFlow = id
        dictationTarget = target
        if let f = Shared.flow, f.warm, !f.live {
            // The app is still listening: start without leaving this app.
            Shared.flowRequest = id
            FlowSignal.start.post()
            dictation = .starting
            tick()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                guard self.pendingFlow == id, Shared.flow?.id != id else { return }
                self.openApp(id)
            }
        } else {
            openApp(id)
        }
    }

    private func openApp(_ id: String) {
        dictation = .opening
        host?.open(URL(string: "agenticos://flow?id=\(id)")!)
        tick()
    }

    func stopDictation() {
        FlowSignal.stop.post()
        dictation = .transcribing
        tick()
    }

    func cancelDictation() {
        FlowSignal.cancel.post()
        pendingFlow = nil
        dictation = .idle
    }

    /// Reads the app's dictation state and catches up: recording, transcribing, text to insert, or a failure.
    func syncFlow() {
        guard let id = pendingFlow else {
            if case .failed = dictation {} else { dictation = .idle }
            return
        }
        guard let f = Shared.flow, f.id == id else {
            // Not started yet. Opening the app takes a moment; give up after a while.
            if dictation == .idle { dictation = .opening }
            tick()
            return
        }
        switch f.state {
        case "starting", "recording":
            dictation = .recording(since: f.startedAt)
            tick()
        case "finishing":
            dictation = .transcribing
            tick()
            pollServer(f)
        case "done":
            deliver(f.text ?? "", id: id)
        default:
            pendingFlow = nil
            dictation = .failed(f.error ?? "Dictation failed.")
            ticker?.invalidate()
        }
    }

    /// The text may land on the PC before the app says so (or the app is gone): ask the PC directly.
    private func pollServer(_ f: FlowState) {
        guard let rid = f.recordingId, Date().timeIntervalSince(lastPoll) > 1.5 else { return }
        lastPoll = Date()
        Task {
            let (_, data) = await Shared.request("/voice/\(rid)", timeout: 8)
            let rec = Shared.item(data, "recording")
            if let text = rec?["text"] as? String, !text.isEmpty, (rec?["status"] as? String) == "done" {
                self.deliver(text, id: f.id)
            }
        }
    }

    private func deliver(_ text: String, id: String) {
        guard pendingFlow == id else { return }
        pendingFlow = nil
        dictation = .idle
        ticker?.invalidate()
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        switch dictationTarget {
        case .document:
            let before = host?.proxy.documentContextBeforeInput ?? ""
            let needsSpace = !(before.last.map { $0.isWhitespace } ?? true)
            host?.proxy.insertText((needsSpace ? " " : "") + clean)
            show("Inserted")
        case .refine:
            refine = refine.isEmpty ? clean : refine + " " + clean
        case .custom:
            custom = custom.isEmpty ? clean : custom + " " + clean
        }
    }

    private func tick() {
        guard ticker == nil || ticker?.isValid == false else { return }
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] t in
            Task { @MainActor in
                guard let self else { t.invalidate(); return }
                switch self.dictation {
                case .idle, .failed: t.invalidate(); self.ticker = nil
                default: self.syncFlow()
                }
            }
        }
    }

    // MARK: Fallbacks (server/kb-prompts.ts)

    static let needAccess = "Turn on Full Access: Settings > General > Keyboard > Keyboards > Agentic OS."

    static let fallbackReply: [KbMode] = [
        KbMode(key: "smart", label: "Best reply"), KbMode(key: "flirt", label: "Flirt"), KbMode(key: "banter", label: "Banter"),
        KbMode(key: "funny", label: "Funny"), KbMode(key: "comeback", label: "Comeback"), KbMode(key: "ragebait", label: "Rage bait"),
        KbMode(key: "joke", label: "Joking"), KbMode(key: "polite_no", label: "Polite no"), KbMode(key: "professional", label: "Professional"),
    ]
    static let fallbackRewrite: [KbMode] = [
        KbMode(key: "improve", label: "Improve"), KbMode(key: "professional", label: "Professional"), KbMode(key: "funnier", label: "Funnier"),
        KbMode(key: "shorter", label: "Shorter"), KbMode(key: "friendlier", label: "Friendlier"), KbMode(key: "confident", label: "Confident"),
        KbMode(key: "english", label: "To English"), KbMode(key: "hinglish", label: "To Hinglish"), KbMode(key: "grammar", label: "Fix grammar"),
    ]
}

extension KeyboardModel.Field {
    var name: String {
        switch self {
        case .document: return "document"
        case .refine: return "refine"
        case .custom: return "custom"
        }
    }
    static func from(_ s: String?) -> Self {
        switch s {
        case "refine": return .refine
        case "custom": return .custom
        default: return .document
        }
    }
}
