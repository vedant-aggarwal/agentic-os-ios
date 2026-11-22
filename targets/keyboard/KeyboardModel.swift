import Combine
import ImageIO
import Photos
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// A recent dictation from Voices, to insert again.
struct KbRecent: Identifiable {
    let id: String
    let text: String
}

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

/// One line of a Rewrite or Reply chat: what he asked (mine), or one version the AI wrote. Kept on the device so
/// the chat survives the keyboard being reloaded, and can be continued from Home.
struct KbMessage: Identifiable, Codable, Equatable {
    var id = UUID()
    var mine: Bool
    var text: String
    var label = ""
    var note = ""
    var failed = false
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
    enum Screen { case home, rewrite, reply, recent }
    enum Dictation: Equatable { case idle, opening, starting, recording(since: Double), transcribing, failed(String) }
    enum Field { case document, refine, custom }

    @Published var screen: Screen = .home { didSet { updateHeight() } }
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
    @Published var messages: [KbMessage] = [] { didSet { saveSession(); updateHeight() } } // the chat, oldest first
    @Published var modePicker = false
    @Published var lastAction: String?
    @Published var liveText = ""          // the dictation's words so far, as the PC transcribes them
    @Published var recent: [KbRecent] = []

    private weak var host: KeyboardViewController?
    private var threadId: String?
    private var turn = 0
    private var lastBody: [String: Any]?    // the last request, for Retry
    private var lastWithImages = false
    private var follower: Task<Void, Never>?
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
        if let id = takeId { follow(id) } // back from the app (or another app): pick the dictation up again
        Task { await loadModes() }
    }

    func disappeared() {
        follower?.cancel()
        follower = nil
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

    func openRecent() {
        typing = nil
        screen = .recent
        Task { await loadRecent() }
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
        messages = []
        lastBody = nil
    }

    /// Start this screen over: a new chat (the old one stays saved until the new one has a message).
    func newChat() {
        if screen == .reply { openReply() } else { openRewrite() }
    }

    // MARK: The chat, kept on the device

    private func saveSession() {
        guard screen == .rewrite || screen == .reply, !messages.isEmpty, let data = try? JSONEncoder().encode(messages) else { return }
        let s: [String: Any] = [
            "mode": screen == .reply ? "reply" : "rewrite", "threadId": threadId ?? "", "source": source, "style": style,
            "action": lastAction ?? "", "turn": turn, "at": Date().timeIntervalSince1970, "messages": data,
        ]
        defaults.set(s, forKey: "kb.session")
    }

    /// The last chat, if it is from the last 12 hours: "rewrite" or "reply".
    var savedChat: String? {
        guard let s = defaults.dictionary(forKey: "kb.session"), let at = s["at"] as? Double,
              Date().timeIntervalSince1970 - at < 12 * 3600 else { return nil }
        return s["mode"] as? String
    }

    func continueLast() {
        guard let s = defaults.dictionary(forKey: "kb.session"), let data = s["messages"] as? Data,
              let saved = try? JSONDecoder().decode([KbMessage].self, from: data), !saved.isEmpty else { return }
        resetSession()
        let t = s["threadId"] as? String ?? ""
        threadId = t.isEmpty ? nil : t
        source = s["source"] as? String ?? ""
        style = s["style"] as? String ?? "smart"
        let a = s["action"] as? String ?? ""
        lastAction = a.isEmpty ? nil : a
        turn = s["turn"] as? Int ?? 0
        screen = (s["mode"] as? String) == "reply" ? .reply : .rewrite
        messages = saved
        versions = saved.filter { !$0.mine }.map { KbVersion(text: $0.text, label: $0.label, turn: 0) }
        index = max(0, versions.count - 1)
    }

    private func updateHeight() {
        host?.setHeight((screen == .rewrite || screen == .reply) && !messages.isEmpty ? 384 : 316)
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

    func insertCurrent() { if let v = current { insertText(v.text) } }
    func replaceCurrent() { if let v = current { replaceWith(v.text) } }
    func copyCurrent() { if let v = current { copyText(v.text) } }

    func insertText(_ text: String) {
        guard let p = host?.proxy else { return }
        let before = p.documentContextBeforeInput ?? ""
        let needsSpace = !(before.last.map { $0.isWhitespace } ?? true)
        p.insertText((needsSpace ? " " : "") + text)
        show("Inserted")
    }

    /// Swaps the text the rewrite started from (the selection, or the whole field) for this version.
    func replaceWith(_ text: String) {
        guard let p = host?.proxy else { return }
        if let sel = p.selectedText, !sel.isEmpty {
            p.insertText(text)
            show("Replaced")
            return
        }
        let after = p.documentContextAfterInput ?? ""
        if !after.isEmpty { p.adjustTextPosition(byCharacterOffset: after.count) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            let before = p.documentContextBeforeInput ?? ""
            for _ in 0..<before.count { p.deleteBackward() }
            p.insertText(text)
            self.show("Replaced")
        }
    }

    func copyText(_ text: String) {
        guard fullAccess else { problem = Self.needAccess; return }
        UIPasteboard.general.string = text
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
        typing = nil
        var body: [String: Any] = ["mode": "rewrite", "action": action, "text": source]
        if !custom.isEmpty { body["custom"] = custom }
        let label = rewriteModes.first { $0.key == action }?.label ?? action
        let ask = action == "custom" ? custom : (custom.isEmpty ? "Rewrite: \(label)" : "Rewrite: \(label). \(custom)")
        Task { await chat(body, ask: ask) }
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
        let ask = custom.isEmpty ? "Draft a reply: \(styleLabel)" : (style == "custom" ? custom : "\(styleLabel): \(custom)")
        Task { await chat(body, ask: ask, withImages: true) }
    }

    /// Send what is in the chat field: the next message in the same thread (the AI sees the whole chat).
    func sendRefine() {
        let message = refine.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !busy else { return }
        typing = nil
        refine = ""
        send(message)
    }

    /// A follow-up in the chat: typed, dictated, or a quick chip ("Make it shorter").
    func send(_ message: String) {
        guard !busy else { return }
        var body: [String: Any] = ["mode": screen == .reply ? "reply" : "rewrite", "message": message]
        if screen == .reply, style != "custom" { body["style"] = style }
        if screen == .rewrite { body["text"] = source; if let a = lastAction { body["action"] = a } }
        Task { await chat(body, ask: message) }
    }

    /// Send the last request again (after it failed).
    func retry() {
        guard let b = lastBody, !busy else { return }
        if let i = messages.lastIndex(where: { $0.mine }) { messages[i].failed = false }
        let w = lastWithImages
        Task { await chat(b, ask: nil, withImages: w) }
    }

    var lastAiId: UUID? { messages.last { !$0.mine }?.id }

    private func markFailed() {
        if let i = messages.lastIndex(where: { $0.mine }) { messages[i].failed = true }
    }

    private func chat(_ body: [String: Any], ask: String?, withImages: Bool = false) async {
        guard fullAccess else { problem = Self.needAccess; return }
        guard Shared.token != nil else { problem = "Open Agentic OS and sign in once."; return }
        if let ask { messages.append(KbMessage(mine: true, text: ask)) }
        lastBody = body
        lastWithImages = withImages
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
                        markFailed()
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
            markFailed()
            return
        }
        threadId = json["threadId"] as? String ?? threadId
        turn += 1
        let options = (json["options"] as? [[String: Any]]) ?? []
        let fresh = options.compactMap { o -> KbVersion? in
            guard let t = o["text"] as? String, !t.isEmpty else { return nil }
            return KbVersion(text: t, label: o["label"] as? String ?? "", turn: turn)
        }
        guard !fresh.isEmpty else { problem = "No text came back. Try again."; markFailed(); return }
        let first = versions.count
        versions += fresh
        index = first
        note = json["note"] as? String ?? ""
        var replies = fresh.map { KbMessage(mine: false, text: $0.text, label: $0.label) }
        replies[replies.count - 1].note = note
        messages += replies
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

    // MARK: Dictation
    // A keyboard can't use the mic, so the app records it as a GPT take (src/lib/kbmic.ts in the app): the keyboard
    // picks the take's id, asks the app to start it (straight away if the app's mic is still warm, else by opening
    // agenticos://flow?id=), then follows the take on the PC: the words appear as they are transcribed, and the
    // text is inserted when it is done. Stop reaches the app through the PC.

    private var takeId: String? {
        get { defaults.string(forKey: "kb.take") }
        set { defaults.set(newValue, forKey: "kb.take") }
    }
    private var dictationTarget: Field {
        get { Field.from(defaults.string(forKey: "kb.take.target")) }
        set { defaults.set(newValue.name, forKey: "kb.take.target") }
    }

    func mic(target: Field = .document) {
        switch dictation {
        case .recording, .starting: stopDictation()
        case .transcribing: break
        case .opening: if let id = takeId { openApp(id) }
        case .idle, .failed: startDictation(target)
        }
    }

    private static func newId() -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        let rand = String((0..<6).map { _ in chars.randomElement()! })
        return "t_" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 36) + "_" + rand
    }

    private func startDictation(_ target: Field) {
        guard fullAccess else { dictation = .failed(Self.needAccess); return }
        guard Shared.token != nil else { dictation = .failed("Open Agentic OS and sign in once."); return }
        let id = Self.newId()
        takeId = id
        dictationTarget = target
        liveText = ""
        dictation = .starting
        Task {
            // the app's mic may still be open from the last take: then it starts without leaving this app
            let (code, data) = await Shared.send("/pc/kbmic/start", body: ["id": id], timeout: 5)
            guard self.takeId == id else { return }
            if code == 200, Shared.json(data)?["ok"] as? Bool == true {
                self.follow(id)
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if self.takeId == id, self.dictation == .starting { self.openApp(id) } // it didn't answer
            } else {
                self.openApp(id)
            }
        }
    }

    private func openApp(_ id: String) {
        dictation = .opening
        host?.open(URL(string: "agenticos://flow?id=\(id)")!)
        follow(id)
    }

    func stopDictation() {
        guard let id = takeId else { return }
        dictation = .transcribing
        Task { await Shared.send("/pc/take/\(id)/stop", body: [:], timeout: 8) }
    }

    /// Stop without inserting anything (the take is still saved in Voices).
    func cancelDictation() {
        if let id = takeId { Task { await Shared.send("/pc/take/\(id)/stop", body: [:], timeout: 8) } }
        takeId = nil
        follower?.cancel()
        follower = nil
        liveText = ""
        dictation = .idle
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Follow the take on the PC until it is done (long polls), updating the state and the live words.
    private func follow(_ id: String) {
        follower?.cancel()
        follower = Task { [weak self] in
            var v: Int?
            let began = Date()
            while !Task.isCancelled {
                guard let self, self.takeId == id else { return }
                let path = "/pc/take/\(id)" + (v.map { "?v=\($0)&wait=15" } ?? "")
                let (code, data) = await Shared.request(path, timeout: 25)
                if Task.isCancelled || self.takeId != id { return }
                if code == 404 || code == 0 {
                    // not started yet (the app is opening) or no connection: wait a little
                    if code == 404, Date().timeIntervalSince(began) > 90, self.dictation == .opening || self.dictation == .starting {
                        self.takeId = nil
                        self.dictation = .failed("Agentic OS didn't start the mic. Tap to try again.")
                        return
                    }
                    try? await Task.sleep(nanoseconds: 700_000_000)
                    continue
                }
                guard code == 200, let t = Shared.json(data) else {
                    let msg = Shared.json(data)?["error"] as? String
                    self.takeId = nil
                    self.dictation = .failed(msg ?? "The PC said \(code).")
                    return
                }
                v = t["v"] as? Int
                let text = t["text"] as? String ?? ""
                switch t["status"] as? String {
                case "recording":
                    if t["stop"] as? Bool == true {
                        self.dictation = .transcribing
                    } else if case .recording = self.dictation {
                    } else {
                        let since = (t["createdAt"] as? String).flatMap { Self.iso.date(from: $0) }?.timeIntervalSince1970
                        self.dictation = .recording(since: since ?? Date().timeIntervalSince1970)
                    }
                    self.liveText = text
                case "finishing", "transcribing":
                    self.dictation = .transcribing
                    self.liveText = text
                case "done":
                    self.deliver(text, id: id)
                    return
                default:
                    self.takeId = nil
                    self.dictation = .failed(t["error"] as? String ?? "Dictation failed.")
                    return
                }
            }
        }
    }

    private func deliver(_ text: String, id: String) {
        guard takeId == id else { return }
        takeId = nil
        dictation = .idle
        liveText = ""
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { show("No words heard"); return }
        switch dictationTarget {
        case .document:
            insertSpaced(clean)
            show("Inserted")
        case .refine:
            refine = refine.isEmpty ? clean : refine + " " + clean
            sendRefine()
        case .custom:
            custom = custom.isEmpty ? clean : custom + " " + clean
        }
    }

    /// Insert at the cursor, with a space first when the text there doesn't end in one.
    func insertSpaced(_ text: String) {
        let before = host?.proxy.documentContextBeforeInput ?? ""
        let needsSpace = !(before.last.map { $0.isWhitespace } ?? true)
        host?.proxy.insertText((needsSpace ? " " : "") + text)
    }

    // MARK: Recent takes (Voices)

    func loadRecent() async {
        guard fullAccess else { problem = Self.needAccess; return }
        let (code, data) = await Shared.request("/pc/takes?limit=12", timeout: 8)
        guard code == 200, let list = Shared.json(data)?["takes"] as? [[String: Any]] else {
            problem = code == 0 ? "Couldn't reach your PC." : "The PC said \(code)."
            return
        }
        problem = nil
        recent = list.compactMap { t in
            guard let id = t["id"] as? String, let text = t["text"] as? String, !text.isEmpty else { return nil }
            return KbRecent(id: id, text: text)
        }
    }

    func insertRecent(_ text: String) {
        insertSpaced(text)
        show("Inserted")
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
