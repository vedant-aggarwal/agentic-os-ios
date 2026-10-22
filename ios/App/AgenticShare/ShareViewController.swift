import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Share to Agentic OS from any app: text or a link becomes an inbox task, or an idea in the Content ideas list.
/// It posts to the PC (/api/v1/capture) with the token the app saved in the shared keychain.
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
    enum Kind: String { case task, content }
    enum Stage: Equatable { case editing, sending, done, failed(String) }

    @Published var text = ""
    @Published var link = ""
    @Published var kind: Kind = .task
    @Published var stage: Stage = .editing

    func load(_ items: [NSExtensionItem]) async {
        for item in items {
            if text.isEmpty, let t = item.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { text = t }
            for p in item.attachments ?? [] {
                if link.isEmpty, p.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !u.isFileURL {
                    link = u.absoluteString
                } else if text.isEmpty, p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let raw = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) {
                    text = (raw as? String) ?? (raw as? Data).flatMap { String(data: $0, encoding: .utf8) } ?? ""
                }
            }
        }
        // A shared link often arrives as text too.
        if text == link { text = "" }
    }

    var canSend: Bool { !(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && link.isEmpty) && stage != .sending }

    func send() async {
        guard Shared.token != nil else { stage = .failed("Open Agentic OS and sign in once, then share again."); return }
        stage = .sending
        let (code, _) = await Shared.send("/capture", body: ["kind": kind.rawValue, "text": text, "url": link])
        switch code {
        case 200, 201: stage = .done
        case 0: stage = .failed("Couldn't reach your PC. Is it on?")
        case 401: stage = .failed("Signed out. Open Agentic OS and sign in again.")
        default: stage = .failed("Your PC didn't take it (\(code)). Try again.")
        }
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel
    let close: () -> Void
    @FocusState var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Add as", selection: $model.kind) {
                        Text("Task").tag(ShareModel.Kind.task)
                        Text("Content idea").tag(ShareModel.Kind.content)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section(model.kind == .task ? "Goes to your inbox" : "Goes to Content ideas") {
                    TextField("What is it?", text: $model.text, axis: .vertical)
                        .lineLimit(2...8)
                        .focused($focused)
                    if !model.link.isEmpty {
                        Label(model.link, systemImage: "link").font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                if case .failed(let why) = model.stage {
                    Section { Text(why).foregroundStyle(.red) }
                }
                if model.stage == .done {
                    Section {
                        Label("Added", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("Agentic OS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: close) }
                ToolbarItem(placement: .confirmationAction) {
                    if model.stage == .sending {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task {
                                await model.send()
                                if model.stage == .done {
                                    try? await Task.sleep(nanoseconds: 700_000_000)
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
}
