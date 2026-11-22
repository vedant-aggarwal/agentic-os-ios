import Combine
import SwiftUI
import UIKit

// MARK: Look

enum Kb {
    static func dyn(_ light: UIColor, _ dark: UIColor) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
    static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> UIColor { UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1) }
    static let bg = dyn(rgb(210, 213, 219), rgb(28, 28, 30))
    static let key = dyn(.white, rgb(80, 80, 84))
    static let key2 = dyn(rgb(172, 177, 187), rgb(52, 52, 55))
    static let card = dyn(.white, rgb(44, 44, 46))
    static let ink = dyn(rgb(22, 24, 30), rgb(244, 245, 248))
    static let soft = dyn(rgb(98, 102, 112), rgb(160, 162, 170))
    static let accent = Color(UIColor(red: 0x76 / 255, green: 0x6B / 255, blue: 0xE6 / 255, alpha: 1))
    static let rec = Color(UIColor.systemRed)
}

struct KeyCap: ViewModifier {
    var fill: Color = Kb.key
    func body(content: Content) -> some View {
        content
            .foregroundStyle(Kb.ink)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(fill)
                .shadow(color: .black.opacity(0.28), radius: 0, x: 0, y: 1))
    }
}

extension View {
    func keyCap(_ fill: Color = Kb.key) -> some View { modifier(KeyCap(fill: fill)) }
}

// MARK: Root

struct KeyboardRoot: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                switch model.screen {
                case .home: HomeScreen(model: model)
                case .rewrite: RewriteScreen(model: model)
                case .reply: ReplyScreen(model: model)
                case .recent: RecentScreen(model: model)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let flash = model.flash {
                Label(flash, systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(Capsule().fill(Color.black.opacity(0.78)))
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .background(Kb.bg)
        .animation(.easeOut(duration: 0.18), value: model.flash)
    }
}

// MARK: Home: big mic, Rewrite, Reply, minimal keys

struct HomeScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                ToolChip(title: "Rewrite", icon: "wand.and.stars") { model.openRewrite() }
                ToolChip(title: "Reply", icon: "bubble.left.and.bubble.right") { model.openReply() }
                ToolChip(title: "Recent", icon: "clock.arrow.circlepath") { model.openRecent() }
                Spacer(minLength: 0)
                Button { model.typing = model.typing == .document ? nil : .document } label: {
                    Text(model.typing == .document ? "Mic" : "ABC").font(.subheadline.weight(.semibold))
                        .frame(width: 52, height: 38).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
            if model.typing == .document {
                MiniKeys(model: model)
            } else {
                if let last = model.savedChat {
                    Button { model.continueLast() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "bubble.left.and.text.bubble.right").font(.system(size: 13, weight: .semibold))
                            Text(last == "reply" ? "Continue your reply chat" : "Continue your rewrite chat").font(.footnote.weight(.semibold))
                            Image(systemName: "chevron.right").font(.caption2.weight(.bold))
                        }
                        .foregroundStyle(Kb.accent)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(Capsule().fill(Kb.card))
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
                MicPanel(model: model)
                Spacer(minLength: 0)
                if !model.fullAccess {
                    Text(KeyboardModel.needAccess)
                        .font(.caption2).foregroundStyle(Kb.soft).multilineTextAlignment(.center)
                }
                BottomKeys(model: model)
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

struct ToolChip: View {
    let title: String
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(height: 38)
                .keyCap()
        }
        .buttonStyle(.plain)
    }
}

struct MicPanel: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            Color.clear.frame(width: 36, height: 36)
            Button { model.mic() } label: { orb }
                .buttonStyle(.plain)
            Group {
                if showCancel {
                    Button { model.cancelDictation() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .bold))
                            .frame(width: 36, height: 36).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                } else {
                    Color.clear
                }
            }
            .frame(width: 36, height: 36)
        }
        .overlay(alignment: .bottom) {
            status.offset(y: 26)
        }
        .padding(.bottom, 22)
    }

    private var showCancel: Bool {
        switch model.dictation {
        case .opening, .starting, .recording: return true
        default: return false
        }
    }

    private var recording: Bool {
        if case .recording = model.dictation { return true }
        return false
    }

    private var orb: some View {
        ZStack {
            Circle().fill(recording ? Kb.rec : Kb.accent)
                .shadow(color: (recording ? Kb.rec : Kb.accent).opacity(0.45), radius: 10)
            switch model.dictation {
            case .recording:
                RoundedRectangle(cornerRadius: 5).fill(.white).frame(width: 24, height: 24)
            case .opening, .starting, .transcribing:
                ProgressView().tint(.white).scaleEffect(1.3)
            default:
                Image(systemName: "mic.fill").font(.system(size: 34, weight: .semibold)).foregroundStyle(.white)
            }
        }
        .frame(width: 92, height: 92)
    }

    /// The last words heard so far (the start falls off the left).
    private var live: some View {
        Text(model.liveText)
            .font(.footnote).foregroundStyle(Kb.ink)
            .lineLimit(2).truncationMode(.head).multilineTextAlignment(.center)
            .frame(maxWidth: 320)
    }

    @ViewBuilder private var status: some View {
        switch model.dictation {
        case .idle:
            Text("Tap to talk").font(.footnote).foregroundStyle(Kb.soft)
        case .opening:
            Text("Opening Agentic OS… then swipe back").font(.footnote).foregroundStyle(Kb.soft)
        case .starting:
            Text("Starting…").font(.footnote).foregroundStyle(Kb.soft)
        case .recording(let since):
            if model.liveText.isEmpty {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    let s = max(0, Int(ctx.date.timeIntervalSince1970 - since))
                    Text(String(format: "Recording %d:%02d  ·  tap to finish", s / 60, s % 60))
                        .font(.footnote.monospacedDigit()).foregroundStyle(Kb.rec)
                }
            } else {
                live
            }
        case .transcribing:
            if model.liveText.isEmpty { Text("Writing it out…").font(.footnote).foregroundStyle(Kb.soft) } else { live }
        case .failed(let why):
            Text(why).font(.caption).foregroundStyle(Kb.rec).lineLimit(2).multilineTextAlignment(.center)
                .frame(maxWidth: 300)
        }
    }
}

