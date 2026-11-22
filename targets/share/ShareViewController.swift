import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Open on PC" from the share sheet. It starts by itself:
///   a web link          -> opens in the PC's browser (POST /pc/open)
///   a file/photo/video  -> sent to Downloads\From Phone in 4 MB pieces (/pc/files/start + /put), then opened with
///                          its usual app on the PC (/pc/files/open)
///   plain text          -> put on the PC clipboard (POST /pc/clipboard)
/// It shows each item with progress and closes itself shortly after everything is done.
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        let host = UIHostingController(rootView: ShareView(model: model, close: { [weak self] in self?.finish() }))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        Task { @MainActor in
            await model.run(providers)
            try? await Task.sleep(nanoseconds: model.failed ? 4_000_000_000 : 1_300_000_000)
            finish()
        }
    }

    private func finish() { extensionContext?.completeRequest(returningItems: nil) }
}

struct ShareItem: Identifiable {
    enum Kind { case link, file, text }
    let id = UUID()
    var kind: Kind
    var name: String
    var sent: Int64 = 0
    var size: Int64 = 0
    var state: String = "Waiting"
    var done = false
    var failed = false
}

@MainActor
final class ShareModel: ObservableObject {
    @Published var items: [ShareItem] = []
    @Published var headline = "Sending to your PC…"
    var failed: Bool { items.contains { $0.failed } }
    private let piece = 4 * 1024 * 1024

