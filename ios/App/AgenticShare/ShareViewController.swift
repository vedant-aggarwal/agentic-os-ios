import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Share to Agentic OS from any app: text, a link or a photo. The agent files it the moment it arrives (DECISIONS 2):
/// POST /api/v1/mod/scan/share { id, text, url, image, note } (server/modules/scan.ts), and the sheet says where it went;
/// Undo is in the app. A PC without the scan module gets the old /capture (an inbox task, or a Content idea for a link).
/// Offline, text and links wait in the shared queue (same id, so a retry files once); a photo needs the PC.
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareView(model: model) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        Task { await model.load(items) }
    }
}

@MainActor
final class ShareModel: ObservableObject {
    enum Stage: Equatable { case loading, editing, sending, done(String), queued, failed(String) }

    @Published var text = ""
    @Published var link = ""
    @Published var note = ""
    @Published var preview: UIImage?
    @Published var stage: Stage = .loading
    private var imageB64: String?
    private let id = "sh_" + String(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "").prefix(20))

    func load(_ items: [NSExtensionItem]) async {
        for item in items {
            if text.isEmpty, let t = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { text = t }
            for p in item.attachments ?? [] {
                if link.isEmpty, p.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !u.isFileURL {
                    link = u.absoluteString
                } else if imageB64 == nil, p.hasItemConformingToTypeIdentifier(UTType.image.identifier),
                          let data = await ShareModel.imageData(p) {
                    if let encoded = ShareModel.encode(data) {
                        imageB64 = encoded.0
                        preview = encoded.1
                    }
                } else if text.isEmpty, p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let raw = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) {
                    text = (raw as? String) ?? (raw as? Data).flatMap { String(data: $0, encoding: .utf8) } ?? ""
                }
            }
        }
        // A shared link often arrives as text too.
        if text == link { text = "" }
        stage = .editing
    }

    var hasImage: Bool { imageB64 != nil }
    var canSend: Bool {
        guard stage == .editing || isFailed else { return false }
        return hasImage || !link.isEmpty || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var isFailed: Bool { if case .failed = stage { return true }; return false }

    func send() async {
        guard Shared.token != nil else { stage = .failed("Open Agentic OS and sign in once, then share again."); return }
        stage = .sending
        var body: [String: Any] = ["id": id]
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { body["text"] = t }
        if !link.isEmpty { body["url"] = link }
        if !n.isEmpty { body["note"] = n }
        if let imageB64 { body["image"] = imageB64 }
        // Classifying and filing runs on the PC (Codex), so give it time.
        let (code, data) = await Shared.send("/mod/scan/share", body: body, timeout: 75)
        switch code {
        case 200, 201:
            stage = .done(ShareModel.said(Shared.item(data, "item")))
        case 404, 405:
            await legacy(t.isEmpty ? n : t)
        case 0, 500...599:
            if hasImage {
                stage = .failed(code == 0 ? "Couldn't reach your PC. A photo needs it on; try again." : "Your PC had a problem (\(code)). Try again.")
            } else {
                var queued = body
                queued.removeValue(forKey: "image")
                Shared.enqueue("/mod/scan/share", body: queued, fallback: "Shared with me: \([t, link, n].filter { !$0.isEmpty }.joined(separator: " "))")
                stage = .queued
            }
        case 401:
            stage = .failed("Signed out. Open Agentic OS and sign in again.")
        default:
            stage = .failed(ShareModel.message(data) ?? "Your PC didn't take it (\(code)). Try again.")
        }
    }

    /// A PC from before 2.0.0: the old inbox task, or a Content idea for a link.
    private func legacy(_ words: String) async {
        let kind = link.isEmpty ? "task" : "content"
        let (code, _) = await Shared.send("/capture", body: ["kind": kind, "text": words, "url": link])
        switch code {
        case 200, 201: stage = .done(kind == "task" ? "Added to your inbox." : "Added to Content ideas.")
        case 0: stage = .failed("Couldn't reach your PC. Is it on?")
        case 401: stage = .failed("Signed out. Open Agentic OS and sign in again.")
        default: stage = .failed("Your PC didn't take it (\(code)). Try again.")
        }
    }

    /// What she did with it: "Reel idea → Content · Ideas", or what it is and where it waits.
    static func said(_ item: [String: Any]?) -> String {
        guard let item else { return "Filed. Undo is in the app." }
        let title = (item["title"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        if let filed = item["filed"] as? [String: Any], let where_ = filed["where"] as? String {
            return title.map { "\($0) → \(where_)" } ?? "Filed in \(where_)"
        }
        if let reply = item["reply"] as? String, !reply.isEmpty { return reply }
        if let title { return "\(title): ready to file in the app." }
        return "Got it. It's in Agentic OS."
    }

    static func message(_ data: Data?) -> String? {
        (Shared.json(data)?["error"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    static func imageData(_ p: NSItemProvider) async -> Data? {
        await withCheckedContinuation { (cont: CheckedContinuation<Data?, Never>) in
            _ = p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in cont.resume(returning: data) }
        }
    }

    /// A JPEG small enough for the PC's 200 KB JSON limit (base64 included), made with ImageIO so a 48 MP photo never
    /// decodes in full inside the extension. Also returns a thumbnail for the sheet.
    static func encode(_ data: Data) -> (String, UIImage)? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        for (side, quality) in [(1400, 0.6), (1100, 0.55), (900, 0.5), (700, 0.45), (520, 0.4)] {
            let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                         kCGImageSourceCreateThumbnailWithTransform: true,
                                         kCGImageSourceThumbnailMaxPixelSize: side]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { continue }
            let img = UIImage(cgImage: cg)
            guard let jpeg = img.jpegData(compressionQuality: CGFloat(quality)) else { continue }
            let b64 = jpeg.base64EncodedString()
            if b64.count < 180_000 { return (b64, img) }
        }
        return nil
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel
    let close: () -> Void
    @FocusState var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                if model.stage == .loading {
                    Section { HStack { ProgressView(); Text("Reading what you shared…").foregroundStyle(.secondary) } }
                } else {
                    Section {
                        if let img = model.preview {
                            Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 180)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                        }
                        if !model.link.isEmpty {
                            Label(model.link, systemImage: "link").font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        }
                        if model.hasImage || !model.link.isEmpty {
                            if !model.text.isEmpty {
                                Text(model.text).font(.footnote).foregroundStyle(.secondary).lineLimit(3)
                            }
                            TextField("Add a note (optional)", text: $model.note, axis: .vertical)
                                .lineLimit(1...4)
                                .focused($focused)
                        } else {
                            TextField("What is it?", text: $model.text, axis: .vertical)
                                .lineLimit(2...8)
                                .focused($focused)
                        }
                    } footer: {
                        Text("Your agent files it where it belongs and tells you. Undo is in the app.")
                    }
                }
                switch model.stage {
                case .done(let said):
                    Section { Label(said, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                case .queued:
                    Section { Label("Saved on the phone. It's filed when your PC is reachable.", systemImage: "tray.and.arrow.down.fill").foregroundStyle(.orange) }
                case .failed(let why):
                    Section { Text(why).foregroundStyle(.red) }
                default:
                    EmptyView()
                }
            }
            .navigationTitle("Agentic OS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: close) }
                ToolbarItem(placement: .confirmationAction) {
                    if model.stage == .sending {
                        HStack(spacing: 6) { ProgressView(); Text("Filing").foregroundStyle(.secondary) }
                    } else if isFinished {
                        Button("Done", action: close).bold()
                    } else {
                        Button("Share") {
                            Task {
                                await model.send()
                                if isFinished {
                                    try? await Task.sleep(nanoseconds: 1_600_000_000)
                                    close()
                                }
                            }
                        }
                        .bold()
                        .disabled(!model.canSend)
                    }
                }
            }
            .onAppear { focused = true }
        }
    }

    private var isFinished: Bool {
        switch model.stage {
        case .done, .queued: return true
        default: return false
        }
    }
}