struct BottomKeys: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        HStack(spacing: 6) {
            if model.showsGlobe {
                Button { model.nextKeyboard() } label: {
                    Image(systemName: "globe").font(.system(size: 18)).frame(width: 46, height: 44).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
            Button { model.insert(" ") } label: {
                Text("space").font(.system(size: 16)).frame(maxWidth: .infinity).frame(height: 44).keyCap()
            }
            .buttonStyle(.plain)
            RepeatKey { model.backspace() } label: {
                Image(systemName: "delete.left").font(.system(size: 18)).frame(width: 52, height: 44).keyCap(Kb.key2)
            }
            Button { model.insert("\n") } label: {
                Image(systemName: "return").font(.system(size: 18)).frame(width: 64, height: 44).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
        }
    }
}

/// A key that repeats while held (backspace).
struct RepeatKey<Label: View>: View {
    let action: () -> Void
    @ViewBuilder let label: () -> Label
    @State private var timer: Timer?
    @State private var down = false

    var body: some View {
        label()
            .opacity(down ? 0.6 : 1)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !down else { return }
                    down = true
                    action()
                    timer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { _ in
                        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in action() }
                    }
                }
                .onEnded { _ in
                    down = false
                    timer?.invalidate()
                    timer = nil
                })
    }
}

// MARK: Shared pieces for Rewrite and Reply