    func run(_ providers: [NSItemProvider]) async {
        guard Shared.token != nil else {
            headline = "Open Agentic OS once and sign in, then share again."
            items = [ShareItem(kind: .text, name: "Not signed in", state: "", failed: true)]
            return
        }
        // a link and its page text often come together: files first, then one link, then text only if nothing else
        var files: [NSItemProvider] = [], links: [NSItemProvider] = [], texts: [NSItemProvider] = []
        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) || isFileish(p) { files.append(p) }
            else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) { links.append(p) }
            else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) { texts.append(p) }
        }
        for p in files { await sendFile(p) }
        if let p = links.first { await openLink(p) }
        if files.isEmpty && links.isEmpty, let p = texts.first { await sendText(p) }
        if items.isEmpty { headline = "Nothing here the PC can open."; return }
        headline = failed ? "Some of it didn't reach the PC." : "Opened on your PC"
    }

    private func isFileish(_ p: NSItemProvider) -> Bool {
        p.registeredTypeIdentifiers.contains { id in
            guard let t = UTType(id) else { return false }
            return (t.conforms(to: .data) || t.conforms(to: .image) || t.conforms(to: .movie) || t.conforms(to: .audio) || t.conforms(to: .pdf))
                && !t.conforms(to: .url) && !t.conforms(to: .plainText)
        }
    }

    private func add(_ item: ShareItem) -> Int { items.append(item); return items.count - 1 }

    // MARK: links and text
    private func openLink(_ p: NSItemProvider) async {
        let url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
        guard let url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return }
        let i = add(ShareItem(kind: .link, name: url.host ?? url.absoluteString, state: "Opening…"))
        let (status, data) = await Shared.send("/pc/open", body: ["url": url.absoluteString])
        if status == 200 { items[i].state = "Opened in the PC's browser"; items[i].done = true }
        else { fail(i, data, status) }
    }

    private func sendText(_ p: NSItemProvider) async {
        let text = (try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier)) as? String ?? ""
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let url = URL(string: trimmed), let s = url.scheme?.lowercased(), (s == "http" || s == "https"), !trimmed.contains(" ") {
            let i = add(ShareItem(kind: .link, name: url.host ?? trimmed, state: "Opening…"))
            let (status, data) = await Shared.send("/pc/open", body: ["url": trimmed])
            if status == 200 { items[i].state = "Opened in the PC's browser"; items[i].done = true } else { fail(i, data, status) }
            return
        }
        let i = add(ShareItem(kind: .text, name: String(trimmed.prefix(60)), state: "Copying…"))
        let (status, data) = await Shared.send("/pc/clipboard", body: ["text": trimmed])
        if status == 200 { items[i].state = "On the PC clipboard. Paste it there."; items[i].done = true } else { fail(i, data, status) }
    }

    // MARK: files
    private func sendFile(_ p: NSItemProvider) async {
        let type = p.registeredTypeIdentifiers.first { id in
            guard let t = UTType(id) else { return false }
            return t.conforms(to: .data) || t.conforms(to: .content) || t.conforms(to: .fileURL)
        } ?? UTType.data.identifier
        let i = add(ShareItem(kind: .file, name: p.suggestedName ?? "File", state: "Reading…"))
        // a copy the extension may read; iOS deletes the original's temporary file when the handler returns
        let local: URL? = await withCheckedContinuation { cont in
            _ = p.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                guard let url else { cont.resume(returning: nil); return }
                let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                do { try FileManager.default.copyItem(at: url, to: dest); cont.resume(returning: dest) } catch { cont.resume(returning: nil) }
            }
        }
        guard let local else { items[i].failed = true; items[i].state = "Couldn't read this file."; return }
        defer { try? FileManager.default.removeItem(at: local) }
        let name = Self.name(for: local, suggested: p.suggestedName, type: type)
        let size = (try? FileManager.default.attributesOfItem(atPath: local.path)[.size] as? NSNumber)?.int64Value ?? 0
        items[i].name = name; items[i].size = size; items[i].state = "Sending…"

        let (st, startData) = await Shared.send("/pc/files/start", body: ["name": name, "size": size])
        guard st == 200, let start = Shared.json(startData) else { fail(i, startData, st); return }
        var finalName = (start["name"] as? String) ?? name
        if (start["done"] as? Bool) != true {
            guard let id = start["id"] as? String, let h = try? FileHandle(forReadingFrom: local) else { fail(i, startData, st); return }
            defer { try? h.close() }
            var have = Int64((start["have"] as? NSNumber)?.int64Value ?? 0)
            var tries = 0
            while have < size {
                try? h.seek(toOffset: UInt64(have))
                let chunk = (try? h.read(upToCount: piece)) ?? Data()
                if chunk.isEmpty { break }
                let (s, d) = await Shared.request("/pc/files/put/\(id)?at=\(have)", method: "PUT", data: chunk, type: "application/octet-stream", timeout: 120)
                let out = Shared.json(d)
                if s == 200 || s == 409 {
                    tries = 0
                    if (out?["done"] as? Bool) == true { finalName = (out?["name"] as? String) ?? finalName; have = size; break }
                    have = (out?["have"] as? NSNumber)?.int64Value ?? have
                    items[i].sent = have
                } else {
                    tries += 1
                    if tries > 5 || s == 404 { fail(i, d, s); return }
                    try? await Task.sleep(nanoseconds: UInt64(tries) * 600_000_000)
                }
            }
        }
        items[i].sent = size
        items[i].name = finalName
        items[i].state = "Opening on the PC…"
        let (os, od) = await Shared.send("/pc/files/open", body: ["name": finalName])
        if os == 200 { items[i].state = "Opened on the PC · in Downloads\\From Phone"; items[i].done = true }
        else { fail(i, od, os) }
    }

    private static func name(for url: URL, suggested: String?, type: String) -> String {
        var n = url.lastPathComponent
        if let range = n.range(of: #"^[0-9A-F-]{36}-"#, options: .regularExpression) { n.removeSubrange(range) }
        if let s = suggested, !s.isEmpty {
            n = s.contains(".") ? s : s + "." + (url.pathExtension.isEmpty ? (UTType(type)?.preferredFilenameExtension ?? "bin") : url.pathExtension)
        }
        return n.replacingOccurrences(of: "/", with: "-")
    }

    private func fail(_ i: Int, _ data: Data?, _ status: Int) {
        items[i].failed = true
        items[i].state = (Shared.json(data)?["error"] as? String) ?? (status == 0 ? "Couldn't reach your PC." : "The PC said HTTP \(status).")
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel
    let close: () -> Void

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: "laptopcomputer.and.arrow.down").font(.system(size: 18, weight: .semibold))
                    Text(model.headline).font(.system(size: 17, weight: .semibold))
                    Spacer()
                    Button(action: close) {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).frame(width: 30, height: 30)
                            .background(Circle().fill(Color.white.opacity(0.12)))
                    }.accessibilityLabel("Close")
                }
                ForEach(model.items) { item in
                    HStack(spacing: 12) {
                        Image(systemName: icon(item)).font(.system(size: 20)).foregroundStyle(color(item)).frame(width: 26)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.name).font(.system(size: 15, weight: .medium)).lineLimit(1)
                            if item.kind == .file && !item.done && !item.failed && item.size > 0 {
                                ProgressView(value: Double(item.sent), total: Double(max(item.size, 1))).tint(Color(red: 0.46, green: 0.42, blue: 0.9))
                            }
                            Text(item.kind == .file && !item.done && !item.failed && item.size > 0
                                 ? "\(bytes(item.sent)) of \(bytes(item.size))" : item.state)
                                .font(.system(size: 12, weight: .medium)).foregroundStyle(item.failed ? Color.red : Color.secondary).lineLimit(2)
                        }
                    }
                }
                if model.items.isEmpty { ProgressView().frame(maxWidth: .infinity) }
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(.regularMaterial))
            .padding(.horizontal, 12)
            .padding(.bottom, 24)
        }
        .preferredColorScheme(.dark)
    }

    private func icon(_ i: ShareItem) -> String {
        if i.failed { return "exclamationmark.circle.fill" }
        if i.done { return "checkmark.circle.fill" }
        switch i.kind { case .link: return "safari"; case .text: return "doc.on.clipboard"; case .file: return "arrow.up.circle" }
    }
    private func color(_ i: ShareItem) -> Color { i.failed ? .red : i.done ? .green : .secondary }
    private func bytes(_ b: Int64) -> String { ByteCountFormatter.string(fromByteCount: b, countStyle: .file) }
}