struct Header: View {
    @ObservedObject var model: KeyboardModel
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Button { model.back() } label: {
                Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 32).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            Text(title).font(.headline).foregroundStyle(Kb.ink)
            Spacer()
            if model.busy { ProgressView().scaleEffect(0.8) }
            if !model.messages.isEmpty && model.screen != .recent {
                Button { model.newChat() } label: {
                    Image(systemName: "square.and.pencil").font(.system(size: 15, weight: .semibold))
                        .frame(width: 38, height: 32).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("New chat")
            }
            Button { model.home() } label: {
                Image(systemName: "mic.fill").font(.system(size: 15, weight: .semibold))
                    .frame(width: 38, height: 32).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            if model.showsGlobe {
                Button { model.nextKeyboard() } label: {
                    Image(systemName: "globe").font(.system(size: 15)).frame(width: 38, height: 32).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// A one-line field the keyboard fills itself (a keyboard can't type into its own text fields):
/// tap the letters button for our own keys, or the mic to dictate into it.
struct FieldRow: View {
    @ObservedObject var model: KeyboardModel
    let field: KeyboardModel.Field
    let placeholder: String
    var send: (() -> Void)?

    private var text: String { field == .refine ? model.refine : model.custom }
    private var active: Bool { model.typing == field }

    var body: some View {
        HStack(spacing: 6) {
            Button { model.typing = active ? nil : field } label: {
                HStack(spacing: 0) {
                    Text(text.isEmpty ? placeholder : text)
                        .font(.subheadline)
                        .foregroundStyle(text.isEmpty ? Kb.soft : Kb.ink)
                        .lineLimit(1)
                        .truncationMode(.head)
                    if active { Rectangle().fill(Kb.accent).frame(width: 2, height: 18) }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10)
                .frame(height: 38)
                .background(RoundedRectangle(cornerRadius: 10).fill(Kb.card))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(active ? Kb.accent : .clear, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            Button { model.mic(target: field) } label: {
                Image(systemName: micIcon).font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(micBusy ? Kb.rec : Kb.ink)
                    .frame(width: 38, height: 38).keyCap(Kb.key2)
            }
            .buttonStyle(.plain)
            if let send {
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(text.isEmpty || model.busy ? Kb.soft : Kb.accent))
                }
                .buttonStyle(.plain)
                .disabled(text.isEmpty || model.busy)
            }
        }
    }

    private var micBusy: Bool {
        switch model.dictation {
        case .recording, .starting, .opening, .transcribing: return true
        default: return false
        }
    }
    private var micIcon: String {
        if case .recording = model.dictation { return "stop.fill" }
        return "mic.fill"
    }
}

/// Our own letter keys, typing into a FieldRow.
struct MiniKeys: View {
    @ObservedObject var model: KeyboardModel
    @State private var shift = false
    @State private var numbers = false
    private let letters = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    private let digits = ["1234567890", "-/:;()₹&@\"", ".,?!'"]

    var body: some View {
        let rows = numbers ? digits : letters
        VStack(spacing: 6) {
            row(rows[0])
            row(rows[1]).padding(.horizontal, numbers ? 0 : 14)
            HStack(spacing: 5) {
                if numbers {
                    Color.clear.frame(width: 40, height: 40)
                } else {
                    Button { shift.toggle() } label: {
                        Image(systemName: shift ? "shift.fill" : "shift").frame(width: 40, height: 40).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                }
                row(rows[2])
                RepeatKey { model.backspace() } label: {
                    Image(systemName: "delete.left").frame(width: 40, height: 40).keyCap(Kb.key2)
                }
            }
            HStack(spacing: 5) {
                Button { numbers.toggle() } label: {
                    Text(numbers ? "ABC" : "123").font(.system(size: 15)).frame(width: 46, height: 40).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
                if model.showsGlobe && model.typing == .document {
                    Button { model.nextKeyboard() } label: {
                        Image(systemName: "globe").frame(width: 40, height: 40).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                }
                Button { model.insert(" ") } label: {
                    Text("space").font(.system(size: 15)).frame(maxWidth: .infinity).frame(height: 40).keyCap()
                }
                .buttonStyle(.plain)
                if model.typing == .document {
                    Button { model.insert("\n") } label: {
                        Image(systemName: "return").frame(width: 64, height: 40).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                } else {
                    Button { model.typing = nil } label: {
                        Text("Done").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 64, height: 40)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Kb.accent))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func row(_ letters: String) -> some View {
        HStack(spacing: 5) {
            ForEach(Array(letters), id: \.self) { c in key(String(c)) }
        }
    }

    private func key(_ s: String) -> some View {
        Button {
            model.insert(shift ? s.uppercased() : s)
            shift = false
        } label: {
            Text(shift ? s.uppercased() : s).font(.system(size: 20))
                .frame(maxWidth: .infinity).frame(height: 40).keyCap()
        }
        .buttonStyle(.plain)
    }
}

struct Typing: View {
    @ObservedObject var model: KeyboardModel
    let field: KeyboardModel.Field

    var body: some View {
        VStack(spacing: 8) {
            FieldRow(model: model, field: field,
                     placeholder: field == .refine ? "Tell it what to change…" : "Say what you want",
                     send: field == .refine ? { model.sendRefine() } : nil)
            MiniKeys(model: model)
        }
    }
}

// MARK: Rewrite

struct RewriteScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            Header(model: model, title: "Rewrite")
            if !model.messages.isEmpty {
                ChatView(model: model)
            } else if let field = model.typing {
                Typing(model: model, field: field)
            } else {
                setup
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 6) {
                Text(model.source.isEmpty ? "Nothing to rewrite yet. Type in the field, or copy text and tap Clipboard." : model.source)
                    .font(.subheadline)
                    .foregroundStyle(model.source.isEmpty ? Kb.soft : Kb.ink)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { model.useClipboardText() } label: {
                    Label("Clipboard", systemImage: "doc.on.clipboard").font(.caption.weight(.semibold))
                        .padding(.horizontal, 8).frame(height: 30).keyCap(Kb.key2)
                }
                .buttonStyle(.plain)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 12).fill(Kb.card))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(model.rewriteModes) { m in
                        Button { model.rewrite(m.key) } label: {
                            Text(m.label).font(.subheadline.weight(.medium)).padding(.horizontal, 12).frame(height: 36).keyCap()
                        }
                        .buttonStyle(.plain)
                        .disabled(model.busy)
                    }
                }
                .padding(.vertical, 2)
            }
            FieldRow(model: model, field: .custom, placeholder: "Or say how to change it") { model.rewrite("custom") }
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            } else if model.busy {
                HStack { ProgressView(); Text("Rewriting…").font(.footnote).foregroundStyle(Kb.soft) }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: Reply

struct ReplyScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            Header(model: model, title: "Reply")
            if model.modePicker {
                modes
            } else if !model.messages.isEmpty {
                ChatView(model: model)
            } else if let field = model.typing {
                Typing(model: model, field: field)
            } else {
                setup
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                source("Paste screenshot", "doc.on.clipboard") { model.pasteScreenshot() }
                source("Latest screenshot", "photo") { model.latestPhoto() }
                source("Chat text", "text.quote") { model.useClipboardText() }
            }
            if !model.images.isEmpty || !model.source.isEmpty {
                HStack(spacing: 8) {
                    ForEach(model.images) { img in
                        Image(uiImage: img.thumb).resizable().scaledToFill()
                            .frame(width: 40, height: 52).clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(alignment: .topTrailing) {
                                Button { model.removeImage(img.id) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 14)).foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .buttonStyle(.plain)
                                .offset(x: 5, y: -5)
                            }
                    }
                    if !model.source.isEmpty {
                        Label(model.source, systemImage: "text.quote").font(.caption).foregroundStyle(Kb.soft).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                }
            }
            HStack(spacing: 6) {
                Button { model.modePicker = true } label: {
                    HStack(spacing: 6) {
                        Text(model.styleLabel).font(.subheadline.weight(.semibold))
                        Image(systemName: "chevron.down").font(.caption.weight(.bold))
                    }
                    .padding(.horizontal, 12).frame(height: 38).keyCap()
                }
                .buttonStyle(.plain)
                Spacer()
                Button { model.draftReply() } label: {
                    HStack(spacing: 6) {
                        if model.busy { ProgressView().tint(.white) }
                        Text(model.busy ? "Drafting…" : "Draft").font(.subheadline.weight(.bold))
                    }
                    .foregroundStyle(.white).padding(.horizontal, 18).frame(height: 38)
                    .background(RoundedRectangle(cornerRadius: 9).fill(Kb.accent))
                }
                .buttonStyle(.plain)
                .disabled(model.busy)
            }
            FieldRow(model: model, field: .custom, placeholder: model.style == "custom" ? "Say what you want (required)" : "Custom request (optional)")
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private func source(_ title: String, _ icon: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 17))
                Text(title).font(.caption2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity).frame(height: 50).keyCap()
        }
        .buttonStyle(.plain)
    }

    private var modes: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                ForEach(model.replyModes + [KbMode(key: "custom", label: "Custom")]) { m in
                    Button { model.pickStyle(m.key) } label: {
                        Text(m.label).font(.subheadline.weight(.semibold))
                            .foregroundStyle(m.key == model.style ? .white : Kb.ink)
                            .frame(maxWidth: .infinity).frame(height: 42)
                            .background(RoundedRectangle(cornerRadius: 9).fill(m.key == model.style ? Kb.accent : Kb.key)
                                .shadow(color: .black.opacity(0.25), radius: 0, x: 0, y: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

// MARK: Recent: the last dictations from Voices, tap one to insert it

struct RecentScreen: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 8) {
            Header(model: model, title: "Recent dictations")
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
            }
            ScrollView {
                VStack(spacing: 6) {
                    if model.recent.isEmpty && model.problem == nil {
                        ProgressView().padding(.top, 24)
                    }
                    ForEach(model.recent) { r in
                        Button { model.insertRecent(r.text) } label: {
                            Text(r.text).font(.subheadline).foregroundStyle(Kb.ink).lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Kb.card))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
    }
}

// MARK: Chat: Rewrite and Reply after the first answer. Every request and every version stays on screen; keep asking
// for changes (type, dictate, or a quick chip) and the AI revises in the same thread.

struct ChatView: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 6) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        context
                        ForEach(model.messages) { m in
                            if m.mine { UserBubble(model: model, m: m) } else { AiBubble(model: model, m: m, latest: m.id == model.lastAiId) }
                        }
                        if model.busy {
                            HStack(spacing: 8) {
                                ProgressView().scaleEffect(0.8)
                                Text("Writing…").font(.footnote).foregroundStyle(Kb.soft)
                            }
                            .padding(.leading, 4)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 2)
                }
                .onAppear { proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: model.messages.count) { _, _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
                .onChange(of: model.busy) { _, _ in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("end", anchor: .bottom) } }
                .onChange(of: model.typing) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
            }
            if let problem = model.problem {
                HStack(spacing: 6) {
                    Text(problem).font(.caption).foregroundStyle(Kb.rec).lineLimit(2)
                    Spacer(minLength: 0)
                    Button { model.retry() } label: {
                        Label("Retry", systemImage: "arrow.clockwise").font(.caption.weight(.semibold))
                            .padding(.horizontal, 10).frame(height: 28).keyCap(Kb.key2)
                    }
                    .buttonStyle(.plain)
                }
            }
            if model.typing == nil { chips }
            FieldRow(model: model, field: .refine, placeholder: model.screen == .reply ? "Ask for another, or say what to change…" : "Say what to change…") { model.sendRefine() }
            if model.typing == .refine { MiniKeys(model: model) }
        }
    }

    /// What the chat started from, one line.
    @ViewBuilder private var context: some View {
        if !model.images.isEmpty || !model.source.isEmpty {
            HStack(spacing: 6) {
                ForEach(model.images) { img in
                    Image(uiImage: img.thumb).resizable().scaledToFill()
                        .frame(width: 22, height: 28).clipShape(RoundedRectangle(cornerRadius: 4))
                }
                if !model.source.isEmpty {
                    Text(model.source).font(.caption).foregroundStyle(Kb.soft).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 4)
        }
    }

    private var followUps: [Chip] {
        model.screen == .reply
            ? [Chip(label: "Another one", ask: "Give me different options."), Chip(label: "Shorter", ask: "Make them shorter."), Chip(label: "Funnier", ask: "Make them funnier."),
               Chip(label: "Flirtier", ask: "Make them flirtier."), Chip(label: "Politer", ask: "Make them more polite."), Chip(label: "Savage", ask: "Make them more savage."),
               Chip(label: "Hinglish", ask: "Write them in Hinglish."), Chip(label: "English", ask: "Write them in English."), Chip(label: "No emojis", ask: "No emojis.")]
            : [Chip(label: "Shorter", ask: "Make it shorter."), Chip(label: "Longer", ask: "Make it a bit longer."), Chip(label: "Casual", ask: "Make it more casual."),
               Chip(label: "Formal", ask: "Make it more formal."), Chip(label: "Funnier", ask: "Make it funnier."), Chip(label: "Warmer", ask: "Make it warmer."),
               Chip(label: "Fix grammar", ask: "Just fix the grammar, keep my words."), Chip(label: "Emojis", ask: "Add a few fitting emojis."),
               Chip(label: "Hinglish", ask: "Write it in Hinglish."), Chip(label: "English", ask: "Write it in English.")]
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(followUps) { chip in
                    Button { model.send(chip.ask) } label: {
                        Text(chip.label).font(.footnote.weight(.semibold)).padding(.horizontal, 11).frame(height: 30).keyCap()
                    }
                    .buttonStyle(.plain)
                    .disabled(model.busy)
                }
            }
            .padding(.vertical, 1)
        }
    }
}

/// A quick follow-up: the chip's label and the message it sends.
struct Chip: Identifiable {
    let label: String
    let ask: String
    var id: String { label }
}

struct UserBubble: View {
    @ObservedObject var model: KeyboardModel
    let m: KbMessage

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            VStack(alignment: .trailing, spacing: 3) {
                Text(m.text).font(.subheadline).foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(Kb.accent.opacity(m.failed ? 0.45 : 1)))
                if m.failed {
                    Text("Not sent").font(.caption2).foregroundStyle(Kb.rec)
                }
            }
        }
    }
}

struct AiBubble: View {
    @ObservedObject var model: KeyboardModel
    let m: KbMessage
    let latest: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if !m.label.isEmpty {
                Text(m.label).font(.caption.weight(.semibold)).foregroundStyle(Kb.accent).lineLimit(1)
            }
            Text(m.text).font(.system(size: 15)).foregroundStyle(Kb.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                small("Insert", "text.insert", primary: true) { model.insertText(m.text) }
                small("Replace", "arrow.left.arrow.right") { model.replaceWith(m.text) }
                small("Copy", "doc.on.doc") { model.copyText(m.text) }
                Spacer(minLength: 0)
            }
            if !m.note.isEmpty {
                Text(m.note).font(.caption).foregroundStyle(Kb.soft)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Kb.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(latest ? Kb.accent.opacity(0.7) : .clear, lineWidth: 1.2))
    }

    private func small(_ title: String, _ icon: String, primary: Bool = false, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(primary ? .white : Kb.ink)
                .padding(.horizontal, 10).frame(height: 28)
                .background(RoundedRectangle(cornerRadius: 8).fill(primary ? Kb.accent : Kb.key2))
        }
        .buttonStyle(.plain)
    }
}
